"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { getDemoId, getRadioToken } from "@/lib/local-identity";

const noopSubscribe = () => () => {};

/**
 * /custom 回访检测条: 有电台直接回家, 只有试听就续上 (demo 30 天 TTL 内复用音色, 不用重录)。
 * useSyncExternalStore (server snapshot = "") → 首访者与 SSR 都不渲染, 无水合不一致。
 */
export default function ReturnVisitBanner() {
  const token = useSyncExternalStore(noopSubscribe, getRadioToken, () => "");
  const demoId = useSyncExternalStore(noopSubscribe, getDemoId, () => "");

  const target = token
    ? { href: `/radio/${token}`, label: "你已经有自己的电台了，直接去 →" }
    : demoId
      ? { href: `/custom/demo/${demoId}`, label: "继续上次的试听（不用重录）→" }
      : null;

  if (!target) return null;
  return (
    <Link
      href={target.href}
      className="mb-6 block rounded-2xl border border-star bg-star-soft/40 px-5 py-3.5 text-sm font-medium text-ink hover:bg-star-soft/60 transition-colors"
    >
      {target.label}
    </Link>
  );
}
