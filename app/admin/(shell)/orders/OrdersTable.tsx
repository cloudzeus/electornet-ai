"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronRight, Download, FileText, Loader2, MessageSquare, Package, RotateCcw, Store, Truck, X } from "lucide-react";
import type { OrderRow } from "@/lib/orders/admin";
import { ORDER_STATUS, type OrderStatus } from "@/lib/orders/model";
import { payLabel } from "@/lib/account/labels";
import { Badge, OrderStatusBadge, ago, eur } from "@/components/admin/orders/ui";
import { bulkStatusAction } from "./actions";

const BULK: { to: OrderStatus; label: string; notify?: boolean }[] = [
  { to: "processing", label: "Σε επεξεργασία" },
  { to: "ready-for-pickup", label: "Έτοιμη για παραλαβή", notify: true },
  { to: "delivered", label: "Παραδόθηκε", notify: true },
];

/** Πυκνός πίνακας παραγγελιών με επιλογή και μπάρα μαζικών ενεργειών· σε στενή οθόνη κάρτες. */
export function OrdersTable({ rows, canWrite, exportBase, empty }: { rows: OrderRow[]; canWrite: boolean; exportBase: string; empty: "none" | "filtered" | null }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [notify, setNotify] = useState(true);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const allOn = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const pick = (id: string, on: boolean) => setSel((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const bulk = (to: OrderStatus) => {
    if (!window.confirm(`«${ORDER_STATUS[to].label}» για ${sel.size} παραγγελίες;${notify && BULK.find((b) => b.to === to)?.notify ? " Οι πελάτες θα ενημερωθούν με email." : ""}`)) return;
    start(async () => { const r = await bulkStatusAction([...sel], to, notify); setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error }); setSel(new Set()); router.refresh(); });
  };

  if (empty) return (
    <div className="rounded-xl border border-dashed border-eu-line bg-white px-4 py-10 grid justify-items-center gap-2 text-center">
      <Package className="size-8 text-eu-muted" aria-hidden />
      <p className="m-0 font-bold text-eu-ink text-[length:var(--fs-15)]">{empty === "none" ? "Δεν υπάρχουν ακόμη παραγγελίες" : "Καμία παραγγελία με αυτά τα κριτήρια"}</p>
      <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)] max-w-[52ch]">{empty === "none" ? "Οι παραγγελίες του e-shop εμφανίζονται εδώ μόλις ολοκληρωθεί το checkout — με πληρωμή, αποστολή και ό,τι χρειάζεται για να προχωρήσουν." : "Άλλαξε την προβολή ή καθάρισε τα φίλτρα."}</p>
    </div>
  );

  return (
    <div className="grid gap-2 min-w-0">
      {msg && <p role="status" className={`m-0 rounded-lg px-3 py-2 font-bold text-[length:var(--fs-13)] ${msg.ok ? "bg-eu-green/10 text-eu-green" : "bg-eu-red/10 text-eu-red"}`}>{msg.text}</p>}
      <div data-help="orders.list" className="rounded-xl border border-eu-line bg-white overflow-hidden">
        <div className="hidden @4xl:grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.5fr)_7rem_minmax(0,1.05fr)_minmax(0,0.95fr)_1.5rem] gap-x-3 px-3 py-1.5 bg-eu-surface/70 border-b border-eu-line text-eu-ink-3 font-bold text-[length:var(--fs-12)] items-center">
          {canWrite ? <input type="checkbox" aria-label="Επιλογή όλων" checked={allOn} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} className="size-4 accent-eu-navy" /> : <span />}
          <span>Παραγγελία</span><span>Πελάτης</span><span>Προϊόντα</span><span className="text-right">Σύνολο</span><span>Παράδοση</span><span>Κατάσταση</span><span className="sr-only">Άνοιγμα</span>
        </div>
        <ul className="m-0 p-0 list-none divide-y divide-eu-line-2">
          {rows.map((r) => {
            const href = `/admin/orders/${encodeURIComponent(r.number)}`;
            const alerts = [
              r.paymentStatus === "failed" && "Η πληρωμή απέτυχε",
              r.erp === "failed" && "Αποτυχία αποστολής στο SoftOne",
              r.shipment && ["attempted", "returning"].includes(r.shipment.status) && "Πρόβλημα στην αποστολή",
            ].filter(Boolean) as string[];
            return (
              <li key={r.id} className={`relative grid grid-cols-[2rem_minmax(0,1fr)_auto] @4xl:grid-cols-[2rem_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.5fr)_7rem_minmax(0,1.05fr)_minmax(0,0.95fr)_1.5rem] gap-x-3 gap-y-1 px-3 py-2 items-center hover:bg-eu-surface/50 ${sel.has(r.id) ? "bg-eu-chip/40" : ""}`}>
                {canWrite ? <input type="checkbox" aria-label={`Επιλογή ${r.number}`} checked={sel.has(r.id)} onChange={(e) => pick(r.id, e.target.checked)} className="relative z-10 size-4 accent-eu-navy row-span-4 @4xl:row-span-1 self-start @4xl:self-center mt-1 @4xl:mt-0" /> : <span className="row-span-4 @4xl:row-span-1" />}
                {/* όλη η γραμμή ανοίγει την καρτέλα· τα κουτάκια μένουν πάνω από τον σύνδεσμο */}
                <span className="grid min-w-0 leading-tight">
                  <Link href={href} className="font-mono font-bold text-eu-ink text-[length:var(--fs-13)] whitespace-nowrap truncate hover:text-eu-blue after:absolute after:inset-0 after:content-['']">{r.number}</Link>
                  <span className="text-eu-muted text-[length:var(--fs-12)]" title={new Date(r.createdAt).toLocaleString("el-GR")}>{ago(r.createdAt)}</span>
                </span>
                <span className="col-start-3 row-start-1 @4xl:hidden justify-self-end"><OrderStatusBadge status={r.status} /></span>
                {/* κινητό: μία γραμμή «ποσό · πληρωμή · παράδοση» */}
                <span className="col-start-2 col-span-2 @4xl:hidden flex items-center gap-1.5 min-w-0 text-[length:var(--fs-12)] text-eu-ink-3">
                  <b className="text-eu-ink text-[length:var(--fs-14)] tabular-nums">{eur(r.total)}</b>
                  <span className="truncate">· {payLabel(r.paymentMethod)}</span>
                  <span className="ml-auto inline-flex items-center gap-1 min-w-0 shrink-0 max-w-[45%]">{r.fulfilment === "click-collect" ? <Store className="size-3.5 shrink-0 text-eu-blue" aria-hidden /> : <Truck className="size-3.5 shrink-0 text-eu-blue" aria-hidden />}<span className="truncate">{r.fulfilment === "click-collect" ? r.store ?? "Κατάστημα" : r.shipment?.voucher ?? (["pending", "paid", "processing"].includes(r.status) ? "Χωρίς voucher" : "Courier")}</span></span>
                </span>
                <span data-private className="col-start-2 col-span-2 @4xl:col-span-1 @4xl:col-start-auto grid min-w-0 leading-tight text-[length:var(--fs-13)]">
                  <span className="font-bold text-eu-ink-2 truncate">{r.name}{r.invoice && <Badge tone="info" className="ml-1.5 align-middle" title="Ζητήθηκε τιμολόγιο">Τιμ.</Badge>}</span>
                  <span className="text-eu-muted truncate text-[length:var(--fs-12)]">{[r.company, r.city].filter(Boolean).join(" · ") || r.email}</span>
                </span>
                <span className="col-start-2 col-span-2 @4xl:col-span-1 @4xl:col-start-auto flex items-center gap-2 min-w-0">
                  <span className="relative size-9 shrink-0 rounded-md bg-eu-surface overflow-hidden hidden @md:block">{r.thumb && <Image src={r.thumb} alt="" fill sizes="36px" className="object-contain" unoptimized={r.thumb.startsWith("http")} />}</span>
                  <span className="grid min-w-0 leading-tight text-[length:var(--fs-13)]">
                    <span className="text-eu-ink-2 truncate" title={r.firstItem ?? ""}>{r.firstItem ?? "—"}</span>
                    <span className="text-eu-muted text-[length:var(--fs-12)]">{r.items} τεμ.{r.more ? ` · +${r.more} ακόμη` : ""}</span>
                  </span>
                </span>
                <span className="hidden @4xl:grid text-right leading-tight">
                  <span className="font-bold text-eu-ink tabular-nums text-[length:var(--fs-14)]">{eur(r.total)}</span>
                  <span className="text-eu-muted text-[length:var(--fs-12)] truncate">{payLabel(r.paymentMethod)}{r.instalments > 1 ? ` · ${r.instalments} δόσεις` : ""}</span>
                </span>
                <span className="hidden @4xl:inline-flex items-center gap-1.5 min-w-0 text-[length:var(--fs-12)] text-eu-ink-3">
                  {r.fulfilment === "click-collect" ? <Store className="size-4 shrink-0 text-eu-blue" aria-hidden /> : <Truck className="size-4 shrink-0 text-eu-blue" aria-hidden />}
                  <span className="truncate">{r.fulfilment === "click-collect" ? r.store ?? "Κατάστημα" : r.shipment?.voucher ? <span className="font-mono">{r.shipment.voucher}</span> : r.fulfilment === "appointment" ? "Ραντεβού" : ["pending", "paid", "processing"].includes(r.status) ? <span className="text-eu-amber font-bold">Χωρίς voucher</span> : "Courier"}</span>
                </span>
                <span className={`col-start-2 col-span-2 @4xl:col-span-1 @4xl:col-start-auto flex-wrap items-center gap-1 ${alerts.length || r.returns || r.notes ? "flex" : "hidden @4xl:flex"}`}>
                  <span className="hidden @4xl:inline-flex"><OrderStatusBadge status={r.status} /></span>
                  {alerts.length > 0 && <span title={alerts.join(" · ")} className="inline-flex items-center gap-0.5 text-eu-red font-bold text-[length:var(--fs-12)]"><AlertTriangle className="size-3.5" aria-hidden /><span className="sr-only">{alerts.join(", ")}</span>{alerts.length > 1 ? alerts.length : ""}</span>}
                  {r.returns > 0 && <span title={`${r.returns} αίτημα επιστροφής`} className="inline-flex items-center text-eu-amber"><RotateCcw className="size-3.5" aria-hidden /><span className="sr-only">Επιστροφή</span></span>}
                  {r.notes > 0 && <span title={`${r.notes} σημειώσεις`} className="inline-flex items-center gap-0.5 text-eu-muted text-[length:var(--fs-12)]"><MessageSquare className="size-3.5" aria-hidden />{r.notes}</span>}
                </span>
                <ChevronRight className="hidden @4xl:block size-4 text-eu-muted" aria-hidden />
              </li>
            );
          })}
        </ul>
      </div>

      {/* μπάρα μαζικών ενεργειών — εμφανίζεται με την επιλογή */}
      {canWrite && sel.size > 0 && (
        <div role="region" aria-label="Μαζικές ενέργειες" data-help="orders.bulk" className="sticky bottom-3 z-30 flex flex-wrap items-center gap-1.5 rounded-xl bg-eu-navy text-white px-3 py-2 shadow-lg">
          <span className="font-bold text-[length:var(--fs-13)] mr-1 tabular-nums">{sel.size} επιλεγμένες</span>
          {BULK.map((b) => <button key={b.to} type="button" disabled={pending} onClick={() => bulk(b.to)} className="inline-flex items-center rounded-full bg-white/10 hover:bg-white/20 px-3 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] disabled:opacity-50">{b.label}</button>)}
          <label className="inline-flex items-center gap-1.5 text-[length:var(--fs-12)] min-h-11 md:min-h-9 px-1.5 cursor-pointer"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-4 accent-eu-yellow" />Email στους πελάτες</label>
          <a href={`${exportBase}${exportBase.includes("?") ? "&" : "?"}ids=${[...sel].join(",")}`} className="inline-flex items-center gap-1 rounded-full bg-white/10 hover:bg-white/20 px-3 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)]"><Download className="size-4" aria-hidden /> CSV</a>
          <a href={`/admin/apostoles/vouchers`} className="inline-flex items-center gap-1 rounded-full bg-white/10 hover:bg-white/20 px-3 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)]"><FileText className="size-4" aria-hidden /> Vouchers</a>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          <button type="button" onClick={() => setSel(new Set())} aria-label="Καθαρισμός επιλογής" className="ml-auto size-11 md:size-9 grid place-items-center rounded-full hover:bg-white/10"><X className="size-4" aria-hidden /></button>
        </div>
      )}
    </div>
  );
}
