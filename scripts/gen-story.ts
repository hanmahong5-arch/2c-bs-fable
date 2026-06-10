#!/usr/bin/env bun
/**
 * gen-story.ts — 生成原创睡前故事 (md) + 情感朗读音频 (mp3)。
 *
 * 用法:
 *   NEWAPI_TRIAL_TOKEN=... COSY_API_KEY=... bun run scripts/gen-story.ts --count 8
 *   ... --no-audio          # 只出文本 (音频后补, 幂等: 已有 mp3 的故事跳过合成)
 *   ... --audio-only        # 只给缺音频的存量故事补音频
 *
 * 文本: newapi /v1/chat/completions (LLM 撰稿, JSON out)。
 * 音频: CosyVoice2 服务 /tts 逐段合成 → 二进制拼接 mp3 (同码率 CBR 直拼可播)。
 * env: NEWAPI_TRIAL_TOKEN 必须; COSY_URL 默认 R5; COSY_API_KEY 鉴权。
 */

import { promises as fs } from "fs";
import path from "path";

const ROOT = path.join(import.meta.dir, "..");
const STORIES_DIR = path.join(ROOT, "content", "stories");
const AUDIO_DIR = path.join(ROOT, "public", "audio");

const NEWAPI_URL = process.env.NEWAPI_URL ?? "https://newapi.lurus.cn/v1/chat/completions";
const TOKEN = process.env.NEWAPI_TRIAL_TOKEN ?? "";
const STORY_MODEL = process.env.STORY_MODEL ?? "deepseek-chat";
const COSY_URL = process.env.COSY_URL ?? "http://100.120.110.73:8123";
const COSY_API_KEY = process.env.COSY_API_KEY ?? "";

// 哄睡场景: 轻缓、安抚 (与新闻播报的明快语气相反)
const BEDTIME_INSTRUCT =
  "用非常温柔、轻缓、安抚的睡前故事语气朗读，语速放慢，像妈妈在床边哄孩子入睡。";

const THEMES = [
  "勇气", "诚实", "分享", "友爱", "坚持", "好奇心", "感恩", "耐心",
  "接纳自己", "帮助别人", "好好刷牙", "不怕黑", "上幼儿园", "整理玩具",
];

const SYSTEM_PROMPT = `你是一位儿童文学作家，为 3-8 岁中国孩子写原创睡前寓言。要求：
1. 完全原创，不复述龟兔赛跑等已有寓言；主角是小动物或小物件，名字朗朗上口。
2. 结构：角色登场 → 遇到小困境 → 尝试与成长 → 温暖结尾。结尾必须平静、适合入睡，不留悬念不吓人。
3. 500-700 字，分 5-8 个自然段；语言口语化、有画面感，多用叠词和拟声词；零暴力零恐怖零说教腔。
4. 严格输出 JSON：{"title":"<标题,不带书名号>","slug":"<英文小写连字符,如 little-fox-lantern>","age":"<如 3-6>","theme":"<主题词>","moral":"<给孩子的一句话寓意,20字内>","paragraphs":["段1","段2",...]}`;

interface StoryOut {
  title: string;
  slug: string;
  age: string;
  theme: string;
  moral: string;
  paragraphs: string[];
}

async function callStory(theme: string, avoidTitles: string[]): Promise<StoryOut> {
  const avoid = avoidTitles.length
    ? `\n最近已发布的故事标题（主角不要与其中任何一篇重复，换一种动物或物件）：${avoidTitles.join("、")}。`
    : "";
  const res = await fetch(NEWAPI_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({
      model: STORY_MODEL,
      temperature: 1.1,
      max_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `今晚的主题：${theme}。写一篇新故事。${avoid}` },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`llm ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  const out = JSON.parse(data.choices[0].message.content) as StoryOut;
  if (!out.title || !out.slug || !out.paragraphs?.length || !out.moral) {
    throw new Error(`bad story json: ${JSON.stringify(out).slice(0, 150)}`);
  }
  return out;
}

// 第二次独立 LLM 调用做安全自检 (红线: 暴力/恐怖/广告植入/不当价值观; 结尾须平静适合入睡)
const SAFETY_PROMPT = `你是儿童内容安全审核员。审核一篇给 3-8 岁孩子的睡前故事，红线：
1. 暴力、打斗、死亡、受伤描写；2. 恐怖、惊吓、悬念结尾；3. 品牌广告、产品植入；
4. 不当价值观（歧视、欺凌未被纠正、危险行为示范）；5. 结尾不平静、不适合入睡。
严格输出 JSON：{"safe": true/false, "reason": "<不通过时一句话说明,通过则空串>"}`;

async function checkSafety(story: StoryOut): Promise<{ safe: boolean; reason: string }> {
  const res = await fetch(NEWAPI_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({
      model: STORY_MODEL,
      temperature: 0,
      max_tokens: 200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SAFETY_PROMPT },
        { role: "user", content: `标题：${story.title}\n寓意：${story.moral}\n\n${story.paragraphs.join("\n\n")}` },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`safety ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  const out = JSON.parse(data.choices[0].message.content) as { safe?: boolean; reason?: string };
  if (typeof out.safe !== "boolean") throw new Error(`bad safety json: ${JSON.stringify(out).slice(0, 150)}`);
  return { safe: out.safe, reason: out.reason ?? "" };
}

async function synthPart(text: string): Promise<Buffer> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (COSY_API_KEY) headers.Authorization = `Bearer ${COSY_API_KEY}`;
  const res = await fetch(`${COSY_URL}/tts`, {
    method: "POST",
    headers,
    body: JSON.stringify({ text, lang: "zh", instruct: BEDTIME_INSTRUCT }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`tts ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error("empty audio");
  return buf;
}

// 逐段合成 → 直拼 (服务端固定 24kHz/48kbps CBR mono, 同参数 MPEG 帧直拼可播)
async function makeAudio(story: { title: string; moral: string; paragraphs: string[] }, outPath: string): Promise<void> {
  const parts = [
    `${story.title}。`,
    ...story.paragraphs,
    `今晚的小种子：${story.moral}。晚安，好梦。`,
  ];
  const bufs: Buffer[] = [];
  for (const p of parts) {
    bufs.push(await synthPart(p));
  }
  await fs.writeFile(outPath, Buffer.concat(bufs));
}

/** 最近 n 篇故事标题 (文件名 date 前缀升序 → 取尾部即最新), 喂给 prompt 避免主角撞车 */
async function recentTitles(files: string[], n = 10): Promise<string[]> {
  const md = files.filter((f) => f.endsWith(".md")).sort().slice(-n);
  const titles: string[] = [];
  for (const f of md) {
    const raw = await fs.readFile(path.join(STORIES_DIR, f), "utf-8");
    const m = raw.match(/^title:\s*"?(.*?)"?\s*$/m);
    if (m?.[1]) titles.push(m[1]);
  }
  return titles;
}

function mdFor(story: StoryOut, date: string): string {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ");
  return `---
title: "${esc(story.title)}"
age: "${esc(story.age)}"
theme: "${esc(story.theme)}"
moral: "${esc(story.moral)}"
date: "${date}"
---

${story.paragraphs.map((p) => p.trim()).join("\n\n")}
`;
}

async function main(): Promise<void> {
  if (!TOKEN) {
    console.error("[gen] NEWAPI_TRIAL_TOKEN missing");
    process.exit(1);
  }
  const argv = process.argv.slice(2);
  const noAudio = argv.includes("--no-audio");
  const audioOnly = argv.includes("--audio-only");
  const cntIdx = argv.indexOf("--count");
  const count = cntIdx >= 0 ? Number(argv[cntIdx + 1]) || 1 : 1;

  await fs.mkdir(STORIES_DIR, { recursive: true });
  await fs.mkdir(AUDIO_DIR, { recursive: true });
  const existing = await fs.readdir(STORIES_DIR);

  if (audioOnly) {
    let made = 0;
    for (const f of existing.filter((f) => f.endsWith(".md"))) {
      const slug = f.replace(/\.md$/, "");
      const mp3 = path.join(AUDIO_DIR, `${slug}.mp3`);
      if (await fs.access(mp3).then(() => true).catch(() => false)) continue;
      const raw = await fs.readFile(path.join(STORIES_DIR, f), "utf-8");
      const end = raw.indexOf("\n---", 3);
      const fm = raw.slice(3, end);
      const get = (k: string) => fm.match(new RegExp(`^${k}:\\s*"?(.*?)"?\\s*$`, "m"))?.[1] ?? "";
      const paragraphs = raw.slice(end + 4).trim().split(/\n\n+/).filter(Boolean);
      console.error(`[gen] audio for ${slug}...`);
      await makeAudio({ title: get("title"), moral: get("moral"), paragraphs }, mp3);
      made++;
    }
    console.error(`[gen] audio-only done: ${made} mp3`);
    return;
  }

  const date = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < count; i++) {
    const theme = THEMES[Math.floor(Math.random() * THEMES.length)];
    const avoid = await recentTitles(existing);
    // 生成 → 安全自检; 不过审丢弃重生成 (最多 3 次尝试), 全失败当次跳过
    let story: StoryOut | null = null;
    for (let attempt = 1; attempt <= 3 && !story; attempt++) {
      let candidate: StoryOut;
      try {
        candidate = await callStory(theme, avoid);
      } catch (e) {
        console.error(`[gen] FAIL story(${theme}, attempt ${attempt}): ${(e as Error).message}`);
        continue;
      }
      try {
        const verdict = await checkSafety(candidate);
        if (verdict.safe) {
          story = candidate;
        } else {
          console.error(`[gen] UNSAFE (attempt ${attempt}) 《${candidate.title}》: ${verdict.reason} → 丢弃重生成`);
        }
      } catch (e) {
        // 自检自身失败 → 保守处理: 丢弃该篇 (宁可不发, 不发未审内容)
        console.error(`[gen] safety check error (attempt ${attempt}): ${(e as Error).message} → 丢弃`);
      }
    }
    if (!story) {
      console.error(`[gen] FAIL story(${theme}): 3 次尝试未产出过审故事, 跳过`);
      continue;
    }
    let base = `${date}-${story.slug.toLowerCase().replace(/[^a-z0-9-]/g, "")}`;
    if (existing.includes(`${base}.md`)) base = `${base}-${i + 2}`;
    existing.push(`${base}.md`);
    await fs.writeFile(path.join(STORIES_DIR, `${base}.md`), mdFor(story, date), "utf-8");
    console.error(`[gen] wrote ${base}.md (${story.title} / ${theme})`);

    if (!noAudio) {
      try {
        await makeAudio(story, path.join(AUDIO_DIR, `${base}.mp3`));
        console.error(`[gen] audio ${base}.mp3`);
      } catch (e) {
        console.error(`[gen] FAIL audio ${base}: ${(e as Error).message} (文本已保留, 可 --audio-only 补)`);
      }
    }
  }
}

await main();
