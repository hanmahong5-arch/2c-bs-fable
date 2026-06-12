import type { Metadata } from "next";
import VoiceRecorder from "@/components/voice-recorder";
import ReturnVisitBanner from "@/components/return-visit-banner";

export const metadata: Metadata = {
  title: "用你的声音讲睡前故事 — 亲声试听",
  description:
    "录 10 秒你的声音，半分钟后听到「你自己」念的哄睡开场白。出差、加班、异地，也能用爸爸妈妈的声音陪孩子入睡。另可定制把孩子名字写进去的专属故事。",
};

// TODO(owner): 开通 hi@fable.xin 转发后替换收件地址
const MAILTO =
  "mailto:marvin.uu@gmail.com?subject=" +
  encodeURIComponent("定制故事申请") +
  "&body=" +
  encodeURIComponent(
    "孩子昵称：\n年龄：\n喜欢的动物/角色：\n想传达的主题（如勇气、分享）：\n其他想写进故事的细节：",
  );

const STEPS = [
  { n: "1", title: "录 10 秒", desc: "安静处自然说几句话，或上传一段录音" },
  { n: "2", title: "等半分钟", desc: "引擎学习你的声音的音色与语气" },
  { n: "3", title: "听到自己", desc: "用「你的声音」念的哄睡开场白" },
] as const;

export default function CustomPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <ReturnVisitBanner />
      {/* ── 亲声试听 (核心 funnel) ── */}
      <h1 className="font-display text-3xl">用你的声音，讲今晚的睡前故事</h1>
      <p className="mt-4 leading-relaxed text-ink-soft">
        出差、加班、异地的晚上，孩子要的不是更好听的主播——是
        <strong className="text-ink">妈妈、爸爸自己的声音</strong>。
        录一小段话，半分钟后，听听「你自己」念的哄睡开场白。
      </p>

      <div className="mt-8 grid grid-cols-3 gap-3 text-center">
        {STEPS.map((s) => (
          <div key={s.n} className="rounded-2xl border border-star bg-star-soft/30 px-3 py-4">
            <p className="font-display text-2xl text-night">{s.n}</p>
            <p className="mt-1 font-medium text-ink">{s.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">{s.desc}</p>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <VoiceRecorder />
      </div>

      {/* 信任三承诺: 非折叠, 录音动作前就看得见 */}
      <div className="mt-6 rounded-2xl border border-star bg-star-soft/30 p-5">
        <p className="font-medium text-ink">我们对你的声音的三个承诺</p>
        <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-ink-soft">
          <li>
            <strong className="text-ink">① 你的声音只住在你家的故事里。</strong>
            不共享给任何人，不用于训练，不作任何其他用途。
          </li>
          <li>
            <strong className="text-ink">② 随时一键删除。</strong>
            删除按钮就在你的电台页上，点击后云端录音样本与声音模型即时清除。
          </li>
          <li>
            <strong className="text-ink">③ 它只能念我们生成并安全审核过的故事。</strong>
            我们不提供「任意文本朗读」——你的声音不可能被拿去说别的话。
          </li>
        </ul>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-ink-soft">
        合规说明：仅支持克隆<strong>你本人</strong>的声音，须经本人明确同意；
        禁止上传名人、公众人物或任何未经授权的他人声音；克隆音色仅用于本人家庭场景。
      </p>

      {/* FAQ: 第一条直面 AI 声音诈骗新闻 */}
      <hr className="my-12 border-star" />
      <h2 className="font-display text-2xl mb-5">常见问题</h2>
      <div className="space-y-5 text-sm leading-relaxed">
        <div>
          <p className="font-medium text-ink">新闻里说 AI 克隆声音被用来诈骗，这个安全吗？</p>
          <p className="mt-1.5 text-ink-soft">
            那些骗局的前提是「能让 AI 声音说任何话」。我们在产品上掐断了这一点：你的声音
            <strong className="text-ink">只能念我们为孩子生成并安全审核过的睡前故事</strong>
            ，不开放任意文本输入；声音样本只属于你家，随时一键删除。这不是一句口号，而是写死在系统里的限制。
          </p>
        </div>
        <div>
          <p className="font-medium text-ink">录音要什么条件？</p>
          <p className="mt-1.5 text-ink-soft">
            安静的房间，自然说 15–30 秒就够了。不需要普通话标准——孩子要听的本来就是你平时说话的样子。
          </p>
        </div>
        <div>
          <p className="font-medium text-ink">孩子睡觉不想用手机播怎么办？</p>
          <p className="mt-1.5 text-ink-soft">
            订阅家庭每周可以下载「故事包」（7 个 mp3），传到牛听听等故事机或任何播放器里，睡觉就不用抱着手机了。
          </p>
        </div>
        <div>
          <p className="font-medium text-ink">每晚的故事真的是新写的吗？</p>
          <p className="mt-1.5 text-ink-soft">
            是。亲声工坊每晚为每个孩子单独生成一篇：TA 的小名是主角，最近的事织进情节，连载世界一晚一晚长大。不是从故事库里挑一篇换个声音。
          </p>
        </div>
      </div>

      {/* ── 定制专属故事 (原有内容) ── */}
      <hr className="my-12 border-star" />

      <h2 className="font-display text-2xl mb-5">再进一步：定制专属故事</h2>
      <div className="space-y-4 leading-relaxed text-ink-soft">
        <p>
          想象一下：今晚的睡前故事，主角就叫你家孩子的名字，骑着 TA
          最喜欢的小恐龙，学会了你最想教给 TA 的那件事。
        </p>
        <p>每份定制包含：</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>一篇 600 字左右的原创故事，主角用孩子的名字</li>
          <li>融入孩子喜欢的动物、玩具或爱好</li>
          <li>你指定的主题寓意（勇气 / 分享 / 刷牙 / 上幼儿园……）</li>
          <li>专属情感朗读音频，可反复收听——也可以用你刚试听过的「自己的声音」来读</li>
        </ul>
        <p>
          <strong className="text-ink">内测期间限量免费</strong>
          ，正式定价前先收集 50 个家庭的反馈。
        </p>
      </div>
      <a
        href={MAILTO}
        className="mt-8 inline-block rounded-full bg-night px-8 py-3 text-star hover:bg-night-deep transition-colors"
      >
        发邮件申请定制（限免）
      </a>
      <p className="mt-4 text-sm text-ink-soft">
        点击会打开邮件，按模板填好发送即可，48 小时内回复。
      </p>
    </div>
  );
}
