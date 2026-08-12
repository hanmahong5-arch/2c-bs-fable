/**
 * store.test.ts — 数据访问层分支单测 (hermetic; 内存 Redis fake 替 @upstash/redis, 零网络)。
 *
 * fake 刻意复刻两个真实语义: ① set{nx} = SETNX 幂等闸; ② hgetall 对 JSON 形状值自动 parse
 * (Upstash 行为) → 验证 store 的「读出口统一 str() 归一化回字符串」契约。
 *
 * 覆盖: token 校验/失效防御 · rotateToken 旧映射清除 · active set 增删 · SETNX 幂等 ·
 *       instant/trial 槽领取释放 · funnel 计数缺省 0 · markStoryListened 缺故事 no-op ·
 *       listStories 新→旧序 · getDemoVoice 正则 · deleteSubscriber 级联清理 · str 归一化。
 */
import { beforeEach, describe, expect, test } from "bun:test";

// 环境: store.redis() 懒读 KV env — import 前注入, 避免 fast-fail。
process.env.KV_REST_API_URL = "http://fake";
process.env.KV_REST_API_TOKEN = "fake";

// ── 内存 Redis fake ──────────────────────────────────────────────
type Hash = Record<string, string>;
type ZItem = { score: number; member: string };
const db = new Map<string, unknown>();

/** 复刻 Upstash: 合法 JSON 值自动 parse (供 str() 归一化路径受测)。 */
function autoParse(v: string): unknown {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}
function glob(pat: string): RegExp {
  return new RegExp("^" + pat.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
}

class FakeRedis {
  async hset(key: string, obj: Record<string, unknown>) {
    const h = (db.get(key) as Hash) ?? {};
    for (const [k, v] of Object.entries(obj)) h[k] = String(v);
    db.set(key, h);
    return Object.keys(obj).length;
  }
  async hgetall(key: string): Promise<Record<string, unknown> | null> {
    const h = db.get(key) as Hash | undefined;
    if (!h || Object.keys(h).length === 0) return null;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(h)) out[k] = autoParse(v);
    return out;
  }
  async hget(key: string, field: string): Promise<unknown> {
    const h = db.get(key) as Hash | undefined;
    if (!h || !(field in h)) return null;
    return autoParse(h[field]);
  }
  async hincrby(key: string, field: string, n: number) {
    const h = (db.get(key) as Hash) ?? {};
    h[field] = String((Number(h[field] ?? 0) || 0) + n);
    db.set(key, h);
    return Number(h[field]);
  }
  async expire() {
    return 1;
  }
  async exists(key: string) {
    return db.has(key) ? 1 : 0;
  }
  async set(key: string, val: unknown, opts?: { nx?: boolean; ex?: number }) {
    if (opts?.nx && db.has(key)) return null;
    db.set(key, String(val));
    return "OK";
  }
  async get<T>(key: string): Promise<T | null> {
    return (db.has(key) ? (db.get(key) as T) : null);
  }
  async del(...keys: string[]) {
    let n = 0;
    for (const k of keys) if (db.delete(k)) n++;
    return n;
  }
  async sadd(key: string, member: string) {
    const s = (db.get(key) as Set<string>) ?? new Set<string>();
    const had = s.has(member);
    s.add(member);
    db.set(key, s);
    return had ? 0 : 1;
  }
  async srem(key: string, member: string) {
    const s = db.get(key) as Set<string> | undefined;
    if (!s) return 0;
    const had = s.delete(member);
    return had ? 1 : 0;
  }
  async smembers(key: string) {
    return [...((db.get(key) as Set<string>) ?? [])];
  }
  async zadd(key: string, item: ZItem) {
    const z = (db.get(key) as ZItem[]) ?? [];
    const rest = z.filter((e) => e.member !== item.member);
    rest.push(item);
    db.set(key, rest);
    return 1;
  }
  async zrange(key: string, start: number, stop: number, opts?: { rev?: boolean }) {
    const z = [...((db.get(key) as ZItem[]) ?? [])];
    z.sort((a, b) => (opts?.rev ? b.score - a.score : a.score - b.score));
    const end = stop < 0 ? z.length + stop + 1 : stop + 1;
    return z.slice(start, end).map((e) => e.member);
  }
  async scan(_cursor: string, opts: { match: string; count: number }) {
    const re = glob(opts.match);
    const keys = [...db.keys()].filter((k) => re.test(k));
    return ["0", keys];
  }
  async lpush(key: string, val: string) {
    const l = (db.get(key) as string[]) ?? [];
    l.unshift(val);
    db.set(key, l);
    return l.length;
  }
  async lrange(key: string, start: number, stop: number) {
    const l = (db.get(key) as string[]) ?? [];
    const end = stop < 0 ? l.length + stop + 1 : stop + 1;
    return l.slice(start, end);
  }
  async lrem(key: string, _count: number, val: string) {
    const l = (db.get(key) as string[]) ?? [];
    const i = l.indexOf(val);
    if (i >= 0) l.splice(i, 1);
    db.set(key, l);
    return i >= 0 ? 1 : 0;
  }
}

const { mock } = await import("bun:test");
mock.module("@upstash/redis", () => ({ Redis: FakeRedis }));

const store = await import("./store");

beforeEach(() => db.clear());

// ── 订户 CRUD + token ─────────────────────────────────────────────
describe("createSubscriber + getSubscriber round-trip", () => {
  test("trial 户: 落 sub hash + token 映射 + 进 subs:active", async () => {
    const sub = await store.createSubscriber({
      childName: "豆豆", age: "5", prefs: "恐龙", weeklyTheme: "海洋",
      voiceId: "v1", status: "trial", expiresAt: "2026-07-06",
    });
    const got = await store.getSubscriber(sub.id);
    expect(got?.childName).toBe("豆豆");
    expect(got?.token).toBe(sub.token);
    expect(await store.getSubscriberByToken(sub.token)).toMatchObject({ id: sub.id });
    expect(await store.listActiveSubscribers()).toHaveLength(1);
  });

  test("expired 户不进 active set (管线跳过)", async () => {
    await store.createSubscriber({
      childName: "点点", age: "4", prefs: "", weeklyTheme: "", voiceId: "",
      status: "expired", expiresAt: "2026-01-01",
    });
    expect(await store.listActiveSubscribers()).toHaveLength(0);
  });
});

/**
 * 制造「畸形 token 竟真映射到某户、且 sub.token 也等于它」的极端态:
 * 此时 getSubscriberByToken 的 sub.token 复核会放行 → 唯有格式闸能拦下,
 * 断言才真打在「格式闸不落 get」这条契约上 (否则空库下 null 是 get miss 蒙的, vacuous)。
 */
async function poisonToken(badToken: string): Promise<void> {
  const sub = await store.createSubscriber({
    childName: "毒", age: "3", prefs: "", weeklyTheme: "", voiceId: "",
    status: "trial", expiresAt: "2026-07-06",
  });
  const r = new FakeRedis();
  await r.set(`token:${badToken}`, sub.id);
  await r.hset(`sub:${sub.id}`, { token: badToken });
}

describe("getSubscriberByToken 防御", () => {
  test("空 token → null (格式闸拦下, 不落 get)", async () => {
    await poisonToken("");
    expect(await store.getSubscriberByToken("")).toBeNull();
  });
  test("非法字符 → null (格式闸拦下)", async () => {
    await poisonToken("bad token!");
    expect(await store.getSubscriberByToken("bad token!")).toBeNull();
  });
  test("超长 (>64) → null", async () => {
    const long = "a".repeat(65);
    await poisonToken(long);
    expect(await store.getSubscriberByToken(long)).toBeNull();
  });
  test("token 映射存在但 sub.token 已变 (轮换后残留) → null", async () => {
    const sub = await store.createSubscriber({
      childName: "旧", age: "3", prefs: "", weeklyTheme: "", voiceId: "",
      status: "trial", expiresAt: "2026-07-06",
    });
    // 手工制造脏映射: 让旧 token 仍指向 id, 但 sub.token 已换新
    const stale = "staletoken123";
    await new FakeRedis().set(`token:${stale}`, sub.id);
    expect(await store.getSubscriberByToken(stale)).toBeNull();
  });
});

describe("rotateToken", () => {
  test("新 token 生效, 旧映射删除", async () => {
    const sub = await store.createSubscriber({
      childName: "转", age: "6", prefs: "", weeklyTheme: "", voiceId: "",
      status: "trial", expiresAt: "2026-07-06",
    });
    const old = sub.token;
    const next = await store.rotateToken(sub.id);
    expect(next).not.toBe(old);
    expect(await store.getSubscriberByToken(next)).toMatchObject({ id: sub.id });
    expect(await store.getSubscriberByToken(old)).toBeNull(); // 旧链接失效
    // 旧映射真从存储层删除 (直查, 不靠 sub.token 复核挡下 → 防孤儿键堆积)
    expect(await new FakeRedis().get(`token:${old}`)).toBeNull();
  });
  test("不存在的 id → 抛错", async () => {
    expect(store.rotateToken("nope")).rejects.toThrow();
  });
});

describe("updateSubscriber active set 迁移", () => {
  test("active→expired 移出 active set", async () => {
    const sub = await store.createSubscriber({
      childName: "移", age: "5", prefs: "", weeklyTheme: "", voiceId: "",
      status: "active", expiresAt: "2026-12-31",
    });
    expect(await store.listActiveSubscribers()).toHaveLength(1);
    await store.updateSubscriber(sub.id, { status: "expired" });
    expect(await store.listActiveSubscribers()).toHaveLength(0);
  });
  test("空 patch → no-op (不抛)", async () => {
    const sub = await store.createSubscriber({
      childName: "空", age: "5", prefs: "", weeklyTheme: "", voiceId: "",
      status: "trial", expiresAt: "2026-07-06",
    });
    await store.updateSubscriber(sub.id, {});
    expect((await store.getSubscriber(sub.id))?.childName).toBe("空");
  });
});

describe("deleteSubscriber 级联清理", () => {
  test("token 映射 + 故事 + 档案 + active 成员全清", async () => {
    const sub = await store.createSubscriber({
      childName: "删", age: "5", prefs: "", weeklyTheme: "", voiceId: "",
      status: "trial", expiresAt: "2026-07-06",
    });
    await store.putStory(sub.id, {
      date: "2026-07-01", title: "篇一", paragraphs: "[]", moral: "", audioUrl: "",
      starred: "", listened: "", note: "", createdAt: "",
    });
    await store.deleteSubscriber(sub.id);
    expect(await store.getSubscriber(sub.id)).toBeNull();
    expect(await store.getSubscriberByToken(sub.token)).toBeNull();
    expect(await store.getStory(sub.id, "2026-07-01")).toBeNull();
    expect(await store.listActiveSubscribers()).toHaveLength(0);
  });
});

// ── SETNX 幂等闸 ─────────────────────────────────────────────────
describe("claimOrder (SETNX 幂等)", () => {
  test("首见 true, 重复 false", async () => {
    expect(await store.claimOrder("no-1", "sub1")).toBe(true);
    expect(await store.claimOrder("no-1", "sub1")).toBe(false);
    expect(await store.claimOrder("no-2", "sub1")).toBe(true);
  });
});

describe("claimTrialSlot / releaseTrialSlot", () => {
  test("首次 true, 再次 false; 释放后可重领", async () => {
    expect(await store.claimTrialSlot("demo:x")).toBe(true);
    expect(await store.claimTrialSlot("demo:x")).toBe(false);
    await store.releaseTrialSlot("demo:x");
    expect(await store.claimTrialSlot("demo:x")).toBe(true);
  });
});

describe("claimInstantSlot / releaseInstantSlot", () => {
  test("同户并发只一个领到; 释放后可重领", async () => {
    expect(await store.claimInstantSlot("sub1")).toBe(true);
    expect(await store.claimInstantSlot("sub1")).toBe(false);
    await store.releaseInstantSlot("sub1");
    expect(await store.claimInstantSlot("sub1")).toBe(true);
  });
});

// ── 故事 ─────────────────────────────────────────────────────────
describe("putStory / listStories 排序", () => {
  test("listStories 新→旧 (score=yyyymmdd rev)", async () => {
    const mk = (d: string) => ({
      date: d, title: `T${d}`, paragraphs: "[]", moral: "", audioUrl: "u",
      starred: "", listened: "", note: "", createdAt: "",
    });
    await store.putStory("s1", mk("2026-07-01"));
    await store.putStory("s1", mk("2026-07-03"));
    await store.putStory("s1", mk("2026-07-02"));
    const list = await store.listStories("s1");
    expect(list.map((s) => s.date)).toEqual(["2026-07-03", "2026-07-02", "2026-07-01"]);
  });

  test("getStory 归一化: paragraphs JSON 数组读回仍为 JSON 字符串 (str 契约)", async () => {
    await store.putStory("s2", {
      date: "2026-07-01", title: "篇", paragraphs: JSON.stringify(["甲", "乙"]),
      moral: "寓", audioUrl: "", starred: "", listened: "", note: "", createdAt: "",
    });
    const got = await store.getStory("s2", "2026-07-01");
    // hgetall 把 '["甲","乙"]' auto-parse 成数组, str() 再 stringify 回字符串
    expect(got?.paragraphs).toBe('["甲","乙"]');
    expect(JSON.parse(got!.paragraphs)).toEqual(["甲", "乙"]);
  });
});

describe("markStoryListened 幂等 no-op", () => {
  test("故事不存在 → 不建孤儿键", async () => {
    await store.markStoryListened("sX", "2026-07-01");
    expect(await store.getStory("sX", "2026-07-01")).toBeNull();
  });
  test("故事存在 → listened 置 1", async () => {
    await store.putStory("sY", {
      date: "2026-07-01", title: "篇", paragraphs: "[]", moral: "", audioUrl: "",
      starred: "", listened: "", note: "", createdAt: "",
    });
    await store.markStoryListened("sY", "2026-07-01");
    expect((await store.getStory("sY", "2026-07-01"))?.listened).toBe("1");
  });
});

// ── demo 音色正则 ─────────────────────────────────────────────────
describe("getDemoVoice 正则闸", () => {
  test("非 16 位 hex → null (格式闸拦下, 不落 get)", async () => {
    // 即便畸形 id 竟真存了值, 正则闸也须在 get 前拦下 (否则空库下 null 是 miss 蒙的)
    const r = new FakeRedis();
    await r.set("demo:nothex", "leaked1");
    await r.set("demo:abcdef", "leaked2");
    expect(await store.getDemoVoice("nothex")).toBeNull();
    expect(await store.getDemoVoice("abcdef")).toBeNull();
  });
  test("合法 16 位 hex → 命中已存音色", async () => {
    const id = "0123456789abcdef";
    await store.rememberDemoVoice(id, "voice-9");
    expect(await store.getDemoVoice(id)).toBe("voice-9");
  });
});

// ── 漏斗计数 ─────────────────────────────────────────────────────
describe("bumpFunnel / getFunnel", () => {
  test("计数累加, 未触发事件回 0", async () => {
    await store.bumpFunnel("2026-07-01", "nightly_fresh");
    await store.bumpFunnel("2026-07-01", "nightly_fresh");
    await store.bumpFunnel("2026-07-01", "nightly_replay");
    const f = await store.getFunnel("2026-07-01");
    expect(f.nightly_fresh).toBe(2);
    expect(f.nightly_replay).toBe(1);
    expect(f.nightly_none).toBe(0);
    expect(f.instant_ok).toBe(0);
  });
  test("无任何计数的日期 → 全 0", async () => {
    const f = await store.getFunnel("2099-01-01");
    expect(f.instant_started).toBe(0);
    expect(f.nightly_fresh).toBe(0);
  });
});

describe("countActiveTrials", () => {
  test("只数 active set 里 status=trial 的", async () => {
    await store.createSubscriber({
      childName: "T1", age: "5", prefs: "", weeklyTheme: "", voiceId: "",
      status: "trial", expiresAt: "2026-07-06",
    });
    await store.createSubscriber({
      childName: "T2", age: "5", prefs: "", weeklyTheme: "", voiceId: "",
      status: "trial", expiresAt: "2026-07-06",
    });
    await store.createSubscriber({
      childName: "A1", age: "5", prefs: "", weeklyTheme: "", voiceId: "",
      status: "active", expiresAt: "2026-12-31",
    });
    expect(await store.countActiveTrials()).toBe(2);
  });
});
