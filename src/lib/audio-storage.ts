/**
 * audio-storage.ts — 电台音频存储收口 (put/del/url 单点)。
 *
 * 现为 Vercel Blob 免费档 (1GB → v1 ≤30 订户硬帽);
 * 超 30 订户迁 Cloudflare R2 时只改此文件。
 * 路径约定: radio/<audioKey>/<date>.mp3 (audioKey 与 token 解耦,
 * 彻底撤销 = 换 audioKey + 删目录)。
 */
import { put, del, list } from "@vercel/blob";

function radioPath(audioKey: string, date: string): string {
  return `radio/${audioKey}/${date}.mp3`;
}

export async function putRadioAudio(audioKey: string, date: string, mp3: ArrayBuffer | Buffer): Promise<string> {
  const blob = await put(radioPath(audioKey, date), mp3 as ArrayBuffer, {
    access: "public",
    addRandomSuffix: false,
    contentType: "audio/mpeg",
    allowOverwrite: true,
  });
  return blob.url;
}

/** 文章亲声朗读 (七期 D3): 与电台音频同住 radio/<audioKey>/ 下, 撤销时一并删目录。 */
export async function putArticleAudio(audioKey: string, slug: string, mp3: ArrayBuffer | Buffer): Promise<string> {
  const blob = await put(`radio/${audioKey}/article-${slug}.mp3`, mp3 as ArrayBuffer, {
    access: "public",
    addRandomSuffix: false,
    contentType: "audio/mpeg",
    allowOverwrite: true,
  });
  return blob.url;
}

export async function deleteRadioAudio(urls: string[]): Promise<void> {
  if (urls.length) await del(urls);
}

/** 删除一个订户的全部电台音频 (撤销/退款清理)。 */
export async function deleteRadioFolder(audioKey: string): Promise<number> {
  let deleted = 0;
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: `radio/${audioKey}/`, cursor });
    const urls = page.blobs.map((b) => b.url);
    if (urls.length) {
      await del(urls);
      deleted += urls.length;
    }
    cursor = page.cursor;
  } while (cursor);
  return deleted;
}
