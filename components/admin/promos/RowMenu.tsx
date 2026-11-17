"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";

export type RowMenuItem = { label: string; Icon: LucideIcon; href?: string; onSelect?: () => void; danger?: boolean };

const item = "w-full flex items-center gap-2 rounded-lg px-3 min-h-11 md:min-h-9 text-left font-semibold text-[length:var(--fs-14)] hover:bg-eu-surface focus-visible:bg-eu-surface outline-none";

/** Μενού «Ενέργειες» μιας γραμμής: κλείνει με Esc, με κλικ έξω και μετά από κάθε επιλογή. */
export function RowMenu({ label, items, disabled }: { label: string; items: RowMenuItem[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); box.current?.querySelector("button")?.focus(); } };
    document.addEventListener("mousedown", out); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button type="button" disabled={disabled} aria-haspopup="menu" aria-expanded={open} aria-label={`Ενέργειες: ${label}`} onClick={() => setOpen((x) => !x)}
        className="inline-flex items-center gap-1.5 rounded-full border border-eu-line bg-white px-3 min-h-11 md:min-h-9 font-bold text-eu-ink-2 text-[length:var(--fs-13)] hover:border-eu-navy disabled:opacity-50 cursor-pointer">
        <MoreHorizontal className="size-4" aria-hidden /> Ενέργειες
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-20 w-60 max-w-[calc(100vw-2rem)] rounded-xl border border-eu-line bg-white p-1 shadow-[var(--shadow-raised)] grid">
          {items.map((it) => it.href
            ? <Link key={it.label} role="menuitem" href={it.href} onClick={() => setOpen(false)} className={`${item} text-eu-ink`}><it.Icon className="size-4 text-eu-muted" aria-hidden />{it.label}</Link>
            : <button key={it.label} role="menuitem" type="button" onClick={() => { setOpen(false); it.onSelect?.(); }} className={`${item} cursor-pointer ${it.danger ? "text-eu-red" : "text-eu-ink"}`}><it.Icon className={`size-4 ${it.danger ? "" : "text-eu-muted"}`} aria-hidden />{it.label}</button>)}
        </div>
      )}
    </div>
  );
}
