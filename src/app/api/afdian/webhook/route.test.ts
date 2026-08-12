/**
 * afdian webhook route hermetic 单测 — mock payments/afdian + store + ntfy, 零网络/Redis。
 *
 * 业务事故聚焦:
 *  1. 爱发电对同一笔支付重推 webhook (探针/网络抖动常见) 不能被重复处理成「续两次」白送时长。
 *  2. 续费顺延必须从「当前到期日」起算, 不能被错误重置成「今天」而吞掉用户已付费的剩余天数。
 *  3. 容量到帽时已付款订单必须转人工 (pending+高优响铃), 不能静默放行超卖也不能静默丢单。
 */
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { NormalizedOrder } from "@/lib/payments/afdian";
import type { Subscriber } from "@/lib/store";

let queriedOrder: NormalizedOrder | null = null;
let claimed = new Set<string>();
let subsById = new Map<string, Subscriber>();
let updatedPatches: { id: string; patch: Partial<Subscriber> }[] = [];
let subCount = 0;
let hardCap = 30;
let pendingPushed: Record<string, unknown>[] = [];
let notifications: { title: string; priority?: string }[] = [];
let createdSubs: Partial<Subscriber>[] = [];
let demoVoiceByHex = new Map<string, string>();

const mkSub = (over: Partial<Subscriber> = {}): Subscriber => ({
  id: "sub1", childName: "豆豆", age: "5", prefs: "", weeklyTheme: "",
  voiceId: "abcdef123456", token: "tok-abc-radiotoken1234567890", audioKey: "keyxyz",
  status: "active", expiresAt: "2026-12-31", afdianUserId: "", contact: "wx-1",
  serialState: "", pendingNote: "", createdAt: "2026-01-01T00:00:00.000Z", ...over,
});

mock.module("@/lib/payments/afdian", () => ({
  queryOrder: async (_no: string) => queriedOrder,
}));
mock.module("@/lib/store", () => ({
  claimOrder: async (outTradeNo: string, _placeholder: string) => {
    if (claimed.has(outTradeNo)) return false;
    claimed.add(outTradeNo);
    return true;
  },
  countSubscribers: async () => subCount,
  createSubscriber: async (input: Partial<Subscriber>) => {
    createdSubs.push(input);
    const sub = mkSub({ id: "new1", ...input });
    subsById.set(sub.id, sub);
    return sub;
  },
  getDemoVoice: async (hex: string) => demoVoiceByHex.get(hex) ?? null,
  getSubscriber: async (id: string) => subsById.get(id) ?? null,
  getSubscriberByToken: async (_t: string) => null,
  pushPendingOrder: async (order: Record<string, unknown>) => { pendingPushed.push(order); },
  updateSubscriber: async (id: string, patch: Partial<Subscriber>) => {
    updatedPatches.push({ id, patch });
    const cur = subsById.get(id);
    if (cur) subsById.set(id, { ...cur, ...patch } as Subscriber);
  },
  // mock.module 全局生效, 补齐 store 完整面避免跨文件测试载序导致缺 export
  getStory: async () => null,
  starStory: async () => {},
  markStoryListened: async () => {},
  bumpFunnel: async () => {},
  claimInstantSlot: async () => true,
  releaseInstantSlot: async () => {},
  clearPendingNote: async () => {},
  putStory: async () => {},
  setStoryAudio: async () => {},
  deleteSubscriber: async () => {},
  setPendingNote: async () => {},
  getArticleAudio: async () => null,
  hasArticleSynthedToday: async () => false,
  claimArticleSynthLock: async () => true,
  releaseArticleSynthLock: async () => {},
  markArticleSynthedToday: async () => {},
  setArticleAudio: async () => {},
}));
mock.module("@/lib/ntfy", () => ({
  notify: async (title: string, _body: string, priority?: string) => {
    notifications.push({ title, priority });
  },
}));

process.env.SUB_HARD_CAP = "30";

const { POST } = await import("./route");

const post = (outTradeNo: string) =>
  POST(
    new Request("http://x/api/afdian/webhook", {
      method: "POST",
      body: JSON.stringify({ data: { order: { out_trade_no: outTradeNo } } }),
    }),
  );

afterEach(() => {
  queriedOrder = null;
  claimed = new Set();
  subsById = new Map();
  updatedPatches = [];
  subCount = 0;
  hardCap = 30;
  pendingPushed = [];
  notifications = [];
  createdSubs = [];
  demoVoiceByHex = new Map();
});

describe("重复 webhook 幂等 (防止同一笔支付被续两次)", () => {
  test("同一 out_trade_no 重推第二次 → 不再二次延长到期日", async () => {
    // matchSubscriber 靠 remark 里的 16-hex 命中订户 id, 故用真实 16 位 hex id
    subsById.set("abcdef0123456789", mkSub({ id: "abcdef0123456789", expiresAt: "2026-06-01" }));
    queriedOrder = {
      outTradeNo: "order-1", status: "paid", totalAmount: "30", months: 1,
      planTitle: "连载", remark: "abcdef0123456789", payerUserId: "afd-u1",
    };

    const res1 = await post("order-1");
    expect(res1.status).toBe(200);
    expect(updatedPatches).toHaveLength(1);
    const afterFirst = subsById.get("abcdef0123456789")!.expiresAt;

    // 爱发电对同一订单重推 (webhook 无签名保证, 是常见现象)
    const res2 = await post("order-1");
    expect(res2.status).toBe(200);
    expect(updatedPatches).toHaveLength(1); // 关键: 没有第二次 updateSubscriber 调用
    expect(subsById.get("abcdef0123456789")!.expiresAt).toBe(afterFirst); // 到期日未被二次推
  });
});

describe("续费顺延精确性 (防止吞掉已付费的剩余天数)", () => {
  test("尚未到期时续费 → 从当前到期日顺延, 不是从今天重算", async () => {
    // 当前到期日设为「未来 10 天」, 若 bug 把 base 错当「今天」, 会把这 10 天白白吞掉
    const future = new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 10);
    subsById.set("abcdef0123456789", mkSub({ id: "abcdef0123456789", expiresAt: future }));
    queriedOrder = {
      outTradeNo: "order-2", status: "paid", totalAmount: "30", months: 1,
      planTitle: "连载", remark: "abcdef0123456789", payerUserId: "afd-u2",
    };
    await post("order-2");
    const newExpiry = subsById.get("abcdef0123456789")!.expiresAt;
    const expectedFloor = new Date(new Date(future).getTime() + 25 * 86400_000)
      .toISOString().slice(0, 10); // 顺延应 ≈ future+30d, 给 5 天容差防跨时区/取整抖动
    expect(new Date(newExpiry) > new Date(expectedFloor)).toBe(true);
  });
});

describe("容量到帽 (防止已付款客户被静默丢单或超卖)", () => {
  test("新客户付款但订户数已达上限 → 转人工 pending+高优响铃, 不静默建档", async () => {
    subCount = 30; // == SUB_HARD_CAP
    queriedOrder = {
      outTradeNo: "order-3", status: "paid", totalAmount: "30", months: 1,
      planTitle: "试听转正", remark: "deadbeef01234567", payerUserId: "afd-u3",
    };
    // matchSubscriber: remark 里的 16-hex 匹配不到订户但匹配到 demo → 走 demoVoiceId 分支
    demoVoiceByHex.set("deadbeef01234567", "voice-cloned-01");

    const res = await post("order-3");
    expect(res.status).toBe(200);
    expect(createdSubs).toHaveLength(0); // 关键: 没有静默建档
    expect(pendingPushed).toHaveLength(1);
    expect(pendingPushed[0].capReached).toBe(true);
    expect(notifications.some((n) => n.priority === "high" && n.title.includes("容量上限"))).toBe(true);
  });
});
