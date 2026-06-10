import { promises as fs } from "fs";
import path from "path";
import type { Story } from "./stories";

const BASE = "https://fable.xin";
const AUDIO_DIR = path.join(process.cwd(), "public", "audio");
const COVER_PATH = path.join(process.cwd(), "public", "podcast-cover.png");

// 服务端固定 24kHz/48kbps CBR mono (见 gen-story.ts), 时长可从字节数直接推算
const MP3_BYTES_PER_SECOND = 48_000 / 8;

const CHANNEL_TITLE = "寓言星球 · 每天一个睡前故事";
const CHANNEL_DESCRIPTION =
  "寓言星球（fable.xin）每天创作一篇原创中文睡前寓言，配轻柔的情感朗读音频。" +
  "AI 创作、自动安全过滤加人工抽查，适合 3-8 岁孩子哄睡与磨耳朵。";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** date "YYYY-MM-DD" → RFC822, 统一按北京时间当晚 19:00 发布 */
function rfc822(date: string): string {
  const d = new Date(`${date}T19:00:00+08:00`);
  if (Number.isNaN(d.getTime())) return new Date().toUTCString();
  return d.toUTCString();
}

function hhmmss(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

interface Episode {
  story: Story;
  bytes: number;
}

async function withAudioBytes(stories: Story[]): Promise<Episode[]> {
  const episodes: Episode[] = [];
  for (const story of stories) {
    if (!story.hasAudio) continue;
    try {
      const stat = await fs.stat(path.join(AUDIO_DIR, `${story.slug}.mp3`));
      episodes.push({ story, bytes: stat.size });
    } catch {
      // mp3 在 getStories 和 stat 之间消失 — 跳过该条
    }
  }
  return episodes;
}

function itemXml({ story, bytes }: Episode): string {
  const link = `${BASE}/stories/${story.slug}`;
  const audioUrl = `${BASE}/audio/${story.slug}.mp3`;
  const duration = hhmmss(Math.round(bytes / MP3_BYTES_PER_SECOND));
  const summary = `${story.moral} —— ${story.paragraphs[0] ?? ""}`.slice(0, 240);
  return `    <item>
      <title>${escapeXml(story.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="false">${escapeXml(story.slug)}</guid>
      <pubDate>${rfc822(story.date)}</pubDate>
      <description><![CDATA[${summary}]]></description>
      <enclosure url="${audioUrl}" type="audio/mpeg" length="${bytes}" />
      <itunes:duration>${duration}</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
      <itunes:episodeType>full</itunes:episodeType>
    </item>`;
}

export async function renderPodcastRss(stories: Story[]): Promise<string> {
  const episodes = await withAudioBytes(stories);
  const latest = episodes[0]?.story.date ?? new Date().toISOString().slice(0, 10);
  const hasCover = await fs
    .access(COVER_PATH)
    .then(() => true)
    .catch(() => false);
  const coverXml = hasCover
    ? `\n    <itunes:image href="${BASE}/podcast-cover.png" />
    <image>
      <url>${BASE}/podcast-cover.png</url>
      <title>${escapeXml(CHANNEL_TITLE)}</title>
      <link>${BASE}</link>
    </image>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>${escapeXml(CHANNEL_TITLE)}</title>
    <link>${BASE}</link>
    <description>${escapeXml(CHANNEL_DESCRIPTION)}</description>
    <language>zh-cn</language>
    <atom:link href="${BASE}/feed.xml" rel="self" type="application/rss+xml" />
    <lastBuildDate>${rfc822(latest)}</lastBuildDate>
    <generator>fable.xin</generator>
    <itunes:author>寓言星球 fable.xin</itunes:author>
    <itunes:summary>${escapeXml(CHANNEL_DESCRIPTION)}</itunes:summary>
    <itunes:owner>
      <itunes:name>寓言星球</itunes:name>
      <itunes:email>marvin.uu@gmail.com</itunes:email>
    </itunes:owner>
    <itunes:category text="Kids &amp; Family">
      <itunes:category text="Stories for Kids" />
    </itunes:category>
    <itunes:explicit>false</itunes:explicit>
    <itunes:type>episodic</itunes:type>${coverXml}
${episodes.map(itemXml).join("\n")}
  </channel>
</rss>
`;
}
