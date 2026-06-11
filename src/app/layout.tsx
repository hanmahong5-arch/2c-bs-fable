import type { Metadata } from "next";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://fable.xin"),
  title: {
    default: "寓言星球 fable.xin — 每天一个原创睡前故事，温柔讲给孩子听",
    template: "%s · 寓言星球 fable.xin",
  },
  description:
    "寓言星球：AI 原创中文寓言与睡前故事，每篇都配真人感情感朗读音频。哄睡、磨耳朵、亲子共读，每天更新。",
  keywords: [
    "睡前故事",
    "寓言故事",
    "儿童故事",
    "哄睡故事",
    "童话故事",
    "故事音频",
    "亲子阅读",
  ],
  openGraph: {
    title: "寓言星球 fable.xin",
    description: "每天一个原创睡前故事，配情感朗读音频，温柔讲给孩子听。",
    url: "https://fable.xin",
    siteName: "寓言星球",
    locale: "zh_CN",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen flex flex-col">
        <header className="bg-night starfield text-paper">
          <nav className="mx-auto max-w-5xl px-5 py-4 flex items-center justify-between">
            <Link href="/" className="font-display text-xl text-star">
              寓言星球
            </Link>
            <div className="flex gap-6 text-sm text-moon">
              <Link href="/stories" className="hover:text-star transition-colors">
                故事库
              </Link>
              <Link href="/articles" className="hover:text-star transition-colors">
                内容库
              </Link>
              <Link href="/custom" className="hover:text-star transition-colors">
                定制故事
              </Link>
              <Link href="/about" className="hover:text-star transition-colors">
                关于
              </Link>
            </div>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="bg-night-deep text-moon text-sm">
          <div className="mx-auto max-w-5xl px-5 py-8 space-y-2">
            <p>
              寓言星球 fable.xin — 本站故事由人工智能辅助创作，经自动安全过滤与人工抽查，朗读音频由自研「亲声工坊」情感语音引擎合成。
            </p>
            <p>
              故事文本采用{" "}
              <a
                href="https://creativecommons.org/licenses/by-nc/4.0/deed.zh-hans"
                className="underline hover:text-star"
                rel="noopener noreferrer"
              >
                CC BY-NC 4.0
              </a>{" "}
              授权，欢迎非商业转载（注明来源 fable.xin）。
            </p>
            <p>© {new Date().getFullYear()} fable.xin</p>
          </div>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
