/**
 * articles/synth route hermetic 单测 — mock store/articles/story-gen/audio-storage, 零 R5/网络。
 *
 * 业务事故聚焦: 「用我的声音念这篇」每日 1 篇配额 —— 合成失败时配额/锁必须回滚,
 * 否则用户当天的唯一一次机会被 GPU 抖动/超时白吞, 且无法重试 (见 route.ts 头部注释,
 * 本文件把该契约钉成可判定的回归测试)。同时覆盖会员权限边界 (expired/refunded 拒绝)。
 */
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { Subscriber } from "@/lib/store";

let current: Subscriber | null = null;
let existingAudio: { url: string } | null = null;
let synthedToday = false;
let lockClaimed = true;
let lockReleased = false;
let quotaMarked = false;
let synthThrows = false;
let synthCallCount = 0;
const funnel: string[] = [];

const mkSub = (over: Partial<Subscriber> = {}): Subscriber => ({
  id: "sub1", childName: "豆豆", age: "5", prefs: "", weeklyTheme: "",
  voiceId: "abcdef123456", token: "tok-abc", audioKey: "keyxyz",
  status: "trial", expiresAt: "2026-12-31", afdianUserId: "", contact: "wx-1",
  serialState: "", pendingNote: "", createdAt: "2026-01-01T00:00:00.000Z", ...over,
});

mock.module("@/lib/articles", () => ({
  getArticle: async (category: string, slug: string) =>
    slug === "missing" ? null : { title: "小刺猬的旅行", category, slug, paragraphs: ["第一段。", "第二段。"] },
}));
mock.module("@/lib/audio-storage", () => ({
  putArticleAudio: async () => "https://blob/article.mp3",
  putRadioAudio: async () => "https://blob/x.mp3",
  deleteRadioFolder: async () => 0,
}));
mock.module("@/lib/store", () => ({
  getSubscriberByToken: async (t: string) => (current && t === current.token ? current : null),
  getArticleAudio: async () => existingAudio,
  hasArticleSynthedToday: async () => synthedToday,
  claimArticleSynthLock: async () => lockClaimed,
  releaseArticleSynthLock: async () => { lockReleased = true; },
  markArticleSynthedToday: async () => { quotaMarked = true; },
  setArticleAudio: async () => {},
  bumpFunnel: async (_d: string, e: string) => { funnel.push(e); },
  // mock.module 全局生效, 补齐 store 完整面避免跨文件测试载序导致缺 export
  getStory: async () => null,
  starStory: async () => {},
  markStoryListened: async () => {},
  updateSubscriber: async () => {},
  claimInstantSlot: async () => true,
  releaseInstantSlot: async () => {},
  clearPendingNote: async () => {},
  putStory: async () => {},
  setStoryAudio: async () => {},
  deleteSubscriber: async () => {},
  setPendingNote: async () => {},
  claimOrder: async () => true,
  countSubscribers: async () => 0,
  createSubscriber: async () => ({}),
  getDemoVoice: async () => null,
  getSubscriber: async () => null,
  pushPendingOrder: async () => {},
}));
// mock.module 全局生效, 补齐 story-gen 完整面 (TOKEN/synthStory) 避免跨文件测试载序导致缺 export
// (同一进程内所有 mock.module("@/lib/story-gen") 调用共享同一注册表, 见 instant-first/route.test.ts)
mock.module("@/lib/story-gen", () => ({
  TOKEN: "tok",
  synthStory: async () => Buffer.from("unused-in-this-file"),
  synthPart: async (_text: string) => {
    synthCallCount++;
    if (synthThrows) throw new Error("R5 GPU 503");
    return Buffer.from("mp3-bytes");
  },
  llmJson: async () => ({}),
  checkSafety: async () => ({ safe: true, reason: "" }),
}));

const { POST } = await import("./route");

const post = (body: unknown) =>
  POST(new Request("http://x/api/articles/synth", { method: "POST", body: JSON.stringify(body) }));

afterEach(() => {
  current = null; existingAudio = null; synthedToday = false; lockClaimed = true;
  lockReleased = false; quotaMarked = false; synthThrows = false; synthCallCount = 0;
  funnel.length = 0;
});

describe("会员权限边界", () => {
  test("expired 订户请求朗读 → 403, 不占配额不进锁", async () => {
    current = mkSub({ status: "expired" });
    const res = await post({ token: "tok-abc", category: "life", slug: "hedgehog" });
    expect(res.status).toBe(403);
    expect(quotaMarked).toBe(false);
    expect(synthCallCount).toBe(0);
  });

  test("refunded 订户 → 403 (已退款不能继续消耗服务)", async () => {
    current = mkSub({ status: "refunded" });
    const res = await post({ token: "tok-abc", category: "life", slug: "hedgehog" });
    expect(res.status).toBe(403);
  });

  test("无效 token → 401", async () => {
    current = mkSub();
    const res = await post({ token: "wrong", category: "life", slug: "hedgehog" });
    expect(res.status).toBe(401);
  });
});

describe("内容生成失败时的配额回滚 (防止「唯一一次机会」被 GPU 抖动白吞)", () => {
  test("合成失败 → 不落配额标记 + 释放锁 + 计 asynth_fail, 用户当天仍可重试", async () => {
    current = mkSub();
    synthThrows = true;
    const res = await post({ token: "tok-abc", category: "life", slug: "hedgehog" });
    expect(res.status).toBe(502);
    expect(quotaMarked).toBe(false); // 关键: 失败绝不能扣掉当天唯一配额
    expect(lockReleased).toBe(true); // 关键: 必须放行重试, 否则用户干等
    expect(funnel).toEqual(["asynth_started", "asynth_fail"]);
  });

  test("合成成功 → 配额才落 + 释放锁 + 计 asynth_ok", async () => {
    current = mkSub();
    const res = await post({ token: "tok-abc", category: "life", slug: "hedgehog" });
    expect(res.status).toBe(200);
    expect(quotaMarked).toBe(true);
    expect(lockReleased).toBe(true);
    expect(funnel).toEqual(["asynth_started", "asynth_ok"]);
  });

  test("当天配额已用 → 429, 不重新占锁不重新合成 (防止绕过每日 1 篇限制)", async () => {
    current = mkSub();
    synthedToday = true;
    const res = await post({ token: "tok-abc", category: "life", slug: "hedgehog" });
    expect(res.status).toBe(429);
    expect(synthCallCount).toBe(0);
    expect(funnel).toEqual([]);
  });

  test("已念过的文章命中缓存 → 直接返回, 不耗配额不占锁 (防止重复点击白烧 GPU)", async () => {
    current = mkSub();
    existingAudio = { url: "https://blob/cached.mp3" };
    const res = await post({ token: "tok-abc", category: "life", slug: "hedgehog" });
    const j = (await res.json()) as { url?: string; cached?: boolean };
    expect(res.status).toBe(200);
    expect(j.cached).toBe(true);
    expect(j.url).toBe("https://blob/cached.mp3");
    expect(synthCallCount).toBe(0);
    expect(quotaMarked).toBe(false);
  });

  test("并发占锁失败 (另一篇正在念) → 429, 不重复扣配额", async () => {
    current = mkSub();
    lockClaimed = false;
    const res = await post({ token: "tok-abc", category: "life", slug: "hedgehog" });
    expect(res.status).toBe(429);
    expect(synthCallCount).toBe(0);
    expect(quotaMarked).toBe(false);
  });
});
