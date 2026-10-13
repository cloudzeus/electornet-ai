"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { ChevronDown, FileDown, FileText, Loader2, Printer, RefreshCw, Search, X } from "lucide-react";
import { ShipmentTracker, StatusBadge, fmtAt } from "@/components/shipping/ShipmentTracker";
import type { ShipmentTimeline } from "@/lib/couriers/timeline-model";
import { CancelVoucher } from "./VoucherControls";
import { voucherTimelineAction } from "./actions";

export interface BoardRow {
  id: string; voucher: string | null; sub: number; status: string; test: boolean; order: string; name: string; place: string;
  pieces: number; kg: number; cod: number; createdAt: string; last: { text?: string; at?: string | null; shop?: string | null } | null; error: string | null;
}

const FILTERS = [
  { id: "all", label: "Όλα", match: (s: string) => s !== "cancelled" },
  { id: "open", label: "Ανοιχτά", match: (s: string) => s === "created" },
  { id: "moving", label: "Σε διαδρομή", match: (s: string) => ["closed", "in-transit", "out-for-delivery", "on-hold"].includes(s) },
  { id: "problem", label: "Προβλήματα", match: (s: string) => ["attempted", "returning", "returned"].includes(s) },
  { id: "delivered", label: "Παραδόθηκαν", match: (s: string) => s === "delivered" },
  { id: "cancelled", label: "Ακυρωμένα", match: (s: string) => s === "cancelled" },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];
const eur = (n: number) => n.toLocaleString("el-GR", { style: "currency", currency: "EUR" });
const chip = "inline-flex items-center gap-1.5 rounded-full border border-eu-line bg-white font-bold text-[length:var(--fs-13)] px-3 min-h-11 md:min-h-9 hover:border-eu-navy disabled:opacity-45";

/** Πίνακας vouchers (ui-ux-pro-max): φίλτρα κατάστασης με πλήθη, αναζήτηση, επιλογή, εκτύπωση (ετικέτες / δελτίο / όλα), widget παρακολούθησης σε κάθε γραμμή. */
export function VouchersBoard({ rows, canWrite, courier }: { rows: BoardRow[]; canWrite: boolean; courier: string }) {
  const [filter, setFilter] = useState<FilterId>(rows.some((r) => r.status === "created") ? "open" : "all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [tl, setTl] = useState<Record<string, ShipmentTimeline | null | "loading">>({});
  const [, start] = useTransition();

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, rows.filter((r) => f.match(r.status)).length])) as Record<FilterId, number>, [rows]);
  const shown = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter)!, t = q.trim().toLowerCase();
    return rows.filter((r) => f.match(r.status) && (!t || [r.voucher, r.order, r.name, r.place].some((v) => (v ?? "").toLowerCase().includes(t))));
  }, [rows, filter, q]);
  const printable = (r: BoardRow) => r.status !== "cancelled" && !!r.voucher;
  const openIds = rows.filter((r) => r.status === "created").map((r) => r.id);
  const target = sel.size ? [...sel] : openIds;
  const targetLabel = sel.size ? `${sel.size} επιλεγμένα` : `${openIds.length} ανοιχτά`;
  const allShown = shown.filter(printable);
  const allOn = allShown.length > 0 && allShown.every((r) => sel.has(r.id));

  const load = (id: string, fresh = false) => {
    setTl((m) => ({ ...m, [id]: "loading" }));
    start(async () => { const t = await voucherTimelineAction(id, fresh).catch(() => null); setTl((m) => ({ ...m, [id]: t })); });
  };
  const toggle = (id: string) => { const next = open === id ? null : id; setOpen(next); if (next && !tl[next]) load(next); };
  const pick = (id: string, on: boolean) => setSel((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const url = (kind: "label" | "deltio" | "all") => `/api/admin/shipments/${kind === "label" ? "label" : "deltio"}?ids=${target.join(",")}${kind === "all" ? "&labels=1" : ""}`;

  return (
    <div className="grid gap-2 min-w-0">
      {/* φίλτρα + αναζήτηση */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Κατάσταση" className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)} className={`inline-flex items-center gap-1.5 rounded-full px-3 min-h-11 md:min-h-8 font-bold text-[length:var(--fs-13)] ${filter === f.id ? "bg-eu-navy text-white" : "bg-white border border-eu-line text-eu-ink-3 hover:text-eu-navy"}`}>
              {f.label}<span className={`tabular-nums text-[length:var(--fs-12)] ${filter === f.id ? "text-white/75" : f.id === "problem" && counts.problem ? "text-eu-red" : "text-eu-muted"}`}>{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <label className="relative ml-auto w-full @2xl:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-eu-muted" aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Voucher, παραγγελία, όνομα…" aria-label="Αναζήτηση vouchers" className="w-full rounded-lg border border-eu-line bg-white pl-8 pr-2.5 min-h-11 md:min-h-9 text-[length:var(--fs-14)] outline-none focus:border-eu-blue" />
        </label>
      </div>

      {/* εκτύπωση: επιλεγμένα ή όλα τα ανοιχτά */}
      <div data-help="vouchers.print" className="flex flex-wrap items-center gap-1.5 rounded-xl border border-eu-line bg-white px-2.5 py-1.5">
        <span className="inline-flex items-center gap-1.5 font-bold text-eu-ink-2 text-[length:var(--fs-13)] mr-1"><Printer className="size-4 text-eu-blue" aria-hidden />{target.length ? `Εκτύπωση για ${targetLabel}` : "Εκτύπωση"}</span>
        {target.length > 0 ? <>
          <a href={url("label")} target="_blank" rel="noreferrer" className={chip}><FileDown className="size-4" aria-hidden /> Ετικέτες</a>
          <a href={url("deltio")} target="_blank" rel="noreferrer" className={chip}><FileText className="size-4" aria-hidden /> Δελτίο παράδοσης</a>
          <a href={url("all")} target="_blank" rel="noreferrer" className={`${chip} !bg-eu-navy !border-eu-navy text-white hover:!bg-eu-blue`}><Printer className="size-4" aria-hidden /> Όλα σε ένα PDF</a>
        </> : <span className="text-eu-muted text-[length:var(--fs-13)]">Δεν υπάρχουν ανοιχτά vouchers — επίλεξε από τη λίστα.</span>}
        {sel.size > 0 && <button type="button" onClick={() => setSel(new Set())} className="ml-auto inline-flex items-center gap-1 text-eu-ink-3 font-bold text-[length:var(--fs-13)] min-h-11 md:min-h-8 px-2 hover:text-eu-navy"><X className="size-4" aria-hidden /> Καθαρισμός επιλογής</button>}
      </div>

      <div data-help="vouchers.list" className="rounded-xl border border-eu-line bg-white overflow-hidden">
        <div className="hidden @4xl:grid grid-cols-[2rem_minmax(0,1.15fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1.4fr)_auto] gap-x-3 px-3 py-1.5 bg-eu-surface/70 border-b border-eu-line text-eu-ink-3 font-bold text-[length:var(--fs-12)] items-center">
          <input type="checkbox" aria-label="Επιλογή όλων" checked={allOn} onChange={(e) => setSel(e.target.checked ? new Set(allShown.map((r) => r.id)) : new Set())} className="size-4 accent-eu-navy" />
          <span>Voucher · κατάσταση</span><span>Παραγγελία · παραλήπτης</span><span>Τεμ. · κιλά · αντικ/βολή</span><span>Τελευταία κίνηση</span><span className="sr-only">Ενέργειες</span>
        </div>
        {!shown.length ? (
          <p className="m-0 px-3 py-6 text-center text-eu-muted text-[length:var(--fs-14)]">{rows.length ? "Κανένα voucher με αυτό το φίλτρο." : `Δεν έχουν εκδοθεί ακόμη vouchers ${courier}.`}</p>
        ) : (
          <ul className="m-0 p-0 list-none divide-y divide-eu-line-2">
            {shown.map((r) => {
              const isOpen = open === r.id, t = tl[r.id];
              return (
                <Fragment key={r.id}>
                  <li className={`grid grid-cols-[2rem_minmax(0,1fr)] @4xl:grid-cols-[2rem_minmax(0,1.15fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1.4fr)_auto] gap-x-3 gap-y-1 px-3 py-2 items-center ${sel.has(r.id) ? "bg-eu-chip/40" : ""}`}>
                    <input type="checkbox" aria-label={`Επιλογή ${r.voucher ?? r.order}`} disabled={!printable(r)} checked={sel.has(r.id)} onChange={(e) => pick(r.id, e.target.checked)} className="size-4 accent-eu-navy row-span-5 @4xl:row-span-1 self-start @4xl:self-center mt-1 @4xl:mt-0" />
                    <span className="grid gap-0.5 min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5"><span className="font-mono font-bold text-eu-ink tabular-nums text-[length:var(--fs-13)]">{r.voucher ?? "—"}</span>{r.sub > 0 && <span className="text-eu-muted text-[length:var(--fs-12)]">+{r.sub}</span>}{r.test && <span className="rounded px-1 bg-eu-surface text-eu-ink-3 font-bold text-[length:var(--fs-12)]">test</span>}</span>
                      <StatusBadge status={r.status} className="justify-self-start" />
                    </span>
                    <span className="grid min-w-0 col-start-2 @4xl:col-start-auto text-[length:var(--fs-13)]">
                      <span className="font-bold text-eu-ink-2 truncate">{r.order}</span>
                      <span data-private className="text-eu-ink-3 truncate">{r.name}{r.place ? ` · ${r.place}` : ""}</span>
                    </span>
                    <span className="col-start-2 @4xl:col-start-auto text-eu-ink-3 text-[length:var(--fs-13)] tabular-nums">{r.pieces} τεμ. · {r.kg.toLocaleString("el-GR")} κ.{r.cod > 0 ? <> · <b className="text-eu-ink">{eur(r.cod)}</b></> : ""}</span>
                    <span className="col-start-2 @4xl:col-start-auto min-w-0 text-[length:var(--fs-13)]">
                      {r.last?.text ? <><span className="block text-eu-ink-2 truncate" title={r.last.text}>{r.last.text}</span><span className="block text-eu-muted text-[length:var(--fs-12)] tabular-nums">{fmtAt(r.last.at)}{r.last.shop ? ` · ${r.last.shop}` : ""}</span></> : <span className="text-eu-muted">Εκδόθηκε {new Date(r.createdAt).toLocaleString("el-GR", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}</span>}
                      {r.error && <span className="block text-eu-red text-[length:var(--fs-12)] truncate" title={r.error}>{r.error}</span>}
                    </span>
                    <span className="col-start-2 @4xl:col-start-auto flex items-center gap-0.5 -ml-2.5 @4xl:ml-0 @4xl:justify-end">
                      {printable(r) && <a href={`/api/admin/shipments/label?ids=${r.id}`} target="_blank" rel="noreferrer" aria-label={`Ετικέτα ${r.voucher}`} title="Ετικέτα" className="size-11 md:size-8 grid place-items-center rounded-full text-eu-ink-3 hover:bg-eu-surface hover:text-eu-navy"><FileDown className="size-4" aria-hidden /></a>}
                      {canWrite && r.status === "created" && <CancelVoucher id={r.id} courier={courier} compact />}
                      {r.voucher && <button type="button" onClick={() => toggle(r.id)} aria-expanded={isOpen} aria-label={`Παρακολούθηση ${r.voucher}`} title="Παρακολούθηση" className={`size-11 md:size-8 grid place-items-center rounded-full hover:bg-eu-surface ${isOpen ? "text-eu-navy bg-eu-surface" : "text-eu-ink-3"}`}><ChevronDown className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden /></button>}
                    </span>
                  </li>
                  {isOpen && (
                    <li className="px-3 pb-3 pt-1 bg-eu-surface/40" data-private>
                      <div className="rounded-xl border border-eu-line bg-white p-3 grid gap-2 max-w-3xl @4xl:ml-8">
                        {t === "loading" || t === undefined ? <p className="m-0 inline-flex items-center gap-2 text-eu-muted text-[length:var(--fs-13)]"><Loader2 className="size-4 animate-spin" aria-hidden /> Φόρτωση από τον courier…</p>
                          : t ? <>
                            <ShipmentTracker t={t} audience="staff" historyOpen />
                            <div className="flex items-center gap-2 text-eu-muted text-[length:var(--fs-12)]">
                              {t.checkedAt && <span>Ενημέρωση {new Date(t.checkedAt).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}</span>}
                              <button type="button" onClick={() => load(r.id, true)} className="inline-flex items-center gap-1 font-bold text-eu-blue hover:underline min-h-11 md:min-h-0"><RefreshCw className="size-3.5" aria-hidden /> Ανανέωση τώρα</button>
                            </div>
                          </> : <p className="m-0 text-eu-red text-[length:var(--fs-13)]">Δεν βρέθηκε η αποστολή.</p>}
                      </div>
                    </li>
                  )}
                </Fragment>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
