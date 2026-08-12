/**
 * story-view.test.ts — StoryRecord→StoryView 纯映射全分支 (hermetic; 零 I/O)。
 * 覆盖块① 的「过期/归档」: 14 天音频滚动归档边界 · paragraphs JSON 容错 · starred/note 归一。
 */
import { describe, expect, test } from "bun:test";
import { toStoryView } from "./story-view";
import type { StoryRecord } from "@/lib/store";

const rec = (over: Partial<StoryRecord> = {}): StoryRecord => ({
  date: "2026-07-01", title: "小星星", paragraphs: JSON.stringify(["天黑了。", "小星星找路。"]),
  moral: "勇敢一点点", audioUrl: "https://blob/x.mp3", starred: "", listened: "", note: "",
  createdAt: "2026-07-01T00:00:00.000Z", ...over,
});

// ── 归档边界 (AUDIO_KEEP_DAYS = 14) ──────────────────────────────
describe("音频 14 天滚动归档", () => {
  test("13 天: 未归档, 音频保留", () => {
    const v = toStoryView(rec(), 13);
    expect(v.archived).toBe(false);
    expect(v.audioUrl).toBe("https://blob/x.mp3");
  });
  test("恰 14 天: 归档, 音频置空 (>= 边界)", () => {
    const v = toStoryView(rec(), 14);
    expect(v.archived).toBe(true);
    expect(v.audioUrl).toBe("");
  });
  test("15 天: 归档", () => {
    expect(toStoryView(rec(), 15).archived).toBe(true);
  });
  test("归档只清音频, 故事文字永久保留", () => {
    const v = toStoryView(rec(), 20);
    expect(v.audioUrl).toBe("");
    expect(v.title).toBe("小星星");
    expect(v.moral).toBe("勇敢一点点");
    expect(v.paragraphs).toEqual(["天黑了。", "小星星找路。"]);
  });
  test("当天 (0 天): 未归档", () => {
    expect(toStoryView(rec(), 0).archived).toBe(false);
  });
});

// ── paragraphs 容错解析 ───────────────────────────────────────────
describe("paragraphs JSON 容错", () => {
  test("合法 JSON 数组 → string[]", () => {
    expect(toStoryView(rec({ paragraphs: JSON.stringify(["甲", "乙", "丙"]) }), 0).paragraphs)
      .toEqual(["甲", "乙", "丙"]);
  });
  test("坏 JSON → 退化为整段单元素 (不炸页面)", () => {
    expect(toStoryView(rec({ paragraphs: "这是一段没转义的纯文本" }), 0).paragraphs)
      .toEqual(["这是一段没转义的纯文本"]);
  });
  test("空串 → JSON.parse 抛错 → [''] (整段单元素)", () => {
    expect(toStoryView(rec({ paragraphs: "" }), 0).paragraphs).toEqual([""]);
  });
});

// ── 标记归一 ─────────────────────────────────────────────────────
describe("starred / note 归一", () => {
  test("starred '1' → true", () => {
    expect(toStoryView(rec({ starred: "1" }), 0).starred).toBe(true);
  });
  test("starred '' → false", () => {
    expect(toStoryView(rec({ starred: "" }), 0).starred).toBe(false);
  });
  test("starred '0' → false (仅 '1' 算点亮)", () => {
    expect(toStoryView(rec({ starred: "0" }), 0).starred).toBe(false);
  });
  test("note 原样透传 (徽章用)", () => {
    expect(toStoryView(rec({ note: "今天骑车了" }), 0).note).toBe("今天骑车了");
  });
  test("date/title 原样透传", () => {
    const v = toStoryView(rec({ date: "2026-06-15", title: "篇二" }), 0);
    expect(v.date).toBe("2026-06-15");
    expect(v.title).toBe("篇二");
  });
});
