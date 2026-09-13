import type { CSSProperties } from "react";
import type { StickerParams, StickerIcon, StickerShape } from "@/lib/stickers/model";

/**
 * @dynamic Renders a designed sticker (StickerParams) as inline SVG. Used by
 * the admin designer, the storefront product card and the exporter. Pure —
 * no client hooks — so it works in server components and static markup.
 */
const VB = 200;
const WIDE: Record<StickerShape, boolean> = { circle: false, burst: false, seal: false, hex: false, badge: false, pill: true, ribbon: true, tag: true };
const HEIGHT: Record<StickerShape, number> = { circle: 200, burst: 200, seal: 200, hex: 200, badge: 200, pill: 72, ribbon: 76, tag: 84 };

const ICONS: Record<Exclude<StickerIcon, "none">, string> = {
  percent: '<line x1="19" x2="5" y1="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
};

function polygon(cx: number, cy: number, r1: number, r2: number, n: number) {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1;
    const a = (Math.PI * i) / n - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}
function seal(cx: number, cy: number, r: number, n: number) {
  // scalloped circle: arcs bulging outwards
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const a0 = (2 * Math.PI * i) / n, a1 = (2 * Math.PI * (i + 1)) / n;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const rr = (Math.PI * r) / n;
    out.push(i === 0 ? `M${x0.toFixed(1)},${y0.toFixed(1)}` : "", `A${rr.toFixed(1)},${rr.toFixed(1)} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)}`);
  }
  return out.join(" ") + " Z";
}
function hex(cx: number, cy: number, r: number) {
  return Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i - Math.PI / 6; return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`; }).join(" ");
}

/** inner text box per shape (viewBox units) */
function textBox(shape: StickerShape, hasIcon: boolean): { x: number; y: number; w: number; h: number } {
  const h = HEIGHT[shape];
  if (!WIDE[shape]) {
    const inset = shape === "burst" ? 46 : shape === "seal" ? 40 : shape === "hex" ? 40 : shape === "badge" ? 24 : 34;
    return { x: inset, y: inset + (hasIcon ? 18 : 0), w: VB - inset * 2, h: VB - inset * 2 - (hasIcon ? 18 : 0) };
  }
  const padL = shape === "tag" ? 30 : 16;
  return { x: padL + (hasIcon ? 34 : 0), y: 8, w: VB - padL - 16 - (hasIcon ? 34 : 0), h: h - 16 };
}

export function stickerAspect(shape: StickerShape) {
  return HEIGHT[shape] / VB;
}

export function StickerSvg({ p, className, style, id = "s" }: { p: StickerParams; className?: string; style?: CSSProperties; id?: string }) {
  const H = HEIGHT[p.shape];
  const lines = p.lines.filter((l) => l.text.trim());
  const hasIcon = p.icon !== "none";
  const box = textBox(p.shape, hasIcon);
  const n = Math.max(1, lines.length);
  // auto-fit: each line gets an equal share of the height, capped by width (0.58em per char for Manrope bold)
  const sizes = lines.map((l) => {
    if (l.size > 0) return l.size;
    const chars = Math.max(1, l.text.length + (l.spacing ? l.text.length * l.spacing * 0.08 : 0));
    const byWidth = box.w / (chars * 0.58);
    const byHeight = (box.h / n) * (n === 1 ? 0.72 : 0.8);
    return Math.round(Math.min(byWidth, byHeight, WIDE[p.shape] ? 44 : 84));
  });
  const totalH = sizes.reduce((a, b) => a + b * 1.05, 0);
  const baselines = sizes.reduce<number[]>((acc, fs, i) => { const prev = i ? acc[i - 1] : box.y + (box.h - totalH) / 2; return [...acc, prev + fs * 1.05]; }, []);
  const fillId = `${id}-g`, shadowId = `${id}-sh`;
  const fill = p.fill2 ? `url(#${fillId})` : p.fill;
  const stroke = p.border && p.borderWidth ? { stroke: p.border, strokeWidth: p.borderWidth } : {};
  const filter = p.shadow ? `url(#${shadowId})` : undefined;
  const shapeEl = (() => {
    switch (p.shape) {
      case "circle": return <circle cx={100} cy={100} r={94} fill={fill} {...stroke} filter={filter} />;
      case "burst": return <polygon points={polygon(100, 100, 96, 78, Math.max(8, p.points))} fill={fill} {...stroke} filter={filter} strokeLinejoin="round" />;
      case "seal": return <path d={seal(100, 100, 86, Math.max(8, Math.min(28, p.points)))} fill={fill} {...stroke} filter={filter} />;
      case "hex": return <polygon points={hex(100, 100, 94)} fill={fill} {...stroke} filter={filter} strokeLinejoin="round" />;
      case "badge": return <rect x={6} y={6} width={188} height={188} rx={28} fill={fill} {...stroke} filter={filter} />;
      case "pill": return <rect x={4} y={4} width={192} height={H - 8} rx={(H - 8) / 2} fill={fill} {...stroke} filter={filter} />;
      case "ribbon": return <polygon points={`14,4 196,4 184,${H / 2} 196,${H - 4} 14,${H - 4} 4,${H / 2}`} fill={fill} {...stroke} filter={filter} strokeLinejoin="round" />;
      case "tag": return <><path d={`M22,4 H190 a6,6 0 0 1 6,6 V${H - 10} a6,6 0 0 1 -6,6 H22 L4,${H / 2} Z`} fill={fill} {...stroke} filter={filter} strokeLinejoin="round" /><circle cx={22} cy={H / 2} r={5} fill="#fff" fillOpacity={0.9} /></>;
    }
  })();
  const iconSize = WIDE[p.shape] ? H * 0.42 : 34;
  const iconX = WIDE[p.shape] ? box.x - iconSize - 6 : 100 - iconSize / 2;
  const iconY = WIDE[p.shape] ? (H - iconSize) / 2 : box.y - iconSize + 6;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${VB} ${H}`} width={p.size} height={Math.round(p.size * (H / VB))} className={className} style={{ overflow: "visible", transform: p.rotate ? `rotate(${p.rotate}deg)` : undefined, ...style }} role="img" aria-label={lines.map((l) => l.text).join(" ")}>
      <defs>
        {p.fill2 && (
          <linearGradient id={fillId} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={p.fill} /><stop offset="1" stopColor={p.fill2} /></linearGradient>
        )}
        {p.shadow && (
          <filter id={shadowId} x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#122A58" floodOpacity="0.28" /></filter>
        )}
      </defs>
      {shapeEl}
      {hasIcon && (
        <svg x={iconX} y={iconY} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={p.color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: ICONS[p.icon as Exclude<StickerIcon, "none">] }} />
      )}
      {lines.map((l, i) => {
        const fs = sizes[i];
        return (
          <text key={i} x={box.x + box.w / 2} y={baselines[i] - fs * 0.22} textAnchor="middle" fontFamily="Manrope, 'Segoe UI', system-ui, sans-serif" fontWeight={l.weight} fontSize={fs} letterSpacing={l.spacing} fill={p.color} style={{ textTransform: l.upper ? "uppercase" : undefined }}>
            {l.upper ? l.text.toUpperCase() : l.text}
          </text>
        );
      })}
    </svg>
  );
}

/** CSS classes for the animation preset (globals.css utilities). */
export const stickerAnimationClass: Record<StickerParams["animation"], string> = {
  none: "",
  shimmer: "eu-shimmer",
  breathe: "eu-sticker-breathe",
  wiggle: "eu-sticker-wiggle",
  bump: "eu-sticker-bump",
};

/** Absolute placement on a product photo frame. */
export const stickerPositionClass: Record<StickerParams["position"], string> = {
  tl: "top-2 left-2",
  tr: "top-2 right-2",
  bl: "bottom-2 left-2",
  br: "bottom-2 right-2",
  center: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
};
