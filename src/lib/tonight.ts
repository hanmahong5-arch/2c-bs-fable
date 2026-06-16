/**
 * tonight.ts — 「今晚总有一个可播故事」纯兜底选择器 (九期)。
 *
 * R5 (GPU + 跨境 egress) 是音频管线的单点故障 (实录过整天失败 → 当晚订户停更)。
 * 本模块在「今晚新故事缺位」(R5/生成失败) 时, 仅凭电台页已取到的数据 (往期 + 精选库)
 * 选出一个真实可播的睡前故事, 全程零 I/O、零 R5 依赖 → 抗 R5 全挂, 永不留死胡同。
 *
 * 纯函数 (无 Date / random / 网络) → fable 首批 hermetic 测试 (tonight.test.ts)。
 */

/** pickFallback 读取的往期故事最小形状 (实际由 radio-client 的 StoryView 满足)。 */
export interface ReplayCandidate {
  /** 朗读音频 URL; 空 = 当晚缺更或已过 14 天归档 (不可作兜底)。 */
  audioUrl: string;
  /** 孩子点过星的「最爱」。 */
  starred: boolean;
}

/** 精选库可播条目 (= getStories().filter(s => s.hasAudio))。 */
export interface LibraryItem {
  slug: string;
  title: string;
}

/** 今晚兜底选择结果 (判别联合)。replay 保留来源故事完整类型 (V) 以复用 StoryCard。 */
export type TonightChoice<V extends ReplayCandidate> =
  | { kind: "replay"; story: V; audioSrc: string } // 往期·家长本人声音
  | { kind: "library"; slug: string; title: string; audioSrc: string } // 精选库·专业音频
  | { kind: "none" };

/**
 * FNV-1a 32-bit 字符串散列 (纯函数)。
 *
 * 用途: 把 `token:今天` 映成精选库的稳定索引 —— 整晚不跳 (电台页 force-dynamic 每次渲染
 * 重算也得同一篇)、跨晚轮换 (date 一变就换一篇)。纯函数内禁 Math.random, 故用确定性散列。
 */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0; // 转无符号 32-bit, 供安全取模
}

/**
 * 今晚兜底选择器。优先级:
 *  1. replay  — 往期中仍有音频者 (≤14 天, 家长本人声音), 取最近的 starred; 无 starred 取最近的有音频。
 *               (家长声音最抚慰 + 孩子爱重听最爱; owner 若想「失败夜给新鲜感」可翻转 1↔2。)
 *  2. library — 精选库 (专业音频, 抗 R5 全挂) 按 seed 确定性选一篇。
 *  3. none    — 既无往期音频又无库 (理论不该发生) → 调用方退回温柔文案。
 *
 * @param views            往期故事 (新→旧, audioUrl 已对 >14 天归档置空)
 * @param libraryWithAudio 精选库可播条目
 * @param seed             稳定种子 (token + ':' + 北京今天) → 决定 library 选篇
 */
export function pickFallback<V extends ReplayCandidate>(
  views: V[],
  libraryWithAudio: LibraryItem[],
  seed: string,
): TonightChoice<V> {
  // 1) replay: 往期仍有音频者 (views 已按新→旧, filter/find 保序 → 命中即最近)
  const withAudio = views.filter((v) => v.audioUrl);
  if (withAudio.length > 0) {
    const pick = withAudio.find((v) => v.starred) ?? withAudio[0];
    return { kind: "replay", story: pick, audioSrc: pick.audioUrl };
  }
  // 2) library: 确定性选篇 (同 seed 稳定 / 跨晚轮换)
  if (libraryWithAudio.length > 0) {
    const item = libraryWithAudio[fnv1a(seed) % libraryWithAudio.length];
    return { kind: "library", slug: item.slug, title: item.title, audioSrc: `/audio/${item.slug}.mp3` };
  }
  // 3) none
  return { kind: "none" };
}
