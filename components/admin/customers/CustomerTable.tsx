"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Columns3, RotateCcw, Building2, CircleAlert, Check } from "lucide-react";
import { CustomerPeek, loadPeek, type CustomerRow } from "./CustomerList";

type Col = { id: string; label: string; w: number; sort?: string; def?: boolean; right?: boolean; cell: (c: CustomerRow) => ReactNode; title?: (c: CustomerRow) => string };
const eur = (v: number) => `${v.toLocaleString("el-GR", { maximumFractionDigits: 0 })} €`;
const day = (s: string | null) => (s ? new Date(s).toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");
const SRC: Record<string, string> = { web: "e-shop", store: "κατάστημα", erp: "SoftOne", import: "εισαγωγή", "softone-history": "ιστορικό SoftOne", nop: "παλιό e-shop" };
const ST: Record<string, [string, string]> = { active: ["Ενεργός", "text-eu-green"], blocked: ["Μπλοκ", "text-eu-red"], anonymised: ["Ανώνυμος", "text-eu-muted"] };
const muted = (v: ReactNode) => <span className="text-eu-muted">{v}</span>;

/** Όλες οι διαθέσιμες στήλες· `def` = ορατή αρχικά. Το `sort` είναι το κλειδί ταξινόμησης του server (?s=). */
const COLS: Col[] = [
  { id: "name", label: "Πελάτης", w: 185, sort: "name", def: true, title: (c) => `${c.name} · #${c.number}`, cell: (c) => <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full">{c.business && <Building2 className="size-3.5 shrink-0 text-eu-blue" aria-label="εταιρεία" />}{c.status !== "active" && <span className={`size-2 shrink-0 rounded-full ${c.status === "blocked" ? "bg-eu-red" : "bg-eu-muted-3"}`} aria-label={ST[c.status]?.[0]} />}<Link href={`/admin/customers/${c.id}`} className="font-bold text-eu-ink hover:text-eu-blue hover:underline truncate">{c.name}</Link></span> },
  { id: "number", label: "#", w: 70, sort: "number", right: true, cell: (c) => <span className="tabular-nums text-eu-ink-3">{c.number}</span> },
  { id: "email", label: "Email", w: 180, sort: "contact", def: true, title: (c) => c.email ?? "", cell: (c) => (c.email ? <span className="truncate">{c.email}</span> : muted("—")) },
  { id: "phone", label: "Τηλέφωνο", w: 105, def: true, cell: (c) => <span className="tabular-nums">{c.phone ?? "—"}</span> },
  { id: "vat", label: "ΑΦΜ", w: 100, sort: "vat", cell: (c) => <span className="tabular-nums">{c.vat ?? "—"}</span> },
  { id: "type", label: "Τύπος", w: 90, cell: (c) => (c.business ? "Εταιρεία" : "Ιδιώτης") },
  { id: "source", label: "Πηγή", w: 120, cell: (c) => SRC[c.source] ?? c.source },
  { id: "erp", label: "SoftOne", w: 105, sort: "vat", def: true, title: (c) => c.erp.label, cell: (c) => <span className={`inline-flex items-center gap-1 truncate ${c.erp.failed ? "text-eu-red font-bold" : c.erp.linked ? "text-eu-navy font-semibold" : "text-eu-muted"}`}>{c.erp.failed && <CircleAlert className="size-3.5 shrink-0" aria-hidden />}{c.erp.label}</span> },
  { id: "orders", label: "Αγορές", w: 72, sort: "orders", def: true, right: true, cell: (c) => <span className="tabular-nums font-bold">{c.orders || muted("0")}</span> },
  { id: "total", label: "Αξία", w: 88, sort: "total", def: true, right: true, cell: (c) => <span className="tabular-nums">{c.total ? eur(c.total) : muted("—")}</span> },
  { id: "last", label: "Τελευταία", w: 88, sort: "last", def: true, cell: (c) => <span className="tabular-nums">{day(c.last)}</span> },
  { id: "devices", label: "Συσκευές", w: 85, right: true, cell: (c) => <span className="tabular-nums">{c.devices || muted("0")}</span> },
  { id: "tickets", label: "Service", w: 75, right: true, cell: (c) => <span className="tabular-nums">{c.tickets || muted("0")}</span> },
  { id: "points", label: "Πόντοι", w: 68, sort: "points", def: true, right: true, cell: (c) => <span className="tabular-nums">{c.points ? c.points.toLocaleString("el-GR") : muted("0")}</span> },
  { id: "tier", label: "Βαθμίδα", w: 85, cell: (c) => c.tier ?? muted("—") },
  { id: "store", label: "Κατάστημα", w: 115, sort: "store", def: true, title: (c) => c.store ?? "", cell: (c) => <span className="truncate">{c.store ?? "—"}</span> },
  { id: "city", label: "Πόλη", w: 120, cell: (c) => <span className="truncate">{c.city ?? "—"}</span> },
  { id: "region", label: "Νομός", w: 130, cell: (c) => <span className="truncate">{c.region ?? "—"}</span> },
  { id: "km", label: "Απόσταση", w: 85, right: true, cell: (c) => <span className="tabular-nums">{c.km != null ? `${c.km.toFixed(1)} km` : "—"}</span> },
  { id: "newsletter", label: "Newsletter", w: 90, cell: (c) => (c.newsletter ? <Check className="size-4 text-eu-green" aria-label="ναι" /> : muted("—")) },
  { id: "status", label: "Κατάσταση", w: 95, sort: "status", cell: (c) => <span className={`font-bold ${ST[c.status]?.[1] ?? ""}`}>{ST[c.status]?.[0] ?? c.status}</span> },
  { id: "tags", label: "Ετικέτες", w: 130, title: (c) => c.tags.join(", "), cell: (c) => <span className="truncate">{c.tags.join(", ") || "—"}</span> },
  { id: "created", label: "Μέλος από", w: 100, sort: "created", cell: (c) => <span className="tabular-nums">{day(c.created)}</span> },
];
const DEFAULT = COLS.filter((c) => c.def).map((c) => c.id);
const KEY_COLS = "eu.customers.cols", KEY_W = "eu.customers.widths.v2";
const read = <T,>(k: string): T | null => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* χωρίς αποθήκευση */ } };

/**
 * Πίνακας πελατών για υπολογιστή: πυκνές γραμμές μίας σειράς, επιλογή στηλών (και σειράς τους), αλλαγή πλάτους με
 * σύρσιμο ή βέλη στη λαβή, ταξινόμηση σε κάθε στήλη που το υποστηρίζει, εγγραφές ανά σελίδα, και άνοιγμα γραμμής (▾)
 * σε όλη την εικόνα του πελάτη. Στήλες και πλάτη θυμάται ο browser.
 */
export function CustomerTable({ rows, sort, dir, query, perPage, total, from }: { rows: CustomerRow[]; sort: string; dir: "asc" | "desc"; query: Record<string, string>; perPage: number; total: number; from: number }) {
  const [cols, setCols] = useState<string[]>(DEFAULT);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  // προτιμήσεις του χρήστη από τον browser (μετά το πρώτο render, ώστε server και client να ξεκινούν ίδια)
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

  const startDrag = (c: Col, e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, w0 = wOf(c);
    const mv = (ev: PointerEvent) => setW(c.id, w0 + ev.clientX - x0);
    const up = (ev: PointerEvent) => { setW(c.id, w0 + ev.clientX - x0, true); window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); document.documentElement.classList.remove("cursor-col-resize"); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); document.documentElement.classList.add("cursor-col-resize");
  };
  const tableW = 40 + shown.reduce((a, c) => a + wOf(c), 0);

  return (
    <div data-help="customers.table" className="rounded-2xl bg-white border border-eu-line overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-eu-line text-[length:var(--fs-13)]">
        <span className="text-eu-ink-3 tabular-nums">{total ? `${from.toLocaleString("el-GR")}–${Math.min(total, from + rows.length - 1).toLocaleString("el-GR")} από ${total.toLocaleString("el-GR")}` : "0 πελάτες"}</span>
        <label className="ml-auto inline-flex items-center gap-1.5 text-eu-ink-2 font-bold">Ανά σελίδα
          <select value={perPage} onChange={(e) => { location.href = href({ n: e.target.value, p: "" }); }} className="rounded-lg border border-eu-line bg-white px-2 min-h-9 font-normal">{[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}</select>
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
      <div className="overflow-x-auto">
        <table className="table-fixed border-collapse text-[length:var(--fs-13)]" style={{ width: `max(100%, ${tableW}px)` }}>
          <colgroup><col style={{ width: 40 }} />{shown.map((c) => <col key={c.id} style={{ width: wOf(c) }} />)}</colgroup>
          <thead className="bg-eu-surface/70 text-eu-ink-3">
            <tr>
              <th className="p-0" aria-label="Άνοιγμα γραμμής" />
              {shown.map((c) => {
                const on = !!c.sort && sort === c.sort, next = on ? (dir === "asc" ? "desc" : "asc") : "";
                const I = on ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <th key={c.id} scope="col" aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : undefined} className="relative p-0 text-left font-bold text-[length:var(--fs-12)]">
                    {c.sort ? (
                      <Link href={href({ s: c.sort, d: next, p: "" })} scroll={false} className={`flex items-center gap-1 px-2 min-h-9 ${c.right ? "justify-end" : ""} hover:text-eu-navy hover:bg-eu-surface ${on ? "text-eu-navy" : ""}`}><span className="truncate">{c.label}</span><I className={`size-3 shrink-0 ${on ? "" : "opacity-40"}`} aria-hidden /></Link>
                    ) : <span className={`flex items-center px-2 min-h-9 ${c.right ? "justify-end" : ""}`}><span className="truncate">{c.label}</span></span>}
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
                  <tr className={`border-t border-eu-line-2 ${isOpen ? "bg-eu-chip/50" : "hover:bg-eu-surface/60"}`}>
                    <td className="px-1 py-0.5"><button type="button" onClick={() => toggle(r.id)} onPointerEnter={() => void loadPeek(r.id)} onFocus={() => void loadPeek(r.id)} aria-expanded={isOpen} aria-label={`${isOpen ? "Κλείσιμο" : "Άνοιγμα"}: ${r.name}`} className={`size-8 grid place-items-center rounded-full ${isOpen ? "bg-eu-navy text-white" : "text-eu-ink-3 hover:bg-eu-chip hover:text-eu-navy"}`}><ChevronDown className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden /></button></td>
                    {shown.map((c) => <td key={c.id} title={c.title?.(r)} className={`px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis max-w-0 ${c.right ? "text-right" : ""}`}><span className={`flex min-w-0 ${c.right ? "justify-end" : ""}`}>{c.cell(r)}</span></td>)}
                  </tr>
                  {isOpen && <tr><td colSpan={shown.length + 1} className="p-0 bg-eu-surface/40"><div className="sticky left-0 max-w-[min(100%,calc(100vw-2rem))] pt-2"><CustomerPeek id={r.id} /></div></td></tr>}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
