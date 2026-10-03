"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { bestMatch } from "./nav-match";

type Group = { label: string; items: { href: string; label: string; soon?: boolean }[] };
const KEY = "eu-admin-nav";

/**
 * Sidebar navigation with collapsible groups. The group that contains the
 * current page opens on its own; every other group keeps the state the user
 * chose (localStorage). «sidebar»: η στήλη σε μεγάλη οθόνη· «drawer»: κουμπί στη μπάρα (με την τρέχουσα
 * σελίδα) που ανοίγει συρτάριο — σε κινητό και tablet.
 */
export function AdminNavLinks({ groups, variant = "sidebar", footer }: { groups: Group[]; variant?: "sidebar" | "drawer"; footer?: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<Record<string, boolean>>({});
  const active = bestMatch(path, groups.flatMap((g) => g.items))?.href;
  const isActive = (href: string) => href === active;
  const activeGroup = groups.find((g) => g.items.some((i) => isActive(i.href)))?.label;
  const activeLabel = groups.flatMap((g) => g.items).find((i) => isActive(i.href))?.label;

  useEffect(() => {
    // after paint, so the server-rendered markup matches the first client render
    const t = setTimeout(() => { try { setState(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, boolean>); } catch {} }, 0);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", esc);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = prev; };
  }, [open]);
  const toggle = (label: string, next: boolean) => setState((s) => { const n = { ...s, [label]: next }; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch {} return n; });
  const expanded = (g: Group) => (g.label in state ? state[g.label] : g.label === activeGroup || g.items.length === 1);
  const close = () => setOpen(false);

  const list = (
    <div className="grid gap-1">
      {groups.map((g) => {
        const isOpen = expanded(g);
        const single = g.items.length === 1;
        const activeHere = g.label === activeGroup;
        return (
          <div key={g.label}>
            {single ? (
              <Link href={g.items[0].href} onClick={close} aria-current={isActive(g.items[0].href) ? "page" : undefined} className={`flex items-center justify-between gap-2 rounded-lg px-3 min-h-11 font-extrabold text-[length:var(--fs-14)] uppercase tracking-wide ${isActive(g.items[0].href) ? "bg-white text-eu-navy" : "text-eu-yellow hover:bg-white/10"}`}>
                {g.items[0].label}
              </Link>
            ) : (
              <button type="button" onClick={() => toggle(g.label, !isOpen)} aria-expanded={isOpen} className={`w-full flex items-center justify-between gap-2 rounded-lg px-3 min-h-11 font-extrabold text-[length:var(--fs-13)] uppercase tracking-wide ${activeHere ? "text-white" : "text-eu-yellow"} hover:bg-white/10`}>
                <span className="min-w-0 flex-1 text-left truncate inline-flex items-center gap-2">{g.label}{!isOpen && activeHere && <span className="size-1.5 rounded-full bg-eu-yellow shrink-0" aria-hidden />}</span>
                <span className="shrink-0 inline-flex items-center gap-1.5 text-white/60 normal-case tracking-normal font-bold text-[length:var(--fs-13)]">{g.items.length}<ChevronDown className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden /></span>
              </button>
            )}
            {!single && isOpen && (
              <ul className="m-0 p-0 list-none grid gap-0.5 mt-0.5 mb-1 pl-1">
                {g.items.map((i) => {
                  const on = isActive(i.href);
                  return (
                    <li key={i.href}>
                      <Link href={i.href} onClick={close} aria-current={on ? "page" : undefined} className={`flex items-center justify-between gap-2 rounded-lg pl-3 pr-2 min-h-11 font-semibold text-[length:var(--fs-15)] transition-colors ${on ? "bg-white text-eu-navy" : "text-white/85 hover:bg-white/10 hover:text-white"}`}>
                        {i.label}
                        {i.soon && <span className="rounded-full bg-white/15 px-2 py-0.5 text-[length:var(--fs-13)] font-bold">σύντομα</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );

  if (variant === "sidebar") return <nav aria-label="Διαχείριση" className="px-3 py-3">{list}</nav>;

  // κινητό / tablet: ένα κουμπί στη μπάρα, το μενού ανοίγει ως συρτάρι πάνω από τη σελίδα
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="admin-drawer" className="inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 pl-3 pr-4 min-h-11 font-bold text-[length:var(--fs-14)] min-w-0">
        <Menu className="size-5 shrink-0" aria-hidden /> <span className="truncate max-w-[40vw]">{activeLabel ?? "Μενού"}</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Μενού διαχείρισης" id="admin-drawer">
          <button type="button" aria-label="Κλείσιμο μενού" onClick={close} className="absolute inset-0 bg-eu-navy/60 backdrop-blur-sm" />
          <div className="absolute inset-y-0 left-0 w-[min(22rem,88vw)] bg-eu-navy text-white flex flex-col shadow-[var(--shadow-overlay)]">
            <div className="flex items-center justify-between gap-2 px-4 min-h-14 border-b border-white/10">
              <span className="font-extrabold text-[length:var(--fs-16)]">Μενού</span>
              <button type="button" onClick={close} aria-label="Κλείσιμο" className="size-11 grid place-items-center rounded-full hover:bg-white/10"><X className="size-5" aria-hidden /></button>
            </div>
            <nav aria-label="Διαχείριση" className="flex-1 overflow-y-auto px-3 py-3">{list}</nav>
            {footer && <div className="border-t border-white/10">{footer}</div>}
          </div>
        </div>
      )}
    </>
  );
}
