import type { ReactNode } from "react";

/**
 * 星卡: 浅色高亮提示卡壳 (rounded-2xl border border-star bg-star-soft/30) —— 捎话 / 引导 / 等待等复用 ~6 次。
 * 薄包装: 只固定「圆角 + 星色描边 + 星光浅底」, padding 等经 className 追加。
 */
export default function StarCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-star bg-star-soft/30 ${className}`}>{children}</div>
  );
}
