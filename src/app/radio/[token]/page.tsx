import type { Metadata } from "next";
import Link from "next/link";
import { Moon, Star } from "lucide-react";
import {
  getSubscriberByToken,
  listArticleAudios,
  listStories,
  listAllSubscribers,
  type Subscriber,
} from "@/lib/store";
import { bjDaysSince, bjHour, bjToday, parseSerialState } from "@/lib/beijing";
import { AUDIO_KEEP_DAYS, UNLOCK_HOUR } from "@/lib/constants";
import NightCard from "@/components/ui/NightCard";
import {
  AddToHomeGuide,
  InstantFirstStarter,
  NoteBox,
  RememberRadio,
  StoryCard,
  VoiceManager,
  WeeklyPack,
  type StoryView,
} from "./radio-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "亲声电台 — 用你的声音讲给孩子的连载故事",
  robots: { index: false, follow: false },
};

const FOUNDING_CAP = Number(process.env.FOUNDING_CAP ?? "100");

function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-5 py-20 text-center">
      <h1 className="font-display text-2xl">这个电台不存在或链接已更换</h1>
      <p className="mt-4 leading-relaxed text-ink-soft">
        如果你是订阅家庭，可能是链接换新了——在爱发电私信我们，核对订单后发你新链接。
      </p>
      <Link
        href="/custom"
        className="mt-8 inline-block rounded-full bg-night px-8 py-3 text-star hover:bg-night-deep transition-colors"
      >
        先去听听自己声音的试听
      </Link>
    </div>
  );
}

/** 付费墙卡片: 第 3 晚后展示, 未来 7 晚标题预告 + 家长捎的话具象化「不续就听不到」。 */
function Paywall({ sub, upcoming, seatsLeft, pendingNote }: { sub: Subscriber; upcoming: string[]; seatsLeft: number; pendingNote: string }) {
  const afdianUrl = process.env.AFDIAN_PLAN_URL ?? "";
  // 家庭码 = sub.id: webhook 用它自动匹配订单, 比贴整条链接靠谱
  const remark = `家庭码 ${sub.id} 孩子昵称 ${sub.childName}`;
  return (
    <NightCard className="p-6">
      <p className="text-sm text-moon">3 晚免费连载已讲完</p>
      <h2 className="mt-2 font-display text-2xl leading-snug text-star-soft">
        {sub.childName}的故事，才刚刚开始
      </h2>
      {upcoming.length > 0 && (
        <div className="mt-4">
          <p className="text-sm text-moon">未来 7 晚，工坊已经为{sub.childName}排好了：</p>
          <ul className="mt-2 space-y-1 text-sm text-star-soft/90">
            {upcoming.slice(0, 7).map((t, i) => (
              <li key={i} className="flex items-start gap-2">
                <Moon size={13} className="mt-1 shrink-0 text-moon" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}
      {pendingNote && (
        <p className="mt-4 rounded-xl bg-night-deep/60 px-4 py-3 text-sm leading-relaxed text-star-soft">
          你捎的话『{pendingNote}』，会写进{sub.childName}的第 4 晚。
        </p>
      )}
      <p className="mt-5 text-sm leading-relaxed text-moon">
        成为「创始家庭」，每晚都有一个为{sub.childName}新写的故事，用你的声音念给 TA。
        工坊每晚逐户生成，本期仅余 <strong className="text-star">{seatsLeft}</strong> 席。
      </p>
      <div className="mt-5">
        {afdianUrl ? (
          <a
            href={afdianUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-full bg-star px-8 py-3 font-medium text-night hover:bg-star-soft transition-colors"
          >
            在爱发电开通连载
          </a>
        ) : (
          <a
            href={`mailto:marvin.uu@gmail.com?subject=${encodeURIComponent("开通亲声连载")}&body=${encodeURIComponent(remark)}`}
            className="inline-block rounded-full bg-star px-8 py-3 font-medium text-night hover:bg-star-soft transition-colors"
          >
            联系我们开通连载
          </a>
        )}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-moon/80">
        付款时请在留言里粘贴：
        <code className="mx-1 rounded bg-night-deep px-1.5 py-0.5">{remark}</code>
        我们据此自动开通，无需注册。
      </p>
    </NightCard>
  );
}

export default async function RadioPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const sub = await getSubscriberByToken(token);
  if (!sub) return <NotFound />;

  const today = bjToday();
  const unlocked = bjHour() >= UNLOCK_HOUR;
  const all = await listStories(sub.id, 60);
  const articleAudios = (await listArticleAudios(sub.id)).slice(0, 5);

  const views: StoryView[] = all.map((s) => {
    const archived = bjDaysSince(s.date) >= AUDIO_KEEP_DAYS;
    let paragraphs: string[] = [];
    try {
      paragraphs = JSON.parse(s.paragraphs) as string[];
    } catch {
      paragraphs = [s.paragraphs];
    }
    return {
      date: s.date,
      title: s.title,
      paragraphs,
      moral: s.moral,
      audioUrl: archived ? "" : s.audioUrl,
      starred: s.starred === "1",
      archived,
      note: s.note,
    };
  });

  // 解锁绕过 (七期 D1): 第一晚即时生成完就立即可见; 第 2 晚起回到 19:00 仪式感
  const instantUnlock = sub.status === "trial" && all.length === 1;
  const tonight = unlocked || instantUnlock ? views.find((v) => v.date === today) : undefined;
  // 即时首晚: 文本已落、音频后台合成中 → 故事卡限时轮询自动刷出音频 (不用手动刷新)
  const tonightAudioPending =
    sub.status === "trial" && all.length === 1 && Boolean(tonight) && !tonight?.audioUrl;
  const history = views.filter((v) => v !== tonight);
  const starCount = views.filter((v) => v.starred).length;
  const serial = parseSerialState(sub.serialState);
  const nights = views.length;

  // 即时首晚 (七期 D1): 刚开通、一晚都没有 → 渲染生成等待动画 (挂载即触发 instant-first)
  const instantPending = sub.status === "trial" && all.length === 0 && Boolean(sub.voiceId);

  const trialDone = sub.status === "trial" && nights >= 3;
  const expired = sub.status === "expired" || sub.status === "refunded";
  const showPaywall = trialDone || expired;
  const weeklyAvailable = views.some((v) => v.audioUrl && bjDaysSince(v.date) < 7);

  // 真实余量: 创始家庭名额 = 容量帽 − 现役付费户 (不做假稀缺)
  let seatsLeft = 0;
  if (showPaywall) {
    const paid = (await listAllSubscribers()).filter((s) => s.status === "active").length;
    seatsLeft = Math.max(0, FOUNDING_CAP - paid);
  }

  return (
    <div className="mx-auto max-w-2xl px-5 pt-10 pb-[calc(2.5rem_+_env(safe-area-inset-bottom))]">
      <RememberRadio token={token} />
      {/* 孩子的星空: 视觉锚 + 已点亮星星 */}
      <NightCard className="px-6 py-8 text-center">
        <p className="text-sm tracking-widest text-moon">亲 声 电 台</p>
        <h1 className="mt-2 font-display text-3xl text-star-soft">{sub.childName}的星空</h1>
        <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-moon">
          <Star size={14} className="fill-amber-400 text-amber-400" aria-hidden />
          已点亮 {starCount} 颗星 · 每晚听完一个故事，就多一颗
        </p>
        {nights > 0 && (
          <p className="mt-1.5 text-xs text-moon/80">工坊已陪{sub.childName}走过第 {nights} 晚</p>
        )}
      </NightCard>

      {/* 状态条 */}
      {sub.status === "trial" && !trialDone && (
        <p className="mt-4 rounded-xl bg-star-soft/40 px-4 py-3 text-sm text-ink">
          免费连载第 {Math.min(nights, 3)} / 3 晚——每晚 19:00 解锁新故事。
        </p>
      )}
      {expired && (
        <p className="mt-4 rounded-xl bg-star-soft/40 px-4 py-3 text-sm leading-relaxed text-ink">
          连载暂停了：{sub.childName}的故事档案和你的声音设置我们会保存 90 天，
          随时续订就从这里继续讲。已生成的故事文字一直可以看。
        </p>
      )}

      {/* 今晚 */}
      <section className="mt-8">
        {tonight ? (
          <StoryCard token={token} story={tonight} tonight pendingAudio={tonightAudioPending} />
        ) : instantPending ? (
          <InstantFirstStarter token={token} childName={sub.childName} />
        ) : (
          <div className="rounded-2xl border border-star bg-night starfield p-6 text-center text-paper">
            {!unlocked ? (
              <>
                <Moon size={20} className="mx-auto text-moon" aria-hidden />
                <p className="mt-3 font-display text-lg text-star-soft">今晚的故事 19:00 解锁</p>
                <p className="mt-2 text-sm text-moon">工坊正在为{sub.childName}赶写今晚的新故事。</p>
              </>
            ) : (
              <p className="text-sm leading-relaxed text-moon">
                今晚工坊休息了一晚，明天的故事会准时来；下面的往期故事随时可以重听。
              </p>
            )}
          </div>
        )}
      </section>

      {/* 给工坊捎句话 (D1): expired 隐藏; trial 第 3 晚后变体为付费钩子 */}
      {!expired && (
        <section className="mt-6">
          <NoteBox
            token={token}
            childName={sub.childName}
            defaultNote={sub.pendingNote}
            variant={trialDone ? "trialDone" : "normal"}
          />
        </section>
      )}

      {/* 付费墙 (trial 第 3 晚后 / 过期) */}
      {showPaywall && (
        <section className="mt-6">
          <Paywall
            sub={sub}
            upcoming={serial.upcoming ?? []}
            seatsLeft={seatsLeft}
            pendingNote={trialDone ? sub.pendingNote : ""}
          />
        </section>
      )}

      {/* 工具卡 */}
      <section className="mt-6 space-y-3">
        <AddToHomeGuide />
        <WeeklyPack token={token} available={weeklyAvailable} />
      </section>

      {/* 往期 */}
      {history.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 font-display text-xl">往期故事</h2>
          <div className="space-y-3">
            {history.map((s) => (
              <StoryCard key={s.date} token={token} story={s} />
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-soft">
            故事文字永久保留；朗读音频保留 14 天后归档（需要长期保存可每周下载故事包）。
          </p>
        </section>
      )}

      {/* 我的声音 */}
      <section className="mt-10">
        <h2 className="mb-4 font-display text-xl">我的声音</h2>
        <VoiceManager token={token} voiceSet={Boolean(sub.voiceId)} />
        <ul className="mt-5 space-y-1.5 text-xs leading-relaxed text-ink-soft">
          <li>① 你的声音只住在你家的故事里——不共享、不用于其他用途。</li>
          <li>② 随时一键删除，云端录音样本与声音模型即时清除。</li>
          <li>③ 它只能念我们为孩子生成并安全审核过的故事，不提供任意文本朗读。</li>
        </ul>

        {/* 七期 D3: 声音资产可见化 — 内容库里「用我的声音念」过的文章 */}
        {articleAudios.length > 0 && (
          <div className="mt-6 rounded-2xl border border-ink/10 bg-white p-4">
            <p className="text-sm font-medium text-ink">用你的声音念过的文章</p>
            <ul className="mt-3 space-y-2">
              {articleAudios.map((a) => (
                <li key={a.slug} className="text-sm">
                  <Link
                    href={`/articles/${a.category}/${a.slug}`}
                    className="text-ink underline hover:text-night"
                  >
                    {a.title}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-soft">
              在<Link href="/articles" className="underline">内容库</Link>任何一篇文章里，都可以让你的声音念给孩子听（每天一篇）。
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
