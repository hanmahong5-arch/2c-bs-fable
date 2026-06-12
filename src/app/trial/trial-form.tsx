"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, Copy, KeyRound, Sparkles } from "lucide-react";
import { setRadioToken } from "@/lib/local-identity";

const AGES = ["2", "3", "4", "5", "6", "7", "8"];

/** 开通成功确认屏: 专属链接的「最后一眼」— 链接即账号, 这里是用户唯一被强制看见它的时刻。 */
function SuccessScreen({ radioUrl, contact }: { radioUrl: string; contact: string }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const fullUrl = typeof window === "undefined" ? radioUrl : `${window.location.origin}${radioUrl}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 复制失败时链接仍在屏幕上, 用户可长按手选
    }
  };

  return (
    <div className="rounded-2xl bg-night starfield p-6 text-paper">
      <p className="inline-flex items-center gap-2 text-sm text-moon">
        <KeyRound size={15} aria-hidden />
        开通成功 — 先把钥匙收好
      </p>
      <h2 className="mt-2 font-display text-2xl leading-snug text-star-soft">
        这是你家电台的专属链接
      </h2>
      <p className="mt-3 break-all rounded-xl bg-night-deep/70 px-4 py-3 font-mono text-sm text-star">
        {fullUrl}
      </p>
      <button
        onClick={copy}
        className="mt-3 inline-flex items-center gap-2 rounded-full border border-moon px-6 py-2.5 text-sm text-moon hover:border-star hover:text-star transition-colors"
      >
        {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
        {copied ? "已复制" : "复制链接"}
      </button>
      <p className="mt-4 text-sm leading-relaxed text-moon">
        这就是你家的钥匙——不用注册、不用密码，打开它就是你家的电台。
        建议现在就发给自己（微信「文件传输助手」就很好），丢了找回要靠爱发电私信核对订单。
        {contact && <span>你留了微信号，凭它也可以找回。</span>}
      </p>
      <button
        onClick={() => router.push(radioUrl)}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-star px-8 py-3.5 font-medium text-night hover:bg-star-soft transition-colors"
      >
        <Sparkles size={18} aria-hidden />
        进入我的电台
      </button>
    </div>
  );
}

export default function TrialForm() {
  const demoId = useSearchParams().get("demo") ?? "";
  const [childName, setChildName] = useState("");
  const [age, setAge] = useState("4");
  const [prefs, setPrefs] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [radioUrl, setRadioUrl] = useState("");

  // 没有 demoId 进不了 trial (音色复用自试听), 引导回录音
  if (!/^[a-f0-9]{16}$/.test(demoId)) {
    return (
      <div className="rounded-2xl border border-star bg-star-soft/30 p-6 text-center">
        <p className="text-ink">先录一段你的声音，才能用「你的声音」开讲。</p>
        <Link
          href="/custom"
          className="mt-4 inline-block rounded-full bg-night px-8 py-3 text-star hover:bg-night-deep transition-colors"
        >
          去录 10 秒声音
        </Link>
      </div>
    );
  }

  if (radioUrl) return <SuccessScreen radioUrl={radioUrl} contact={contact.trim()} />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/trial", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ demoId, childName, age, prefs, contact }),
      });
      const data = (await res.json().catch(() => null)) as
        | { radioUrl?: string; error?: string }
        | null;
      if (!res.ok || !data?.radioUrl) {
        setError(data?.error ?? "出了点小问题，请稍后再试。");
        return;
      }
      // 链接即账号: 本机持久化 (失败静默), 再给「最后一眼」确认屏
      setRadioToken(data.radioUrl.split("/").pop() ?? "");
      setRadioUrl(data.radioUrl);
    } catch {
      setError("网络不太稳定，请重试一次。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block">
        <span className="text-sm font-medium text-ink">孩子的小名（故事主角名）</span>
        <input
          value={childName}
          onChange={(e) => setChildName(e.target.value)}
          maxLength={12}
          required
          placeholder="比如：朵朵、小石头"
          className="mt-1.5 w-full rounded-xl border border-ink/20 bg-white px-4 py-2.5 focus:border-night focus:outline-none"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-ink">年龄</span>
        <select
          value={age}
          onChange={(e) => setAge(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-ink/20 bg-white px-4 py-2.5 focus:border-night focus:outline-none"
        >
          {AGES.map((a) => (
            <option key={a} value={a}>
              {a} 岁
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-ink">孩子最近的一件事（写进故事里）</span>
        <input
          value={prefs}
          onChange={(e) => setPrefs(e.target.value)}
          maxLength={50}
          placeholder="比如：刚开始学分床睡 / 怕黑 / 迷上了恐龙"
          className="mt-1.5 w-full rounded-xl border border-ink/20 bg-white px-4 py-2.5 focus:border-night focus:outline-none"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-ink">
          微信号 <span className="font-normal text-ink-soft">（选填，链接丢了凭它找回）</span>
        </span>
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          maxLength={40}
          className="mt-1.5 w-full rounded-xl border border-ink/20 bg-white px-4 py-2.5 focus:border-night focus:outline-none"
        />
      </label>

      <button
        type="submit"
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-night px-8 py-3.5 font-medium text-star hover:bg-night-deep transition-colors disabled:opacity-50"
      >
        <Sparkles size={18} aria-hidden />
        {busy ? "正在开通…" : "免费开通 3 晚专属连载"}
      </button>

      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
