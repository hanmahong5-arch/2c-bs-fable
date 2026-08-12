import type { Metadata } from "next";
import { Suspense } from "react";
import TrialForm from "./trial-form";

export const metadata: Metadata = {
  title: "3 晚免费 — 让你的声音给孩子讲 TA 是主角的连载故事",
  description:
    "填上孩子的小名和最近的事，今晚 19:00 起，连续 3 晚收到为 TA 新写的专属故事，用你自己的声音念。",
  robots: { index: false, follow: false },
};

export default function TrialPage() {
  return (
    <div className="mx-auto max-w-xl px-5 py-12">
      <h1 className="rise-soft font-display text-3xl leading-[1.35] tracking-[0.01em]">
        让这个声音，给 TA 讲一个
        <br />
        TA 自己当主角的故事
      </h1>
      <p className="rise-soft rise-d1 mt-4 leading-loose text-ink-soft">
        孩子的名字是主角，最近经历的事写进情节——今晚 19:00 起，
        <strong className="text-ink">连续 3 晚免费</strong>
        ，每晚一个为 TA 新写的连载故事，用你刚才那个声音念。
      </p>
      <p className="rise-soft rise-d2 mt-4 inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
        <span className="rounded-full bg-star-soft/50 px-3 py-1 text-ink">填 3 项 · 约 30 秒</span>
        <span className="rounded-full bg-star-soft/50 px-3 py-1 text-ink">不付款 · 不注册</span>
      </p>
      <div className="rise-soft rise-d3 mt-8">
        <Suspense>
          <TrialForm />
        </Suspense>
      </div>
      <p className="mt-6 text-xs leading-relaxed text-ink-soft">
        填写的信息只用于给你家孩子写故事，不公开、不另作他用。
        免费连载不需要付款、不需要注册。
      </p>
    </div>
  );
}
