"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { getRadioToken } from "@/lib/local-identity";

const noopSubscribe = () => () => {};

/**
 * 全站「我的电台」入口: 本机有电台 token 才渲染 (老用户从任何页面一键回家)。
 * useSyncExternalStore (server snapshot = "") → SSR/首帧不渲染, 访客无感知、无水合不一致。
 */
export default function MyRadioLink() {
  const token = useSyncExternalStore(noopSubscribe, getRadioToken, () => "");
  if (!token) return null;
  return (
    <Link href={`/radio/${token}`} className="hover:text-star transition-colors">
      🌙 我的电台
    </Link>
  );
}
