import { NextResponse } from "next/server";
import {
  claimTrialSlot,
  countActiveTrials,
  createSubscriber,
  getDemoVoice,
} from "@/lib/store";
import { bjToday } from "@/lib/beijing";

const TRIAL_NIGHTS = 3;
const MAX_CHILD_NAME = 12;
const MAX_PREFS = 50;
const MAX_CONTACT = 40;

function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/** 控制字符/标记清洗 + 长度帽 (进 LLM prompt 前的第一道; 生成时另有安全自检)。 */
function clean(s: unknown, max: number): string {
  return String(s ?? "")
    .replace(/[\u0000-\u001f<>{}`]/g, "")
    .trim()
    .slice(0, max);
}

/** 试听 → 3 晚免费专属连载: 创建 trial 订户, 复用 demo 音色。 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail(400, "请求格式不对，请刷新页面重试。");
  }

  const demoId = clean(body.demoId, 16);
  const childName = clean(body.childName, MAX_CHILD_NAME);
  const age = clean(body.age, 4);
  const prefs = clean(body.prefs, MAX_PREFS);
  const contact = clean(body.contact, MAX_CONTACT);

  if (!/^[a-f0-9]{16}$/.test(demoId)) return fail(400, "试听信息不完整，请先录一段声音。");
  if (!childName) return fail(400, "请填孩子的小名。");
  if (!age || !/^\d{1,2}$/.test(age)) return fail(400, "请选孩子的年龄。");

  const voiceId = await getDemoVoice(demoId);
  if (!voiceId) {
    return fail(404, "这段试听的声音已过期（保留 30 天），请重新录一段再来。");
  }

  // 防薅①: 并发名额帽 (与单 GPU 夜间容量一致, env 可调)
  const cap = Number(process.env.TRIAL_CAP ?? "30");
  if ((await countActiveTrials()) >= cap) {
    return fail(429, "今晚的免费连载名额满了，工坊每晚逐户生成、容量有限，请明天再来。");
  }

  // 防薅②: 每 demoId / contact 各限 1 次
  if (!(await claimTrialSlot(`demo:${demoId}`))) {
    return fail(409, "这段试听已经开过免费连载啦，去你的电台页看看吧（链接在开通时的页面里）。");
  }
  if (contact && !(await claimTrialSlot(`contact:${contact}`))) {
    return fail(409, "这个联系方式已经开过免费连载啦。");
  }

  const expiresAt = new Date(Date.parse(`${bjToday()}T00:00:00+08:00`) + TRIAL_NIGHTS * 86400_000)
    .toISOString()
    .slice(0, 10);

  const sub = await createSubscriber({
    childName,
    age,
    prefs,
    weeklyTheme: "",
    voiceId,
    status: "trial",
    expiresAt,
    contact,
  });

  return NextResponse.json({ radioUrl: `/radio/${sub.token}` });
}
