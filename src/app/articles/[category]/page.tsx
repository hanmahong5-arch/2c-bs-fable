import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getArticleIndex, getCategories } from "@/lib/articles";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface Props {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params;
  const cat = (await getCategories()).find((c) => c.key === category);
  if (!cat) return {};
  return {
    title: `${cat.name} — 寓言星球亲子内容库`,
    description: `寓言星球${cat.name}专栏，面向${cat.audience}，原创内容每天更新。`,
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { category } = await params;
  const { page: pageRaw } = await searchParams;
  const cat = (await getCategories()).find((c) => c.key === category);
  if (!cat) notFound();

  const all = (await getArticleIndex()).filter((a) => a.category === category);
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(pageRaw) || 1));
  const items = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <p className="text-sm text-ink-soft mb-2">
        <Link href="/articles" className="underline hover:text-ink">亲子内容库</Link>
      </p>
      <h1 className="font-display text-3xl mb-2">{cat.name}</h1>
      <p className="text-ink-soft mb-10">{cat.audience} · 共 {all.length} 篇</p>

      <ul className="space-y-3">
        {items.map((a) => (
          <li key={a.slug}>
            <Link
              href={`/articles/${a.category}/${a.slug}`}
              className="block rounded-xl border border-ink/10 bg-white px-5 py-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-display text-lg">{a.title}</h2>
                <span className="shrink-0 text-xs text-ink-soft">{a.date}</span>
              </div>
              <p className="mt-1 text-sm text-ink-soft line-clamp-2">{a.description}</p>
            </Link>
          </li>
        ))}
      </ul>
      {items.length === 0 && <p className="text-ink-soft">内容正在创作中。</p>}

      {pages > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-4 text-sm" aria-label="分页">
          {page > 1 && (
            <Link href={`/articles/${category}?page=${page - 1}`} className="underline hover:text-ink">
              上一页
            </Link>
          )}
          <span className="text-ink-soft">第 {page} / {pages} 页</span>
          {page < pages && (
            <Link href={`/articles/${category}?page=${page + 1}`} className="underline hover:text-ink">
              下一页
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
