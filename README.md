[中文](README.zh-CN.md) | English

# Fable Planet — fable.xin

A Chinese-language bedtime-story product for parents: a free daily original story with emotional voice narration, plus a paid "narrated-in-your-voice" nightly serial for one child.

Fable Planet publishes one new Mandarin bedtime story every night, narrated with a soft, sleep-appropriate voice, and gives parents an optional paid tier ("亲声·连载") where a story is generated nightly starring their own child (by name) and read aloud in the parent's own cloned voice. It ships as a single Next.js app deployed to Vercel, with a self-hosted TTS/voice-cloning backend and an owner-operated (single-maintainer) admin CLI — there is no CI pipeline and deploys are triggered manually (`vercel --prod`, see `scripts/daily-cron.sh:69`). As of this writing the library holds 62 free stories (`content/stories/*.md`) with 60 matching audio files (`public/audio/*.mp3`) and roughly 16,600 SEO articles (`content/articles-index.jsonl`).

## Core capabilities

- **Free daily stories with narration** — original short Mandarin bedtime stories with matching mp3 narration, publicly listed and playable (`content/stories/*.md`, `public/audio/*.mp3`, `src/app/stories/`).
- **"亲声·连载" personalized paid serial** — nightly LLM-written story starring the subscriber's own child, narrated in a voice cloned from a parent-submitted sample; runs on a nightly pipeline plus an instant first-night path (`scripts/radio-pipeline.ts`, `src/app/api/radio/instant-first/route.ts`, `src/lib/radio-story.ts`, private pages at `src/app/radio/[token]/`).
- **3-night free trial, no signup** — trial subscribers get 3 personalized nights before a paywall prompt (`src/app/trial/`, `src/app/api/trial/route.ts`, `TRIAL_NIGHTS` in `src/lib/constants.ts:10`).
- **Voice-clone preview demo** — a short recording produces an instant narrated sample before a parent commits to paying (`src/app/api/voice-demo/route.ts`, `src/components/voice-recorder.tsx`).
- **~16.6k-article SEO content library** — parenting-topic articles served dynamically by category, with an optional "read in my voice" narration for a subset (`content/articles-index.jsonl`, `src/app/articles/`, `src/app/api/articles/synth/route.ts`).
- **Podcast RSS + 爱发电 (Afdian) payments** — the daily free feed is syndicated via `/feed.xml`; the paid tier is billed through the third-party platform 爱发电, with webhook-as-doorbell plus a signed open-API re-query as the source of truth for order status (`src/lib/rss.ts`, `src/lib/payments/afdian.ts:33-75`, `src/app/api/afdian/webhook/route.ts`).

## Quick start

```bash
bun install
bun run dev      # http://localhost:3000
bun run build
bun run lint
bun test          # hermetic unit tests (13 *.test.ts files; no CI configured yet)
```

Content-generation scripts (require the env vars listed below):

```bash
NEWAPI_TRIAL_TOKEN=... STORY_MODEL=... COSY_API_KEY=... \
  bun run scripts/gen-story.ts --count 3      # write N new free stories + narration
bun run scripts/gen-story.ts --audio-only     # backfill narration for text-only stories

bun scripts/admin.ts list                     # owner ops CLI, see `scripts/admin.ts:8-19`
bunx vercel --prod --archive=tgz              # manual deploy (must use --archive: many small files)
```

## Architecture

```
2c-bs-fable/
├── content/
│   ├── stories/*.md              # 62 free daily stories (text)
│   ├── articles/<category>/      # ~16.6k SEO articles by category
│   └── articles-index.jsonl      # article index consumed at request time
├── public/audio/*.mp3            # narration for the free story library (60 files)
├── src/
│   ├── app/                      # Next.js App Router: pages + API routes
│   │   ├── api/{admin,afdian,articles,cron,radio,trial,voice-demo,voice-upload}/
│   │   ├── radio/[token]/        # private per-subscriber serial page
│   │   ├── stories/ articles/ custom/ trial/
│   │   └── feed.xml/ sitemap.ts robots.ts
│   ├── lib/                      # business logic (store.ts, env.ts, cosy.ts, story-gen.ts, payments/afdian.ts …)
│   └── components/
├── scripts/                      # bun-run pipelines + owner CLI (not HTTP services)
│   ├── gen-story.ts / gen-cover.ts
│   ├── radio-pipeline.ts         # nightly serial pipeline, runs on R5 via systemd timer
│   ├── admin.ts                  # owner operations CLI
│   └── articles/                 # bulk SEO article generation
└── _ops/                         # operator working notes (gitignored, never committed)
```

Data model: a single Upstash Redis instance is the system of record for subscribers, tokens, serial state and per-night stories (key layout documented at `src/lib/store.ts:5-16`); narration audio lives in Vercel Blob (`src/lib/audio-storage.ts`), with a 14-day rolling retention for paid-serial audio (text is kept indefinitely).

## Configuration

Read via `process.env` / `requireEnv` (`src/lib/env.ts`); "required" below means the code throws or the route 500s if unset.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `KV_REST_API_URL` or `UPSTASH_REDIS_REST_URL` | yes (either) | — | Upstash Redis REST endpoint, the only datastore (`src/lib/store.ts:27`) |
| `KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_TOKEN` | yes (either) | — | Redis REST token (`src/lib/store.ts:28`) |
| `STORY_MODEL` | yes, when generating stories | — | LLM model id sent to the newapi gateway (`src/lib/story-gen.ts:43`) |
| `NEWAPI_TRIAL_TOKEN` | yes, when generating stories | `""` | Bearer token for the newapi gateway (`src/lib/story-gen.ts:12`) |
| `NEWAPI_URL` | no | `https://newapi.lurus.cn/v1/chat/completions` | LLM gateway endpoint (`src/lib/story-gen.ts:11`) |
| `NEWAPI_KEY` | yes, for `/api/voice-demo` | — | Separate newapi key used only by the voice-demo route (`src/app/api/voice-demo/route.ts:38`) |
| `COSY_PUBLIC_URL` | yes, for voice register/delete | — | Public URL of the self-hosted CosyVoice service (`src/lib/cosy.ts:12`) |
| `COSY_URL` | no | `COSY_PUBLIC_URL`, else `http://100.120.110.73:8123` | Internal-network CosyVoice address, used by the R5 pipeline (`src/lib/constants.ts:63`) |
| `COSY_API_KEY` | yes, for voice-clone calls | `""` | CosyVoice auth (`src/lib/cosy.ts:12`, `src/lib/story-gen.ts:15`) |
| `BLOB_READ_WRITE_TOKEN` | yes, on the R5 pipeline | — | Vercel Blob write token (Vercel-provided automatically inside Vercel functions; the off-platform R5 pipeline needs it set explicitly, see `scripts/radio-pipeline.ts:11`) |
| `NEXT_PUBLIC_BLOB_BASE` | yes, for the demo player | — | Client-visible Blob base URL (`src/app/custom/demo/[id]/demo-player.tsx:16`) |
| `ADMIN_KEY` | yes, for `/api/admin` | — | Bearer auth for the owner admin API (`src/app/api/admin/route.ts:45`) |
| `CRON_SECRET` | no | — | Bearer auth for the Vercel Cron heartbeat, if set (`src/app/api/cron/heartbeat/route.ts:43`) |
| `AFDIAN_USER_ID` / `AFDIAN_API_TOKEN` | yes, for payment verification | — | 爱发电 open-API credentials (`src/lib/payments/afdian.ts:41-42`) |
| `AFDIAN_PLAN_URL` | no | `""` | Checkout link shown on the subscriber page (`src/app/radio/[token]/page.tsx:59`) |
| `NTFY_TOPIC` | no | — | ntfy.sh topic for owner push alerts; silently no-ops if unset (`src/lib/ntfy.ts:11`) |
| `TRIAL_CAP` | no | `30` | Free-trial slot cap (`src/app/api/trial/route.ts:44`) |
| `SUB_HARD_CAP` | no | `30` | Hard cap on paid subscribers (`src/app/api/trial/route.ts:50`) |
| `FOUNDING_CAP` | no | `100` | "Founding families" seats-left counter on the homepage (`src/app/page.tsx:10`) |
| `FABLE_ADMIN_URL` | no | `https://fable.xin` | Backend the admin CLI talks to (`scripts/admin.ts:24`) |
| `TOPICS_TARGET` / `TOPICS_CONCURRENCY` / `ARTICLES_CONCURRENCY` | no | `10000` / `6` / `8` | Bulk SEO article generation target/concurrency (`scripts/articles/expand-topics.ts:19-20`, `scripts/articles/gen-articles.ts:27`) |

## API overview

HTTP routes under `src/app/api/`:

| Route | Purpose |
|---|---|
| `POST /api/trial` | register a 3-night free trial subscriber |
| `POST /api/voice-demo` | instant voice-clone preview (no signup) |
| `POST /api/voice-upload` | full voice-sample upload for a paying subscriber |
| `POST /api/radio/subscriber` | create/update a subscriber's serial profile |
| `POST /api/radio/instant-first` | generate the first serial night on the spot |
| `POST /api/radio/{note,star,listened,fallback}` | subscriber-facing serial page actions |
| `POST /api/radio/{delete-account,delete-voice}` | subscriber self-service deletion |
| `POST /api/articles/synth` | narrate one article into the subscriber's cloned voice |
| `POST /api/afdian/webhook` | payment doorbell (verified via open-API re-query, not trusted as-is) |
| `POST /api/admin` | owner-only operations, see actions in `scripts/admin.ts:8-19` |
| `GET /api/cron/heartbeat` | Vercel Cron dead-man's switch for the R5 nightly pipeline |
| `GET /feed.xml` | podcast RSS of the free daily stories |

Owner CLI (`bun scripts/admin.ts <action>`, not HTTP-facing): `create-sub`, `list`, `extend`, `rotate-token`, `set-voice`, `revoke`, `pending-orders`, `bind-order`, `dump`.

## Development conventions

From this repo's own convention doc:

- **Config access is centralized**: never read `process.env` ad hoc in business code — go through `requireEnv` / `requireEnvAny` (`src/lib/env.ts`), which fail fast with "what's missing / where to set it / what to do next" rather than propagating `undefined`.
- **Lazy env evaluation**: `requireEnv` is called inside function bodies, not at module top level, so a missing runtime config doesn't get mis-diagnosed as a Next.js build failure.
- **Shared generation core**: story-writing, safety-check and TTS logic lives once in `scripts/lib/story-gen.ts` / `src/lib/radio-story.ts` and is imported by both the nightly pipeline and the Vercel-side instant-generation route, so "night 1" and "night 2+" are guaranteed to share one prompt/safety/retry path.
- **Content safety is two independent LLM calls**: one call drafts the story, a second, separately-prompted call reviews it against a hard-coded safety checklist (no violence/horror/ads/unsettling endings) before it is ever saved (`src/lib/story-gen.ts:60-85`).
- **On-site copy avoids naming any specific AI vendor or model** — the product's own pages describe the pipeline generically (e.g. "AI 创作引擎", "亲声工坊情感语音引擎") rather than naming an underlying model or vendor.
- Operational notes and campaign logs live under `_ops/` and are gitignored — never committed to this repo.

## Related projects

- **newapi (`newapi.lurus.cn`)** — internal LLM gateway; consumed for story/article text generation via an OpenAI-compatible `/v1/chat/completions` endpoint (`src/lib/story-gen.ts:11`, listed as a consumer in the platform's `contracts.md`).
- **Self-hosted CosyVoice** — the voice-cloning/TTS backend behind `COSY_PUBLIC_URL`/`COSY_URL`, run on a separate host (R5) and reached over HTTP (`src/lib/cosy.ts`, `src/lib/story-gen.ts:13-15`).
- **爱发电 (Afdian)** — external third-party payment platform for the paid serial tier; billing is handled entirely outside this repo's own infrastructure (`src/lib/payments/afdian.ts`).

## License

Source code (`src/`, `scripts/`, config files) is **proprietary — all rights reserved**; see `LICENSE` for the full terms (no permission is granted to copy, modify, or redistribute it). Story text under `content/` is separately licensed **CC BY-NC 4.0** (attribution, non-commercial). Third-party runtime and build dependencies (Next.js, React, Tailwind CSS, `@upstash/redis`, `@vercel/blob`, etc.) retain their own upstream licenses; see `NOTICE` for the full list.
