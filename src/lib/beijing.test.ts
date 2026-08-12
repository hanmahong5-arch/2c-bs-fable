/**
 * beijing.test.ts — 北京时间工具全分支 (hermetic; 一律注入固定 now, 不读真实时钟)。
 * 覆盖: 跨零点日期进位 / UNLOCK_HOUR 边界小时 / bjDaysSince 正负零 / parseSerialState 三分支。
 */
import { describe, expect, test } from "bun:test";
import { bjDaysSince, bjHour, bjToday, parseSerialState } from "./beijing";

// 固定时刻工具: 传 UTC ISO, 便于逐点手算 (+8h 后再取 UTC 日/时)。
const at = (utcIso: string) => new Date(utcIso);

describe("bjToday (UTC→北京日期, +8h)", () => {
  test("北京上午: UTC 03:30 → 同日", () => {
    expect(bjToday(at("2026-07-03T03:30:00Z"))).toBe("2026-07-03");
  });
  test("跨零点进位: UTC 16:00 (=北京次日 00:00) → 次日", () => {
    expect(bjToday(at("2026-07-03T16:00:00Z"))).toBe("2026-07-04");
  });
  test("零点前一秒仍属当日: UTC 15:59:59 (=北京 23:59:59)", () => {
    expect(bjToday(at("2026-07-03T15:59:59Z"))).toBe("2026-07-03");
  });
});

describe("bjHour (北京当前小时 0-23)", () => {
  test("UTC 11:00 → 北京 19 时 (UNLOCK_HOUR 命中)", () => {
    expect(bjHour(at("2026-07-03T11:00:00Z"))).toBe(19);
  });
  test("解锁前一分钟: UTC 10:59 → 北京 18 时", () => {
    expect(bjHour(at("2026-07-03T10:59:00Z"))).toBe(18);
  });
  test("跨零点回绕: UTC 16:00 → 北京 0 时", () => {
    expect(bjHour(at("2026-07-03T16:00:00Z"))).toBe(0);
  });
});

describe("bjDaysSince (以北京今天为基准的整天差)", () => {
  const now = at("2026-07-03T03:00:00Z"); // 北京 2026-07-03
  test("2 天前", () => {
    expect(bjDaysSince("2026-07-01", now)).toBe(2);
  });
  test("今天 → 0", () => {
    expect(bjDaysSince("2026-07-03", now)).toBe(0);
  });
  test("未来日期 → 负数", () => {
    expect(bjDaysSince("2026-07-05", now)).toBe(-2);
  });
  test("AUDIO_KEEP_DAYS(14) 归档边界: 恰 14 天前", () => {
    expect(bjDaysSince("2026-06-19", now)).toBe(14);
  });
});

describe("parseSerialState (容错 JSON)", () => {
  test("空串 → {}", () => {
    expect(parseSerialState("")).toEqual({});
  });
  test("合法 JSON → 原样解析", () => {
    const s = parseSerialState(JSON.stringify({ nights: 4, upcoming: ["甲", "乙"] }));
    expect(s.nights).toBe(4);
    expect(s.upcoming).toEqual(["甲", "乙"]);
  });
  test("坏 JSON → {} (不抛)", () => {
    expect(parseSerialState("{not json")).toEqual({});
  });
  test("缺字段安全: 只有 recap 时 nights undefined", () => {
    const s = parseSerialState(JSON.stringify({ recap: "前情" }));
    expect(s.recap).toBe("前情");
    expect(s.nights).toBeUndefined();
  });
});
