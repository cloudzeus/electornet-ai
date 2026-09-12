"use client";

import { useEffect, useRef, useState } from "react";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("sectionNav");

const ITEMS = [
  ["overview", "Με μια ματιά"],
  ["description", "Περιγραφή"],
  ["answers", "Γρήγορες απαντήσεις"],
  ["specs", "Χαρακτηριστικά"],
  ["compare", "Σύγκριση"],
  ["services", "Υπηρεσίες & παράδοση"],
  ["reviews", "Αξιολογήσεις"],
  ["qa", "Ερωτήσεις"],
];

/** Sticky in-page navigation for the product sections, with active-section tracking. */
export function SectionNav({ available }: { available: string[] }) {
  const items = ITEMS.filter(([id]) => available.includes(id));
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
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-120px 0px -60% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items]);
  return (
    <nav ref={ref} aria-label={c.enotites_proiontos} className="static @3xl:sticky top-[var(--eu-header-h,0px)] z-30 bg-white/95 backdrop-blur border-b border-eu-line eu-container">
      <ul className="eu-canvas eu-gutter m-0 p-0 list-none flex flex-wrap gap-x-1">
        {items.map(([id, label]) => (
          <li key={id}>
            <a href={`#${id}`} aria-current={active === id ? "location" : undefined} className={`inline-flex items-center px-3 min-h-11 font-bold text-[length:var(--fs-15)] @md:text-[length:var(--fs-16)] border-b-[3px] -mb-px ${active === id ? "border-eu-yellow text-eu-ink" : "border-transparent text-eu-muted hover:text-eu-ink"}`}>
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
