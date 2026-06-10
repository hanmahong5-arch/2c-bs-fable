import type { Metadata } from "next";
import DemoPlayer from "./demo-player";

export const metadata: Metadata = {
  title: "亲声试听 — 这是用你的声音讲的睡前故事",
  description: "用 30 秒录音生成的专属亲声试听。",
  robots: { index: false, follow: false },
};

export default async function DemoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DemoPlayer id={id} />;
}
