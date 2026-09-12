"use client";

import { useSettings } from "@/components/site/SettingsProvider";
import { useState } from "react";
import { Zap } from "lucide-react";
import type { Product } from "@/lib/data/types";
import { CountUp } from "@/components/motion/CountUp";
import { estimateKwh, OLD_APPLIANCE_KWH } from "@/lib/energy/estimate";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("energy");


/**
 * @dynamic Energy Savings Engine: what the appliance costs to run per year
 * in euros next to a typical 10–15-year-old one of the same category. Two
 * bars, the 5-year saving as the big number, the assumptions stated in
 * plain words. Consumption: product specs / EPREL in production; here the
 * spec «Ετήσια κατανάλωση» when present, else a category × class table
 * (marked «εκτίμηση»). kWh price from settings (admin).
 */
export function EnergyCost({ product: p }: { product: Product }) {
  const KWH_PRICE = useSettings().site.commerce.kwhPrice;
  const est = estimateKwh(p);
  const old = OLD_APPLIANCE_KWH[p.subcategory] ?? OLD_APPLIANCE_KWH[p.category];
  const [years, setYears] = useState(5);
  if (!est || !old) return null;
  const newCost = Math.round(est.kwh * KWH_PRICE);
  const oldCost = Math.round(old * KWH_PRICE);
  const save = Math.max(0, (oldCost - newCost) * years);
  const pct = Math.min(100, Math.round((newCost / oldCost) * 100));
  return (
    <section
      className="rounded-2xl bg-eu-navy text-white p-5 @md:p-6 overflow-hidden relative isolate"
      aria-labelledby="energy-title"
    >
      <span className="eu-ambient" aria-hidden />
      <div className="relative">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="font-extrabold text-eu-yellow text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5">
              <Zap className="size-3.5" aria-hidden /> {c.reyma_se_eyro}
            </div>
            <h3
              id="energy-title"
              className="m-0 mt-1 font-heading font-bold text-[length:var(--fs-22)] leading-tight"
            >
              {c.ti_tha_plironeis_sti}
            </h3>
          </div>
          <div className="text-right">
            <div className="font-heading font-extrabold text-eu-yellow text-[length:var(--fs-44)] leading-none tracking-[-0.03em]">
              <CountUp value={save} prefix="−" suffix=" €" />
            </div>
            <div className="text-eu-on-dark-2 text-[length:var(--fs-14)] mt-1">
              σε {years} χρόνια αντί για την παλιά σου
            </div>
          </div>
        </div>
        <dl className="m-0 mt-5 grid gap-3">
          {[
            {
              l: `Η παλιά σου (${old >= 300 ? "≈2011" : "≈2012"}, παλιά κλίμακα)`,
              v: oldCost,
              w: 100,
              cls: "bg-white/25",
            },
            {
              l: `${p.brand} ${p.title.split(" ").slice(0, 3).join(" ")}${p.energy ? ` · κλάση ${p.energy.cls}` : ""}`,
              v: newCost,
              w: pct,
              cls: "bg-eu-yellow",
            },
          ].map((r) => (
            <div
              key={r.l}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 items-center"
            >
              <dt className="m-0 text-eu-on-dark text-[length:var(--fs-14)] truncate">
                {r.l}
              </dt>
              <dd className="m-0 font-extrabold text-[length:var(--fs-16)] tabular-nums">
                {r.v} €/έτος
              </dd>
              <div className="col-span-2 h-2.5 rounded-full bg-white/10 overflow-hidden mt-1">
                <div
                  className={`h-full rounded-full ${r.cls} transition-[width] duration-1000 ease-[var(--eu-ease-out)]`}
                  style={{ width: `${r.w}%` }}
                />
              </div>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-1" role="group" aria-label={c.chronia_chrisis}>
            {[3, 5, 8].map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setYears(y)}
                aria-pressed={years === y}
                className={`rounded-full px-3 min-h-10 font-bold text-[length:var(--fs-14)] transition-colors ${years === y ? "bg-eu-yellow text-eu-navy" : "bg-white/10 text-white hover:bg-white/20"}`}
              >
                {y} χρόνια
              </button>
            ))}
          </div>
          <p className="m-0 text-eu-on-dark-2 text-[length:var(--fs-14)]">
            {est.source === "specs"
              ? "Κατανάλωση από το δελτίο προϊόντος"
              : "Εκτίμηση από κατηγορία και ενεργειακή κλάση"}{" "}
            · {KWH_PRICE.toLocaleString("el-GR")} €/kWh
          </p>
        </div>
      </div>
    </section>
  );
}
