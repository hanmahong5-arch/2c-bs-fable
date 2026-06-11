#!/usr/bin/env bun
/**
 * gen-articles.ts — 从选题库批量生成文章 md (LLM 经 newapi)。
 *
 * 流程: topics.jsonl 取未完成选题 → 变量槽确定性轮换 (防同质化) → LLM 生成 JSON
 * → 硬性质量门 (字数/黑名单词/结构) → checkSafety 宁缺不污 → 写
 * content/articles/<category>/<slug>.md + 追加 content/articles-index.jsonl。
 *
 * 幂等: slug = 日期无关的 sha256(category+topic) 前 10 hex, 文件已存在即跳过;
 * kill 中途重跑安全 (索引追加在文件写成功之后)。
 *
 * 用法: bun scripts/articles/gen-articles.ts --count 100
 * env: NEWAPI_TRIAL_TOKEN 必须; ARTICLES_CONCURRENCY (默认 8)。
 */
import { createHash } from "node:crypto";
import { promises as fs } from "fs";
import path from "path";
import { TOKEN, checkSafety, llmJson } from "../lib/story-gen";

const DIR = import.meta.dir;
const ROOT = path.join(DIR, "..", "..");
const TAXONOMY_FILE = path.join(ROOT, "content", "articles-taxonomy.json");
const TOPICS_FILE = path.join(DIR, "topics.jsonl");
const ARTICLES_DIR = path.join(ROOT, "content", "articles");
const INDEX_FILE = path.join(ROOT, "content", "articles-index.jsonl");

const CONCURRENCY = Number(process.env.ARTICLES_CONCURRENCY ?? "8");
const COUNT = (() => {
  const i = process.argv.indexOf("--count");
  return i >= 0 ? Number(process.argv[i + 1]) : 100;
})();

interface Category {
  key: string;
  name: string;
  audience: string;
  styleNote: string;
}
interface Taxonomy {
  categories: Category[];
  systemTemplate: string;
  userTemplate: string;
}
interface ArticleOut {
  title: string;
  description: string;
  paragraphs: string[];
  tags: string[];
}

// ── 变量槽池 (确定性轮换 = 幂等 + 防同质化; 维度来自 taxonomy 设计) ──
const PROTAGONISTS = ["小动物", "普通小孩", "拟人植物", "玩具", "自然现象精灵", "小物件(灯/伞/袜子)"];
const SCENES = ["森林", "海边", "城市屋顶", "厨房", "星空下", "老家院子", "幼儿园", "下雨的窗台", "冬天的雪地", "夏夜的草地"];
const POVS = ["第三人称全知", "第一人称孩子自述", "旁观者讲述"];
const STRUCTURES = ["线性起伏", "三段重复递进", "梦境嵌套", "倒叙揭秘"];
const EMOTIONS = ["克服小小的害怕", "和解与原谅", "好奇心得到满足", "依恋与安心", "帮助他人的自豪感", "接受失落后重新快乐"];
const STYLES = ["诗意温柔", "轻松幽默", "冒险轻快", "平静哄睡"];
const EXTRAS = ["结尾用摇篮曲式收尾", "加入一个数数互动", "穿插季节意象", "", "加入一句可以跟读的重复短句", ""];

// 硬性黑名单 (rubric hard fail #3): 文中不得出现 AI 模型/工具/品牌名
const BANNED = /deepseek|chatgpt|claude|anthropic|openai|gpt|llm|ai\s?模型|人工智能|大模型|文心|通义|讯飞/i;
// 说教句式 (rubric soft #8): 命中 ≥2 处拒收重写
const PREACHY = /小朋友(们)?(要|应该|必须)|这(个故事)?告诉我们|我们要学习/g;

function hashOf(s: string): string {
  return createHash("sha256").update(s, "utf-8").digest("hex");
}

function pick<T>(pool: T[], hash: string, dim: number): T {
  return pool[parseInt(hash.slice(dim * 2, dim * 2 + 2), 16) % pool.length];
}

function esc(s: string): string {
  return s.replace(/"/g, "'").replace(/[\r\n]+/g, " ").trim();
}

interface Topic {
  category: string;
  topic: string;
}

async function loadPending(): Promise<Topic[]> {
  const raw = await fs.readFile(TOPICS_FILE, "utf-8");
  const topics: Topic[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      topics.push(JSON.parse(line) as Topic);
    } catch {
      /* 半行跳过 */
    }
  }
  // 已完成 = md 文件存在 (slug 由 topic 决定, O(1) 判断)
  const pending: Topic[] = [];
  for (const t of topics) {
    const slug = `a${hashOf(`${t.category}|${t.topic}`).slice(0, 10)}`;
    const file = path.join(ARTICLES_DIR, t.category, `${slug}.md`);
    const exists = await fs.access(file).then(() => true).catch(() => false);
    if (!exists) pending.push(t);
  }
  return pending;
}

function validate(a: ArticleOut): string | null {
  if (!a.title || !a.description || !Array.isArray(a.paragraphs) || a.paragraphs.length < 4) {
    return "bad shape";
  }
  const body = a.paragraphs.join("");
  if (body.length < 700 || body.length > 1700) return `length ${body.length}`;
  const all = `${a.title} ${a.description} ${body}`;
  if (BANNED.test(all)) return "banned word";
  if ((body.match(PREACHY) ?? []).length >= 2) return "preachy";
  return null;
}

async function genOne(tax: Taxonomy, t: Topic, today: string): Promise<"ok" | "fail"> {
  const cat = tax.categories.find((c) => c.key === t.category);
  if (!cat) return "fail";
  const h = hashOf(`${t.category}|${t.topic}`);
  const slug = `a${h.slice(0, 10)}`;

  const user = tax.userTemplate
    .replaceAll("{{category}}", `${cat.name} — ${cat.styleNote}`)
    .replaceAll("{{topic_title}}", t.topic)
    .replaceAll("{{audience}}", cat.audience)
    .replaceAll("{{word_count_min}}", "800")
    .replaceAll("{{word_count_max}}", "1300")
    .replaceAll("{{protagonist}}", pick(PROTAGONISTS, h, 1))
    .replaceAll("{{scene}}", pick(SCENES, h, 2))
    .replaceAll("{{pov}}", pick(POVS, h, 3))
    .replaceAll("{{structure}}", pick(STRUCTURES, h, 4))
    .replaceAll("{{emotion}}", pick(EMOTIONS, h, 5))
    .replaceAll("{{style}}", pick(STYLES, h, 6))
    .replaceAll("{{extra}}", pick(EXTRAS, h, 7));
  const system = tax.systemTemplate
    .replaceAll("{{word_count_min}}", "800")
    .replaceAll("{{word_count_max}}", "1300");

  let lastReason = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    let a: ArticleOut;
    try {
      a = await llmJson<ArticleOut>(system, user, { temperature: 1.0 });
    } catch (e) {
      lastReason = `llm: ${(e as Error).message}`;
      continue;
    }
    const bad = validate(a);
    if (bad) {
      lastReason = bad;
      continue;
    }
    try {
      const verdict = await checkSafety(
        { title: a.title, paragraphs: a.paragraphs, moral: a.description },
        true, // 文章不要求严格哄睡收尾 (品类含育儿知识), 用宽松口径
      );
      if (!verdict.safe) {
        lastReason = `unsafe: ${verdict.reason}`;
        continue;
      }
    } catch (e) {
      lastReason = `safety err: ${(e as Error).message}`;
      continue; // 宁缺不污
    }

    const fm = [
      "---",
      `title: "${esc(a.title)}"`,
      `audience: "${esc(cat.audience)}"`,
      `description: "${esc(a.description).slice(0, 80)}"`,
      `tags: "${a.tags.slice(0, 6).map(esc).join(", ")}"`,
      `date: "${today}"`,
      `topic: "${esc(t.topic)}"`,
      "---",
      "",
    ].join("\n");
    const md = fm + a.paragraphs.map((p) => p.trim()).join("\n\n") + "\n";
    const dir = path.join(ARTICLES_DIR, t.category);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${slug}.md`), md, "utf-8");
    await fs.appendFile(
      INDEX_FILE,
      JSON.stringify({
        slug,
        category: t.category,
        title: a.title,
        date: today,
        description: a.description.slice(0, 80),
      }) + "\n",
      "utf-8",
    );
    console.error(`[articles] ✓ ${t.category}/${slug} ${a.title}`);
    return "ok";
  }
  console.error(`[articles] ✗ ${t.category} "${t.topic}": ${lastReason}`);
  return "fail";
}

async function main(): Promise<void> {
  if (!TOKEN) {
    console.error("[articles] NEWAPI_TRIAL_TOKEN missing");
    process.exit(1);
  }
  const tax = JSON.parse(await fs.readFile(TAXONOMY_FILE, "utf-8")) as Taxonomy;
  const pending = await loadPending();
  const batch = pending.slice(0, COUNT);
  console.error(`[articles] pending ${pending.length}, this batch ${batch.length}, concurrency ${CONCURRENCY}`);
  const today = new Date().toISOString().slice(0, 10);

  let ok = 0, fail = 0;
  const queue = [...batch];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const t = queue.shift();
      if (!t) break;
      const r = await genOne(tax, t, today);
      if (r === "ok") ok++;
      else fail++;
    }
  });
  await Promise.all(workers);
  console.error(`[articles] batch done: ok ${ok} · fail ${fail} · remaining ~${pending.length - batch.length}`);
}

await main();
