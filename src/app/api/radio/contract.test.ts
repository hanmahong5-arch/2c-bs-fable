/**
 * contract.test.ts — /api/radio/* 前后端契约快照 (hermetic; mock 全部下游, 零 Redis/R5/网络)。
 *
 * 目的: 对每个电台端点断言 请求字段 / 响应字段 / 状态码, 锁死 App 客户端依赖的机读形状。
 * 已有独立测试的 subscriber/note/delete-account 不重复, 本文件补齐其余 5 端点:
 *   star · listened · fallback · delete-voice · instant-first。
 *
 * ⚠ 契约真源: fable_api.dart (Flutter app) 不在本 repo (独立仓, 本机无 .dart 文件)。
 * 本文件以「服务端路由」为契约真源逐字段断言; 与 fable_api.dart 的逐条比对须在 app 仓侧
 * 对照下方 RADIO_CONTRACT 清单完成 (此处不可得, 不臆造)。
 */
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { Subscriber } from "@/lib/store";

// ── 共享 mock 态 ──────────────────────────────────────────────────
let current: Subscriber | null = null;
let starred: { id: string; date: string } | null = null;
let listened: { id: string; date: string } | null = null;
let voiceCleared = false;
let voiceThrows = false;
let funnelBumped: { date: string; event: string } | null = null;
let storyExists = true;

const mkSub = (over: Partial<Subscriber> = {}): Subscriber => ({
  id: "sub1", childName: "豆豆", age: "5", prefs: "", weeklyTheme: "",
  voiceId: "abcdef123456", token: "tok-abc", audioKey: "keyxyz",
  status: "active", expiresAt: "2026-12-31", afdianUserId: "", contact: "",
  serialState: JSON.stringify({ nights: 4 }), pendingNote: "",
  createdAt: "2026-01-01T00:00:00.000Z", ...over,
});

mock.module("@/lib/store", () => ({
  getSubscriberByToken: async (t: string) => (current && t === current.token ? current : null),
  getStory: async () => (storyExists ? { title: "篇", date: "2026-07-01" } : null),
  starStory: async (id: string, date: string) => { starred = { id, date }; },
  markStoryListened: async (id: string, date: string) => { listened = { id, date }; },
  updateSubscriber: async (_id: string, patch: Partial<Subscriber>) => {
    if (patch.voiceId === "") voiceCleared = true;
  },
  bumpFunnel: async (date: string, event: string) => { funnelBumped = { date, event }; },
  // instant-first 门控走「非 trial → skip」分支即返回, 下面这些不会被调用, 仅补面防缺 export
  claimInstantSlot: async () => true,
  releaseInstantSlot: async () => {},
  clearPendingNote: async () => {},
  putStory: async () => {},
  setStoryAudio: async () => {},
  // 跨文件补面 (afdian webhook / articles synth 等兄弟路由需要, 本文件用不到, 纯占位防缺 export)
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
mock.module("@/lib/cosy", () => ({
  deleteVoice: async () => { if (voiceThrows) throw new Error("R5 down"); return true; },
}));
mock.module("@/lib/audio-storage", () => ({
  putRadioAudio: async () => "https://blob/x.mp3",
  deleteRadioFolder: async () => 0,
  putArticleAudio: async () => "https://blob/article.mp3",
}));
mock.module("@/lib/radio-story", () => ({ generateFor: async () => ({ ok: false, reason: "x" }) }));
// mock.module 全局生效, 补齐 synthPart (articles/synth 用) 避免跨文件测试载序导致缺 export
mock.module("@/lib/story-gen", () => ({
  TOKEN: "tok",
  synthStory: async () => Buffer.from(""),
  synthPart: async () => Buffer.from(""),
  llmJson: async () => ({}),
  checkSafety: async () => ({ safe: true, reason: "" }),
}));
mock.module("@/lib/ntfy", () => ({ notify: async () => {} }));

const star = await import("./star/route");
const listenedR = await import("./listened/route");
const fallback = await import("./fallback/route");
const deleteVoice = await import("./delete-voice/route");
const instant = await import("./instant-first/route");

const call = (fn: (r: Request) => Promise<Response>, path: string, body: unknown) =>
  fn(new Request(`http://x/api/radio/${path}`, { method: "POST", body: JSON.stringify(body) }));

afterEach(() => {
  current = null; starred = null; listened = null;
  voiceCleared = false; voiceThrows = false; funnelBumped = null; storyExists = true;
});

// ── /star ─────────────────────────────────────────────────────────
describe("POST /star {token,date} → {ok}", () => {
  test("坏 JSON → 400 {error}", async () => {
    const res = await star.POST(new Request("http://x", { method: "POST", body: "{bad" }));
    expect(res.status).toBe(400);
    expect((await res.json()) as { error?: string }).toHaveProperty("error");
  });
  test("无效 token → 401 {error:unauthorized}", async () => {
    current = mkSub();
    const res = await call(star.POST, "star", { token: "wrong", date: "2026-07-01" });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error?: string }).error).toBe("unauthorized");
  });
  test("坏日期格式 → 400 {error:bad date}", async () => {
    current = mkSub();
    const res = await call(star.POST, "star", { token: "tok-abc", date: "7-1" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error?: string }).error).toBe("bad date");
  });
  test("故事不存在 → 404 {error:story not found}", async () => {
    current = mkSub(); storyExists = false;
    const res = await call(star.POST, "star", { token: "tok-abc", date: "2026-07-01" });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error?: string }).error).toBe("story not found");
  });
  test("正常 → 200 {ok:true}, 点星且触达置位", async () => {
    current = mkSub();
    const res = await call(star.POST, "star", { token: "tok-abc", date: "2026-07-01" });
    expect(res.status).toBe(200);
    expect((await res.json()) as { ok?: boolean }).toEqual({ ok: true });
    expect(starred).toEqual({ id: "sub1", date: "2026-07-01" });
    expect(listened).toEqual({ id: "sub1", date: "2026-07-01" }); // 点星即触达
  });
});

// ── /listened ─────────────────────────────────────────────────────
describe("POST /listened {token,date} → {ok}", () => {
  test("无效 token → 401", async () => {
    current = mkSub();
    const res = await call(listenedR.POST, "listened", { token: "wrong", date: "2026-07-01" });
    expect(res.status).toBe(401);
  });
  test("坏日期 → 400 {error:bad date}", async () => {
    current = mkSub();
    const res = await call(listenedR.POST, "listened", { token: "tok-abc", date: "bad" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error?: string }).error).toBe("bad date");
  });
  test("正常 → 200 {ok:true} 且置位 (故事缺时 store 层自 no-op)", async () => {
    current = mkSub();
    const res = await call(listenedR.POST, "listened", { token: "tok-abc", date: "2026-07-01" });
    expect(res.status).toBe(200);
    expect((await res.json()) as { ok?: boolean }).toEqual({ ok: true });
    expect(listened).toEqual({ id: "sub1", date: "2026-07-01" });
  });
});

// ── /fallback (遥测 beacon) ────────────────────────────────────────
describe("POST /fallback {token,kind} → {ok}", () => {
  test("无效 token → 401", async () => {
    current = mkSub();
    const res = await call(fallback.POST, "fallback", { token: "wrong", kind: "fresh" });
    expect(res.status).toBe(401);
  });
  test("非法 kind → 400 {error:bad kind}", async () => {
    current = mkSub();
    const res = await call(fallback.POST, "fallback", { token: "tok-abc", kind: "boom" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error?: string }).error).toBe("bad kind");
  });
  test.each(["fresh", "replay", "library", "none"])(
    "合法 kind %s → 200 且 bumpFunnel(nightly_%s)",
    async (kind) => {
      current = mkSub();
      const res = await call(fallback.POST, "fallback", { token: "tok-abc", kind });
      expect(res.status).toBe(200);
      expect((await res.json()) as { ok?: boolean }).toEqual({ ok: true });
      expect(funnelBumped?.event).toBe(`nightly_${kind}`);
    },
  );
});

// ── /delete-voice ─────────────────────────────────────────────────
describe("POST /delete-voice {token} → {ok}", () => {
  test("无效 token → 401", async () => {
    current = mkSub();
    const res = await call(deleteVoice.POST, "delete-voice", { token: "wrong" });
    expect(res.status).toBe(401);
  });
  test("正常 → 200 {ok:true} 且 voiceId 清空", async () => {
    current = mkSub();
    const res = await call(deleteVoice.POST, "delete-voice", { token: "tok-abc" });
    expect(res.status).toBe(200);
    expect((await res.json()) as { ok?: boolean }).toEqual({ ok: true });
    expect(voiceCleared).toBe(true);
  });
  test("R5 删除抛错 → 502 {error} 且不清 voiceId", async () => {
    current = mkSub(); voiceThrows = true;
    const res = await call(deleteVoice.POST, "delete-voice", { token: "tok-abc" });
    expect(res.status).toBe(502);
    expect((await res.json()) as { error?: string }).toHaveProperty("error");
    expect(voiceCleared).toBe(false);
  });
});

// ── /instant-first (契约层: 400/401/skip; 生成路径不在契约测试范围) ──
describe("POST /instant-first {token} → {ok|skipped|...}", () => {
  test("坏 JSON → 400 {error:invalid json}", async () => {
    const res = await instant.POST(new Request("http://x", { method: "POST", body: "{bad" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error?: string }).error).toBe("invalid json");
  });
  test("无效 token → 401", async () => {
    current = mkSub();
    const res = await call(instant.POST, "instant-first", { token: "wrong" });
    expect(res.status).toBe(401);
  });
  test("非 trial 户 → 200 {skipped:true} (门控温和跳过, 客户端不报错)", async () => {
    current = mkSub({ status: "active" });
    const res = await call(instant.POST, "instant-first", { token: "tok-abc" });
    expect(res.status).toBe(200);
    expect((await res.json()) as { skipped?: boolean }).toEqual({ skipped: true });
  });
});

// ── 契约清单 (App 侧逐条比对基准; fable_api.dart 不在本仓, 见文件头) ──
describe("RADIO_CONTRACT 端点字段清单 (逐端点)", () => {
  const RADIO_CONTRACT = {
    "GET /api/radio/subscriber": { req: ["token(query)"], res: ["childName", "age", "prefs", "weeklyTheme", "status", "expiresAt", "nights"] },
    "POST /api/radio/subscriber": { req: ["token", "childName?", "age?", "prefs?", "weeklyTheme?"], res: ["ok"] },
    "POST /api/radio/note": { req: ["token", "note"], res: ["ok", "trialDone"] },
    "POST /api/radio/star": { req: ["token", "date"], res: ["ok"] },
    "POST /api/radio/listened": { req: ["token", "date"], res: ["ok"] },
    "POST /api/radio/fallback": { req: ["token", "kind"], res: ["ok"] },
    "POST /api/radio/delete-voice": { req: ["token"], res: ["ok"] },
    "POST /api/radio/delete-account": { req: ["token", "confirm"], res: ["ok"] },
    "POST /api/radio/instant-first": { req: ["token"], res: ["ok|skipped|busy|audio"] },
  } as const;

  test("清单覆盖全部 9 个电台端点", () => {
    expect(Object.keys(RADIO_CONTRACT)).toHaveLength(9);
  });
  test("每端点 req 均含 token (鉴权凭证)", () => {
    for (const [ep, c] of Object.entries(RADIO_CONTRACT)) {
      expect(c.req.some((f) => f.startsWith("token")), ep).toBe(true);
    }
  });
  test("每端点 res 非空 (机读形状已定义)", () => {
    for (const [ep, c] of Object.entries(RADIO_CONTRACT)) {
      expect(c.res.length, ep).toBeGreaterThan(0);
    }
  });
});
