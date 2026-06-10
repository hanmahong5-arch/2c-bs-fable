#!/usr/bin/env bun
/**
 * admin.ts — 「亲声·连载」owner 本机 CLI (打到线上 /api/admin)。
 *
 * 鉴权 key 读 ~/.fable_admin_key (一行); FABLE_ADMIN_URL 可指向本地 dev。
 *
 * 用法:
 *   bun scripts/admin.ts create-sub --child 朵朵 --age 4 --prefs "最近在学分床睡" \
 *       [--demo <16hex> | --voice <12hex>] [--theme 分床睡] [--contact wx:xxx] \
 *       [--status trial|active] [--days 90]
 *   bun scripts/admin.ts list
 *   bun scripts/admin.ts extend --sub <id> --days 30
 *   bun scripts/admin.ts rotate-token --sub <id>
 *   bun scripts/admin.ts set-voice --sub <id> --voice <12hex>
 *   bun scripts/admin.ts revoke --sub <id>
 *   bun scripts/admin.ts pending-orders
 *   bun scripts/admin.ts bind-order --sub <id> --order-raw '<pending JSON 原文>' [--days 90]
 *   bun scripts/admin.ts dump > backup.json
 */
import { promises as fs } from "fs";
import os from "os";
import path from "path";

const URL_BASE = process.env.FABLE_ADMIN_URL ?? "https://fable.xin";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const action = process.argv[2];
  if (!action) {
    console.error("usage: bun scripts/admin.ts <action> [--flags]  (见文件头注释)");
    process.exit(1);
  }
  const key = (await fs.readFile(path.join(os.homedir(), ".fable_admin_key"), "utf-8")).trim();

  const body: Record<string, unknown> = { action };
  const map: Record<string, string> = {
    sub: "subId", demo: "demoId", voice: "voiceId", child: "childName",
    age: "age", prefs: "prefs", theme: "weeklyTheme", contact: "contact",
    status: "status", expires: "expiresAt", "order-raw": "orderRaw",
  };
  for (const [f, field] of Object.entries(map)) {
    const v = flag(f);
    if (v !== undefined) body[field] = v;
  }
  const days = flag("days");
  if (days) body.days = Number(days);

  const res = await fetch(`${URL_BASE}/api/admin`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${text}`);
    process.exit(1);
  }
  console.log(JSON.stringify(JSON.parse(text), null, 2));
}

await main();
