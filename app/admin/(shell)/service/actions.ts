"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { updateServiceTicket, type TicketPatch } from "@/lib/service/tickets";
import { db } from "@/lib/db";

/** Ενημέρωση αιτήματος από την καρτέλα του (κατάσταση, ραντεβού, τεχνικός, κόστος, σημείωση, email στον πελάτη). */
export async function saveTicket(ticketId: string, patch: TicketPatch) {
  const user = await requirePermission("service.tickets.write");
  const r = await updateServiceTicket(ticketId, patch, { name: user.name ?? "staff", staffId: user.id });
  if (r.ok) {
    const t = await db.serviceTicket.findUnique({ where: { id: ticketId }, select: { customerId: true } });
    revalidatePath("/admin/service");
    revalidatePath(`/admin/service/${ticketId}`);
    if (t) revalidatePath(`/admin/customers/${t.customerId}`);
  }
  return r;
}
