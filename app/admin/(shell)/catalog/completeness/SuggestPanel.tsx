"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Sparkles, Loader2, Check, AlertTriangle } from "lucide-react";
import type { SuggestResult } from "@/lib/catalog/spec-suggest";
import { suggestSpecsAction, applySuggestionAction } from "./actions";

const fmt = (n: number) => n.toLocaleString("el-GR", { maximumFractionDigits: 1 });

/**
 * «Πρόταση από την απόδελτίωση» μέσα στη Γρήγορη διόρθωση: βρίσκει τιμές για τα χαρακτηριστικά της κατηγορίας,
 * διαστάσεις και βάρος, ο χρήστης τσεκάρει ποια θέλει και «Εισαγωγή» τα γράφει (SoftOne + e-shop).
 */
export function SuggestPanel({ productId, readonly, onApplied }: { productId: string; readonly: boolean; onApplied: () => void }) {
  const [res, setRes] = useState<SuggestResult | null>(null);
  const [specOn, setSpecOn] = useState<Set<string>>(new Set());
  const [dimIx, setDimIx] = useState<number | null>(null);
  const [weightOn, setWeightOn] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [finding, startFind] = useTransition();
  const [saving, startSave] = useTransition();

  const find = () => startFind(async () => {
    setMsg(null);
    const r = await suggestSpecsAction(productId).catch(() => null);
    if (!r) { setMsg({ ok: false, text: "Η πρόταση απέτυχε — δοκίμασε ξανά." }); return; }
    setRes(r);
    setSpecOn(new Set(r.specs.filter((s) => !s.exists).map((s) => s.label)));
    setDimIx(r.dims.length ? 0 : null);
    setWeightOn(!!r.weight);
  });
  const apply = () => startSave(async () => {
    if (!res) return;
    const r = await applySuggestionAction(productId, {
      specs: res.specs.filter((s) => specOn.has(s.label)).map((s) => ({ label: s.label, value: s.value })),
      dims: dimIx != null ? res.dims[dimIx] : null,
      weightKg: weightOn ? res.weight?.value ?? null : null,
    }).catch(() => ({ ok: false, message: "Η εισαγωγή απέτυχε." }));
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok) { setRes(null); onApplied(); }
  });
  const picked = specOn.size + (dimIx != null ? 1 : 0) + (weightOn ? 1 : 0);
  const row = "flex items-start gap-2 min-h-11 md:min-h-9 py-1 cursor-pointer";

  return (
    <section className="grid gap-2 rounded-xl border border-eu-line p-3 min-w-0" aria-label="Πρόταση από την απόδελτίωση" data-help="completeness.suggest">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="m-0 font-bold text-eu-ink text-[length:var(--fs-15)] inline-flex items-center gap-1.5"><Sparkles className="size-4 text-eu-blue" aria-hidden /> Πρόταση από την απόδελτίωση</h3>
        <button type="button" onClick={find} disabled={finding || saving} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] cursor-pointer hover:bg-eu-blue disabled:opacity-60">
          {finding ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />} {res ? "Ξανά" : "Βρες χαρακτηριστικά, διαστάσεις & βάρος"}
        </button>
      </div>
      <p className="m-0 text-eu-ink-3 text-[length:var(--fs-12)]">Διαβάζει την καταχώριση του προϊόντος στο EPREL (τη βρίσκει, αν δεν έχει συνδεθεί) και το κείμενο των banners που αποδελτιώθηκαν, και προτείνει τιμές μόνο για τα χαρακτηριστικά της κατηγορίας, με το απόσπασμα από το οποίο βγήκαν. Τίποτα δεν γράφεται πριν πατήσεις «Εισαγωγή».</p>

      {res && (
        <div className="grid gap-2 min-w-0">
          <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">
            {res.group ? <>Ομάδα: <b className="text-eu-ink-2">{res.group}</b> · </> : null}
            {res.sources.eprel ? <>EPREL <b className="text-eu-ink-2">{res.sources.eprel}</b> · </> : "Χωρίς EPREL · "}
            {res.sources.external} από το internet · {res.sources.extractions} απόδελτιώσεις · {res.sources.sections} ενότητες · {res.sources.banners} banners
          </p>
          {res.note && (
            <p className="m-0 inline-flex items-start gap-1.5 rounded-lg bg-eu-surface px-2.5 py-1.5 text-eu-ink-2 text-[length:var(--fs-13)]">
              <AlertTriangle className="size-4 mt-0.5 shrink-0 text-eu-yellow" aria-hidden />
              <span>{res.note} {res.sources.banners > 0 && res.sources.extractions === 0 && <Link href={`/admin/catalog/${productId}/banners`} className="font-bold text-eu-blue hover:underline">Απόδελτίωση banners</Link>}</span>
            </p>
          )}

          {res.specs.length > 0 && (
            <fieldset className="m-0 p-0 border-0 grid min-w-0">
              <legend className="font-bold text-eu-ink-2 text-[length:var(--fs-13)] mb-1">Χαρακτηριστικά</legend>
              {res.specs.map((s) => (
                <label key={s.label} className={`${row} ${s.exists ? "opacity-60 cursor-not-allowed" : ""}`}>
                  <input type="checkbox" disabled={s.exists || readonly} checked={specOn.has(s.label)} onChange={(e) => setSpecOn((x) => { const n = new Set(x); if (e.target.checked) n.add(s.label); else n.delete(s.label); return n; })} className="size-4 mt-1 shrink-0 accent-eu-navy" />
                  <span className="min-w-0 text-[length:var(--fs-13)]">
                    <b className="text-eu-ink">{s.label}</b>: {s.value}
                    {s.exists && <span className="text-eu-muted"> (υπάρχει ήδη)</span>}
                    <span className="block text-eu-muted text-[length:var(--fs-12)] break-words">«{s.quote}»</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          {res.dims.length > 0 && (
            <fieldset className="m-0 p-0 border-0 grid min-w-0">
              <legend className="font-bold text-eu-ink-2 text-[length:var(--fs-13)] mb-1">Διαστάσεις (Π × Υ × Β)</legend>
              {res.dims.map((d, i) => (
                <label key={i} className={row}>
                  <input type="radio" name={`dims-${productId}`} disabled={readonly} checked={dimIx === i} onChange={() => setDimIx(i)} className="size-4 mt-1 shrink-0 accent-eu-navy" />
                  <span className="min-w-0 text-[length:var(--fs-13)]">
                    <b className="text-eu-ink tabular-nums">{fmt(d.w)} × {fmt(d.h)} × {fmt(d.d)} εκ.</b> <span className="text-eu-muted">· {d.source}</span>
                    <span className="block text-eu-muted text-[length:var(--fs-12)] break-words">«{d.quote}»</span>
                  </span>
                </label>
              ))}
              <label className={row}>
                <input type="radio" name={`dims-${productId}`} disabled={readonly} checked={dimIx === null} onChange={() => setDimIx(null)} className="size-4 mt-1 shrink-0 accent-eu-navy" />
                <span className="text-eu-ink-2 text-[length:var(--fs-13)]">Χωρίς διαστάσεις</span>
              </label>
            </fieldset>
          )}

          {res.weight && (
            <label className={row}>
              <input type="checkbox" disabled={readonly} checked={weightOn} onChange={(e) => setWeightOn(e.target.checked)} className="size-4 mt-1 shrink-0 accent-eu-navy" />
              <span className="min-w-0 text-[length:var(--fs-13)]">
                <b className="text-eu-ink">Βάρος</b>: <span className="tabular-nums">{fmt(res.weight.value)} kg</span>
                <span className="block text-eu-muted text-[length:var(--fs-12)] break-words">«{res.weight.quote}»</span>
              </span>
            </label>
          )}

          {(res.specs.length > 0 || res.dims.length > 0 || res.weight) && (
            <button type="button" onClick={apply} disabled={readonly || saving || !picked} className="justify-self-start inline-flex items-center gap-1.5 rounded-full bg-eu-green text-white px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] cursor-pointer hover:opacity-90 disabled:opacity-50">
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Εισαγωγή επιλεγμένων ({picked}) στο SoftOne & e-shop
            </button>
          )}
        </div>
      )}
      {msg && <p role="status" className={`m-0 font-bold text-[length:var(--fs-13)] ${msg.ok ? "text-eu-green" : "text-eu-red"}`}>{msg.text}</p>}
    </section>
  );
}
