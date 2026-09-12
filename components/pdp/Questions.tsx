"use client";

import { useState } from "react";
import type { Product } from "@/lib/data/types";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("questions");

export function Questions({ product: p }: { product: Product }) {
  const [list, setList] = useState(p.questions ?? []);
  const [sent, setSent] = useState(false);
  return (
    <section id="qa" className="scroll-mt-24" aria-labelledby="qa-title">
      <h2 id="qa-title" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)] leading-tight mb-4">
        {c.erotiseis_apantiseis}
      </h2>
      {list.length > 0 && (
        <ul className="m-0 p-0 list-none grid gap-2 mb-4">
          {list.map((q) => (
            <li key={q.id} className="rounded-lg border border-eu-line p-4">
              <div className="font-bold text-eu-ink text-[length:var(--fs-17)]">Ε: {q.body}</div>
              {q.answer ? <p className="m-0 mt-1 text-eu-ink-2 text-[length:var(--fs-17)] leading-relaxed">Α: {q.answer}</p> : <p className="m-0 mt-1 text-eu-muted text-[length:var(--fs-14)]">{c.perimenei_apantisi_apo_tin}</p>}
              <div className="text-eu-muted text-[length:var(--fs-15)] mt-1">{q.date}</div>
            </li>
          ))}
        </ul>
      )}
      {sent ? (
        <p className="rounded-md bg-eu-chip text-eu-blue font-semibold text-[length:var(--fs-15)] px-3 py-2">{c.lavame_tin_erotisi_soy}</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const body = String(new FormData(e.currentTarget).get("q"));
            setList((l) => [...l, { id: `q${Date.now()}`, body, date: new Date().toISOString().slice(0, 10) }]);
            setSent(true);
          }}
          className="flex gap-2"
        >
          <label htmlFor="q-input" className="sr-only">
            {c.i_erotisi_soy}
          </label>
          <input id="q-input" name="q" required placeholder={c.rotise_kati_gia_to} className="flex-1 min-w-0 rounded-full border border-eu-line px-4 py-2.5 min-h-11 text-[length:var(--fs-15)]" />
          <button type="submit" className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-4 min-h-11 hover:bg-eu-blue">
            {c.rotise}
          </button>
        </form>
      )}
    </section>
  );
}
