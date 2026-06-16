import { NextResponse } from "next/server";
import { bumpFunnel, getSubscriberByToken } from "@/lib/store";
import { bjToday } from "@/lib/beijing";

const KINDS = ["fresh", "replay", "library", "none"] as const;
type Kind = (typeof KINDS)[number];

function isKind(s: string): s is Kind {
  return (KINDS as readonly string[]).includes(s);
}

/**
 * 今晚兜底遥测 beacon (九期): token 鉴权 → bumpFunnel(funnel:<今天>, nightly_<kind>)。
 * kind ∈ fresh|replay|library|none = 孩子今晚拿到了什么; replay/library/none 占比 = 兜底率/保证率。
 * 注: 页面 force-dynamic, 按展示计数 (非按户去重) → 作比例指标解读 (沿用 /listened beacon 模式)。
 */
export async function POST(req: Request) {
  let body: { token?: string; kind?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const sub = await getSubscriberByToken(body.token ?? "");
  if (!sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const kind = body.kind ?? "";
  if (!isKind(kind)) return NextResponse.json({ error: "bad kind" }, { status: 400 });
  await bumpFunnel(bjToday(), `nightly_${kind}`);
  return NextResponse.json({ ok: true });
}
