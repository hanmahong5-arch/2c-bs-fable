# fable.xin (2c-bs-fable)

寓言星球 — AI 原创中文睡前故事 + 自托管情感语音朗读。面向家长（哄睡场景），内容站打底，变现路径：定制故事（内测收集需求）→ 付费定制 / 会员；长线 SEO 长尾（睡前故事/寓言故事关键词）。

- Domain: `fable.xin`（阿里云注册，DNS 同账号）
- Hosting: **Vercel**（同 dsnb / c2m 模式，git push 不自动部署，上线 `bunx vercel --prod`）
- DNS: 阿里云 `@` + `www` → `76.76.21.21`
- Lifecycle: stage

## Tech Stack

Next.js 16.2 (App Router, standalone) / React 19.2 / Tailwind 4 / Bun。零数据库零后端：故事 = `content/stories/*.md`（单行 YAML frontmatter），音频 = `public/audio/<slug>.mp3`，全静态 SSG。

## Content Pipeline

```bash
# 故事文本 (LLM via newapi) + 朗读音频 (CosyVoice2 @ R5 GPU, 经 /tts 逐段合成直拼)
NEWAPI_TRIAL_TOKEN=... COSY_API_KEY=... bun run scripts/gen-story.ts --count 3
bun run scripts/gen-story.ts --audio-only   # 给缺音频的存量补音频 (幂等)
```

- 文本模型经 `newapi.lurus.cn`；语音 = R5 (100.120.110.73:8123) 自托管 CosyVoice2，睡前轻缓 instruct
- 同一模型也注册进 newapi（model `cosyvoice2`, channel 9, 经节点代理走 tailnet）
- 凭证见 `重要信息.md` + R5 `/root/.cosy_api_key`；本机 cron 自读 `~/.newapi_trial_token` + `~/.cosy_api_key`
- gen-story 内置：近 10 篇标题入 prompt 防主角撞车 + 第二次 LLM 安全自检（不过审丢弃重生成，最多 3 次）
- **日更自动化**：Windows 计划任务 `fable-daily-story` 每天 19:00 跑 `scripts/daily-cron.sh`（git pull → 探活 R5 → 生成 1 篇 → commit 带故事标题 → push → vercel --prod；R5 不健康当天跳过）
- **播客分发**：`/feed.xml` = RSS 2.0 + iTunes namespace（enclosure 指 `/audio/*.mp3`，时长按 48kbps CBR 从字节推算）；`public/podcast-cover.png` 放入后 rebuild 自动进 feed（rss.ts 条件输出，当前缺封面）

## Commands

```bash
bun install
bun run dev / build / lint
bunx vercel --prod        # 部署 (手动!)
```

## Gotchas

- 营销文案克制；站内不出现 AI 模型名（说「AI 创作引擎」「自研情感语音引擎」）
- 故事内容安全红线：零暴力/恐怖/广告植入；结尾必须平静适合入睡
- 定制故事 mailto 暂指 owner gmail，待开通 hi@fable.xin 转发后替换（`src/app/custom/page.tsx` TODO）
- `.xin` 无 ICP → 不上 CN IDC（同 dsnb/c2m 教训）
- mp3 是逐段直拼（同参数 CBR），时长显示个别播放器可能不准；介意再上 ffmpeg 重封装
- **repo 体积**：日更 mp3 ~800KB/天 ≈ 300MB/年；超 1GB 时音频迁 R2/Vercel Blob（现阶段 git/Vercel 扛得住，先不做）
- cron 与人工操作 R5 服务会撞车：重启 cosyvoice 服务会让正在跑的合成失败（文本保留），事后 `--audio-only` 幂等补齐即可
