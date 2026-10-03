"use client";

import { useEffect, useState } from "react";
import { Check, ChevronRight, FolderTree, Loader2, Plus, X } from "lucide-react";
import { brandCategoriesAction } from "@/app/admin/(shell)/cms/brand-stores/actions";

type Cat = { id: string; name: string; parentId: string | null; count: number };
const cache = new Map<string, Cat[]>();
const ck = (b: string | null) => b ?? "*";

/**
 * Κατηγορίες της μάρκας σε drill-down (κατηγορία → υποκατηγορία), με πλήθος προϊόντων.
 * single: μία κατηγορία (ή «όλες»)· αλλιώς πολλαπλή επιλογή με σειρά.
 */
export function CategoryPicker({ brandId, label, help, value, onChange, single = false, allLabel = "Όλες οι κατηγορίες" }: { brandId: string | null; label: string; help?: string; value: { id: string; name: string }[]; onChange: (v: { id: string; name: string }[]) => void; single?: boolean; allLabel?: string }) {
  const [cats, setCats] = useState<Cat[] | null>(cache.get(ck(brandId)) ?? null);
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState<Cat[]>([]);
  useEffect(() => {
    if (!open || cats) return;
    let live = true;
    brandCategoriesAction(brandId).then((c) => { cache.set(ck(brandId), c); if (live) setCats(c); });
    return () => { live = false; };
  }, [open, cats, brandId]);
  const cur = path[path.length - 1] ?? null;
  const kids = (cats ?? []).filter((c) => (cur ? c.parentId === cur.id : !cats!.some((p) => p.id === c.parentId)));
  const has = (id: string) => value.some((v) => v.id === id);
  const pick = (c: Cat) => { if (single) { onChange([{ id: c.id, name: c.name }]); setOpen(false); return; } onChange(has(c.id) ? value.filter((v) => v.id !== c.id) : [...value, { id: c.id, name: c.name }]); };

  return (
    <div className="grid gap-2 min-w-0">
      <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{label}</span>
      {help && <span className="text-eu-muted text-[length:var(--fs-13)] leading-snug -mt-1">{help}</span>}
      <div className="flex flex-wrap gap-2 items-center">
        {single && !value.length && <span className="rounded-full bg-eu-surface px-3 min-h-10 inline-flex items-center font-bold text-eu-ink-2 text-[length:var(--fs-14)]">{allLabel}</span>}
        {value.map((v) => <span key={v.id} className="inline-flex items-center gap-1 rounded-full bg-eu-chip pl-3 pr-1 min-h-10 font-bold text-eu-navy text-[length:var(--fs-14)]">{v.name}<button type="button" onClick={() => onChange(value.filter((x) => x.id !== v.id))} aria-label={`Αφαίρεση ${v.name}`} className="size-8 grid place-items-center rounded-full hover:bg-white"><X className="size-3.5" aria-hidden /></button></span>)}
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy px-3 min-h-10 font-bold text-[length:var(--fs-14)] hover:bg-eu-navy hover:text-white"><FolderTree className="size-4" aria-hidden />{single ? "Διάλεξε κατηγορία" : "Κατηγορίες"}</button>
      </div>
      {open && (
        <div className="rounded-xl border-2 border-eu-navy p-2 grid gap-1">
          <div className="flex flex-wrap items-center gap-1 text-[length:var(--fs-13)] font-bold text-eu-muted px-1">
            <button type="button" onClick={() => setPath([])} className={`rounded px-1 min-h-9 ${cur ? "text-eu-blue hover:underline" : "text-eu-ink"}`}>Όλες</button>
            {path.map((c, i) => <span key={c.id} className="inline-flex items-center gap-1"><ChevronRight className="size-3" aria-hidden /><button type="button" onClick={() => setPath(path.slice(0, i + 1))} className="rounded px-1 min-h-9 text-left text-eu-blue hover:underline">{c.name}</button></span>)}
          </div>
          {!cats && <span className="inline-flex items-center gap-2 text-eu-muted min-h-11 px-2"><Loader2 className="size-4 animate-spin" aria-hidden /> Κατηγορίες…</span>}
          {single && cur === null && cats && <button type="button" onClick={() => { onChange([]); setOpen(false); }} className="text-left rounded-lg px-3 min-h-11 font-bold text-eu-ink-2 hover:bg-eu-surface">{allLabel}</button>}
          {kids.map((c) => {
            const deeper = cats?.some((x) => x.parentId === c.id);
            const on = has(c.id);
            return (
              <div key={c.id} className="flex items-center gap-1">
                <button type="button" onClick={() => pick(c)} aria-pressed={on} className={`flex-1 min-w-0 flex items-center gap-2 rounded-lg px-3 min-h-11 text-left text-[length:var(--fs-14)] ${on ? "bg-eu-chip text-eu-navy font-bold" : "hover:bg-eu-surface font-semibold text-eu-ink"}`}>
                  <span className={`shrink-0 size-6 rounded-full grid place-items-center ${on ? "bg-eu-navy text-white" : "border-2 border-eu-line text-eu-muted"}`}>{on ? <Check className="size-3.5" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}</span>
                  <span className="min-w-0 flex-1">{c.name}</span><span className="text-eu-muted text-[length:var(--fs-13)]">{c.count}</span>
                </button>
                {deeper && <button type="button" onClick={() => setPath([...path, c])} aria-label={`Υποκατηγορίες ${c.name}`} className="shrink-0 size-11 grid place-items-center rounded-lg hover:bg-eu-surface"><ChevronRight className="size-4" aria-hidden /></button>}
              </div>
            );
          })}
          <button type="button" onClick={() => setOpen(false)} className="justify-self-end rounded-full bg-eu-navy text-white px-4 min-h-10 font-bold text-[length:var(--fs-14)] mt-1">Εντάξει</button>
        </div>
      )}
    </div>
  );
}
