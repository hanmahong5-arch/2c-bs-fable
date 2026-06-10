import { NextResponse } from "next/server";
import {
  createSubscriber,
  dumpAll,
  getDemoVoice,
  getSubscriber,
  listAllSubscribers,
  listPendingOrders,
  removePendingOrder,
  rotateToken,
  updateSubscriber,
  newAudioKey,
  type SubStatus,
} from "@/lib/store";
import { deleteVoice } from "@/lib/cosy";
import { deleteRadioFolder } from "@/lib/audio-storage";

export const maxDuration = 60;

/**
 * Admin API — owner 一人运营的全部后台动作 (concierge 期主路径)。
 * 鉴权: Authorization: Bearer <ADMIN_KEY>。调用走 scripts/admin.ts CLI。
 */

type AdminBody = {
  action: string;
  subId?: string;
  demoId?: string;
  voiceId?: string;
  childName?: string;
  age?: string;
  prefs?: string;
  weeklyTheme?: string;
  contact?: string;
  status?: SubStatus;
  expiresAt?: string;
  days?: number;
  orderRaw?: string;
};

function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) return fail(500, "ADMIN_KEY not configured");
  if (req.headers.get("authorization") !== `Bearer ${adminKey}`) {
    return fail(401, "unauthorized");
  }

  let body: AdminBody;
  try {
    body = (await req.json()) as AdminBody;
  } catch {
    return fail(400, "invalid json");
  }

  try {
    switch (body.action) {
      case "create-sub": {
        if (!body.childName) return fail(400, "childName required");
        // voiceId 三选一: 直给 / 从 demoId 找回 / 留空待正式录音
        let voiceId = body.voiceId ?? "";
        if (!voiceId && body.demoId) {
          voiceId = (await getDemoVoice(body.demoId)) ?? "";
          if (!voiceId) return fail(404, `demo ${body.demoId} 的音色不存在或已过 30 天`);
        }
        const days = body.days ?? 90;
        const expiresAt =
          body.expiresAt ?? new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
        const sub = await createSubscriber({
          childName: body.childName,
          age: body.age ?? "",
          prefs: body.prefs ?? "",
          weeklyTheme: body.weeklyTheme ?? "",
          voiceId,
          status: body.status ?? "active",
          expiresAt,
          contact: body.contact ?? "",
        });
        return NextResponse.json({ sub, radioUrl: `https://fable.xin/radio/${sub.token}` });
      }
      case "extend": {
        if (!body.subId) return fail(400, "subId required");
        const sub = await getSubscriber(body.subId);
        if (!sub) return fail(404, "subscriber not found");
        const base = new Date(sub.expiresAt) > new Date() ? new Date(sub.expiresAt) : new Date();
        const expiresAt = new Date(base.getTime() + (body.days ?? 30) * 86400_000)
          .toISOString()
          .slice(0, 10);
        await updateSubscriber(body.subId, { expiresAt, status: "active" });
        return NextResponse.json({ subId: body.subId, expiresAt });
      }
      case "rotate-token": {
        if (!body.subId) return fail(400, "subId required");
        const token = await rotateToken(body.subId);
        return NextResponse.json({ subId: body.subId, radioUrl: `https://fable.xin/radio/${token}` });
      }
      case "set-voice": {
        if (!body.subId || !body.voiceId) return fail(400, "subId + voiceId required");
        await updateSubscriber(body.subId, { voiceId: body.voiceId });
        return NextResponse.json({ subId: body.subId, voiceId: body.voiceId });
      }
      case "revoke": {
        // 彻底撤销: 删 R5 音色 + 删 Blob 音频目录 + 换 audioKey + 标 expired
        if (!body.subId) return fail(400, "subId required");
        const sub = await getSubscriber(body.subId);
        if (!sub) return fail(404, "subscriber not found");
        if (sub.voiceId) await deleteVoice(sub.voiceId);
        const removed = await deleteRadioFolder(sub.audioKey);
        await updateSubscriber(body.subId, { status: "expired", voiceId: "", audioKey: newAudioKey() });
        return NextResponse.json({ subId: body.subId, audioRemoved: removed });
      }
      case "list": {
        const subs = await listAllSubscribers();
        return NextResponse.json({
          count: subs.length,
          subs: subs.map((s) => ({
            id: s.id, childName: s.childName, status: s.status, expiresAt: s.expiresAt,
            voiceId: s.voiceId ? "set" : "", contact: s.contact, createdAt: s.createdAt,
          })),
        });
      }
      case "pending-orders": {
        return NextResponse.json({ orders: await listPendingOrders() });
      }
      case "bind-order": {
        // remark 匹配失败的订单, owner 核对爱发电后台后手工绑到订户
        if (!body.subId || !body.orderRaw) return fail(400, "subId + orderRaw required");
        const sub = await getSubscriber(body.subId);
        if (!sub) return fail(404, "subscriber not found");
        await removePendingOrder(body.orderRaw);
        const days = body.days ?? 90;
        const base = new Date(sub.expiresAt) > new Date() ? new Date(sub.expiresAt) : new Date();
        const expiresAt = new Date(base.getTime() + days * 86400_000).toISOString().slice(0, 10);
        await updateSubscriber(body.subId, { status: "active", expiresAt });
        return NextResponse.json({ subId: body.subId, expiresAt });
      }
      case "dump": {
        return NextResponse.json(await dumpAll());
      }
      default:
        return fail(400, `unknown action '${body.action}'`);
    }
  } catch (e) {
    console.error("admin error", body.action, e);
    return fail(500, (e as Error).message);
  }
}
