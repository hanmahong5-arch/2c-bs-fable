/**
 * 路由级加载骨架 (P0): force-dynamic 路由(每次请求实时读 Redis/文件系统)的过渡态,
 * 复用 wavebar 呼吸条样式 (globals.css, 用法同 trial-form.tsx 的「预检中」态), 避免白屏空窗期。
 */
export default function RouteLoading({ label = "加载中…" }: { label?: string }) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-20 text-center">
      <div className="flex h-10 items-end justify-center gap-1" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="wavebar w-1.5 rounded-full bg-night/40"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </div>
      <p className="mt-4 text-sm text-ink-soft" aria-live="polite">
        {label}
      </p>
    </div>
  );
}
