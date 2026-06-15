import {
  bumpFunnel,
  claimInstantSlot,
  clearPendingNote,
  getStory,
  getSubscriberByToken,
  putStory,
  releaseInstantSlot,
  setStoryAudio,
  updateSubscriber,
  type Subscriber,
} from "@/lib/store";
import { putRadioAudio } from "@/lib/audio-storage";
import { bjToday, parseSerialState, type SerialState } from "@/lib/beijing";
import { notify } from "@/lib/ntfy";
import { generateFor } from "@/lib/radio-story";
import { TOKEN, synthStory } from "@/lib/story-gen";
import { fail, ok, readJson } from "@/lib/api";

/**
 * 即时首晚生成: trial 开通后不等次日管线, 当场写第一晚故事 (≈1-2 分钟)。
 * 架构 = 触发 + 客户端轮询 + 文本先落库:
 *   生成文本 → putStory(audioUrl:"") → 立即推进 serialState{recap,nights:1}
 *   → 合成音频 → setStoryAudio。
 * serialState 必须在 putStory 后立即写 (不学管线放音频之后) — 函数中途被截断时
 * 文本已在、计数已对, R5 的 2h 幂等补跑走 existing&&!audioUrl 分支补音频即可,
 * 超时从故障降级为延迟。
 */
export const maxDuration = 300;

/**
 * 空夜 (第一晚连文本都没写成): 计数 + 高优先级响铃。
 * 这是用户情绪最热点的失败, 绝不能静默 — owner 凭 contact 可手动关怀, 不必等次日管线兜底。
 */
async function reportFirstNightFail(sub: Subscriber, date: string, reason: string): Promise<void> {
  console.error(`[instant-first] ${sub.id} first-night EMPTY: ${reason}`);
  await bumpFunnel(date, "instant_fail").catch(() => {});
  const who = sub.childName || sub.id.slice(0, 6);
  const contact = sub.contact ? ` · 可联系 ${sub.contact}` : "";
  await notify(
    "⚠️ 即时首晚生成失败",
    `${who} 开通后第一晚没生成出来${contact}。原因: ${reason.slice(0, 120)}。次日管线会兜底, 但这是情绪最热点 — 建议手动关怀。`,
    "high",
  ).catch(() => {});
}

/** 撞 R5 GPU 串行锁 (503) 时指数退避重试合成。 */
async function synthWithRetry(
  story: { title: string; moral: string; paragraphs: string[] },
  voice: string,
): Promise<Buffer> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, attempt * 15_000));
    try {
      return await synthStory(story, voice);
    } catch (e) {
      lastErr = e as Error;
    }
  }
  throw lastErr ?? new Error("synth failed");
}

export async function POST(req: Request) {
  const body = await readJson<{ token?: string }>(req);
  if (!body) return fail(400, "invalid json");
  const sub = await getSubscriberByToken(body.token ?? "");
  if (!sub) return fail(401, "unauthorized");
  if (!TOKEN) return fail(503, "service not configured");

  const date = bjToday();
  const serial = parseSerialState(sub.serialState);

  // 门控: 只服务「刚开通、一晚都没听过」的 trial 户; 其余一律温和跳过 (200, 客户端不报错)
  if (
    sub.status !== "trial" ||
    (serial.nights ?? 0) !== 0 ||
    !sub.voiceId ||
    (await getStory(sub.id, date))
  ) {
    return ok({ skipped: true });
  }

  if (!(await claimInstantSlot(sub.id))) {
    return ok({ skipped: true, busy: true }); // 已有一个在跑, 轮询页面等结果即可
  }
  // 盲区探针 (item 19): 已领锁、即将走「生成+合成」风险路径 → 先记 started。
  // started − ok − text − fail = 被 300s maxDuration 硬截杀、连下面 catch 都没跑到的次数。
  await bumpFunnel(date, "instant_started").catch(() => {});

  let textWritten = false;
  try {
    const note = (sub.pendingNote ?? "").trim();
    const gen = await generateFor(sub, date, note, []);
    if (!gen.ok) {
      await releaseInstantSlot(sub.id);
      await reportFirstNightFail(sub, date, gen.reason); // 空夜: 计数 + 响铃
      return ok({ ok: false }); // 客户端降级文案; 次日管线兜底
    }
    const story = gen.story;

    // 文本先落库 — 此刻起页面已可读
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
    textWritten = true;
    if (note) await clearPendingNote(sub.id);

    // serialState 立即推进 (见文件头注释: 截断安全的关键)
    const next: SerialState = { recap: story.recap, nights: 1 };
    await updateSubscriber(sub.id, { serialState: JSON.stringify(next) });

    const mp3 = await synthWithRetry(story, `custom:${sub.voiceId}`);
    const url = await putRadioAudio(sub.audioKey, date, mp3);
    await setStoryAudio(sub.id, date, url);
    await bumpFunnel(date, "instant_ok").catch(() => {});
    return ok({ ok: true, audio: true });
  } catch (e) {
    // 文本若已落库, 音频由 R5 2h 补跑捞起; 释放锁让补跑/重试不被挡
    await releaseInstantSlot(sub.id).catch(() => {});
    if (textWritten) {
      // 文本在 = 仅音频降级 (非故障, 不响铃; 224s 贴顶时主要落这条 → 计数让降级率可见)
      await bumpFunnel(date, "instant_text").catch(() => {});
      console.error(`[instant-first] ${sub.id} audio degraded: ${(e as Error).message}`);
    } else {
      await reportFirstNightFail(sub, date, (e as Error).message);
    }
    return ok({ ok: false });
  }
}
