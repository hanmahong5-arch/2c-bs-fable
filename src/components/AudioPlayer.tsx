"use client";

import { useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

/** 秒 → m:ss; 非有限 (MediaRecorder blob 偶报 Infinity) 归 0:00。 */
function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * 全站统一朗读播放器 (item 12): 一个夜空底大按钮 + 进度条 + 时间, 移动端单手可点、微信 webview 友好。
 * 取代各处散落的原生 <audio controls> (含旧版「自定义按钮叠原生 controls」的冗余)。一处定义全站一致。
 * 原生 <audio> 隐藏挂在 DOM, 仅作播放内核; 所有控制走自绘 UI。
 */
export default function AudioPlayer({
  src,
  title,
  label = "情感朗读 · 适合哄睡音量",
  onPlay,
  onError,
}: {
  src: string;
  title: string;
  label?: string;
  onPlay?: () => void;
  onError?: () => void;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);

  const hasMeta = Number.isFinite(dur) && dur > 0;
  const pct = hasMeta ? (cur / dur) * 1000 : 0;

  function toggle() {
    const el = ref.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const el = ref.current;
    if (!el || !hasMeta) return;
    el.currentTime = (Number(e.target.value) / 1000) * dur;
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-moon/15 bg-night-deep px-4 py-3 text-paper">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? `暂停朗读《${title}》` : `播放朗读《${title}》`}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-star text-night hover:bg-star-soft transition-colors"
      >
        {playing ? <Pause size={22} /> : <Play size={22} className="ml-0.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-moon">{label}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={1000}
            value={pct}
            onChange={seek}
            disabled={!hasMeta}
            aria-label={`播放进度：《${title}》`}
            className="h-1 flex-1 cursor-pointer accent-star disabled:cursor-default"
          />
          <span className="shrink-0 text-[11px] tabular-nums text-moon">
            {fmt(cur)}
            {hasMeta && ` / ${fmt(dur)}`}
          </span>
        </div>
      </div>
      <audio
        ref={ref}
        src={src}
        preload="metadata"
        className="hidden"
        onPlay={() => {
          setPlaying(true);
          onPlay?.();
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onError={onError}
      />
    </div>
  );
}
