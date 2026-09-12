"use client";

import { useState } from "react";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("returnForm");

type O = { number: string; date: string; lines: { id: string; title: string; qty: number }[] };
const input = "rounded-md border border-eu-line bg-white px-3 py-2.5 min-h-11 text-[length:var(--fs-15)] w-full";
const label = "grid gap-1 text-[length:var(--fs-14)] font-semibold text-eu-ink";

/** Online RMA — the current site handles returns only by email/phone. */
export function ReturnForm({ orders, preselect }: { orders: O[]; preselect?: string }) {
  const [no, setNo] = useState(preselect ?? orders[0]?.number ?? "");
  const [items, setItems] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const o = orders.find((x) => x.number === no);
  if (done)
    return (
      <div className="bg-eu-green/10 border border-eu-green/30 rounded-xl p-5 text-[length:var(--fs-15)] text-eu-ink-2">
        <div className="font-extrabold text-eu-ink text-[length:var(--fs-16)] mb-1">Αίτημα καταχωρήθηκε · RMA {done}</div>
        {c.steilame_odigies_sto_email}
      </div>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setDone(`RMA-${Date.now().toString().slice(-6)}`);
      }}
      className="bg-white rounded-xl border border-eu-line p-5 grid gap-4"
    >
      <label className={label}>
        {c.paraggelia}
        <select value={no} onChange={(e) => { setNo(e.target.value); setItems([]); }} className={input}>
          {orders.map((x) => (
            <option key={x.number} value={x.number}>
              {x.number} · {new Date(x.date).toLocaleDateString("el-GR")}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="m-0 p-0 border-0 grid gap-1.5">
        <legend className="font-semibold text-eu-ink text-[length:var(--fs-14)] mb-1">{c.proionta_pros_epistrofi}</legend>
        {o?.lines.map((l) => (
          <label key={l.id} className="flex items-center gap-2 rounded-md border border-eu-line p-2.5 text-[length:var(--fs-15)] cursor-pointer">
            <input type="checkbox" checked={items.includes(l.id)} onChange={() => setItems((s) => (s.includes(l.id) ? s.filter((x) => x !== l.id) : [...s, l.id]))} className="size-4 accent-eu-blue" />
            {l.qty} × {l.title}
          </label>
        ))}
      </fieldset>
      <label className={label}>
        {c.logos}
        <select className={input}>
          <option>Άλλαξα γνώμη (μέσα σε 14 ημέρες)</option>
          <option>Ελαττωματικό κατά την παραλαβή (DOA)</option>
          <option>{c.lathos_proion}</option>
          <option>{c.zimia_sti_metafora}</option>
        </select>
      </label>
      <label className={label}>
        {c.tropos_epistrofis}
        <select className={input}>
          <option>Παράδοση σε κατάστημα Euronics (δωρεάν)</option>
          <option>Παραλαβή από courier (χρέωση 5,90 €, δωρεάν για DOA/λάθος)</option>
        </select>
      </label>
      <label className={label}>
        {c.scholia} <textarea rows={3} className="rounded-md border border-eu-line bg-white px-3 py-2 text-[length:var(--fs-15)]" />
      </label>
      <button type="submit" disabled={items.length === 0} className="justify-self-start rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-blue disabled:opacity-40">
        {c.ypovoli_aitimatos}
      </button>
    </form>
  );
}
