import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "关于寓言星球",
  description: "寓言星球是什么、故事怎么来的、内容安全怎么保障。",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="font-display text-3xl mb-6">关于寓言星球</h1>
      <div className="space-y-4 leading-relaxed text-ink-soft">
        <p>
          寓言星球（fable.xin）每天创作一篇原创中文睡前故事，并配上轻柔的情感朗读音频，
          帮家长解决「今晚讲什么」的难题。
        </p>
        <h2 className="font-display text-xl text-ink pt-4">故事怎么来的？</h2>
        <p>
          故事由 AI 创作引擎按「角色 — 困境 — 成长 — 寓意」的经典寓言结构生成，
          每篇发布前都经过自动安全过滤（暴力、恐怖、广告、价值观红线逐条校验），
          并辅以人工抽查。朗读音频由自研情感语音引擎合成，
          针对哄睡场景调校了语速和语气。
        </p>
        <h2 className="font-display text-xl text-ink pt-4">在播客 App 收听</h2>
        <p>
          每天的故事音频也通过播客 RSS 同步分发：在你常用的播客 App 里订阅{" "}
          <a href="/feed.xml" className="underline hover:text-ink">
            fable.xin/feed.xml
          </a>{" "}
          即可。各播客平台（小宇宙、Apple Podcasts、喜马拉雅）的收录正在进行中，
          过审后这里会补上直达链接。
        </p>
        <h2 className="font-display text-xl text-ink pt-4">内容安全</h2>
        <p>
          所有故事不含暴力、恐怖、广告植入；寓意围绕勇气、诚实、友爱、好习惯等正向主题。
          发现任何不妥内容，欢迎从「定制故事」页的邮件入口告诉我们。
        </p>
        <h2 className="font-display text-xl text-ink pt-4">转载授权</h2>
        <p>
          故事文本采用 CC BY-NC 4.0 授权：注明来源 fable.xin 即可非商业转载；
          商业使用请邮件联系。
        </p>
      </div>
    </div>
  );
}
