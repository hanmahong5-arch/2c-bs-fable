/**
 * env.ts — 配置读取收口 + 缺失即 fast-fail (全局约定: 配置启动期/调用期清晰报错, 不静默默认)。
 *
 * 错误三要素: 缺了什么 / 期望从哪取 / 调用方能做什么。
 * 懒求值铁律: 只在「真正要用配置」的函数体内调用 requireEnv —— 不在模块顶层,
 * 否则 next build 收集路由时即抛, 把「运行期缺配置」误成「构建失败」。
 */

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `缺少必需配置 ${name}：请在运行环境 (Vercel 项目 env / R5 .fable-radio.env / 本地 .env.local) 设置 ${name} 后重试。`,
    );
  }
  return v;
}

/** 多候选取第一个非空 env (如 KV_REST_API_URL / UPSTASH_REDIS_REST_URL 互为别名); 全空则 fast-fail。 */
export function requireEnvAny(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  throw new Error(
    `缺少必需配置 ${names.join(" 或 ")}：请至少设置其一后重试。`,
  );
}
