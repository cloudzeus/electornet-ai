"use client";

import Link from "next/link";
import { createContext, useContext, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Eye, EyeOff, GripVertical } from "lucide-react";
import type { ServiceCell } from "@/lib/cms/home-sections";

export type ServiceOption = { slug: string; title: string; blurb: string; priceFrom: number | null };
export const HomeServices = createContext<ServiceOption[]>([]);

/**
 * Υπηρεσίες της αρχικής: όλες οι ενεργές υπηρεσίες, σύρσιμο (ή βέλη) για σειρά, μάτι για ορατή/κρυφή στην αρχική.
 * Χωρίς επιλογή: οι πρώτες 6 του καταλόγου ορατές. Νέες υπηρεσίες που προστίθενται αργότερα εμφανίζονται εδώ κρυφές.
 */
export function ServiceCellsField({ props, set, label }: { props: Record<string, unknown> | undefined; set: (patch: Record<string, unknown>) => void; label: string }) {
  const all = useContext(HomeServices);
  const by = new Map(all.map((s) => [s.slug, s]));
  const saved = Array.isArray(props?.items) ? (props!.items as ServiceCell[]).filter((x) => by.has(x.slug)) : null;
  const limit = Math.max(1, Math.min(12, Number(props?.limit) || 6));
  const cells: ServiceCell[] = saved
    ? [...saved, ...all.filter((s) => !saved.some((x) => x.slug === s.slug)).map((s) => ({ slug: s.slug, hidden: true }))]
    : all.map((s, i) => ({ slug: s.slug, hidden: i >= limit ? true : undefined }));
  const [drag, setDrag] = useState<number | null>(null);
  const put = (l: ServiceCell[]) => set({ items: l.map((x) => (x.hidden ? { slug: x.slug, hidden: true } : { slug: x.slug })) });
  const move = (from: number, to: number) => { const l = [...cells]; const [x] = l.splice(from, 1); l.splice(to, 0, x); put(l); };
  const shown = cells.filter((c) => !c.hidden).length;
  let n = 0;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{label}</span>
        <span className={`text-[length:var(--fs-13)] tabular-nums font-bold ${shown % 3 === 0 && shown ? "text-eu-green" : "text-eu-muted"}`}>{shown} ορατές{shown && shown % 3 !== 0 ? " · προτείνονται 3, 6 ή 9" : ""}</span>
      </div>
      <ol className="m-0 p-0 list-none grid gap-1.5" onDragOver={(e) => e.preventDefault()}>
        {cells.map((c, i) => {
          const s = by.get(c.slug)!;
          const no = c.hidden ? null : String(++n).padStart(2, "0");
          return (
            <li key={c.slug} className={`flex items-center gap-1 rounded-xl border pr-1 ${c.hidden ? "border-eu-line bg-eu-surface/60" : "border-eu-navy/30 bg-eu-navy text-white"} ${drag === i ? "opacity-40" : ""}`}
              onDragOver={(e) => { if (drag != null) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); if (drag != null && drag !== i) move(drag, i); setDrag(null); }}>
              <span draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDrag(i); }} onDragEnd={() => setDrag(null)} aria-hidden title="Σύρε για αλλαγή σειράς" className={`grid place-items-center w-9 self-stretch cursor-grab ${c.hidden ? "text-eu-muted" : "text-white/70"}`}><GripVertical className="size-5" /></span>
              <span className={`w-7 shrink-0 font-extrabold text-[length:var(--fs-13)] tabular-nums ${c.hidden ? "text-eu-muted" : "text-eu-yellow"}`}>{no ?? "—"}</span>
              <span className="flex-1 min-w-0 grid py-2">
                <span className={`font-bold text-[length:var(--fs-15)] leading-snug ${c.hidden ? "text-eu-muted" : ""}`}>{s.title}</span>
                <span className={`text-[length:var(--fs-13)] leading-snug line-clamp-1 ${c.hidden ? "text-eu-muted" : "text-white/75"}`}>{s.blurb}{s.priceFrom != null ? ` · από ${s.priceFrom.toLocaleString("el-GR")} €` : ""}</span>
              </span>
              <button type="button" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`${s.title}: πιο πάνω`} className={`size-11 shrink-0 grid place-items-center rounded-full disabled:opacity-30 ${c.hidden ? "hover:bg-white" : "hover:bg-white/10"}`}><ArrowUp className="size-4" aria-hidden /></button>
              <button type="button" disabled={i === cells.length - 1} onClick={() => move(i, i + 1)} aria-label={`${s.title}: πιο κάτω`} className={`size-11 shrink-0 grid place-items-center rounded-full disabled:opacity-30 ${c.hidden ? "hover:bg-white" : "hover:bg-white/10"}`}><ArrowDown className="size-4" aria-hidden /></button>
              <button type="button" onClick={() => put(cells.map((x, k) => (k === i ? { ...x, hidden: x.hidden ? undefined : true } : x)))} aria-pressed={!c.hidden} aria-label={c.hidden ? `Εμφάνιση στην αρχική: ${s.title}` : `Απόκρυψη από την αρχική: ${s.title}`} title={c.hidden ? "Κρυφή στην αρχική — πάτα για εμφάνιση" : "Ορατή στην αρχική — πάτα για απόκρυψη"} className={`size-11 shrink-0 grid place-items-center rounded-full ${c.hidden ? "text-eu-muted hover:bg-white" : "hover:bg-white/10"}`}>{c.hidden ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}</button>
            </li>
          );
        })}
      </ol>
      <Link href="/admin/ypiresies" className="justify-self-start inline-flex items-center gap-1.5 text-eu-blue font-bold underline min-h-11 text-[length:var(--fs-14)]">Επεξεργασία υπηρεσιών (τίτλοι, κείμενα, νέα υπηρεσία) <ExternalLink className="size-4" aria-hidden /></Link>
    </div>
  );
}
