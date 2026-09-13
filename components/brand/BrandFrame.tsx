import type { CSSProperties, ReactNode } from "react";
import type { BrandTheme } from "@/lib/cms/brand-store";

/**
 * Theme provider for a brand store: the CMS tokens become CSS variables
 * (`--bs-*`) on the root, every block reads only those — no brand colours
 * hard-coded in components. Euronics chrome (header, footer, Ερμής) stays
 * outside, in Euronics colours.
 */
export function BrandFrame({ theme, children }: { theme: BrandTheme; children: ReactNode }) {
  const style = { "--bs-bg": theme.bg, "--bs-bg2": theme.bg2, "--bs-ink": theme.ink, "--bs-muted": theme.muted, "--bs-accent": theme.accent, "--bs-accent-ink": theme.accentInk } as CSSProperties;
  return (
    <div data-brand-mode={theme.mode} style={style} className="bg-[var(--bs-bg)] text-[var(--bs-ink)] eu-container">
      {children}
    </div>
  );
}

/** Shared block header (kicker + title) in brand colours. */
export function BlockHead({ kicker, title, right }: { kicker?: string; title?: string; right?: ReactNode }) {
  if (!kicker && !title) return null;
  return (
    <div className="flex items-end justify-between gap-4 mb-6">
      <div>
        {kicker && <div className="font-extrabold text-[var(--bs-accent)] text-[length:var(--fs-13)] tracking-wide uppercase mb-2">{kicker}</div>}
        {title && <h2 className="m-0 font-heading font-extrabold text-[length:var(--fs-32)] @lg:text-[length:var(--fs-42)] leading-[1.05] tracking-[-0.03em]">{title}</h2>}
      </div>
      {right}
    </div>
  );
}
