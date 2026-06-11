import { NextResponse } from "next/server";
import { getSubscriberByToken, setPendingNote, markStoryListened } from "@/lib/store";
import { bjToday, parseSerialState } from "@/lib/beijing";

const MAX_NOTE = 50;
const TRIAL_NIGHTS = 3;

/** 控制字符/标记清洗 + 长度帽 (进 LLM prompt 前的第一道; 生成时另有安全自检)。 */
function clean(s: unknown): string {
  return String(s ?? "")
    .replace(/[\u0000-\u001f<>{}`]/g, "")
    .trim();
}

/**
 * 「给工坊捎句话」: 家长捎孩子今天的近况, 明晚故事织入。
 * 单字段覆盖写 = 天然限流 (每晚最多一条生效, 可重复修改直到次日 06:00 管线消费)。
 */
export async function POST(req: Request) {
  let body: { token?: string; note?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const sub = await getSubscriberByToken(body.token ?? "");
  if (!sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (sub.status === "expired" || sub.status === "refunded") {
    return NextResponse.json({ error: "连载已暂停，续订后就能继续捎话啦。" }, { status: 403 });
  }

  const note = clean(body.note);
  if (!note) return NextResponse.json({ error: "想捎的话不能为空。" }, { status: 400 });
  if (note.length > MAX_NOTE) {
    return NextResponse.json({ error: `捎话最多 ${MAX_NOTE} 个字，挑最想让故事记住的那件事。` }, { status: 400 });
  }

  await setPendingNote(sub.id, note);
  // 捎话本身就是触达信号: 今晚故事 (若已生成) 置位 listened
  await markStoryListened(sub.id, bjToday());

  // trial 第 3 晚后 note 照存但不承诺「明晚见」(付费转正后第一晚消费), 前端据此换文案
  const trialDone = sub.status === "trial" && (parseSerialState(sub.serialState).nights ?? 0) >= TRIAL_NIGHTS;
  return NextResponse.json({ ok: true, trialDone });
}
