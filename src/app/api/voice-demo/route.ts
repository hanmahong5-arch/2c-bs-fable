import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { rememberDemoVoice } from "@/lib/store";

// 同步流全程 (上传→克隆登记→合成→存 Blob) 需要的窗口; Fluid compute 下 hobby 可到 90s
export const maxDuration = 90;

// 滥用闸门: demo 文本服务端硬编码, 永不接受客户端 text
const DEMO_TEXT =
  "宝贝，闭上眼睛，月亮已经爬上窗台啦。" +
  "今晚我用自己的声音，给你讲一个只属于我们俩的睡前故事。" +
  "小星星都听好了，故事要开始啦。做个好梦，我爱你。";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel 请求体上限 4.5MB, 留余量
const REGISTER_TIMEOUT_MS = 45_000; // R5 侧含 whisper 转写 (与合成共用串行锁)
const SYNTH_TIMEOUT_MS = 40_000;

const NEWAPI_SPEECH_URL = "https://newapi.lurus.cn/v1/audio/speech";

const ALLOWED_ORIGINS = new Set([
  "https://fable.xin",
  "https://www.fable.xin",
  "http://localhost:3000",
]);

const BUSY_MESSAGE =
  "朗读引擎这会儿正忙（可能在生成今晚的新故事），请过两分钟再试一次。";

function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return fail(403, "请从 fable.xin 页面发起试听。");
  }

  const cosyUrl = process.env.COSY_PUBLIC_URL;
  const cosyKey = process.env.COSY_API_KEY;
  const newapiKey = process.env.NEWAPI_KEY;
  if (!cosyUrl || !cosyKey || !newapiKey) {
    return fail(500, "服务暂未配置完成，请稍后再试。");
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "请求格式不对，请重新录音后提交。");
  }

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

  const demoId = randomBytes(8).toString("hex");

  // 1) 克隆样本登记 (R5 侧二次校验时长 ≤30s + whisper 转写)
  const registerForm = new FormData();
  registerForm.append("file", file);
  registerForm.append("name", `demo-${demoId}`);

  let voiceId: string;
  try {
    const res = await fetch(`${cosyUrl}/voices`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cosyKey}` },
      body: registerForm,
      signal: AbortSignal.timeout(REGISTER_TIMEOUT_MS),
    });
    if (res.status === 503) return fail(429, BUSY_MESSAGE);
    if (res.status === 400) {
      return fail(400, "这段录音无法识别，请换安静环境录 5–30 秒清晰的说话声。");
    }
    if (!res.ok) {
      console.error("voice register failed", res.status, await res.text());
      return fail(502, "声音学习失败，请稍后再试。");
    }
    const data = (await res.json()) as { voice_id?: string; prompt_text?: string };
    if (!data.voice_id) return fail(502, "声音学习失败，请稍后再试。");
    // 静音/纯噪声样本转写为空 → 合成必 409, 提前给出可操作的提示
    if (!data.prompt_text?.trim()) {
      return fail(400, "没听清这段录音里的说话声，请在安静的地方自然说几句话再试。");
    }
    voiceId = data.voice_id; // 只留在服务端, 永不返回给客户端
  } catch (e) {
    console.error("voice register error", e);
    return fail(504, BUSY_MESSAGE);
  }

  // demoId→voiceId 留底 30 天: 试听转订阅时复用音色, 失败不阻塞 demo 主流程
  try {
    await rememberDemoVoice(demoId, voiceId);
  } catch (e) {
    console.error("remember demo voice failed", e);
  }

  // 2) 用克隆音色合成固定 demo 文本 (走 newapi, 与商业路径同链路)
  let mp3: ArrayBuffer;
  try {
    const res = await fetch(NEWAPI_SPEECH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${newapiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "cosyvoice2",
        input: DEMO_TEXT,
        voice: `custom:${voiceId}`,
        response_format: "mp3",
      }),
      signal: AbortSignal.timeout(SYNTH_TIMEOUT_MS),
    });
    if (res.status === 429 || res.status === 503) return fail(429, BUSY_MESSAGE);
    if (!res.ok) {
      console.error("synth failed", res.status, await res.text());
      return fail(502, "合成失败，请稍后再试。");
    }
    mp3 = await res.arrayBuffer();
  } catch (e) {
    console.error("synth error", e);
    return fail(504, "合成超时，引擎可能正忙，请过两分钟再试。");
  }

  // 3) 存公开 Blob (demoId 随机不可枚举; 分享页零函数调用直读)
  const blob = await put(`voice-demos/${demoId}.mp3`, mp3, {
    access: "public",
    addRandomSuffix: false,
    contentType: "audio/mpeg",
  });

  return NextResponse.json({ demoId, url: blob.url });
}
