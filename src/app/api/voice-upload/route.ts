import { getSubscriberByToken, updateSubscriber } from "@/lib/store";
import { deleteVoice, registerVoice } from "@/lib/cosy";
import { fail, ok } from "@/lib/api";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";

// 注册含 whisper 转写 (与合成共用 GPU 串行锁), 窗口同 voice-demo
export const maxDuration = 90;

// 质检字数下限: 转写太短说明样本里有效语音不足, 克隆相似度会差
const MIN_PROMPT_CHARS = 6;

/** 订户正式录音: 替换电台音色 (新声成功后才删旧声, 失败不伤现状)。 */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "请求格式不对，请重新录音后提交。");
  }

  const token = String(form.get("token") ?? "");
  const sub = await getSubscriberByToken(token);
  if (!sub) return fail(401, "链接已失效，请联系我们找回。");
  if (form.get("consent") !== "true") {
    return fail(400, "请先勾选确认：这是你本人的声音。");
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return fail(400, "没有收到录音，请重新录一段。");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return fail(413, "录音文件太大了，请控制在 30 秒以内（约 4MB）。");
  }

  let voiceId: string;
  try {
    const reg = await registerVoice(file, `sub-${sub.id}`);
    if (reg.promptText.length < MIN_PROMPT_CHARS) {
      // 质检不过: 立即清掉刚登记的样本, 不留垃圾
      await deleteVoice(reg.voiceId).catch(() => {});
      return fail(400, "这段录音里的说话声太少了，请在安静的地方自然念 15–30 秒再试。");
    }
    voiceId = reg.voiceId;
  } catch (e) {
    const status = (e as Error & { status?: number }).status;
    if (status === 400) {
      return fail(400, "这段录音无法识别，请换安静环境录 15–30 秒清晰的说话声。");
    }
    console.error("voice upload register error", e);
    return fail(503, "声音工坊这会儿正忙，请过两分钟再试。");
  }

  const oldVoiceId = sub.voiceId;
  await updateSubscriber(sub.id, { voiceId });
  if (oldVoiceId && oldVoiceId !== voiceId) {
    try {
      await deleteVoice(oldVoiceId);
    } catch (e) {
      console.error("old voice cleanup failed", oldVoiceId, e);
    }
  }
  return ok({ ok: true });
}
