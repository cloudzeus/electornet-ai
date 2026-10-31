"use client";

import { useMemo } from "react";
import { AlertTriangle, ArrowRight, Check, Info, Sparkles, Warehouse, X } from "lucide-react";
import { suggestStore } from "@/lib/partner-portal/connection-types";
import { Badge } from "../ui";
import { inputCls } from "../wizard";

export type PortalStore = { id: string; name: string; city: string; s1BranchId: number | null; code: string | null };
export type LocRow = { externalRef: string; name: string; storeId: string | null; why?: string; touched?: boolean };
export const IGNORE = "__ignore";

/** Αρχικές τιμές: ό,τι είχε αποθηκευτεί, αλλιώς πρόταση (ίδιος κωδικός υποκαταστήματος, όνομα/πόλη, ή το μόνο κατάστημα). */
export function initialLocations(locs: { ref: string; name: string }[], saved: LocRow[] | null, stores: PortalStore[]): LocRow[] {
  return locs.map((l) => {
    const s = saved?.find((x) => x.externalRef === l.ref);
    if (s) return { externalRef: l.ref, name: l.name, storeId: s.storeId, why: "αποθηκευμένο", touched: true };
    const g = suggestStore(l.ref, l.name, stores);
    return { externalRef: l.ref, name: l.name, storeId: g?.storeId ?? null, why: g?.why };
  });
}

export function locationChecks(rows: LocRow[], stores: PortalStore[]) {
  const mapped = rows.filter((r) => r.storeId);
  const byStore = new Map<string, LocRow[]>();
  for (const r of mapped) byStore.set(r.storeId!, [...(byStore.get(r.storeId!) ?? []), r]);
  const dup = [...byStore.entries()].filter(([, v]) => v.length > 1);
  const uncovered = stores.filter((s) => !byStore.has(s.id));
  const undecided = rows.filter((r) => !r.storeId && !r.touched);
  return [
    { key: "one", ok: mapped.length > 0, level: "error" as const, message: mapped.length ? `${mapped.length} από ${rows.length} αποθήκες συνδέθηκαν με κατάστημα` : "Συνδέστε τουλάχιστον μία αποθήκη με κατάστημα" },
    { key: "undecided", ok: !undecided.length, level: "warn" as const, message: undecided.length ? `${undecided.length} αποθήκες χωρίς απόφαση — διαλέξτε κατάστημα ή «Δεν πουλάμε από εδώ»` : "Όλες οι αποθήκες έχουν απόφαση" },
    { key: "dup", ok: !dup.length, level: "warn" as const, message: dup.length ? `Στο «${stores.find((s) => s.id === dup[0][0])?.name}» δείχνουν ${dup[0][1].length} αποθήκες — οι ποσότητες θα αθροιστούν` : "Κάθε κατάστημα από μία αποθήκη" },
    { key: "uncovered", ok: !uncovered.length, level: "info" as const, message: uncovered.length ? `Χωρίς απόθεμα από αυτή τη σύνδεση: ${uncovered.map((s) => s.name).join(", ")}` : "Όλα τα καταστήματα παίρνουν απόθεμα" },
  ];
}

/** Αντιστοίχιση «αποθήκη/υποκατάστημα τους → κατάστημα στο eshop», με πρόταση και αιτιολογία ανά γραμμή. */
export function LocationMapper({ rows, stores, onChange }: { rows: LocRow[]; stores: PortalStore[]; onChange: (rows: LocRow[]) => void }) {
  const checks = useMemo(() => locationChecks(rows, stores), [rows, stores]);
  const set = (i: number, v: string) => onChange(rows.map((r, j) => (j === i ? { ...r, storeId: v && v !== IGNORE ? v : null, touched: true, why: undefined } : r)));
  const single = rows.length === 1 && rows[0].externalRef === "default";
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] items-start min-w-0">
      <ul className="m-0 p-0 list-none grid gap-2 min-w-0" data-help="portal.locations-list">
        {rows.map((r, i) => {
          const val = r.storeId ?? (r.touched ? IGNORE : "");
          return (
            <li key={r.externalRef} className={`rounded-2xl border-2 p-3 sm:p-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)] md:items-center min-w-0 ${r.storeId ? "border-eu-line bg-white" : r.touched ? "border-eu-line bg-eu-surface/60" : "border-dashed border-eu-amber bg-[#fffbea]"}`}>
              <div className="flex items-start gap-3 min-w-0">
                <span className="grid place-items-center size-10 rounded-xl bg-eu-surface-2 text-eu-ink-2 shrink-0"><Warehouse className="size-5" aria-hidden /></span>
                <span className="min-w-0">
                  <b className="block break-words text-[length:var(--fs-15)]">{single ? "Ενιαίο απόθεμα" : r.name || r.externalRef}</b>
                  <span className="block text-eu-ink-3 text-[length:var(--fs-12)] break-all">{single ? "Το αρχείο δεν έχει στήλη καταστήματος" : `Κωδικός στο σύστημά σας: ${r.externalRef}`}</span>
                </span>
              </div>
              <ArrowRight className="hidden md:block size-5 text-eu-muted justify-self-center" aria-hidden />
              <div className="grid gap-1.5 min-w-0">
                <label className="sr-only" htmlFor={`loc-${i}`}>Κατάστημα για {r.name || r.externalRef}</label>
                <select id={`loc-${i}`} value={val} onChange={(e) => set(i, e.target.value)} className={`${inputCls(!val)} !min-h-11`}>
                  <option value="">— διαλέξτε —</option>
                  {stores.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.city}</option>)}
                  <option value={IGNORE}>Δεν πουλάμε από εδώ (αγνόησέ το)</option>
                </select>
                {r.why && r.storeId && <span className="inline-flex items-center gap-1 text-eu-ink-3 text-[length:var(--fs-12)]"><Sparkles className="size-3.5 text-[#8a6500]" aria-hidden /> Πρόταση: {r.why}</span>}
                {r.why === "αποθηκευμένο" && <Badge tone="good" icon={false}>αποθηκευμένο</Badge>}
              </div>
            </li>
          );
        })}
      </ul>
      <aside className="rounded-2xl bg-eu-surface p-4 grid gap-2 xl:sticky xl:top-4" aria-live="polite" aria-label="Έλεγχοι" data-help="portal.locations-checks">
        <p className="m-0 font-heading font-extrabold text-[length:var(--fs-16)]">Έλεγχοι</p>
        <ul className="m-0 p-0 list-none grid gap-1.5">
          {checks.map((c) => {
            const I = c.ok ? Check : c.level === "error" ? X : c.level === "warn" ? AlertTriangle : Info;
            return <li key={c.key} className="flex gap-2 items-start text-[length:var(--fs-13)] leading-snug"><I className={`size-4 shrink-0 mt-0.5 ${c.ok ? "text-eu-green" : c.level === "error" ? "text-[#b3261e]" : c.level === "warn" ? "text-[#8a6500]" : "text-eu-blue"}`} aria-hidden />{c.message}</li>;
          })}
        </ul>
      </aside>
    </div>
  );
}
