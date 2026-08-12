/**
 * story-view.ts — StoryRecord → StoryView 纯映射 (从 page.tsx 提纯; 九期归档规则可测化)。
 *
 * 电台页把 store 的 StoryRecord (全字符串) 转成渲染用 StoryView。两处非平凡逻辑锁死:
 *   ① 音频 14 天滚动归档: daysSince >= AUDIO_KEEP_DAYS → audioUrl 置空 + archived 标记
 *      (故事文字永久保留, 仅音频到期归档);
 *   ② paragraphs 容错解析: JSON 数组 → string[]; 解析失败退化为整段单元素 (坏数据不炸页面)。
 * 纯函数 (daysSince 由调用方用 bjDaysSince 预算入参) → hermetic 可测。
 */
import type { StoryRecord } from "@/lib/store";
import type { StoryView } from "./radio-client";
import { AUDIO_KEEP_DAYS } from "@/lib/constants";

export function toStoryView(s: StoryRecord, daysSince: number): StoryView {
  const archived = daysSince >= AUDIO_KEEP_DAYS;
  let paragraphs: string[];
  try {
    paragraphs = JSON.parse(s.paragraphs) as string[];
  } catch {
    paragraphs = [s.paragraphs];
  }
  return {
    date: s.date,
    title: s.title,
    paragraphs,
    moral: s.moral,
    audioUrl: archived ? "" : s.audioUrl,
    starred: s.starred === "1",
    archived,
    note: s.note,
  };
}
