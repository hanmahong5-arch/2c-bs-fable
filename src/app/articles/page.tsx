import type { Metadata } from "next";
import Link from "next/link";
import { getArticleIndex, getCategories } from "@/lib/articles";

// 万篇级内容库: 列表页动态渲染 (索引文件随每次内容 commit 增长, 不进 SSG)
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "亲子内容库 — 哄睡故事·育儿知识·亲子互动",
  description: "寓言星球亲子内容库：睡前故事、育儿知识、亲子游戏、睡前科普，按孩子年龄与场景分类，每天更新。",
};

export default async function ArticlesPage() {
  const [index, categories] = await Promise.all([getArticleIndex(), getCategories()]);
  const countBy = new Map<string, number>();
  for (const a of index) countBy.set(a.category, (countBy.get(a.category) ?? 0) + 1);
  const latest = index.slice(0, 12);
  const catName = new Map(categories.map((c) => [c.key, c.name]));

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="font-display text-3xl mb-2">亲子内容库</h1>
      <p className="text-ink-soft mb-10">
        共 {index.length} 篇原创内容，覆盖哄睡、育儿、亲子互动，每天更新。
      </p>

      <h2 className="font-display text-xl mb-4">按需要找</h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {categories.map((c) => (
          <li key={c.key}>
            <Link
              href={`/articles/${c.key}`}
              className="block rounded-xl border border-ink/10 bg-white px-4 py-3 hover:shadow-md transition-shadow"
            >
              <span className="font-medium">{c.name}</span>
              <span className="mt-0.5 block text-xs text-ink-soft">
                {c.audience} · {countBy.get(c.key) ?? 0} 篇
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {latest.length > 0 && (
        <>
          <h2 className="font-display text-xl mt-10 mb-4">最新内容</h2>
          <ul className="space-y-3">
            {latest.map((a) => (
              <li key={a.slug}>
                <Link
                  href={`/articles/${a.category}/${a.slug}`}
                  className="block rounded-xl border border-ink/10 bg-white px-5 py-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="font-display text-lg">{a.title}</h3>
                    <span className="shrink-0 text-xs text-ink-soft">{a.date}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-soft line-clamp-2">
                    {catName.get(a.category) ?? a.category} · {a.description}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
