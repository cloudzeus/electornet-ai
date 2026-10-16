"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { soldAloneAction, soldAlonePreview } from "@/app/admin/(shell)/catalog/actions";

type Mode = "auto" | "yes" | "no";
const MODES: { v: Mode; label: string; hint: string }[] = [
  { v: "auto", label: "Αυτόματα", hint: "Κύριο είδος σε σετ εξαρτημάτων (π.χ. εσωτερική μονάδα κλιματιστικού) → μόνο μέσα στο σετ· όλα τα άλλα πωλούνται και μόνα τους." },
  { v: "yes", label: "Ναι", hint: "Πωλείται και μόνο του: εμφανίζεται στις λίστες και στην αναζήτηση, με «Διαθέσιμο και σε σετ» στη σελίδα του." },
  { v: "no", label: "Όχι", hint: "Μόνο μέσα σε σετ: φεύγει από λίστες, αναζήτηση και προσφορές· η σελίδα του οδηγεί στο σετ." },
];
type Preview = { ids: string[]; items: number; sets: number; changed: number; hide: number; show: number };
const n = (v: number) => v.toLocaleString("el-GR");

/**
 * Μαζική ενέργεια του καταλόγου: «Πωλείται και μόνο του» για τα επιλεγμένα είδη. Πρώτα προεπισκόπηση (πόσα αλλάζουν,
 * πόσα κρύβονται από τις λίστες) και μετά επιβεβαίωση. Τα προϊόντα-σετ δεν έχουν αυτή τη ρύθμιση και αγνοούνται.
 */
export function SoldAloneBulk() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("auto");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const selected = () => [...new Set([...document.querySelectorAll<HTMLInputElement>('input[name="products"]:checked')].map((i) => i.value))];

  const check = () => start(async () => {
    setMsg(null);
    const ids = selected();
    if (!ids.length) { setPreview(null); setMsg("Επίλεξε πρώτα προϊόντα από τη λίστα (κουτάκι αριστερά)."); return; }
    const r = await soldAlonePreview(ids, mode);
    if (!r.ok) { setMsg(r.error); return; }
    if (!r.items) { setPreview(null); setMsg("Τα επιλεγμένα είναι όλα σετ — η ρύθμιση αφορά μόνο είδη."); return; }
    setPreview({ ids, ...r });
  });
  const apply = () => start(async () => {
    if (!preview) return;
    const r = await soldAloneAction(preview.ids, mode);
    setPreview(null);
    if (!r.ok) { setMsg(r.error); return; }
    document.querySelectorAll<HTMLInputElement>('input[name="products"]:checked').forEach((i) => { i.checked = false; });
    setMsg(`Έγινε: ${n(r.changed)} ${r.changed === 1 ? "είδος άλλαξε" : "είδη άλλαξαν"}${r.hide ? ` · ${n(r.hide)} κρύφτηκαν από τις λίστες` : ""}${r.show ? ` · ${n(r.show)} εμφανίζονται ξανά` : ""}.`);
    router.refresh();
  });
  const hint = MODES.find((m) => m.v === mode)!.hint;

  return (
    <section data-help="catalog.sold-alone" aria-label="Πωλείται και μόνο του" className="grid gap-1.5 rounded-lg border border-eu-line bg-white px-2.5 py-2 text-[length:var(--fs-13)]">
      <div className="flex flex-wrap items-center gap-1.5">
        <label htmlFor="sold-alone-mode" className="font-bold text-eu-navy">«Πωλείται και μόνο του» στα επιλεγμένα</label>
        <select id="sold-alone-mode" value={mode} onChange={(e) => { setMode(e.target.value as Mode); setPreview(null); }} aria-describedby="sold-alone-hint" className="rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9">
          {MODES.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
        </select>
        <button type="button" onClick={check} disabled={pending} className="inline-flex items-center gap-1.5 rounded-full border border-eu-navy text-eu-navy px-3 min-h-11 md:min-h-9 font-bold cursor-pointer hover:bg-eu-chip disabled:opacity-50">
          {pending && !preview ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} Εφαρμογή…
        </button>
      </div>
      <p id="sold-alone-hint" className="m-0 text-eu-ink-3 text-[length:var(--fs-12)]">{hint}</p>
      {preview && (
        <div role="alertdialog" aria-labelledby="sold-alone-q" className="grid gap-2 rounded-lg bg-eu-chip/60 p-2.5">
          <p id="sold-alone-q" className="m-0 text-eu-ink">
            <b>{preview.changed ? `Αλλάζουν ${n(preview.changed)} από ${n(preview.items)} ${preview.items === 1 ? "είδος" : "είδη"}` : `Κανένα από τα ${n(preview.items)} δεν αλλάζει ρύθμιση`}</b>
            {preview.hide ? <> · <b className="text-eu-red">{n(preview.hide)} θα κρυφτούν</b> από λίστες, αναζήτηση και προσφορές</> : null}
            {preview.show ? <> · <b className="text-eu-green">{n(preview.show)} θα εμφανιστούν</b> στις λίστες</> : null}
            {preview.sets ? <> · {n(preview.sets)} σετ αγνοούνται</> : null}.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={apply} disabled={pending || !preview.changed} autoFocus className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-4 min-h-11 md:min-h-9 font-bold cursor-pointer hover:bg-eu-blue disabled:opacity-50">
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} Επιβεβαίωση
            </button>
            <button type="button" onClick={() => setPreview(null)} disabled={pending} className="rounded-full border border-eu-line px-4 min-h-11 md:min-h-9 font-bold text-eu-ink-2 cursor-pointer hover:border-eu-navy">Άκυρο</button>
          </div>
        </div>
      )}
      <p role="status" aria-live="polite" className="m-0 empty:hidden text-eu-ink-2 font-semibold">{msg}</p>
    </section>
  );
}
