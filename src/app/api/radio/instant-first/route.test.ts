/**
 * instant-first route hermetic 单测 — mock store/radio-story/story-gen/audio-storage/ntfy, 零 R5/网络。
 *
 * 核心决策矩阵 (块① 的「instant首晚」): 门控跳过 / 并发 busy / 生成空夜(instant_fail) /
 * 成功(instant_ok) / 音频降级(instant_text, 300s 贴顶主落点)。
 * 重点锁死「截断安全」契约: 音频失败但文本已落 → 降级非故障, serialState 已推进 nights:1。
 */
import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import type { Subscriber } from "@/lib/store";

// synthWithRetry 的指数退避 (15s/30s) 会让降级用例真等 ~45s → 压成零延迟保持 hermetic
// (只去掉真实 sleep, 重试次数/顺序语义不变)。afterAll 还原, 不外溢其他测试文件。
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = ((fn: (...a: unknown[]) => void) => realSetTimeout(fn, 0)) as typeof setTimeout;
afterAll(() => { globalThis.setTimeout = realSetTimeout; });

// ── mock 态 ──────────────────────────────────────────────────────
let current: Subscriber | null = null;
let storyExistsToday = false; // getStory(today) 命中?
let slotClaimed = true; // claimInstantSlot 结果
let slotReleased = false;
let genResult: { ok: true; story: unknown } | { ok: false; reason: string } = {
  ok: true,
  story: { title: "小星星", moral: "勇敢", paragraphs: ["p1", "p2"], recap: "前情" },
};
let synthThrows = false;
const funnel: string[] = [];
let putStoryCalled: Record<string, unknown> | null = null;
let serialPatched: string | null = null;
let audioSet: string | null = null;
let noteCleared = false;
let notified: string | null = null;

const mkSub = (over: Partial<Subscriber> = {}): Subscriber => ({
  id: "sub1", childName: "豆豆", age: "5", prefs: "", weeklyTheme: "",
  voiceId: "abcdef123456", token: "tok-abc", audioKey: "keyxyz",
  status: "trial", expiresAt: "2026-07-06", afdianUserId: "", contact: "wx-1",
  serialState: JSON.stringify({ nights: 0 }), pendingNote: "",
  createdAt: "2026-01-01T00:00:00.000Z", ...over,
});

mock.module("@/lib/store", () => ({
  getSubscriberByToken: async (t: string) => (current && t === current.token ? current : null),
  getStory: async () => (storyExistsToday ? { title: "已存在" } : null),
  claimInstantSlot: async () => slotClaimed,
  releaseInstantSlot: async () => { slotReleased = true; },
  bumpFunnel: async (_d: string, e: string) => { funnel.push(e); },
  putStory: async (_id: string, story: Record<string, unknown>) => { putStoryCalled = story; },
  updateSubscriber: async (_id: string, patch: Partial<Subscriber>) => {
    if (patch.serialState !== undefined) serialPatched = patch.serialState;
  },
  clearPendingNote: async () => { noteCleared = true; },
  setStoryAudio: async (_id: string, _d: string, url: string) => { audioSet = url; },
  // mock.module 全局生效, 补齐 store 完整面避免跨文件测试载序导致缺 export
  starStory: async () => {},
  markStoryListened: async () => {},
  deleteSubscriber: async () => {},
  setPendingNote: async () => {},
  getArticleAudio: async () => null,
  hasArticleSynthedToday: async () => false,
  claimArticleSynthLock: async () => true,
  releaseArticleSynthLock: async () => {},
  markArticleSynthedToday: async () => {},
  setArticleAudio: async () => {},
  claimOrder: async () => true,
  countSubscribers: async () => 0,
  createSubscriber: async () => ({}),
  getDemoVoice: async () => null,
  getSubscriber: async () => null,
  pushPendingOrder: async () => {},
}));
mock.module("@/lib/radio-story", () => ({ generateFor: async () => genResult }));
// mock.module 全局生效, 补齐 synthPart (articles/synth 用) 避免跨文件测试载序导致缺 export
mock.module("@/lib/story-gen", () => ({
  TOKEN: "tok",
  synthStory: async () => {
    if (synthThrows) throw new Error("R5 GPU 503");
    return Buffer.from("mp3");
  },
  synthPart: async () => Buffer.from("unused-in-this-file"),
  llmJson: async () => ({}),
  checkSafety: async () => ({ safe: true, reason: "" }),
}));
mock.module("@/lib/audio-storage", () => ({
  putRadioAudio: async () => "https://blob/x.mp3",
  deleteRadioFolder: async () => 0,
  putArticleAudio: async () => "https://blob/article.mp3",
}));
mock.module("@/lib/ntfy", () => ({ notify: async (title: string) => { notified = title; } }));

const { POST } = await import("./route");

const post = (body: unknown) =>
  POST(new Request("http://x/api/radio/instant-first", { method: "POST", body: JSON.stringify(body) }));

afterEach(() => {
  current = null; storyExistsToday = false; slotClaimed = true; slotReleased = false;
  genResult = { ok: true, story: { title: "小星星", moral: "勇敢", paragraphs: ["p1", "p2"], recap: "前情" } };
  synthThrows = false; funnel.length = 0; putStoryCalled = null; serialPatched = null;
  audioSet = null; noteCleared = false; notified = null;
});

// ── 鉴权 / 请求 ───────────────────────────────────────────────────
describe("鉴权", () => {
  test("坏 JSON → 400", async () => {
    const res = await POST(new Request("http://x", { method: "POST", body: "{bad" }));
    expect(res.status).toBe(400);
  });
  test("无效 token → 401", async () => {
    current = mkSub();
    const res = await post({ token: "wrong" });
    expect(res.status).toBe(401);
  });
});

// ── 门控 (只服务「刚开通、零故事、已录音、今晚未生成」的 trial 户) ──
describe("门控 skipped", () => {
  test("非 trial → skipped, 不领锁不计数", async () => {
    current = mkSub({ status: "active" });
    expect((await (await post({ token: "tok-abc" })).json())).toEqual({ skipped: true });
    expect(funnel).toHaveLength(0);
  });
  test("nights≠0 (已有夜) → skipped", async () => {
    current = mkSub({ serialState: JSON.stringify({ nights: 1 }) });
    expect((await (await post({ token: "tok-abc" })).json())).toEqual({ skipped: true });
  });
  test("无 voiceId → skipped", async () => {
    current = mkSub({ voiceId: "" });
    expect((await (await post({ token: "tok-abc" })).json())).toEqual({ skipped: true });
  });
  test("今晚已有故事 → skipped", async () => {
    current = mkSub(); storyExistsToday = true;
    expect((await (await post({ token: "tok-abc" })).json())).toEqual({ skipped: true });
  });
  test("并发: 已有一个在跑 (claim 失败) → skipped+busy, 不计 started", async () => {
    current = mkSub(); slotClaimed = false;
    expect((await (await post({ token: "tok-abc" })).json())).toEqual({ skipped: true, busy: true });
    expect(funnel).toHaveLength(0);
  });
});

// ── 生成空夜 (文本都没写成) → instant_fail + 高优先级响铃 ──
describe("空夜 instant_fail", () => {
  test("generateFor ok:false → ok:false, 释放锁, 计 started+fail, notify high", async () => {
    current = mkSub();
    genResult = { ok: false, reason: "unsafe: 含暴力" };
    const res = await post({ token: "tok-abc" });
    expect((await res.json())).toEqual({ ok: false });
    expect(slotReleased).toBe(true);
    expect(funnel).toEqual(["instant_started", "instant_fail"]);
    expect(notified).toContain("即时首晚生成失败");
    expect(putStoryCalled).toBeNull(); // 文本未落
  });
});

// ── 成功 → 文本落库 + serialState 推进 + 音频 + instant_ok ──
describe("成功 instant_ok", () => {
  test("full path: putStory + serialState{nights:1} + setStoryAudio + {ok,audio}", async () => {
    current = mkSub({ pendingNote: "今天骑车" });
    const res = await post({ token: "tok-abc" });
    expect((await res.json())).toEqual({ ok: true, audio: true });
    expect(putStoryCalled?.title).toBe("小星星");
    expect(putStoryCalled?.note).toBe("今天骑车"); // 捎话织入
    expect(noteCleared).toBe(true);
    expect(JSON.parse(serialPatched!)).toEqual({ recap: "前情", nights: 1 });
    expect(audioSet).toBe("https://blob/x.mp3");
    expect(funnel).toEqual(["instant_started", "instant_ok"]);
    expect(notified).toBeNull(); // 成功不响铃
  });
});

// ── 音频降级 (文本已落、synth 失败) → instant_text, 非故障不响铃 ──
describe("音频降级 instant_text (截断安全契约)", () => {
  test("synth 抛错但文本已落 → ok:false, 计 instant_text, serialState 已推进, 不响铃", async () => {
    current = mkSub();
    synthThrows = true;
    const res = await post({ token: "tok-abc" });
    expect((await res.json())).toEqual({ ok: false });
    // 文本先落 = 页面已可读; R5 2h 补跑走 existing&&!audioUrl 补音频
    expect(putStoryCalled?.title).toBe("小星星");
    expect(putStoryCalled?.audioUrl).toBe(""); // 音频占位空
    expect(JSON.parse(serialPatched!)).toEqual({ recap: "前情", nights: 1 }); // 计数已对
    expect(audioSet).toBeNull(); // 音频未落
    expect(funnel).toEqual(["instant_started", "instant_text"]);
    expect(notified).toBeNull(); // 降级非故障, 不响铃
    expect(slotReleased).toBe(true); // 释放锁让补跑不被挡
  });
});
