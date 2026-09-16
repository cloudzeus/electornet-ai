import Link from "next/link";
import { ShieldCheck, Wrench, FileText, Zap, BookOpen, Phone, Recycle, ArrowRight, CalendarClock, MessageCircle } from "lucide-react";
import type { Order } from "@/lib/data/types";
import type { DeviceInfo, ServiceEvent } from "@/lib/data/fixtures/devices";
import { ProductImage } from "@/components/commerce/ProductImage";
import { Tilt } from "@/components/motion/Tilt";
import { copyOf } from "@/lib/cms/copy";

const cp = copyOf("deviceWallet");

export interface DeviceRow {
  key: string;
  productId: string;
  title: string;
  brand: string;
  image: string | null;
  order: string;
  bought: string;
  years: number;
  ext: boolean;
  to: string;
  daysLeft: number;
  pct: number;
  info?: DeviceInfo;
}

/** Warranty and service facts for every appliance in the customer's orders. */
export function deviceRows(orders: Order[], infos: DeviceInfo[], now = new Date()): DeviceRow[] {
  return orders
    .filter((o) => o.status !== "cancelled" && o.status !== "returned")
    .flatMap((o) =>
      o.lines.map((l) => {
        const ext = l.addons?.some((a) => a.slug === "epektasi-eggyisis") ?? false;
        const years = ext ? 5 : 2;
        const from = new Date(o.date);
        const to = new Date(from);
        to.setFullYear(to.getFullYear() + years);
        const total = to.getTime() - from.getTime();
        const left = Math.max(0, to.getTime() - now.getTime());
        return { key: `${o.number}-${l.productId}`, productId: l.productId, title: l.title, brand: l.brand, image: l.image, order: o.number, bought: o.date, years, ext, to: to.toISOString().slice(0, 10), daysLeft: Math.ceil(left / 86400000), pct: Math.round((left / total) * 100), info: infos.find((d) => d.productId === l.productId) };
      }),
    );
}

/**
 * Δακτύλιος εγγύησης: το υπόλοιπο ως τόξο. Μέσα χωρά μόνο η τιμή («5 έτη»,
 * «8 μ.»)· η λεζάντα «απομένουν» πάει κάτω από τον δακτύλιο, γιατί σε 84 px
 * με ρευστά μεγέθη γραμμάτων ξεπερνούσε το εσωτερικό και έπεφτε πάνω στο τόξο.
 */
export function WarrantyRing({ pct, daysLeft, years, size = 84 }: { pct: number; daysLeft: number; years: number; size?: number }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const days = Math.max(0, daysLeft);
  return (
    <div className="grid justify-items-center gap-1 shrink-0" role="img" aria-label={`Εγγύηση ${years} ετών, απομένουν ${days.toLocaleString("el-GR")} ημέρες`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 84 84" className="size-full -rotate-90" aria-hidden>
          <circle cx="42" cy="42" r={r} fill="none" stroke="var(--eu-surface-3)" strokeWidth="7" />
          <circle cx="42" cy="42" r={r} fill="none" stroke={pct > 15 ? "var(--eu-green)" : "var(--eu-amber)"} strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} className="transition-[stroke-dashoffset] duration-1000 ease-[var(--eu-ease-out)]" />
        </svg>
        <div className="absolute inset-[9px] grid place-items-center text-center leading-none" aria-hidden>
          <span className="grid gap-0.5">
            <span className="font-heading font-extrabold text-eu-ink text-[length:var(--fs-15)] tabular-nums whitespace-nowrap">{days.toLocaleString("el-GR")}</span>
            <span className="text-eu-muted text-[length:var(--fs-12)]">ημέρες</span>
          </span>
        </div>
      </div>
      <span className="text-eu-muted text-[length:var(--fs-12)] leading-none" aria-hidden>{cp.apomenoyn}</span>
    </div>
  );
}

const KIND: Record<ServiceEvent["kind"], { icon: typeof Wrench; label: string }> = {
  install: { icon: Wrench, label: "Εγκατάσταση" },
  repair: { icon: Wrench, label: "Επισκευή" },
  check: { icon: ShieldCheck, label: "Έλεγχος" },
  ticket: { icon: MessageCircle, label: "Ερώτηση" },
};

/**
 * @dynamic Device card: cutout photo, warranty ring, status chips, one-tap
 * actions (book service, report a fault, receipt, warranty PDF, manual,
 * energy label, hotline, trade-in), service history with technician.
 */
export function DeviceCard({ d, compact = false }: { d: DeviceRow; compact?: boolean }) {
  const docs = d.info?.docs ?? {};
  const links = [
    docs.receipt && { icon: FileText, label: "Απόδειξη", href: docs.receipt },
    docs.warranty && { icon: ShieldCheck, label: "Πιστοποιητικό εγγύησης", href: docs.warranty },
    docs.manual && { icon: BookOpen, label: "Εγχειρίδιο", href: docs.manual },
    docs.energyLabel && { icon: Zap, label: "Ενεργειακή ετικέτα", href: docs.energyLabel },
  ].filter(Boolean) as { icon: typeof FileText; label: string; href: string }[];
  return (
    <Tilt max={2} scale={1.005} className="h-full">
      <article className="h-full bg-white rounded-2xl border border-eu-line overflow-hidden grid grid-rows-[auto_minmax(0,1fr)]">
        <div className="p-4 @md:p-5 grid grid-cols-[88px_minmax(0,1fr)_auto] gap-4 items-center">
          <ProductImage src={d.image} sizes="88px" className="size-[88px]" rounded="rounded-xl" />
          <div className="min-w-0">
            <div className="text-eu-muted-2 font-bold text-[length:var(--fs-13)] uppercase">{d.brand}</div>
            <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-17)] leading-tight line-clamp-2">
              <Link href={`/proion/${d.productId.replace(/^p-/, "")}`} className="hover:text-eu-blue">
                {d.title}
              </Link>
            </h3>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--fs-13)] font-extrabold ${d.ext ? "bg-eu-navy text-white" : "bg-eu-green/12 text-eu-green"}`}>
                <ShieldCheck className="size-3.5" aria-hidden /> {d.ext ? "Επέκταση 5 έτη" : "Εγγύηση 2 έτη"}
              </span>
              <span className="inline-flex items-center rounded-full bg-eu-surface px-2 py-0.5 text-[length:var(--fs-13)] font-semibold text-eu-ink-3">έως {new Date(d.to).toLocaleDateString("el-GR")}</span>
              {d.info?.serial && <span className="hidden @md:inline-flex items-center rounded-full bg-eu-surface px-2 py-0.5 text-[length:var(--fs-13)] font-semibold text-eu-ink-3 tabular-nums">S/N {d.info.serial}</span>}
            </div>
          </div>
          <WarrantyRing pct={d.pct} daysLeft={d.daysLeft} years={d.years} />
        </div>
        {!compact && (
          <div className="border-t border-eu-line-2 bg-eu-surface/60 p-4 @md:p-5 grid gap-4 content-start">
            <div className="flex flex-wrap gap-2">
              <Link href={`/logariasmos/eggyiseis?service=${d.productId}`} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-blue">
                <Wrench className="size-4" aria-hidden /> {cp.dilosi_vlavis_service}
              </Link>
              {!d.ext && d.daysLeft > 0 && (
                <Link href="/ypiresies/epektasi-eggyisis" className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-white">
                  {cp.epektasi_se_5_eti}
                </Link>
              )}
              {d.info?.tradeIn && (
                <Link href="/renew" className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-green/40 text-eu-green font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-white">
                  <Recycle className="size-4" aria-hidden /> Ανταλλαγή +{d.info.tradeIn} €
                </Link>
              )}
            </div>
            {links.length > 0 && (
              <ul className="m-0 p-0 list-none grid grid-cols-[repeat(auto-fit,minmax(11.5rem,1fr))] gap-2">
                {links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href} target={l.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="group flex items-center gap-2 rounded-xl bg-white border border-eu-line px-3 py-2 min-h-11 text-[length:var(--fs-14)] font-bold text-eu-ink leading-tight hover:border-eu-blue">
                      <l.icon className="size-4 text-eu-blue shrink-0" aria-hidden /> <span className="min-w-0">{l.label}</span>
                      <ArrowRight className="size-3.5 ml-auto text-eu-muted-2 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {(d.info?.service.length ?? 0) > 0 && (
              <ol className="m-0 p-0 list-none grid gap-2">
                {d.info!.service.map((e) => {
                  const K = KIND[e.kind];
                  return (
                    <li key={e.date + e.title} className="flex gap-3">
                      <span className={`size-8 shrink-0 rounded-full inline-flex items-center justify-center ${e.status === "done" ? "bg-eu-green/12 text-eu-green" : e.status === "scheduled" ? "bg-eu-chip text-eu-blue" : "bg-eu-amber/15 text-eu-amber"}`}>
                        <K.icon className="size-4" aria-hidden />
                      </span>
                      <div className="min-w-0 text-[length:var(--fs-14)]">
                        <div className="font-bold text-eu-ink">
                          {K.label} · {e.title}
                        </div>
                        <div className="text-eu-ink-3">
                          {new Date(e.date).toLocaleDateString("el-GR", { day: "numeric", month: "short", year: "numeric" })} · {e.detail}
                          {e.technician ? ` · ${e.technician}` : ""}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {(d.info?.tips?.length ?? 0) > 0 && (
              <ul className="m-0 p-0 list-none grid gap-1 text-[length:var(--fs-14)] text-eu-ink-2">
                {d.info!.tips!.map((t) => (
                  <li key={t} className="flex gap-2">
                    <span className="text-eu-yellow font-extrabold" aria-hidden>
                      ★
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            )}
            {d.info?.hotline && (
              <div className="text-[length:var(--fs-14)] text-eu-ink-3 inline-flex items-center gap-1.5">
                <Phone className="size-3.5" aria-hidden /> {cp.grammi_kataskeyasti} <a href={`tel:${d.info.hotline.replace(/\s/g, "")}`} className="font-bold text-eu-blue">{d.info.hotline}</a>
                <span className="mx-1">·</span>
                <CalendarClock className="size-3.5" aria-hidden /> {cp.service_euronics_rantevoy_entos}
              </div>
            )}
          </div>
        )}
      </article>
    </Tilt>
  );
}
