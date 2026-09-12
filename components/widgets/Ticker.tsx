import { ZoneBadge } from "@/components/site/ZoneBadge";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("ticker");

/**
 * Zone 5 — yellow ticker of *commercial* arguments (the terms live in
 * the navy rail above the header). Moves slowly, pauses on hover/focus,
 * stops under prefers-reduced-motion; nothing in it is information that
 * is not repeated elsewhere (WCAG 2.2.2).
 */
export function Ticker({ items, zoneNo }: { items: string[]; zoneNo?: number }) {
  const row = (hidden: boolean) => (
    <ul className="flex gap-[34px] m-0 p-0 pr-[34px] list-none whitespace-nowrap" aria-hidden={hidden || undefined}>
      {items.map((t, i) => (
        <li key={`${t}-${i}`} className="flex gap-[34px]">
          <span>{t}</span>
          <span className="text-eu-navy/60" aria-hidden>
            —
          </span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="relative bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-14)] tracking-wide py-3 overflow-hidden eu-container" role="marquee" aria-label={c.emporika_minymata}>
      <ZoneBadge no={zoneNo} />
      <div className="eu-marquee">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
