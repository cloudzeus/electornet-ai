"use client";

import { useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

const sel = "rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9 text-[length:var(--fs-13)] outline-none focus:border-eu-blue";

/** Αναζήτηση και φίλτρα — όλα στη διεύθυνση (κοινοποιούνται, κρατιούνται στο «πίσω»). Η αναζήτηση με καθυστέρηση 350 ms. */
export function OrderFilters({ q, ful, pay, from, to, sort }: { q: string; ful: string; pay: string; from: string; to: string; sort: string }) {
  const router = useRouter(), path = usePathname(), sp = useSearchParams();
  const [text, setText] = useState(q);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // η διεύθυνση άλλαξε απ' έξω (π.χ. «Καθαρισμός», πίσω): το πεδίο ακολουθεί — κατά την απόδοση, όχι σε effect
  const [prevQ, setPrevQ] = useState(q);
  if (q !== prevQ) { setPrevQ(q); setText(q); }
  const set = (patch: Record<string, string>) => {
    const u = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) u.set(k, v); else u.delete(k); }
    u.delete("p");
    start(() => router.replace(`${path}${u.size ? `?${u}` : ""}`, { scroll: false }));
  };
  const onText = (v: string) => { setText(v); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => set({ q: v.trim() }), 350); };
  const active = [ful, pay, from, to].some(Boolean) || sort !== "new";
  return (
    <div data-help="orders.filters" className="flex flex-wrap items-center gap-1.5">
      <label className="relative grow basis-64 @3xl:grow-0 @3xl:basis-80">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-eu-muted" aria-hidden />
        <input type="search" value={text} onChange={(e) => onText(e.target.value)} placeholder="Αριθμός, όνομα, email, τηλέφωνο, προϊόν…" aria-label="Αναζήτηση παραγγελιών" className="w-full rounded-lg border border-eu-line bg-white pl-8 pr-8 min-h-11 md:min-h-9 text-[length:var(--fs-14)] outline-none focus:border-eu-blue" />
        {pending && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 animate-spin text-eu-muted" aria-hidden />}
      </label>
      <select aria-label="Τρόπος παράδοσης" value={ful} onChange={(e) => set({ ful: e.target.value })} className={sel}>
        <option value="">Όλοι οι τρόποι παράδοσης</option><option value="courier">Courier</option><option value="click-collect">Παραλαβή από κατάστημα</option><option value="appointment">Ραντεβού</option>
      </select>
      <select aria-label="Τρόπος πληρωμής" value={pay} onChange={(e) => set({ pay: e.target.value })} className={sel}>
        <option value="">Όλες οι πληρωμές</option><option value="card">Κάρτα</option><option value="cod">Αντικαταβολή</option><option value="bank">Κατάθεση</option><option value="iris">IRIS</option><option value="klarna">Klarna</option><option value="tbi">TBI Bank</option><option value="no-card">Δόσεις χωρίς κάρτα</option><option value="store">Στο κατάστημα</option>
      </select>
      <span className="inline-flex items-center gap-1 text-eu-ink-3 text-[length:var(--fs-12)]">
        <input type="date" aria-label="Από ημερομηνία" value={from} onChange={(e) => set({ from: e.target.value })} className={`${sel} tabular-nums`} />
        –
        <input type="date" aria-label="Έως ημερομηνία" value={to} onChange={(e) => set({ to: e.target.value })} className={`${sel} tabular-nums`} />
      </span>
      <select aria-label="Ταξινόμηση" value={sort} onChange={(e) => set({ sort: e.target.value === "new" ? "" : e.target.value })} className={sel}>
        <option value="new">Νεότερες πρώτα</option><option value="old">Παλαιότερες πρώτα</option><option value="total">Μεγαλύτερο ποσό</option>
      </select>
      {(active || q) && <button type="button" onClick={() => { setText(""); set({ q: "", ful: "", pay: "", from: "", to: "", sort: "" }); }} className="inline-flex items-center gap-1 rounded-full px-2.5 min-h-11 md:min-h-9 font-bold text-eu-ink-3 text-[length:var(--fs-13)] hover:text-eu-navy"><X className="size-4" aria-hidden /> Καθαρισμός</button>}
    </div>
  );
}
