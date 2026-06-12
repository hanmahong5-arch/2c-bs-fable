import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getArticle, getArticleIndex, getCategories } from "@/lib/articles";
import ReadInMyVoice from "./read-in-my-voice";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ category: string; slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category, slug } = await params;
  const a = await getArticle(category, slug);
  if (!a) return {};
  return {
    title: `${a.title} — 寓言星球`,
    description: a.description,
  };
}

export default async function ArticlePage({ params }: Props) {
  const { category, slug } = await params;
  const a = await getArticle(category, slug);
  if (!a) notFound();
  const cat = (await getCategories()).find((c) => c.key === a.category);

  // 同品类「再读一篇」: 索引内取相邻 4 篇 (停留时长 + 内链权重)
  const siblings = (await getArticleIndex())
    .filter((x) => x.category === a.category && x.slug !== a.slug)
    .slice(0, 4);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    description: a.description,
    datePublished: a.date,
    inLanguage: "zh-CN",
    url: `https://fable.xin/articles/${a.category}/${a.slug}`,
    author: { "@type": "Organization", name: "寓言星球 fable.xin", url: "https://fable.xin" },
    publisher: { "@type": "Organization", name: "寓言星球 fable.xin" },
  };

  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <p className="text-sm text-ink-soft mb-2">
        <Link href="/articles" className="underline hover:text-ink">亲子内容库</Link>
        {cat && (
          <>
            {" · "}
            <Link href={`/articles/${cat.key}`} className="underline hover:text-ink">{cat.name}</Link>
          </>
        )}
      </p>
      <h1 className="font-display text-3xl leading-snug">{a.title}</h1>
      <p className="mt-2 text-sm text-ink-soft">
        {a.date}
        {a.audience && ` · ${a.audience}`}
      </p>

      <article className="mt-8 space-y-4 leading-relaxed text-ink">
        {a.paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </article>

      {a.tags.length > 0 && (
        <p className="mt-6 text-xs text-ink-soft">{a.tags.map((t) => `#${t}`).join("  ")}</p>
      )}

      {/* 七期 D3: 声音资产日常化 — 有电台的用户一键亲声朗读, 没有的进录音漏斗 */}
      <ReadInMyVoice category={a.category} slug={a.slug} />

      {/* 商业闭环: 内容库 → 亲声连载漏斗 */}
      <div className="mt-10 rounded-2xl bg-night starfield p-6 text-paper">
        <h2 className="font-display text-xl text-star-soft">想要一个只属于你家孩子的故事吗？</h2>
        <p className="mt-2 text-sm leading-relaxed text-moon">
          「亲声·连载」每晚为你的孩子新写一个 TA 自己当主角的故事，用你的声音念给 TA 听。
          先免费试听 30 秒你自己声音的版本。
        </p>
        <Link
          href="/custom"
          className="mt-4 inline-block rounded-full bg-star px-7 py-2.5 text-sm font-medium text-night hover:bg-star-soft transition-colors"
        >
          免费试听我的声音
        </Link>
      </div>

      {siblings.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-xl mb-4">再读一篇</h2>
          <ul className="space-y-3">
            {siblings.map((s) => (
              <li key={s.slug}>
                <Link
                  href={`/articles/${s.category}/${s.slug}`}
                  className="block rounded-xl border border-ink/10 bg-white px-5 py-3 hover:shadow-md transition-shadow"
                >
                  <span className="font-display">{s.title}</span>
                  <span className="mt-0.5 block text-xs text-ink-soft line-clamp-1">{s.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
