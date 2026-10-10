import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCustomerSession } from "@/lib/account/session";

/** PATCH: τα στοιχεία του πελάτη (όνομα, κινητό, γενέθλια, ΑΦΜ). Το email αλλάζει μόνο μέσω επικοινωνίας (είναι το όνομα σύνδεσης). */
export async function PATCH(req: Request) {
  const me = await getCustomerSession();
  if (!me) return NextResponse.json({ ok: false, error: "Χρειάζεται σύνδεση." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { firstName?: string; lastName?: string; phone?: string; birthday?: string; vat?: string };
  const firstName = (b.firstName ?? "").trim(), lastName = (b.lastName ?? "").trim();
  const phone = (b.phone ?? "").replace(/[\s-]/g, ""), vat = (b.vat ?? "").trim(), birthday = (b.birthday ?? "").trim();
  if (!firstName || !lastName) return NextResponse.json({ ok: false, error: "Όνομα και επώνυμο είναι υποχρεωτικά." }, { status: 400 });
  if (phone && !/^(\+30)?\d{10}$/.test(phone)) return NextResponse.json({ ok: false, error: "Το κινητό θέλει 10 ψηφία." }, { status: 400 });
  if (vat && !/^\d{9}$/.test(vat)) return NextResponse.json({ ok: false, error: "Ο ΑΦΜ έχει 9 ψηφία." }, { status: 400 });
  if (birthday && (!/^\d{4}-\d{2}-\d{2}$/.test(birthday) || new Date(birthday) > new Date())) return NextResponse.json({ ok: false, error: "Η ημερομηνία γέννησης δεν είναι σωστή." }, { status: 400 });
  const prev = await db.customer.findUnique({ where: { id: me.id }, select: { firstName: true, lastName: true, mobile: true, birthday: true, vatNumber: true } });
  await db.customer.update({ where: { id: me.id }, data: { firstName: firstName.slice(0, 80), lastName: lastName.slice(0, 80), mobile: phone || null, birthday: birthday ? new Date(birthday) : null, vatNumber: vat || null } });
  await db.customerEvent.create({ data: { customerId: me.id, kind: "profile", meta: { by: "customer", before: prev, after: { firstName, lastName, mobile: phone || null, birthday: birthday || null, vatNumber: vat || null } } } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
