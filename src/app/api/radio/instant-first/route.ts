import { NextResponse } from "next/server";
import {
  claimInstantSlot,
  clearPendingNote,
  getStory,
  getSubscriberByToken,
  putStory,
  releaseInstantSlot,
  setStoryAudio,
  updateSubscriber,
} from "@/lib/store";
import { putRadioAudio } from "@/lib/audio-storage";
import { bjToday, parseSerialState, type SerialState } from "@/lib/beijing";
import { generateFor } from "@/lib/radio-story";
import { TOKEN, synthStory } from "@/lib/story-gen";

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

function ok(body: Record<string, unknown>) {
  return NextResponse.json(body);
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
  let body: { token?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const sub = await getSubscriberByToken(body.token ?? "");
  if (!sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!TOKEN) return NextResponse.json({ error: "service not configured" }, { status: 503 });

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

  try {
    const note = (sub.pendingNote ?? "").trim();
    const gen = await generateFor(sub, date, note, []);
    if (!gen.ok) {
      await releaseInstantSlot(sub.id);
      console.error(`[instant-first] ${sub.id} generate fail: ${gen.reason}`);
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
    if (note) await clearPendingNote(sub.id);

    // serialState 立即推进 (见文件头注释: 截断安全的关键)
    const next: SerialState = { recap: story.recap, nights: 1 };
    await updateSubscriber(sub.id, { serialState: JSON.stringify(next) });

    const mp3 = await synthWithRetry(story, `custom:${sub.voiceId}`);
    const url = await putRadioAudio(sub.audioKey, date, mp3);
    await setStoryAudio(sub.id, date, url);
    return ok({ ok: true, audio: true });
  } catch (e) {
    // 文本若已落库, 音频由 R5 2h 补跑捞起; 释放锁让补跑/重试不被挡
    await releaseInstantSlot(sub.id).catch(() => {});
    console.error(`[instant-first] ${sub.id} FAIL: ${(e as Error).message}`);
    return ok({ ok: false });
  }
}
