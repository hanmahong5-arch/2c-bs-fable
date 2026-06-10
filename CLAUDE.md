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

## 亲声·连载（商业化, 2026-06-10 四期）

卖点一句话：「每天晚上，它给我家孩子新写一个 TA 自己当主角的故事，用我的声音念出来。」与喜马拉雅「存量库×你的音色」的结构性差异 = 每晚新写+孩子是主角。定价锚=定制绘本（¥99-199/本），永不与 ¥198 会员同档比价。

```
漏斗: /custom demo → /custom/demo/[id] CTA → /trial 表单 (孩子小名+年龄+最近的事)
  → trial sub (3 晚免费, 复用 demo 音色) → /radio/<token> 电台页
  → 第 3 晚悬念+未来 7 晚预告+付费墙 → 爱发电 (remark 带家庭码) → webhook 自动转正
```

- **数据层**：Upstash Redis（Vercel Marketplace `upstash-kv-yellow-lantern`，env `KV_REST_API_URL/TOKEN`）；唯一访问层 `src/lib/store.ts`（语义化函数，换存储只改此文件）。**坑**：客户端读取自动 JSON-parse，读出口必须 `str()` 归一（已内置，别绕过 store 直连 Redis）
- **电台页** `/radio/[token]`：今晚 19:00 北京时间解锁、星星点亮、加桌面/微信浮窗三分支引导、周故事包 `weekly.zip`（fflate 按需打包，喂牛听听）、正式录音（`/api/voice-upload` 新声生效才删旧声）、**一键删除我的声音**（→ R5 `DELETE /voices/<id>`）；noindex 三件套（metadata + next.config X-Robots-Tag + robots.ts）
- **token 即账号**：`token`（32 base64url，可 rotate）与 `audioKey`（Blob 前缀）解耦；丢失找回=爱发电私信→admin rotate-token
- **每晚管线**：R5 `/home/fable`（git bundle 部署的 clone）`scripts/radio-pipeline.ts`，systemd `fable-radio.timer` 06:00 + `fable-radio-retry.timer` 08-16 偶数点幂等补跑（flock 防重入）；env `/root/.fable-radio.env`；TTS 走 localhost:8123 直连（零 newapi 计费）；trial 第 3 晚自动悬念收尾+生成 7 晚预告入 serialState；音频 14 天滚动清理；末尾 ntfy 摘要（失败 priority 高）+ Redis 全量备份→Blob `backup/`（留 14 份）
- **爱发电**：webhook 只当门铃，开放 API query-order 回查验真（`src/lib/payments/afdian.ts`）；SETNX `order:` 幂等；remark 匹配家庭码(16hex)/电台链接/demoId 自动开通，失败进 pending-orders+ntfy 响铃 → `admin bind-order`
- **Admin**：`bun scripts/admin.ts <action>`（create-sub/list/extend/rotate-token/set-voice/revoke/pending-orders/bind-order/dump），key 在 `~/.fable_admin_key`，`FABLE_ADMIN_URL` 可指本地
- **公共函数**：`scripts/lib/story-gen.ts`（llmJson/checkSafety/synthStory）被 gen-story 与 radio-pipeline 共用；连载安审允许温和「明晚再讲」悬念，恐怖惊吓仍红线
- **容量红线**：Blob 1GB → v1 ≤30 订户（`TRIAL_CAP=30` env 同帽）；>30 迁 R2，只改 `src/lib/audio-storage.ts`
- env 新增（Vercel+`.env.local`）：`KV_*`、`ADMIN_KEY`、`NTFY_TOPIC`（本机 `~/.fable_ntfy_topic`）、`TRIAL_CAP`；owner 开通爱发电后补 `AFDIAN_USER_ID/AFDIAN_API_TOKEN/AFDIAN_PLAN_URL`
- R5 git 更新：gitclone.com 镜像常 502 → 本机 `git bundle create` + scp + `git clone fable.bundle`（或 scp 单文件）

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
