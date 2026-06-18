# fable.xin (2c-bs-fable)

寓言星球 — AI 原创中文睡前故事 + 自托管情感语音朗读（亲声试听 / 连载商业化）。面向家长哄睡。Lifecycle stage。domain `fable.xin`（无 ICP，**不上 CN IDC**，Vercel 托管，手动部署）。Next.js 16.2 / React 19.2 / Tailwind 4 / Bun；零数据库（故事 `content/stories/*.md`，文章 `content/articles-index.jsonl`，订户状态 Upstash Redis via `src/lib/store.ts`）。

## Commands

```bash
bun install
bun run dev / build / lint
bun test                                       # hermetic 单测 (tonight.test.ts 等)
bunx vercel --prod --archive=tgz               # 部署 (手动!；万文件必带 --archive)

# 内容生成 (文本经 newapi，语音经 R5 自托管 TTS)
bun run scripts/gen-story.ts --count 3
bun run scripts/gen-story.ts --audio-only      # 给缺音频的补音频 (幂等)
bun scripts/admin.ts <action>                  # 连载订户管理 (create-sub/list/rotate-token/revoke/funnel/…)
```

> 真源/细节: **红线**——站内禁出现 AI 模型名（说「AI 创作引擎」「自研情感语音引擎」）；内容安全零暴力/恐怖、结尾平静适合入睡。漏斗 / 每晚管线 / 电台 / 亲声连载 / R5 Xray 代理 / 万篇内容库 / 兜底保证 等期次实现细节 → git 历史 + `/vercel-deploy` `/cn-idc-icp` `/aliyun-dns` skill。env 见 `.env.local` + Vercel。
