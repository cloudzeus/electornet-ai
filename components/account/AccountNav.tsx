"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Package, MapPin, RotateCcw, ShieldCheck, Heart, User, LogOut, LayoutDashboard, CreditCard, CalendarClock, Bell } from "lucide-react";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("accountNav");

const items = [
  { href: "/logariasmos", label: "Επισκόπηση", icon: LayoutDashboard },
  { href: "/logariasmos/stoixeia", label: "Τα στοιχεία μου", icon: User },
  { href: "/logariasmos/paraggelies", label: "Παραγγελίες & παρακολούθηση", icon: Package },
  { href: "/logariasmos/dieythynseis", label: "Διευθύνσεις", icon: MapPin },
  { href: "/logariasmos/pliromes", label: "Πληρωμές & δόσεις", icon: CreditCard },
  { href: "/logariasmos/rantevou", label: "Ραντεβού & service", icon: CalendarClock },
  { href: "/logariasmos/epistrofes", label: "Επιστροφές", icon: RotateCcw },
  { href: "/logariasmos/eggyiseis", label: "Εγγυήσεις", icon: ShieldCheck },
  { href: "/logariasmos/eidopoiiseis", label: "Ειδοποιήσεις", icon: Bell },
  { href: "/lista", label: "Η λίστα μου", icon: Heart },
];

export function AccountNav() {
  const path = usePathname();
  const router = useRouter();
  return (
    <nav aria-label={c.logariasmos}>
      <div className="hidden @3xl:block bg-eu-surface rounded-xl p-4 mb-3">
        <div className="font-extrabold text-eu-ink text-[length:var(--fs-16)]">{c.giannis_papadopoylos}</div>
        <div className="text-eu-muted text-[length:var(--fs-14)]">giannis@example.gr</div>
      </div>
      <ul className="m-0 p-0 list-none flex flex-wrap @3xl:flex-col gap-1">
        {items.map((it) => {
          const on = it.href === "/logariasmos" ? path === it.href : path.startsWith(it.href);
          const Icon = it.icon;
          return (
            <li key={it.href} className="shrink-0">
              <Link href={it.href} aria-current={on ? "page" : undefined} className={`inline-flex @3xl:flex items-center gap-2 rounded-full @3xl:rounded-md px-3.5 py-2.5 min-h-11 font-semibold text-[length:var(--fs-15)] ${on ? "bg-eu-navy text-white" : "text-eu-ink-2 bg-eu-surface @3xl:bg-transparent hover:bg-eu-chip"}`}>
                <Icon className="size-4" aria-hidden /> {it.label}
              </Link>
            </li>
          );
        })}
        <li className="shrink-0">
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.removeItem("euronics.session");
              } catch {}
              router.push("/");
            }}
            className="inline-flex @3xl:flex items-center gap-2 rounded-full @3xl:rounded-md px-3.5 py-2.5 min-h-11 font-semibold text-[length:var(--fs-15)] text-eu-muted hover:text-eu-red"
          >
            <LogOut className="size-4" aria-hidden /> {c.aposyndesi}
          </button>
        </li>
      </ul>
    </nav>
  );
}
