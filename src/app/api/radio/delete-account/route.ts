import { getSubscriberByToken, deleteSubscriber } from "@/lib/store";
import { deleteVoice } from "@/lib/cosy";
import { deleteRadioFolder } from "@/lib/audio-storage";
import { fail, ok, readJson } from "@/lib/api";

/**
 * /api/radio/delete-account — DSAR 自助注销 (信任三承诺之③: 一键抹除)。
 *
 * 抹除顺序: 外部资源先于 store — 与 deleteSubscriber 契约一致
 * (store 是唯一数据层, 不触外部; 外部资源由本调用方先清)。
 *   ① R5 音色 (deleteVoice, 幂等)  ② Blob 音频目录 (deleteRadioFolder, 幂等)  ③ Redis 全态 (deleteSubscriber)
 * 外部任一步失败 → 502 且不动 store: 保证「返回成功 = 真已抹除」, 且因三步皆幂等, 重试安全。
 *
 * confirm 哨兵: App 侧 (fable_api.dart deleteAccount) 发 confirm:'DELETE',
 * 精确匹配才执行, 防误删 (与 note/subscriber 兄弟路由的 token 鉴权同一风格)。
 */
const DELETE_CONFIRM = "DELETE";

export async function POST(req: Request) {
  const body = await readJson<{ token?: string; confirm?: string }>(req);
  if (!body) return fail(400, "请求格式不对，请刷新页面重试。");

  const sub = await getSubscriberByToken(body.token ?? "");
  if (!sub) return fail(401, "unauthorized");

  if (body.confirm !== DELETE_CONFIRM) {
    return fail(400, "请确认注销操作。");
  }

  // 外部资源先清; 失败即 502 不动 store (三步皆幂等, 用户可安全重试)。
  try {
    if (sub.voiceId) await deleteVoice(sub.voiceId);
    if (sub.audioKey) await deleteRadioFolder(sub.audioKey);
  } catch (e) {
    console.error("delete-account external cleanup failed", e);
    return fail(502, "注销请求没能完成清理，请稍后再试一次。");
  }

  await deleteSubscriber(sub.id);
  return ok({ ok: true });
}
