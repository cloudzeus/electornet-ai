"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, Download, Loader2, RefreshCw, Square, Sticker, Zap, X } from "lucide-react";
import { bulkStickerAction, matchEprelAction, pullFromSoftone } from "@/app/admin/(shell)/catalog/actions";
import type { ProductRow } from "./ProductTable";

type Act = "pull" | "eprel" | "sticker-add" | "sticker-remove" | "csv";
const ACTS: { v: Act; label: string; hint: string; write: boolean }[] = [
  { v: "csv", label: "Εξαγωγή σε Excel (CSV)", hint: "Κατεβάζει τα επιλεγμένα με κωδικούς, τιμή, προσφορά, απόθεμα, πωλήσεις και πληρότητα. Δεν αλλάζει τίποτα.", write: false },
  { v: "pull", label: "Ενημέρωση από SoftOne", hint: "Διαβάζει κάθε είδος από το SoftOne (μόνο ανάγνωση) και ενημερώνει το eshop αμέσως. Δεν γράφει τίποτα στο SoftOne.", write: true },
  { v: "eprel", label: "Αναζήτηση στο EPREL", hint: "Ψάχνει ενεργειακή ετικέτα, χαρακτηριστικά και διαστάσεις στο EPREL για κάθε επιλεγμένο. Αλλάζει μόνο το eshop.", write: true },
  { v: "sticker-add", label: "Προσθήκη sticker", hint: "Το sticker μπαίνει σε όλα τα επιλεγμένα, χωρίς ημερομηνίες. Μόνο στο eshop.", write: true },
  { v: "sticker-remove", label: "Αφαίρεση sticker", hint: "Το sticker φεύγει από όσα επιλεγμένα το έχουν χειροκίνητα. Μόνο στο eshop.", write: true },
];
type Result = { done: number; total: number; ok: number; same: number; fail: number; errors: string[]; label: string; running: boolean };
const n = (v: number) => v.toLocaleString("el-GR");
const boxes = () => [...document.querySelectorAll<HTMLInputElement>('input[name="products"]')];
const selectedIds = () => [...new Set(boxes().filter((i) => i.checked).map((i) => i.value))];

/** CSV με «;» και BOM ώστε να ανοίγει σωστά στο ελληνικό Excel. */
function downloadCsv(rows: ProductRow[]) {
  const head = ["MTRL", "Κωδικός", "Barcode", "Τίτλος", "Μάρκα", "Κατηγορία", "Τιμή", "Τιμή προσφοράς", "Απόθεμα", "Πωλήσεις", "Φωτογραφίες", "Χαρακτηριστικά", "Ενεργειακή", "Κατάσταση", "Τελευταία αλλαγή"];
  const money = (v: number | null) => (v == null ? "" : v.toFixed(2).replace(".", ","));
  const cell = (v: unknown) => { const s = String(v ?? ""); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = rows.map((r) => [r.erpCode, r.sku, r.ean, r.title, r.brand, r.categoryPath.join(" › ") || r.category, money(r.price), money(r.offer), r.stock, r.sold, r.photos, r.specs, r.energy?.cls ?? "", r.active ? "ενεργό" : "ανενεργό", r.updated.slice(0, 10)].map(cell).join(";"));
  const blob = new Blob(["﻿" + [head.join(";"), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `proionta-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click(); URL.revokeObjectURL(a.href);
}

/**
 * Μαζικές ενέργειες στα επιλεγμένα της σελίδας (κουτάκια της λίστας): επιλογή όλων, εξαγωγή, ενημέρωση από SoftOne,
 * EPREL και stickers. Κάθε ενέργεια που αλλάζει κάτι ζητά επιβεβαίωση και δείχνει πρόοδο και αποτέλεσμα σε μπάρα.
 */
export function CatalogBulk({ rows, stickers, canWrite }: { rows: ProductRow[]; stickers: { id: string; name: string }[]; canWrite: boolean }) {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [act, setAct] = useState<Act>("csv");
  const [sticker, setSticker] = useState(stickers[0]?.id ?? "");
  const [ask, setAsk] = useState<string[] | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const stop = useRef(false);
  const acts = ACTS.filter((a) => canWrite || !a.write);
  const cur = acts.find((a) => a.v === act) ?? acts[0];

  useEffect(() => {
    const recount = () => setCount(selectedIds().length);
    recount();
    document.addEventListener("change", recount);
    return () => document.removeEventListener("change", recount);
  }, [rows]);

  const all = (on: boolean) => { boxes().forEach((i) => { i.checked = on; }); setCount(on ? new Set(boxes().map((i) => i.value)).size : 0); };
  const run = (ids: string[]) => start(async () => {
    setAsk(null); stop.current = false;
    const r: Result = { done: 0, total: ids.length, ok: 0, same: 0, fail: 0, errors: [], label: cur.label, running: true };
    const title = (id: string) => rows.find((x) => x.id === id)?.title ?? id;
    setRes({ ...r });
    if (cur.v === "sticker-add" || cur.v === "sticker-remove") {
      const x = await bulkStickerAction(ids, sticker, cur.v === "sticker-remove").catch((e: Error) => ({ ok: false as const, error: e.message }));
      if (x.ok) Object.assign(r, { done: ids.length, ok: x.changed, same: ids.length - x.changed });
      else Object.assign(r, { done: ids.length, fail: ids.length, errors: [x.error] });
    } else {
      for (const id of ids) {
        if (stop.current) break;
        try {
          if (cur.v === "pull") {
            const x = await pullFromSoftone(id);
            if (!x.ok) { r.fail++; r.errors.push(`${title(id)}: ${x.message}`); } else if (x.message.startsWith("Ήδη")) r.same++; else r.ok++;
          } else {
            const x = await matchEprelAction(id);
            if (!x.ok) { r.fail++; r.errors.push(`${title(id)}: ${x.error}`); } else if (x.status === "matched") r.ok++; else r.same++;
          }
        } catch (e) { r.fail++; r.errors.push(`${title(id)}: ${(e as Error).message}`); }
        r.done++; setRes({ ...r });
      }
    }
    setRes({ ...r, running: false });
    router.refresh();
  });
  const go = () => {
    const ids = selectedIds();
    if (!ids.length) return setRes({ done: 0, total: 0, ok: 0, same: 0, fail: 0, errors: ["Επίλεξε πρώτα προϊόντα (κουτάκι αριστερά ή «Όλα της σελίδας»)."], label: cur.label, running: false });
    if (cur.v === "csv") return downloadCsv(rows.filter((r) => ids.includes(r.id)));
    setRes(null); setAsk(ids);
  };
  const okWord = cur.v === "eprel" ? "βρέθηκαν" : cur.v === "pull" ? "ενημερώθηκαν" : "άλλαξαν";
  const sameWord = cur.v === "eprel" ? "δεν βρέθηκαν / πολλά μοντέλα" : cur.v === "pull" ? "ήδη ενημερωμένα" : "ήδη είχαν / δεν είχαν";
  const pct = (v: number) => `${res && res.total ? (v / res.total) * 100 : 0}%`;

  return (
    <section data-help="catalog.bulk" aria-label="Μαζικές ενέργειες" className="grid gap-1.5 rounded-lg border border-eu-line bg-white px-2.5 py-2 text-[length:var(--fs-13)]">
      <div className="flex flex-wrap items-center gap-1.5">
        <b className={`inline-flex items-center gap-1.5 rounded-full px-2.5 min-h-8 tabular-nums ${count ? "bg-eu-navy text-white" : "bg-eu-surface text-eu-ink-3"}`} aria-live="polite">{count ? `${n(count)} επιλεγμένα` : "Κανένα επιλεγμένο"}</b>
        <button type="button" onClick={() => all(true)} className="inline-flex items-center gap-1 rounded-full border border-eu-line px-2.5 min-h-11 md:min-h-9 font-bold text-eu-ink-2 cursor-pointer hover:border-eu-navy transition-colors"><CheckSquare className="size-4" aria-hidden />Όλα της σελίδας</button>
        {count > 0 && <button type="button" onClick={() => all(false)} className="inline-flex items-center gap-1 rounded-full border border-eu-line px-2.5 min-h-11 md:min-h-9 font-bold text-eu-ink-2 cursor-pointer hover:border-eu-navy transition-colors"><Square className="size-4" aria-hidden />Καμία επιλογή</button>}
        <span className="hidden @xl:block w-px self-stretch bg-eu-line-2 mx-1" aria-hidden />
        <label htmlFor="bulk-act" className="font-bold text-eu-navy">Ενέργεια</label>
        <select id="bulk-act" value={cur.v} onChange={(e) => { setAct(e.target.value as Act); setAsk(null); }} aria-describedby="bulk-hint" className="flex-1 @md:flex-none min-w-0 rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9">
          {acts.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}
        </select>
        {(cur.v === "sticker-add" || cur.v === "sticker-remove") && (
          <><label htmlFor="bulk-st" className="sr-only">Sticker</label>
            <select id="bulk-st" value={sticker} onChange={(e) => setSticker(e.target.value)} className="flex-1 @md:flex-none min-w-0 rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9">{stickers.length ? stickers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>) : <option value="">Δεν υπάρχουν stickers</option>}</select></>
        )}
        <button type="button" onClick={go} disabled={pending || ((cur.v === "sticker-add" || cur.v === "sticker-remove") && !sticker)} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-4 min-h-11 md:min-h-9 font-bold cursor-pointer hover:bg-eu-blue transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : cur.v === "csv" ? <Download className="size-4" aria-hidden /> : cur.v === "pull" ? <RefreshCw className="size-4" aria-hidden /> : cur.v === "eprel" ? <Zap className="size-4" aria-hidden /> : <Sticker className="size-4" aria-hidden />}
          {cur.v === "csv" ? "Λήψη" : "Εκτέλεση…"}
        </button>
      </div>
      <p id="bulk-hint" className="m-0 text-eu-ink-3 text-[length:var(--fs-12)]">{cur.hint}</p>

      {ask && (
        <div role="alertdialog" aria-labelledby="bulk-q" className="flex flex-wrap items-center gap-2 rounded-lg bg-eu-chip/60 p-2.5">
          <p id="bulk-q" className="m-0 text-eu-ink flex-1 min-w-[14rem]"><b>{cur.label}</b> σε <b>{n(ask.length)} {ask.length === 1 ? "προϊόν" : "προϊόντα"}</b>{cur.v === "sticker-add" || cur.v === "sticker-remove" ? <> · sticker «{stickers.find((s) => s.id === sticker)?.name}»</> : <> · περίπου {Math.max(1, Math.round(ask.length * (cur.v === "pull" ? 6 : 3) / 60))}′, ένα-ένα</>}</p>
          <button type="button" onClick={() => run(ask)} autoFocus className="rounded-full bg-eu-navy text-white px-4 min-h-11 md:min-h-9 font-bold cursor-pointer hover:bg-eu-blue transition-colors">Επιβεβαίωση</button>
          <button type="button" onClick={() => setAsk(null)} className="rounded-full border border-eu-line px-4 min-h-11 md:min-h-9 font-bold text-eu-ink-2 cursor-pointer hover:border-eu-navy">Άκυρο</button>
        </div>
      )}

      {res && (
        <div role="status" aria-live="polite" className="grid gap-1.5 rounded-lg bg-eu-surface/60 p-2.5">
          {res.total > 0 && (
            <>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <b className="text-eu-ink">{res.label}: {res.running ? `${n(res.done)} από ${n(res.total)}…` : `ολοκληρώθηκε (${n(res.done)} από ${n(res.total)})`}</b>
                <span className="inline-flex items-center gap-1 text-eu-ink-2"><i className="size-2.5 rounded-sm bg-eu-green" aria-hidden />{n(res.ok)} {okWord}</span>
                <span className="inline-flex items-center gap-1 text-eu-ink-2"><i className="size-2.5 rounded-sm bg-eu-ink-3/40" aria-hidden />{n(res.same)} {sameWord}</span>
                <span className="inline-flex items-center gap-1 text-eu-ink-2"><i className="size-2.5 rounded-sm bg-eu-red" aria-hidden />{n(res.fail)} απέτυχαν</span>
                {res.running && <button type="button" onClick={() => { stop.current = true; }} className="ml-auto inline-flex items-center gap-1 rounded-full border border-eu-line px-2.5 min-h-9 font-bold text-eu-red cursor-pointer hover:border-eu-red"><X className="size-3.5" aria-hidden />Διακοπή</button>}
              </div>
              <div className="flex h-2 rounded-full bg-eu-line-2 overflow-hidden" role="img" aria-label={`${res.ok} ${okWord}, ${res.same} ${sameWord}, ${res.fail} απέτυχαν, από ${res.total}`}>
                <span className="bg-eu-green transition-[width] duration-200" style={{ width: pct(res.ok) }} />
                <span className="bg-eu-ink-3/40 transition-[width] duration-200" style={{ width: pct(res.same) }} />
                <span className="bg-eu-red transition-[width] duration-200" style={{ width: pct(res.fail) }} />
              </div>
            </>
          )}
          {res.errors.length > 0 && <ul className="m-0 pl-4 grid gap-0.5 text-eu-red text-[length:var(--fs-12)] max-h-32 overflow-y-auto">{res.errors.slice(0, 50).map((e, i) => <li key={i}>{e}</li>)}</ul>}
          {!res.running && res.total > 0 && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-12)]">{res.fail ? "Η επιλογή μένει, οπότε μπορείς να το ξανατρέξεις για όσα απέτυχαν." : "Η λίστα ανανεώθηκε με τα νέα στοιχεία."}</p>}
        </div>
      )}
    </section>
  );
}
