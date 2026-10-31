import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";
import { sx } from "@/components/ui/sx";

/**
 * UI kit της πύλης συνεργατών — στο design system της Euronics (eu-* tokens, Manrope, fluid rem μεγέθη --fs-*).
 * Κανόνες: στόχοι αφής ≥ 44px, ορατό focus, χρώμα ποτέ μόνο του (πάντα εικονίδιο/κείμενο), χωρίς inline style (CSP → sx).
 */
export type Tone = "neutral" | "info" | "good" | "warn" | "bad" | "brand";

const TONE: Record<Tone, string> = {
  neutral: "bg-eu-surface-2 text-eu-ink-2 border-eu-line",
  info: "bg-eu-chip text-eu-blue border-[#cfdaf0]",
  good: "bg-[#e8f4ec] text-eu-green border-[#c4e2cf]",
  warn: "bg-[#fdf3e1] text-[#8a5a0f] border-[#f1dcb0]",
  bad: "bg-[#fdecea] text-[#b3261e] border-[#f5c6c1]",
  brand: "bg-eu-yellow text-eu-navy border-eu-yellow",
};
const TONE_ICON: Record<Tone, LucideIcon> = { neutral: Info, info: Info, good: CheckCircle2, warn: AlertTriangle, bad: XCircle, brand: Info };

export const focusRing = "outline-none focus-visible:ring-[3px] focus-visible:ring-eu-blue/40 focus-visible:ring-offset-1";

export function Badge({ tone = "neutral", children, icon = true }: { tone?: Tone; children: ReactNode; icon?: boolean }) {
  const I = TONE_ICON[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-bold text-[length:var(--fs-12)] leading-5 whitespace-nowrap ${TONE[tone]}`}>
      {icon && <I className="size-3.5 shrink-0" aria-hidden />}{children}
    </span>
  );
}

export function Callout({ tone = "info", title, children, action }: { tone?: Tone; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const I = TONE_ICON[tone];
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={`rounded-2xl border p-3 sm:p-4 flex gap-3 items-start min-w-0 ${TONE[tone]}`}>
      <I className="size-5 shrink-0 mt-0.5" aria-hidden />
      <div className="min-w-0 grid gap-1 flex-1">
        {title && <p className="m-0 font-bold text-[length:var(--fs-15)]">{title}</p>}
        {children && <div className="text-[length:var(--fs-14)] leading-relaxed text-eu-ink-2 [&_p]:m-0">{children}</div>}
        {action && <div className="pt-1 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  );
}

export function Card({ children, className = "", as: As = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" | "li"; "data-help"?: string; "aria-labelledby"?: string }) {
  return <As {...rest} className={`rounded-2xl border border-eu-line bg-white shadow-[0_1px_2px_rgba(18,42,88,0.04)] min-w-0 ${className}`}>{children}</As>;
}

export function CardHead({ title, sub, icon: I, action, id }: { title: ReactNode; sub?: ReactNode; icon?: LucideIcon; action?: ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-4 pt-4 sm:px-5 sm:pt-5">
      <div className="flex items-start gap-3 min-w-0">
        {I && <span className="grid place-items-center size-10 rounded-xl bg-eu-chip text-eu-blue shrink-0"><I className="size-5" aria-hidden /></span>}
        <div className="min-w-0">
          <h2 id={id} className="m-0 font-heading font-extrabold text-eu-ink text-[length:var(--fs-17)] leading-tight">{title}</h2>
          {sub && <p className="m-0 mt-0.5 text-eu-ink-3 text-[length:var(--fs-13)] leading-snug">{sub}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHead({ eyebrow, title, sub, action }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 min-w-0">
      <div className="min-w-0 max-w-[68ch]">
        {eyebrow && <p className="m-0 mb-1 text-eu-blue font-bold uppercase tracking-[0.08em] text-[length:var(--fs-12)]">{eyebrow}</p>}
        <h1 className="m-0 font-heading font-extrabold text-eu-ink text-[length:var(--fs-30)] leading-[1.1] text-balance">{title}</h1>
        {sub && <p className="m-0 mt-2 text-eu-ink-3 text-[length:var(--fs-15)] leading-relaxed text-pretty">{sub}</p>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </header>
  );
}

type BtnVariant = "primary" | "brand" | "secondary" | "ghost" | "danger";
const BTN: Record<BtnVariant, string> = {
  primary: "bg-eu-navy text-white hover:bg-eu-blue shadow-[0_1px_0_rgba(0,0,0,0.08)]",
  brand: "bg-eu-yellow text-eu-navy hover:bg-[#ffd21a] shadow-[0_1px_0_rgba(0,0,0,0.08)]",
  secondary: "bg-white text-eu-navy border-2 border-eu-navy hover:bg-eu-chip",
  ghost: "text-eu-blue hover:bg-eu-chip",
  danger: "bg-white text-[#b3261e] border-2 border-[#f0b8b2] hover:bg-[#fdecea]",
};
export const btn = (v: BtnVariant = "primary", size: "md" | "lg" | "sm" = "md") =>
  `inline-flex items-center justify-center gap-2 rounded-full font-bold transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.98] motion-reduce:active:scale-100 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer select-none touch-manipulation ${focusRing} ${size === "lg" ? "min-h-12 px-6 text-[length:var(--fs-16)]" : size === "sm" ? "min-h-11 px-3.5 text-[length:var(--fs-13)]" : "min-h-11 px-5 text-[length:var(--fs-14)]"} ${BTN[v]}`;

export function ButtonLink({ href, children, variant = "primary", size = "md", className = "" }: { href: string; children: ReactNode; variant?: BtnVariant; size?: "md" | "lg" | "sm"; className?: string }) {
  return <Link href={href} className={`${btn(variant, size)} ${className}`}>{children}</Link>;
}

/** Οριζόντια μπάρα προόδου (scaleX — χωρίς layout shift). */
export function Meter({ value, max = 100, tone = "brand", label, size = "md" }: { value: number; max?: number; tone?: "brand" | "good" | "blue" | "warn"; label: string; size?: "sm" | "md" }) {
  const pct = Math.max(0, Math.min(1, max ? value / max : 0));
  const s = sx({ transform: `scaleX(${pct})` });
  const c = tone === "good" ? "bg-eu-green" : tone === "blue" ? "bg-eu-blue" : tone === "warn" ? "bg-eu-amber" : "bg-eu-yellow";
  return (
    <div role="meter" aria-label={label} aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100} className={`relative w-full overflow-hidden rounded-full bg-eu-surface-2 ${size === "sm" ? "h-1.5" : "h-2.5"}`}>
      {s.node}<span className={`absolute inset-0 origin-left rounded-full transition-transform duration-500 ease-out motion-reduce:transition-none ${c} ${s.className}`} />
    </div>
  );
}

/** Δακτύλιος προόδου (SVG). */
export function Ring({ value, max, size = 88, label, children }: { value: number; max: number; size?: number; label: string; children?: ReactNode }) {
  const r = 40, c = 2 * Math.PI * r, pct = max ? value / max : 0;
  return (
    <div className="relative shrink-0 grid place-items-center" role="img" aria-label={label}>
      <svg viewBox="0 0 100 100" width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="10" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="#f1c400" strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none" />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-center">{children}</span>
    </div>
  );
}

export function Empty({ icon: I, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid justify-items-center text-center gap-2 px-4 py-8">
      <span className="grid place-items-center size-14 rounded-2xl bg-eu-chip text-eu-blue"><I className="size-7" aria-hidden /></span>
      <p className="m-0 font-heading font-extrabold text-eu-ink text-[length:var(--fs-17)]">{title}</p>
      {children && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] max-w-[46ch]">{children}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

export const fmtDateTime = (d: Date | string) => new Date(d).toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" });
export const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString("el-GR", { day: "numeric", month: "short", timeZone: "Europe/Athens" });
export const fmtEur = (n: number) => n.toLocaleString("el-GR", { style: "currency", currency: "EUR", maximumFractionDigits: n >= 1000 ? 0 : 2 });
export function ago(d: Date | string) {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "μόλις τώρα";
  if (s < 3600) return `πριν ${Math.round(s / 60)}′`;
  if (s < 86400) return `πριν ${Math.round(s / 3600)} ώρ.`;
  if (s < 86400 * 30) return `πριν ${Math.round(s / 86400)} ημ.`;
  return fmtDate(d);
}
