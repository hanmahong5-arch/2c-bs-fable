import {
  claimTrialSlot,
  countActiveTrials,
  countSubscribers,
  createSubscriber,
  getDemoVoice,
  releaseTrialSlot,
} from "@/lib/store";
import { bjToday } from "@/lib/beijing";
import { clean, fail, ok, readJson } from "@/lib/api";
import { MAX_CHILD_NAME, MAX_CONTACT, MAX_PREFS, MSG_BUSY, TRIAL_NIGHTS } from "@/lib/constants";

/**
 * demo 预检 (item 15): 挂载时判定试听是否仍有效 (voiceId 未过 30 天), 表单据此不闪现过期 demo 的字段。
 * 只读不占名额; 真正开通时 POST 仍会再校验一次 (兜底)。
 */
export async function GET(req: Request) {
  const demoId = new URL(req.url).searchParams.get("demoId") ?? "";
  if (!/^[a-f0-9]{16}$/.test(demoId)) return ok({ valid: false });
  return ok({ valid: Boolean(await getDemoVoice(demoId)) });
}

/** 试听 → 3 晚免费专属连载: 创建 trial 订户, 复用 demo 音色。 */
export async function POST(req: Request) {
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return fail(400, "请求格式不对，请刷新页面重试。");

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

  // 容量护栏 (item 20): Blob 免费档 ~1GB ≈ 30 户; 到帽前显式 fail, 杜绝「第 31 户静默写失败」
  const hardCap = Number(process.env.SUB_HARD_CAP ?? "30");
  if ((await countSubscribers()) >= hardCap) {
    console.error(`[trial] SUB_HARD_CAP ${hardCap} reached — refusing new subscriber`);
    return fail(503, "内测名额已满（存储到容量上限），我们正在扩容。请邮件 marvin.uu@gmail.com 占位，扩容后第一时间为你开通。");
  }

  // 防薅②: 每 demoId / contact 各限 1 次; 后续步骤失败必须回滚已占的槽,
  // 否则槽被烧却没建出 sub —— 这段 demo / 联系方式将再也开不了 trial。
  if (!(await claimTrialSlot(`demo:${demoId}`))) {
    return fail(409, "这段试听已经开过免费连载啦，去你的电台页看看吧（链接在开通时的页面里）。");
  }
  if (contact && !(await claimTrialSlot(`contact:${contact}`))) {
    await releaseTrialSlot(`demo:${demoId}`); // contact 已被别处用 → 释放 demo, 让这段试听可换联系方式重试
    return fail(409, "这个联系方式已经开过免费连载啦。");
  }

  const expiresAt = new Date(Date.parse(`${bjToday()}T00:00:00+08:00`) + TRIAL_NIGHTS * 86400_000)
    .toISOString()
    .slice(0, 10);

  let sub;
  try {
    sub = await createSubscriber({
      childName,
      age,
      prefs,
      weeklyTheme: "",
      voiceId,
      status: "trial",
      expiresAt,
      contact,
    });
  } catch (e) {
    // 建档失败 → 回滚两个防薅槽, 让用户可重试 (否则 demo/contact 被烧死)
    await releaseTrialSlot(`demo:${demoId}`).catch(() => {});
    if (contact) await releaseTrialSlot(`contact:${contact}`).catch(() => {});
    console.error(`[trial] createSubscriber failed: ${(e as Error).message}`);
    return fail(503, MSG_BUSY);
  }

  return ok({ radioUrl: `/radio/${sub.token}` });
}
