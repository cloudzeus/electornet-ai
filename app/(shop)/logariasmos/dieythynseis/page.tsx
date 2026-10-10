import type { Metadata } from "next";
import { requireCustomer } from "@/lib/account/data";
import { db } from "@/lib/db";
import { AddressBook } from "@/components/account/AddressBook";

export const metadata: Metadata = { title: "Οι διευθύνσεις μου" };

/** Το βιβλίο διευθύνσεων του πελάτη (γεωκωδικοποίηση, κοντινότερο κατάστημα). */
export default async function AddressesPage() {
  const me = await requireCustomer("/logariasmos/dieythynseis");
  const rows = await db.address.findMany({ where: { customerId: me.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
  const storeIds = [...new Set(rows.map((r) => r.nearestStoreId).filter(Boolean))] as string[];
  const stores = storeIds.length ? await db.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true, city: true } }) : [];
  const names = Object.fromEntries(stores.map((s) => [s.id, `${s.city} — ${s.name}`]));
  return <AddressBook stores={names} initial={rows.map((r) => ({ id: r.id, label: r.label, recipient: r.recipient, street: r.street, number: r.number, floor: r.floor, doorbell: r.doorbell, city: r.city, zip: r.zip, region: r.region, phone: r.phone, notes: r.notes, isDefault: r.isDefault, isBilling: r.isBilling, lat: r.lat, lng: r.lng, nearestKm: r.nearestKm, nearestStoreName: r.nearestStoreId ? names[r.nearestStoreId] ?? null : null }))} />;
}
