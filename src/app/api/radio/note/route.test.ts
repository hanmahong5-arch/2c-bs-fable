/**
 * note route hermetic 单测 — mock store 层, 零 Redis/网络。
 * 覆盖: expired/refunded POST 403 且 reason:'suspended' 且 error 文案不变 /
 *       正常态 note 落存 200 / 无效 token 401。
 */
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { Subscriber } from "@/lib/store";

const SUSPENDED_MSG = "连载已暂停，续订后就能继续捎话啦。";

// ── store mock: 内存单户 + 记录写入 ──
let current: Subscriber | null = null;
let noteWritten: { id: string; note: string } | null = null;
let listenedMarked = false;

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
  serialState: JSON.stringify({ nights: 1 }),
  pendingNote: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

mock.module("@/lib/store", () => ({
  getSubscriberByToken: async (token: string) =>
    current && token === current.token ? current : null,
  setPendingNote: async (id: string, note: string) => {
    noteWritten = { id, note };
  },
  markStoryListened: async () => {
    listenedMarked = true;
  },
  // mock.module 全局生效, 补齐 store 完整面避免跨文件测试载序导致缺 export
  updateSubscriber: async () => {},
}));

const { POST } = await import("./route");

const post = (body: unknown) =>
  POST(new Request("http://x/api/radio/note", { method: "POST", body: JSON.stringify(body) }));

afterEach(() => {
  current = null;
  noteWritten = null;
  listenedMarked = false;
});

describe("POST 暂停态", () => {
  test("expired → 403 + reason:'suspended' + 文案不变, 未落写", async () => {
    current = mkSub({ status: "expired" });
    const res = await post({ token: "tok-abc", note: "今天骑车了" });
    expect(res.status).toBe(403);
    const j = (await res.json()) as { error?: string; reason?: string };
    expect(j.reason).toBe("suspended");
    expect(j.error).toBe(SUSPENDED_MSG);
    expect(noteWritten).toBeNull();
    expect(listenedMarked).toBe(false);
  });

  test("refunded → 403 + reason:'suspended'", async () => {
    current = mkSub({ status: "refunded" });
    const res = await post({ token: "tok-abc", note: "x" });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { reason?: string }).reason).toBe("suspended");
  });
});

describe("POST 正常态", () => {
  test("active → 200 且 note 落存", async () => {
    current = mkSub();
    const res = await post({ token: "tok-abc", note: "今天学会系鞋带" });
    expect(res.status).toBe(200);
    expect(noteWritten).toEqual({ id: "sub1", note: "今天学会系鞋带" });
    expect(listenedMarked).toBe(true);
  });

  test("无效 token → 401", async () => {
    current = mkSub();
    const res = await post({ token: "wrong", note: "x" });
    expect(res.status).toBe(401);
    expect(noteWritten).toBeNull();
  });
});
