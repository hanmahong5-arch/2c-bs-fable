/**
 * store.ts — 「亲声·连载」唯一数据访问层 (Upstash Redis)。
 *
 * 对外只暴露语义化函数, 不外泄 Redis 词汇; 换存储 (Stage C) 只改此文件。
 * 键空间:
 *   sub:<id>            HASH  订户档案 (见 Subscriber)
 *   token:<t>           STR   → subId (电台页访问凭证)
 *   subs:active         SET   active+trial 订户 id (管线遍历)
 *   order:<no>          STR   → subId (SETNX 幂等闸)
 *   story:<subId>:<date> HASH 单晚故事 (文本永久; 音频 14 天滚动)
 *   stories:<subId>     ZSET  score=yyyymmdd, member=date (历史索引)
 *   demo:<demoId>       STR   → voiceId (TTL 30d, 试听→订阅复用音色)
 *   trial:<key>         STR   防薅闸 (每 demoId/contact 限 1 次)
 *   pipeline:<date>     HASH  当晚管线运行摘要
 *   pending-orders      LIST  remark 匹配失败的订单 JSON, 等 owner 手工绑
 */
import { Redis } from "@upstash/redis";
import { randomBytes } from "node:crypto";

let _redis: Redis | null = null;

function redis(): Redis {
  if (_redis) return _redis;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Redis env missing: KV_REST_API_URL / KV_REST_API_TOKEN");
  _redis = new Redis({ url, token });
  return _redis;
}

export type SubStatus = "trial" | "active" | "expired" | "refunded";

export interface Subscriber {
  id: string;
  childName: string;
  age: string;
  prefs: string; // 「最近的事」/喜好, 进故事 prompt
  weeklyTheme: string;
  voiceId: string; // R5 克隆音色 id; 空=未绑定 (管线跳过)
  token: string; // 电台页访问凭证 (可轮换)
  audioKey: string; // Blob 路径前缀 radio/<audioKey>/, 与 token 解耦
  status: SubStatus;
  expiresAt: string; // ISO date; trial=第 3 晚, active=付费到期
  afdianUserId: string;
  contact: string; // 微信号/手机, owner 联络用
  serialState: string; // 连载宇宙状态 JSON (前情/角色成长/未来 7 晚预告)
  createdAt: string;
}

export interface StoryRecord {
  date: string; // YYYY-MM-DD
  title: string;
  paragraphs: string; // JSON string[]
  moral: string;
  audioUrl: string; // 空=当晚缺更或已过 14 天滚动
  starred: string; // "1"=孩子点亮过星星
  createdAt: string;
}

const SUB_FIELDS: (keyof Subscriber)[] = [
  "id", "childName", "age", "prefs", "weeklyTheme", "voiceId", "token",
  "audioKey", "status", "expiresAt", "afdianUserId", "contact", "serialState", "createdAt",
];

/**
 * Upstash 客户端读取时会把 JSON 形状的值自动 parse (paragraphs 等);
 * 本层契约是「全字符串」→ 读出口统一归一化: 非字符串 stringify 回原文。
 */
function str(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  return JSON.stringify(v);
}

function asSub(id: string, h: Record<string, unknown> | null): Subscriber | null {
  if (!h || !h.token) return null;
  const sub = { id } as Record<string, string>;
  for (const f of SUB_FIELDS) sub[f] = str(h[f]);
  sub.id = id;
  return sub as unknown as Subscriber;
}

export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export function newAudioKey(): string {
  return randomBytes(16).toString("hex");
}

// ── 订户 ──

export async function createSubscriber(
  input: Pick<Subscriber, "childName" | "age" | "prefs" | "weeklyTheme" | "voiceId" | "status" | "expiresAt"> &
    Partial<Pick<Subscriber, "contact" | "afdianUserId">>,
): Promise<Subscriber> {
  const id = randomBytes(8).toString("hex");
  const sub: Subscriber = {
    id,
    childName: input.childName,
    age: input.age,
    prefs: input.prefs,
    weeklyTheme: input.weeklyTheme,
    voiceId: input.voiceId,
    token: newToken(),
    audioKey: newAudioKey(),
    status: input.status,
    expiresAt: input.expiresAt,
    afdianUserId: input.afdianUserId ?? "",
    contact: input.contact ?? "",
    serialState: "",
    createdAt: new Date().toISOString(),
  };
  const r = redis();
  await r.hset(`sub:${id}`, sub as unknown as Record<string, string>);
  await r.set(`token:${sub.token}`, id);
  if (sub.status === "trial" || sub.status === "active") await r.sadd("subs:active", id);
  return sub;
}

export async function getSubscriber(id: string): Promise<Subscriber | null> {
  return asSub(id, await redis().hgetall(`sub:${id}`));
}

export async function getSubscriberByToken(token: string): Promise<Subscriber | null> {
  if (!token || token.length > 64 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  const id = await redis().get<string>(`token:${token}`);
  if (!id) return null;
  const sub = await getSubscriber(id);
  // token 轮换后旧映射已删, 这里防御性再校验
  return sub && sub.token === token ? sub : null;
}

export async function updateSubscriber(id: string, patch: Partial<Subscriber>): Promise<void> {
  delete patch.id;
  if (Object.keys(patch).length === 0) return;
  await redis().hset(`sub:${id}`, patch as Record<string, string>);
  if (patch.status) {
    if (patch.status === "trial" || patch.status === "active") await redis().sadd("subs:active", id);
    else await redis().srem("subs:active", id);
  }
}

export async function rotateToken(id: string): Promise<string> {
  const sub = await getSubscriber(id);
  if (!sub) throw new Error(`subscriber ${id} not found`);
  const token = newToken();
  const r = redis();
  await r.set(`token:${token}`, id);
  await r.hset(`sub:${id}`, { token });
  if (sub.token) await r.del(`token:${sub.token}`);
  return token;
}

/** 管线遍历对象: trial + active 全量。 */
export async function listActiveSubscribers(): Promise<Subscriber[]> {
  const ids = await redis().smembers("subs:active");
  const subs: Subscriber[] = [];
  for (const id of ids) {
    const s = await getSubscriber(String(id));
    if (s) subs.push(s);
  }
  return subs;
}

export async function listAllSubscribers(): Promise<Subscriber[]> {
  const r = redis();
  const subs: Subscriber[] = [];
  let cursor = "0";
  do {
    const [next, keys] = await r.scan(cursor, { match: "sub:*", count: 100 });
    cursor = String(next);
    for (const k of keys) {
      const id = String(k).slice(4);
      const s = await getSubscriber(id);
      if (s) subs.push(s);
    }
  } while (cursor !== "0");
  return subs;
}

// ── 订单 (爱发电) ──

/** SETNX 幂等闸: 首见返回 true, 重复 webhook 返回 false。 */
export async function claimOrder(outTradeNo: string, subId: string): Promise<boolean> {
  const ok = await redis().set(`order:${outTradeNo}`, subId, { nx: true });
  return ok === "OK";
}

export async function pushPendingOrder(order: Record<string, unknown>): Promise<void> {
  await redis().lpush("pending-orders", JSON.stringify(order));
}

export async function listPendingOrders(): Promise<string[]> {
  return (await redis().lrange("pending-orders", 0, 49)).map(str);
}

export async function removePendingOrder(raw: string): Promise<void> {
  await redis().lrem("pending-orders", 1, raw);
}

// ── 故事 ──

export async function putStory(subId: string, story: StoryRecord): Promise<void> {
  const r = redis();
  await r.hset(`story:${subId}:${story.date}`, story as unknown as Record<string, string>);
  await r.zadd(`stories:${subId}`, {
    score: Number(story.date.replaceAll("-", "")),
    member: story.date,
  });
}

const STORY_FIELDS: (keyof StoryRecord)[] = [
  "date", "title", "paragraphs", "moral", "audioUrl", "starred", "createdAt",
];

export async function getStory(subId: string, date: string): Promise<StoryRecord | null> {
  const h = await redis().hgetall(`story:${subId}:${date}`);
  if (!h || !h.title) return null;
  const out = {} as Record<string, string>;
  for (const f of STORY_FIELDS) out[f] = str(h[f]);
  return out as unknown as StoryRecord;
}

/** 历史列表, 新→旧。 */
export async function listStories(subId: string, limit = 60): Promise<StoryRecord[]> {
  const dates = await redis().zrange(`stories:${subId}`, 0, limit - 1, { rev: true });
  const out: StoryRecord[] = [];
  for (const d of dates) {
    const s = await getStory(subId, String(d));
    if (s) out.push(s);
  }
  return out;
}

export async function setStoryAudio(subId: string, date: string, audioUrl: string): Promise<void> {
  await redis().hset(`story:${subId}:${date}`, { audioUrl });
}

export async function starStory(subId: string, date: string): Promise<void> {
  await redis().hset(`story:${subId}:${date}`, { starred: "1" });
}

export async function countStarred(subId: string): Promise<number> {
  const stories = await listStories(subId, 400);
  return stories.filter((s) => s.starred === "1").length;
}

// ── demo 音色复用 (试听 → 订阅) ──

const DEMO_TTL_SECONDS = 30 * 24 * 3600;

export async function rememberDemoVoice(demoId: string, voiceId: string): Promise<void> {
  await redis().set(`demo:${demoId}`, voiceId, { ex: DEMO_TTL_SECONDS });
}

export async function getDemoVoice(demoId: string): Promise<string | null> {
  if (!/^[a-f0-9]{16}$/.test(demoId)) return null;
  const v = await redis().get<string>(`demo:${demoId}`);
  return v ? String(v) : null;
}

// ── 防薅闸 ──

/** 每 demoId / contact 各限 1 次 trial; 首次返回 true。 */
export async function claimTrialSlot(key: string): Promise<boolean> {
  const ok = await redis().set(`trial:${key}`, "1", { nx: true });
  return ok === "OK";
}

export async function countActiveTrials(): Promise<number> {
  const subs = await listActiveSubscribers();
  return subs.filter((s) => s.status === "trial").length;
}

// ── 管线摘要 + 全量备份 ──

export async function setPipelineSummary(date: string, summary: Record<string, string>): Promise<void> {
  await redis().hset(`pipeline:${date}`, summary);
}

/** 全量 dump (admin/备份用): 所有订户 + 各自故事。 */
export async function dumpAll(): Promise<Record<string, unknown>> {
  const subs = await listAllSubscribers();
  const stories: Record<string, StoryRecord[]> = {};
  for (const s of subs) stories[s.id] = await listStories(s.id, 400);
  return { dumpedAt: new Date().toISOString(), subscribers: subs, stories };
}
