"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Upload, AlertTriangle, Check } from "lucide-react";
import { createSpecialPriceAction, previewPricesAction, type PriceRow } from "@/app/admin/(shell)/prosfores/actions";

const input = "w-full rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] bg-white focus-visible:border-eu-blue outline-none";
const eur = (c: number | null) => (c == null ? "—" : `${(c / 100).toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);

/** Ανέβασμα → προεπισκόπηση → πρόχειρη προσφορά ειδικής τιμής. */
export function ExcelImport() {
  const router = useRouter();
  const [rows, setRows] = useState<PriceRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [meta, setMeta] = useState({ name: "", startsAt: "", endsAt: "" });
  const [busy, start] = useTransition();
  const ok = (rows ?? []).filter((r) => r.productId && r.price && (!r.issue || r.issue.startsWith("έκπτωση")));
  const preview = (form: FormData) => start(async () => { setErr(null); const r = await previewPricesAction(form); if (!r.ok) { setErr(r.error); setRows(null); } else setRows(r.rows); });
  const create = () => start(async () => {
    const r = await createSpecialPriceAction({ name: meta.name, startsAt: meta.startsAt ? new Date(meta.startsAt).toISOString() : null, endsAt: meta.endsAt ? new Date(meta.endsAt).toISOString() : null, prices: Object.fromEntries(ok.map((x) => [x.productId!, x.price!])) });
    if (!r.ok) return setErr(r.error);
    router.push(`/admin/prosfores/${r.id}?step=4`);
  });
  return (
    <div className="grid gap-4">
      <form action={preview} className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid gap-3">
        <label className="grid gap-1 text-[length:var(--fs-14)] font-bold text-eu-ink-2"><span>Αρχείο .xlsx ή .csv</span><input type="file" name="file" accept=".xlsx,.csv,.txt" className="text-[length:var(--fs-14)] min-h-11" /></label>
        <label className="grid gap-1 text-[length:var(--fs-14)] font-bold text-eu-ink-2"><span>ή επικόλληση από Excel</span><textarea name="paste" rows={5} className={`${input} py-2 font-mono text-[length:var(--fs-14)]`} placeholder={"Κωδικός\tΤιμή\nLG-OLED55C4\t1199\n8806098..."} /></label>
        <button type="submit" disabled={busy} className="justify-self-start inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-5 min-h-11 font-bold text-[length:var(--fs-14)] disabled:opacity-40"><Upload className="size-4" aria-hidden /> {busy ? "Ανάγνωση…" : "Προεπισκόπηση"}</button>
        {err && <p role="alert" className="m-0 rounded-xl bg-eu-red/10 text-eu-red font-semibold px-3 py-2 text-[length:var(--fs-14)]">{err}</p>}
      </form>
      {rows && (
        <section className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid gap-3">
          <div className="flex flex-wrap gap-4 text-[length:var(--fs-14)] font-bold"><span className="text-eu-green inline-flex items-center gap-1"><Check className="size-4" aria-hidden /> {ok.length} έγκυρες</span><span className="text-eu-amber inline-flex items-center gap-1"><AlertTriangle className="size-4" aria-hidden /> {rows.length - ok.length} με πρόβλημα (δεν μπαίνουν)</span></div>
          <div className="max-h-[480px] overflow-y-auto overflow-x-hidden rounded-xl border border-eu-line">
            <table className="eu-rtable w-full text-[length:var(--fs-14)]">
              <thead className="sticky top-0 bg-white text-left text-eu-muted text-[length:var(--fs-13)]"><tr><th className="py-2 px-3">Κωδικός</th><th className="py-2 px-3">Προϊόν</th><th className="py-2 px-3 text-right">Τρέχουσα</th><th className="py-2 px-3 text-right">Νέα</th><th className="py-2 px-3 text-right">%</th><th className="py-2 px-3">Έλεγχος</th></tr></thead>
              <tbody>
                {rows.map((r, i) => <tr key={i} className={`border-t border-eu-line ${r.issue && !r.issue.startsWith("έκπτωση") ? "bg-eu-red/5" : ""}`}><td className="py-1.5 px-3 font-mono">{r.input}</td><td data-label="Προϊόν" className="py-1.5 px-3">{r.title ?? "—"}</td><td data-label="Τρέχουσα" className="py-1.5 px-3 text-right tabular-nums">{eur(r.list)}</td><td data-label="Νέα" className="py-1.5 px-3 text-right tabular-nums font-bold">{eur(r.price)}</td><td data-label="Έκπτωση" className="py-1.5 px-3 text-right tabular-nums">{r.pct != null ? `−${r.pct} %` : "—"}</td><td data-label="Έλεγχος" className={`py-1.5 px-3 ${r.issue ? (r.issue.startsWith("έκπτωση") ? "text-eu-amber" : "text-eu-red") : "text-eu-green"} font-semibold`}>{r.issue ?? "εντάξει"}</td></tr>)}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-1 @xl:grid-cols-3 gap-3">
            <label className="grid gap-1 text-[length:var(--fs-14)] font-bold text-eu-ink-2"><span>Όνομα προσφοράς</span><input className={input} value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} placeholder="π.χ. Φυλλάδιο Νοεμβρίου" /></label>
            <label className="grid gap-1 text-[length:var(--fs-14)] font-bold text-eu-ink-2"><span>Έναρξη</span><input type="datetime-local" className={input} value={meta.startsAt} onChange={(e) => setMeta({ ...meta, startsAt: e.target.value })} /></label>
            <label className="grid gap-1 text-[length:var(--fs-14)] font-bold text-eu-ink-2"><span>Λήξη</span><input type="datetime-local" className={input} value={meta.endsAt} onChange={(e) => setMeta({ ...meta, endsAt: e.target.value })} /></label>
          </div>
          <button type="button" disabled={busy || !ok.length} onClick={create} className="justify-self-start rounded-full bg-eu-yellow text-eu-navy px-6 min-h-11 font-extrabold text-[length:var(--fs-15)] hover:bg-eu-yellow-dark disabled:opacity-40">Δημιουργία πρόχειρης προσφοράς ({ok.length})</button>
        </section>
      )}
    </div>
  );
}
