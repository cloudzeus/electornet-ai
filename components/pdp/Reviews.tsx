"use client";

import { useState } from "react";
import type { Product } from "@/lib/data/types";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("reviews");

/** Reviews with a write form (demo: submits locally, marks as «σε έλεγχο»). */
export function Reviews({ product: p }: { product: Product }) {
  const [list, setList] = useState(p.reviews ?? []);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const avg = list.length ? list.reduce((n, r) => n + r.rating, 0) / list.length : p.rating?.value ?? 0;
  const count = p.rating?.count ?? list.length;
  return (
    <section className="scroll-mt-24" aria-labelledby="reviews-title" id="reviews">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 id="reviews-title" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)] leading-tight">
          {c.axiologiseis}
        </h2>
        <div className="flex items-center gap-3">
          {count > 0 && (
            <span className="text-[length:var(--fs-15)] text-eu-muted">
              <span className="text-eu-yellow-dark font-extrabold text-[length:var(--fs-16)]">★ {avg.toLocaleString("el-GR", { maximumFractionDigits: 1 })}</span> · {count} αξιολογήσεις
            </span>
          )}
          <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-14)] px-4 min-h-10 hover:bg-eu-surface">
            {c.grapse_axiologisi}
          </button>
        </div>
      </div>
      {open && !sent && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setList((l) => [{ id: `n${Date.now()}`, author: String(f.get("name") || "Ανώνυμος"), rating: Number(f.get("rating")), title: String(f.get("title")), body: String(f.get("body")), date: new Date().toISOString().slice(0, 10), verified: false }, ...l]);
            setSent(true);
          }}
          className="rounded-lg border border-eu-line p-4 grid gap-3 mb-4 bg-eu-surface"
        >
          <div className="grid grid-cols-1 @sm:grid-cols-2 gap-3">
            <label className="grid gap-1 text-[length:var(--fs-14)] font-semibold">
              {c.onoma}
              <input name="name" required className="rounded-md border border-eu-line bg-white px-3 py-2 min-h-11" />
            </label>
            <label className="grid gap-1 text-[length:var(--fs-14)] font-semibold">
              {c.vathmologia}
              <select name="rating" defaultValue="5" className="rounded-md border border-eu-line bg-white px-3 py-2 min-h-11">
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {"★".repeat(n)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-[length:var(--fs-14)] font-semibold">
            {c.titlos}
            <input name="title" required className="rounded-md border border-eu-line bg-white px-3 py-2 min-h-11" />
          </label>
          <label className="grid gap-1 text-[length:var(--fs-14)] font-semibold">
            {c.i_gnomi_soy}
            <textarea name="body" required rows={3} className="rounded-md border border-eu-line bg-white px-3 py-2" />
          </label>
          <button type="submit" className="justify-self-start rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-blue">
            {c.ypovoli}
          </button>
        </form>
      )}
      {sent && <p className="rounded-md bg-eu-chip text-eu-blue font-semibold text-[length:var(--fs-15)] px-3 py-2 mb-3">{c.eycharistoyme_i_axiologisi_soy}</p>}
      {list.length === 0 ? (
        <p className="m-0 text-eu-muted text-[length:var(--fs-16)]">{c.den_yparchoyn_akomi_axiologiseis}</p>
      ) : (
        <ul className="m-0 p-0 list-none grid gap-3">
          {list.map((r) => (
            <li key={r.id} className="rounded-lg border border-eu-line p-4">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-eu-yellow-dark font-extrabold">{"★".repeat(r.rating)}</span>
                <span className="font-bold text-eu-ink text-[length:var(--fs-17)]">{r.title}</span>
                {r.verified && <span className="rounded-sm bg-eu-green/10 text-eu-green font-bold text-[length:var(--fs-13)] px-1.5 py-0.5">{c.epivevaiomeni_agora}</span>}
              </div>
              <p className="m-0 text-eu-ink-2 text-[length:var(--fs-17)] leading-relaxed">{r.body}</p>
              <div className="text-eu-muted text-[length:var(--fs-15)] mt-1">
                {r.author} · {r.date}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
