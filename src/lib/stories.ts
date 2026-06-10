import { promises as fs } from "fs";
import path from "path";

export interface Story {
  slug: string;
  title: string;
  /** 适读年龄段, 如 "3-6" */
  age: string;
  /** 主题标签, 如 "勇气" */
  theme: string;
  /** 一句话寓意 */
  moral: string;
  /** 发布日期 YYYY-MM-DD */
  date: string;
  /** 是否有配套朗读音频 public/audio/<slug>.mp3 */
  hasAudio: boolean;
  /** 正文段落 */
  paragraphs: string[];
}

const STORIES_DIR = path.join(process.cwd(), "content", "stories");
const AUDIO_DIR = path.join(process.cwd(), "public", "audio");

/** 单行 YAML 标量 (同站内其他项目的 line-based 解析口径, 不引 yaml 依赖) */
function field(fm: string, key: string): string {
  const m = fm.match(new RegExp(`^${key}:\\s*"?(.*?)"?\\s*$`, "m"));
  return m ? m[1] : "";
}

async function parseStory(file: string): Promise<Story | null> {
  const raw = await fs.readFile(path.join(STORIES_DIR, file), "utf-8");
  if (!raw.startsWith("---")) return null;
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return null;
  const fm = raw.slice(3, end);
  const body = raw.slice(end + 4).trim();
  const slug = file.replace(/\.md$/, "");
  const hasAudio = await fs
    .access(path.join(AUDIO_DIR, `${slug}.mp3`))
    .then(() => true)
    .catch(() => false);
  return {
    slug,
    title: field(fm, "title"),
    age: field(fm, "age"),
    theme: field(fm, "theme"),
    moral: field(fm, "moral"),
    date: field(fm, "date"),
    hasAudio,
    paragraphs: body.split(/\n\n+/).map((p) => p.trim()).filter(Boolean),
  };
}

export async function getStories(): Promise<Story[]> {
  let files: string[];
  try {
    files = await fs.readdir(STORIES_DIR);
  } catch {
    return [];
  }
  const stories = await Promise.all(
    files.filter((f) => f.endsWith(".md")).map(parseStory),
  );
  return (stories.filter(Boolean) as Story[]).sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug),
  );
}

export async function getStory(slug: string): Promise<Story | null> {
  const stories = await getStories();
  return stories.find((s) => s.slug === slug) ?? null;
}
