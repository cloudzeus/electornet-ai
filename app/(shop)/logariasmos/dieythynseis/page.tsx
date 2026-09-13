import type { Metadata } from "next";
import Link from "next/link";
import { demoAddress } from "@/lib/data/fixtures/orders";
import { getCustomerSession } from "@/lib/account/session";
import { db } from "@/lib/db";
import { AddressBook } from "@/components/account/AddressBook";

export const metadata: Metadata = { title: "Οι διευθύνσεις μου" };

/** Signed-in: real address book (geocoded, nearest store). Guest/demo: the fixture address with a sign-in prompt. */
export default async function AddressesPage() {
  const me = await getCustomerSession();
  if (me) {
    const rows = await db.address.findMany({ where: { customerId: me.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
    const storeIds = [...new Set(rows.map((r) => r.nearestStoreId).filter(Boolean))] as string[];
    const stores = storeIds.length ? await db.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true, city: true } }) : [];
    const names = Object.fromEntries(stores.map((s) => [s.id, `${s.city} — ${s.name}`]));
    return <AddressBook stores={names} initial={rows.map((r) => ({ id: r.id, label: r.label, recipient: r.recipient, street: r.street, number: r.number, floor: r.floor, doorbell: r.doorbell, city: r.city, zip: r.zip, region: r.region, phone: r.phone, notes: r.notes, isDefault: r.isDefault, isBilling: r.isBilling, lat: r.lat, lng: r.lng, nearestKm: r.nearestKm, nearestStoreName: r.nearestStoreId ? names[r.nearestStoreId] ?? null : null }))} />;
  }
  const a = demoAddress;
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex items-center justify-between gap-2"><h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)]">Διευθύνσεις</h1><Link href="/syndesi?next=/logariasmos/dieythynseis" className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-10 inline-flex items-center hover:bg-eu-blue">Σύνδεση για αποθήκευση</Link></div>
      <ul className="m-0 p-0 list-none grid grid-cols-1 @md:grid-cols-2 gap-3">
        <li className="bg-white rounded-xl border-2 border-eu-blue p-4 text-[length:var(--fs-15)]"><div className="flex justify-between items-center mb-1"><span className="font-extrabold text-eu-ink">{a.label}</span><span className="rounded-full bg-eu-chip text-eu-blue font-bold text-[length:var(--fs-13)] px-2 py-0.5">Demo</span></div><p className="m-0 text-eu-ink-2">{a.firstName} {a.lastName}<br />{a.street} {a.number}, {a.floor}<br />{a.zip} {a.city}, {a.region}<br />{a.phone}</p></li>
      </ul>
    </div>
  );
}
