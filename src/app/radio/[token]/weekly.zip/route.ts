import { zipSync } from "fflate";
import { getSubscriberByToken, listStories, markStoryListened } from "@/lib/store";
import { bjDaysSince } from "@/lib/beijing";

export const maxDuration = 60;

/**
 * 周故事包: 最近 7 晚有音频的故事打成 zip (~14MB), 喂牛听听等故事机用。
 * 按需打包不落盘; 文件名带日期+标题方便故事机里辨认。
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const sub = await getSubscriberByToken(token);
  if (!sub) return new Response("not found", { status: 404 });

  const stories = (await listStories(sub.id, 14)).filter(
    (s) => s.audioUrl && bjDaysSince(s.date) < 7,
  );
  if (stories.length === 0) {
    return new Response("本周还没有可下载的故事音频", { status: 404 });
  }

  const files: Record<string, Uint8Array> = {};
  for (const s of stories) {
    const res = await fetch(s.audioUrl);
    if (!res.ok) continue;
    const safeTitle = s.title.replace(/[\\/:*?"<>|]/g, "").slice(0, 24);
    files[`${s.date} ${safeTitle}.mp3`] = new Uint8Array(await res.arrayBuffer());
  }
  if (Object.keys(files).length === 0) {
    return new Response("音频暂时取不到，请稍后再试", { status: 502 });
  }

  // 下载即触达: 产品主动把收听推离网页 (故事机), 对本周最新一晚置位
  await markStoryListened(sub.id, stories[0].date);

  // mp3 已压缩, 存储级打包即可 (level 0, 快)
  const zip = zipSync(files, { level: 0 });
  return new Response(Buffer.from(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${sub.id}-weekly.zip"`,
      "X-Robots-Tag": "noindex, nofollow",
      "Cache-Control": "no-store",
    },
  });
}
