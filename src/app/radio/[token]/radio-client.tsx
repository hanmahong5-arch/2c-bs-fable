"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Download, Mic, Send, Share, Star, Trash2 } from "lucide-react";
import VoiceRecorder from "@/components/voice-recorder";
import { setRadioToken } from "@/lib/local-identity";

export interface StoryView {
  date: string;
  title: string;
  paragraphs: string[];
  moral: string;
  audioUrl: string; // 空 = 缺更或已归档
  starred: boolean;
  archived: boolean; // 音频已过 14 天滚动
  note: string; // 本篇织入的家长捎话 (非空 → 渲染回应徽章)
}

/** 今晚故事卡 + 听完点亮星星。 */
export function StoryCard({
  token,
  story,
  tonight,
}: {
  token: string;
  story: StoryView;
  tonight?: boolean;
}) {
  const [starred, setStarred] = useState(story.starred);
  const [open, setOpen] = useState(tonight ?? false);
  const [busy, setBusy] = useState(false);
  const reported = useRef(false);

  // D2 触达遥测: 首次播放上报一次 (fire-and-forget, 失败静默 — 不打扰睡前)
  const reportPlay = () => {
    if (reported.current) return;
    reported.current = true;
    void fetch("/api/radio/listened", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, date: story.date }),
    }).catch(() => {});
  };

  const star = async () => {
    if (starred || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/radio/star", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, date: story.date }),
      });
      if (res.ok) setStarred(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`rounded-2xl border p-5 ${tonight ? "border-star bg-night starfield text-paper" : "border-ink/10 bg-white"}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div>
          <p className={`text-xs ${tonight ? "text-moon" : "text-ink-soft"}`}>
            {story.date}
            {tonight && " · 今晚"}
          </p>
          <h3 className={`font-display text-lg leading-snug ${tonight ? "text-star-soft" : ""}`}>
            {story.title}
            {starred && <Star size={16} className="ml-2 inline fill-amber-400 text-amber-400" aria-label="已点亮" />}
          </h3>
        </div>
        <ChevronDown
          size={18}
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""} ${tonight ? "text-moon" : "text-ink-soft"}`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="mt-4">
          {story.note && (
            <p className={`mb-3 rounded-xl px-3 py-2 text-xs leading-relaxed ${tonight ? "bg-night-deep/60 text-star-soft" : "bg-star-soft/40 text-ink"}`}>
              ✨ 本篇回应了你捎的话：『{story.note}』
            </p>
          )}
          {story.audioUrl ? (
            <audio src={story.audioUrl} controls preload="metadata" className="w-full" onPlay={reportPlay} />
          ) : (
            <p className={`text-sm ${tonight ? "text-moon" : "text-ink-soft"}`}>
              {story.archived
                ? "这一晚的音频已归档（音频保留 14 天），故事文字一直都在，可以读给孩子听。"
                : "今晚工坊休息了一下，音频稍后补上；先把文字念给孩子听也很好。"}
            </p>
          )}
          <div className={`mt-4 space-y-3 text-sm leading-relaxed ${tonight ? "text-star-soft/90" : "text-ink-soft"}`}>
            {story.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            {story.moral && (
              <p className={tonight ? "text-moon" : "text-ink-soft"}>
                今晚的小种子：{story.moral}
              </p>
            )}
          </div>
          {!starred && (
            <button
              onClick={star}
              disabled={busy}
              className={`mt-4 inline-flex items-center gap-2 rounded-full border px-5 py-2 text-sm transition-colors ${
                tonight
                  ? "border-moon text-moon hover:border-star hover:text-star"
                  : "border-ink/20 text-ink-soft hover:border-night hover:text-night"
              } disabled:opacity-50`}
            >
              <Star size={15} aria-hidden />
              听完啦，点亮今晚的星星
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const MAX_NOTE = 50;

/**
 * 「给工坊捎句话」(D1 闭环传感器): 家长捎孩子今天的近况, 明晚故事织入。
 * variant: normal=承诺「明晚见」; trialDone=付费钩子 (note 照存, 开通后第一晚消费)。expired 由页面隐藏。
 */
export function NoteBox({
  token,
  childName,
  defaultNote,
  variant,
}: {
  token: string;
  childName: string;
  defaultNote: string;
  variant: "normal" | "trialDone";
}) {
  const [note, setNote] = useState(defaultNote);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = async () => {
    const trimmed = note.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/radio/note", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, note: trimmed }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "没捎出去，请稍后再试。");
        return;
      }
      setSent(true);
    } catch {
      setError("没捎出去，请稍后再试。");
    } finally {
      setBusy(false);
    }
  };

  const prompt =
    variant === "trialDone"
      ? `今天${childName}经历了什么？捎给工坊，开通后写进${childName}的第 4 晚`
      : `今天${childName}经历了什么？捎给工坊，明晚的故事里见 🌙`;
  const confirmation =
    variant === "trialDone"
      ? `已收下。开通连载后，这句话会写进${childName}的第 4 晚。`
      : "已捎到，明早工坊开工时会读到。";

  return (
    <div className="rounded-2xl border border-star bg-star-soft/30 p-4">
      <p className="inline-flex items-center gap-2 text-sm font-medium text-ink">
        <Send size={15} aria-hidden />
        给工坊捎句话
      </p>
      {sent ? (
        <p className="mt-3 rounded-xl bg-white/70 px-4 py-3 text-sm leading-relaxed text-ink">
          ✓ {confirmation}
          {note.trim() && <span className="mt-1 block text-xs text-ink-soft">『{note.trim()}』</span>}
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">{prompt}</p>
          <div className="mt-3 flex items-start gap-2">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE))}
              maxLength={MAX_NOTE}
              rows={2}
              placeholder="比如：她今天第一次自己梳头"
              className="min-w-0 flex-1 resize-none rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-night focus:outline-none"
            />
            <button
              onClick={send}
              disabled={busy || !note.trim()}
              className="shrink-0 rounded-full bg-night px-5 py-2 text-sm text-star hover:bg-night-deep transition-colors disabled:opacity-50"
            >
              {busy ? "捎出中…" : "捎过去"}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-ink-soft/80">
            {note.length}/{MAX_NOTE} 字 · 当天可以改，工坊每天早上来取一次
          </p>
          {defaultNote && (
            <p className="mt-1 text-xs text-ink-soft">已有一句在等工坊：『{defaultNote}』，再捎会替换它。</p>
          )}
          {error && (
            <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>
          )}
        </>
      )}
    </div>
  );
}

/** 微信浮窗 / iOS / 安卓三分支「加桌面」引导。 */
export function AddToHomeGuide() {
  // 懒初始化读 UA: SSR 时 navigator 不存在 → "other"; 提示文案仅在用户展开后渲染, 无水合不一致
  const [env] = useState<"wechat" | "ios" | "android" | "other">(() => {
    if (typeof navigator === "undefined") return "other";
    const ua = navigator.userAgent;
    if (/MicroMessenger/i.test(ua)) return "wechat";
    if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
    if (/Android/i.test(ua)) return "android";
    return "other";
  });
  const [open, setOpen] = useState(false);

  const tip = useMemo(() => {
    switch (env) {
      case "wechat":
        return "点右上角「···」→ 选「浮窗」，下次从微信侧边一划就能回到电台；也可以「在浏览器打开」后加到手机桌面。";
      case "ios":
        return "用 Safari 打开本页 → 点底部分享按钮 → 「添加到主屏幕」，电台就像 App 一样躺在桌面上。";
      case "android":
        return "用浏览器打开本页 → 点菜单「⋮」→ 「添加到主屏幕」，每晚一点就开。";
      default:
        return "把本页加入书签或发送到手机，每晚 19:00 打开就有新故事。";
    }
  }, [env]);

  return (
    <div className="rounded-2xl border border-star bg-star-soft/30 p-4">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-ink">
          <Share size={15} aria-hidden />
          把电台放到手机桌面 / 微信浮窗
        </span>
        <ChevronDown size={16} className={`shrink-0 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && <p className="mt-3 text-sm leading-relaxed text-ink-soft">{tip}</p>}
    </div>
  );
}

/** 周故事包下载 + 牛听听等故事机喂入教程。 */
export function WeeklyPack({ token, available }: { token: string; available: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-ink">
          <Download size={15} aria-hidden />
          本周故事包（mp3）
        </span>
        {available ? (
          <a
            href={`/radio/${token}/weekly.zip`}
            className="rounded-full bg-night px-5 py-2 text-sm text-star hover:bg-night-deep transition-colors"
          >
            下载 zip
          </a>
        ) : (
          <span className="text-sm text-ink-soft">本周还没有音频，明早再来</span>
        )}
      </div>
      <button onClick={() => setOpen((o) => !o)} className="mt-2 text-xs text-ink-soft underline">
        怎么喂给牛听听等故事机？
      </button>
      {open && (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-ink-soft">
          <li>下载 zip 后在手机/电脑上解压，得到 7 个 mp3。</li>
          <li>打开故事机 App（如牛听听）→「云盘 / 自定义内容」→ 上传这些 mp3。</li>
          <li>在故事机上选这个歌单播放——孩子睡觉就不用抱着手机了。</li>
          <li>每周日下载一次新的故事包即可。</li>
        </ol>
      )}
    </div>
  );
}

const INSTANT_GIVEUP_MS = 3 * 60_000;
const INSTANT_POLL_MS = 8_000;

/**
 * 即时首晚生成 (七期 D1): trial 刚开通、一晚故事都没有时渲染。
 * 挂载即 fire-and-forget 触发 /api/radio/instant-first (不 await 结果 —
 * 生成约 1-2 分钟, 微信 webview 挂长 fetch 必被掐), 之后每 8s refresh 服务端组件;
 * 故事文本落库后页面自然出现故事卡, 本组件随之卸载。
 * 3 分钟封顶后降级为中性文案 (不说谎: 失败户由次日管线/19:00 前补跑兜底)。
 */
export function InstantFirstStarter({ token, childName }: { token: string; childName: string }) {
  const router = useRouter();
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    void fetch("/api/radio/instant-first", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => {});
    const poll = setInterval(() => router.refresh(), INSTANT_POLL_MS);
    const giveUp = setTimeout(() => setGaveUp(true), INSTANT_GIVEUP_MS);
    return () => {
      clearInterval(poll);
      clearTimeout(giveUp);
    };
    // 仅挂载时触发一次; token 在组件生命周期内不变
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-2xl border border-star bg-night starfield p-6 text-center text-paper">
      {!gaveUp ? (
        <>
          <div className="flex items-end justify-center gap-1 h-10" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="wavebar w-1.5 rounded-full bg-star"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </div>
          <p className="mt-3 font-display text-lg text-star-soft" aria-live="polite">
            工坊正在为{childName}写第一晚的故事 🌙
          </p>
          <p className="mt-2 text-sm text-moon">大约 1-2 分钟，写好这页会自己亮起来，不用刷新。</p>
        </>
      ) : (
        <p className="text-sm leading-relaxed text-moon">
          工坊已收到{childName}的故事订单，最晚今晚 19:00 前送到这一页。
        </p>
      )}
    </div>
  );
}

/** 打开电台页即把 token 记到本机 (失败静默) — 任何设备打开过一次, nav 就长出「我的电台」。 */
export function RememberRadio({ token }: { token: string }) {
  useEffect(() => setRadioToken(token), [token]);
  return null;
}

/** 正式录音 (替换音色) + 一键删除声音 (信任承诺②, 显眼不折叠)。 */
export function VoiceManager({ token, voiceSet }: { token: string; voiceSet: boolean }) {
  const [showRecorder, setShowRecorder] = useState(!voiceSet);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState("");

  const removeVoice = async () => {
    if (!window.confirm("确定删除你的声音吗？云端的录音样本和声音模型会立刻清除，之后的故事会暂停朗读，重新录一段即可恢复。")) return;
    setDeleting(true);
    setError("");
    try {
      const res = await fetch("/api/radio/delete-voice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "删除失败，请稍后再试。");
        return;
      }
      setDeleted(true);
      setShowRecorder(true);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {!voiceSet && !deleted && (
        <p className="rounded-xl bg-star-soft/40 px-4 py-3 text-sm text-ink">
          还没有你的声音。录一段 15–30 秒，今晚的故事就能用你的声音念。
        </p>
      )}
      {deleted && (
        <p className="rounded-xl bg-star-soft/40 px-4 py-3 text-sm text-ink">
          ✓ 你的声音已删除：云端录音样本与声音模型已即时清除。想恢复随时重录一段。
        </p>
      )}

      {showRecorder ? (
        <VoiceRecorder mode="subscriber" token={token} />
      ) : (
        <button
          onClick={() => setShowRecorder(true)}
          className="inline-flex items-center gap-2 rounded-full border border-ink/20 px-6 py-2.5 text-sm text-ink hover:border-night transition-colors"
        >
          <Mic size={15} aria-hidden />
          重新录一段（换更好的声音样本）
        </button>
      )}

      {voiceSet && !deleted && (
        <div>
          <button
            onClick={removeVoice}
            disabled={deleting}
            className="inline-flex items-center gap-2 rounded-full border border-red-300 px-6 py-2.5 text-sm text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            <Trash2 size={15} aria-hidden />
            {deleting ? "正在删除…" : "一键删除我的声音"}
          </button>
          <p className="mt-2 text-xs text-ink-soft">
            点击后云端录音样本与声音模型即时清除，不可恢复；故事文字会保留。
          </p>
          {error && (
            <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
