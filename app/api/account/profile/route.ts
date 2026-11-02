import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCustomerSession } from "@/lib/account/session";
import { validateProfile, type ProfileInput } from "@/lib/account/profile-core";

/**
 * PATCH: τα στοιχεία του πελάτη (όνομα, κινητό, γενέθλια, ΑΦΜ) και τα στοιχεία τιμολόγησης
 * (type individual|business, επωνυμία, Δ.Ο.Υ., επάγγελμα). Το email αλλάζει μόνο με επιβεβαίωση στο νέο
 * email — POST /api/account/email → GET /api/account/email/confirm.
 */
export async function PATCH(req: Request) {
  const me = await getCustomerSession();
  if (!me) return NextResponse.json({ ok: false, error: "Χρειάζεται σύνδεση." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as ProfileInput;
  const v = validateProfile(b);
  if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
  const d = v.data;
  const prev = await db.customer.findUnique({ where: { id: me.id }, select: { firstName: true, lastName: true, mobile: true, birthday: true, vatNumber: true, type: true, company: true, doy: true, profession: true } });
  await db.customer.update({
    where: { id: me.id },
    data: { firstName: d.firstName, lastName: d.lastName, mobile: d.mobile, birthday: d.birthday ? new Date(d.birthday) : null, vatNumber: d.vatNumber, type: d.type, company: d.company, doy: d.doy, profession: d.profession },
  });
  await db.customerEvent.create({ data: { customerId: me.id, kind: "profile", meta: { by: "customer", before: prev, after: { ...d } satisfies Record<string, string | null> } } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
