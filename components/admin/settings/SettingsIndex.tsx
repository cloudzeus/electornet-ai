"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import {
  ArrowRight, Bot, Building2, Check, ChevronRight, CircleAlert, Cloud, CornerDownRight, CreditCard, Database, KeyRound, LineChart, LogIn,
  Mail, Percent, Search, Share2, ShieldAlert, Store, Truck, X, type LucideIcon,
} from "lucide-react";
import { StatusPill, type Status } from "./ui";
import type { Attention, FeatureArea } from "@/lib/settings/status";

export type IndexCard = { key: string; href: string; title: string; description: string; group: string; status: Status; statusText: string; updated: string | null; fields: { key: string; label: string; help?: string }[] };

const ICON: Record<string, LucideIcon> = {
  general: Store, social: Share2, "social-login": LogIn, analytics: LineChart, softone: Database, payments: CreditCard, shipping: Truck,
  bunny: Cloud, aade: Building2, email: Mail, ai: Bot, "ai-markup": Percent, "api-keys": KeyRound,
};
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const head = "m-0 font-extrabold text-eu-navy text-[length:var(--fs-13)] uppercase tracking-wide";

/**
 * Αρχική των ρυθμίσεων: «Θέλουν προσοχή» (κάθε πρόβλημα ανοίγει κατευθείαν το πεδίο), «Τι είναι ενεργό» (οι διακόπτες
 * λειτουργιών του site με σύνδεσμο στον διακόπτη), οι ενότητες ανά σκοπό με την κατάστασή τους, και αναζήτηση που
 * βρίσκει και μεμονωμένα πεδία.
 */
export function SettingsIndex({ groups, cards, attention, features }: { groups: { key: string; label: string; help: string }[]; cards: IndexCard[]; attention: Attention[]; features: FeatureArea[] }) {
  const [q, setQ] = useState("");
  const [allIssues, setAllIssues] = useState(false);
  const [showOff, setShowOff] = useState(false);
  const dq = norm(useDeferredValue(q).trim());
  const hits = dq
    ? cards.flatMap((c) => c.fields.filter((f) => norm(`${f.label} ${f.help ?? ""}`).includes(dq)).map((f) => ({ c, f }))).slice(0, 30)
    : [];
  const shown = dq ? cards.filter((c) => norm(`${c.title} ${c.description}`).includes(dq) || hits.some((h) => h.c.key === c.key)) : cards;
  const issues = allIssues ? attention : attention.slice(0, 5);
  const onCount = features.reduce((n, a) => n + a.items.filter((i) => i.on && !i.bad).length, 0);
  const offCount = features.reduce((n, a) => n + a.items.filter((i) => !i.on).length, 0);

  return (
    <>
      <label data-help="settings.search" className="relative block max-w-xl">
        <span className="sr-only">Αναζήτηση ρύθμισης</span>
        <Search className="size-5 absolute left-3 top-1/2 -translate-y-1/2 text-eu-muted pointer-events-none" aria-hidden />
        <input type="text" enterKeyHint="search" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Βρες ρύθμιση… π.χ. IBAN, pixel, κωδικός SMTP" className="w-full rounded-full border-2 border-eu-line bg-white pl-11 pr-12 min-h-12 text-[length:var(--fs-16)] outline-none focus:border-eu-blue" />
        {q && <button type="button" onClick={() => setQ("")} aria-label="Καθαρισμός" className="absolute right-1 top-1/2 -translate-y-1/2 size-11 inline-flex items-center justify-center rounded-full text-eu-muted hover:bg-eu-surface"><X className="size-4" aria-hidden /></button>}
      </label>

      {dq && (
        <section aria-live="polite" className="grid gap-2">
          <h3 className={head}>{hits.length ? `Πεδία (${hits.length})` : "Κανένα πεδίο"}</h3>
          {hits.length > 0 && (
            <ul className="m-0 p-0 list-none grid gap-1 @3xl:grid-cols-2">
              {hits.map(({ c, f }) => (
                <li key={`${c.key}-${f.key}`}>
                  <Link href={`${c.href}#f-${f.key}`} className="flex items-start gap-2 rounded-xl bg-white border border-eu-line px-3 py-2 min-h-12 h-full hover:border-eu-blue">
                    <CornerDownRight className="size-4 mt-1 text-eu-muted shrink-0" aria-hidden />
                    <span className="grid min-w-0"><span className="font-bold text-eu-ink text-[length:var(--fs-15)]">{f.label}</span><span className="text-eu-muted text-[length:var(--fs-13)] line-clamp-2">{c.title}{f.help ? ` · ${f.help}` : ""}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!dq && (
        <section data-help="settings.attention" aria-labelledby="h-att" className={`rounded-2xl border grid gap-3 ${attention.length ? "bg-white border-eu-amber/50 p-4 @md:p-5" : "bg-eu-green/5 border-eu-green/30 px-4 py-3"}`}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {attention.length ? <CircleAlert className="size-5 text-eu-amber shrink-0" aria-hidden /> : <Check className="size-5 text-eu-green shrink-0" aria-hidden />}
            <h3 id="h-att" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">{attention.length ? `Θέλουν προσοχή (${attention.length})` : "Όλα εντάξει"}</h3>
            {!attention.length && <span className="text-eu-ink-2 text-[length:var(--fs-14)]">— δεν λείπει κανένα υποχρεωτικό στοιχείο και τίποτα δεν εμποδίζει τους πελάτες.</span>}
          </div>
          {attention.length ? (
            <>
              <ul className="m-0 p-0 list-none grid gap-1.5">
                {issues.map((a, i) => (
                  <li key={i}>
                    <Link href={a.href} className="group flex items-start gap-2.5 rounded-xl bg-eu-surface/70 px-3 py-2.5 min-h-12 hover:bg-eu-chip">
                      {a.level === "critical" ? <ShieldAlert className="size-4 mt-0.5 shrink-0 text-eu-red" aria-label="Σημαντικό" /> : <CircleAlert className="size-4 mt-0.5 shrink-0 text-eu-amber" aria-label="Προσοχή" />}
                      <span className="flex-1 min-w-0 text-eu-ink text-[length:var(--fs-14)] leading-snug">{a.text}</span>
                      <span className="shrink-0 inline-flex items-center gap-1 font-bold text-eu-blue text-[length:var(--fs-13)] group-hover:underline">Διόρθωση <ArrowRight className="size-3.5" aria-hidden /></span>
                    </Link>
                  </li>
                ))}
              </ul>
              {attention.length > 5 && <button type="button" onClick={() => setAllIssues((v) => !v)} className="justify-self-start rounded-full px-3 min-h-10 font-bold text-eu-blue text-[length:var(--fs-14)] hover:bg-eu-surface">{allIssues ? "Λιγότερα" : `Όλα (${attention.length})`}</button>}
            </>
          ) : null}
        </section>
      )}

      <div className="grid gap-5 @5xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] items-start">
        <div data-help="settings.sections" className="grid gap-5 min-w-0">
          {groups.map((g) => {
            const list = shown.filter((c) => c.group === g.key);
            if (!list.length) return null;
            return (
              <section key={g.key} aria-labelledby={`h-${g.key}`} className="grid gap-2">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <h3 id={`h-${g.key}`} className={head}>{g.label}</h3>
                  <span className="text-eu-muted text-[length:var(--fs-13)]">{g.help}</span>
                </div>
                <ul className="m-0 p-0 list-none grid gap-2 @2xl:grid-cols-2">
                  {list.map((c) => {
                    const I = ICON[c.key] ?? Store;
                    return (
                      <li key={c.key}>
                        <Link href={c.href} className="group flex items-start gap-3 rounded-2xl bg-white border border-eu-line p-3.5 h-full hover:border-eu-blue hover:shadow-[var(--shadow-raised)] transition-[border-color,box-shadow]">
                          <span className="size-10 shrink-0 grid place-items-center rounded-xl bg-eu-surface text-eu-navy group-hover:bg-eu-chip group-hover:text-eu-blue"><I className="size-5" aria-hidden /></span>
                          <span className="min-w-0 flex-1 grid gap-1">
                            <span className="font-heading font-bold text-eu-ink text-[length:var(--fs-16)] leading-tight">{c.title}</span>
                            <span className="text-eu-muted text-[length:var(--fs-13)] leading-snug line-clamp-2">{c.description}</span>
                            <span className="mt-1 flex flex-wrap items-center gap-2"><StatusPill status={c.status} text={c.statusText} />{c.updated && <span className="text-eu-muted text-[length:var(--fs-12)]">αλλαγή {c.updated}</span>}</span>
                          </span>
                          <ChevronRight className="size-5 shrink-0 mt-2.5 text-eu-muted group-hover:text-eu-blue" aria-hidden />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
          {dq && !shown.length && <p className="m-0 text-eu-muted text-[length:var(--fs-15)]">Δεν βρέθηκε ρύθμιση για «{q}».</p>}
        </div>

        {!dq && (
          <aside data-help="settings.features" aria-labelledby="h-feat" className="rounded-2xl bg-white border border-eu-line p-4 grid gap-3 @5xl:sticky @5xl:top-4">
            <div className="grid">
              <h3 id="h-feat" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Τι είναι ενεργό στο site</h3>
              <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">{onCount} ενεργές λειτουργίες · πάτα μία για να την αλλάξεις</p>
            </div>
            {features.map((a) => {
              const items = a.items.filter((i) => showOff || i.on);
              const hidden = a.items.length - items.length;
              return (
                <div key={a.title} className="grid gap-1.5">
                  <h4 className="m-0 font-bold text-eu-ink-3 text-[length:var(--fs-12)] uppercase tracking-wide">{a.title}</h4>
                  {items.length ? (
                    <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">
                      {items.map((i) => (
                        <li key={i.label}>
                          <Link href={i.href} title={i.on ? "Ενεργό — πάτα για αλλαγή" : "Ανενεργό — πάτα για ενεργοποίηση"} className={`inline-flex items-center gap-1.5 rounded-full px-3 min-h-9 text-[length:var(--fs-13)] font-bold border transition-colors ${i.on ? (i.bad ? "bg-eu-red/10 border-eu-red/40 text-eu-red" : "bg-eu-green/10 border-eu-green/30 text-eu-ink hover:border-eu-green") : "bg-white border-eu-line border-dashed text-eu-muted hover:border-eu-blue hover:text-eu-blue"}`}>
                            {i.on ? (i.bad ? <ShieldAlert className="size-3.5" aria-hidden /> : <Check className="size-3.5 text-eu-green" aria-hidden />) : <span className="size-2 rounded-full border-2 border-current" aria-hidden />}
                            {i.label}{i.detail && <span className="font-normal text-eu-ink-3">· {i.detail}</span>}
                            <span className="sr-only">{i.on ? " (ενεργό)" : " (ανενεργό)"}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Κανένα ενεργό ({hidden} διαθέσιμα)</p>}
                </div>
              );
            })}
            {offCount > 0 && (
              <button type="button" aria-pressed={showOff} onClick={() => setShowOff((v) => !v)} className="justify-self-start rounded-full border border-eu-line px-3 min-h-10 font-bold text-eu-blue text-[length:var(--fs-14)] hover:bg-eu-surface">
                {showOff ? "Μόνο τα ενεργά" : `Δείξε και τα ανενεργά (${offCount})`}
              </button>
            )}
          </aside>
        )}
      </div>
    </>
  );
}
