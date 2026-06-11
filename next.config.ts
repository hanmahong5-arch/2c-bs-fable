import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // 文章库走动态渲染 (万篇 SSG 会炸 build), md/索引不被静态 import →
  // 必须显式打进 serverless bundle, 否则线上 fs 读不到
  outputFileTracingIncludes: {
    "/articles/**": [
      "./content/articles/**",
      "./content/articles-index.jsonl",
      "./content/articles-taxonomy.json",
    ],
    "/sitemap.xml": ["./content/articles-index.jsonl", "./content/articles-taxonomy.json"],
  },
  async headers() {
    return [
      {
        // 亲声电台私有页: 响应头级 noindex (metadata + robots.ts 之外的第三道)
        source: "/radio/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
