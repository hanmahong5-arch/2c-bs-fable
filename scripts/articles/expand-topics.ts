#!/usr/bin/env bun
/**
 * expand-topics.ts — 按 taxonomy share 把选题库扩到目标总量 (默认 10000)。
 *
 * 逐品类调 LLM (topicExpandPrompt, 一次 50 题), 归一化去重后追加
 * scripts/articles/topics.jsonl ({category, topic} 每行一条)。
 * 幂等: 已有题目计入品类配额, 重跑只补缺口。
 *
 * env: NEWAPI_TRIAL_TOKEN 必须; TOPICS_TARGET / TOPICS_CONCURRENCY 可覆盖。
 */
import { promises as fs } from "fs";
import path from "path";
import { TOKEN, llmJson } from "../lib/story-gen";

const DIR = import.meta.dir; // Bun 专属, Windows 路径安全
const TAXONOMY_FILE = path.join(DIR, "..", "..", "content", "articles-taxonomy.json");
const TOPICS_FILE = path.join(DIR, "topics.jsonl");

const TARGET = Number(process.env.TOPICS_TARGET ?? "10000");
const CONCURRENCY = Number(process.env.TOPICS_CONCURRENCY ?? "6");

interface Category {
  key: string;
  name: string;
  audience: string;
  share: number;
  styleNote: string;
  seedTopics: string[];
}

interface Taxonomy {
  categories: Category[];
  topicExpandPrompt: string;
}

/** 标题归一化做去重键: 去标点/空白, 防「同题不同标点」混入。 */
function normTitle(t: string): string {
  return t.replace(/[\s。，、！？——·…:：;；"'「」『』()（）]/g, "").toLowerCase();
}

async function loadExisting(): Promise<Map<string, Set<string>>> {
  const byCat = new Map<string, Set<string>>();
  let raw = "";
  try {
    raw = await fs.readFile(TOPICS_FILE, "utf-8");
  } catch {
    return byCat;
  }
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const { category, topic } = JSON.parse(line) as { category: string; topic: string };
      if (!byCat.has(category)) byCat.set(category, new Set());
      byCat.get(category)!.add(normTitle(topic));
    } catch {
      /* 半行跳过 */
    }
  }
  return byCat;
}

async function expandCategory(
  tax: Taxonomy,
  cat: Category,
  quota: number,
  seen: Set<string>,
): Promise<number> {
  let added = 0;
  let emptyRounds = 0;
  while (seen.size < quota && emptyRounds < 3) {
    // 种子 = 固定 seed + 风格注记 + 已出题样本 (告知模型避开)
    const sample = [...seen].slice(-15).join("；");
    const seed = `${cat.styleNote}\n种子示例: ${cat.seedTopics.join("；")}` +
      (sample ? `\n已出过的题(避免雷同): ${sample}` : "");
    const prompt = tax.topicExpandPrompt
      .replaceAll("{{category}}", `${cat.name} (${cat.audience})`)
      .replaceAll("{{seed}}", seed);
    let titles: string[];
    try {
      // response_format=json_object 下模型可能包一层对象 → 取第一个数组值容错
      const out = await llmJson<unknown>(
        '你是儿童内容选题策划, 严格输出 JSON: {"titles": ["标题1", ...]}',
        prompt,
        { temperature: 1.2 },
      );
      titles = Array.isArray(out)
        ? (out as string[])
        : ((Object.values(out as Record<string, unknown>).find(Array.isArray) as string[]) ?? []);
      if (!titles.length) throw new Error("no array in response");
    } catch (e) {
      console.error(`[topics] ${cat.key}: LLM fail (${(e as Error).message}), retry`);
      emptyRounds++;
      continue;
    }
    const fresh: string[] = [];
    for (const t of titles) {
      const title = String(t).trim().slice(0, 30);
      if (!title || title.length < 4) continue;
      const k = normTitle(title);
      if (seen.has(k)) continue;
      seen.add(k);
      fresh.push(title);
      if (seen.size >= quota) break;
    }
    if (fresh.length === 0) {
      emptyRounds++;
      continue;
    }
    emptyRounds = 0;
    const lines = fresh.map((t) => JSON.stringify({ category: cat.key, topic: t })).join("\n") + "\n";
    await fs.appendFile(TOPICS_FILE, lines, "utf-8");
    added += fresh.length;
    console.error(`[topics] ${cat.key}: +${fresh.length} (now ${seen.size}/${quota})`);
  }
  return added;
}

async function main(): Promise<void> {
  if (!TOKEN) {
    console.error("[topics] NEWAPI_TRIAL_TOKEN missing");
    process.exit(1);
  }
  const tax = JSON.parse(await fs.readFile(TAXONOMY_FILE, "utf-8")) as Taxonomy;
  const existing = await loadExisting();
  const totalShare = tax.categories.reduce((s, c) => s + c.share, 0);

  // 简易并发池: 品类间并行, 品类内串行 (同品类去重集需顺序一致)
  const queue = tax.categories.map((cat) => {
    const quota = Math.round((cat.share / totalShare) * TARGET);
    const seen = existing.get(cat.key) ?? new Set<string>();
    return { cat, quota, seen };
  });
  let totalAdded = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const job = queue.shift();
      if (!job) break;
      totalAdded += await expandCategory(tax, job.cat, job.quota, job.seen);
    }
  });
  await Promise.all(workers);
  console.error(`[topics] done: +${totalAdded} new topics`);
}

await main();
