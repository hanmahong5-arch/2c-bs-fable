中文 | [English](README.md)

# 寓言星球 fable.xin

面向中国家长的中文睡前故事产品：每天一篇免费原创故事 + 情感朗读，另有付费的『亲声·连载』——用家长自己的声音每晚为孩子讲一个专属故事。

寓言星球每晚发布一篇全新的中文睡前故事，配以轻柔适合入睡的朗读音频；同时提供一档付费选项(「亲声·连载」)，每晚为订户的孩子（用小名当主角）生成专属连载故事，并用家长本人上传克隆的声音朗读。产品形态是单一 Next.js 应用，部署在 Vercel，配一个自托管的语音克隆/合成后端，以及 owner 一人运营的后台 CLI——目前**没有 CI**，部署靠手工触发（`vercel --prod`，见 `scripts/daily-cron.sh:69`）。截至本次调研，免费故事库有 62 篇（`content/stories/*.md`），配套音频 60 条（`public/audio/*.mp3`），另有约 1.66 万篇 SEO 文章库（`content/articles-index.jsonl`）。

## 核心能力

- **每日免费故事 + 朗读** —— 原创中文睡前短故事配 mp3 情感朗读，公开可听 (`content/stories/*.md`、`public/audio/*.mp3`、`src/app/stories/`)。
- **「亲声·连载」付费个性化连载** —— 每晚由 LLM 为订户的孩子（真名主角）新写一篇故事，用家长克隆的声音朗读；同时有每晚管线与「第一晚即时生成」两条路径 (`scripts/radio-pipeline.ts`、`src/app/api/radio/instant-first/route.ts`、`src/lib/radio-story.ts`、订户私有页 `src/app/radio/[token]/`)。
- **3 晚免费试用，不注册不付款** —— 试用订户可先体验 3 晚个性化连载再决定是否付费 (`src/app/trial/`、`src/app/api/trial/route.ts`、`TRIAL_NIGHTS` 定义于 `src/lib/constants.ts:10`)。
- **声音克隆试听 Demo** —— 录一小段声音即时生成一段试听，用于付费前体验 (`src/app/api/voice-demo/route.ts`、`src/components/voice-recorder.tsx`)。
- **约 1.66 万篇 SEO 文章库** —— 育儿主题文章按分类动态渲染，部分文章支持「用我的声音朗读」 (`content/articles-index.jsonl`、`src/app/articles/`、`src/app/api/articles/synth/route.ts`)。
- **播客 RSS + 爱发电支付** —— 每日免费故事音频通过 `/feed.xml` 同步分发；付费连载走第三方平台爱发电结算，webhook 只当门铃，订单真相以签名开放 API 回查为准 (`src/lib/rss.ts`、`src/lib/payments/afdian.ts:33-75`、`src/app/api/afdian/webhook/route.ts`)。

## 快速开始

```bash
bun install
bun run dev      # http://localhost:3000
bun run build
bun run lint
bun test          # hermetic 单测 (13 个 *.test.ts 文件；尚未配置 CI)
```

内容生成脚本（需先设置下方「配置」表中的环境变量）：

```bash
NEWAPI_TRIAL_TOKEN=... STORY_MODEL=... COSY_API_KEY=... \
  bun run scripts/gen-story.ts --count 3      # 生成 N 篇新的免费故事 + 朗读
bun run scripts/gen-story.ts --audio-only     # 给缺音频的存量故事补音频

bun scripts/admin.ts list                     # owner 运营 CLI，动作清单见 `scripts/admin.ts:8-19`
bunx vercel --prod --archive=tgz              # 手工部署（文件数多，必须带 --archive）
```

## 架构

```
2c-bs-fable/
├── content/
│   ├── stories/*.md              # 62 篇免费故事文本
│   ├── articles/<category>/      # 约 1.66 万篇 SEO 文章，按分类归档
│   └── articles-index.jsonl      # 文章索引 (请求期读取)
├── public/audio/*.mp3            # 免费故事库配套朗读音频 (60 条)
├── src/
│   ├── app/                      # Next.js App Router：页面 + API 路由
│   │   ├── api/{admin,afdian,articles,cron,radio,trial,voice-demo,voice-upload}/
│   │   ├── radio/[token]/        # 订户私有连载页
│   │   ├── stories/ articles/ custom/ trial/
│   │   └── feed.xml/ sitemap.ts robots.ts
│   ├── lib/                      # 业务逻辑收口 (store.ts、env.ts、cosy.ts、story-gen.ts、payments/afdian.ts …)
│   └── components/
├── scripts/                      # bun 直跑的生成管线 + owner CLI (非 HTTP 服务)
│   ├── gen-story.ts / gen-cover.ts
│   ├── radio-pipeline.ts         # 每晚连载管线，跑在 R5，systemd timer 触发
│   ├── admin.ts                  # owner 运营 CLI
│   └── articles/                 # 批量 SEO 文章生成
└── _ops/                         # 运营记录 (已 gitignore，不进公开仓)
```

数据模型：单一 Upstash Redis 实例是订户、token、连载状态与逐晚故事的唯一存储（键空间见 `src/lib/store.ts:5-16` 注释）；朗读音频存 Vercel Blob (`src/lib/audio-storage.ts`)，付费连载音频滚动保留 14 天（文本永久保留）。

## 配置

配置读取统一走 `process.env` / `requireEnv` (`src/lib/env.ts`)；下表「必填」指该值缺失时代码会抛错或路由直接 500。

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `KV_REST_API_URL` 或 `UPSTASH_REDIS_REST_URL` | 是（二选一） | — | Upstash Redis REST 地址，唯一数据存储 (`src/lib/store.ts:27`) |
| `KV_REST_API_TOKEN` 或 `UPSTASH_REDIS_REST_TOKEN` | 是（二选一） | — | Redis REST token (`src/lib/store.ts:28`) |
| `STORY_MODEL` | 是（生成故事时） | — | 传给 newapi 网关的 LLM 模型 id (`src/lib/story-gen.ts:43`) |
| `NEWAPI_TRIAL_TOKEN` | 是（生成故事时） | `""` | newapi 网关鉴权 token (`src/lib/story-gen.ts:12`) |
| `NEWAPI_URL` | 否 | `https://newapi.lurus.cn/v1/chat/completions` | LLM 网关地址 (`src/lib/story-gen.ts:11`) |
| `NEWAPI_KEY` | 是（`/api/voice-demo`） | — | 试听 demo 路由独立使用的 newapi key (`src/app/api/voice-demo/route.ts:38`) |
| `COSY_PUBLIC_URL` | 是（声音注册/删除） | — | 自托管 CosyVoice 服务对外地址 (`src/lib/cosy.ts:12`) |
| `COSY_URL` | 否 | 取 `COSY_PUBLIC_URL`，否则 `http://100.120.110.73:8123` | R5 内网直连地址，管线专用 (`src/lib/constants.ts:63`) |
| `COSY_API_KEY` | 是（声音克隆调用） | `""` | CosyVoice 鉴权 (`src/lib/cosy.ts:12`、`src/lib/story-gen.ts:15`) |
| `BLOB_READ_WRITE_TOKEN` | 是（R5 管线） | — | Vercel Blob 写权限 token（Vercel 函数内自动注入；R5 管线跑在平台外须显式设置，见 `scripts/radio-pipeline.ts:11`） |
| `NEXT_PUBLIC_BLOB_BASE` | 是（demo 播放器） | — | 客户端可见的 Blob 基础 URL (`src/app/custom/demo/[id]/demo-player.tsx:16`) |
| `ADMIN_KEY` | 是（`/api/admin`） | — | owner 后台 API 鉴权 (`src/app/api/admin/route.ts:45`) |
| `CRON_SECRET` | 否 | — | Vercel Cron 心跳鉴权，设了才校验 (`src/app/api/cron/heartbeat/route.ts:43`) |
| `AFDIAN_USER_ID` / `AFDIAN_API_TOKEN` | 是（支付回查） | — | 爱发电开放 API 凭证 (`src/lib/payments/afdian.ts:41-42`) |
| `AFDIAN_PLAN_URL` | 否 | `""` | 订户页展示的付费入口链接 (`src/app/radio/[token]/page.tsx:59`) |
| `NTFY_TOPIC` | 否 | — | ntfy.sh owner 推送 topic，未设即静默跳过 (`src/lib/ntfy.ts:11`) |
| `TRIAL_CAP` | 否 | `30` | 免费试用名额上限 (`src/app/api/trial/route.ts:44`) |
| `SUB_HARD_CAP` | 否 | `30` | 付费订户硬上限 (`src/app/api/trial/route.ts:50`) |
| `FOUNDING_CAP` | 否 | `100` | 首页「创始家庭」余量展示上限 (`src/app/page.tsx:10`) |
| `FABLE_ADMIN_URL` | 否 | `https://fable.xin` | admin CLI 指向的后端地址 (`scripts/admin.ts:24`) |
| `TOPICS_TARGET` / `TOPICS_CONCURRENCY` / `ARTICLES_CONCURRENCY` | 否 | `10000` / `6` / `8` | 批量 SEO 文章生成的目标篇数/并发 (`scripts/articles/expand-topics.ts:19-20`、`scripts/articles/gen-articles.ts:27`) |

## 接口概览

`src/app/api/` 下的 HTTP 路由：

| 路由 | 说明 |
|---|---|
| `POST /api/trial` | 注册 3 晚免费试用订户 |
| `POST /api/voice-demo` | 声音克隆即时试听（无需注册） |
| `POST /api/voice-upload` | 付费订户正式录音上传 |
| `POST /api/radio/subscriber` | 创建/更新订户连载档案 |
| `POST /api/radio/instant-first` | 即时生成第一晚故事 |
| `POST /api/radio/{note,star,listened,fallback}` | 订户在连载页的自助操作 |
| `POST /api/radio/{delete-account,delete-voice}` | 订户自助注销/删除声音 |
| `POST /api/articles/synth` | 用订户克隆声音朗读一篇文章 |
| `POST /api/afdian/webhook` | 支付门铃（不直接信任，须开放 API 回查验真） |
| `POST /api/admin` | owner 专用后台动作，清单见 `scripts/admin.ts:8-19` |
| `GET /api/cron/heartbeat` | Vercel Cron 对 R5 每晚管线的死人开关 |
| `GET /feed.xml` | 免费故事库播客 RSS |

Owner CLI（`bun scripts/admin.ts <action>`，非 HTTP 接口）：`create-sub`、`list`、`extend`、`rotate-token`、`set-voice`、`revoke`、`pending-orders`、`bind-order`、`dump`。

## 开发约定

来自本仓开发约定文档：

- **配置读取收口**：业务代码禁止散落直接读 `process.env`，一律经 `requireEnv` / `requireEnvAny` (`src/lib/env.ts`)——缺失时报错三要素（缺了什么 / 期望从哪取 / 调用方能做什么），不让 `undefined` 中途扩散。
- **懒求值铁律**：`requireEnv` 只在函数体内调用，不在模块顶层，避免「运行期缺配置」被 Next.js build 误判成「构建失败」。
- **生成核心共享**：写故事 / 安全自检 / TTS 合成的逻辑只在 `scripts/lib/story-gen.ts`、`src/lib/radio-story.ts` 存一份，供每晚管线与 Vercel 侧即时生成路由共用，保证「第一晚」与「次晚」是同一套 prompt/安全/重试逻辑。
- **内容安全走两次独立 LLM 调用**：一次撰稿，第二次用独立 prompt 审核暴力/恐怖/广告植入/不当价值观/结尾不平静等红线，通过后才落库 (`src/lib/story-gen.ts:60-85`)。
- **站内文案禁止点名具体 AI 供应商或模型** —— 产品自身页面统一用通用说法描述生成管线（如「AI 创作引擎」「亲声工坊情感语音引擎」），不点名底层模型或厂商。
- 运营记录与投放日志放在 `_ops/`，已 gitignore，不进本仓。

## 相关项目

- **newapi (`newapi.lurus.cn`)** —— 内部 LLM 网关，故事/文章文本生成经由其 OpenAI 兼容 `/v1/chat/completions` 接口调用 (`src/lib/story-gen.ts:11`；contracts.md 中登记为其消费者)。
- **自托管 CosyVoice** —— `COSY_PUBLIC_URL`/`COSY_URL` 背后的声音克隆/语音合成后端，独立部署（R5），经 HTTP 调用 (`src/lib/cosy.ts`、`src/lib/story-gen.ts:13-15`)。
- **爱发电 (Afdian)** —— 付费连载走的第三方外部支付平台，计费完全独立于本仓自身基础设施 (`src/lib/payments/afdian.ts`)。

## 许可

源代码（`src/`、`scripts/`、各配置文件）为**专有许可 · 保留所有权利**，未经许可不得复制、修改或再分发，完整条款见 `LICENSE`。`content/` 目录下的故事文本单独以 **CC BY-NC 4.0**（署名—非商业性使用）授权。第三方运行时与构建依赖（Next.js、React、Tailwind CSS、`@upstash/redis`、`@vercel/blob` 等）保留各自原始许可，完整清单见 `NOTICE`。
