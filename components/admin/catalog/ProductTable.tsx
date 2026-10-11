"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Columns3, RotateCcw, ImageOff } from "lucide-react";
import { ProductPeek, loadProductPeek } from "./ProductPeek";
import { sourceOf } from "./sources";

export type ProductRow = {
  id: string; title: string; brand: string; category: string; sku: string; ean: string | null; erpCode: string; active: boolean; isSet: boolean;
  thumb: string | null; photos: number; lowMain: boolean; specs: number;
  price: number | null; offer: number | null; stock: number; sold: number;
  energy: { cls: string; source: string | null } | null; energyNeeded: boolean; dims: number; dimStatus: string | null;
  updated: string; synced: string | null;
};
type Col = { id: string; label: string; w: number; sort?: string; def?: boolean; right?: boolean; cell: (r: ProductRow) => ReactNode; title?: (r: ProductRow) => string };
const eur = (v: number | null) => (v != null ? `${v.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : "—");
const day = (s: string | null) => (s ? new Date(s).toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");
const muted = (v: ReactNode) => <span className="text-eu-muted">{v}</span>;
const DIM: Record<string, [string, string]> = { match: ["ίδιες", "text-eu-green"], minor: ["μικρή διαφορά", "text-eu-ink-3"], swapped: ["άξονες", "text-eu-amber"], conflict: ["διαφέρουν", "text-eu-red font-bold"], "erp-only": ["μόνο ERP", "text-eu-ink-3"], "eprel-only": ["μόνο EPREL", "text-eu-ink-3"] };

export const Thumb = ({ r, size = "size-10" }: { r: ProductRow; size?: string }) => (
  <span className={`${size} shrink-0 grid place-items-center rounded-lg border border-eu-line bg-white overflow-hidden`}>
    {/* eslint-disable-next-line @next/next/no-img-element -- μικρογραφία CDN 480px */}
    {r.thumb ? <img src={r.thumb} alt="" loading="lazy" className="size-full object-contain" /> : <ImageOff className="size-4 text-eu-muted" aria-label="χωρίς φωτογραφία" />}
  </span>
);
const Energy = ({ r }: { r: ProductRow }) => r.energy ? <span className="inline-flex items-center gap-1" title={`Πηγή: ${sourceOf(r.energy.source).label}`}><b className="rounded bg-eu-green text-white px-1.5 text-[length:var(--fs-12)]">{r.energy.cls}</b><span className={`size-2 rounded-full ${sourceOf(r.energy.source).dot}`} aria-label={sourceOf(r.energy.source).label} /></span> : r.energyNeeded ? <span className="text-eu-red font-bold">λείπει</span> : muted("—");
const Price = ({ r }: { r: ProductRow }) => r.offer != null && r.price != null && r.offer < r.price ? <span className="tabular-nums"><s className="text-eu-muted">{eur(r.price)}</s> <b className="text-eu-red">{eur(r.offer)}</b></span> : <span className="tabular-nums font-semibold">{r.price ? eur(r.price) : <span className="text-eu-red font-bold">χωρίς τιμή</span>}</span>;

/** Όλες οι διαθέσιμες στήλες· `def` = ορατή αρχικά. Το `sort` είναι το κλειδί ταξινόμησης του server (?s=). */
const COLS: Col[] = [
  { id: "title", label: "Προϊόν", w: 320, sort: "title", def: true, title: (r) => r.title, cell: (r) => <span className="flex items-center gap-2 min-w-0"><Thumb r={r} size="size-9" /><span className="grid min-w-0"><Link href={`/admin/catalog/${r.id}`} className="font-bold text-eu-ink hover:text-eu-blue hover:underline truncate">{r.title}</Link><span className="text-eu-muted text-[length:var(--fs-12)] truncate">{r.brand}{r.isSet ? " · Set" : ""}{r.active ? "" : " · ανενεργό"}</span></span></span> },
  { id: "category", label: "Κατηγορία", w: 170, sort: "category", def: true, title: (r) => r.category, cell: (r) => <span className="truncate text-eu-ink-3">{r.category}</span> },
  { id: "brand", label: "Μάρκα", w: 110, sort: "brand", cell: (r) => <span className="truncate">{r.brand}</span> },
  { id: "sku", label: "Κωδικός", w: 120, sort: "sku", def: true, cell: (r) => <span className="font-mono truncate">{r.sku}</span> },
  { id: "ean", label: "Barcode", w: 125, cell: (r) => <span className="font-mono truncate">{r.ean ?? "—"}</span> },
  { id: "mtrl", label: "MTRL", w: 80, right: true, cell: (r) => <span className="font-mono tabular-nums text-eu-ink-3">{r.erpCode}</span> },
  { id: "price", label: "Τιμή", w: 130, sort: "price", def: true, right: true, cell: (r) => <Price r={r} /> },
  { id: "stock", label: "Απόθεμα", w: 80, sort: "stock", def: true, right: true, cell: (r) => <span className={`tabular-nums ${r.stock > 0 ? "text-eu-green font-bold" : "text-eu-muted"}`}>{r.stock}</span> },
  { id: "sold", label: "Πωλήσεις", w: 85, def: true, right: true, title: () => "Τεμάχια e-shop + SoftOne (χωρίς ακυρωμένα)", cell: (r) => <span className="tabular-nums">{r.sold || muted("0")}</span> },
  { id: "photos", label: "Φωτογρ.", w: 80, sort: "photos", def: true, right: true, cell: (r) => r.photos ? <span className={`tabular-nums ${r.lowMain ? "text-eu-red font-bold" : ""}`} title={r.lowMain ? "μικρή κύρια φωτογραφία" : undefined}>{r.photos}{r.lowMain ? " ⚠" : ""}</span> : <span className="text-eu-red font-bold">καμία</span> },
  { id: "specs", label: "Χαρακτ.", w: 75, sort: "specs", def: true, right: true, cell: (r) => <span className={`tabular-nums ${r.specs < 5 ? "text-eu-amber font-bold" : ""}`}>{r.specs}</span> },
  { id: "energy", label: "Ενεργ.", w: 75, def: true, cell: (r) => <Energy r={r} /> },
  { id: "dims", label: "Διαστάσεις", w: 105, cell: (r) => r.dimStatus && DIM[r.dimStatus] ? <span className={DIM[r.dimStatus][1]}>{DIM[r.dimStatus][0]}</span> : r.dims ? `${r.dims} πηγές` : muted("—") },
  { id: "active", label: "Κατάσταση", w: 90, sort: "active", cell: (r) => r.active ? <span className="text-eu-green font-bold">ενεργό</span> : muted("ανενεργό") },
  { id: "updated", label: "Αλλαγή", w: 85, sort: "updated", def: true, cell: (r) => <span className="tabular-nums">{day(r.updated)}</span> },
  { id: "synced", label: "SoftOne", w: 85, cell: (r) => <span className="tabular-nums">{day(r.synced)}</span> },
];
const DEFAULT = COLS.filter((c) => c.def).map((c) => c.id);
const KEY_COLS = "eu.products.cols", KEY_W = "eu.products.widths";
const read = <T,>(k: string): T | null => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* χωρίς αποθήκευση */ } };

/**
 * Πίνακας προϊόντων για υπολογιστή: πυκνές γραμμές, επιλογή στηλών (και σειράς), πλάτος με σύρσιμο ή βέλη,
 * ταξινόμηση, εγγραφές ανά σελίδα, επιλογή για μαζική προσφορά και άνοιγμα κάθε γραμμής (▾) σε καρτέλες με όλη την
 * εικόνα του προϊόντος. Στήλες και πλάτη θυμάται ο browser.
 */
export function ProductTable({ rows, sort, dir, query, perPage, total, from, canPromo }: { rows: ProductRow[]; sort: string; dir: "asc" | "desc"; query: Record<string, string>; perPage: number; total: number; from: number; canPromo: boolean }) {
  const [cols, setCols] = useState<string[]>(DEFAULT);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState<number | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const c = read<string[]>(KEY_COLS), w = read<Record<string, number>>(KEY_W);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- αρχικοποίηση από localStorage μία φορά
    if (c?.length) setCols(c.filter((id) => COLS.some((x) => x.id === id)));
    if (w) setWidths(w);
  }, []);
  useEffect(() => {
    if (!picker) return;
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === "Escape" : !pickerRef.current?.contains(e.target as Node)) setPicker(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [picker]);
  const shown = cols.map((id) => COLS.find((c) => c.id === id)!).filter(Boolean);
  const wOf = (c: Col) => widths[c.id] ?? c.w;
  const setW = (id: string, w: number, save = false) => setWidths((m) => { const n = { ...m, [id]: Math.max(56, Math.min(600, Math.round(w))) }; if (save) write(KEY_W, n); return n; });
  const toggleCol = (id: string) => setCols((c) => { const n = c.includes(id) ? c.filter((x) => x !== id) : [...c, id]; write(KEY_COLS, n); return n.length ? n : c; });
  const move = (id: string, d: -1 | 1) => setCols((c) => { const i = c.indexOf(id), j = i + d; if (i < 0 || j < 0 || j >= c.length) return c; const n = [...c]; [n[i], n[j]] = [n[j], n[i]]; write(KEY_COLS, n); return n; });
  const reset = () => { setCols(DEFAULT); setWidths({}); write(KEY_COLS, DEFAULT); write(KEY_W, {}); };
  const href = (o: Record<string, string>) => { const u = new URLSearchParams({ ...query, ...o }); [...u.keys()].forEach((k) => !u.get(k) && u.delete(k)); return `?${u}`; };
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOpen = rows.length > 0 && rows.every((r) => open.has(r.id));
  const startDrag = (c: Col, e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, w0 = wOf(c);
    const mv = (ev: PointerEvent) => setW(c.id, w0 + ev.clientX - x0);
    const up = (ev: PointerEvent) => { setW(c.id, w0 + ev.clientX - x0, true); window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); document.documentElement.classList.remove("cursor-col-resize"); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); document.documentElement.classList.add("cursor-col-resize");
  };
  const lead = canPromo ? 76 : 40;
  const tableW = lead + shown.reduce((a, c) => a + wOf(c), 0);

  return (
    <div data-help="catalog.table" className="rounded-2xl bg-white border border-eu-line overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-eu-line text-[length:var(--fs-13)]">
        <span className="text-eu-ink-3 tabular-nums">{total ? `${from.toLocaleString("el-GR")}–${Math.min(total, from + rows.length - 1).toLocaleString("el-GR")} από ${total.toLocaleString("el-GR")}` : "0 προϊόντα"}</span>
        <button type="button" onClick={() => setOpen(allOpen ? new Set() : new Set(rows.map((r) => r.id)))} className="inline-flex items-center gap-1 rounded-lg border border-eu-line px-2.5 min-h-9 font-bold text-eu-ink-2 hover:border-eu-navy"><ChevronDown className={`size-4 transition-transform ${allOpen ? "rotate-180" : ""}`} aria-hidden />{allOpen ? "Κλείσιμο όλων" : "Άνοιγμα όλων"}</button>
        <label className="ml-auto inline-flex items-center gap-1.5 text-eu-ink-2 font-bold">Ανά σελίδα
          <select value={perPage} onChange={(e) => { location.href = href({ n: e.target.value, page: "" }); }} className="rounded-lg border border-eu-line bg-white px-2 min-h-9 font-normal">{[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}</select>
        </label>
        <div ref={pickerRef} className="relative">
          <button type="button" aria-expanded={picker} aria-haspopup="dialog" onClick={() => setPicker((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg border border-eu-line px-2.5 min-h-9 font-bold text-eu-ink-2 hover:border-eu-navy"><Columns3 className="size-4" aria-hidden /> Στήλες ({shown.length})</button>
          {picker && (
            <div role="dialog" aria-label="Επιλογή στηλών" className="absolute right-0 top-full mt-1 z-30 w-72 max-h-[70vh] overflow-y-auto rounded-xl border border-eu-line bg-white p-2 shadow-[var(--shadow-raised)] grid gap-0.5">
              <p className="m-0 px-2 pb-1 text-eu-muted text-[length:var(--fs-12)]">Τσέκαρε όσες θέλεις· ↑ ↓ για σειρά. Το πλάτος αλλάζει σέρνοντας την άκρη της κεφαλίδας.</p>
              {[...shown, ...COLS.filter((c) => !cols.includes(c.id))].map((c) => { const on = cols.includes(c.id); const i = cols.indexOf(c.id); return (
                <div key={c.id} className="flex items-center gap-1 rounded-lg px-1 hover:bg-eu-surface">
                  <label className="flex flex-1 items-center gap-2 min-h-9 px-1 font-semibold text-[length:var(--fs-13)] cursor-pointer"><input type="checkbox" checked={on} onChange={() => toggleCol(c.id)} className="size-4 accent-eu-navy" />{c.label}{c.sort && <ArrowUpDown className="size-3 text-eu-muted" aria-label="ταξινομείται" />}</label>
                  {on && <><button type="button" disabled={i === 0} onClick={() => move(c.id, -1)} aria-label={`${c.label} αριστερότερα`} className="size-8 grid place-items-center rounded hover:bg-white disabled:opacity-30"><ArrowUp className="size-3.5" aria-hidden /></button><button type="button" disabled={i === cols.length - 1} onClick={() => move(c.id, 1)} aria-label={`${c.label} δεξιότερα`} className="size-8 grid place-items-center rounded hover:bg-white disabled:opacity-30"><ArrowDown className="size-3.5" aria-hidden /></button></>}
                </div>
              ); })}
              <button type="button" onClick={reset} className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-eu-line min-h-9 font-bold text-eu-ink-2 text-[length:var(--fs-13)] hover:border-eu-navy"><RotateCcw className="size-3.5" aria-hidden /> Προεπιλογή στηλών & πλατών</button>
            </div>
          )}
        </div>
      </div>
      <div ref={scrollRef} className="overflow-x-auto">
        <table className="table-fixed border-collapse text-[length:var(--fs-13)]" style={{ width: `max(100%, ${tableW}px)` }}>
          <colgroup><col style={{ width: 40 }} />{canPromo && <col style={{ width: 36 }} />}{shown.map((c) => <col key={c.id} style={{ width: wOf(c) }} />)}</colgroup>
          <thead className="bg-eu-surface/70 text-eu-ink-3">
            <tr>
              <th className="p-0" aria-label="Άνοιγμα γραμμής" />
              {canPromo && <th className="p-0"><span className="sr-only">Επιλογή για προσφορά</span></th>}
              {shown.map((c) => {
                const on = !!c.sort && sort === c.sort, next = on ? (dir === "asc" ? "desc" : "asc") : "";
                const I = on ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <th key={c.id} scope="col" aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : undefined} className="relative p-0 text-left font-bold text-[length:var(--fs-12)]">
                    {c.sort ? (
                      <Link href={href({ s: c.sort, d: next, page: "" })} scroll={false} className={`flex items-center gap-1 px-2 min-h-9 ${c.right ? "justify-end" : ""} hover:text-eu-navy hover:bg-eu-surface ${on ? "text-eu-navy" : ""}`}><span className="truncate">{c.label}</span><I className={`size-3 shrink-0 ${on ? "" : "opacity-40"}`} aria-hidden /></Link>
                    ) : <span title={c.title?.(rows[0])} className={`flex items-center px-2 min-h-9 ${c.right ? "justify-end" : ""}`}><span className="truncate">{c.label}</span></span>}
                    <span role="separator" aria-orientation="vertical" aria-label={`Πλάτος στήλης ${c.label}`} aria-valuenow={wOf(c)} tabIndex={0} onPointerDown={(e) => startDrag(c, e)} onDoubleClick={() => setW(c.id, c.w, true)}
                      onKeyDown={(e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); setW(c.id, wOf(c) + (e.key === "ArrowRight" ? 16 : -16), true); } }}
                      className="absolute right-0 top-1 bottom-1 w-2 cursor-col-resize touch-none after:absolute after:right-0.5 after:top-1 after:bottom-1 after:w-px after:bg-eu-line-2 hover:after:bg-eu-blue hover:after:w-0.5 focus-visible:after:bg-eu-blue focus-visible:outline-none" title="Σύρε για πλάτος · διπλό κλικ για προεπιλογή" />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isOpen = open.has(r.id);
              return (
                <Fragment key={r.id}>
                  <tr className={`border-t border-eu-line-2 ${isOpen ? "bg-eu-chip/50" : "hover:bg-eu-surface/60"} ${r.active ? "" : "text-eu-ink-3"}`}>
                    <td className="px-1 py-0.5"><button type="button" onClick={() => toggle(r.id)} onPointerEnter={() => void loadProductPeek(r.id)} onFocus={() => void loadProductPeek(r.id)} aria-expanded={isOpen} aria-controls={`ppeek-${r.id}`} aria-label={`${isOpen ? "Κλείσιμο" : "Άνοιγμα"}: ${r.title}`} className={`size-8 grid place-items-center rounded-full ${isOpen ? "bg-eu-navy text-white" : "text-eu-ink-3 hover:bg-eu-chip hover:text-eu-navy"}`}><ChevronDown className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden /></button></td>
                    {canPromo && <td className="px-1"><input type="checkbox" form="bulk-promo" name="products" value={r.id} aria-label={`Επιλογή για προσφορά: ${r.title}`} className="size-4 accent-eu-navy" /></td>}
                    {shown.map((c) => <td key={c.id} title={c.title?.(r)} className={`px-2 py-1 whitespace-nowrap overflow-hidden text-ellipsis max-w-0 ${c.right ? "text-right" : ""}`}><span className={`flex min-w-0 ${c.right ? "justify-end" : ""}`}>{c.cell(r)}</span></td>)}
                  </tr>
                  {isOpen && <tr><td colSpan={shown.length + (canPromo ? 2 : 1)} className="p-0 bg-eu-surface/40"><div className="sticky left-0 pt-1.5 min-w-0" style={{ width: viewW ?? "100%" }}><ProductPeek id={r.id} canPromo={canPromo} /></div></td></tr>}
                </Fragment>
              );
            })}
            {!rows.length && <tr><td colSpan={shown.length + (canPromo ? 2 : 1)} className="p-8 text-center text-eu-muted">Κανένα προϊόν με αυτά τα κριτήρια.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Λίστα προϊόντων για κινητό/στενή οθόνη: κάρτες με τα βασικά και ▾ που ανοίγει τις ίδιες καρτέλες. */
export function ProductCards({ rows, canPromo }: { rows: ProductRow[]; canPromo: boolean }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <ul data-help="catalog.cards" className="m-0 p-0 list-none rounded-2xl bg-white border border-eu-line divide-y divide-eu-line overflow-hidden">
      {rows.map((r) => {
        const isOpen = open.has(r.id);
        return (
          <li key={r.id} className={isOpen ? "bg-eu-surface/40" : ""}>
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-2.5 gap-y-1 px-3 py-2.5 items-center">
              <Thumb r={r} size="size-14" />
              <span className="grid min-w-0 gap-0.5">
                <Link href={`/admin/catalog/${r.id}`} className="font-bold text-eu-ink text-[length:var(--fs-14)] leading-snug line-clamp-2 hover:text-eu-blue">{r.title}</Link>
                <span className="text-eu-muted text-[length:var(--fs-12)] truncate">{r.brand} · <span className="font-mono">{r.sku}</span>{r.active ? "" : " · ανενεργό"}</span>
                <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[length:var(--fs-13)]"><Price r={r} /><span className={r.stock > 0 ? "text-eu-green font-bold" : "text-eu-muted"}>{r.stock > 0 ? `${r.stock} τεμ.` : "κατόπιν παρ."}</span><Energy r={r} />{!r.photos && <span className="text-eu-red font-bold">χωρίς φωτο</span>}</span>
              </span>
              <span className="grid justify-items-end gap-1">
                <button type="button" onClick={() => toggle(r.id)} onPointerEnter={() => void loadProductPeek(r.id)} aria-expanded={isOpen} aria-controls={`ppeek-${r.id}`} aria-label={`${isOpen ? "Κλείσιμο" : "Άνοιγμα"}: ${r.title}`} className={`size-11 grid place-items-center rounded-full border ${isOpen ? "bg-eu-navy text-white border-eu-navy" : "border-eu-line text-eu-ink-3"}`}><ChevronDown className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden /></button>
                {canPromo && <label className="size-11 grid place-items-center"><input type="checkbox" form="bulk-promo" name="products" value={r.id} aria-label={`Επιλογή για προσφορά: ${r.title}`} className="size-5 accent-eu-navy" /></label>}
              </span>
            </div>
            {isOpen && <div className="pb-1"><ProductPeek id={r.id} canPromo={canPromo} /></div>}
          </li>
        );
      })}
      {!rows.length && <li className="p-8 text-center text-eu-muted">Κανένα προϊόν με αυτά τα κριτήρια.</li>}
    </ul>
  );
}
