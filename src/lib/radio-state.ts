/**
 * radio-state.ts — 电台页状态机纯核 (九期 D1 决策提纯; 从 radio/[token]/page.tsx 抽出)。
 *
 * page 是 async server component (取数 + JSX), 状态推导原先内联其中不可测。此处把
 * 「给定订户事实 → 该渲染什么」的判定收成零 I/O 纯函数, 供 hermetic 单测锁死分支:
 *   trial→trialDone→expired · 付费墙触发 · 即时首晚 · 解锁绕过 · 兜底触发 · 座位余量。
 * page 仅负责取数 + 把结果喂进本函数 + 按返回的 banner/needFallback 等标志渲染, 不再自行判定。
 */
import type { SubStatus } from "./store";
import { TRIAL_NIGHTS } from "./constants";

export interface RadioStateInput {
  status: SubStatus;
  /** 该户故事总数 (= 页面 views.length = all.length)。 */
  storyCount: number;
  /** 北京时间已过 UNLOCK_HOUR (bjHour() >= 19)。 */
  unlocked: boolean;
  /** 存在「今晚(北京今天)」那篇且在当前解锁规则下可见 (= page 的 tonight 对象非空)。 */
  hasTonight: boolean;
  /** 今晚那篇的音频 URL (缺=""); 仅 hasTonight 时有意义。 */
  tonightAudioUrl: string;
  /** 是否已绑定克隆音色 (Boolean(sub.voiceId))。 */
  hasVoiceId: boolean;
}

export interface RadioState {
  nights: number;
  trialDone: boolean; // trial 且已满 TRIAL_NIGHTS 晚 → 付费钩子
  expired: boolean; // 过期/退款 (暂停态)
  showPaywall: boolean; // trialDone || expired
  /** 即时首晚: 刚开通、零故事、已录音 → 挂载即触发 instant-first。 */
  instantPending: boolean;
  /** 即时首晚文本已落、音频后台合成中 → 故事卡限时轮询。 */
  tonightAudioPending: boolean;
  /** 状态条: trial 进度条 / expired 暂停提示 / 无。 */
  banner: "trialProgress" | "suspended" | "none";
  /** page 是否需要取精选库算兜底 (unlocked && !hasTonight && !instantPending)。 */
  needFallback: boolean;
}

export function computeRadioState(input: RadioStateInput): RadioState {
  const { status, storyCount, unlocked, hasTonight, tonightAudioUrl, hasVoiceId } = input;
  const nights = storyCount;

  const isTrial = status === "trial";
  const trialDone = isTrial && nights >= TRIAL_NIGHTS;
  const expired = status === "expired" || status === "refunded";
  const showPaywall = trialDone || expired;

  const instantPending = isTrial && storyCount === 0 && hasVoiceId;
  const tonightAudioPending = isTrial && storyCount === 1 && hasTonight && !tonightAudioUrl;

  const needFallback = unlocked && !hasTonight && !instantPending;

  const banner: RadioState["banner"] = expired
    ? "suspended"
    : isTrial && !trialDone
      ? "trialProgress"
      : "none";

  return {
    nights,
    trialDone,
    expired,
    showPaywall,
    instantPending,
    tonightAudioPending,
    banner,
    needFallback,
  };
}

/** 创始家庭真实余量 (不做假稀缺): 容量帽 − 现役付费户, 下限 0。 */
export function computeSeatsLeft(foundingCap: number, activePaid: number): number {
  return Math.max(0, foundingCap - activePaid);
}
