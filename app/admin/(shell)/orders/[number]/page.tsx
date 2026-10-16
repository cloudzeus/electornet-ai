import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { orderDetail } from "@/lib/orders/admin";
import { shipmentDraft } from "@/lib/couriers/shipments";
import { saldocForOrder } from "@/lib/softone/order-doc";
import type { SaldocDoc } from "@/lib/softone/order-doc-core";
import { OrderView } from "./OrderView";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ number: string }> }) {
  return { title: `Παραγγελία ${decodeURIComponent((await params).number)}` };
}

export default async function OrderPage({ params }: { params: Promise<{ number: string }> }) {
  const user = await requirePermission("orders.read");
  const o = await orderDetail(decodeURIComponent((await params).number));
  if (!o) notFound();
  const canWrite = can(user.permissions, "orders.write"), canRefund = can(user.permissions, "orders.refund");
  const hasShip = o.shipments.some((x) => x.status !== "cancelled");
  const draft = canWrite && o.fulfilment === "courier" && !hasShip && ["pending", "paid", "processing"].includes(o.status) ? await shipmentDraft(o.id) : null;
  // το παραστατικό όσο δεν έχει σταλεί χτίζεται με τις τρέχουσες ρυθμίσεις (π.χ. αφού συμπληρωθεί ένας κωδικός πληρωμής)
  const doc = o.erpSync && ["preview", "awaiting-payment"].includes(o.erpSync.status) ? await saldocForOrder(o.id).catch(() => null) : ((o.erpSync?.payload ?? null) as SaldocDoc | null);
  const erp = doc?.totals ? { needs: doc.needs ?? [], warnings: doc.warnings ?? [], gross: doc.totals.gross, expected: doc.totals.expected } : null;
  return <OrderView o={o} draft={draft} erp={erp} canWrite={canWrite} canRefund={canRefund} />;
}
