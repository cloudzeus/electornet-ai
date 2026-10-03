"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { saveMarkup } from "@/app/admin/(shell)/settings/actions";
import { inputCls, SaveBar, ResultBanner } from "./settings/ui";

type Row = { model: string; markupPct: number | null; note: string; calls: number; costUsd: number };

/** Super-admin: markup % per model (rows = models seen in usage + explicitly added). Blank = use default. */
export function AiMarkupPanel({ defaultPct, rows: initial }: { defaultPct: number; rows: Row[] }) {
  const [def, setDef] = useState(String(defaultPct));
  const [rows, setRows] = useState<Row[]>(initial);
  const [saved, setSaved] = useState(() => JSON.stringify({ def: String(defaultPct), rows: initial }));
  const [added, setAdded] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify({ def, rows }) !== saved;
  const eff = (r: Row) => r.markupPct ?? (Number(def) || 0);
  const add = () => { const m = added.trim(); if (m && !rows.some((r) => r.model === m)) setRows((xs) => [...xs, { model: m, markupPct: null, note: "", calls: 0, costUsd: 0 }]); setAdded(""); };
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await saveMarkup([{ model: "*", markupPct: Number(def) || 0 }, ...rows.map((x) => ({ model: x.model, markupPct: x.markupPct, note: x.note }))]); setMsg({ ok: r.ok, text: r.message }); if (r.ok) setSaved(JSON.stringify({ def, rows })); }); }}
      className="grid gap-4 min-w-0"
    >
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Μόνο Super Admin</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">AI markup ανά μοντέλο</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[75ch]">Χρεωμένο κόστος = κόστος OpenRouter × (1 + markup). Το markup «παγώνει» σε κάθε κλήση μαζί με την ισοτιμία USD→EUR της ημέρας (ΕΚΤ), ώστε η αναφορά να μένει σταθερή αναδρομικά. Οι διαχειριστές βλέπουν μόνο τα χρεωμένα ποσά.</p>
      </div>
      <div className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid @2xl:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] gap-3 items-center">
        <label className="grid gap-1 min-w-0">
          <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Προεπιλεγμένο markup</span>
          <span className="relative flex items-center"><input type="number" inputMode="decimal" step="1" min={0} value={def} onChange={(e) => setDef(e.target.value)} className={`${inputCls} pr-10`} /><span className="absolute right-3 text-eu-muted font-bold pointer-events-none">%</span></span>
        </label>
        <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Ισχύει για κάθε μοντέλο χωρίς δική του τιμή (και για ό,τι διαλέξει το openrouter/auto). Π.χ. 30% → κάθε $1 κόστους χρεώνεται $1,30.</p>
      </div>
      <div className="rounded-2xl bg-white border border-eu-line overflow-hidden @container">
        <table className="eu-rtable w-full border-collapse text-[length:var(--fs-14)]">
          <thead><tr className="text-left text-eu-muted"><th className="p-3 font-bold">Μοντέλο</th><th className="p-3 font-bold">Κλήσεις</th><th className="p-3 font-bold">Κόστος ($)</th><th className="p-3 font-bold">Markup (%)</th><th className="p-3 font-bold">Ισχύον</th><th className="p-3 font-bold">Σημείωση</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.model} className="border-t border-eu-line-2">
                <td className="p-3 font-mono font-bold text-eu-ink break-all">{r.model}</td>
                <td data-label="Κλήσεις" className="p-3 tabular-nums">{r.calls}</td>
                <td data-label="Κόστος ($)" className="p-3 tabular-nums">{r.costUsd.toFixed(4)}</td>
                <td data-label="Markup (%)" className="p-3"><input type="number" inputMode="decimal" step="1" min={0} value={r.markupPct ?? ""} placeholder={`${def} (προεπιλογή)`} onChange={(e) => setRows((xs) => xs.map((x, j) => (j === i ? { ...x, markupPct: e.target.value === "" ? null : Number(e.target.value) } : x)))} className={`${inputCls} min-h-11 max-w-40`} aria-label={`Markup ${r.model}`} /></td>
                <td data-label="Ισχύον" className="p-3 tabular-nums font-bold text-eu-navy">×{(1 + eff(r) / 100).toFixed(2)}</td>
                <td data-label="Σημείωση" className="p-3"><input value={r.note} onChange={(e) => setRows((xs) => xs.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} placeholder="π.χ. συμφωνία πελάτη" className={`${inputCls} min-h-11`} aria-label={`Σημείωση ${r.model}`} /></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="p-6 text-center text-eu-muted">Κανένα μοντέλο ακόμη — θα εμφανιστούν μόλις γίνουν κλήσεις, ή πρόσθεσέ τα χειροκίνητα.</td></tr>}
          </tbody>
        </table>
        <div className="grid @md:grid-cols-[minmax(0,1fr)_auto] gap-2 p-3 border-t border-eu-line bg-eu-surface/60">
          <input value={added} onChange={(e) => setAdded(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="Νέο μοντέλο, π.χ. anthropic/claude-sonnet-4.5" className={`${inputCls} min-h-11 font-mono`} aria-label="Νέο μοντέλο" />
          <button type="button" onClick={add} className="inline-flex items-center justify-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-navy hover:text-white"><Plus className="size-4" aria-hidden /> Προσθήκη μοντέλου</button>
        </div>
      </div>
      <SaveBar dirty={dirty} pending={pending} top={msg && <ResultBanner ok={msg.ok}>{msg.text}</ResultBanner>} note="Κενό markup σε μοντέλο = ισχύει το προεπιλεγμένο." />
    </form>
  );
}
