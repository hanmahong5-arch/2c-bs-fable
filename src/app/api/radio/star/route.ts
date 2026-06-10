import { NextResponse } from "next/server";
import { getSubscriberByToken, getStory, starStory } from "@/lib/store";

/** 孩子听完点亮星星 (token 鉴权; 只能点自己已存在的故事)。 */
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
  const story = await getStory(sub.id, date);
  if (!story) return NextResponse.json({ error: "story not found" }, { status: 404 });
  await starStory(sub.id, date);
  return NextResponse.json({ ok: true });
}
