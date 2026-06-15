/**
 * cosy.ts — R5 亲声工坊 (声音克隆服务) 客户端收口。
 *
 * voice_id 红线: 只在服务端流转, 永不返回给浏览器。
 */
import { requireEnv } from "./env";

const VOICE_ID_RE = /^[a-f0-9]{12}$/;

function cosyEnv(): { url: string; key: string } {
  // 懒求值 fast-fail (见 env.ts): 缺 COSY 配置时清晰报错三要素, 不中途用 undefined 拼 URL。
  return { url: requireEnv("COSY_PUBLIC_URL"), key: requireEnv("COSY_API_KEY") };
}

export interface RegisteredVoice {
  voiceId: string;
  promptText: string;
}

/** 登记克隆样本; 业务侧错误 (太长/解不开/静音) 抛带 status 的 Error。 */
export async function registerVoice(file: File, name: string, timeoutMs = 45_000): Promise<RegisteredVoice> {
  const { url, key } = cosyEnv();
  const form = new FormData();
  form.append("file", file);
  form.append("name", name);
  const res = await fetch(`${url}/voices`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const err = new Error(`voice register ${res.status}: ${(await res.text()).slice(0, 200)}`);
    (err as Error & { status: number }).status = res.status;
    throw err;
  }
  const data = (await res.json()) as { voice_id?: string; prompt_text?: string };
  if (!data.voice_id) throw new Error("voice register: no voice_id in response");
  return { voiceId: data.voice_id, promptText: (data.prompt_text ?? "").trim() };
}

/** 删除克隆音色 (R5 侧样本+转写即时清除); 幂等, id 非法时静默跳过。 */
export async function deleteVoice(voiceId: string): Promise<boolean> {
  if (!VOICE_ID_RE.test(voiceId)) return false;
  const { url, key } = cosyEnv();
  const res = await fetch(`${url}/voices/${voiceId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`voice delete ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return true;
}
