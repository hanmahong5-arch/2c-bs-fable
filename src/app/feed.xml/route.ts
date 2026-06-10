import { getStories } from "@/lib/stories";
import { renderPodcastRss } from "@/lib/rss";

export const dynamic = "force-static";

export async function GET(): Promise<Response> {
  const stories = await getStories();
  const xml = await renderPodcastRss(stories);
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=600, s-maxage=600",
    },
  });
}
