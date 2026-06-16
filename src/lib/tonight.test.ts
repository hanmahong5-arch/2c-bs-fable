/**
 * tonight.test.ts — pickFallback 全矩阵 (fable 首批 hermetic 测试; `bun test`)。
 * 纯函数零依赖: 不碰 R5 / 网络 / Redis / 文件系统。
 */
import { describe, expect, test } from "bun:test";
import { fnv1a, pickFallback, type LibraryItem } from "./tonight";

/** 往期故事最小夹具 (audioUrl 兼作身份标记)。 */
const v = (audioUrl: string, starred = false) => ({ audioUrl, starred });

const LIB: LibraryItem[] = [
  { slug: "a", title: "甲" },
  { slug: "b", title: "乙" },
  { slug: "c", title: "丙" },
  { slug: "d", title: "丁" },
  { slug: "e", title: "戊" },
];

describe("pickFallback · replay (往期·家长本人声音, 最优先)", () => {
  test("有 starred → 取最近的 starred", () => {
    // 新→旧: u1(非) / u2(星) / u3(星) → 命中 u2 (最近的 starred)
    const r = pickFallback([v("u1", false), v("u2", true), v("u3", true)], LIB, "seed");
    expect(r.kind).toBe("replay");
    if (r.kind === "replay") {
      expect(r.story.audioUrl).toBe("u2");
      expect(r.audioSrc).toBe("u2");
    }
  });

  test("无 starred → 取最近的有音频", () => {
    const r = pickFallback([v("u1"), v("u2"), v("u3")], LIB, "seed");
    expect(r.kind).toBe("replay");
    if (r.kind === "replay") expect(r.story.audioUrl).toBe("u1");
  });

  test("最近的已归档 (audioUrl 空) → 跳过, 取下一篇有音频的 starred", () => {
    const r = pickFallback([v(""), v("u2", true), v("u3")], LIB, "seed");
    expect(r.kind).toBe("replay");
    if (r.kind === "replay") expect(r.story.audioUrl).toBe("u2");
  });

  test("即便有库, replay 仍优先于 library", () => {
    expect(pickFallback([v("u1", true)], LIB, "seed").kind).toBe("replay");
  });
});

describe("pickFallback · library (精选库·专业音频, 抗 R5 全挂)", () => {
  test("往期音频全归档 → 落 library", () => {
    expect(pickFallback([v(""), v(""), v("")], LIB, "seed-x").kind).toBe("library");
  });

  test("无任何往期 → 落 library, audioSrc = /audio/<slug>.mp3", () => {
    const r = pickFallback([], LIB, "seed-x");
    expect(r.kind).toBe("library");
    if (r.kind === "library") {
      expect(LIB.map((l) => l.slug)).toContain(r.slug);
      expect(r.audioSrc).toBe(`/audio/${r.slug}.mp3`);
    }
  });

  test("确定性: 同 seed 多次调用结果完全一致", () => {
    const seed = "tok:2026-06-15";
    const a = pickFallback([], LIB, seed);
    const b = pickFallback([], LIB, seed);
    const c = pickFallback([], LIB, seed);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  test("跨晚轮换: 不同日期至少产出 2 个不同 slug (非常量)", () => {
    const slugs = new Set<string>();
    for (const d of [
      "2026-06-10", "2026-06-11", "2026-06-12", "2026-06-13",
      "2026-06-14", "2026-06-15", "2026-06-16",
    ]) {
      const r = pickFallback([], LIB, `tok:${d}`);
      if (r.kind === "library") slugs.add(r.slug);
    }
    expect(slugs.size).toBeGreaterThan(1);
  });

  test("索引恒在界内 (100 个种子 fuzz)", () => {
    for (let i = 0; i < 100; i++) {
      const r = pickFallback([], LIB, `s${i}`);
      expect(r.kind).toBe("library");
      if (r.kind === "library") expect(LIB.some((l) => l.slug === r.slug)).toBe(true);
    }
  });

  test("单篇库 (取模分母为 1) → 恒选该篇", () => {
    const r = pickFallback([], [{ slug: "only", title: "唯一" }], "whatever");
    expect(r.kind).toBe("library");
    if (r.kind === "library") expect(r.slug).toBe("only");
  });
});

describe("pickFallback · none (理论不该发生)", () => {
  test("无往期且无库 → none", () => {
    expect(pickFallback([], [], "seed").kind).toBe("none");
  });

  test("往期全归档且无库 → none", () => {
    expect(pickFallback([v(""), v("")], [], "seed").kind).toBe("none");
  });
});

describe("fnv1a (确定性散列)", () => {
  test("同输入恒同输出", () => {
    expect(fnv1a("abc")).toBe(fnv1a("abc"));
  });

  test("不同输入区分 (扩散)", () => {
    expect(fnv1a("abc")).not.toBe(fnv1a("abd"));
  });

  test("恒为非负 32-bit 整数", () => {
    for (const s of ["", "x", "tok:2026-06-15", "海", "a".repeat(64)]) {
      const h = fnv1a(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });
});
