import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { orderDetail } from "@/lib/orders/admin";
import { shipmentDraft } from "@/lib/couriers/shipments";
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
  return <OrderView o={o} draft={draft} canWrite={canWrite} canRefund={canRefund} />;
}
