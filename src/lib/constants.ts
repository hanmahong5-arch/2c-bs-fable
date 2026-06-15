/**
 * constants.ts — 跨文件复用的业务常量收口。
 *
 * 这些魔法值原先散落在多个路由/组件里 (审计实证重复), 易漂移; 收一处单一真源。
 * 只放纯字面量, 零运行时依赖 → client 组件与 server 路由都能 import。
 * 运行期可覆盖的配置 (env) 不放这里, 见 env.ts。
 */

/** trial 免费连载晚数 (第 3 晚悬念收尾 + 生成未来 7 晚预告)。 */
export const TRIAL_NIGHTS = 3;

/** 录音上传体积上限 (Vercel 请求体上限 4.5MB, 留余量 ≈ 30 秒)。 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** 「给工坊捎句话」单条字数上限。 */
export const MAX_NOTE = 50;
/** 孩子小名 (故事主角名) 字数上限。 */
export const MAX_CHILD_NAME = 12;
/** 「孩子最近的一件事 / 喜好」字数上限。 */
export const MAX_PREFS = 50;
/** 联系方式 (微信号 / 手机) 字数上限。 */
export const MAX_CONTACT = 40;

/** demoId→voiceId 留底时长: 试听 30 天内转订阅可复用音色。 */
export const DEMO_TTL_SECONDS = 30 * 24 * 3600;
/** 漏斗逐日计数键留存时长。 */
export const FUNNEL_TTL_SECONDS = 30 * 86400;

/** 朗读音频滚动保留天数 (故事文字永久, 音频到期归档)。 */
export const AUDIO_KEEP_DAYS = 14;
/** 北京时间「今晚故事」解锁小时。 */
export const UNLOCK_HOUR = 19;

/** 文章亲声朗读「精华版」截断字数 (控合成时长贴 maxDuration 余量)。 */
export const ARTICLE_SYNTH_MAX_CHARS = 500;

// ── 温暖一致的错误微文案 (哄睡品牌调性; 原先各处「出了点小问题 / 网络不太稳定 / 工坊忙不过来」语气冷硬且不一) ──
/** 客户端 fetch 网络异常 (catch 分支)。 */
export const MSG_NETWORK = "网络好像打了个盹，请再试一次。";
/** 引擎 / 工坊繁忙, 稍后可重试 (GPU 争用、503 等)。 */
export const MSG_BUSY = "工坊正忙着，过一小会儿再试一次。";
/** 兜底未知错误。 */
export const MSG_GENERIC = "出了点小状况，请稍后再试。";

/**
 * CosyVoice 本机回退地址 — env (COSY_URL / COSY_PUBLIC_URL) 都没给时的内网直连兜底。
 * 这是内网地址非对外 URL: R5 systemd 与 daily-cron.sh 均会注入真实 COSY_URL, Vercel 侧用
 * COSY_PUBLIC_URL; 此常量只是「两者都缺」时的本机默认, 避免硬编码散在业务文件里。
 */
export const COSY_FALLBACK_URL = "http://100.120.110.73:8123";
