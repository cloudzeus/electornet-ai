import Link from "next/link";
import { Plus, AlertTriangle } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { StoreMapClient } from "@/components/admin/stores/StoreMapClient";
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
  const chip = (on: boolean) => `rounded-full px-3 min-h-9 inline-flex items-center gap-1 font-bold text-[length:var(--fs-13)] ${on ? "bg-eu-navy text-white" : "bg-white border border-eu-line text-eu-ink hover:border-eu-navy"}`;
  const link = (p: Record<string, string>) => { const u = new URLSearchParams({ q, region, qa, ...p }); [...u.keys()].forEach((k) => !u.get(k) && u.delete(k)); return `?${u}`; };
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Δίκτυο</div>
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Καταστήματα</h2>
          <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">Η βάση είναι η πηγή αλήθειας για το storefront (εισαγωγή από το euronics.gr έγινε μία φορά). Συντεταγμένες με ανεξάρτητο έλεγχο γεωκωδικοποίησης (OpenStreetMap), ωράρια και υπηρεσίες ανά κατάστημα.</p>
        </div>
        {canWrite && <Link href="/admin/stores/new" className="inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-blue"><Plus className="size-4" aria-hidden /> Νέο κατάστημα</Link>}
      </div>
      {canWrite && <StoreListActions pendingGeo={pendingGeo} total={total} />}
      <div className="flex flex-wrap items-center gap-2">
        <form className="flex gap-2 flex-1 min-w-[220px]"><input type="hidden" name="region" value={region} /><input type="hidden" name="qa" value={qa} /><input name="q" defaultValue={q} placeholder="Αναζήτηση ονόματος, πόλης, ΤΚ, email…" className="flex-1 rounded-full border-2 border-eu-line px-4 min-h-10 text-[length:var(--fs-14)] outline-none focus:border-eu-blue" /><button type="submit" className="rounded-full bg-eu-navy text-white font-bold px-4 min-h-10 text-[length:var(--fs-14)]">Αναζήτηση</button></form>
        <Link href={link({ qa: "" })} className={chip(!qa)}>Όλα {total}</Link>
        <Link href={link({ qa: "far" })} className={chip(qa === "far")}><AlertTriangle className="size-3.5" aria-hidden /> Απόκλιση &gt;2 km {far}</Link>
        <Link href={link({ qa: "nocoords" })} className={chip(qa === "nocoords")}>Χωρίς συντεταγμένες {nocoords}</Link>
        <Link href={link({ qa: "manual" })} className={chip(qa === "manual")}>Χειροκίνητα</Link>
        <Link href={link({ qa: "inactive" })} className={chip(qa === "inactive")}>Ανενεργά {inactive}</Link>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Link href={link({ region: "" })} className={chip(!region)}>Όλοι οι νομοί</Link>
        {regions.map((r) => <Link key={r.region} href={link({ region: r.region })} className={chip(region === r.region)}>{r.region} <span className="opacity-70">{r._count._all}</span></Link>)}
      </div>
      <StoreMapClient markers={rows.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, label: `${s.name} · ${s.city}`, href: `/admin/stores/${s.id}`, tone: !s.active ? "yellow" : (s.geoDeltaKm ?? 0) > 2 ? "red" : "navy" }))} />
      <div className="rounded-2xl bg-white border border-eu-line overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[length:var(--fs-14)]">
            <thead><tr className="text-left text-eu-muted"><th className="p-3 font-bold">Κατάστημα</th><th className="p-3 font-bold">Διεύθυνση</th><th className="p-3 font-bold">Επικοινωνία</th><th className="p-3 font-bold">Συντεταγμένες</th><th className="p-3 font-bold">Έλεγχος</th><th className="p-3 font-bold">Κατάσταση</th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-t border-eu-line-2 hover:bg-eu-surface/60">
                  <td className="p-3"><Link href={`/admin/stores/${s.id}`} className="font-bold text-eu-navy hover:underline">{s.name}</Link><div className="text-eu-muted text-[length:var(--fs-13)]">{s.city} · {s.region}{s.siteId ? ` · #${s.siteId}` : ""}</div></td>
                  <td className="p-3">{s.address}<div className="text-eu-muted text-[length:var(--fs-13)]">{s.zip} {s.city}</div></td>
                  <td className="p-3 text-eu-ink-2"><div>{s.phone ?? "—"}</div><div className="text-[length:var(--fs-13)] truncate max-w-[220px]">{s.email ?? ""}</div></td>
                  <td className="p-3 tabular-nums text-[length:var(--fs-13)]">{s.lat || s.lng ? <>{s.lat.toFixed(5)}, {s.lng.toFixed(5)}<div className="text-eu-muted">{s.geocoded === "manual" ? "χειροκίνητα" : s.geocoded === "nominatim" ? "OSM" : "site"}</div></> : <span className="text-eu-red font-bold">λείπουν</span>}</td>
                  <td className="p-3 tabular-nums">{s.geoDeltaKm == null ? <span className="text-eu-muted">—</span> : s.geoDeltaKm > 2 ? <span className="text-eu-red font-bold">{s.geoDeltaKm.toFixed(1)} km</span> : <span className="text-eu-green font-bold">✓ {s.geoDeltaKm.toFixed(2)} km</span>}</td>
                  <td className="p-3">{s.active ? <span className="text-eu-green font-bold">Ενεργό</span> : <span className="text-eu-muted font-bold">Ανενεργό</span>}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={6} className="p-8 text-center text-eu-muted">Κανένα κατάστημα με αυτά τα κριτήρια.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 border-t border-eu-line text-eu-muted text-[length:var(--fs-13)]">{rows.length} από {total} καταστήματα</div>
      </div>
    </>
  );
}
