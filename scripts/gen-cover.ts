/**
 * gen-cover.ts — 代码出图: 播客封面 + 全站 OG 图。
 *
 * 图像模型不可用 (newapi Google 图像模型 403), 改用手写 SVG → resvg 转 PNG,
 * 与站内 night/star/paper token 同源, 视觉全程可控。
 *
 *   bun scripts/gen-cover.ts
 *     → public/podcast-cover.png        3000×3000 (Apple Podcasts 要求 1400–3000 RGB)
 *     → src/app/opengraph-image.png     1200×630  (Next 约定文件 → 全站 og:image/twitter:image)
 *
 * 字体: 本机渲染依赖系统 CJK 字体 (Windows: SimSun/KaiTi)。PNG 提交进仓,
 * Vercel 构建不再触碰字体 → 避免 CN 网络拉 Google Fonts 的不确定性。
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";

const NIGHT_DEEP = "#0a1120";
const NIGHT = "#10192c";
const NIGHT_HORIZON = "#1c2c4a";
const STAR = "#ffd98e";
const STAR_SOFT = "#ffe9bf";
const PAPER = "#fbf7ef";
const MOON = "#aebed8";

const DISPLAY_FONT = "KaiTi, SimSun, serif";

/** 确定性伪随机 (mulberry32) — 星空可复现, 不引入 Math.random */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function starsSvg(w: number, h: number, count: number, seed: number, scale: number): string {
  const rand = rng(seed);
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = Math.round(rand() * w);
    const y = Math.round(rand() * h * 0.78);
    const r = (0.6 + rand() * 1.9) * scale;
    const o = (0.25 + rand() * 0.7).toFixed(2);
    const warm = rand() < 0.35;
    parts.push(
      `<circle cx="${x}" cy="${y}" r="${r.toFixed(1)}" fill="${warm ? STAR : "#ffffff"}" opacity="${o}"/>`,
    );
    if (r > 1.7 * scale && rand() < 0.5) {
      // 大星加十字光芒
      const s = r * 3.2;
      parts.push(
        `<path d="M ${x - s} ${y} H ${x + s} M ${x} ${y - s} V ${y + s}" stroke="${warm ? STAR_SOFT : "#ffffff"}" stroke-width="${(0.5 * scale).toFixed(1)}" opacity="${(Number(o) * 0.5).toFixed(2)}"/>`,
      );
    }
  }
  return parts.join("\n");
}

function crescentSvg(cx: number, cy: number, r: number): string {
  return `
  <g filter="url(#moonGlow)">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${STAR}"/>
    <circle cx="${cx - r * 0.42}" cy="${cy - r * 0.18}" r="${r * 0.92}" fill="url(#sky)" />
  </g>`;
}

/** 中央发光的打开的书 (cx,cy=书脊底部中心, w=整体宽) */
function bookSvg(cx: number, cy: number, w: number): string {
  const h = w * 0.32;
  const left = cx - w / 2;
  const right = cx + w / 2;
  return `
  <g>
    <ellipse cx="${cx}" cy="${cy - h * 0.55}" rx="${w * 0.85}" ry="${h * 1.5}" fill="url(#bookLight)"/>
    <g filter="url(#bookGlow)">
      <path d="M ${cx} ${cy - h}
               C ${cx - w * 0.18} ${cy - h * 1.22}, ${left + w * 0.08} ${cy - h * 1.1}, ${left} ${cy - h * 0.78}
               L ${left} ${cy - h * 0.05}
               C ${left + w * 0.12} ${cy - h * 0.32}, ${cx - w * 0.16} ${cy - h * 0.42}, ${cx} ${cy - h * 0.22}
               Z" fill="${PAPER}"/>
      <path d="M ${cx} ${cy - h}
               C ${cx + w * 0.18} ${cy - h * 1.22}, ${right - w * 0.08} ${cy - h * 1.1}, ${right} ${cy - h * 0.78}
               L ${right} ${cy - h * 0.05}
               C ${right - w * 0.12} ${cy - h * 0.32}, ${cx + w * 0.16} ${cy - h * 0.42}, ${cx} ${cy - h * 0.22}
               Z" fill="${STAR_SOFT}"/>
    </g>
    <path d="M ${cx} ${cy - h} L ${cx} ${cy - h * 0.22}" stroke="${NIGHT}" stroke-width="${w * 0.008}" opacity="0.35"/>
    ${[0.32, 0.5, 0.68]
      .map((t) => {
        const y = cy - h * (1.06 - t * 0.55);
        return `<path d="M ${cx - w * 0.38} ${y} C ${cx - w * 0.2} ${y - h * 0.12}, ${cx - w * 0.08} ${y - h * 0.14}, ${cx - w * 0.04} ${y - h * 0.1}" stroke="${MOON}" stroke-width="${w * 0.006}" fill="none" opacity="0.55"/>
                <path d="M ${cx + w * 0.04} ${y - h * 0.1} C ${cx + w * 0.08} ${y - h * 0.14}, ${cx + w * 0.2} ${y - h * 0.12}, ${cx + w * 0.38} ${y}" stroke="${MOON}" stroke-width="${w * 0.006}" fill="none" opacity="0.55"/>`;
      })
      .join("\n")}
  </g>`;
}

function defs(): string {
  return `
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${NIGHT_DEEP}"/>
      <stop offset="62%" stop-color="${NIGHT}"/>
      <stop offset="100%" stop-color="${NIGHT_HORIZON}"/>
    </linearGradient>
    <radialGradient id="bookLight" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="${STAR}" stop-opacity="0.30"/>
      <stop offset="55%" stop-color="${STAR}" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="${STAR}" stop-opacity="0"/>
    </radialGradient>
    <filter id="moonGlow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="18" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="bookGlow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="8" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>`;
}

function coverSvg(): string {
  const S = 3000;
  return `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg">
  ${defs()}
  <rect width="${S}" height="${S}" fill="url(#sky)"/>
  ${starsSvg(S, S, 150, 42, 3)}
  ${crescentSvg(2330, 540, 240)}
  <text x="1500" y="1530" text-anchor="middle" font-family="${DISPLAY_FONT}" font-size="450" fill="${PAPER}" letter-spacing="40">寓言星球</text>
  <text x="1500" y="1800" text-anchor="middle" font-family="${DISPLAY_FONT}" font-size="125" fill="${MOON}" letter-spacing="22">每天一个原创睡前故事</text>
  ${bookSvg(1500, 2520, 1050)}
  <text x="1500" y="2780" text-anchor="middle" font-family="${DISPLAY_FONT}" font-size="95" fill="${STAR}" letter-spacing="14">fable.xin</text>
</svg>`;
}

function ogSvg(): string {
  const W = 1200;
  const H = 630;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  ${defs()}
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  ${starsSvg(W, H, 70, 7, 1.1)}
  ${crescentSvg(1020, 130, 72)}
  ${bookSvg(980, 560, 330)}
  <text x="90" y="280" font-family="${DISPLAY_FONT}" font-size="120" fill="${PAPER}" letter-spacing="10">寓言星球</text>
  <text x="94" y="370" font-family="${DISPLAY_FONT}" font-size="42" fill="${MOON}" letter-spacing="4">每天一个原创睡前故事 · 情感朗读</text>
  <text x="94" y="540" font-family="${DISPLAY_FONT}" font-size="36" fill="${STAR}" letter-spacing="3">fable.xin</text>
</svg>`;
}

async function render(svg: string, relOut: string): Promise<void> {
  const resvg = new Resvg(svg, {
    font: { loadSystemFonts: true },
    background: NIGHT_DEEP,
  });
  const png = resvg.render().asPng();
  const out = path.join(process.cwd(), relOut);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, png);
  console.log(`✓ ${relOut} (${(png.length / 1024).toFixed(0)} KB)`);
}

await render(coverSvg(), "public/podcast-cover.png");
await render(ogSvg(), "src/app/opengraph-image.png");
