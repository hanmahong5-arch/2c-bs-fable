/**
 * articles.ts — 万篇级文章库数据层。
 *
 * 与 stories.ts 的关键差异: 故事库 13 篇可全量读, 文章库目标 10000 篇 →
 * 列表/站点地图只读单个索引文件 content/articles-index.jsonl (生成器维护,
 * 每行 {slug,category,title,date,description}), 详情页按路径 O(1) 读单文件,
 * 永不在请求路径上 readdir 万个文件。
 */
import { promises as fs } from "fs";
import path from "path";

export interface ArticleMeta {
  slug: string;
  category: string;
  title: string;
  date: string; // YYYY-MM-DD
  description: string;
}

export interface Article extends ArticleMeta {
  audience: string;
  tags: string[];
  paragraphs: string[];
}

export interface CategoryInfo {
  key: string;
  name: string;
  audience: string;
}

const ARTICLES_DIR = path.join(process.cwd(), "content", "articles");
const INDEX_FILE = path.join(process.cwd(), "content", "articles-index.jsonl");
const TAXONOMY_FILE = path.join(process.cwd(), "content", "articles-taxonomy.json");

// 模块级缓存 (serverless 实例内复用; 部署即换实例, 无失效问题)
let _index: ArticleMeta[] | null = null;
let _taxonomy: CategoryInfo[] | null = null;

export async function getArticleIndex(): Promise<ArticleMeta[]> {
  if (_index) return _index;
  let raw: string;
  try {
    raw = await fs.readFile(INDEX_FILE, "utf-8");
  } catch {
    return [];
  }
  const items: ArticleMeta[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      items.push(JSON.parse(line) as ArticleMeta);
    } catch {
      // 索引由生成器原子追加; 半行只可能是写入中断的最后一行, 跳过即可
    }
  }
  items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug)));
  _index = items;
  return items;
}

export async function getCategories(): Promise<CategoryInfo[]> {
  if (_taxonomy) return _taxonomy;
  try {
    const raw = JSON.parse(await fs.readFile(TAXONOMY_FILE, "utf-8")) as {
      categories: { key: string; name: string; audience: string }[];
    };
    _taxonomy = raw.categories.map((c) => ({ key: c.key, name: c.name, audience: c.audience }));
  } catch {
    _taxonomy = [];
  }
  return _taxonomy;
}

/** 单行 YAML 标量 (同 stories.ts 口径, 不引 yaml 依赖)。 */
function field(fm: string, key: string): string {
  const m = fm.match(new RegExp(`^${key}:\\s*"?(.*?)"?\\s*$`, "m"));
  return m ? m[1] : "";
}

const SLUG_RE = /^[a-z0-9-]+$/;

export async function getArticle(category: string, slug: string): Promise<Article | null> {
  // 路径参数进文件系统前白名单校验 (防穿越)
  if (!SLUG_RE.test(category) || !SLUG_RE.test(slug)) return null;
  let raw: string;
  try {
    raw = await fs.readFile(path.join(ARTICLES_DIR, category, `${slug}.md`), "utf-8");
  } catch {
    return null;
  }
  if (!raw.startsWith("---")) return null;
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return null;
  const fm = raw.slice(3, end);
  const body = raw.slice(end + 4).trim();
  return {
    slug,
    category,
    title: field(fm, "title"),
    date: field(fm, "date"),
    description: field(fm, "description"),
    audience: field(fm, "audience"),
    tags: field(fm, "tags").split(/[,，]\s*/).filter(Boolean),
    paragraphs: body.split(/\n\n+/).map((p) => p.trim()).filter(Boolean),
  };
}
