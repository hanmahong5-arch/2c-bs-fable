import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // 亲声 demo 分享页 + 电台私有页: 私人内容, 不进索引 (页面级 metadata 亦有 noindex)
        disallow: ["/custom/demo/", "/radio/", "/api/"],
      },
    ],
    sitemap: "https://fable.xin/sitemap.xml",
  };
}
