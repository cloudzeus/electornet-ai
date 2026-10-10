"use client";

import { createContext, useContext, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical } from "lucide-react";
import type { OrderCell } from "@/lib/cms/home-sections";

export type OrderOption = { key: string; title: string; subtitle?: string; image?: string | null };
/** Οι επιλογές κάθε λίστας της αρχικής (π.χ. έξυπνοι οδηγοί, άρθρα) + ποια είναι ορατά χωρίς επιλογή. */
export const HomeLists = createContext<Record<string, { options: OrderOption[]; defaults: string[] }>>({});

/** Γενική λίστα με σύρσιμο (ή βέλη) για σειρά και μάτι για ορατό/κρυφό· τα νέα στοιχεία μπαίνουν κρυφά στο τέλος. */
export function OrderToggleField({ source, value, onChange, label }: { source: string; value: unknown; onChange: (cells: OrderCell[]) => void; label: string }) {
  const src = useContext(HomeLists)[source] ?? { options: [], defaults: [] };
  const by = new Map(src.options.map((o) => [o.key, o]));
  const saved = Array.isArray(value) ? (value as OrderCell[]).filter((c) => by.has(c.key)) : null;
  const cells: OrderCell[] = saved
    ? [...saved, ...src.options.filter((o) => !saved.some((c) => c.key === o.key)).map((o) => ({ key: o.key, hidden: true }))]
    : [...src.defaults.filter((k) => by.has(k)).map((key) => ({ key })), ...src.options.filter((o) => !src.defaults.includes(o.key)).map((o) => ({ key: o.key, hidden: true }))];
  const [drag, setDrag] = useState<number | null>(null);
  const put = (l: OrderCell[]) => onChange(l.map((c) => (c.hidden ? { key: c.key, hidden: true } : { key: c.key })));
  const move = (from: number, to: number) => { const l = [...cells]; const [x] = l.splice(from, 1); l.splice(to, 0, x); put(l); };
  const shown = cells.filter((c) => !c.hidden).length;
  let n = 0;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{label}</span><span className="text-eu-muted text-[length:var(--fs-13)] tabular-nums">{shown ? `${shown} ορατά από ${cells.length}` : "Κανένα ορατό — η ζώνη δεν εμφανίζεται"}</span></div>
      <ol className="m-0 p-0 list-none grid gap-1.5" onDragOver={(e) => e.preventDefault()}>
        {cells.map((c, i) => {
          const o = by.get(c.key)!;
          const no = c.hidden ? null : String(++n).padStart(2, "0");
          return (
            <li key={c.key} className={`flex items-center gap-1 rounded-xl border pr-1 ${c.hidden ? "border-eu-line bg-eu-surface/60" : "border-eu-line bg-white"} ${drag === i ? "opacity-40" : ""}`}
              onDragOver={(e) => { if (drag != null) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); if (drag != null && drag !== i) move(drag, i); setDrag(null); }}>
              <span draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDrag(i); }} onDragEnd={() => setDrag(null)} aria-hidden title="Σύρε για αλλαγή σειράς" className="grid place-items-center w-9 self-stretch cursor-grab text-eu-muted hover:text-eu-ink"><GripVertical className="size-5" /></span>
              <span className={`w-7 shrink-0 font-extrabold text-[length:var(--fs-13)] tabular-nums ${c.hidden ? "text-eu-muted" : "text-eu-blue"}`}>{no ?? "—"}</span>
              {o.image !== undefined && <span className={`h-11 w-16 shrink-0 rounded-md bg-eu-surface bg-cover bg-center ${c.hidden ? "opacity-40" : ""}`} style={o.image ? { backgroundImage: `url("${o.image.replace(/"/g, "")}")` } : undefined} aria-hidden />}
              <span className="flex-1 min-w-0 grid px-2 py-2 min-h-14">
                <span className={`font-bold text-[length:var(--fs-15)] leading-snug ${c.hidden ? "text-eu-muted" : "text-eu-ink"}`}>{o.title}</span>
                {o.subtitle && <span className="text-eu-muted text-[length:var(--fs-13)] leading-snug line-clamp-1">{o.subtitle}</span>}
              </span>
              <button type="button" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`${o.title}: πιο πάνω`} className="size-11 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30"><ArrowUp className="size-4" aria-hidden /></button>
              <button type="button" disabled={i === cells.length - 1} onClick={() => move(i, i + 1)} aria-label={`${o.title}: πιο κάτω`} className="size-11 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30"><ArrowDown className="size-4" aria-hidden /></button>
              <button type="button" onClick={() => put(cells.map((x, k) => (k === i ? { ...x, hidden: x.hidden ? undefined : true } : x)))} aria-pressed={!c.hidden} aria-label={c.hidden ? `Εμφάνιση: ${o.title}` : `Απόκρυψη: ${o.title}`} title={c.hidden ? "Κρυφό — πάτα για εμφάνιση" : "Ορατό — πάτα για απόκρυψη"} className="size-11 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface">{c.hidden ? <EyeOff className="size-5 text-eu-muted" aria-hidden /> : <Eye className="size-5" aria-hidden />}</button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
