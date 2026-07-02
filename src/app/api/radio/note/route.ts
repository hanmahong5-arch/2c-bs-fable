import { getSubscriberByToken, setPendingNote, markStoryListened } from "@/lib/store";
import { bjToday, parseSerialState } from "@/lib/beijing";
import { clean, fail, ok, readJson } from "@/lib/api";
import { MAX_NOTE, TRIAL_NIGHTS } from "@/lib/constants";

/**
 * 「给工坊捎句话」: 家长捎孩子今天的近况, 明晚故事织入。
 * 单字段覆盖写 = 天然限流 (每晚最多一条生效, 可重复修改直到次日 06:00 管线消费)。
 */
export async function POST(req: Request) {
  const body = await readJson<{ token?: string; note?: string }>(req);
  if (!body) return fail(400, "invalid json");

  const sub = await getSubscriberByToken(body.token ?? "");
  if (!sub) return fail(401, "unauthorized");
  if (sub.status === "expired" || sub.status === "refunded") {
    // reason 机读标记: App 据此区分「连载暂停需续订」与 401 token 失效, 文案不变
    return fail(403, "连载已暂停，续订后就能继续捎话啦。", { reason: "suspended" });
  }

  const note = clean(body.note);
  if (!note) return fail(400, "想捎的话不能为空。");
  if (note.length > MAX_NOTE) {
    return fail(400, `捎话最多 ${MAX_NOTE} 个字，挑最想让故事记住的那件事。`);
  }

  await setPendingNote(sub.id, note);
  // 捎话本身就是触达信号: 今晚故事 (若已生成) 置位 listened
  await markStoryListened(sub.id, bjToday());

  // trial 第 3 晚后 note 照存但不承诺「明晚见」(付费转正后第一晚消费), 前端据此换文案
  const trialDone = sub.status === "trial" && (parseSerialState(sub.serialState).nights ?? 0) >= TRIAL_NIGHTS;
  return ok({ ok: true, trialDone });
}
