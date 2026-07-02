/**
 * delete-account route hermetic 单测 — mock store/cosy/audio-storage, 零 Redis/网络。
 * 覆盖: 正常注销 200 且外部资源与 store 均被清 / confirm 缺失·错值 400 且未删 /
 *       无效 token 401 / 外部清理抛错 → 502 且 store 未动。
 */
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { Subscriber } from "@/lib/store";

// ── mock: 内存单户 + 记录各步调用 ──
let current: Subscriber | null = null;
let deletedId: string | null = null;
let deletedVoiceId: string | null = null;
let deletedAudioKey: string | null = null;
let voiceThrows = false;

const mkSub = (over: Partial<Subscriber> = {}): Subscriber => ({
  id: "sub1",
  childName: "豆豆",
  age: "5",
  prefs: "喜欢恐龙",
  weeklyTheme: "海洋",
  voiceId: "abcdef123456",
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
  deleteSubscriber: async (id: string) => {
    deletedId = id;
  },
  // mock.module 全局生效, 补齐兄弟路由测试所需 store 面, 避免跨文件载序缺 export
  setPendingNote: async () => {},
  markStoryListened: async () => {},
  updateSubscriber: async () => {},
}));

mock.module("@/lib/cosy", () => ({
  deleteVoice: async (voiceId: string) => {
    if (voiceThrows) throw new Error("R5 down");
    deletedVoiceId = voiceId;
    return true;
  },
}));

mock.module("@/lib/audio-storage", () => ({
  deleteRadioFolder: async (audioKey: string) => {
    deletedAudioKey = audioKey;
    return 0;
  },
}));

const { POST } = await import("./route");

const post = (body: unknown) =>
  POST(new Request("http://x/api/radio/delete-account", { method: "POST", body: JSON.stringify(body) }));

afterEach(() => {
  current = null;
  deletedId = null;
  deletedVoiceId = null;
  deletedAudioKey = null;
  voiceThrows = false;
});

describe("POST 正常注销", () => {
  test("token+confirm:'DELETE' → 200 且音色/音频/store 均被清", async () => {
    current = mkSub();
    const res = await post({ token: "tok-abc", confirm: "DELETE" });
    expect(res.status).toBe(200);
    expect((await res.json()) as { ok?: boolean }).toEqual({ ok: true });
    expect(deletedVoiceId).toBe("abcdef123456");
    expect(deletedAudioKey).toBe("keyxyz");
    expect(deletedId).toBe("sub1");
  });

  test("无 voiceId 时跳过音色删除仍成功", async () => {
    current = mkSub({ voiceId: "" });
    const res = await post({ token: "tok-abc", confirm: "DELETE" });
    expect(res.status).toBe(200);
    expect(deletedVoiceId).toBeNull();
    expect(deletedId).toBe("sub1");
  });
});

describe("POST confirm 哨兵", () => {
  test("缺 confirm → 400 且未删", async () => {
    current = mkSub();
    const res = await post({ token: "tok-abc" });
    expect(res.status).toBe(400);
    expect(deletedId).toBeNull();
    expect(deletedVoiceId).toBeNull();
  });

  test("confirm 错值 → 400 且未删", async () => {
    current = mkSub();
    const res = await post({ token: "tok-abc", confirm: "delete" });
    expect(res.status).toBe(400);
    expect(deletedId).toBeNull();
  });
});

describe("POST 鉴权", () => {
  test("无效 token → 401 且未删", async () => {
    current = mkSub();
    const res = await post({ token: "wrong", confirm: "DELETE" });
    expect(res.status).toBe(401);
    expect(deletedId).toBeNull();
  });
});

describe("POST 外部清理失败", () => {
  test("deleteVoice 抛错 → 502 且 store 未动", async () => {
    current = mkSub();
    voiceThrows = true;
    const res = await post({ token: "tok-abc", confirm: "DELETE" });
    expect(res.status).toBe(502);
    expect(deletedId).toBeNull(); // store 未动, 重试安全
  });
});
