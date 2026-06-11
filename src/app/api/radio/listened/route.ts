import { NextResponse } from "next/server";
import { getSubscriberByToken, markStoryListened } from "@/lib/store";

/** 收听触达上报 (audio onPlay): token 鉴权, 幂等置位; 故事不存在则静默 no-op。 */
export async function POST(req: Request) {
  let body: { token?: string; date?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const sub = await getSubscriberByToken(body.token ?? "");
  if (!sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const date = body.date ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "bad date" }, { status: 400 });
  }
  await markStoryListened(sub.id, date);
  return NextResponse.json({ ok: true });
}
