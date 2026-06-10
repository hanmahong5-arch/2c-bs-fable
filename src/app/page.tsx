import Link from "next/link";
import { BookOpenText, Moon, Sparkles, Volume2 } from "lucide-react";
import { getStories } from "@/lib/stories";

export default async function Home() {
  const stories = await getStories();
  const latest = stories.slice(0, 3);

  return (
    <>
      {/* Hero: 夜空 */}
      <section className="bg-night starfield text-paper">
        <div className="mx-auto max-w-5xl px-5 py-20 md:py-28 text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-moon/30 px-4 py-1 text-sm text-moon">
            <Moon size={14} /> 每天一个新故事 · 全部免费收听
          </p>
          <h1 className="font-display text-4xl md:text-5xl leading-tight text-star-soft">
            每晚一个原创寓言
            <br />
            温柔讲给孩子听
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-moon leading-relaxed">
            寓言星球每天创作一篇全新的中文睡前故事，并配上轻柔的情感朗读。
            关掉大灯，点开播放，让故事陪孩子入睡。
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link
              href="/stories"
              className="rounded-full bg-star px-8 py-3 font-medium text-night hover:bg-star-soft transition-colors"
            >
              开始听故事
            </Link>
            <Link
              href="/custom"
              className="rounded-full border border-moon/40 px-8 py-3 text-moon hover:border-star hover:text-star transition-colors"
            >
              定制专属故事
            </Link>
          </div>
        </div>
      </section>

      {/* 最新故事 */}
      <section className="mx-auto max-w-5xl px-5 py-16">
        <h2 className="font-display text-2xl mb-8">最新故事</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {latest.map((s) => (
            <Link
              key={s.slug}
              href={`/stories/${s.slug}`}
              className="group rounded-2xl border border-ink/10 bg-white p-6 transition-shadow hover:shadow-lg"
            >
              <p className="text-xs text-ink-soft mb-2">
                {s.theme} · 适合 {s.age} 岁{s.hasAudio ? " · 🔊 可收听" : ""}
              </p>
              <h3 className="font-display text-lg leading-snug group-hover:text-night">
                {s.title}
              </h3>
              <p className="mt-3 text-sm text-ink-soft line-clamp-2">{s.moral}</p>
            </Link>
          ))}
        </div>
        {stories.length === 0 && (
          <p className="text-ink-soft">故事正在创作中，今晚回来看看。</p>
        )}
      </section>

      {/* 为什么 */}
      <section className="bg-white border-y border-ink/5">
        <div className="mx-auto max-w-5xl px-5 py-16 grid gap-10 md:grid-cols-3">
          <div>
            <Sparkles className="text-night mb-3" size={24} />
            <h3 className="font-medium mb-2">每天都是新故事</h3>
            <p className="text-sm text-ink-soft leading-relaxed">
              不是重复的老童话。每天一篇原创寓言，孩子听不腻，家长不用翻书找。
            </p>
          </div>
          <div>
            <Volume2 className="text-night mb-3" size={24} />
            <h3 className="font-medium mb-2">轻柔情感朗读</h3>
            <p className="text-sm text-ink-soft leading-relaxed">
              自研情感语音引擎，语气像妈妈哄睡一样轻柔，不是冷冰冰的机器音。
            </p>
          </div>
          <div>
            <BookOpenText className="text-night mb-3" size={24} />
            <h3 className="font-medium mb-2">每篇都有寓意</h3>
            <p className="text-sm text-ink-soft leading-relaxed">
              勇气、诚实、友爱…… 每个故事结尾都有一句给孩子的话，睡前轻轻种下一颗种子。
            </p>
          </div>
        </div>
      </section>

      {/* 定制 CTA */}
      <section className="mx-auto max-w-5xl px-5 py-16 text-center">
        <h2 className="font-display text-2xl">把孩子的名字写进故事里</h2>
        <p className="mx-auto mt-4 max-w-lg text-ink-soft leading-relaxed">
          主角叫孩子的名字、出现孩子喜欢的小动物和爱好——专属定制故事 + 专属朗读音频，内测限免开放中。
        </p>
        <Link
          href="/custom"
          className="mt-8 inline-block rounded-full bg-night px-8 py-3 text-star hover:bg-night-deep transition-colors"
        >
          了解定制故事
        </Link>
      </section>
    </>
  );
}
