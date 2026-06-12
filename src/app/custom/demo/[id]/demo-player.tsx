"use client";

import { useState } from "react";
import Link from "next/link";
import { Share2, Check, Mic, Sparkles } from "lucide-react";

const ID_RE = /^[a-f0-9]{16}$/;

export default function DemoPlayer({ id }: { id: string }) {
  const [shared, setShared] = useState(false);
  const [missing, setMissing] = useState(false);

  const valid = ID_RE.test(id);
  const src = valid
    ? `${process.env.NEXT_PUBLIC_BLOB_BASE}/voice-demos/${id}.mp3`
    : "";

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: "听听，这是我的声音在讲睡前故事", url });
        return;
      }
    } catch {
      // 用户取消分享 → 静默
      return;
    }
    await navigator.clipboard.writeText(url);
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  };

  if (!valid || missing) {
    return (
      <div className="mx-auto max-w-xl px-5 py-20 text-center">
        <h1 className="font-display text-2xl">这条试听不存在或已过期</h1>
        <p className="mt-4 text-ink-soft">没关系，重新录一段 10 秒的声音就能再生成。</p>
        <Link
          href="/custom"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-night px-8 py-3 text-star hover:bg-night-deep transition-colors"
        >
          <Mic size={16} aria-hidden />
          去录一段
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-night starfield text-paper">
      <div className="mx-auto max-w-xl px-5 py-16 text-center min-h-[70vh] flex flex-col justify-center">
        <p className="text-moon text-sm tracking-widest">亲 声 试 听</p>
        <h1 className="font-display text-3xl mt-3 leading-snug">
          听，这是你的声音
          <br />
          在给孩子讲故事
        </h1>

        <div className="mt-10">
          { }
          <audio
            src={src}
            controls
            preload="metadata"
            className="w-full"
            onError={() => setMissing(true)}
          />
        </div>

        <p className="mt-6 text-moon text-sm leading-relaxed">
          出差的晚上、加班的深夜——孩子最想听的，从来不是更好听的主播，
          而是你的声音。
        </p>

        <p className="mt-3 text-xs text-moon/80">
          保存这个链接，30 天内随时回来听、随时开通连载，不用重录。
        </p>

        {/* 主 CTA: 试听 → 3 晚免费专属连载 (funnel 下一步) */}
        <div className="mt-10 rounded-2xl border border-moon/30 bg-night-deep/60 p-5 text-left">
          <p className="font-display text-lg text-star-soft leading-snug">
            让这个声音，给你家孩子讲一个
            <br />
            TA 自己当主角的故事
          </p>
          <p className="mt-2 text-sm text-moon leading-relaxed">
            填上孩子的小名和最近的事，今晚 19:00 起，连续 3 晚免费收到为 TA 新写的连载故事——用你刚听到的这个声音念。
          </p>
          <Link
            href={`/trial?demo=${id}`}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-star px-7 py-3 font-medium text-night hover:bg-star-soft transition-colors"
          >
            <Sparkles size={18} aria-hidden />
            免费开通 3 晚专属连载
          </Link>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            onClick={share}
            className="inline-flex items-center gap-2 rounded-full border border-moon px-7 py-3 text-moon hover:text-star hover:border-star transition-colors"
          >
            {shared ? <Check size={18} aria-hidden /> : <Share2 size={18} aria-hidden />}
            {shared ? "链接已复制" : "分享给家人听听"}
          </button>
          <Link
            href="/custom"
            className="inline-flex items-center gap-2 rounded-full border border-moon px-7 py-3 text-moon hover:text-star hover:border-star transition-colors"
          >
            <Mic size={16} aria-hidden />
            我也想用自己的声音
          </Link>
        </div>
      </div>
    </div>
  );
}
