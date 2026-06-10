"use client";

import { useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

/** 故事页朗读播放器: 原生 audio + 大按钮 (移动端哄睡场景, 单手可点)。 */
export default function AudioPlayer({ src, title }: { src: string; title: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  function toggle() {
    const el = ref.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  }

  return (
    <div className="flex items-center gap-4 rounded-2xl bg-night text-paper px-5 py-4">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? `暂停朗读《${title}》` : `播放朗读《${title}`}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-star text-night hover:bg-star-soft transition-colors"
      >
        {playing ? <Pause size={22} /> : <Play size={22} className="ml-0.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-moon">情感朗读 · 适合哄睡音量</p>
        <audio
          ref={ref}
          src={src}
          preload="metadata"
          controls
          className="mt-1 w-full"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
      </div>
    </div>
  );
}
