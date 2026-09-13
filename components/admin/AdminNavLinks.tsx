"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu } from "lucide-react";

export function AdminNavLinks({ groups }: { groups: { label: string; items: { href: string; label: string; soon?: boolean }[] }[] }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <nav aria-label="Διαχείριση" className="px-3 py-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="@3xl:hidden inline-flex items-center gap-2 rounded-full bg-white/10 px-3 min-h-10 font-bold text-[length:var(--fs-14)]" aria-expanded={open}>
        <Menu className="size-4" aria-hidden /> Μενού
      </button>
      <div className={`${open ? "grid" : "hidden"} @3xl:grid gap-3 mt-3 @3xl:mt-0`}>
        {groups.map((g) => (
          <div key={g.label}>
            <div className="px-2 mb-1 font-extrabold text-eu-yellow text-[length:var(--fs-13)] tracking-wide uppercase">{g.label}</div>
            <ul className="m-0 p-0 list-none grid gap-0.5">
              {g.items.map((i) => {
                const active = i.href === "/admin" ? path === "/admin" : path.startsWith(i.href);
                return (
                  <li key={i.href}>
                    <Link href={i.href} aria-current={active ? "page" : undefined} className={`flex items-center justify-between gap-2 rounded-lg px-3 min-h-11 @3xl:min-h-9 font-semibold text-[length:var(--fs-15)] @3xl:text-[length:var(--fs-14)] transition-colors ${active ? "bg-white text-eu-navy" : "text-white/85 hover:bg-white/10 hover:text-white"}`}>
                      {i.label}
                      {i.soon && <span className="rounded-full bg-white/15 px-2 py-0.5 text-[length:var(--fs-13)] font-bold">σύντομα</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
