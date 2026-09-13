import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCustomerSession } from "@/lib/account/session";
import { geocodeCustomerAddress } from "@/lib/customers/geocode-address";

/**
 * Customer addresses (signed-in). POST creates/updates; coordinates from the
 * device (GPS at checkout) are kept as `client`, otherwise the address is
 * geocoded server-side and linked to the nearest store.
 */
export async function GET() {
  const c = await getCustomerSession();
  if (!c) return NextResponse.json({ authenticated: false, addresses: [] }, { status: 401 });
  const addresses = await db.address.findMany({ where: { customerId: c.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
  return NextResponse.json({ authenticated: true, addresses });
}
export async function POST(req: Request) {
  const c = await getCustomerSession();
  if (!c) return NextResponse.json({ ok: false, error: "Χρειάζεται σύνδεση." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { id?: string; label?: string; recipient?: string; street?: string; number?: string; floor?: string; doorbell?: string; city?: string; zip?: string; region?: string; phone?: string; notes?: string; isDefault?: boolean; isBilling?: boolean; lat?: number; lng?: number };
  if (!b.street?.trim() || !b.city?.trim() || !b.zip?.trim()) return NextResponse.json({ ok: false, error: "Οδός, πόλη και ΤΚ είναι υποχρεωτικά." }, { status: 400 });
  const data = { label: b.label?.trim() || null, recipient: b.recipient?.trim() || null, street: b.street.trim(), number: b.number?.trim() || null, floor: b.floor?.trim() || null, doorbell: b.doorbell?.trim() || null, city: b.city.trim(), zip: b.zip.trim(), region: b.region?.trim() || "", phone: b.phone?.trim() || null, notes: b.notes?.trim() || null, isDefault: !!b.isDefault, isBilling: !!b.isBilling, ...(b.lat && b.lng ? { lat: b.lat, lng: b.lng, geoSource: "client" } : {}) };
  if (data.isDefault) await db.address.updateMany({ where: { customerId: c.id }, data: { isDefault: false } });
  const row = b.id ? await db.address.update({ where: { id: b.id, customerId: c.id }, data }) : await db.address.create({ data: { ...data, customerId: c.id } });
  await db.customerEvent.create({ data: { customerId: c.id, kind: "address", meta: { id: row.id, city: row.city, by: "customer" } } }).catch(() => null);
  const geo = await geocodeCustomerAddress(row.id).catch(() => null);
  const fresh = await db.address.findUnique({ where: { id: row.id } });
  return NextResponse.json({ ok: true, address: fresh, nearestStore: geo && geo.ok ? geo.nearestStore : null });
}
export async function DELETE(req: Request) {
  const c = await getCustomerSession();
  if (!c) return NextResponse.json({ ok: false }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  await db.address.deleteMany({ where: { id, customerId: c.id } });
  return NextResponse.json({ ok: true });
}
