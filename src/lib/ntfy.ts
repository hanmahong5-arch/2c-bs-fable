/**
 * ntfy.ts — owner 一人运营的手机推送 (ntfy.sh 免费 topic)。
 * 失败只 log 不抛: 通知是旁路, 永不阻塞主流程。
 */

export async function notify(
  title: string,
  message: string,
  priority: "default" | "high" = "default",
): Promise<void> {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return;
  try {
    // JSON publish: header 只收 ASCII, 中文标题必须走 body
    await fetch("https://ntfy.sh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic, title, message, priority: priority === "high" ? 4 : 3 }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    console.error("ntfy failed", e);
  }
}
