import Link from "next/link";
import { FileDown, Truck } from "lucide-react";
import { can } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { genikiConfig } from "@/lib/couriers/geniki/client";
import { shipmentDraft } from "@/lib/couriers/shipments";
import { CancelVoucher, CreateVoucher, DayActions } from "./VoucherControls";

export const metadata = { title: "Vouchers · Γενική Ταχυδρομική" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; tone: string }> = {
  created: { label: "Εκδόθηκε · ανοιχτό", tone: "bg-eu-amber/15 text-eu-ink-2" },
  closed: { label: "Παραδόθηκε στη Γενική", tone: "bg-eu-chip text-eu-blue" },
  "in-transit": { label: "Σε μεταφορά", tone: "bg-eu-chip text-eu-blue" },
  "out-for-delivery": { label: "Σε διανομή", tone: "bg-eu-chip text-eu-blue" },
  attempted: { label: "Ανεπιτυχής επίδοση", tone: "bg-eu-red/10 text-eu-red" },
  "on-hold": { label: "Σε αναμονή παραλαβής", tone: "bg-eu-amber/15 text-eu-ink-2" },
  returning: { label: "Επιστρέφει", tone: "bg-eu-red/10 text-eu-red" },
  returned: { label: "Επεστράφη", tone: "bg-eu-red/10 text-eu-red" },
  delivered: { label: "Παραδόθηκε", tone: "bg-eu-green/10 text-eu-green" },
  cancelled: { label: "Ακυρώθηκε", tone: "bg-eu-surface text-eu-muted" },
};
const eur = (n: number) => n.toLocaleString("el-GR", { style: "currency", currency: "EUR" });

/**
 * Vouchers Γενικής Ταχυδρομικής: παραγγελίες courier που περιμένουν voucher, έκδοση (βάρος από τα προϊόντα,
 * αντικαταβολή αν πληρώνεται έτσι), ετικέτες, ακύρωση πριν το κλείσιμο, κλείσιμο ημέρας και παρακολούθηση.
 */
export default async function GenikiVouchersPage() {
  const user = await requirePermission("orders.read");
  const canWrite = can(user.permissions, "orders.write");
  const cfg = await genikiConfig();
  const [waiting, shipments] = await Promise.all([
    db.order.findMany({
      where: { fulfilment: "courier", status: { in: ["pending", "paid", "processing"] }, shipping: { path: ["carrier"], equals: "geniki" }, shipments: { none: { status: { not: "cancelled" } } } },
      orderBy: { createdAt: "asc" }, take: 50, select: { id: true },
    }),
    db.shipment.findMany({ where: { carrier: "geniki" }, orderBy: { createdAt: "desc" }, take: 60, include: { order: { select: { number: true, shipping: true } } } }),
  ]);
  const drafts = (await Promise.all(waiting.map((o) => shipmentDraft(o.id)))).filter((d) => d !== null);
  const open = shipments.filter((s) => s.status === "created" && (!cfg || s.env === cfg.env));
  return (
    <div className="grid gap-6 max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><Truck className="size-4" aria-hidden /> Αποστολές</div>
          <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)]">Vouchers · Γενική Ταχυδρομική</h1>
          <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[75ch]">Η σειρά της ημέρας: έκδοση voucher → εκτύπωση ετικετών → κλείσιμο ημέρας πριν παραδοθούν τα δέματα στη Γενική. Ακύρωση γίνεται μόνο πριν το κλείσιμο. Η κατάσταση των αποστολών ενημερώνεται αυτόματα.</p>
        </div>
        <span className={`rounded-full px-3 py-1 font-extrabold text-[length:var(--fs-13)] ${!cfg ? "bg-eu-red/10 text-eu-red" : cfg.env === "live" ? "bg-eu-green/10 text-eu-green" : "bg-eu-amber/15 text-eu-ink-2"}`}>{!cfg ? "Χωρίς στοιχεία σύνδεσης" : cfg.env === "live" ? "Παραγωγή" : "Δοκιμαστικό περιβάλλον"}</span>
      </div>
      {!cfg && <p className="m-0 rounded-xl bg-eu-surface px-4 py-3 text-eu-ink-2 text-[length:var(--fs-15)]">Συμπλήρωσε όνομα χρήστη, κωδικό και app key της Γενικής στις <Link href="/admin/settings/shipping" className="text-eu-blue underline font-bold">Ρυθμίσεις → Αποστολές & courier</Link> (ενεργό το «Προσφέρεται στο checkout» για να εμφανιστούν τα πεδία).</p>}
      <DayActions openIds={open.map((s) => s.id)} canWrite={canWrite} />

      <section className="grid gap-3">
        <h2 className="m-0 font-bold text-eu-ink text-[length:var(--fs-19)]">Προς έκδοση ({drafts.length})</h2>
        {!drafts.length ? <p className="m-0 text-eu-muted text-[length:var(--fs-15)]">Δεν υπάρχουν παραγγελίες με Γενική Ταχυδρομική που περιμένουν voucher.</p> : (
          <ul className="m-0 p-0 list-none grid gap-3">
            {drafts.map((d) => (
              <li key={d.orderId} className="rounded-xl border border-eu-line bg-white p-4 grid gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-bold text-eu-ink text-[length:var(--fs-16)]">{d.number} · {d.name}</span>
                  <span className="text-eu-ink-3 text-[length:var(--fs-14)]">{d.address}, {d.zip} {d.city} · {d.phone}{d.cod > 0 ? ` · αντικαταβολή ${eur(d.cod)}` : ""}</span>
                </div>
                {d.blockers.length > 0 && <p className="m-0 rounded-lg bg-eu-red/10 px-3 py-2 text-eu-red font-bold text-[length:var(--fs-14)]">{d.blockers.join(" ")}</p>}
                {canWrite && <CreateVoucher orderId={d.orderId} weightKg={d.weightKg} weightKnown={d.weightKnown} pieces={d.pieces} disabled={!cfg || d.blockers.length > 0} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="m-0 font-bold text-eu-ink text-[length:var(--fs-19)]">Vouchers</h2>
        {!shipments.length ? <p className="m-0 text-eu-muted text-[length:var(--fs-15)]">Δεν έχουν εκδοθεί ακόμη vouchers.</p> : (
          <ul className="m-0 p-0 list-none grid gap-2">
            {shipments.map((s) => {
              const st = STATUS[s.status] ?? { label: s.status, tone: "bg-eu-surface text-eu-muted" };
              const cp = s.lastCheckpoint as { text?: string; at?: string; shop?: string } | null;
              const to = s.order.shipping as { firstName?: string; lastName?: string; city?: string };
              return (
                <li key={s.id} className="rounded-xl border border-eu-line bg-white px-4 py-3 grid grid-cols-1 @2xl:grid-cols-[minmax(0,1fr)_auto] gap-2 items-center">
                  <div className="min-w-0 grid gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-eu-ink tabular-nums text-[length:var(--fs-15)]">{s.voucher ?? "—"}</span>
                      <span className={`rounded-full px-2.5 py-0.5 font-bold text-[length:var(--fs-13)] ${st.tone}`}>{st.label}</span>
                      {s.env === "test" && <span className="rounded-full px-2 py-0.5 bg-eu-surface text-eu-ink-3 font-bold text-[length:var(--fs-13)]">δοκιμαστικό</span>}
                    </div>
                    <span className="text-eu-ink-3 text-[length:var(--fs-14)]">{s.order.number} · {to.firstName} {to.lastName}, {to.city} · {Number(s.weightKg).toLocaleString("el-GR")} κ. · {s.pieces} τεμ.{Number(s.codAmount) > 0 ? ` · αντικαταβολή ${eur(Number(s.codAmount))}` : ""} · {s.createdAt.toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short" })}</span>
                    {cp?.text && <span className="text-eu-ink-2 text-[length:var(--fs-14)]">Τελευταίο: {cp.text}{cp.shop ? ` (${cp.shop})` : ""}{cp.at ? ` · ${new Date(cp.at).toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short" })}` : ""}</span>}
                    {s.error && <span className="text-eu-red text-[length:var(--fs-13)]">{s.error}</span>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {s.status !== "cancelled" && s.voucher && <a href={`/api/admin/shipments/label?ids=${s.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-eu-line text-eu-ink-2 font-bold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-surface"><FileDown className="size-4" aria-hidden /> Ετικέτα</a>}
                    {canWrite && s.status === "created" && <CancelVoucher id={s.id} />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
