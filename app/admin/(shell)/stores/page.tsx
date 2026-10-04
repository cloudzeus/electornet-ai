import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { StoreFilters, StoresBrowser } from "@/components/admin/stores/StoresBrowser";
import { StoreListActions } from "@/components/admin/stores/StoreListActions";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Καταστήματα" };
export const dynamic = "force-dynamic";

/** Network of member stores: map + table, QA filters for coordinates. */
export default async function StoresAdmin({ searchParams }: { searchParams: Promise<{ q?: string; region?: string; qa?: string }> }) {
  const user = await requirePermission("stores.read");
  const canWrite = can(user.permissions, "stores.write");
  const { q = "", region = "", qa = "" } = await searchParams;
  const where: Prisma.StoreWhereInput = {};
  if (region) where.region = region;
  if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }, { address: { contains: q, mode: "insensitive" } }, { zip: { contains: q } }, { email: { contains: q, mode: "insensitive" } }];
  if (qa === "far") where.geoDeltaKm = { gt: 2 };
  if (qa === "nocoords") where.OR = [{ lat: 0 }, { lng: 0 }];
  if (qa === "inactive") where.active = false;
  if (qa === "manual") where.geocoded = "manual";
  const [rows, regions, counts] = await Promise.all([
    db.store.findMany({ where, orderBy: [{ region: "asc" }, { city: "asc" }, { name: "asc" }] }),
    db.store.groupBy({ by: ["region"], _count: { _all: true }, orderBy: { region: "asc" } }),
    Promise.all([db.store.count(), db.store.count({ where: { geoDeltaKm: { gt: 2 } } }), db.store.count({ where: { OR: [{ lat: 0 }, { lng: 0 }] } }), db.store.count({ where: { active: false } }), db.store.count({ where: { OR: [{ lat: 0 }, { geoLat: null }] } })]),
  ]);
  const [total, far, nocoords, inactive, pendingGeo] = counts;
  return (
    <div className="grid gap-3 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)] leading-tight">Καταστήματα <span className="text-eu-muted font-normal text-[length:var(--fs-16)] tabular-nums">· {total}</span></h2>
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)] max-w-[80ch]">Πηγή αλήθειας για το storefront· συντεταγμένες με ανεξάρτητο έλεγχο (OpenStreetMap), ωράρια και υπηρεσίες ανά κατάστημα.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canWrite && <StoreListActions pendingGeo={pendingGeo} total={total} />}
          {canWrite && <Link href="/admin/stores/new" className="inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-5 min-h-11 hover:bg-eu-blue"><Plus className="size-4" aria-hidden /> Νέο κατάστημα</Link>}
        </div>
      </div>
      <StoreFilters regions={regions.map((r) => ({ region: r.region, count: r._count._all }))} qaCounts={{ total, far, nocoords, inactive }} />
      <StoresBrowser total={total} rows={rows.map((s) => ({ id: s.id, name: s.name, city: s.city, region: s.region, address: s.address, zip: s.zip, phone: s.phone, email: s.email, lat: s.lat, lng: s.lng, active: s.active, geocoded: s.geocoded, geoDeltaKm: s.geoDeltaKm, siteId: s.siteId }))} />
    </div>
  );
}
