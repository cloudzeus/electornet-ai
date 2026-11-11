import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Warehouse } from "lucide-react";
import { can } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { ROLE_LABEL, type CarrierRole } from "@/lib/delivery/routing";
import { MODE_LABEL, type RouteMode } from "@/lib/delivery/routing";
import { CarrierCard, type CardData } from "./CarrierCard";
import { loadFieldDefs } from "@/lib/custom-fields-db";
import type { ExtraValues } from "@/lib/custom-fields";

export const metadata = { title: "Καρτέλα μεταφορέα" };
export const dynamic = "force-dynamic";

/** Ένας μεταφορέας με ό,τι σχετίζεται: συνεργάτες, οχήματα (SoftOne TRUCKS), τιμοκατάλογος, αποστολές, χρήση στα παραστατικά. */
export default async function CarrierPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("stores.partners.read");
  const { id } = await params;
  const c = await db.carrier.findUnique({ where: { id } });
  if (!c) notFound();
  const [served, fromS1, partners, vehicles, rates, routes, routeCount, defs] = await Promise.all([
    db.partner.findMany({ where: { agencyId: id }, orderBy: { name: "asc" }, select: { id: true, name: true, city: true, s1CarrierId: true, lat: true, lng: true } }),
    c.s1Id ? db.partner.findMany({ where: { s1CarrierId: c.s1Id, NOT: { agencyId: id } }, orderBy: { name: "asc" }, select: { id: true, name: true, city: true, agency: { select: { name: true } } } }).catch(() => []) : [],
    db.partner.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, city: true, agency: { select: { name: true } } } }),
    db.carrierVehicle.findMany({ where: { carrierId: id }, orderBy: [{ active: "desc" }, { name: "asc" }], select: { id: true, s1Id: true, name: true, plate: true, weightKg: true, volumeM3: true, active: true, s1Missing: true, trdr: true } }).catch(() => null),
    db.shippingRateTable.findMany({ where: { carrier: `carrier:${id}` }, orderBy: { updatedAt: "desc" }, select: { id: true, name: true, status: true, updatedAt: true } }),
    db.orderRoute.findMany({ where: { OR: [{ agencyId: id }, { carrierId: id }] }, orderBy: { createdAt: "desc" }, take: 20, select: { orderId: true, mode: true, status: true, createdAt: true, order: { select: { number: true } }, partner: { select: { name: true } } } }),
    db.orderRoute.count({ where: { OR: [{ agencyId: id }, { carrierId: id }] } }),
    loadFieldDefs("carrier"),
  ]);
  const point = c.lat != null && c.lng != null ? { lat: c.lat, lng: c.lng, source: c.geoSource, label: c.geoLabel } : null;
  const located = served.filter((p) => p.lat != null && p.lng != null) as (typeof served[number] & { lat: number; lng: number })[];
  const d = (c.s1Data ?? {}) as Record<string, string>;
  const data: CardData = {
    carrier: { id: c.id, s1Id: c.s1Id, code: c.code, name: c.name, role: c.role as CarrierRole, phone: c.phone, email: c.email, afm: c.afm, address: c.address, city: c.city, zip: c.zip, hours: c.hours, notes: c.notes, active: c.active, s1Missing: c.s1Missing },
    s1: c.s1Id ? { ADDRESS: d.ADDRESS, ZIP: d.ZIP, CITY: d.CITY, PHONE01: d.PHONE01, EMAIL: d.EMAIL, AFM: d.AFM, CARRIERTYPE: d.CARRIERTYPE, REMARKS: d.REMARKS, syncedAt: c.s1SyncedAt?.toISOString() ?? null } : null,
    served: served.map((p) => ({ id: p.id, name: p.name, city: p.city, s1Same: !!c.s1Id && p.s1CarrierId === c.s1Id })),
    suggested: fromS1.map((p) => ({ id: p.id, name: p.name, city: p.city, agency: p.agency?.name ?? null })),
    partners: partners.map((p) => ({ id: p.id, name: p.name, city: p.city, agency: p.agency?.name ?? null })),
    vehicles,
    rates: rates.map((r) => ({ id: r.id, name: r.name, status: r.status, updatedAt: r.updatedAt.toISOString() })),
    rateLink: c.role === "agency" || c.role === "driver" ? `/admin/apostoles/timokatalogoi?c=${encodeURIComponent(`carrier:${id}`)}` : null,
    routes: routes.map((r) => ({ orderId: r.orderId, number: r.order.number, mode: MODE_LABEL[r.mode as RouteMode] ?? r.mode, status: r.status, at: r.createdAt.toISOString(), partner: r.partner?.name ?? null })),
    routeCount,
    point,
    mapOthers: located.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, label: p.name, href: `/admin/synergates/${p.id}`, tone: "green" as const })),
    mapLines: point ? located.map((p) => ({ from: [p.lat, p.lng] as [number, number], to: [point.lat, point.lng] as [number, number], tone: "blue" as const })) : [],
    defs,
    extra: (c.extra ?? {}) as ExtraValues,
  };
  return (
    <div className="grid gap-5 min-w-0 @container">
      <div>
        <Link href="/admin/apostoles/praktoreia" className="flex w-fit items-center gap-1.5 text-eu-blue font-bold text-[length:var(--fs-14)] min-h-11"><ArrowLeft className="size-4" aria-hidden /> Πρακτορεία και μεταφορείς</Link>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><Warehouse className="size-3.5" aria-hidden /> {ROLE_LABEL[c.role as CarrierRole] ?? c.role}</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)] [overflow-wrap:anywhere]">{c.name}</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-14)]">{c.s1Id ? `SOCARRIER ${c.s1Id}${c.s1Missing ? " · δεν υπάρχει πια στο SoftOne" : ""}` : "Μόνο στο eshop (δεν υπάρχει στο SoftOne)"} · κωδικός {c.code}</p>
      </div>
      <CarrierCard data={data} canWrite={can(user.permissions, "settings.write")} canLink={can(user.permissions, "stores.partners.write")} />
    </div>
  );
}
