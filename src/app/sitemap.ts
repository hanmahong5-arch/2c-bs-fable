import type { MetadataRoute } from "next";
import { getStories } from "@/lib/stories";
import { getArticleIndex, getCategories } from "@/lib/articles";

const BASE = "https://fable.xin";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const stories = await getStories();
  const [articles, categories] = await Promise.all([getArticleIndex(), getCategories()]);
  const latest = stories[0]?.date ?? "2026-06-10";
  return [
    { url: BASE, lastModified: latest, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/stories`, lastModified: latest, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/articles`, lastModified: articles[0]?.date ?? latest, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/custom`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/about`, changeFrequency: "monthly", priority: 0.5 },
    ...categories.map((c) => ({
      url: `${BASE}/articles/${c.key}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...stories.map((s) => ({
      url: `${BASE}/stories/${s.slug}`,
      lastModified: s.date,
      changeFrequency: "yearly" as const,
      priority: 0.7,
    })),
    ...articles.map((a) => ({
      url: `${BASE}/articles/${a.category}/${a.slug}`,
      lastModified: a.date,
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
  ];
}
