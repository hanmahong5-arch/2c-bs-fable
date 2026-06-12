/**
 * local-identity.ts — token 即账号的「账号感」补全 (纯 client util)。
 *
 * localStorage 是增强不是依赖: 写入失败 (微信 webview 偶发禁用 / 隐私模式) 一律静默,
 * 主流程 (URL 即凭证) 不受影响。仅在 "use client" 组件中调用。
 */

const KEY_DEMO = "fable.demoId";
const KEY_TOKEN = "fable.radioToken";

function get(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function set(key: string, value: string): void {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // 静默
  }
}

export function getDemoId(): string {
  return get(KEY_DEMO);
}

export function setDemoId(id: string): void {
  set(KEY_DEMO, id);
}

export function getRadioToken(): string {
  return get(KEY_TOKEN);
}

/** trial 开通 (demo 转正) 时调用: 存电台 token 并清掉已消费的 demoId。 */
export function setRadioToken(token: string): void {
  set(KEY_TOKEN, token);
  set(KEY_DEMO, "");
}
