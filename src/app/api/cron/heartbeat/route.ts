import { NextResponse } from "next/server";
import { getPipelineSummary } from "@/lib/store";
import { bjToday } from "@/lib/beijing";
import { notify } from "@/lib/ntfy";

/**
 * 管线 dead-man's switch (Vercel Cron, 每天 09:00 北京 = 01:00 UTC)。
 *
 * R5 管线每次跑完写 pipeline:<date>.ranAt。若今天到 09:00 (06:00 + 08:00 两次都该跑过)
 * 仍无 ranAt → 管线没跑成 (大概率 R5 跨境断 Upstash/Blob, 或服务挂)。
 * 关键: R5 在跨境断时连 ntfy.sh 都发不出告警 (同被 SNI-RST), 只能静默死 journald;
 * Vercel → Upstash + ntfy 均通, 由它替 R5 发这条「它发不出的告警」。
 *
 * 职责: 只判「活没活」(liveness); 管线自身 ntfy 管「跑对没」(correctness), 不重叠。
 */
export const maxDuration = 30;

export async function GET(req: Request) {
  // Vercel cron 自动带 Authorization: Bearer <CRON_SECRET>; 设了就校验, 防外部 spam ntfy
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const today = bjToday();

  let summary: Record<string, string> | null;
  try {
    summary = await getPipelineSummary(today);
  } catch (e) {
    // Vercel 自己都读不到 Upstash = 更严重 (Upstash 故障, 非仅 R5 跨境)
    if (!dry) {
      await notify("⚠️ 心跳: Vercel 读不到 Upstash", (e as Error).message.slice(0, 200), "high");
    }
    return NextResponse.json({ ok: false, error: "upstash unreachable from vercel" });
  }

  if (summary?.ranAt) {
    return NextResponse.json({ ok: true, date: today, ranAt: summary.ranAt, summary: summary.summary ?? "" });
  }

  const msg =
    `今天(${today})到现在没有一次管线成功跑完 — 大概率 R5 跨境断(Upstash/Blob 连不上)或服务挂。` +
    `已有 trial/active 户今晚可能停更(trial 第一晚在 Vercel 跑不受影响)。` +
    `排查: ssh root@100.120.110.73 → journalctl -u fable-radio.service --since today; ` +
    `恢复后 systemctl start fable-radio.service 手动补跑(幂等)。`;
  if (!dry) {
    await notify("⚠️ 亲声管线今晨未运行", msg, "high");
  }
  return NextResponse.json({ ok: false, alerted: !dry, date: today, message: msg });
}
