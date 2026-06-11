#!/usr/bin/env bash
# auto-batch.sh — 文章库无人值守批产驱动 (本机 Git Bash; 计划任务 fable-articles-batch 每 30min 兜底)。
#
# 单实例锁 (mkdir 原子): 会话内长跑实例与计划任务实例互斥, 防同题重复生成/索引重复行。
# 循环: 选题补量 → 生成一批 → commit+push → 隔轮 vercel deploy; 选题耗尽即退出。
#
# env 可覆盖: BATCH_COUNT (默认 200) / ARTICLES_CONCURRENCY (默认 10) / MAX_CYCLES (默认 999)

set -uo pipefail
cd "$(dirname "$0")/../.."

LOCKDIR="${TMPDIR:-/tmp}/fable-articles.lock"
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  echo "[auto-batch] another instance running, exit"
  exit 0
fi
trap 'rmdir "$LOCKDIR" 2>/dev/null' EXIT

export NEWAPI_TRIAL_TOKEN="${NEWAPI_TRIAL_TOKEN:-$(cat ~/.newapi_trial_token)}"
BATCH_COUNT="${BATCH_COUNT:-200}"
export ARTICLES_CONCURRENCY="${ARTICLES_CONCURRENCY:-10}"
MAX_CYCLES="${MAX_CYCLES:-999}"

cycle=0
while [ "$cycle" -lt "$MAX_CYCLES" ]; do
  cycle=$((cycle + 1))
  echo "[auto-batch] cycle $cycle start $(date +%H:%M:%S)"

  # --autostash: 生成中的未暂存文件会让裸 rebase 失败 (实测曾静默积压 31 个未推 commit)
  git pull --rebase --autostash -q || true

  # 选题量不足目标时补 (幂等, 满额即快速返回)
  bun scripts/articles/expand-topics.ts 2>&1 | tail -2 || true

  out=$(bun scripts/articles/gen-articles.ts --count "$BATCH_COUNT" 2>&1 | tail -1)
  echo "[auto-batch] $out"

  git add content/articles content/articles-index.jsonl content/articles-taxonomy.json scripts/articles/topics.jsonl
  if git diff --staged --quiet; then
    echo "[auto-batch] no new articles (topics exhausted?), exit"
    exit 0
  fi
  n=$(git diff --staged --name-only | grep -c "^content/articles/" || true)
  git commit -q -m "chore(articles): auto-batch +${n} articles ($(date +%Y-%m-%d))"
  git push -q || (git pull --rebase --autostash -q && git push -q) || echo "[auto-batch] push failed, will retry next cycle"

  # 隔轮部署 (Vercel 免费档每日部署额度有限; --archive=tgz 必带 — 万文件级
  # repo 散传会撞免费档 5000 文件/日上传限, 实测报 api-upload-free 429)
  if [ $((cycle % 2)) -eq 0 ]; then
    bunx vercel deploy --prod --yes --archive=tgz 2>&1 | grep -E "Aliased|Error" | head -2 || true
  fi

  # 选题耗尽检测: gen 输出 remaining ~0 时收工
  case "$out" in
    *"remaining ~0"*) echo "[auto-batch] all topics consumed, final deploy"; bunx vercel deploy --prod --yes --archive=tgz >/dev/null 2>&1 || true; exit 0;;
  esac
done
