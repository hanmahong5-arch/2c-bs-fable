/**
 * afdian.ts — 爱发电开放 API adapter。
 *
 * 安全模型: webhook body 无可靠签名 → **webhook 只当门铃**,
 * 订单真相一律用开放 API query-order 回查验真 (md5 参数签名)。
 * NormalizedOrder 是支付 adapter 的统一形状 (Stage C 加微信支付 = 平行 adapter)。
 */
import { createHash } from "node:crypto";

const API_BASE = "https://afdian.com/api/open";

/** 各支付渠道归一化后的订单形状。 */
export interface NormalizedOrder {
  outTradeNo: string;
  status: "paid" | "other";
  totalAmount: string; // 元
  months: number;
  planTitle: string;
  remark: string;
  payerUserId: string; // 渠道侧用户 id (爱发电 user_id)
}

interface AfdianOrderRaw {
  out_trade_no: string;
  status: number; // 2 = 交易成功
  total_amount: string;
  month: number;
  plan_title?: string;
  remark?: string;
  user_id: string;
}

function sign(token: string, userId: string, paramsJson: string, ts: number): string {
  // 官方签名: md5(token + "params" + params + "ts" + ts + "user_id" + user_id)
  return createHash("md5")
    .update(`${token}params${paramsJson}ts${ts}user_id${userId}`)
    .digest("hex");
}

async function call(path: string, params: Record<string, unknown>): Promise<unknown> {
  const userId = process.env.AFDIAN_USER_ID;
  const token = process.env.AFDIAN_API_TOKEN;
  if (!userId || !token) throw new Error("AFDIAN_USER_ID / AFDIAN_API_TOKEN missing");
  const paramsJson = JSON.stringify(params);
  const ts = Math.floor(Date.now() / 1000);
  const res = await fetch(`${API_BASE}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: userId, params: paramsJson, ts, sign: sign(token, userId, paramsJson, ts) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`afdian ${path} http ${res.status}`);
  const data = (await res.json()) as { ec: number; em: string; data?: unknown };
  if (data.ec !== 200) throw new Error(`afdian ${path} ec=${data.ec}: ${data.em}`);
  return data.data;
}

/** 回查验真: 以开放 API 返回为唯一事实, 查不到 → null (webhook 伪造/未支付)。 */
export async function queryOrder(outTradeNo: string): Promise<NormalizedOrder | null> {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(outTradeNo)) return null;
  const data = (await call("query-order", { out_trade_no: outTradeNo })) as {
    list?: AfdianOrderRaw[];
  };
  const raw = data.list?.find((o) => o.out_trade_no === outTradeNo);
  if (!raw) return null;
  return {
    outTradeNo: raw.out_trade_no,
    status: raw.status === 2 ? "paid" : "other",
    totalAmount: raw.total_amount,
    months: Math.max(1, Number(raw.month) || 1),
    planTitle: raw.plan_title ?? "",
    remark: raw.remark ?? "",
    payerUserId: raw.user_id,
  };
}
