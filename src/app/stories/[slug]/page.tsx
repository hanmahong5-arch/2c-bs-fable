import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AudioPlayer from "@/components/AudioPlayer";
import { getStories, getStory } from "@/lib/stories";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const stories = await getStories();
  return stories.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const story = await getStory(slug);
  if (!story) return {};
  return {
    title: `${story.title} — 睡前故事`,
    description: `原创睡前故事《${story.title}》，适合 ${story.age} 岁，主题：${story.theme}。${story.moral}`,
  };
}

export default async function StoryPage({ params }: Props) {
  const { slug } = await params;
  const story = await getStory(slug);
  if (!story) notFound();

  return (
    <article className="mx-auto max-w-2xl px-5 py-12">
      <p className="text-sm text-ink-soft">
        {story.date} · {story.theme} · 适合 {story.age} 岁
      </p>
      <h1 className="font-display text-3xl mt-2 mb-8">{story.title}</h1>

      {story.hasAudio && (
        <div className="mb-10">
          <AudioPlayer src={`/audio/${story.slug}.mp3`} title={story.title} />
        </div>
      )}

      <div className="story-prose">
        {story.paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <aside className="mt-10 rounded-2xl bg-star-soft/40 border border-star px-6 py-5">
        <p className="text-sm font-medium text-ink">今晚的小种子</p>
        <p className="mt-1 text-ink-soft">{story.moral}</p>
      </aside>

      <div className="mt-12 flex flex-wrap gap-4 text-sm">
        <Link href="/stories" className="text-night underline hover:text-ink">
          ← 更多故事
        </Link>
        <Link href="/custom" className="text-night underline hover:text-ink">
          把孩子的名字写进故事 →
        </Link>
      </div>
    </article>
  );
}
