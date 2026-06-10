import type { MetadataRoute } from "next";
import { getStories } from "@/lib/stories";

const BASE = "https://fable.xin";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const stories = await getStories();
  const latest = stories[0]?.date ?? "2026-06-10";
  return [
    { url: BASE, lastModified: latest, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/stories`, lastModified: latest, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/custom`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/about`, changeFrequency: "monthly", priority: 0.5 },
    ...stories.map((s) => ({
      url: `${BASE}/stories/${s.slug}`,
      lastModified: s.date,
      changeFrequency: "yearly" as const,
      priority: 0.7,
    })),
  ];
}
