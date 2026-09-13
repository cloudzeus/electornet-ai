"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, Menu } from "lucide-react";

type Group = { label: string; items: { href: string; label: string; soon?: boolean }[] };
const KEY = "eu-admin-nav";

/**
 * Sidebar navigation with collapsible groups. The group that contains the
 * current page opens on its own; every other group keeps the state the user
 * chose (localStorage). Below @3xl the whole nav folds behind a «Μενού» button.
 */
export function AdminNavLinks({ groups }: { groups: Group[] }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<Record<string, boolean>>({});
  const isActive = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));
  const activeGroup = groups.find((g) => g.items.some((i) => isActive(i.href)))?.label;

  useEffect(() => {
    // after paint, so the server-rendered markup matches the first client render
    const t = setTimeout(() => { try { setState(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, boolean>); } catch {} }, 0);
    return () => clearTimeout(t);
  }, []);
  const toggle = (label: string, next: boolean) => setState((s) => { const n = { ...s, [label]: next }; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch {} return n; });
  const expanded = (g: Group) => (g.label in state ? state[g.label] : g.label === activeGroup || g.items.length === 1);

  return (
    <nav aria-label="Διαχείριση" className="px-3 py-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="@3xl:hidden inline-flex items-center gap-2 rounded-full bg-white/10 px-3 min-h-10 font-bold text-[length:var(--fs-14)]" aria-expanded={open}>
        <Menu className="size-4" aria-hidden /> Μενού
      </button>
      <div className={`${open ? "grid" : "hidden"} @3xl:grid gap-1 mt-3 @3xl:mt-0`}>
        {groups.map((g) => {
          const isOpen = expanded(g);
          const single = g.items.length === 1;
          const activeHere = g.label === activeGroup;
          return (
            <div key={g.label}>
              {single ? (
                <Link href={g.items[0].href} aria-current={isActive(g.items[0].href) ? "page" : undefined} className={`flex items-center justify-between gap-2 rounded-lg px-3 min-h-11 @3xl:min-h-10 font-extrabold text-[length:var(--fs-14)] uppercase tracking-wide ${isActive(g.items[0].href) ? "bg-white text-eu-navy" : "text-eu-yellow hover:bg-white/10"}`}>
                  {g.items[0].label}
                </Link>
              ) : (
                <button type="button" onClick={() => toggle(g.label, !isOpen)} aria-expanded={isOpen} className={`w-full flex items-center justify-between gap-2 rounded-lg px-3 min-h-11 @3xl:min-h-10 font-extrabold text-[length:var(--fs-13)] uppercase tracking-wide ${activeHere ? "text-white" : "text-eu-yellow"} hover:bg-white/10`}>
                  <span className="min-w-0 flex-1 text-left truncate inline-flex items-center gap-2">{g.label}{!isOpen && activeHere && <span className="size-1.5 rounded-full bg-eu-yellow shrink-0" aria-hidden />}</span>
                  <span className="shrink-0 inline-flex items-center gap-1.5 text-white/60 normal-case tracking-normal font-bold text-[length:var(--fs-13)]">{g.items.length}<ChevronDown className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden /></span>
                </button>
              )}
              {!single && isOpen && (
                <ul className="m-0 p-0 list-none grid gap-0.5 mt-0.5 mb-1 pl-1">
                  {g.items.map((i) => {
                    const active = isActive(i.href);
                    return (
                      <li key={i.href}>
                        <Link href={i.href} aria-current={active ? "page" : undefined} className={`flex items-center justify-between gap-2 rounded-lg pl-3 pr-2 min-h-11 @3xl:min-h-9 font-semibold text-[length:var(--fs-15)] @3xl:text-[length:var(--fs-14)] transition-colors ${active ? "bg-white text-eu-navy" : "text-white/85 hover:bg-white/10 hover:text-white"}`}>
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
    </nav>
  );
}
