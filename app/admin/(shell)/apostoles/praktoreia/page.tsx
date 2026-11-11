import { Warehouse } from "lucide-react";
import { can } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { suggestRole, type CarrierRole } from "@/lib/delivery/routing";
import { CarrierRoles, type CarrierRow } from "./CarrierRoles";
import { CarrierToolbar, type PartnerOpt } from "./CarrierToolbar";

export const metadata = { title: "Πρακτορεία και μεταφορείς" };
export const dynamic = "force-dynamic";

/** Οι μεταφορείς του SoftOne (SOCARRIER) με τον ρόλο τους στην πράξη. Τα πρακτορεία δένονται με συνεργάτες στην αρχικοποίησή τους. */
export default async function AgenciesPage() {
  const user = await requirePermission("stores.partners.read");
  const [carriers, partners, lastRun] = await Promise.all([
    db.carrier.findMany({ where: { s1Missing: false }, orderBy: { name: "asc" }, select: { id: true, s1Id: true, code: true, name: true, role: true, phone: true, address: true, city: true, zip: true, hours: true, email: true, notes: true, active: true, _count: { select: { agencyFor: true } } } }).catch(() => null),
    db.partner.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, city: true, agency: { select: { name: true } } } }),
    db.s1SyncRun.findFirst({ where: { kind: "carrier", ok: true }, orderBy: { at: "desc" }, select: { at: true } }),
  ]);
  const opts: PartnerOpt[] = partners.map((p) => ({ id: p.id, name: p.name, city: p.city, agency: p.agency?.name ?? null }));
  const lastSync = lastRun ? lastRun.at.toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }) : null;
  const names = partners.map((p) => p.name);
  const rows: CarrierRow[] = (carriers ?? []).map((c) => ({ ...c, role: c.role as CarrierRole, partners: c._count.agencyFor, suggested: suggestRole(c, names) }));
  return (
    <div className="grid gap-5 min-w-0 @container">
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><Warehouse className="size-3.5" aria-hidden /> Αποστολές</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Πρακτορεία και μεταφορείς</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">Το SoftOne έχει έναν κατάλογο «μεταφορέων» που ανακατεύει οδηγούς μας, couriers, οχήματα συνεργατών και πρακτορεία. Εδώ λες τι είναι το καθένα. Πάτα «Καρτέλα» για συνεργάτες, οχήματα, τιμοκατάλογο και αποστολές του καθενός. Νέα πρακτορεία προσθέτεις με «Νέος μεταφορέας». Οι αλλαγές μένουν στο eshop, δεν γράφονται στο SoftOne.</p>
      </div>
      {carriers === null
        ? <p className="m-0 rounded-2xl border border-eu-amber/40 bg-eu-amber/10 p-4 text-eu-ink text-[length:var(--fs-14)]">Λείπουν οι νέες στήλες στη βάση. Χρειάζεται η εφαρμογή του <code>prisma/sql/2026-11-11-delivery-routing.sql</code>.</p>
        : <>
            <CarrierToolbar total={rows.length} lastSync={lastSync} partners={opts} canWrite={can(user.permissions, "settings.write")} />
            <CarrierRoles rows={rows} canWrite={can(user.permissions, "settings.write")} />
          </>}
    </div>
  );
}
