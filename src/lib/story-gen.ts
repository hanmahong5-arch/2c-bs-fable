/**
 * story-gen.ts — 故事生成公共函数 (公共日更 gen-story.ts / 电台管线 radio-pipeline.ts /
 * Vercel 即时生成 api/radio/instant-first 共用; 零 node-only 依赖, 两侧均可跑)。
 *
 * env: NEWAPI_TRIAL_TOKEN 必须; NEWAPI_URL / STORY_MODEL / COSY_URL / COSY_API_KEY 可覆盖。
 * COSY 地址: R5 管线设 COSY_URL (localhost 直连), Vercel 只有 COSY_PUBLIC_URL → 依次回退。
 */

export const NEWAPI_URL = process.env.NEWAPI_URL ?? "https://newapi.lurus.cn/v1/chat/completions";
export const TOKEN = process.env.NEWAPI_TRIAL_TOKEN ?? "";
export const STORY_MODEL = process.env.STORY_MODEL ?? "deepseek-chat";
export const COSY_URL =
  process.env.COSY_URL ?? process.env.COSY_PUBLIC_URL ?? "http://100.120.110.73:8123";
export const COSY_API_KEY = process.env.COSY_API_KEY ?? "";

// 哄睡场景: 轻缓、安抚 (与新闻播报的明快语气相反)
export const BEDTIME_INSTRUCT =
  "用非常温柔、轻缓、安抚的睡前故事语气朗读，语速放慢，像妈妈在床边哄孩子入睡。";

export interface StoryOut {
  title: string;
  slug: string;
  age: string;
  theme: string;
  moral: string;
  paragraphs: string[];
}

/** chat completion → JSON object (response_format 强制)。 */
export async function llmJson<T>(
  system: string,
  user: string,
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<T> {
  const res = await fetch(NEWAPI_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({
      model: STORY_MODEL,
      temperature: opts.temperature ?? 1.0,
      max_tokens: opts.maxTokens ?? 2000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`llm ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return JSON.parse(data.choices[0].message.content) as T;
}

// 第二次独立 LLM 调用做安全自检 (红线: 暴力/恐怖/广告植入/不当价值观)
const SAFETY_PROMPT = `你是儿童内容安全审核员。审核一篇给 3-8 岁孩子的睡前故事，红线：
1. 暴力、打斗、死亡、受伤描写；2. 恐怖、惊吓、悬念结尾；3. 品牌广告、产品植入；
4. 不当价值观（歧视、欺凌未被纠正、危险行为示范）；5. 结尾不平静、不适合入睡。
严格输出 JSON：{"safe": true/false, "reason": "<不通过时一句话说明,通过则空串>"}`;

// 连载版: 允许温和的「明晚再讲」式悬念 (恐怖惊吓仍是红线)
const SAFETY_PROMPT_SERIAL = `你是儿童内容安全审核员。审核一篇给 3-8 岁孩子的睡前连载故事，红线：
1. 暴力、打斗、死亡、受伤描写；2. 恐怖、惊吓（温和的「明晚继续讲」式连载悬念可以接受）；
3. 品牌广告、产品植入；4. 不当价值观（歧视、欺凌未被纠正、危险行为示范）；
5. 语气不平静、不适合入睡。
严格输出 JSON：{"safe": true/false, "reason": "<不通过时一句话说明,通过则空串>"}`;

export async function checkSafety(
  story: { title: string; moral: string; paragraphs: string[] },
  allowSerialHook = false,
): Promise<{ safe: boolean; reason: string }> {
  const out = await llmJson<{ safe?: boolean; reason?: string }>(
    allowSerialHook ? SAFETY_PROMPT_SERIAL : SAFETY_PROMPT,
    `标题：${story.title}\n寓意：${story.moral}\n\n${story.paragraphs.join("\n\n")}`,
    { temperature: 0, maxTokens: 200 },
  );
  if (typeof out.safe !== "boolean") {
    throw new Error(`bad safety json: ${JSON.stringify(out).slice(0, 150)}`);
  }
  return { safe: out.safe, reason: out.reason ?? "" };
}

/** 单段 TTS; voice="custom:<id>" 走克隆音色 (此时服务端忽略 instruct)。 */
export async function synthPart(text: string, voice?: string): Promise<Buffer> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (COSY_API_KEY) headers.Authorization = `Bearer ${COSY_API_KEY}`;
  const res = await fetch(`${COSY_URL}/tts`, {
    method: "POST",
    headers,
    body: JSON.stringify({ text, lang: "zh", instruct: BEDTIME_INSTRUCT, voice }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`tts ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error("empty audio");
  return buf;
}

/** 整篇逐段合成 → 直拼 mp3 Buffer (服务端固定 24kHz/48kbps CBR mono, 同参数帧直拼可播)。 */
export async function synthStory(
  story: { title: string; moral: string; paragraphs: string[] },
  voice?: string,
): Promise<Buffer> {
  const parts = [
    `${story.title}。`,
    ...story.paragraphs,
    `今晚的小种子：${story.moral}。晚安，好梦。`,
  ];
  const bufs: Buffer[] = [];
  for (const p of parts) {
    bufs.push(await synthPart(p, voice));
  }
  return Buffer.concat(bufs);
}
