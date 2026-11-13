import { ZoneBadge } from "@/components/site/ZoneBadge";
import { copyOf } from "@/lib/cms/copy";
import { sx } from "@/components/ui/sx";

const c = copyOf("ticker");

/**
 * Zone 5 — yellow ticker of *commercial* arguments (the terms live in
 * the navy rail above the header). Moves slowly, pauses on hover/focus,
 * stops under prefers-reduced-motion; nothing in it is information that
 * is not repeated elsewhere (WCAG 2.2.2).
 */
export function Ticker({ items, zoneNo, bg, color }: { items: string[]; zoneNo?: number; /** χρώματα από τις ρυθμίσεις της αρχικής (π.χ. για καμπάνια) — κενά = κίτρινο με σκούρο μπλε */ bg?: string; color?: string }) {
  const hex = (v?: string) => (v && /^#[0-9a-f]{6}$/i.test(v) ? v : undefined);
  const tone = sx({ backgroundColor: hex(bg), color: hex(color) });
  const row = (hidden: boolean) => (
    <ul className="flex gap-[34px] m-0 p-0 pr-[34px] list-none whitespace-nowrap" aria-hidden={hidden || undefined}>
      {items.map((t, i) => (
        <li key={`${t}-${i}`} className="flex gap-[34px]">
          <span>{t}</span>
          <span className="opacity-60" aria-hidden>
            —
          </span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className={`relative bg-eu-yellow text-eu-navy ${tone.className} font-extrabold text-[length:var(--fs-14)] tracking-wide py-3 overflow-hidden eu-container`} role="marquee" aria-label={c.emporika_minymata}>
      {tone.node}
      <ZoneBadge no={zoneNo} />
      <div className="eu-marquee">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
