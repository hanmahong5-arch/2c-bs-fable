import { NextResponse } from "next/server";
import { getArticle } from "@/lib/articles";
import { putArticleAudio } from "@/lib/audio-storage";
import { bjToday } from "@/lib/beijing";
import {
  claimArticleSynthSlot,
  getArticleAudio,
  getSubscriberByToken,
  releaseArticleSynthSlot,
  setArticleAudio,
} from "@/lib/store";
import { synthPart } from "@/lib/story-gen";

/**
 * 「用我的声音念这篇」(七期 D3): 内容库任意文章 → 订户克隆音色合成。
 * 安全红线天然满足: 只念站内已过安全门的文章 (与「不提供任意文本朗读」承诺一致)。
 * 防 GPU 滥用: trial/active 户每日 1 篇 (SETNX 配额, 失败释放); 正文截前 800 字 (控合成时长)。
 */
export const maxDuration = 300;

const MAX_CHARS = 800;

function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  let body: { token?: string; category?: string; slug?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return fail(400, "invalid json");
  }

  const sub = await getSubscriberByToken(body.token ?? "");
  if (!sub) return fail(401, "unauthorized");
  if (sub.status !== "trial" && sub.status !== "active") {
    return fail(403, "连载已暂停，续订后就能继续用你的声音念文章啦。");
  }
  if (!sub.voiceId) return fail(400, "还没有你的声音——先在电台页录一段，再来念这篇。");

  const category = String(body.category ?? "");
  const slug = String(body.slug ?? "");
  const article = await getArticle(category, slug); // 内部已做 slug 白名单校验
  if (!article) return fail(404, "这篇文章不存在。");

  // 已念过 → 直接返回, 不耗配额
  const existing = await getArticleAudio(sub.id, slug);
  if (existing) return NextResponse.json({ ok: true, url: existing.url, cached: true });

  const date = bjToday();
  if (!(await claimArticleSynthSlot(sub.id, date))) {
    return fail(429, "今天的一篇已用，明天再来——你的声音每天可以念一篇。");
  }

  try {
    // 标题 + 正文段落, 截前 MAX_CHARS 字 (精华版)
    const parts: string[] = [`${article.title}。`];
    let used = 0;
    let truncated = false;
    for (const p of article.paragraphs) {
      if (used + p.length > MAX_CHARS) {
        // 首段就超长 → 截断收进, 保证至少有正文可念
        if (used === 0) parts.push(p.slice(0, MAX_CHARS));
        truncated = true;
        break;
      }
      parts.push(p);
      used += p.length;
    }

    const bufs: Buffer[] = [];
    for (const p of parts) {
      bufs.push(await synthPart(p, `custom:${sub.voiceId}`));
    }
    const mp3 = Buffer.concat(bufs);

    const url = await putArticleAudio(sub.audioKey, slug, mp3);
    await setArticleAudio(sub.id, {
      slug,
      category,
      title: article.title,
      url,
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, url, truncated });
  } catch (e) {
    // 合成失败不吞当日配额
    await releaseArticleSynthSlot(sub.id, date).catch(() => {});
    console.error(`[articles/synth] ${sub.id}/${slug} FAIL: ${(e as Error).message}`);
    return fail(502, "工坊这会儿忙不过来，稍后再试一次。");
  }
}
