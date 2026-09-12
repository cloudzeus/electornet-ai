"use client";

import { useState } from "react";
import { Sparkles, ChevronDown } from "lucide-react";
import type { Product } from "@/lib/data/types";
import { compareRows } from "@/lib/data/attributes";
import { estimateKwh } from "@/lib/energy/estimate";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("compareVerdict");

/**
 * @dynamic «Εξήγησέ μου τη διαφορά»: a three-sentence verdict over the
 * compared products — price and instalment gap, energy cost gap per year,
 * and the characteristics that differ, plus a «who is it for» line per
 * product. Demo: composed from the canonical attributes locally;
 * production: the AI Sales Engine writes it from the same attributes and
 * the reviews summary, streamed.
 */
export function CompareVerdict({ products }: { products: Product[] }) {
  const [open, setOpen] = useState(false);
  if (products.length < 2) return null;
  const { groups, val } = compareRows(products);
  const differing = groups.flatMap(([, keys]) => keys).filter((k) => new Set(products.map((p) => val(p, k))).size > 1);
  const byPrice = [...products].sort((a, b) => a.price - b.price);
  const cheap = byPrice[0];
  const dear = byPrice[byPrice.length - 1];
  const gap = dear.price - cheap.price;
  const kwh = products.map((p) => ({ p, e: estimateKwh(p) }));
  const withE = kwh.filter((x) => x.e);
  const eLine = (() => {
    if (withE.length < 2) return null;
    const s = [...withE].sort((a, b) => a.e!.kwh - b.e!.kwh);
    const diff = Math.round((s[s.length - 1].e!.kwh - s[0].e!.kwh) * 0.19);
    return diff > 5 ? `Σε ρεύμα το ${s[0].p.brand} ${short(s[0].p.title)} κοστίζει περίπου ${diff} € λιγότερο τον χρόνο από το ${s[s.length - 1].p.brand} ${short(s[s.length - 1].p.title)}${diff * 5 >= gap ? ", δηλαδή σε 5 χρόνια καλύπτει τη διαφορά τιμής" : ""}.` : "Στο ρεύμα δεν έχουν ουσιαστική διαφορά.";
  })();
  const diffLine = differing.length ? `Διαφέρουν σε ${differing.length} χαρακτηριστικά: ${differing.slice(0, 4).join(", ")}${differing.length > 4 ? " και άλλα" : ""}.` : "Στα χαρακτηριστικά είναι πρακτικά ίδια.";
  const priceLine = gap > 0 ? `Η διαφορά τιμής είναι ${gap.toLocaleString("el-GR")} € (${Math.round(gap / 12)} € τον μήνα σε 12 δόσεις) ανάμεσα στο ${cheap.brand} ${short(cheap.title)} και το ${dear.brand} ${short(dear.title)}.` : "Έχουν την ίδια τιμή.";
  const who = products.map((p) => {
    const bits: string[] = [];
    if (p.id === cheap.id && gap > 0) bits.push("το πιο οικονομικό");
    if (p.energy && ["A", "A+", "A++", "A+++"].includes(p.energy.cls)) bits.push("η χαμηλότερη κατανάλωση");
    if (p.rating && p.rating.value >= 4.5) bits.push(`οι καλύτερες κριτικές (${p.rating.value.toLocaleString("el-GR")})`);
    if (p.badge?.kind === "discount") bits.push("σε προσφορά τώρα");
    const cap = (p.specs ?? []).find((x) => /Χωρητικότητα|Μέγεθος Οθόνης|Μνήμη/i.test(x.key));
    if (cap) bits.push(cap.value);
    return { p, text: bits.length ? bits.join(", ") : "ισορροπημένη επιλογή" };
  });
  return (
    <section className="relative rounded-2xl bg-eu-navy text-white overflow-hidden isolate" aria-labelledby="verdict-title">
      <span className="eu-ambient" aria-hidden />
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="relative w-full flex items-center justify-between gap-3 p-4 @md:p-5 text-left">
        <span className="flex items-center gap-3">
          <span className="size-10 rounded-full bg-eu-yellow text-eu-navy inline-flex items-center justify-center shrink-0">
            <Sparkles className="size-5" aria-hidden />
          </span>
          <span>
            <span className="block font-extrabold text-eu-yellow text-[length:var(--fs-13)] tracking-wide uppercase">{c.symvoylos_agoras}</span>
            <span id="verdict-title" className="block font-heading font-bold text-[length:var(--fs-19)] leading-tight">
              {c.exigise_moy_ti_diafora}
            </span>
          </span>
        </span>
        <ChevronDown className={`size-5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div className="relative px-4 pb-5 @md:px-5 @md:pb-6 grid gap-4">
          <p className="m-0 text-[length:var(--fs-16)] leading-relaxed text-eu-on-dark max-w-[70ch]">
            {priceLine} {eLine ?? ""} {diffLine}
          </p>
          <ul className="m-0 p-0 list-none grid grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-4 gap-2">
            {who.map(({ p, text }) => (
              <li key={p.id} className="rounded-xl bg-white/8 p-3">
                <div className="font-bold text-[length:var(--fs-14)] text-eu-on-dark-2 uppercase truncate">{p.brand}</div>
                <div className="font-bold text-[length:var(--fs-15)] leading-tight line-clamp-1">{short(p.title)}</div>
                <div className="mt-1 text-eu-yellow font-semibold text-[length:var(--fs-14)] leading-snug">{text}</div>
              </li>
            ))}
          </ul>
          <p className="m-0 text-eu-on-dark-2 text-[length:var(--fs-14)]">{c.apo_ta_charaktiristika_toy}</p>
        </div>
      )}
    </section>
  );
}

const short = (t: string) => t.split(" ").slice(0, 3).join(" ");
