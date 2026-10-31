"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Loader2, Save } from "lucide-react";
import { availMapValues, saveAvailMapAction } from "@/app/admin/(shell)/catalog/templates/xml/actions";
import { AVAIL_STATES } from "@/lib/catalog/availability-core";
import type { AvailValue } from "@/lib/catalog/xml-import/avail-map";

const btn = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-14)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";
const field = "min-w-0 rounded-lg border border-eu-line bg-white px-3 min-h-11 md:min-h-9 text-[length:var(--fs-14)] focus-visible:outline-2 focus-visible:outline-eu-blue";

/**
 * Βήμα ①: οι τιμές διαθεσιμότητας του XML (π.χ. «Διαθέσιμο», «Μη Διαθέσιμο», «Μικρό Απόθεμα») → κατάσταση. Η φράση της
 * βιτρίνας και το αν δημοσιεύεται ορίζονται στους κανόνες διαθεσιμότητας, με συνθήκη «Διαθεσιμότητα προμηθευτή».
 */
export function AvailMapPanel({ feedId, disabled, onSaved }: { feedId: string; disabled: boolean; onSaved: (note: string) => void }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ header: string | null; values: AvailValue[] } | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setOpen((o) => !o);
    if (data) return;
    setBusy(true); setErr(null);
    const r = await availMapValues(feedId);
    setBusy(false);
    if ("error" in r) return setErr(r.error);
    setData(r);
    setMap(Object.fromEntries(r.values.map((v) => [v.value, v.state ?? ""])));
  };
  const save = async () => {
    setBusy(true); setErr(null);
    const r = await saveAvailMapAction(feedId, map);
    setBusy(false);
    if ("error" in r) return setErr(r.error);
    onSaved(`Η διαθεσιμότητα του προμηθευτή αποθηκεύτηκε · ${r.products.toLocaleString("el-GR")} προϊόντα ενημερώθηκαν στο eshop.`);
  };

  return (
    <div data-help="xml.supplier.avail" className="grid gap-2 rounded-lg bg-eu-surface p-2.5 min-w-0">
      <button type="button" onClick={load} aria-expanded={open} className="flex items-center justify-between gap-2 min-h-11 md:min-h-9 font-bold text-eu-ink text-[length:var(--fs-14)] text-left cursor-pointer">
        Διαθεσιμότητα προμηθευτή {busy && !data ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />}
      </button>
      {open && data && (
        !data.header ? (
          <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Το feed δεν έχει στήλη «Διαθεσιμότητα προμηθευτή». Όρισέ την με «Αλλαγή αντιστοίχισης» → στήλες.</p>
        ) : (
          <>
            <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Στήλη <b>{data.header}</b>. Κάθε τιμή του XML → κατάσταση. Η φράση στη βιτρίνα και αν δημοσιεύεται ορίζονται στους <Link href="/admin/catalog/availability" className="text-eu-blue font-bold hover:underline">κανόνες διαθεσιμότητας</Link>. Δεν γράφεται στο SoftOne.</p>
            <ul className="m-0 p-0 list-none grid gap-1.5 min-w-0">
              {data.values.map((v) => (
                <li key={v.value} className="flex flex-wrap items-center gap-2 min-w-0">
                  <span className="flex-1 basis-[10rem] min-w-0 font-bold text-eu-ink text-[length:var(--fs-14)] [overflow-wrap:anywhere]">{v.value} <span className="font-normal text-eu-muted tabular-nums">· {v.items.toLocaleString("el-GR")}</span></span>
                  <label className="min-w-0">
                    <span className="sr-only">Κατάσταση για «{v.value}»</span>
                    <select value={map[v.value] ?? ""} disabled={disabled || busy} className={field} onChange={(e) => setMap((m) => ({ ...m, [v.value]: e.target.value }))}>
                      <option value="">— Χωρίς κατάσταση —</option>
                      {AVAIL_STATES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </label>
                  {v.guessed && v.state && <span className="text-eu-muted text-[length:var(--fs-12)]">πρόταση</span>}
                </li>
              ))}
              {!data.values.length && <li className="text-eu-muted text-[length:var(--fs-13)]">Καμία τιμή στα φορτωμένα προϊόντα — τρέξε πρώτα το feed.</li>}
            </ul>
            <div>
              <button type="button" onClick={save} disabled={disabled || busy || !data.values.length} className={`${btn} border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`}>
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />} Αποθήκευση & εφαρμογή στο eshop
              </button>
            </div>
          </>
        )
      )}
      {err && <span role="alert" className="text-eu-red font-bold text-[length:var(--fs-13)]">{err}</span>}
    </div>
  );
}
