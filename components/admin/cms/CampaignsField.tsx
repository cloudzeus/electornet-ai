"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Eye, EyeOff, GripVertical, Plus, Trash2 } from "lucide-react";
import { Area, LinkField, MediaUrl, Txt } from "./brand/fields";

export type Campaign = { id: string; brand: string; title: string; text: string; cta: string; href: string; image: string; alt: string; hidden?: boolean };

/**
 * Καμπάνιες κατασκευαστών: γραμμές με μικρογραφία, σύρσιμο (ή βέλη) για σειρά, μάτι για ορατή/κρυφή (μένει αποθηκευμένη),
 * άνοιγμα για επεξεργασία (εικόνα, μάρκα, τίτλος, κείμενο, κουμπί, σύνδεσμος, alt), «Νέα καμπάνια».
 */
export function CampaignsField({ value, onChange, label, help }: { value: unknown; onChange: (l: Campaign[]) => void; label: string; help?: string }) {
  const list = ((Array.isArray(value) ? value : []) as Campaign[]).map((c) => ({ ...c }));
  const [open, setOpen] = useState<string | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const upd = (i: number, p: Partial<Campaign>) => onChange(list.map((c, k) => (k === i ? { ...c, ...p } : c)));
  const move = (from: number, to: number) => { const l = [...list]; const [x] = l.splice(from, 1); l.splice(to, 0, x); onChange(l); };
  const shown = list.filter((c) => !c.hidden).length;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{label}</span><span className="text-eu-muted text-[length:var(--fs-13)] tabular-nums">{shown} ορατές από {list.length}</span></div>
      {help && <span className="text-eu-muted text-[length:var(--fs-13)] -mt-1 leading-snug">{help}</span>}
      <ol className="m-0 p-0 list-none grid gap-1.5" onDragOver={(e) => e.preventDefault()}>
        {list.map((c, i) => {
          const key = c.id || String(i);
          const isOpen = open === key;
          return (
            <li key={key} className={`rounded-xl border ${c.hidden ? "border-eu-line bg-eu-surface/60" : "border-eu-line bg-white"} ${drag === i ? "opacity-40" : ""}`}
              onDragOver={(e) => { if (drag != null) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); if (drag != null && drag !== i) move(drag, i); setDrag(null); }}>
              <div className="flex items-center gap-1 pr-1">
                <span draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDrag(i); }} onDragEnd={() => setDrag(null)} aria-hidden title="Σύρε για αλλαγή σειράς" className="grid place-items-center w-9 self-stretch cursor-grab text-eu-muted hover:text-eu-ink"><GripVertical className="size-5" /></span>
                <span className={`h-11 w-16 shrink-0 rounded-md bg-eu-surface bg-cover bg-center ${c.hidden ? "opacity-40" : ""}`} style={c.image ? { backgroundImage: `url("${c.image.replace(/"/g, "")}")` } : undefined} aria-hidden />
                <button type="button" onClick={() => setOpen(isOpen ? null : key)} aria-expanded={isOpen} className="flex-1 min-w-0 grid text-left px-2 py-2 min-h-14">
                  <span className={`font-bold text-[length:var(--fs-15)] leading-snug truncate ${c.hidden ? "text-eu-muted line-through decoration-1" : "text-eu-ink"}`}>{c.brand || "Καμπάνια"}{c.title ? ` · ${c.title}` : ""}</span>
                  <span className="text-eu-muted text-[length:var(--fs-13)] truncate">{c.hidden ? "Κρυφή" : c.href || "χωρίς σύνδεσμο"}</span>
                </button>
                <button type="button" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label="Πιο πάνω" className="size-11 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30"><ArrowUp className="size-4" aria-hidden /></button>
                <button type="button" disabled={i === list.length - 1} onClick={() => move(i, i + 1)} aria-label="Πιο κάτω" className="size-11 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30"><ArrowDown className="size-4" aria-hidden /></button>
                <button type="button" onClick={() => upd(i, { hidden: c.hidden ? undefined : true })} aria-pressed={!c.hidden} aria-label={c.hidden ? `Εμφάνιση: ${c.brand} ${c.title}` : `Απόκρυψη: ${c.brand} ${c.title}`} title={c.hidden ? "Κρυφή — πάτα για εμφάνιση" : "Ορατή — πάτα για απόκρυψη"} className="size-11 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface">{c.hidden ? <EyeOff className="size-5 text-eu-muted" aria-hidden /> : <Eye className="size-5" aria-hidden />}</button>
                <ChevronDown className={`size-5 shrink-0 mx-1 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden />
              </div>
              {isOpen && (
                <div className="grid gap-3 border-t border-eu-line p-3">
                  <MediaUrl label="Εικόνα (key visual)" value={c.image} onChange={(v) => upd(i, { image: v })} help="Οριζόντια εικόνα της καμπάνιας, από τα Media ή τα προϊόντα." />
                  <Txt label="Μάρκα" value={c.brand} onChange={(v) => upd(i, { brand: v })} max={30} />
                  <Txt label="Τίτλος" value={c.title} onChange={(v) => upd(i, { title: v })} max={60} />
                  <Area label="Κείμενο" value={c.text} onChange={(v) => upd(i, { text: v })} max={160} rows={2} />
                  <Txt label="Κουμπί" value={c.cta} onChange={(v) => upd(i, { cta: v })} max={40} />
                  <LinkField label="Σύνδεσμος" value={c.href} onChange={(v) => upd(i, { href: v })} />
                  <Txt label="Περιγραφή εικόνας (alt)" value={c.alt} onChange={(v) => upd(i, { alt: v })} max={120} help="Για προσβασιμότητα και Google." />
                  <button type="button" onClick={() => { if (window.confirm("Οριστική διαγραφή της καμπάνιας; (Για να μη φαίνεται χωρίς να χαθεί, πάτα το μάτι.)")) { onChange(list.filter((_, k) => k !== i)); setOpen(null); } }} className="justify-self-end inline-flex items-center gap-1.5 rounded-full px-3 min-h-11 text-eu-red font-bold text-[length:var(--fs-14)] hover:bg-eu-red/10"><Trash2 className="size-4" aria-hidden /> Διαγραφή</button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <button type="button" onClick={() => { const id = `c-${Date.now().toString(36)}`; onChange([...list, { id, brand: "", title: "", text: "", cta: "Δες περισσότερα", href: "/prosfores", image: "", alt: "" }]); setOpen(id); }} className="justify-self-start inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-navy hover:text-white"><Plus className="size-4" aria-hidden /> Νέα καμπάνια</button>
    </div>
  );
}
