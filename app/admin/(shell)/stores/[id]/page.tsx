import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { StoreEditor } from "@/components/admin/stores/StoreEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Κατάστημα" };

export default async function StoreEditPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("stores.read");
  const { id } = await params;
  const row = id === "new" ? null : await db.store.findUnique({ where: { id } });
  if (id !== "new" && !row) notFound();
  const regions = (await db.store.groupBy({ by: ["region"], orderBy: { region: "asc" } })).map((r) => r.region);
  return (
    <>
      <Link href="/admin/stores" className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)] hover:underline"><ChevronLeft className="size-4" aria-hidden /> Όλα τα καταστήματα</Link>
      <StoreEditor
        canWrite={can(user.permissions, "stores.write")}
        regions={regions}
        store={row ? { id: row.id, siteId: row.siteId, slug: row.slug, name: row.name, member: row.member ?? "", kind: row.kind ?? "", address: row.address, city: row.city, zip: row.zip, region: row.region, phone: row.phone ?? "", mobile: row.mobile ?? "", fax: row.fax ?? "", email: row.email ?? "", erpBranch: row.erpBranch ?? "", lat: row.lat, lng: row.lng, geocoded: row.geocoded, geoLat: row.geoLat, geoLng: row.geoLng, geoDeltaKm: row.geoDeltaKm, geoLabel: row.geoLabel, hours: (row.hours as { day: number; open: string; close: string }[]) ?? [], services: (row.services as string[]) ?? [], photo: row.photo ?? "", notes: row.notes ?? "", active: row.active, sort: row.sort, updatedAt: row.updatedAt.toISOString() } : null}
      />
    </>
  );
}
