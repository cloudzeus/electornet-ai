"use client";

import { useState } from "react";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("contact");

const input = "rounded-md border border-eu-line bg-white px-3 py-2.5 min-h-11 text-[length:var(--fs-15)] w-full";
const label = "grid gap-1 text-[length:var(--fs-14)] font-semibold text-eu-ink";

export function ContactForm() {
  const [done, setDone] = useState(false);
  if (done)
    return (
      <div className="bg-eu-green/10 border border-eu-green/30 rounded-xl p-5 text-[length:var(--fs-15)] text-eu-ink-2">
        <div className="font-extrabold text-eu-ink text-[length:var(--fs-16)] mb-1">{c.lavame_to_minyma_soy}</div>
        {c.apantame_entos_1_ergasimis}
      </div>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setDone(true);
      }}
      className="bg-white rounded-xl border border-eu-line p-5 grid gap-3"
    >
      <div className="grid grid-cols-1 @sm:grid-cols-2 gap-3">
        <label className={label}>
          {c.onomateponymo} <input required className={input} autoComplete="name" />
        </label>
        <label className={label}>
          Email <input type="email" required className={input} autoComplete="email" />
        </label>
        <label className={label}>
          {c.tilefono} <input type="tel" className={input} autoComplete="tel" />
        </label>
        <label className={label}>
          {c.thema}
          <select className={input}>
            <option>{c.erotisi_gia_paraggelia}</option>
            <option>{c.techniki_erotisi_gia_proion}</option>
            <option>{c.service_eggyisi}</option>
            <option>{c.epistrofi}</option>
            <option>{c.tilefoniki_paraggelia}</option>
            <option>{c.allo}</option>
          </select>
        </label>
      </div>
      <label className={label}>
        Αριθμός παραγγελίας (προαιρετικά) <input className={input} placeholder="EUR-…" />
      </label>
      <label className={label}>
        {c.minyma} <textarea required rows={5} className="rounded-md border border-eu-line bg-white px-3 py-2 text-[length:var(--fs-15)]" />
      </label>
      <label className="flex items-start gap-2 text-[length:var(--fs-14)] text-eu-ink-2 cursor-pointer">
        <input type="checkbox" required className="mt-0.5 size-4 accent-eu-blue" /> Συμφωνώ με την επεξεργασία των στοιχείων μου για την απάντηση στο αίτημά μου (πολιτική απορρήτου).
      </label>
      <button type="submit" className="justify-self-start rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-6 min-h-11 hover:bg-eu-blue">
        {c.apostoli}
      </button>
    </form>
  );
}
