/**
 * beijing.ts — 北京时间工具 (Vercel 函数跑 UTC, 电台解锁/日期一律以北京时间为准)。
 */

const BJ_OFFSET_MS = 8 * 3600_000;

function bj(now = new Date()): Date {
  return new Date(now.getTime() + BJ_OFFSET_MS);
}

/** 北京时间今天, YYYY-MM-DD。 */
export function bjToday(now = new Date()): string {
  return bj(now).toISOString().slice(0, 10);
}

/** 北京时间当前小时 (0-23)。 */
export function bjHour(now = new Date()): number {
  return bj(now).getUTCHours();
}

/** 距 date (YYYY-MM-DD) 的整天数, 以北京时间今天为基准。 */
export function bjDaysSince(date: string, now = new Date()): number {
  const then = Date.parse(`${date}T00:00:00+08:00`);
  const today = Date.parse(`${bjToday(now)}T00:00:00+08:00`);
  return Math.round((today - then) / 86400_000);
}

/** 连载宇宙状态 (sub.serialState JSON; 管线写, 电台页读)。 */
export interface SerialState {
  recap?: string; // 前情提要 (喂下一晚 prompt)
  arc?: string; // 角色成长线
  upcoming?: string[]; // 未来 7 晚标题预告 (trial 第 3 晚生成, 付费墙展示)
  nights?: number; // 已生成晚数
}

export function parseSerialState(raw: string): SerialState {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as SerialState;
  } catch {
    return {};
  }
}
