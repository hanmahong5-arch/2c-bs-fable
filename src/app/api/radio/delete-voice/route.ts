import { NextResponse } from "next/server";
import { getSubscriberByToken, updateSubscriber } from "@/lib/store";
import { deleteVoice } from "@/lib/cosy";

/**
 * 用户「一键删除我的声音」: 信任三承诺之②的落点。
 * R5 侧云端样本 + 音色即时清除; 故事文本与已生成音频保留 (音频自然 14 天滚动)。
 * 删除后管线跳过该订户 (voiceId 为空), 重新录音即可恢复。
 */
export async function POST(req: Request) {
  let body: { token?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const sub = await getSubscriberByToken(body.token ?? "");
  if (!sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (sub.voiceId) {
    try {
      await deleteVoice(sub.voiceId);
    } catch (e) {
      console.error("delete voice failed", e);
      return NextResponse.json(
        { error: "删除请求没有送达声音工坊，请稍后再试一次。" },
        { status: 502 },
      );
    }
  }
  await updateSubscriber(sub.id, { voiceId: "" });
  return NextResponse.json({ ok: true });
}
