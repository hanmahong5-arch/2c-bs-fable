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
import { DEMO_TTL_SECONDS, FUNNEL_TTL_SECONDS } from "./constants";
import { requireEnvAny } from "./env";

let _redis: Redis | null = null;

function redis(): Redis {
  if (_redis) return _redis;
  // 懒求值 + fast-fail 三要素 (见 env.ts); 缺 KV 配置时清晰报错而非中途 undefined。
  const url = requireEnvAny("KV_REST_API_URL", "UPSTASH_REDIS_REST_URL");
  const token = requireEnvAny("KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_TOKEN");
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
  pendingNote: string; // 家长「捎给工坊」的孩子近况; 单字段覆盖写=每晚最多一条, 管线消费后清空
  createdAt: string;
}

export interface StoryRecord {
  date: string; // YYYY-MM-DD
  title: string;
  paragraphs: string; // JSON string[]
  moral: string;
  audioUrl: string; // 空=当晚缺更或已过 14 天滚动
  starred: string; // "1"=孩子点亮过星星
  listened: string; // "1"=当晚触达 (播放/点星/捎话/zip 任一信号)
  note: string; // 本篇实际织入的家长捎话原文 (页面徽章用)
  createdAt: string;
}

const SUB_FIELDS: (keyof Subscriber)[] = [
  "id", "childName", "age", "prefs", "weeklyTheme", "voiceId", "token",
  "audioKey", "status", "expiresAt", "afdianUserId", "contact", "serialState",
  "pendingNote", "createdAt",
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
    pendingNote: "",
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

/** sub:* 键计数 (容量护栏用: 不水合详情, 比 listAllSubscribers 轻)。 */
export async function countSubscribers(): Promise<number> {
  const r = redis();
  let n = 0;
  let cursor = "0";
  do {
    const [next, keys] = await r.scan(cursor, { match: "sub:*", count: 100 });
    cursor = String(next);
    n += keys.length;
  } while (cursor !== "0");
  return n;
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
  "date", "title", "paragraphs", "moral", "audioUrl", "starred", "listened", "note", "createdAt",
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

/** 触达置位 (幂等): 播放/点星/捎话/zip 任一信号都算「这晚到达了孩子」。故事不存在则 no-op, 不留孤儿键。 */
export async function markStoryListened(subId: string, date: string): Promise<void> {
  const key = `story:${subId}:${date}`;
  const title = await redis().hget(key, "title");
  if (!title) return;
  await redis().hset(key, { listened: "1" });
}

// ── 捎话 (家长→工坊单向信道) ──

export async function setPendingNote(id: string, note: string): Promise<void> {
  await redis().hset(`sub:${id}`, { pendingNote: note });
}

/** 管线 putStory 成功后才调用 — 失败时 note 留给 2h retry 捞起。 */
export async function clearPendingNote(id: string): Promise<void> {
  await redis().hset(`sub:${id}`, { pendingNote: "" });
}

export async function countStarred(subId: string): Promise<number> {
  const stories = await listStories(subId, 400);
  return stories.filter((s) => s.starred === "1").length;
}

// ── demo 音色复用 (试听 → 订阅) ──

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

/** 回滚防薅槽: claimTrialSlot 之后的步骤失败时调用, 让这段 demo / 联系方式可重试 (否则槽被烧却没建出 sub)。 */
export async function releaseTrialSlot(key: string): Promise<void> {
  await redis().del(`trial:${key}`);
}

export async function countActiveTrials(): Promise<number> {
  const subs = await listActiveSubscribers();
  return subs.filter((s) => s.status === "trial").length;
}

// ── 即时首晚生成 (instant-first) ──

/**
 * 并发闸: 同一订户同时只允许一个即时生成在跑。
 * 成功路径靠 10 分钟 TTL 自然过期; 失败路径必须 releaseInstantSlot 释放, 否则用户要干等 10 分钟。
 */
export async function claimInstantSlot(subId: string): Promise<boolean> {
  const ok = await redis().set(`instant:${subId}`, "1", { nx: true, ex: 600 });
  return ok === "OK";
}

export async function releaseInstantSlot(subId: string): Promise<void> {
  await redis().del(`instant:${subId}`);
}

// ── 文章亲声朗读 (用我的声音念这篇) ──

/**
 * 文章亲声朗读防滥用: in-flight 锁 (EX 600) 防并发 + 每日「已成功」标记 (合成成功才落)。
 * 关键 (七期观测揪出的修正): 配额标记落在成功后 — 函数被 300s maxDuration 截杀时
 * in-flight 锁 ≤10min 自过期、配额不被吞, 用户当天可重试。
 * (旧版 claim-before 在 GPU 争用 timeout 下白吞配额且当天不可重试。)
 */
export async function claimArticleSynthLock(subId: string): Promise<boolean> {
  const ok = await redis().set(`asynth-lock:${subId}`, "1", { nx: true, ex: 600 });
  return ok === "OK";
}

export async function releaseArticleSynthLock(subId: string): Promise<void> {
  await redis().del(`asynth-lock:${subId}`);
}

export async function hasArticleSynthedToday(subId: string, date: string): Promise<boolean> {
  return (await redis().exists(`asynth-done:${subId}:${date}`)) === 1;
}

/** 合成成功后才调用 — 当日配额从此消耗。 */
export async function markArticleSynthedToday(subId: string, date: string): Promise<void> {
  await redis().set(`asynth-done:${subId}:${date}`, "1", { ex: 2 * 86400 });
}

export interface ArticleAudio {
  slug: string;
  category: string;
  title: string;
  url: string;
  createdAt: string; // ISO
}

/** 记录一篇已用订户音色念过的文章 (hash asynth:<subId>, field=slug)。 */
export async function setArticleAudio(subId: string, entry: ArticleAudio): Promise<void> {
  await redis().hset(`asynth:${subId}`, { [entry.slug]: JSON.stringify(entry) });
}

export async function getArticleAudio(subId: string, slug: string): Promise<ArticleAudio | null> {
  const raw = await redis().hget(`asynth:${subId}`, slug);
  if (!raw) return null;
  try {
    return (typeof raw === "string" ? JSON.parse(raw) : raw) as ArticleAudio;
  } catch {
    return null;
  }
}

/** 该订户念过的全部文章, 新→旧。 */
export async function listArticleAudios(subId: string): Promise<ArticleAudio[]> {
  const h = await redis().hgetall(`asynth:${subId}`);
  if (!h) return [];
  const out: ArticleAudio[] = [];
  for (const raw of Object.values(h)) {
    try {
      out.push((typeof raw === "string" ? JSON.parse(raw) : raw) as ArticleAudio);
    } catch {
      // 坏行跳过
    }
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// ── 漏斗观测 (funnel telemetry) ──

/**
 * 即时漏斗逐日计数 (instant-first / 文章亲声朗读的 开始·成功·降级·失败)。
 * instant-first 实测 224s 贴 300s 上限 → 生产里到底有多少户从「即时音频」悄悄退化成
 * 「即时文字」, 靠这组计数才可见; 管线 06:00 读昨日值进 ntfy 摘要。
 * started 是盲区探针: 风险合成「前」先计 started, 成功计 ok/text/fail;
 * started − ok − text − fail (instant) / started − ok − fail (asynth) = 被 300s 硬截杀、
 * 连 catch 都没跑到的次数 — 不需后台扫描任务即可测出这块盲区。
 */
export type FunnelEvent =
  | "instant_started" // 第一晚: 已领锁、即将生成 (盲区分母)
  | "instant_ok" // 第一晚: 文本+音频齐
  | "instant_text" // 第一晚: 仅文本 (音频超时/失败, R5 2h 补跑兜底) — 降级非故障
  | "instant_fail" // 第一晚: 文本都没写成 (空夜) — 高优先级告警
  | "asynth_started" // 文章亲声: 已领锁、即将合成 (盲区分母)
  | "asynth_ok" // 文章亲声: 合成成功
  | "asynth_fail"; // 文章亲声: 合成失败

const FUNNEL_EVENTS: FunnelEvent[] = [
  "instant_started", "instant_ok", "instant_text", "instant_fail",
  "asynth_started", "asynth_ok", "asynth_fail",
];

export async function bumpFunnel(date: string, event: FunnelEvent): Promise<void> {
  const r = redis();
  const key = `funnel:${date}`;
  await r.hincrby(key, event, 1);
  await r.expire(key, FUNNEL_TTL_SECONDS);
}

export async function getFunnel(date: string): Promise<Record<FunnelEvent, number>> {
  const h = await redis().hgetall(`funnel:${date}`);
  const out = {} as Record<FunnelEvent, number>;
  for (const e of FUNNEL_EVENTS) out[e] = h ? Number(h[e] ?? 0) || 0 : 0;
  return out;
}

// ── 管线摘要 + 全量备份 ──

export async function setPipelineSummary(date: string, summary: Record<string, string>): Promise<void> {
  await redis().hset(`pipeline:${date}`, summary);
}

/** 当日管线运行摘要; 无 ranAt (那天一次都没跑成) 返回 null。Vercel heartbeat 据此判活。 */
export async function getPipelineSummary(date: string): Promise<Record<string, string> | null> {
  const h = await redis().hgetall(`pipeline:${date}`);
  if (!h || !h.ranAt) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) out[k] = str(v);
  return out;
}

/** 全量 dump (admin/备份用): 所有订户 + 各自故事。 */
export async function dumpAll(): Promise<Record<string, unknown>> {
  const subs = await listAllSubscribers();
  const stories: Record<string, StoryRecord[]> = {};
  for (const s of subs) stories[s.id] = await listStories(s.id, 400);
  return { dumpedAt: new Date().toISOString(), subscribers: subs, stories };
}
