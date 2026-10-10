"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Eye, EyeOff, GripVertical, Plus, Search, Star, Trash2 } from "lucide-react";
import { cellsOf, type CategoryCell } from "@/lib/cms/category-cells";
import { Txt } from "./brand/fields";

/** Οι κατηγορίες του καταλόγου για τον editor (id, slug, όνομα, «Γονική › Κατηγορία», πλήθος). */
export type CatOption = { id: string; slug: string; name: string; label: string; count: number; depth: number };
export const HomeCatalog = createContext<CatOption[]>([]);

/**
 * Τα κελιά του πλέγματος κατηγοριών: σύρσιμο για σειρά (ή βέλη), ★ για το τονισμένο, μάτι για ορατό/κρυφό,
 * άνοιγμα για δικό μας τίτλο και μικρό κείμενο, προσθήκη από τον κατάλογο με αναζήτηση.
 */
export function CategoryCellsField({ props, set, label, help }: { props: Record<string, unknown> | undefined; set: (patch: Record<string, unknown>) => void; label: string; help?: string }) {
  const cats = useContext(HomeCatalog);
  const byRef = useMemo(() => { const m = new Map<string, CatOption>(); for (const c of cats) { m.set(c.slug, c); m.set(c.id, c); } return m; }, [cats]);
  const { cells, focus } = cellsOf(props);
  const [open, setOpen] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ from: number; over: number | null } | null>(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const put = (next: CategoryCell[], f = focus) => set({ cells: next, focus: f });
  const move = (from: number, to: number) => { const l = [...cells]; const [x] = l.splice(from, 1); l.splice(to > from ? to - 1 : to, 0, x); put(l); };
  const upd = (i: number, p: Partial<CategoryCell>) => put(cells.map((c, k) => (k === i ? { ...c, ...p } : c)));
  const isFocus = (c: CategoryCell) => { const o = byRef.get(c.ref); return c.ref === focus || (!!o && (o.id === focus || o.slug === focus)); };
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const results = adding ? cats.filter((c) => c.count > 0 && !cells.some((x) => x.ref === c.slug || x.ref === c.id) && (!q || norm(c.label).includes(norm(q)))).slice(0, 30) : [];
  let shown = 0;
  return (
    <div className="grid gap-2">
      <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{label}</span>
      {help && <span className="text-eu-muted text-[length:var(--fs-13)] leading-snug -mt-1">{help}</span>}
      <ol className="m-0 p-0 list-none grid gap-1.5" onDragOver={(e) => e.preventDefault()}>
        {cells.map((c, i) => {
          const o = byRef.get(c.ref);
          const no = c.hidden || !o || o.count <= 0 ? null : String(++shown).padStart(2, "0");
          const f = isFocus(c);
          return (
            <li key={c.ref} className="relative"
              onDragOver={(e) => { if (!drag) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); const over = e.clientY < r.top + r.height / 2 ? i : i + 1; if (over !== drag.over) setDrag({ ...drag, over }); }}
              onDrop={(e) => { e.preventDefault(); if (drag?.over != null) move(drag.from, drag.over); setDrag(null); }}>
              {drag?.over === i && <span aria-hidden className="absolute -top-1 inset-x-0 h-1 rounded-full bg-eu-blue" />}
              <div className={`rounded-xl border ${f ? "border-eu-navy bg-eu-navy text-white" : "border-eu-line bg-white"} ${drag?.from === i ? "opacity-40" : ""}`}>
                <div className="flex items-center gap-1 pr-1">
                  <span draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDrag({ from: i, over: null }); }} onDragEnd={() => setDrag(null)} aria-hidden title="Σύρε για αλλαγή σειράς" className={`grid place-items-center w-8 self-stretch cursor-grab ${f ? "text-white/70" : "text-eu-muted"}`}><GripVertical className="size-4" /></span>
                  <span className={`w-7 shrink-0 font-extrabold text-[length:var(--fs-13)] tabular-nums ${f ? "text-eu-yellow" : "text-eu-muted"}`}>{no ?? "—"}</span>
                  <button type="button" onClick={() => setOpen(open === c.ref ? null : c.ref)} aria-expanded={open === c.ref} className="flex-1 min-w-0 grid text-left py-2 min-h-12">
                    <span className={`font-bold text-[length:var(--fs-15)] leading-snug ${c.hidden ? "line-through opacity-60" : ""}`}>{c.title?.trim() || o?.name || c.ref}</span>
                    <span className={`text-[length:var(--fs-13)] ${f ? "text-white/80" : "text-eu-muted"}`}>{o ? `${o.count.toLocaleString("el-GR")} προϊόντα · ${o.label}` : "Η κατηγορία δεν υπάρχει πια — δεν εμφανίζεται"}</span>
                  </button>
                  <button type="button" onClick={() => put(cells, f ? "" : c.ref)} aria-pressed={f} aria-label={f ? `Κατάργηση έμφασης: ${c.title || o?.name}` : `Τονισμένη: ${c.title || o?.name}`} title={f ? "Τονισμένη (σκούρο κελί)" : "Κάν' την τονισμένη"} className={`size-11 shrink-0 grid place-items-center rounded-full ${f ? "text-eu-yellow hover:bg-white/10" : "text-eu-muted hover:bg-eu-surface"}`}><Star className="size-5" fill={f ? "currentColor" : "none"} aria-hidden /></button>
                  <button type="button" onClick={() => upd(i, { hidden: c.hidden ? undefined : true })} aria-label={c.hidden ? "Εμφάνιση" : "Απόκρυψη"} title={c.hidden ? "Κρυφή — πάτα για εμφάνιση" : "Ορατή — πάτα για απόκρυψη"} className={`size-11 shrink-0 grid place-items-center rounded-full ${f ? "hover:bg-white/10" : "hover:bg-eu-surface"}`}>{c.hidden ? <EyeOff className="size-4 opacity-60" aria-hidden /> : <Eye className="size-4" aria-hidden />}</button>
                  <ChevronDown className={`size-4 shrink-0 transition-transform ${open === c.ref ? "rotate-180" : ""}`} aria-hidden />
                </div>
                {open === c.ref && (
                  <div className="grid gap-3 rounded-b-xl bg-white text-eu-ink p-3 border-t border-eu-line">
                    <Txt label="Τίτλος κελιού" value={c.title ?? ""} onChange={(v) => upd(i, { title: v || undefined })} max={40} placeholder={o?.name} help="Κενό = το όνομα της κατηγορίας. Με « & » σπάει σε δύο γραμμές." />
                    <Txt label="Μικρό κείμενο" value={c.meta ?? ""} onChange={(v) => upd(i, { meta: v || undefined })} max={30} placeholder="π.χ. εποχική αιχμή" help="Δίπλα στο πλήθος προϊόντων. Προαιρετικό." />
                    <div className="flex flex-wrap gap-1">
                      <button type="button" disabled={i === 0} onClick={() => move(i, i - 1)} className="inline-flex items-center gap-1.5 rounded-full border border-eu-line px-3 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-surface disabled:opacity-30"><ArrowUp className="size-4" aria-hidden /> Πιο πάνω</button>
                      <button type="button" disabled={i === cells.length - 1} onClick={() => move(i, i + 2)} className="inline-flex items-center gap-1.5 rounded-full border border-eu-line px-3 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-surface disabled:opacity-30"><ArrowDown className="size-4" aria-hidden /> Πιο κάτω</button>
                      <button type="button" onClick={() => { put(cells.filter((_, k) => k !== i)); setOpen(null); }} className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 min-h-11 font-bold text-eu-red text-[length:var(--fs-14)] hover:bg-eu-red/10"><Trash2 className="size-4" aria-hidden /> Αφαίρεση</button>
                    </div>
                  </div>
                )}
              </div>
              {drag?.over === cells.length && i === cells.length - 1 && <span aria-hidden className="absolute -bottom-1 inset-x-0 h-1 rounded-full bg-eu-blue" />}
            </li>
          );
        })}
      </ol>
      {!adding ? (
        <button type="button" onClick={() => setAdding(true)} className="justify-self-start inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-navy hover:text-white"><Plus className="size-4" aria-hidden /> Προσθήκη κατηγορίας</button>
      ) : (
        <div className="rounded-xl border-2 border-eu-navy p-2 grid gap-2">
          <label className="relative"><span className="sr-only">Αναζήτηση κατηγορίας</span><Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-eu-muted" aria-hidden /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="π.χ. κλιματιστικά, laptop, καφέ…" className="w-full rounded-lg border border-eu-line pl-9 pr-3 min-h-11 text-[length:var(--fs-16)]" /></label>
          <ul className="m-0 p-0 list-none grid max-h-72 overflow-y-auto">
            {results.map((c) => <li key={c.id}><button type="button" onClick={() => { put([...cells, { ref: c.slug }]); setAdding(false); setQ(""); }} className="w-full text-left rounded-lg px-3 py-2 min-h-11 hover:bg-eu-surface grid"><span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{c.name}</span><span className="text-eu-muted text-[length:var(--fs-13)]">{c.label} · {c.count.toLocaleString("el-GR")} προϊόντα</span></button></li>)}
            {!results.length && <li className="px-3 py-2 text-eu-muted text-[length:var(--fs-14)]">Καμία κατηγορία{q ? ` με «${q}»` : ""}.</li>}
          </ul>
          <button type="button" onClick={() => { setAdding(false); setQ(""); }} className="justify-self-end rounded-full px-3 min-h-11 font-bold text-eu-ink-2 text-[length:var(--fs-14)] hover:bg-eu-surface">Άκυρο</button>
        </div>
      )}
    </div>
  );
}
