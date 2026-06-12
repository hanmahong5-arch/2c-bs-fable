#!/usr/bin/env bun
/**
 * radio-pipeline.ts — 「亲声·连载」每晚管线 (跑在 R5, systemd timer 06:00 + 2h 幂等补跑)。
 *
 * 逐订户 (active+trial): 个性化连载故事 (LLM) → 安全自检 (不过审重试 3 次否则当晚缺更)
 * → 克隆音色合成 (localhost 直连零计费) → Blob → Redis ready → 更新连载状态。
 * 幂等: 当晚 story 已 ready 即跳过, kill 中途重跑安全。
 *
 * 末尾: 音频 14 天滚动清理 + Redis 全量备份→Blob (留 14 份) + ntfy 摘要 (失败高优先级)。
 *
 * env (R5 /root/.fable-radio.env): KV_REST_API_URL/TOKEN, BLOB_READ_WRITE_TOKEN,
 *   NEWAPI_TRIAL_TOKEN, NTFY_TOPIC; COSY_URL 默认 localhost:8123 (R5 本机)。
 */

import { del, list, put } from "@vercel/blob";
import {
  clearPendingNote,
  getStory,
  listActiveSubscribers,
  listStories,
  putStory,
  setPipelineSummary,
  setStoryAudio,
  updateSubscriber,
  dumpAll,
  type Subscriber,
} from "../src/lib/store";
import { putRadioAudio } from "../src/lib/audio-storage";
import { bjDaysSince, bjToday, parseSerialState, type SerialState } from "../src/lib/beijing";
import { notify } from "../src/lib/ntfy";
import { TOKEN, synthStory } from "./lib/story-gen";
import { TRIAL_NIGHTS, generateFor, type RadioStoryOut } from "../src/lib/radio-story";

const AUDIO_KEEP_DAYS = 14;
const BACKUP_KEEP = 14;

/** 音频 14 天滚动: 过期清 audioUrl + 删 Blob (文本永久保留)。 */
async function pruneAudio(sub: Subscriber): Promise<number> {
  const stories = await listStories(sub.id, 400);
  let pruned = 0;
  for (const s of stories) {
    if (!s.audioUrl || bjDaysSince(s.date) < AUDIO_KEEP_DAYS) continue;
    try {
      await del(s.audioUrl);
    } catch (e) {
      console.error(`[radio] prune blob failed ${sub.id}/${s.date}: ${(e as Error).message}`);
    }
    await setStoryAudio(sub.id, s.date, "");
    pruned++;
  }
  return pruned;
}

/** Redis 全量备份 → Blob backup/<date>.json, 只留最近 BACKUP_KEEP 份。 */
async function backup(date: string): Promise<void> {
  const dump = await dumpAll();
  await put(`backup/${date}.json`, JSON.stringify(dump), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
    allowOverwrite: true,
  });
  const page = await list({ prefix: "backup/" });
  const old = page.blobs
    .sort((a, b) => (a.pathname < b.pathname ? 1 : -1))
    .slice(BACKUP_KEEP);
  if (old.length) await del(old.map((b) => b.url));
}

async function main(): Promise<void> {
  if (!TOKEN) {
    console.error("[radio] NEWAPI_TRIAL_TOKEN missing");
    process.exit(1);
  }
  const date = bjToday();
  const subs = await listActiveSubscribers();
  let made = 0, skipped = 0, failed = 0, prunedTotal = 0;
  const failures: string[] = [];

  for (const sub of subs) {
    const tag = `${sub.childName || "?"}(${sub.id.slice(0, 6)})`;
    try {
      // 到期转场: active 过期 → expired (页面出温和续订提示, 停止生成)
      if (sub.status === "active" && sub.expiresAt && sub.expiresAt < date) {
        await updateSubscriber(sub.id, { status: "expired" });
        console.error(`[radio] ${tag} expired ${sub.expiresAt} → 停更`);
        skipped++;
        continue;
      }
      const serial = parseSerialState(sub.serialState);
      if (sub.status === "trial" && (serial.nights ?? 0) >= TRIAL_NIGHTS) {
        skipped++;
        continue; // 3 晚已讲完, 等付费墙
      }
      if (!sub.voiceId) {
        console.error(`[radio] ${tag} 无音色 (未录/已删) → 跳过`);
        skipped++;
        continue;
      }

      const existing = await getStory(sub.id, date);
      if (existing?.audioUrl) {
        skipped++;
        continue; // 幂等: 今晚已 ready
      }

      let story: RadioStoryOut;
      if (existing) {
        // 文本已有只缺音频 (上轮合成中断) → 直接补合成
        story = {
          title: existing.title,
          moral: existing.moral,
          paragraphs: JSON.parse(existing.paragraphs) as string[],
          recap: serial.recap ?? "",
        };
      } else {
        // D1 捎话 + D3 starred 反馈进 prompt (闭环传感器)
        const note = (sub.pendingNote ?? "").trim();
        const starredTitles = (await listStories(sub.id, 30))
          .filter((s) => s.starred === "1")
          .slice(0, 5)
          .map((s) => s.title);
        if (note) console.error(`[radio] ${tag} 捎话: ${note}`);
        if (starredTitles.length) console.error(`[radio] ${tag} 星标: ${starredTitles.join("、")}`);
        const gen = await generateFor(sub, date, note, starredTitles);
        if (!gen.ok) {
          failed++;
          failures.push(`${tag}: ${gen.reason}`);
          console.error(`[radio] ${tag} 当晚缺更: ${gen.reason}`);
          continue;
        }
        story = gen.story;
        // 文本先落库 (音频失败可由 retry timer 捞起)
        await putStory(sub.id, {
          date,
          title: story.title,
          paragraphs: JSON.stringify(story.paragraphs),
          moral: story.moral,
          audioUrl: "",
          starred: "",
          listened: "",
          note,
          createdAt: new Date().toISOString(),
        });
        // putStory 成功后才清 (失败时 note 留给 2h retry; 重复消费被「今晚已 ready」幂等闸挡住)
        if (note) await clearPendingNote(sub.id);
      }

      const mp3 = await synthStory(story, `custom:${sub.voiceId}`);
      const url = await putRadioAudio(sub.audioKey, date, mp3);
      await setStoryAudio(sub.id, date, url);

      // 连载状态推进 (仅新生成时; 补音频不重复计数)
      if (!existing) {
        const next: SerialState = {
          recap: story.recap,
          nights: (serial.nights ?? 0) + 1,
          upcoming: story.upcoming?.length ? story.upcoming : serial.upcoming,
        };
        await updateSubscriber(sub.id, { serialState: JSON.stringify(next) });
      }
      made++;
      console.error(`[radio] ${tag} ✓ ${story.title}`);

      prunedTotal += await pruneAudio(sub);
    } catch (e) {
      failed++;
      failures.push(`${tag}: ${(e as Error).message}`);
      console.error(`[radio] ${tag} FAIL: ${(e as Error).message}`);
    }
  }

  let backupOk = true;
  try {
    await backup(date);
  } catch (e) {
    backupOk = false;
    console.error(`[radio] backup FAIL: ${(e as Error).message}`);
  }

  // D2 业务回路传感器: 近 7 晚触达率 (分母=实际生成的晚数) + 订户结构 — Stage A 门槛从此可测
  let reachNum = 0;
  let reachDen = 0;
  const perSub: string[] = [];
  for (const sub of subs) {
    try {
      const recent = (await listStories(sub.id, 14)).filter((s) => bjDaysSince(s.date) < 7);
      const heard = recent.filter((s) => s.listened === "1").length;
      reachNum += heard;
      reachDen += recent.length;
      if (recent.length) perSub.push(`${sub.childName}(${sub.status}) ${heard}/${recent.length}`);
    } catch (e) {
      console.error(`[radio] reach stat FAIL ${sub.id}: ${(e as Error).message}`);
    }
  }
  const reachPct = reachDen ? Math.round((reachNum / reachDen) * 100) : 0;
  const paidCount = subs.filter((s) => s.status === "active").length;
  const trialCount = subs.filter((s) => s.status === "trial").length;
  const bizLine = `触达率(近7晚) ${reachNum}/${reachDen}=${reachPct}% · 付费 ${paidCount} · 试用 ${trialCount}`;
  const isMonday = new Date(`${date}T12:00:00Z`).getUTCDay() === 1;

  const summary = `订户 ${subs.length} · 生成 ${made} · 跳过 ${skipped} · 失败 ${failed} · 清理音频 ${prunedTotal} · 备份 ${backupOk ? "✓" : "✗"}`;
  try {
    await setPipelineSummary(date, {
      ranAt: new Date().toISOString(),
      made: String(made),
      skipped: String(skipped),
      failed: String(failed),
      reach: `${reachNum}/${reachDen}`,
      paid: String(paidCount),
      trial: String(trialCount),
      summary,
    });
  } catch (e) {
    console.error(`[radio] summary write FAIL: ${(e as Error).message}`);
  }
  const bodyLines = [summary, bizLine];
  if (isMonday && perSub.length) bodyLines.push(`周报 · 各家触达: ${perSub.join(" / ")}`);
  if (failures.length) bodyLines.push(failures.join("\n").slice(0, 800));
  await notify(
    failed > 0 || !backupOk ? "⚠️ 亲声电台管线有失败" : "🌙 亲声电台管线完成",
    bodyLines.join("\n"),
    failed > 0 || !backupOk ? "high" : "default",
  );
  console.error(`[radio] done: ${summary} · ${bizLine}`);
}

await main();
