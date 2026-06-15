/**
 * api.ts — 服务端路由公共件 (统一响应形状 / 输入清洗 / JSON 解析), 消除各 route 的复制。
 *
 * 仅供 route handler (server) 使用; client 组件勿 import (依赖 next/server)。
 */
import { NextResponse } from "next/server";

/** prompt 注入标记 (控制字符另由 codePoint 过滤, 避免源码里出现裸控制字符 / no-control-regex)。 */
const INJECTION_MARKERS = new Set(["<", ">", "{", "}", "`"]);

/** 统一失败响应: {error} + status。 */
export function fail(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** 统一成功响应: 任意 body 形状 ({ok:true} / {url} / {skipped} …)。 */
export function ok(body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body);
}

/**
 * 控制字符 (0x00–0x1F) + prompt 注入标记 (<>{}`) 清洗, 可选长度帽。
 * 进 LLM prompt 前的第一道 (生成时另有独立安全自检); max 省略=不截断。
 * 与原各路由内联 clean 行为一致, 只是收口为单点。
 */
export function clean(s: unknown, max?: number): string {
  let out = "";
  for (const ch of String(s ?? "")) {
    if (ch.charCodeAt(0) < 0x20 || INJECTION_MARKERS.has(ch)) continue;
    out += ch;
  }
  out = out.trim();
  return max === undefined ? out : out.slice(0, max);
}

/** 统一 JSON body 解析: 解析失败返回 null (调用方据此 fail(400, <自定文案>))。 */
export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
