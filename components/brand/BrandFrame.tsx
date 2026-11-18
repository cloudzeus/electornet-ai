import type { ReactNode } from "react";
import type { BrandTheme } from "@/lib/cms/brand-store";
import { sx } from "@/components/ui/sx";

/**
 * Theme provider for a brand store: the CMS tokens become CSS variables
 * (`--bs-*`) on the root, every block reads only those — no brand colours
 * hard-coded in components. Euronics chrome (header, footer, Ερμής) stays
 * outside, in Euronics colours.
 */
export function BrandFrame({ theme, children }: { theme: BrandTheme; children: ReactNode }) {
  const vars = sx({ "--bs-bg": theme.bg, "--bs-bg2": theme.bg2, "--bs-ink": theme.ink, "--bs-muted": theme.muted, "--bs-accent": theme.accent, "--bs-accent-ink": theme.accentInk });
  return (
    <div data-brand-mode={theme.mode} className={`bg-[var(--bs-bg)] text-[var(--bs-ink)] eu-container ${vars.className}`}>
      {vars.node}
      {children}
    </div>
  );
}

/** Shared block header (kicker + title) in brand colours. */
const HEAD_SIZE = { s: "text-[length:var(--fs-24)] @lg:text-[length:var(--fs-28)]", m: "text-[length:var(--fs-32)] @lg:text-[length:var(--fs-42)]", l: "text-[length:var(--fs-42)] @lg:text-[length:var(--fs-58)]" } as const;
const KICKER_SIZE = { s: "text-[length:var(--fs-12)]", m: "text-[length:var(--fs-13)]", l: "text-[length:var(--fs-16)]" } as const;
const SUB_SIZE = { s: "text-[length:var(--fs-14)]", m: "text-[length:var(--fs-16)]", l: "text-[length:var(--fs-20)]" } as const;
export function BlockHead({ kicker, title, subtitle, size = "m", kickerSize = "m", subSize = "m", right }: { kicker?: string; title?: string; /** μία-δύο γραμμές κάτω από τον τίτλο */ subtitle?: string; size?: keyof typeof HEAD_SIZE; kickerSize?: keyof typeof KICKER_SIZE; subSize?: keyof typeof SUB_SIZE; right?: ReactNode }) {
  if (!kicker && !title && !subtitle) return null;
  return (
    <div className="flex items-end justify-between gap-4 mb-[var(--bs-head-gap,1.5rem)]">
      <div>
        {kicker && <div className={`font-extrabold text-[var(--bs-kicker,var(--bs-accent))] tracking-wide uppercase mb-2 ${KICKER_SIZE[kickerSize] ?? KICKER_SIZE.m}`}>{kicker}</div>}
        {title && <h2 className={`m-0 font-heading font-extrabold text-[color:var(--bs-title,inherit)] leading-[1.05] tracking-[-0.03em] ${HEAD_SIZE[size] ?? HEAD_SIZE.m}`}>{title}</h2>}
        {subtitle && <p className={`m-0 mt-2 max-w-[70ch] text-[color:var(--bs-muted,inherit)] leading-snug ${SUB_SIZE[subSize] ?? SUB_SIZE.m}`}>{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
