import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCustomerSession } from "@/lib/account/session";

/** PATCH { action: "cancel" }: ο πελάτης ακυρώνει ραντεβού / αίτημα service που δεν έχει ξεκινήσει. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCustomerSession();
  if (!me) return NextResponse.json({ ok: false, error: "Χρειάζεται σύνδεση." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { action?: string };
  if (b.action !== "cancel") return NextResponse.json({ ok: false, error: "Μη έγκυρη ενέργεια." }, { status: 400 });
  const t = await db.serviceTicket.findFirst({ where: { id: (await params).id, customerId: me.id }, select: { id: true, status: true, number: true, timeline: true } });
  if (!t) return NextResponse.json({ ok: false, error: "Δεν βρέθηκε." }, { status: 404 });
  if (!["new", "scheduled"].includes(t.status)) return NextResponse.json({ ok: false, error: "Δεν ακυρώνεται πια — κάλεσε το 210 483 5143." }, { status: 409 });
  const timeline = [...((Array.isArray(t.timeline) ? t.timeline : []) as Prisma.InputJsonValue[]), { at: new Date().toISOString(), status: "cancelled", note: "Ακύρωση από τον πελάτη", by: "customer" }];
  await db.serviceTicket.update({ where: { id: t.id }, data: { status: "cancelled", timeline } });
  await db.customerEvent.create({ data: { customerId: me.id, kind: "ticket", meta: { by: "customer", action: "cancelled", number: t.number } } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
