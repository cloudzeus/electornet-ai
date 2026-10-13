"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { cancelShipment, closeDay, createShipment, trackShipments } from "@/lib/couriers/shipments";
import { genikiConfig, genikiPing, GenikiError } from "@/lib/couriers/geniki/client";
import { eltaConfig, eltaPing, EltaError } from "@/lib/couriers/elta/client";
import { shipmentTimeline } from "@/lib/couriers/timeline";
import { db } from "@/lib/db";

const done = () => revalidatePath("/admin/apostoles/vouchers");

export async function createVoucherAction(orderId: string, input: { weightKg: number; pieces: number; comments?: string }) {
  const user = await requirePermission("orders.write");
  const r = await createShipment(orderId, input, user.id);
  if (r.ok) await audit(user.id, "shipment.create", "Shipment", r.shipment.id, null, { orderId, voucher: r.shipment.voucher, env: r.shipment.env, weightKg: input.weightKg, pieces: input.pieces });
  done();
  return r.ok ? { ok: true as const, voucher: r.shipment.voucher, id: r.shipment.id } : r;
}

export async function cancelVoucherAction(id: string) {
  const user = await requirePermission("orders.write");
  const r = await cancelShipment(id);
  if (r.ok) await audit(user.id, "shipment.cancel", "Shipment", id, null, null);
  done();
  return r;
}

export async function closeDayAction() {
  const user = await requirePermission("orders.write");
  const r = await closeDay();
  if (r.ok) await audit(user.id, "shipment.close-day", "Shipment", null, null, { closed: r.closed });
  done();
  return r;
}

export async function trackNowAction() {
  await requirePermission("orders.write");
  const r = await trackShipments(50);
  done();
  return r;
}

export async function pingCourierAction(carrier: "geniki" | "elta") {
  await requirePermission("orders.read");
  if (carrier === "elta") {
    const c = await eltaConfig();
    if (!c) return { ok: false as const, error: "Δεν έχουν συμπληρωθεί κωδικός πελάτη, χρήστης και κωδικός της ΕΛΤΑ (ELTA_PELATIS, ELTA_USER, ELTA_PASS)." };
    try { await eltaPing(c); return { ok: true as const, env: c.env === "production" ? "live" : "test" }; } catch (e) { return { ok: false as const, error: e instanceof EltaError ? e.message : "Η σύνδεση απέτυχε." }; }
  }
  const c = await genikiConfig();
  if (!c) return { ok: false as const, error: "Δεν έχουν συμπληρωθεί όνομα χρήστη, κωδικός και app key." };
  try { await genikiPing(c); return { ok: true as const, env: c.env }; } catch (e) { return { ok: false as const, error: e instanceof GenikiError ? e.message : "Η σύνδεση απέτυχε." }; }
}

/** Η διαδρομή ενός voucher για το widget παρακολούθησης (ζωντανά από τον courier· fresh = χωρίς κρυφή μνήμη). */
export async function voucherTimelineAction(id: string, fresh = false) {
  await requirePermission("orders.read");
  const sh = await db.shipment.findUnique({ where: { id }, select: { carrier: true, voucher: true, status: true, createdAt: true, deliveredAt: true, lastCheckpoint: true } });
  return sh ? shipmentTimeline(sh, { fresh }) : null;
}
