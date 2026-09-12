import Link from "next/link";
import { Truck, Store as StoreIcon, CalendarClock, Recycle, ShieldCheck, Wrench, Headset, RefreshCw } from "lucide-react";
import type { Product, Service } from "@/lib/data/types";
import { priceLong, weekday } from "@/lib/format";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("servicesDelivery");

/**
 * «Υπηρεσίες & παράδοση» — per-product delivery options with price and
 * time (what Kotsovolos does well) plus the Euronics services that apply
 * to this product, each with a price and a page.
 */
export function ServicesDelivery({ product: p, services }: { product: Product; services: Service[] }) {
  const a = p.availability;
  const date = a.kind === "order" ? null : weekday(new Date(a.deliveryDate));
  const delivery = [
    { icon: Truck, t: "Παράδοση στη διεύθυνσή σου", s: p.price >= 100 ? "Δωρεάν" : "4,90 €", d: date ? `${a.kind === "in-stock" ? "1–3 εργάσιμες" : "2–4 εργάσιμες"} · ${date}` : "Κατόπιν παραγγελίας · 5–10 εργάσιμες" },
    { icon: StoreIcon, t: "Παραλαβή από κατάστημα", s: "Δωρεάν", d: `Σε 2 ώρες όπου υπάρχει απόθεμα · ${p.storeStock ?? 0} καταστήματα` },
    ...(p.installation ? [{ icon: CalendarClock, t: "Παράδοση με ραντεβού & εγκατάσταση", s: "από 60 €", d: "Τεχνικός του καταστήματος της περιοχής σου · ραντεβού εντός 24 ωρών" }] : []),
    ...(p.tradeIn ? [{ icon: Recycle, t: "Παραλαβή παλιάς συσκευής", s: "Δωρεάν", d: "Ανακύκλωση ΑΗΗΕ κατά την παράδοση (Οδηγία 2012/19/ΕΕ)" }] : []),
  ];
  const icons: Record<string, typeof Truck> = { "epektasi-eggyisis": ShieldCheck, "paradosi-egkatastasi": Wrench, "e-support": Headset, "eggyisi-allagis": RefreshCw, "syntirisi-episkeyi": Wrench };
  const svc = services.filter((s) => ["epektasi-eggyisis", "e-support", "eggyisi-allagis", "syntirisi-episkeyi", "eggyisi-xamiloteris-timis", "dorean-fylaxi"].includes(s.slug)).slice(0, 6);
  return (
    <section id="services" className="scroll-mt-24" aria-labelledby="svc-title">
      <div className="font-extrabold text-eu-blue text-[length:var(--fs-14)] tracking-wide mb-1">{c.ypiresies_paradosi}</div>
      <h2 id="svc-title" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)] leading-tight mb-4">
        {c.pos_to_pairneis_kai}
      </h2>
      <div className="grid grid-cols-1 @lg:grid-cols-2 gap-5">
        <div className="rounded-xl border border-eu-line overflow-hidden">
          <div className="bg-eu-surface px-4 py-3 font-extrabold text-eu-ink text-[length:var(--fs-16)]">{c.epiloges_paradosis_gia_ayto}</div>
          <ul className="m-0 p-0 list-none divide-y divide-eu-line-2">
            {delivery.map((d) => (
              <li key={d.t} className="flex gap-3 p-4">
                <d.icon className="size-6 text-eu-blue shrink-0" aria-hidden />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between gap-3 font-bold text-eu-ink text-[length:var(--fs-17)]">
                    {d.t}
                    <span className={`shrink-0 ${d.s === "Δωρεάν" ? "text-eu-green" : "text-eu-blue"}`}>{d.s}</span>
                  </div>
                  <div className="text-eu-muted text-[length:var(--fs-15)] mt-0.5">{d.d}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-eu-line overflow-hidden">
          <div className="bg-eu-navy text-white px-4 py-3 font-extrabold text-[length:var(--fs-16)]">{c.ypiresies_euronics_gia_ayto}</div>
          <ul className="m-0 p-0 list-none divide-y divide-eu-line-2">
            {svc.map((s) => {
              const Icon = icons[s.slug] ?? ShieldCheck;
              return (
                <li key={s.slug}>
                  <Link href={`/ypiresies/${s.slug}`} className="flex gap-3 p-4 hover:bg-eu-surface">
                    <Icon className="size-6 text-eu-yellow-dark shrink-0" aria-hidden />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between gap-3 font-bold text-eu-ink text-[length:var(--fs-17)]">
                        {s.title}
                        <span className="shrink-0 text-eu-blue">{s.priceFrom ? `από ${priceLong(s.priceFrom)}` : "Δωρεάν"}</span>
                      </div>
                      <div className="text-eu-muted text-[length:var(--fs-15)] mt-0.5">{s.blurb}</div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
