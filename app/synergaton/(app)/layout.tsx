import Link from "next/link";
import type { ReactNode } from "react";
import { BookOpen, LogOut } from "lucide-react";
import Image from "@/components/ui/Image";
import { db } from "@/lib/db";
import { portalBase, requirePortalUser } from "@/lib/partner-portal/session";
import { logout } from "@/app/synergaton/actions";
import { BottomNav, SideNav } from "@/components/synergaton/PortalNav";
import { focusRing } from "@/components/synergaton/ui";
import { PortalErmis } from "@/components/synergaton/PortalErmis";

export const dynamic = "force-dynamic";

/** Κέλυφος της πύλης: πλάγιο μενού (≥1024px), επάνω μπάρα με το μέλος, κάτω μπάρα στο κινητό. */
export default async function PortalShell({ children }: { children: ReactNode }) {
  const u = await requirePortalUser();
  const base = await portalBase();
  const [openPickups, failing] = await Promise.all([
    db.order.count({ where: { pickupStore: { partnerId: u.partner.id }, status: { in: ["paid", "processing", "ready-for-pickup"] } } }),
    db.partnerConnection.count({ where: { partnerId: u.partner.id, status: "failed" } }),
  ]);
  const badges = { "/paraggelies": openPickups, "/syndesi": failing };
  const initials = u.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg">Μετάβαση στο περιεχόμενο</a>
      <aside className="hidden lg:flex flex-col gap-6 sticky top-0 h-dvh bg-eu-navy px-3 py-5">
        <Link href={base || "/"} className={`flex items-center gap-2.5 px-2 rounded-lg ${focusRing}`}>
          <Image src="/design/logo-on-blue.svg" alt="euronics" width={96} height={24} className="h-6 w-auto shrink-0" />
          <span className="font-bold text-eu-on-dark text-[length:var(--fs-12)] leading-tight">Πύλη<br />συνεργατών</span>
        </Link>
        <SideNav base={base} badges={badges} />
        <div className="mt-auto rounded-2xl bg-white/5 border border-white/10 p-3 grid gap-2">
          <p className="m-0 text-eu-on-dark-2 text-[length:var(--fs-12)]">Μέλος</p>
          <p className="m-0 font-bold text-white text-[length:var(--fs-14)] leading-snug break-words">{u.partner.name}</p>
          {u.partner.category && <p className="m-0 text-eu-on-dark text-[length:var(--fs-12)]">{u.partner.category}{u.partner.code ? ` · ${u.partner.code}` : ""}</p>}
        </div>
      </aside>
      <div className="min-w-0 flex flex-col min-h-dvh">
        <header className="sticky top-0 z-30 bg-white/90 supports-backdrop-filter:backdrop-blur border-b border-eu-line">
          <div className="flex items-center gap-3 px-4 sm:px-6 h-16">
            <Link href={base || "/"} className={`lg:hidden flex items-center gap-2 rounded-lg ${focusRing}`}><Image src="/design/logo.svg" alt="euronics" width={96} height={24} className="h-6 w-auto" /></Link>
            <p className="hidden lg:block m-0 min-w-0 truncate text-eu-ink-3 text-[length:var(--fs-14)]">Καλώς ήρθες, <b className="text-eu-ink">{u.name.split(" ")[0]}</b></p>
            <div className="ml-auto flex items-center gap-1">
              <div data-help="portal.ermis" className="contents"><PortalErmis base={base} firstName={u.name.split(" ")[0]} /></div>
              <Link href={`${base}/odigos`} className={`inline-flex items-center gap-2 rounded-full px-3 min-h-11 text-eu-blue font-bold text-[length:var(--fs-14)] hover:bg-eu-chip ${focusRing}`}><BookOpen className="size-5" aria-hidden /><span className="hidden sm:inline">Οδηγός</span></Link>
              <Link href={`${base}/profil`} className={`flex items-center gap-2 rounded-full pl-1 pr-3 min-h-11 hover:bg-eu-surface-2 ${focusRing}`} aria-label={`Προφίλ: ${u.name}`}>
                <span className="grid place-items-center size-9 rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-13)]">{initials}</span>
                <span className="hidden md:block text-left leading-tight"><span className="block font-bold text-eu-ink text-[length:var(--fs-13)] max-w-[14rem] truncate">{u.name}</span><span className="block text-eu-ink-3 text-[length:var(--fs-12)] max-w-[14rem] truncate">{u.email}</span></span>
              </Link>
              <form action={logout}><button className={`grid place-items-center size-11 rounded-full text-eu-ink-3 hover:bg-eu-surface-2 hover:text-eu-ink ${focusRing}`} aria-label="Αποσύνδεση" title="Αποσύνδεση"><LogOut className="size-5" aria-hidden /></button></form>
            </div>
          </div>
        </header>
        <main id="main" className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-5 sm:py-7 pb-28 lg:pb-10 w-full max-w-[90rem] mx-auto">{children}</main>
      </div>
      <BottomNav base={base} badges={badges} />
    </div>
  );
}
