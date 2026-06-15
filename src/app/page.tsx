import Link from "next/link";
import { BookOpenText, Mic, Moon, ShieldCheck, Sparkles, Volume2 } from "lucide-react";
import { getStories } from "@/lib/stories";
import { listAllSubscribers } from "@/lib/store";
import NightCard from "@/components/ui/NightCard";

// 创始家庭余量每小时刷新一次 (真实余量, 不做假稀缺)
export const revalidate = 3600;

const FOUNDING_CAP = Number(process.env.FOUNDING_CAP ?? "100");

async function foundingSeatsLeft(): Promise<number | null> {
  try {
    const paid = (await listAllSubscribers()).filter((s) => s.status === "active").length;
    return Math.max(0, FOUNDING_CAP - paid);
  } catch {
    return null; // Redis 不可达时不挡首页
  }
}

const SERIAL_STEPS = [
  { n: "1", title: "录 10 秒你的声音", desc: "工坊学会你的音色" },
  { n: "2", title: "填上孩子的小名", desc: "和 TA 最近的一件事" },
  { n: "3", title: "每晚 19:00 追更", desc: "TA 当主角的新故事，你的声音念" },
] as const;

export default async function Home() {
  const stories = await getStories();
  const latest = stories.slice(0, 3);
  const seatsLeft = await foundingSeatsLeft();

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
              href="/custom"
              className="rounded-full bg-star px-8 py-3 font-medium text-night hover:bg-star-soft transition-colors"
            >
              用我的声音讲故事
            </Link>
            <Link
              href="/stories"
              className="rounded-full border border-moon/40 px-8 py-3 text-moon hover:border-star hover:text-star transition-colors"
            >
              先听免费故事
            </Link>
          </div>
        </div>
      </section>

      {/* 亲声·连载 (商业核心) */}
      <section className="bg-white border-b border-ink/5">
        <div className="mx-auto max-w-5xl px-5 py-16">
          <p className="inline-flex items-center gap-2 rounded-full border border-ink/15 px-4 py-1 text-sm text-ink-soft">
            <Mic size={14} aria-hidden /> 亲声·连载
          </p>
          <h2 className="mt-4 font-display text-3xl leading-snug">
            每天晚上，为你家孩子新写一个
            <br />
            TA 自己当主角的故事——用你的声音念
          </h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-ink-soft">
            不是几万个孩子共听一个故事库。孩子的小名是主角，最近学的事（刷牙、分床、上幼儿园）织进情节，
            连载世界每晚追更；出差加班的夜里，念故事的还是妈妈、爸爸自己的声音。
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {SERIAL_STEPS.map((s) => (
              <div key={s.n} className="rounded-2xl border border-star bg-star-soft/30 px-4 py-5">
                <p className="font-display text-2xl text-night">{s.n}</p>
                <p className="mt-1 font-medium text-ink">{s.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">{s.desc}</p>
              </div>
            ))}
          </div>

          {/* 定价: 锚定定制绘本, 不与任何故事 App 比价 */}
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <NightCard className="p-6">
              <p className="text-sm text-moon">创始家庭 · 限 {FOUNDING_CAP} 席</p>
              <p className="mt-2 font-display text-3xl text-star-soft">
                ¥299<span className="text-base text-moon"> / 年</span>
              </p>
              <p className="mt-2 text-sm leading-relaxed text-moon">
                工坊每晚逐户生成，物理容量有限。
                {seatsLeft !== null && (
                  <>
                    本期仅余 <strong className="text-star">{seatsLeft}</strong> 席。
                  </>
                )}
              </p>
            </NightCard>
            <div className="rounded-2xl border border-ink/10 bg-white p-6">
              <p className="text-sm text-ink-soft">连载一年</p>
              <p className="mt-2 font-display text-3xl">
                ¥365<span className="text-base text-ink-soft"> / 年</span>
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                一天一块钱，365 个为 TA 新写的故事。一本定制绘本的价钱（¥99–199），只换一个故事；这里每晚都是新的。
              </p>
            </div>
            <div className="rounded-2xl border-2 border-star bg-star-soft/30 p-6">
              <p className="text-sm font-medium text-ink">先试试 · 0 元入口</p>
              <p className="mt-2 font-display text-3xl text-night">
                3 晚<span className="text-base text-ink-soft"> 免费</span>
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                录 10 秒声音就能开通，不付款、不注册——先让孩子听到 TA 自己的故事。
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/custom"
              className="rounded-full bg-night px-8 py-3 font-medium text-star hover:bg-night-deep transition-colors"
            >
              先免费听听自己的声音
            </Link>
            <p className="inline-flex items-center gap-1.5 text-sm text-ink-soft">
              <ShieldCheck size={15} aria-hidden />
              你的声音只住在你家的故事里 · 随时一键删除
            </p>
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
