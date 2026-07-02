import { NextResponse } from "next/server";
import { getSubscriberByToken, updateSubscriber, type Subscriber } from "@/lib/store";
import { parseSerialState } from "@/lib/beijing";
import { clean, fail, ok, readJson } from "@/lib/api";
import { MAX_CHILD_NAME, MAX_PREFS, MAX_WEEKLY_THEME } from "@/lib/constants";

/**
 * /api/radio/subscriber — 家长自助管理孩子档案 (无需找客服)。
 *   GET  ?token=  回读脱敏档案 (禁泄 voiceId/token/afdianUserId/contact)
 *   POST {token, childName?, age?, prefs?, weeklyTheme?}  仅白名单 4 字段可 patch
 *
 * 白名单外字段 (token/voiceId/status/audioKey/afdianUserId/contact/serialState…) 一律不可写:
 * 自助面只碰「孩子近况」类内容, 身份/状态/存储键归系统所有, 防越权改。
 */

/** 暂停态 (过期/退款): 前端据 reason 引导续订, 与「token 无效」401 区分。 */
const REASON_SUSPENDED = "suspended";

/** 暂停态统一 403 (响应体含 reason, 前端换续订引导文案)。 */
function suspended(): NextResponse {
  return NextResponse.json({ error: "连载已暂停，续订后就能继续管理档案啦。", reason: REASON_SUSPENDED }, { status: 403 });
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const sub = await getSubscriberByToken(token);
  if (!sub) return fail(401, "unauthorized");

  // 红线: 只回脱敏可见字段, 禁含 voiceId/token/afdianUserId/contact。
  const nights = parseSerialState(sub.serialState).nights ?? 0;
  return ok({
    childName: sub.childName,
    age: sub.age,
    prefs: sub.prefs,
    weeklyTheme: sub.weeklyTheme,
    status: sub.status,
    expiresAt: sub.expiresAt,
    nights,
  });
}

export async function POST(req: Request) {
  const body = await readJson<{
    token?: string;
    childName?: string;
    age?: string;
    prefs?: string;
    weeklyTheme?: string;
  }>(req);
  if (!body) return fail(400, "请求格式不对，请刷新页面重试。");

  const sub = await getSubscriberByToken(body.token ?? "");
  if (!sub) return fail(401, "unauthorized");
  if (sub.status === "expired" || sub.status === "refunded") return suspended();

  // 仅白名单 4 字段可 patch; 每个 present 字段逐一清洗 + 校验 (缺省=不改)。
  const patch: Partial<Subscriber> = {};

  if (body.childName !== undefined) {
    const childName = clean(body.childName, MAX_CHILD_NAME);
    if (!childName) return fail(400, "孩子的小名不能为空。");
    patch.childName = childName;
  }
  if (body.age !== undefined) {
    // 复用 trial 的年龄校验: 1-2 位数字。
    const age = clean(body.age, 4);
    if (!/^\d{1,2}$/.test(age)) return fail(400, "请填 0-99 的年龄。");
    patch.age = age;
  }
  if (body.prefs !== undefined) patch.prefs = clean(body.prefs, MAX_PREFS);
  if (body.weeklyTheme !== undefined) patch.weeklyTheme = clean(body.weeklyTheme, MAX_WEEKLY_THEME);

  await updateSubscriber(sub.id, patch);
  return ok({ ok: true });
}
