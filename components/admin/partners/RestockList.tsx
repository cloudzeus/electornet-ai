import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { linesOf, modeOf, restockStatusOf, SHIP_MODE, type ShipMode } from "@/lib/partner-portal/restock-model";
import { RestockDecision } from "./RestockDecision";

/** Ό,τι χρειάζεται η λίστα — το ίδιο include σε Αναπληρώσεις, καρτέλα παραγγελίας και καρτέλα συνεργάτη. */
export const RESTOCK_INCLUDE = {
  partner: { select: { id: true, name: true } },
  store: { select: { name: true, city: true } },
  pickupStore: { select: { name: true, city: true, address: true, phone: true } },
  order: { select: { number: true } },
} satisfies Prisma.PartnerRestockInclude;
type Row = Prisma.PartnerRestockGetPayload<{ include: typeof RESTOCK_INCLUDE }>;

const fmt = (d: Date | null) => (d ? d.toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }) : "—");
const TONE = { neutral: "bg-eu-surface-2 text-eu-ink-2", info: "bg-eu-chip text-eu-blue", good: "bg-emerald-50 text-emerald-900", warn: "bg-amber-50 text-amber-900", bad: "bg-red-50 text-red-800" } as const;

/** Αιτήματα αναπλήρωσης με πλήρη πληροφορία και τις ενέργειες της κατάστασής τους. `hide` κρύβει ό,τι είναι ήδη γνωστό από τη σελίδα. */
export function RestockList({ rows, canWrite, hide = {} }: { rows: Row[]; canWrite: boolean; hide?: { partner?: boolean; order?: boolean } }) {
  return (
    <ul data-help="restock.list" className="m-0 p-0 list-none grid gap-2">
      {rows.map((r) => {
        const mode = modeOf(r);
        const st = restockStatusOf(r.status, mode);
        return (
          <li key={r.id} className="rounded-xl border border-eu-line bg-white p-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <div className="grid gap-1.5 min-w-0 content-start">
              <div className="flex flex-wrap items-center gap-2">
                <b className="font-heading text-[length:var(--fs-16)]">{r.number}</b>
                <span className={`rounded-full px-2.5 py-0.5 font-bold text-[length:var(--fs-12)] ${TONE[st.tone]}`}>{st.label}</span>
                <span className="text-eu-ink-3 text-[length:var(--fs-13)]">{fmt(r.createdAt)}</span>
              </div>
              {!hide.partner && <p className="m-0 text-[length:var(--fs-14)] break-words"><Link href={`/admin/synergates/${r.partner.id}`} className="font-bold text-eu-blue hover:underline">{r.partner.name}</Link>{r.store ? ` · ${r.store.name}${r.store.city ? `, ${r.store.city}` : ""}` : ""}</p>}
              {!hide.order && r.order && <p className="m-0 text-[length:var(--fs-13)] text-eu-ink-3">Από την παραγγελία <Link href={`/admin/orders/${r.order.number}`} className="font-bold text-eu-blue hover:underline">{r.order.number}</Link></p>}
              <ul className="m-0 p-0 list-none grid gap-1">
                {linesOf(r.lines).map((l, i) => <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-lg bg-eu-surface-2 px-3 py-1.5 text-[length:var(--fs-14)]"><span className="min-w-0 break-words">{l.title}{l.erpCode && <span className="text-eu-ink-3 text-[length:var(--fs-12)]"> · {l.erpCode}</span>}</span><b className="tabular-nums">{l.qty} τεμ.</b></li>)}
              </ul>
              <p className="m-0 text-[length:var(--fs-13)]">Ζήτησε: <b>{SHIP_MODE[r.shipMode as ShipMode]?.label ?? r.shipMode}</b>{r.approvedMode && r.approvedMode !== r.shipMode ? <> · εγκρίθηκε: <b>{SHIP_MODE[mode].label}</b></> : null}</p>
              {r.pickupStore && <p className="m-0 text-[length:var(--fs-13)] break-words">Παραλαβή από: <b>{r.pickupStore.name}</b>, {[r.pickupStore.address, r.pickupStore.city].filter(Boolean).join(", ")}{r.pickupStore.phone ? ` · ${r.pickupStore.phone}` : ""}</p>}
              {r.note && <p className="m-0 text-[length:var(--fs-13)] text-eu-ink-2 break-words"><b>Σημείωση μέλους:</b> {r.note}</p>}
              {r.reply && <p className="m-0 text-[length:var(--fs-13)] text-eu-ink-2 break-words"><b>Μήνυμα Euronics:</b> {r.reply}</p>}
              {r.decidedAt && <p className="m-0 text-[length:var(--fs-12)] text-eu-ink-3">Απόφαση {fmt(r.decidedAt)}{r.readyAt ? ` · έτοιμο ${fmt(r.readyAt)}` : ""}{r.shippedAt ? ` · ${mode === "pickup" ? "παραλήφθηκε" : "στάλθηκε"} ${fmt(r.shippedAt)}` : ""}{r.seenAt ? " · το είδε το μέλος" : ""}</p>}
            </div>
            <div className="min-w-0">{canWrite ? <RestockDecision id={r.id} status={r.status} shipMode={r.shipMode} approvedMode={r.approvedMode} /> : <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Μόνο ανάγνωση.</p>}</div>
          </li>
        );
      })}
    </ul>
  );
}
