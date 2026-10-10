"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Undo2 } from "lucide-react";
import { saveBulkyRulesAction } from "./actions";

type Choice = "auto" | "courier" | "store";
export interface BulkyCat { slug: string; name: string; depth: number; count: number; storeOnly: number; def: "courier" | "store" | null }
export interface BulkyInitial { categories: Record<string, "courier" | "store">; maxKg: number; maxSideCm: number; lockerMaxKg: number; lockerBox: [number, number, number] }

const LABEL: Record<Choice, string> = { auto: "Αυτόματο", courier: "Courier", store: "Μόνο κατάστημα" };
const field = "w-full rounded-lg border border-eu-line bg-white px-3 min-h-11 text-[length:var(--fs-15)] tabular-nums";

/**
 * Ποια προϊόντα δεν φεύγουν με courier: επιλογή ανά κατηγορία (ισχύει και για τις υποκατηγορίες, εκτός αν έχουν δική
 * τους) και όρια βάρους / μεγέθους για τα υπόλοιπα. «Αυτόματο» = η προεπιλογή του καταστήματος ή, αν δεν έχει, τα όρια.
 */
export function BulkyForm({ cats, initial, canWrite }: { cats: BulkyCat[]; initial: BulkyInitial; canWrite: boolean }) {
  const router = useRouter();
  const [map, setMap] = useState(initial.categories);
  const [lim, setLim] = useState({ maxKg: String(initial.maxKg), maxSideCm: String(initial.maxSideCm), lockerMaxKg: String(initial.lockerMaxKg) });
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const snap = (m: Record<string, string>, l: Record<string, string>) => JSON.stringify([Object.entries(m).sort(), l]);
  const dirty = useMemo(() => snap(map, lim) !== snap(initial.categories, { maxKg: String(initial.maxKg), maxSideCm: String(initial.maxSideCm), lockerMaxKg: String(initial.lockerMaxKg) }), [map, lim, initial]);
  const set = (slug: string, c: Choice) => setMap((m) => { const n = { ...m }; if (c === "auto") delete n[slug]; else n[slug] = c; return n; });
  const save = () => start(async () => {
    const r = await saveBulkyRulesAction({ categories: map, maxKg: lim.maxKg, maxSideCm: lim.maxSideCm, lockerMaxKg: lim.lockerMaxKg, lockerBox: initial.lockerBox });
    setMsg(r.ok ? `Αποθηκεύτηκε (${r.categories} κατηγορίες με δική σου επιλογή). Ισχύει σε 1 λεπτό στο checkout.` : "Δεν αποθηκεύτηκε.");
    router.refresh();
  });
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 @xl:grid-cols-3 gap-3">
        {([["maxKg", "Μέγιστο βάρος για courier (κιλά)", "Βάρος συσκευασίας από τα χαρακτηριστικά· πάνω από αυτό → μόνο κατάστημα."], ["maxSideCm", "Μέγιστη διάσταση για courier (εκ.)", "Η μεγαλύτερη πλευρά από το ERP (CCCLENGTH/WIDTH/HEIGHT)."], ["lockerMaxKg", "Μέγιστο βάρος για θυρίδα (κιλά)", "BOX NOW: έως 20 κιλά και ντουλάπι 36 × 45 × 60 εκ."]] as const).map(([k, l, h]) => (
          <label key={k} className="grid gap-1 rounded-xl border border-eu-line bg-white p-3">
            <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{l}</span>
            <input inputMode="decimal" value={lim[k]} disabled={!canWrite} onChange={(e) => setLim((x) => ({ ...x, [k]: e.target.value.replace(",", ".") }))} className={field} />
            <span className="text-eu-ink-3 text-[length:var(--fs-13)]">{h}</span>
          </label>
        ))}
      </div>
      <ul className="m-0 p-0 list-none grid gap-1.5">
        {cats.map((c) => {
          const choice: Choice = map[c.slug] ?? "auto";
          return (
            <li key={c.slug} className={`rounded-xl border border-eu-line bg-white px-3 py-2 grid grid-cols-1 @xl:grid-cols-[minmax(0,1fr)_auto] gap-2 items-center ${c.depth === 0 ? "mt-2" : ""}`} style={{ marginInlineStart: `${c.depth * 0.75}rem` }}>
              <div className="min-w-0">
                <span className={`text-eu-ink ${c.depth === 0 ? "font-extrabold" : "font-bold"} text-[length:var(--fs-15)]`}>{c.name}</span>
                <span className="text-eu-ink-3 text-[length:var(--fs-13)]"> · {c.count} προϊόντα{c.storeOnly ? ` · ${c.storeOnly} μόνο από κατάστημα` : ""}{c.def ? ` · προεπιλογή: ${LABEL[c.def]}` : ""}</span>
              </div>
              <div role="radiogroup" aria-label={`Αποστολή: ${c.name}`} className="inline-flex rounded-full border border-eu-line p-0.5 justify-self-start">
                {(["auto", "courier", "store"] as Choice[]).map((v) => (
                  <label key={v} className={`rounded-full px-3 min-h-10 inline-flex items-center text-[length:var(--fs-13)] font-bold ${canWrite ? "cursor-pointer" : "cursor-not-allowed"} ${choice === v ? "bg-eu-navy text-white" : "text-eu-ink-2 hover:bg-eu-surface"}`}>
                    <input type="radio" className="sr-only" name={`ship-${c.slug}`} checked={choice === v} disabled={!canWrite} onChange={() => set(c.slug, v)} />
                    {LABEL[v]}
                  </label>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      {canWrite && (
        <div className="sticky bottom-3 flex flex-wrap items-center gap-2 rounded-xl bg-white/95 border border-eu-line p-2 shadow-sm">
          {msg && <p role="status" className="m-0 font-bold text-eu-green text-[length:var(--fs-14)]">{msg}</p>}
          {dirty && <button type="button" onClick={() => { setMap(initial.categories); setLim({ maxKg: String(initial.maxKg), maxSideCm: String(initial.maxSideCm), lockerMaxKg: String(initial.lockerMaxKg) }); setMsg(null); }} className="inline-flex items-center gap-1.5 rounded-full border border-eu-line text-eu-ink-2 font-bold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-surface"><Undo2 className="size-4" aria-hidden /> Αναίρεση</button>}
          <button type="button" onClick={save} disabled={!dirty || pending} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-12 hover:bg-eu-blue disabled:opacity-50">
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />} Αποθήκευση
          </button>
        </div>
      )}
    </div>
  );
}
