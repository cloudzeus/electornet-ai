"use client";

import { useState, useTransition } from "react";
import { Check, Plus } from "lucide-react";
import { saveMarkup } from "@/app/admin/(shell)/settings/actions";

type Row = { model: string; markupPct: number | null; note: string; calls: number; costUsd: number };

/** Super-admin: markup % per model (rows = models seen in usage + explicitly added). Blank = use default. */
export function AiMarkupPanel({ defaultPct, rows: initial }: { defaultPct: number; rows: Row[] }) {
  const [def, setDef] = useState(String(defaultPct));
  const [rows, setRows] = useState<Row[]>(initial);
  const [added, setAdded] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const field = "rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] font-normal outline-none focus:border-eu-blue bg-white";
  const eff = (r: Row) => r.markupPct ?? (Number(def) || 0);
  const save = () =>
    start(async () => {
      const r = await saveMarkup([{ model: "*", markupPct: Number(def) || 0 }, ...rows.map((x) => ({ model: x.model, markupPct: x.markupPct, note: x.note }))]);
      setMsg(r.message);
    });
  return (
    <div className="grid gap-4">
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Μόνο Super Admin</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">AI markup ανά μοντέλο</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">Χρεωμένο κόστος = κόστος OpenRouter × (1 + markup). Το markup «παγώνει» σε κάθε κλήση μαζί με την ισοτιμία USD→EUR της ημέρας (ΕΚΤ), ώστε η αναφορά να είναι σταθερή αναδρομικά. Οι διαχειριστές βλέπουν μόνο τα χρεωμένα ποσά.</p>
      </div>
      {msg && <p role="status" className="m-0 rounded-xl bg-eu-green/10 text-eu-green font-bold text-[length:var(--fs-14)] px-3 py-2">{msg}</p>}
      <div className="rounded-2xl bg-white border border-eu-line p-4 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">Προεπιλεγμένο markup (%)<input type="number" step="1" min={0} value={def} onChange={(e) => setDef(e.target.value)} className={`${field} w-36`} /></label>
        <span className="text-eu-muted text-[length:var(--fs-14)]">Ισχύει για κάθε μοντέλο χωρίς δική του τιμή (και για ό,τι διαλέξει το openrouter/auto).</span>
      </div>
      <div className="rounded-2xl bg-white border border-eu-line overflow-hidden">
        <table className="w-full border-collapse text-[length:var(--fs-14)]">
          <thead><tr className="text-left text-eu-muted"><th className="p-3 font-bold">Μοντέλο</th><th className="p-3 font-bold">Κλήσεις</th><th className="p-3 font-bold">Κόστος ($)</th><th className="p-3 font-bold">Markup (%)</th><th className="p-3 font-bold">Ισχύον</th><th className="p-3 font-bold">Σημείωση</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.model} className="border-t border-eu-line-2">
                <td className="p-3 font-mono font-bold text-eu-ink">{r.model}</td>
                <td className="p-3 tabular-nums">{r.calls}</td>
                <td className="p-3 tabular-nums">{r.costUsd.toFixed(4)}</td>
                <td className="p-3"><input type="number" step="1" min={0} value={r.markupPct ?? ""} placeholder={def} onChange={(e) => setRows((xs) => xs.map((x, j) => (j === i ? { ...x, markupPct: e.target.value === "" ? null : Number(e.target.value) } : x)))} className={`${field} w-28`} aria-label={`Markup ${r.model}`} /></td>
                <td className="p-3 tabular-nums font-bold text-eu-navy">×{(1 + eff(r) / 100).toFixed(2)}</td>
                <td className="p-3"><input value={r.note} onChange={(e) => setRows((xs) => xs.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} className={`${field} w-full min-w-40`} aria-label={`Σημείωση ${r.model}`} /></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="p-6 text-center text-eu-muted">Κανένα μοντέλο ακόμη — θα εμφανιστούν μόλις γίνουν κλήσεις, ή πρόσθεσέ τα χειροκίνητα.</td></tr>}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center gap-2 p-3 border-t border-eu-line bg-eu-surface/60">
          <input value={added} onChange={(e) => setAdded(e.target.value)} placeholder="π.χ. anthropic/claude-sonnet-4.5" className={`${field} font-mono flex-1 min-w-60`} aria-label="Νέο μοντέλο" />
          <button type="button" onClick={() => { const m = added.trim(); if (m && !rows.some((r) => r.model === m)) setRows((xs) => [...xs, { model: m, markupPct: Number(def) || 0, note: "", calls: 0, costUsd: 0 }]); setAdded(""); }} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-navy hover:text-white"><Plus className="size-4" aria-hidden /> Προσθήκη</button>
          <button type="button" disabled={pending} onClick={save} className="ml-auto inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-blue disabled:opacity-50"><Check className="size-4" aria-hidden /> Αποθήκευση</button>
        </div>
      </div>
    </div>
  );
}
