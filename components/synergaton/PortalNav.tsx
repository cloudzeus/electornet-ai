"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ClipboardList, History, LayoutDashboard, PlugZap, Rocket, Store, UserRound } from "lucide-react";
import { focusRing } from "./ui";

export const NAV = [
  { href: "", label: "Αρχική", icon: LayoutDashboard, mobile: true },
  { href: "/ksekinima", label: "Ξεκίνημα", icon: Rocket },
  { href: "/katastimata", label: "Καταστήματα", icon: Store, mobile: true },
  { href: "/syndesi", label: "Σύνδεση", icon: PlugZap, mobile: true },
  { href: "/paraggelies", label: "Παραγγελίες", icon: ClipboardList, mobile: true },
  { href: "/istoriko", label: "Ιστορικό & logs", short: "Ιστορικό", icon: History, mobile: true },
  { href: "/odigos", label: "Οδηγός & videos", icon: BookOpen },
  { href: "/profil", label: "Προφίλ & ασφάλεια", icon: UserRound },
] as const;

function useActive() {
  const path = usePathname().replace(/^\/synergaton/, "") || "";
  return (href: string) => (href === "" ? path === "" || path === "/" : path === href || path.startsWith(`${href}/`));
}

/** Πλάγιο μενού (≥ 1024px). */
export function SideNav({ base, badges }: { base: string; badges: Record<string, number> }) {
  const active = useActive();
  return (
    <nav aria-label="Κύριο μενού" className="grid gap-1">
      {NAV.map((n) => {
        const on = active(n.href);
        const b = badges[n.href];
        return (
          <Link key={n.href} href={`${base}${n.href}` || "/"} aria-current={on ? "page" : undefined}
            className={`group flex items-center gap-3 rounded-xl px-3 min-h-11 font-bold text-[length:var(--fs-14)] transition-colors duration-150 ${focusRing} ${on ? "bg-white text-eu-navy shadow-sm" : "text-eu-on-dark hover:bg-white/10 hover:text-white"}`}>
            <n.icon className={`size-5 shrink-0 ${on ? "text-eu-blue" : "text-eu-on-dark-2 group-hover:text-eu-yellow"}`} aria-hidden />
            <span className="flex-1 min-w-0 truncate">{n.label}</span>
            {!!b && <span className={`min-w-6 h-6 px-1.5 grid place-items-center rounded-full text-[length:var(--fs-12)] tabular-nums ${on ? "bg-eu-yellow text-eu-navy" : "bg-eu-yellow text-eu-navy"}`} aria-label={`${b} εκκρεμότητες`}>{b}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/** Κάτω μπάρα στο κινητό: 5 κύριοι προορισμοί με εικονίδιο + κείμενο. */
export function BottomNav({ base, badges }: { base: string; badges: Record<string, number> }) {
  const active = useActive();
  return (
    <nav aria-label="Κύριο μενού" className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-eu-line bg-white/95 supports-backdrop-filter:backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <ul className="m-0 p-0 list-none grid grid-cols-5">
        {NAV.filter((n) => "mobile" in n && n.mobile).map((n) => {
          const on = active(n.href), b = badges[n.href];
          return (
            <li key={n.href}>
              <Link href={`${base}${n.href}` || "/"} aria-current={on ? "page" : undefined} className={`relative flex flex-col items-center justify-center gap-0.5 min-h-14 px-1 font-bold text-[length:var(--fs-11)] ${focusRing} ${on ? "text-eu-navy" : "text-eu-muted"}`}>
                {on && <span className="absolute top-0 inset-x-4 h-1 rounded-b-full bg-eu-yellow" aria-hidden />}
                <span className="relative"><n.icon className="size-6" aria-hidden />{!!b && <span className="absolute -top-1 -right-2 min-w-4 h-4 px-1 grid place-items-center rounded-full bg-eu-red text-white text-[length:var(--fs-11)] leading-none">{b}</span>}</span>
                <span className="truncate max-w-full">{"short" in n ? n.short : n.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
