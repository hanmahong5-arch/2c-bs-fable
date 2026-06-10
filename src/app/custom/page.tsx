import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "定制专属故事 — 把孩子的名字写进故事里",
  description:
    "定制专属睡前故事：主角用孩子的名字，融入孩子喜欢的动物和爱好，并生成专属朗读音频。内测限免开放中。",
};

// TODO(owner): 开通 hi@fable.xin 转发后替换收件地址
const MAILTO =
  "mailto:marvin.uu@gmail.com?subject=" +
  encodeURIComponent("定制故事申请") +
  "&body=" +
  encodeURIComponent(
    "孩子昵称：\n年龄：\n喜欢的动物/角色：\n想传达的主题（如勇气、分享）：\n其他想写进故事的细节：",
  );

export default function CustomPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="font-display text-3xl mb-6">定制专属故事</h1>
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
          <li>专属情感朗读音频，可反复收听</li>
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
