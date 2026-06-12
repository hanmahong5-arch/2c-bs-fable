"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Mic, Sparkles } from "lucide-react";
import { getRadioToken } from "@/lib/local-identity";

type Phase = "idle" | "working" | "done" | "error";

const noopSubscribe = () => () => {};

/**
 * 「用我的声音念这篇」(七期 D3): 本机有电台 token → 一键合成本文亲声朗读 (~1-2 分钟);
 * 无 token → 引流到 /custom (万篇文章页全部变成漏斗入口)。
 * token 读 localStorage 走 useSyncExternalStore: SSR/首帧按无 token 渲染引流卡, 水合后自动切换。
 */
export default function ReadInMyVoice({ category, slug }: { category: string; slug: string }) {
  const token = useSyncExternalStore(noopSubscribe, getRadioToken, () => "");
  const [phase, setPhase] = useState<Phase>("idle");
  const [url, setUrl] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState("");

  // 无电台 → 引流 (本件的真正商业价值: 万篇内容页 → 录音漏斗)
  if (!token) {
    return (
      <div className="mt-8 rounded-2xl border border-star bg-star-soft/30 p-5">
        <p className="font-medium text-ink">想用自己的声音念这篇给孩子听？</p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
          录 10 秒你的声音，就能让「你自己」来念——先免费试听一段。
        </p>
        <Link
          href="/custom"
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-night px-6 py-2.5 text-sm text-star hover:bg-night-deep transition-colors"
        >
          <Mic size={15} aria-hidden />
          先免费录一段 →
        </Link>
      </div>
    );
  }

  const synth = async () => {
    if (phase === "working") return;
    setPhase("working");
    setError("");
    try {
      const res = await fetch("/api/articles/synth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, category, slug }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; url?: string; truncated?: boolean; error?: string }
        | null;
      if (!res.ok || !data?.url) {
        setError(data?.error ?? "工坊这会儿忙不过来，稍后再试一次。");
        setPhase("error");
        return;
      }
      setUrl(data.url);
      setTruncated(Boolean(data.truncated));
      setPhase("done");
    } catch {
      setError("网络不太稳定，请重试一次。");
      setPhase("error");
    }
  };

  return (
    <div className="mt-8 rounded-2xl border border-star bg-star-soft/30 p-5">
      {phase === "done" ? (
        <>
          <p className="font-medium text-ink">✓ 你的声音念的这篇</p>
          {truncated && (
            <p className="mt-1 text-xs text-ink-soft">这篇比较长，为你念的是精华版。</p>
          )}
          <audio src={url} controls preload="metadata" className="mt-3 w-full" />
        </>
      ) : phase === "working" ? (
        <div className="text-center py-2">
          <p className="font-medium text-ink" aria-live="polite">
            工坊正在用你的声音念这篇（约 1-2 分钟）…
          </p>
          <p className="mt-1.5 text-sm text-ink-soft">别关页面，念好就出现在这里。</p>
        </div>
      ) : (
        <>
          <button
            onClick={synth}
            className="inline-flex items-center gap-2 rounded-full bg-night px-6 py-2.5 text-sm text-star hover:bg-night-deep transition-colors"
          >
            <Sparkles size={15} aria-hidden />
            🎙 用我的声音念这篇
          </button>
          <p className="mt-2 text-xs text-ink-soft">用你电台里的声音念给孩子听，每天可以念一篇。</p>
          {error && (
            <p className="mt-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
