import type { ReactNode } from "react";

/**
 * 夜空底卡片壳 (rounded-2xl bg-night starfield text-paper) —— 收口重复 ~8 次的同一段类名。
 * 薄包装: 只固定「底色 + 圆角 + 星点 + 纸字」, padding / 边框 / 对齐等经 className 追加。
 */
export default function NightCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl bg-night starfield text-paper ${className}`}>{children}</div>
  );
}
