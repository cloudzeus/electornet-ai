"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Save, Trash2, Undo2 } from "lucide-react";
import { saveExtPricingAction } from "./actions";

type Tier = { id: string; category: string; min: string; max: string; price: string };
export interface ExtPricingInitial { enabled: boolean; tiers: { id: string; category: string; min: number; max: number | null; price: number }[] }

const s = (n: number | null) => (n == null ? "" : String(n));
const toRows = (i: ExtPricingInitial): Tier[] => i.tiers.map((t) => ({ id: t.id, category: t.category, min: s(t.min), max: s(t.max), price: s(t.price) }));
const field = "w-full rounded-lg border border-eu-line bg-white px-3 min-h-11 text-[length:var(--fs-15)] tabular-nums focus:outline-none focus:ring-2 ring-eu-blue/40";

/**
 * Κλίμακες τιμών: κατηγορία (ή «Όλες») × εύρος τιμής αγοράς → τιμή επέκτασης +2 έτη. Για μια συσκευή ισχύει η πιο
 * ειδική κατηγορία (η δική της, μετά οι γονικές, στο τέλος «Όλες») και μέσα της το εύρος που περιέχει την τιμή αγοράς.
 */
export function ExtPricingForm({ initial, categories, canWrite }: { initial: ExtPricingInitial; categories: { slug: string; label: string }[]; canWrite: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [rows, setRows] = useState<Tier[]>(() => toRows(initial));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const snap = (e: boolean, r: Tier[]) => JSON.stringify([e, r.map((t) => [t.category, t.min, t.max, t.price])]);
  const dirty = useMemo(() => snap(enabled, rows) !== snap(initial.enabled, toRows(initial)), [enabled, rows, initial]);
  const label = new Map(categories.map((c) => [c.slug, c.label]));
  const set = (i: number, p: Partial<Tier>) => setRows((r) => r.map((t, k) => (k === i ? { ...t, ...p } : t)));
  const problem = (t: Tier) => {
    const min = Number(t.min || 0), max = t.max === "" ? null : Number(t.max), price = Number(t.price);
    if (!t.price || !(price > 0)) return "Βάλε τιμή επέκτασης.";
    if (max != null && max < min) return "Το «έως» είναι μικρότερο από το «από».";
    return null;
  };
  const invalid = rows.filter((t) => problem(t)).length;
  const save = () => start(async () => {
    const r = await saveExtPricingAction({ enabled, tiers: rows.map((t) => ({ id: t.id, category: t.category, min: t.min, max: t.max, price: t.price })) });
    setMsg(r.ok ? { ok: true, text: `Αποθηκεύτηκε: ${r.tiers} κλίμακες, επέκταση επί πληρωμή ${r.enabled ? "ενεργή" : "κλειστή"}. Ισχύει σε 1 λεπτό στο site.` } : { ok: false, text: "Δεν αποθηκεύτηκε." });
    router.refresh();
  });

  return (
    <div className="grid gap-4">
      <label className="flex items-start gap-3 rounded-xl border border-eu-line bg-white p-4 cursor-pointer">
        <input type="checkbox" checked={enabled} disabled={!canWrite} onChange={(e) => setEnabled(e.target.checked)} className="mt-1 size-5 accent-eu-blue" />
        <span className="grid gap-0.5">
          <span className="font-bold text-eu-ink text-[length:var(--fs-15)]">Επέκταση εγγύησης επί πληρωμή</span>
          <span className="text-eu-ink-3 text-[length:var(--fs-14)]">Στις συσκευές πελατών χωρίς δωρεάν επέκταση (χωρίς «Επέκταση Εγγύησης» στο SoftOne), με ενεργή εγγύηση, εμφανίζεται κουμπί «Επέκταση +2 έτη · τιμή» και η πληρωμή γίνεται μέσω Viva. Οι συσκευές με CCCWARRANTY συνεχίζουν δωρεάν.</span>
        </span>
      </label>

      {rows.length === 0 ? (
        <p className="m-0 rounded-xl bg-eu-surface px-4 py-3 text-eu-ink-2 text-[length:var(--fs-15)]">Δεν υπάρχουν κλίμακες. Χωρίς κλίμακα για την κατηγορία και την τιμή μιας συσκευής, η επέκταση επί πληρωμή δεν εμφανίζεται. Παράδειγμα: Ψυγεία, από 0 έως 200 € → 29 €.</p>
      ) : (
        <ul className="m-0 p-0 list-none grid gap-3">
          {rows.map((t, i) => {
            const err = problem(t);
            return (
              <li key={t.id} className="rounded-xl border border-eu-line bg-white p-3 grid gap-2 grid-cols-1 @2xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto] @2xl:items-end">
                <label className="grid gap-1 min-w-0">
                  <span className="text-eu-ink-3 font-bold text-[length:var(--fs-13)]">Κατηγορία</span>
                  <select value={t.category} disabled={!canWrite} onChange={(e) => set(i, { category: e.target.value })} className={field}>
                    <option value="">Όλες οι κατηγορίες (γενική κλίμακα)</option>
                    {t.category && !label.has(t.category) && <option value={t.category}>{t.category} (δεν υπάρχει πια)</option>}
                    {categories.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-eu-ink-3 font-bold text-[length:var(--fs-13)]">Τιμή αγοράς από (€)</span>
                  <input inputMode="decimal" value={t.min} disabled={!canWrite} onChange={(e) => set(i, { min: e.target.value.replace(",", ".") })} placeholder="0" className={field} />
                </label>
                <label className="grid gap-1">
                  <span className="text-eu-ink-3 font-bold text-[length:var(--fs-13)]">έως (€)</span>
                  <input inputMode="decimal" value={t.max} disabled={!canWrite} onChange={(e) => set(i, { max: e.target.value.replace(",", ".") })} placeholder="χωρίς όριο" className={field} />
                </label>
                <label className="grid gap-1">
                  <span className="text-eu-ink-3 font-bold text-[length:var(--fs-13)]">Τιμή επέκτασης (€)</span>
                  <input inputMode="decimal" value={t.price} disabled={!canWrite} onChange={(e) => set(i, { price: e.target.value.replace(",", ".") })} placeholder="π.χ. 49" className={field} />
                </label>
                {canWrite && (
                  <button type="button" onClick={() => setRows((r) => r.filter((_, k) => k !== i))} aria-label="Αφαίρεση κλίμακας" className="justify-self-start inline-flex items-center justify-center gap-1.5 rounded-full border border-eu-line text-eu-red font-bold px-3 min-h-11 min-w-11 hover:bg-eu-red/5">
                    <Trash2 className="size-4" aria-hidden /> <span className="@2xl:sr-only">Αφαίρεση</span>
                  </button>
                )}
                {err && <p role="alert" className="m-0 @2xl:col-span-5 text-eu-red font-bold text-[length:var(--fs-13)]">{err}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {canWrite && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setRows((r) => [...r, { id: `t${Date.now().toString(36)}`, category: r.at(-1)?.category ?? "", min: r.at(-1)?.max ? String(Math.round((Number(r.at(-1)!.max) + 0.01) * 100) / 100) : "0", max: "", price: "" }])} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-surface">
            <Plus className="size-4" aria-hidden /> Νέα κλίμακα
          </button>
          {dirty && (
            <button type="button" onClick={() => { setEnabled(initial.enabled); setRows(toRows(initial)); setMsg(null); }} className="inline-flex items-center gap-1.5 rounded-full border border-eu-line text-eu-ink-2 font-bold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-surface">
              <Undo2 className="size-4" aria-hidden /> Αναίρεση
            </button>
          )}
          <button type="button" onClick={save} disabled={!dirty || pending || invalid > 0} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-12 hover:bg-eu-blue disabled:opacity-50">
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />} Αποθήκευση
          </button>
        </div>
      )}
      {msg && <p role="status" className={`m-0 font-bold text-[length:var(--fs-14)] ${msg.ok ? "text-eu-green" : "text-eu-red"}`}>{msg.text}</p>}
    </div>
  );
}
