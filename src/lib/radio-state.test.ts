/**
 * radio-state.test.ts — 电台页状态机纯核全分支 (hermetic; 零 I/O)。
 * 覆盖: trial 进度 → trialDone → expired 全生命周期 · 付费墙触发 · 即时首晚(pending/audioPending) ·
 *       解锁绕过(instantUnlock 由 hasTonight 体现) · needFallback 兜底触发 · banner 三态 · seatsLeft 下限。
 */
import { describe, expect, test } from "bun:test";
import { computeRadioState, computeSeatsLeft, type RadioStateInput } from "./radio-state";

const base: RadioStateInput = {
  status: "trial",
  storyCount: 0,
  unlocked: false,
  hasTonight: false,
  tonightAudioUrl: "",
  hasVoiceId: false,
};
const S = (over: Partial<RadioStateInput>) => computeRadioState({ ...base, ...over });

// ── 生命周期: trial 进度 → trialDone → expired ──────────────────
describe("trial 生命周期", () => {
  test("trial 第 1 晚 (未满): banner=trialProgress, 不付费墙", () => {
    const s = S({ status: "trial", storyCount: 1 });
    expect(s.trialDone).toBe(false);
    expect(s.showPaywall).toBe(false);
    expect(s.banner).toBe("trialProgress");
  });
  test("trial 满 3 晚: trialDone + 付费墙 + banner 收起 (none)", () => {
    const s = S({ status: "trial", storyCount: 3, unlocked: true });
    expect(s.trialDone).toBe(true);
    expect(s.showPaywall).toBe(true);
    expect(s.banner).toBe("none"); // trialDone 后进度条不再显示
  });
  test("trial 超 3 晚仍 trialDone", () => {
    expect(S({ status: "trial", storyCount: 5 }).trialDone).toBe(true);
  });
  test("expired: 付费墙 + banner=suspended + 非 trialDone", () => {
    const s = S({ status: "expired", storyCount: 5, unlocked: true });
    expect(s.expired).toBe(true);
    expect(s.trialDone).toBe(false);
    expect(s.showPaywall).toBe(true);
    expect(s.banner).toBe("suspended");
  });
  test("refunded 同 expired 归为暂停态", () => {
    const s = S({ status: "refunded", storyCount: 2 });
    expect(s.expired).toBe(true);
    expect(s.showPaywall).toBe(true);
    expect(s.banner).toBe("suspended");
  });
  test("active 户: 无付费墙, banner=none", () => {
    const s = S({ status: "active", storyCount: 10, unlocked: true, hasTonight: true, tonightAudioUrl: "u" });
    expect(s.showPaywall).toBe(false);
    expect(s.banner).toBe("none");
  });
});

// ── 即时首晚 ────────────────────────────────────────────────────
describe("即时首晚 (instant-first)", () => {
  test("trial + 0 故事 + 已录音 → instantPending", () => {
    const s = S({ status: "trial", storyCount: 0, hasVoiceId: true });
    expect(s.instantPending).toBe(true);
    expect(s.needFallback).toBe(false); // 即时首晚接管, 不走兜底
  });
  test("trial + 0 故事但未录音 → 不 pending (无音色不能生成)", () => {
    const s = S({ status: "trial", storyCount: 0, hasVoiceId: false });
    expect(s.instantPending).toBe(false);
  });
  test("active 户零故事 → 不触发即时首晚 (只服务 trial)", () => {
    expect(S({ status: "active", storyCount: 0, hasVoiceId: true }).instantPending).toBe(false);
  });
  test("即时首晚文本已落、音频合成中 → tonightAudioPending", () => {
    // storyCount=1 + hasTonight + 音频缺 → 轮询
    const s = S({ status: "trial", storyCount: 1, hasTonight: true, tonightAudioUrl: "" });
    expect(s.tonightAudioPending).toBe(true);
    expect(s.needFallback).toBe(false); // 卡已渲染, 不走兜底
  });
  test("音频已到位 → 不再 pending", () => {
    const s = S({ status: "trial", storyCount: 1, hasTonight: true, tonightAudioUrl: "u" });
    expect(s.tonightAudioPending).toBe(false);
  });
  test("第 2 晚起 (storyCount≥2) 不再 audioPending (仅首晚绕过)", () => {
    const s = S({ status: "trial", storyCount: 2, hasTonight: true, tonightAudioUrl: "" });
    expect(s.tonightAudioPending).toBe(false);
  });
});

// ── needFallback (兜底触发; page.tsx 据此决定是否取精选库) ───────
describe("needFallback 兜底触发", () => {
  test("已解锁 + 无今晚 + 非即时首晚 → 需兜底", () => {
    expect(S({ status: "active", storyCount: 2, unlocked: true }).needFallback).toBe(true);
  });
  test("未解锁 → 不兜底 (走 19:00 解锁卡)", () => {
    expect(S({ status: "active", storyCount: 2, unlocked: false }).needFallback).toBe(false);
  });
  test("有今晚 → 不兜底", () => {
    expect(S({ hasTonight: true, tonightAudioUrl: "u", unlocked: true }).needFallback).toBe(false);
  });
  test("即时首晚生成中 → 不兜底 (让等待动画接管)", () => {
    expect(S({ storyCount: 0, hasVoiceId: true, unlocked: true }).needFallback).toBe(false);
  });
});

// ── seatsLeft ──────────────────────────────────────────────────
describe("computeSeatsLeft (真实余量, 不假稀缺)", () => {
  test("帽 100 − 付费 37 = 63", () => {
    expect(computeSeatsLeft(100, 37)).toBe(63);
  });
  test("满员 → 0 (不负)", () => {
    expect(computeSeatsLeft(100, 100)).toBe(0);
  });
  test("超募 → 下限 0", () => {
    expect(computeSeatsLeft(100, 150)).toBe(0);
  });
});
