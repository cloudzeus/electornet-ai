"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { tickerItems, type TickerItem } from "@/lib/cms/home-sections";

/**
 * Μηνύματα του κίτρινου ticker: σύρσιμο (ή βέλη) για σειρά, διακόπτης ενεργό/ανενεργό, μεγάλο πεδίο κειμένου ανά
 * μήνυμα με μετρητή χαρακτήρων, αφαίρεση και «Νέο μήνυμα».
 */
export function TickerItemsField({ value, onChange, label, help, max = 12 }: { value: unknown; onChange: (items: TickerItem[]) => void; label: string; help?: string; max?: number }) {
  // τα κενά μηνύματα (μόλις προστέθηκαν) κρατιούνται στη φόρμα· στη βιτρίνα αγνοούνται
  const items: TickerItem[] = Array.isArray(value) ? (value as unknown[]).map((x) => (typeof x === "string" ? { text: x } : { text: String((x as TickerItem)?.text ?? ""), off: (x as TickerItem)?.off })) : tickerItems(value);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const put = (l: TickerItem[]) => onChange(l.map((x) => (x.off ? x : { text: x.text })));
  const upd = (i: number, p: Partial<TickerItem>) => put(items.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const move = (from: number, to: number) => { const l = [...items]; const [x] = l.splice(from, 1); l.splice(to, 0, x); put(l); };
  const live = items.filter((x) => !x.off && x.text.trim()).length;
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-2"><span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{label}</span><span className="text-eu-muted text-[length:var(--fs-13)] tabular-nums">{live} ενεργά από {items.length}</span></div>
      {help && <span className="text-eu-muted text-[length:var(--fs-13)] leading-snug -mt-1">{help}</span>}
      <ol className="m-0 p-0 list-none grid gap-2" onDragOver={(e) => e.preventDefault()}>
        {items.map((it, i) => {
          const len = it.text.length;
          return (
            <li key={i} className={`relative rounded-xl border-2 ${it.off ? "border-eu-line bg-eu-surface/70" : "border-eu-yellow bg-white"} ${drag === i ? "opacity-40" : ""}`}
              onDragOver={(e) => { if (drag == null) return; e.preventDefault(); setOver(i); }}
              onDrop={(e) => { e.preventDefault(); if (drag != null && drag !== i) move(drag, i); setDrag(null); setOver(null); }}>
              {over === i && drag != null && drag !== i && <span aria-hidden className="absolute -top-1.5 inset-x-0 h-1 rounded-full bg-eu-blue" />}
              <div className="flex items-center gap-1 px-1 pt-1">
                <span draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDrag(i); }} onDragEnd={() => { setDrag(null); setOver(null); }} aria-hidden title="Σύρε για αλλαγή σειράς" className="grid place-items-center size-11 cursor-grab text-eu-muted hover:text-eu-ink"><GripVertical className="size-5" /></span>
                <span className="font-extrabold text-eu-muted text-[length:var(--fs-13)] tabular-nums w-5">{i + 1}</span>
                <label className="inline-flex items-center gap-2 min-h-11 cursor-pointer select-none">
                  <input type="checkbox" role="switch" checked={!it.off} onChange={(e) => upd(i, { off: e.target.checked ? undefined : true })} className="sr-only peer" />
                  <span aria-hidden className="relative w-11 h-6 rounded-full bg-eu-line peer-checked:bg-eu-green transition-colors after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-eu-blue" />
                  <span className={`font-bold text-[length:var(--fs-14)] ${it.off ? "text-eu-muted" : "text-eu-green"}`}>{it.off ? "Ανενεργό" : "Ενεργό"}</span>
                </label>
                <span className="ml-auto flex">
                  <button type="button" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label="Πιο πάνω" className="size-11 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30"><ArrowUp className="size-4" aria-hidden /></button>
                  <button type="button" disabled={i === items.length - 1} onClick={() => move(i, i + 1)} aria-label="Πιο κάτω" className="size-11 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30"><ArrowDown className="size-4" aria-hidden /></button>
                  <button type="button" onClick={() => { if (!it.text.trim() || window.confirm("Διαγραφή του μηνύματος; (Για να μη φαίνεται χωρίς να χαθεί, κλείσε τον διακόπτη.)")) put(items.filter((_, k) => k !== i)); }} aria-label="Διαγραφή μηνύματος" className="size-11 grid place-items-center rounded-full text-eu-red hover:bg-eu-red/10"><Trash2 className="size-4" aria-hidden /></button>
                </span>
              </div>
              <label className="grid gap-1 px-3 pb-3">
                <span className="sr-only">Μήνυμα {i + 1}</span>
                <textarea value={it.text} onChange={(e) => upd(i, { text: e.target.value.replace(/\n/g, " ") })} rows={2} maxLength={120} placeholder="π.χ. Δωρεάν μεταφορά συσκευών εντός περιφέρειας"
                  className={`w-full resize-y rounded-lg border border-eu-line px-3 py-2 text-[length:var(--fs-16)] leading-snug bg-white ${it.off ? "text-eu-muted" : "text-eu-ink"}`} />
                <span className={`justify-self-end text-[length:var(--fs-13)] tabular-nums ${len > 60 ? "text-eu-amber font-bold" : "text-eu-muted"}`}>{len}/120{len > 60 ? " · μεγάλο για ticker — προτείνεται έως 60" : ""}</span>
              </label>
            </li>
          );
        })}
      </ol>
      {items.length < max && <button type="button" onClick={() => put([...items, { text: "" }])} className="justify-self-start inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-navy hover:text-white"><Plus className="size-4" aria-hidden /> Νέο μήνυμα</button>}
    </div>
  );
}
