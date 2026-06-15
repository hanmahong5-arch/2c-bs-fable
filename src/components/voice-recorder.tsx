"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Square, RotateCcw, Sparkles, Upload } from "lucide-react";
import { setDemoId } from "@/lib/local-identity";
import AudioPlayer from "@/components/AudioPlayer";
import NightCard from "@/components/ui/NightCard";
import { MAX_UPLOAD_BYTES, MSG_GENERIC, MSG_NETWORK } from "@/lib/constants";

const MAX_SECONDS = 30;

type Phase = "idle" | "recording" | "recorded" | "uploading" | "done";

interface VoiceRecorderProps {
  /** demo=试听流程 (默认, 跳分享页); subscriber=订户正式录音 (替换电台音色) */
  mode?: "demo" | "subscriber";
  /** subscriber 模式必填: 电台页 token */
  token?: string;
}

/** MediaRecorder 容器协商: Chrome/Android=webm, iOS Safari=mp4 */
function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? "";
}

const UPLOADING_TIPS = [
  "正在上传你的录音…",
  "正在学习你的声音（大约需要半分钟）…",
  "快好了，正在用你的声音朗读…",
];

export default function VoiceRecorder({ mode = "demo", token }: VoiceRecorderProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [tipIndex, setTipIndex] = useState(0);
  const [sample, setSample] = useState<{ file: File; url: string } | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  useEffect(() => {
    if (phase !== "uploading") return;
    const t = setInterval(
      () => setTipIndex((i) => Math.min(i + 1, UPLOADING_TIPS.length - 1)),
      12_000,
    );
    return () => clearInterval(t);
  }, [phase]);

  useEffect(
    () => () => {
      stopTimer();
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
      if (sample) URL.revokeObjectURL(sample.url);
    },
    // 仅卸载时清理
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const setRecordedFile = useCallback(
    (file: File) => {
      setSample((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { file, url: URL.createObjectURL(file) };
      });
      setPhase("recorded");
    },
    [],
  );

  const stopRecording = useCallback(() => {
    stopTimer();
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const startRecording = useCallback(async () => {
    setError("");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("没拿到麦克风权限——也可以直接上传一段手机录音。");
      return;
    }
    const mimeType = pickMimeType();
    if (!mimeType) {
      stream.getTracks().forEach((t) => t.stop());
      setError("当前浏览器不支持录音，请改用下方「上传录音文件」。");
      return;
    }
    const rec = new MediaRecorder(stream, { mimeType });
    recorderRef.current = rec;
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const ext = mimeType.startsWith("audio/mp4") ? "mp4" : "webm";
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setRecordedFile(new File([blob], `sample.${ext}`, { type: mimeType }));
    };
    rec.start();
    setSeconds(0);
    setPhase("recording");
    timerRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_SECONDS) stopRecording();
        return s + 1;
      });
    }, 1000);
  }, [setRecordedFile, stopRecording]);

  const onPickFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setError("");
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      if (file.size > MAX_UPLOAD_BYTES) {
        setError("文件太大了，请选一段 30 秒以内的录音（约 4MB）。");
        return;
      }
      setRecordedFile(file);
    },
    [setRecordedFile],
  );

  const submit = useCallback(async () => {
    if (!sample || !consent) return;
    setError("");
    setTipIndex(0);
    setPhase("uploading");
    const form = new FormData();
    form.append("file", sample.file);
    form.append("consent", "true");
    if (mode === "subscriber" && token) form.append("token", token);
    const endpoint = mode === "subscriber" ? "/api/voice-upload" : "/api/voice-demo";
    try {
      const res = await fetch(endpoint, { method: "POST", body: form });
      const data = (await res.json().catch(() => null)) as
        | { demoId?: string; ok?: boolean; error?: string }
        | null;
      if (!res.ok || (mode === "demo" ? !data?.demoId : !data?.ok)) {
        setError(data?.error ?? MSG_GENERIC);
        setPhase("recorded");
        return;
      }
      if (mode === "subscriber") {
        setPhase("done");
        router.refresh();
        return;
      }
      // 本机记住 demoId (30 天内回访可续用音色, 不用重录); 写失败静默
      setDemoId(data!.demoId!);
      router.push(`/custom/demo/${data!.demoId}`);
    } catch {
      setError(MSG_NETWORK);
      setPhase("recorded");
    }
  }, [sample, consent, router, mode, token]);

  return (
    <NightCard className="px-6 py-8 sm:px-8">
      {phase === "idle" && (
        <div className="text-center">
          <button
            onClick={startRecording}
            className="inline-flex items-center gap-2 rounded-full bg-star px-8 py-3 font-medium text-night hover:bg-star-soft transition-colors"
          >
            <Mic size={18} aria-hidden />
            开始录音
          </button>
          <p className="mt-4 text-sm text-moon">
            找个安静的地方，自然地念 10 秒左右就够了——
            比如「宝贝晚安，妈妈给你讲个故事」，或随便聊几句今天的事。
          </p>
          <label className="mt-4 inline-flex cursor-pointer items-center gap-1.5 text-sm text-moon underline hover:text-star">
            <Upload size={14} aria-hidden />
            或上传一段录音文件（5–30 秒）
            <input
              type="file"
              accept="audio/*,video/mp4,video/webm"
              className="hidden"
              onChange={onPickFile}
            />
          </label>
        </div>
      )}

      {phase === "recording" && (
        <div className="text-center">
          <div className="flex items-end justify-center gap-1 h-10" aria-hidden>
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <span
                key={i}
                className="wavebar w-1.5 rounded-full bg-star"
                style={{ animationDelay: `${i * 0.13}s` }}
              />
            ))}
          </div>
          <p className="mt-3 font-display text-2xl tabular-nums">
            {seconds}s<span className="text-moon text-base"> / {MAX_SECONDS}s</span>
          </p>
          <button
            onClick={stopRecording}
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-star px-8 py-3 text-star hover:bg-star hover:text-night transition-colors"
          >
            <Square size={16} aria-hidden />
            完成录音
          </button>
          <p className="mt-3 text-sm text-moon">录满 {MAX_SECONDS} 秒会自动停止</p>
        </div>
      )}

      {phase === "recorded" && sample && (
        <div className="text-center">
          <p className="text-sm text-moon mb-3">先听听这段样本，满意就继续：</p>
          <AudioPlayer src={sample.url} title="录音样本" label="先听听这段录音样本" />
          <label htmlFor="voice-consent" className="mt-5 flex items-start gap-2 text-left text-sm text-moon">
            <input
              id="voice-consent"
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 accent-star"
            />
            <span>
              我确认这是<strong className="text-paper">我本人的声音</strong>
              ，仅用于给自己的孩子讲故事。不上传他人或名人的声音。
            </span>
          </label>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button
              onClick={submit}
              disabled={!consent}
              className="inline-flex items-center gap-2 rounded-full bg-star px-8 py-3 font-medium text-night hover:bg-star-soft transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Sparkles size={18} aria-hidden />
              用我的声音讲故事
            </button>
            <button
              onClick={() => {
                setError("");
                setPhase("idle");
              }}
              className="inline-flex items-center gap-2 rounded-full border border-moon px-6 py-3 text-moon hover:text-star hover:border-star transition-colors"
            >
              <RotateCcw size={16} aria-hidden />
              重录
            </button>
          </div>
        </div>
      )}

      {phase === "uploading" && (
        <div className="text-center py-4">
          <div className="flex items-end justify-center gap-1 h-10" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="wavebar w-1.5 rounded-full bg-moon"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </div>
          <p className="mt-4 text-star-soft" aria-live="polite">
            {UPLOADING_TIPS[tipIndex]}
          </p>
          <p className="mt-2 text-sm text-moon">别关页面，半分钟左右就好。</p>
        </div>
      )}

      {phase === "done" && (
        <div className="text-center py-4">
          <p className="text-star-soft font-medium">✓ 新声音已生效</p>
          <p className="mt-2 text-sm text-moon">
            从今晚的故事开始，就用这段新录音的声音来念；旧的录音样本已删除。
          </p>
        </div>
      )}

      {error && (
        <p className="mt-4 text-center text-sm text-star" role="alert">
          {error}
        </p>
      )}

      <p className="mt-6 text-center text-xs text-moon/80">
        录音样本仅用于生成这段试听与后续内测服务，不会公开展示；如需删除可随时邮件联系我们。
      </p>
    </NightCard>
  );
}
