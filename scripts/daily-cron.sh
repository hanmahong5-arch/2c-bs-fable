#!/usr/bin/env bash
# daily-cron.sh — 每日一篇故事生成 + 上线 (Windows Task Scheduler 每天 19:00 调)。
#
# 链路: git pull → 探活 R5 CosyVoice → gen-story.ts --count 1 (含 LLM 安全自检)
#       → 有新内容才 commit (message 带故事标题, owner 扫 git log 即抽查) + push + vercel --prod。
# R5 不健康 → 当天跳过 (音频是补充不阻塞原则的反向适用: 故事站音频是主体, 缺音频不发)。
#
# 安装为计划任务 (cmd, 一次性):
#   schtasks /Create /TN fable-daily-story /SC DAILY /ST 19:00 ^
#     /TR "C:\Program Files\Git\bin\bash.exe -lc 'cd /c/Users/Anita/Desktop/lurus/2c-bs-fable && scripts/daily-cron.sh'"
#   # 补"开机即补跑" (PowerShell):
#   Set-ScheduledTask -TaskName fable-daily-story `
#     -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable)
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

COSY_URL="${COSY_URL:-http://100.120.110.73:8123}"
# 凭证不进 git: 与 c2m cron 同模式, 本机 dotfile 读取
COSY_API_KEY="${COSY_API_KEY:-$(cat "$HOME/.cosy_api_key" 2>/dev/null || true)}"
NEWAPI_TRIAL_TOKEN="${NEWAPI_TRIAL_TOKEN:-$(cat "$HOME/.newapi_trial_token" 2>/dev/null || true)}"

log() { printf '[fable-cron] %s\n' "$*"; }

if [ -z "$NEWAPI_TRIAL_TOKEN" ]; then
  log "NEWAPI_TRIAL_TOKEN missing (~/.newapi_trial_token) → abort"
  exit 1
fi

# 1. 同步远端 (手动改动/多机协作)
log "git pull --ff-only"
git pull --ff-only || log "pull skipped (dirty/offline) — 继续用本地内容"

# 2. 探活 R5 (systemd 自启; 偶发重启给 ~60s 余量)
log "probe $COSY_URL/healthz"
healthy=0
for i in $(seq 1 20); do
  if curl -fsS --max-time 3 "$COSY_URL/healthz" >/dev/null 2>&1; then
    healthy=1
    log "cosyvoice healthy (after $((i * 3))s)"
    break
  fi
  sleep 3
done
if [ "$healthy" != 1 ]; then
  log "cosyvoice not healthy → 今天跳过 (明天补)"
  exit 0
fi

# 3. 生成 1 篇 (文本 + 安全自检 + 音频)
log "generate story"
NEWAPI_TRIAL_TOKEN="$NEWAPI_TRIAL_TOKEN" COSY_URL="$COSY_URL" COSY_API_KEY="$COSY_API_KEY" \
  bun run scripts/gen-story.ts --count 1

# 4. 仅当有新内容才提交 + 部署
if git diff --quiet -- content/ public/audio/ && [ -z "$(git status --porcelain -- content/ public/audio/)" ]; then
  log "no new story → nothing to ship"
  exit 0
fi

# commit message 带故事标题 (owner 扫 git log 即抽查)
title="$(grep -h '^title:' $(git status --porcelain -- content/stories/ | awk '{print $2}') 2>/dev/null | head -1 | sed 's/^title: *"\{0,1\}//; s/"$//')"
log "new story: ${title:-unknown} → commit + push + deploy"
git add content/ public/audio/
git commit -m "feat(story): ${title:-daily story} $(date -u +%Y-%m-%d)"
git push
# 本项目 git push 不自动部署 (Vercel 手动)
bunx vercel --prod --yes
log "done"
