import { NextResponse } from "next/server";
import { queryOrder, type NormalizedOrder } from "@/lib/payments/afdian";
import {
  claimOrder,
  createSubscriber,
  getDemoVoice,
  getSubscriber,
  getSubscriberByToken,
  pushPendingOrder,
  updateSubscriber,
  type Subscriber,
} from "@/lib/store";
import { notify } from "@/lib/ntfy";

export const maxDuration = 30;

/**
 * 爱发电 webhook: 门铃模型。
 * body 不可信 → 只取 out_trade_no → 开放 API 回查验真 → SETNX 幂等 →
 * remark 匹配订户/试听自动开通; 匹配失败进 pending-orders + ntfy 响铃。
 * 永远回 {ec:200} (否则爱发电反复重推)。
 */

const OK = NextResponse.json({ ec: 200, em: "" });

/** remark → 订户: 家庭码(16hex sub.id) > 电台链接 token(32 base64url) > demoId(16hex)。 */
async function matchSubscriber(remark: string): Promise<{ sub: Subscriber | null; demoVoiceId: string }> {
  const tokenMatch = remark.match(/radio\/([A-Za-z0-9_-]{20,40})/);
  if (tokenMatch) {
    const sub = await getSubscriberByToken(tokenMatch[1]);
    if (sub) return { sub, demoVoiceId: "" };
  }
  for (const hex of remark.match(/[a-f0-9]{16}/g) ?? []) {
    const sub = await getSubscriber(hex);
    if (sub) return { sub, demoVoiceId: "" };
    const voiceId = await getDemoVoice(hex);
    if (voiceId) return { sub: null, demoVoiceId: voiceId };
  }
  return { sub: null, demoVoiceId: "" };
}

function extendedExpiry(current: string, months: number): string {
  const base = current && new Date(current) > new Date() ? new Date(current) : new Date();
  return new Date(base.getTime() + months * 30 * 86400_000).toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  let outTradeNo = "";
  try {
    const body = (await req.json()) as {
      data?: { order?: { out_trade_no?: string } };
    };
    outTradeNo = String(body.data?.order?.out_trade_no ?? "");
  } catch {
    return OK;
  }
  if (!outTradeNo) return OK;

  // 回查验真: webhook 字段一概不用, 以开放 API 为唯一事实
  let order: NormalizedOrder | null;
  try {
    order = await queryOrder(outTradeNo);
  } catch (e) {
    console.error("afdian query-order failed", outTradeNo, e);
    await notify("爱发电回查失败", `订单 ${outTradeNo} 回查异常，需人工核对`, "high");
    return OK;
  }
  if (!order || order.status !== "paid") return OK;

  // 幂等闸: 同单重推直接吞
  if (!(await claimOrder(order.outTradeNo, "pending"))) return OK;

  try {
    const { sub, demoVoiceId } = await matchSubscriber(order.remark);

    if (sub) {
      // trial/expired/active 统一: 转正 + 顺延
      const expiresAt = extendedExpiry(sub.expiresAt, order.months);
      await updateSubscriber(sub.id, {
        status: "active",
        expiresAt,
        afdianUserId: order.payerUserId,
      });
      await notify(
        "🎉 连载开通",
        `${sub.childName || sub.id} ¥${order.totalAmount} ${order.planTitle}，至 ${expiresAt}`,
      );
      return OK;
    }

    if (demoVoiceId) {
      // 只有试听没开 trial 的直接付费: 建档 (孩子信息缺, owner 补)
      const newSub = await createSubscriber({
        childName: "",
        age: "",
        prefs: "",
        weeklyTheme: "",
        voiceId: demoVoiceId,
        status: "active",
        expiresAt: extendedExpiry("", order.months),
        afdianUserId: order.payerUserId,
      });
      await notify(
        "🎉 新订户(待补孩子信息)",
        `订单 ${order.outTradeNo} ¥${order.totalAmount}，sub=${newSub.id}，用 admin 补 childName 后发电台链接`,
        "high",
      );
      return OK;
    }

    // 匹配失败: 进 pending + 响铃, owner bind-order 一单一次
    await pushPendingOrder({ ...order, receivedAt: new Date().toISOString() });
    await notify(
      "⚠️ 订单待手工绑定",
      `¥${order.totalAmount} ${order.planTitle} remark="${order.remark.slice(0, 60)}"，admin pending-orders 查看`,
      "high",
    );
  } catch (e) {
    console.error("afdian webhook processing failed", outTradeNo, e);
    await notify("爱发电处理异常", `订单 ${outTradeNo}: ${(e as Error).message}`, "high");
  }
  return OK;
}
