"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Check, ChevronRight, FolderTree, Loader2, Package, Plus, Search, TriangleAlert, X } from "lucide-react";
import { brandCategoriesAction, brandProductsAction, type PickProduct } from "@/app/admin/(shell)/cms/brand-stores/actions";

type Cat = { id: string; name: string; parentId: string | null; count: number };
const norm = (s: string) => s.toLocaleLowerCase("el-GR").normalize("NFD").replace(/[̀-ͯ]/g, "");
const eur = (v: number | null) => (v == null ? "χωρίς τιμή" : `${v.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
let catCache: { brandId: string | null; cats: Cat[] } | null = null;

/**
 * Επιλογή προϊόντων της μάρκας: κατηγορία → υποκατηγορία → λίστα που στενεύει όσο γράφεις.
 * Πλήρης οθόνη σε κινητό, παράθυρο σε μεγάλη οθόνη. single = ένα προϊόν (κλείνει με την επιλογή).
 */
export function ProductPickerDialog({ brandId, brandName, selected, single = false, max, onDone, onClose }: { brandId: string | null; brandName: string; selected: string[]; single?: boolean; max?: number; onDone: (ids: string[], info: PickProduct[]) => void; onClose: () => void }) {
  const [cats, setCats] = useState<Cat[] | null>(catCache?.brandId === brandId ? catCache.cats : null);
  const [path, setPath] = useState<Cat[]>([]);
  const [items, setItems] = useState<PickProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>(selected);
  const [info, setInfo] = useState<Record<string, PickProduct>>({});
  const [loading, start] = useTransition();
  const current = path[path.length - 1] ?? null;

  useEffect(() => {
    if (cats) return;
    let live = true;
    brandCategoriesAction(brandId).then((c) => { if (!live) return; catCache = { brandId, cats: c }; setCats(c); });
    return () => { live = false; };
  }, [brandId, cats]);
  // προϊόντα της επιλεγμένης κατηγορίας (ή όλα της μάρκας)· η αναζήτηση στον server όταν είναι πάνω από 200
  useEffect(() => {
    const t = setTimeout(() => start(async () => { const r = await brandProductsAction({ brandId, categoryId: current?.id ?? null, q: total > 200 ? q : "" }); setItems(r.items); setTotal(r.total); }), q && total > 200 ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- το total αλλάζει από αυτό το effect
  }, [brandId, current?.id, total > 200 ? q : ""]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = prev; };
  }, [onClose]);

  const children = useMemo(() => (cats ?? []).filter((c) => c.parentId === (current?.id ?? null) || (!current && !cats?.some((p) => p.id === c.parentId))), [cats, current]);
  const shown = q && total <= 200 ? items.filter((p) => norm(`${p.title} ${p.sku}`).includes(norm(q))) : items;
  const toggle = (p: PickProduct) => {
    setInfo((x) => ({ ...x, [p.id]: p }));
    if (single) { onDone([p.id], [p]); return; }
    setPicked((x) => (x.includes(p.id) ? x.filter((i) => i !== p.id) : max && x.length >= max ? x : [...x, p.id]));
  };

  return (
    <div className="fixed inset-0 z-50 @container" role="dialog" aria-modal="true" aria-label={`Επιλογή προϊόντων ${brandName}`}>
      <button type="button" aria-label="Κλείσιμο" onClick={onClose} className="absolute inset-0 bg-eu-navy/60 backdrop-blur-sm" />
      <div className="absolute inset-0 @3xl:inset-6 @6xl:inset-x-[10%] @3xl:rounded-2xl bg-white flex flex-col overflow-hidden shadow-[var(--shadow-overlay)]">
        <div className="flex items-center gap-2 px-4 min-h-14 border-b border-eu-line">
          <Package className="size-5 text-eu-blue shrink-0" aria-hidden />
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)] flex-1 min-w-0 truncate">{single ? `Διάλεξε ένα προϊόν ${brandName}` : `Προϊόντα ${brandName}`}</h2>
          <button type="button" onClick={onClose} aria-label="Κλείσιμο" className="size-11 grid place-items-center rounded-full hover:bg-eu-surface"><X className="size-5" aria-hidden /></button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 @3xl:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] overflow-hidden">
          {/* βήμα 1: κατηγορία → υποκατηγορία */}
          <nav aria-label="Κατηγορίες" className="border-b @3xl:border-b-0 @3xl:border-r border-eu-line overflow-y-auto max-h-[38vh] @3xl:max-h-none p-3 grid gap-1 content-start">
            <div className="flex flex-wrap items-center gap-1 text-[length:var(--fs-13)] font-bold text-eu-muted mb-1">
              <FolderTree className="size-4" aria-hidden />
              <button type="button" onClick={() => setPath([])} className={`rounded px-1 min-h-8 ${current ? "text-eu-blue hover:underline" : "text-eu-ink"}`}>Όλα</button>
              {path.map((c, i) => <span key={c.id} className="inline-flex items-center gap-1"><ChevronRight className="size-3" aria-hidden /><button type="button" onClick={() => setPath(path.slice(0, i + 1))} className={`rounded px-1 min-h-8 text-left ${i === path.length - 1 ? "text-eu-ink" : "text-eu-blue hover:underline"}`}>{c.name}</button></span>)}
            </div>
            {!cats && <span className="inline-flex items-center gap-2 text-eu-muted text-[length:var(--fs-14)] min-h-11"><Loader2 className="size-4 animate-spin" aria-hidden /> Κατηγορίες…</span>}
            {children.map((c) => (
              <button key={c.id} type="button" onClick={() => setPath([...path, c])} className="flex items-center justify-between gap-2 rounded-lg px-3 min-h-11 text-left hover:bg-eu-surface text-[length:var(--fs-14)]">
                <span className="min-w-0 font-semibold text-eu-ink">{c.name}</span>
                <span className="shrink-0 inline-flex items-center gap-1 text-eu-muted text-[length:var(--fs-13)]">{c.count}{cats?.some((x) => x.parentId === c.id) && <ChevronRight className="size-4" aria-hidden />}</span>
              </button>
            ))}
            {cats && !children.length && current && <span className="text-eu-muted text-[length:var(--fs-13)] px-1">Χωρίς υποκατηγορίες — δες τα προϊόντα.</span>}
          </nav>

          {/* βήμα 2: προϊόντα */}
          <div className="flex flex-col min-h-0">
            <div className="p-3 border-b border-eu-line grid gap-1">
              <label className="relative block">
                <span className="sr-only">Φίλτρο προϊόντων</span>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-eu-muted" aria-hidden />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Γράψε για να στενέψει η λίστα (τίτλος ή κωδικός)…" className="w-full rounded-xl border-2 border-eu-line pl-9 pr-3 min-h-11 text-[length:var(--fs-16)] outline-none focus:border-eu-blue" />
              </label>
              <span className="text-eu-muted text-[length:var(--fs-13)]">{loading ? "Φόρτωση…" : `${shown.length}${total > items.length ? ` από ${total}` : ""} προϊόντα${current ? ` · ${current.name}` : ""}${!single && max ? ` · έως ${max}` : ""}`}</span>
            </div>
            <ul className="m-0 p-2 list-none overflow-y-auto flex-1 grid gap-1 content-start">
              {shown.map((p) => {
                const on = picked.includes(p.id);
                return (
                  <li key={p.id}>
                    <button type="button" onClick={() => toggle(p)} aria-pressed={on} className={`w-full flex items-center gap-3 rounded-xl border-2 px-2 py-1.5 min-h-14 text-left ${on ? "border-eu-navy bg-eu-chip" : "border-transparent hover:bg-eu-surface"}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- μικρογραφία καταλόγου */}
                      <span className="size-12 shrink-0 rounded-lg bg-white border border-eu-line overflow-hidden grid place-items-center">{p.image ? <img src={p.image} alt="" className="max-w-full max-h-full object-contain" loading="lazy" /> : <Package className="size-5 text-eu-muted" aria-hidden />}</span>
                      <span className="grid min-w-0 flex-1"><span className="font-semibold text-eu-ink text-[length:var(--fs-14)] leading-snug line-clamp-2">{p.title}</span><span className="text-eu-muted text-[length:var(--fs-13)]">{p.sku} · {eur(p.price)}</span></span>
                      <span className={`shrink-0 size-7 rounded-full inline-flex items-center justify-center ${on ? "bg-eu-navy text-white" : "border-2 border-eu-line text-eu-muted"}`}>{on ? <Check className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}</span>
                    </button>
                  </li>
                );
              })}
              {!loading && !shown.length && <li className="p-6 text-center text-eu-muted">Κανένα προϊόν εδώ.</li>}
            </ul>
          </div>
        </div>

        {!single && (
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-t border-eu-line bg-white">
            <span className="text-eu-ink-2 font-bold text-[length:var(--fs-14)] flex-1 min-w-0">{picked.length} επιλεγμένα</span>
            <button type="button" onClick={onClose} className="rounded-full border-2 border-eu-line px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:border-eu-navy">Άκυρο</button>
            <button type="button" onClick={() => onDone(picked, Object.values(info))} className="rounded-full bg-eu-navy text-white px-5 min-h-11 font-extrabold text-[length:var(--fs-15)] hover:bg-eu-blue">Εντάξει</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Τα επιλεγμένα προϊόντα με τη σειρά που θα εμφανιστούν: μετακίνηση, αφαίρεση, προσθήκη. */
export function ProductList({ label, help, ids, info, onChange, brandId, brandName, single = false, max, onInfo }: { label: string; help?: string; ids: string[]; info: Record<string, PickProduct>; onChange: (ids: string[]) => void; brandId: string | null; brandName: string; single?: boolean; max?: number; onInfo: (p: PickProduct[]) => void }) {
  const [open, setOpen] = useState(false);
  const move = (i: number, d: number) => { const x = [...ids]; [x[i], x[i + d]] = [x[i + d], x[i]]; onChange(x); };
  return (
    <div className="grid gap-2 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{label}</span>
        <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy px-3 min-h-10 font-bold text-[length:var(--fs-14)] hover:bg-eu-navy hover:text-white">{single ? (ids[0] ? "Αλλαγή προϊόντος" : "Διάλεξε προϊόν") : <><Plus className="size-4" aria-hidden /> Προϊόντα</>}</button>
      </div>
      {help && <span className="text-eu-muted text-[length:var(--fs-13)] leading-snug -mt-1">{help}</span>}
      {ids.length > 0 ? (
        <ol className="m-0 p-0 list-none grid gap-1.5">
          {ids.map((id, i) => {
            const p = info[id];
            return (
              <li key={id} className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 min-w-0 ${p ? "border-eu-line bg-white" : "border-eu-red bg-eu-red/5"}`}>
                {!single && <span className="shrink-0 w-5 text-center font-bold text-eu-muted text-[length:var(--fs-13)]">{i + 1}</span>}
                {/* eslint-disable-next-line @next/next/no-img-element -- μικρογραφία */}
                <span className="size-11 shrink-0 rounded-lg bg-white border border-eu-line overflow-hidden grid place-items-center">{p?.image ? <img src={p.image} alt="" className="max-w-full max-h-full object-contain" /> : p ? <Package className="size-4 text-eu-muted" aria-hidden /> : <TriangleAlert className="size-4 text-eu-red" aria-hidden />}</span>
                <span className="grid min-w-0 flex-1"><span className={`text-[length:var(--fs-14)] font-semibold leading-snug line-clamp-2 ${p ? "text-eu-ink" : "text-eu-red"}`}>{p?.title ?? "Δεν βρέθηκε — ανενεργό ή διαγραμμένο"}</span><span className="text-eu-muted text-[length:var(--fs-13)] truncate">{p ? `${p.sku}${p.price != null ? ` · ${eur(p.price)}` : ""}` : id}</span></span>
                {!single && ids.length > 1 && (
                  <span className="shrink-0 flex">
                    <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Πιο πάνω" className="size-10 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30"><ArrowUp className="size-4" aria-hidden /></button>
                    <button type="button" disabled={i === ids.length - 1} onClick={() => move(i, 1)} aria-label="Πιο κάτω" className="size-10 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30"><ArrowDown className="size-4" aria-hidden /></button>
                  </span>
                )}
                {!single && <button type="button" onClick={() => onChange(ids.filter((x) => x !== id))} aria-label="Αφαίρεση" className="shrink-0 size-10 grid place-items-center rounded-full text-eu-red hover:bg-eu-red/10"><X className="size-4" aria-hidden /></button>}
              </li>
            );
          })}
        </ol>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="rounded-xl border-2 border-dashed border-eu-line px-3 min-h-14 text-eu-muted font-bold text-[length:var(--fs-14)] hover:border-eu-navy hover:text-eu-navy">{single ? "Δεν έχει επιλεγεί προϊόν — πάτα για επιλογή" : "Κανένα προϊόν — πάτα για προσθήκη"}</button>
      )}
      {open && <ProductPickerDialog brandId={brandId} brandName={brandName} selected={ids} single={single} max={max} onClose={() => setOpen(false)} onDone={(next, inf) => { onInfo(inf); onChange(next); setOpen(false); }} />}
    </div>
  );
}
