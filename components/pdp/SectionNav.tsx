"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("sectionNav");

const ITEMS = [
  ["overview", "Με μια ματιά"],
  ["description", "Περιγραφή"],
  ["videos", "Βίντεο"],
  ["specs", "Χαρακτηριστικά"],
  ["compare", "Σύγκριση"],
  ["services", "Υπηρεσίες & παράδοση"],
  ["reviews", "Αξιολογήσεις"],
  ["qa", "Ερωτήσεις"],
];

/**
 * Sticky in-page navigation for the product sections, with active-section tracking.
 * Phones get one «Ενότητα» select instead of tabs that wrapped to four rows (no horizontal scrollers).
 */
export function SectionNav({ available }: { available: string[] }) {
  const key = available.join();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const items = useMemo(() => ITEMS.filter(([id]) => available.includes(id)), [key]);
  const [active, setActive] = useState(items[0]?.[0] ?? "overview");
  const ref = useRef<HTMLElement>(null);
  // Publish own height so anchored sections land below header + this bar.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => document.documentElement.style.setProperty("--eu-subnav-h", `${Math.round(e[0].contentRect.height)}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--eu-subnav-h");
    };
  }, []);
  useEffect(() => {
    const els = items.map(([id]) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    // Κάθε callback φέρνει μόνο όσες ενότητες άλλαξαν· η ενεργή βγαίνει από όλες τις ορατές, με τη σειρά της σελίδας
    const visible = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        const first = items.find(([id]) => visible.has(id));
        if (first) setActive(first[0]);
        // πάνω από την πρώτη ενότητα (π.χ. πίσω στην κορυφή) ενεργή είναι η πρώτη, όχι η τελευταία που πέρασε
        else if (els[0] && els[0].getBoundingClientRect().top > 0) setActive(items[0][0]);
      },
      { rootMargin: "-120px 0px -60% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items]);
  return (
    <nav ref={ref} aria-label={c.enotites_proiontos} className="static @3xl:sticky top-[var(--eu-header-h,0px)] z-30 bg-white/95 backdrop-blur border-b border-eu-line eu-container">
      <div className="@md:hidden eu-canvas eu-gutter py-2">
        <label className="flex items-center gap-3 text-eu-muted text-[length:var(--fs-14)]">
          Ενότητα
          <select
            value={active}
            onChange={(e) => {
              setActive(e.target.value);
              document.getElementById(e.target.value)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="flex-1 min-w-0 min-h-11 rounded-lg border border-eu-line bg-white px-3 font-bold text-eu-ink"
          >
            {items.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ul className="hidden @md:flex eu-canvas eu-gutter m-0 p-0 list-none flex-wrap gap-x-1">
        {items.map(([id, label]) => (
          <li key={id}>
            <a href={`#${id}`} aria-current={active === id ? "location" : undefined} className={`inline-flex items-center px-3 min-h-11 font-bold transition-colors text-[length:var(--fs-15)] @md:text-[length:var(--fs-16)] border-b-[3px] -mb-px ${active === id ? "border-eu-yellow text-eu-ink" : "border-transparent text-eu-muted hover:text-eu-ink"}`}>
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
