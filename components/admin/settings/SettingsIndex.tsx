"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { ChevronRight, KeyRound, Search, X, CornerDownRight } from "lucide-react";
import { StatusPill, type Status } from "./ui";

export type IndexCard = { key: string; href: string; title: string; description: string; group: string; status: Status; statusText: string; updated: string | null; dark?: boolean; fields: { key: string; label: string; help?: string }[] };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Αρχική των ρυθμίσεων: κάρτες ανά ομάδα με την κατάσταση κάθε ενότητας + αναζήτηση που βρίσκει και μεμονωμένα πεδία. */
export function SettingsIndex({ groups, cards }: { groups: { key: string; label: string }[]; cards: IndexCard[] }) {
  const [q, setQ] = useState("");
  const dq = norm(useDeferredValue(q).trim());
  const hits = dq
    ? cards.flatMap((c) => c.fields.filter((f) => norm(`${f.label} ${f.help ?? ""}`).includes(dq)).map((f) => ({ c, f }))).slice(0, 30)
    : [];
  const shown = dq ? cards.filter((c) => norm(`${c.title} ${c.description}`).includes(dq) || hits.some((h) => h.c.key === c.key)) : cards;
  return (
    <>
      <label className="relative block max-w-xl">
        <span className="sr-only">Αναζήτηση ρύθμισης</span>
        <Search className="size-5 absolute left-3 top-1/2 -translate-y-1/2 text-eu-muted pointer-events-none" aria-hidden />
        <input type="text" enterKeyHint="search" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Βρες ρύθμιση… π.χ. IBAN, pixel, κωδικός SMTP" className="w-full rounded-full border-2 border-eu-line bg-white pl-11 pr-12 min-h-12 text-[length:var(--fs-16)] outline-none focus:border-eu-blue" />
        {q && <button type="button" onClick={() => setQ("")} aria-label="Καθαρισμός" className="absolute right-1 top-1/2 -translate-y-1/2 size-11 inline-flex items-center justify-center rounded-full text-eu-muted hover:bg-eu-surface"><X className="size-4" aria-hidden /></button>}
      </label>

      {dq && (
        <section aria-live="polite" className="grid gap-2">
          <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-13)] uppercase tracking-wide">{hits.length ? `Πεδία (${hits.length})` : "Κανένα πεδίο"}</h3>
          {hits.length > 0 && (
            <ul className="m-0 p-0 list-none grid gap-1">
              {hits.map(({ c, f }) => (
                <li key={`${c.key}-${f.key}`}>
                  <Link href={`${c.href}#f-${f.key}`} className="flex items-start gap-2 rounded-xl bg-white border border-eu-line px-3 py-2 min-h-12 hover:border-eu-blue">
                    <CornerDownRight className="size-4 mt-1 text-eu-muted shrink-0" aria-hidden />
                    <span className="grid min-w-0"><span className="font-bold text-eu-ink text-[length:var(--fs-15)]">{f.label}</span><span className="text-eu-muted text-[length:var(--fs-13)]">{c.title}{f.help ? ` · ${f.help}` : ""}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {groups.map((g) => {
        const list = shown.filter((c) => c.group === g.key);
        if (!list.length) return null;
        return (
          <section key={g.key} className="grid gap-3">
            <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-13)] uppercase tracking-wide">{g.label}</h3>
            <ul className="m-0 p-0 list-none grid grid-cols-1 @lg:grid-cols-2 @5xl:grid-cols-3 gap-3">
              {list.map((c) => (
                <li key={c.key}>
                  <Link href={c.href} className={`group flex items-start gap-3 rounded-2xl p-4 h-full min-h-full transition-all ${c.dark ? "bg-eu-navy text-white hover:bg-eu-blue" : "bg-white border border-eu-line hover:border-eu-blue hover:shadow-[var(--shadow-raised)]"}`}>
                    {c.dark && <KeyRound className="size-5 text-eu-yellow shrink-0 mt-1" aria-hidden />}
                    <div className="min-w-0 flex-1 grid gap-1">
                      <div className={`font-heading font-bold text-[length:var(--fs-17)] ${c.dark ? "" : "text-eu-ink"}`}>{c.title}</div>
                      <p className={`m-0 text-[length:var(--fs-14)] leading-snug ${c.dark ? "text-eu-on-dark-2" : "text-eu-muted"}`}>{c.description}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[length:var(--fs-13)]">
                        {c.dark ? <span className="rounded-full bg-white/15 px-2.5 py-1 font-bold">{c.statusText}</span> : <StatusPill status={c.status} text={c.statusText} />}
                        {c.updated && <span className={c.dark ? "text-eu-on-dark-2" : "text-eu-muted"}>αλλαγή {c.updated}</span>}
                      </div>
                    </div>
                    <ChevronRight className={`size-5 shrink-0 mt-1 ${c.dark ? "text-white/60" : "text-eu-muted group-hover:text-eu-blue"}`} aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {dq && !shown.length && <p className="m-0 text-eu-muted text-[length:var(--fs-15)]">Δεν βρέθηκε ρύθμιση για «{q}».</p>}
    </>
  );
}
