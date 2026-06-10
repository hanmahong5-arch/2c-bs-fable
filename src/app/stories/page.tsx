import type { Metadata } from "next";
import Link from "next/link";
import { getStories } from "@/lib/stories";

export const metadata: Metadata = {
  title: "故事库 — 原创睡前故事与寓言",
  description: "寓言星球全部原创睡前故事，按日期更新，每篇配情感朗读音频，免费收听。",
};

export default async function StoriesPage() {
  const stories = await getStories();

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="font-display text-3xl mb-2">故事库</h1>
      <p className="text-ink-soft mb-10">
        共 {stories.length} 篇原创故事，每天更新。带 🔊 的可以直接收听。
      </p>
      <ul className="space-y-4">
        {stories.map((s) => (
          <li key={s.slug}>
            <Link
              href={`/stories/${s.slug}`}
              className="block rounded-xl border border-ink/10 bg-white px-5 py-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-display text-lg">{s.title}</h2>
                <span className="shrink-0 text-xs text-ink-soft">{s.date}</span>
              </div>
              <p className="mt-1 text-sm text-ink-soft">
                {s.theme} · 适合 {s.age} 岁{s.hasAudio ? " · 🔊 可收听" : ""}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      {stories.length === 0 && <p className="text-ink-soft">故事正在创作中。</p>}
    </div>
  );
}
