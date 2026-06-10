"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Sparkles } from "lucide-react";

const AGES = ["2", "3", "4", "5", "6", "7", "8"];

export default function TrialForm() {
  const router = useRouter();
  const demoId = useSearchParams().get("demo") ?? "";
  const [childName, setChildName] = useState("");
  const [age, setAge] = useState("4");
  const [prefs, setPrefs] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
      router.push(data.radioUrl);
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
          微信号 <span className="font-normal text-ink-soft">（选填，故事有问题时联系你）</span>
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
