import Link from "next/link";
import { Moon } from "lucide-react";
import NightCard from "@/components/ui/NightCard";

/**
 * 全站 404 (P0): 此前 stories/[slug]、articles/[category]、articles/[category]/[slug] 的
 * notFound() 会落到 Next 默认无品牌页面; 这里把站内已有的夜空视觉语言(NightCard + 引导链接)
 * 抽成统一的品牌化 404, 全站 notFound() 与未匹配路由都会用到这一个组件。
 */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-5 py-20 text-center">
      <NightCard className="rise-soft sky-live moonglow px-6 py-10">
        <Moon size={22} className="mx-auto text-moon" aria-hidden />
        <h1 className="mt-4 font-display text-2xl leading-snug text-star-soft">
          这个页面不存在，或者已经搬家了
        </h1>
        <p className="mt-4 leading-relaxed text-moon">
          可能是链接失效，也可能是内容还没写好——去看看故事库，或者回首页找找。
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="rounded-full bg-star px-8 py-3 font-medium text-night hover:bg-star-soft transition-colors"
          >
            回首页
          </Link>
          <Link
            href="/stories"
            className="rounded-full border border-moon/40 px-8 py-3 text-moon hover:border-star hover:text-star transition-colors"
          >
            去故事库看看
          </Link>
        </div>
      </NightCard>
    </div>
  );
}
