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
- **播客分发**：`/feed.xml` = RSS 2.0 + iTunes namespace（enclosure 指 `/audio/*.mp3`，时长按 48kbps CBR 从字节推算）；封面 `public/podcast-cover.png` 已入 feed
- **封面/OG 出图**：`bun scripts/gen-cover.ts` 手写 SVG → resvg 转 PNG（封面 3000² + `src/app/opengraph-image.png` 1200×630 全站 OG）；依赖本机系统 CJK 字体（KaiTi/SimSun），PNG 提交进仓，Vercel 构建不触碰字体
- **SEO**：`sitemap.ts` + `robots.ts`（demo 页 + /api disallow）；故事页含 Article+AudioObject JSON-LD

## 亲声试听（声音克隆公网 demo, 2026-06-10 三期）

```
浏览器 MediaRecorder(webm/mp4) → POST /api/voice-demo (Node fn, maxDuration 90)
  → https://cosy.lurus.cn:18443/voices (R1 宿主机 nginx HTTPS relay → tailnet R5:8123) 注册 voice_id
  → newapi /v1/audio/speech (model=cosyvoice2, voice=custom:<id>, 服务端硬编码哄睡文本) 合成 mp3
  → Vercel Blob put voice-demos/<demoId>.mp3 (公开, demoId 随机 16hex) → 跳 /custom/demo/<id>
```

- 入口 `/custom` 顶部（`voice-recorder.tsx`）；分享页 `/custom/demo/[id]`（noindex，客户端按 `NEXT_PUBLIC_BLOB_BASE` 直读 Blob，零函数调用）
- **红线**：demo 文本服务端硬编码不收客户端 text；voice_id 永不出服务端；合规勾选必填（仅本人声音）；空转写（静音/噪声样本）register 后即拦 → 友好 400
- env（Vercel + `.env.local`）：`BLOB_READ_WRITE_TOKEN`（store `fable-voice-demos`）、`COSY_PUBLIC_URL=https://cosy.lurus.cn:18443`、`COSY_API_KEY`、`NEWAPI_KEY`、`NEXT_PUBLIC_BLOB_BASE`
- **公网通道**：Tailscale Funnel 在 tailnet 层未启用（需 owner 控制台一键），现走 R1 宿主机 nginx（`/etc/nginx/sites-available/cosy-relay`，仅白名单 /healthz /voices /tts /v1/audio/speech；证书 acme.sh DNS-01 自动续期）；owner 开 Funnel 后改 `COSY_PUBLIC_URL` 即可切换
- 19:00 日更 cron 占 GPU 串行锁时 demo 请求降级 504+友好文案（实测 45s 等锁后返回）；demo 产生的克隆音色以 `demo-<demoId>` 命名留在 R5 `/home/cosy-voices/`

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
