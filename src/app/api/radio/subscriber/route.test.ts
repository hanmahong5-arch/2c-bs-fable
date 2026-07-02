/**
 * subscriber route hermetic 单测 — mock store 层, 零 Redis/网络。
 * 覆盖: 白名单外字段被忽略 / expired POST 403 且 reason:'suspended' / age 非法 400 /
 *       GET 响应不含 voiceId·token·contact。
 */
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { Subscriber } from "@/lib/store";

// ── store mock: 内存单户 + 记录 patch ──
let current: Subscriber | null = null;
let lastPatch: Partial<Subscriber> | null = null;

const mkSub = (over: Partial<Subscriber> = {}): Subscriber => ({
  id: "sub1",
  childName: "豆豆",
  age: "5",
  prefs: "喜欢恐龙",
  weeklyTheme: "海洋",
  voiceId: "voice-secret",
  token: "tok-abc",
  audioKey: "keyxyz",
  status: "active",
  expiresAt: "2026-12-31",
  afdianUserId: "afd-123",
  contact: "wx-secret",
  serialState: JSON.stringify({ nights: 4 }),
  pendingNote: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

mock.module("@/lib/store", () => ({
  getSubscriberByToken: async (token: string) =>
    current && token === current.token ? current : null,
  updateSubscriber: async (_id: string, patch: Partial<Subscriber>) => {
    lastPatch = patch;
  },
}));

const { GET, POST } = await import("./route");

const post = (body: unknown) =>
  POST(new Request("http://x/api/radio/subscriber", { method: "POST", body: JSON.stringify(body) }));
const get = (token: string) =>
  GET(new Request(`http://x/api/radio/subscriber?token=${encodeURIComponent(token)}`));

afterEach(() => {
  current = null;
  lastPatch = null;
});

describe("POST 白名单", () => {
  test("非白名单字段 (voiceId/status/token/contact) 被忽略, 只 patch 4 字段组", async () => {
    current = mkSub();
    const res = await post({
      token: "tok-abc",
      childName: "新名",
      prefs: "喜欢火箭",
      voiceId: "hacked",
      status: "active",
      token2: "x",
      afdianUserId: "hacked",
      contact: "hacked",
      audioKey: "hacked",
    });
    expect(res.status).toBe(200);
    expect(lastPatch).toEqual({ childName: "新名", prefs: "喜欢火箭" });
    // 断言越权字段绝不进 patch
    for (const k of ["voiceId", "status", "afdianUserId", "contact", "audioKey", "token"]) {
      expect(lastPatch).not.toHaveProperty(k);
    }
  });
});

describe("POST 暂停态", () => {
  test("expired → 403 且 reason:'suspended'", async () => {
    current = mkSub({ status: "expired" });
    const res = await post({ token: "tok-abc", childName: "x" });
    expect(res.status).toBe(403);
    const j = (await res.json()) as { reason?: string };
    expect(j.reason).toBe("suspended");
    expect(lastPatch).toBeNull(); // 未落任何写
  });

  test("refunded → 403 且 reason:'suspended'", async () => {
    current = mkSub({ status: "refunded" });
    const res = await post({ token: "tok-abc", prefs: "x" });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { reason?: string }).reason).toBe("suspended");
  });
});

describe("POST 校验", () => {
  test("age 非法 (3 位) → 400", async () => {
    current = mkSub();
    const res = await post({ token: "tok-abc", age: "123" });
    expect(res.status).toBe(400);
    expect(lastPatch).toBeNull();
  });

  test("age 非数字 → 400", async () => {
    current = mkSub();
    const res = await post({ token: "tok-abc", age: "五" });
    expect(res.status).toBe(400);
  });

  test("无效 token → 401", async () => {
    current = mkSub();
    const res = await post({ token: "wrong", childName: "x" });
    expect(res.status).toBe(401);
  });
});

describe("GET 脱敏", () => {
  test("响应含档案字段但不含 voiceId/token/afdianUserId/contact", async () => {
    current = mkSub();
    const res = await get("tok-abc");
    expect(res.status).toBe(200);
    const j = (await res.json()) as Record<string, unknown>;
    expect(j.childName).toBe("豆豆");
    expect(j.nights).toBe(4);
    for (const k of ["voiceId", "token", "afdianUserId", "contact", "audioKey", "serialState", "pendingNote"]) {
      expect(j).not.toHaveProperty(k);
    }
  });

  test("无效 token → 401", async () => {
    current = mkSub();
    const res = await get("nope");
    expect(res.status).toBe(401);
  });
});
