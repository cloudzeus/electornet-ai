import { Map as MapIcon } from "lucide-react";
import { can } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { NetworkMap, type NetPoint } from "./NetworkMap";

export const metadata = { title: "Χάρτης δικτύου" };
export const dynamic = "force-dynamic";

/** Όλο το δίκτυο σε έναν χάρτη: συνεργάτες, πρακτορεία, τα δικά μας καταστήματα, και ποιος συνεργάτης πάει σε ποιο πρακτορείο. */
export default async function NetworkMapPage() {
  const user = await requirePermission("stores.partners.read");
  const [partners, agencies, ours] = await Promise.all([
    db.partner.findMany({ where: { active: true }, select: { id: true, name: true, city: true, district: true, lat: true, lng: true, agencyId: true, branches: { orderBy: { isCenter: "desc" }, take: 3, select: { store: { select: { lat: true, lng: true } } } } } }),
    db.carrier.findMany({ where: { role: "agency", active: true, s1Missing: false }, select: { id: true, name: true, city: true, lat: true, lng: true, _count: { select: { agencyFor: true } } } }),
    db.store.findMany({ where: { active: true, partnerId: null, NOT: { lat: 0 } }, select: { id: true, name: true, city: true, lat: true, lng: true } }),
  ]);
  // συνεργάτης χωρίς δική του θέση: προσωρινά η θέση του καταστήματός του (δεν αποθηκεύεται)
  const pts: NetPoint[] = [
    ...partners.map((p) => {
      const st = p.branches.map((b) => b.store).find((s) => s && (s.lat || s.lng));
      const lat = p.lat ?? st?.lat ?? null, lng = p.lng ?? st?.lng ?? null;
      return { id: p.id, kind: "partner" as const, name: p.name, city: p.city, district: p.district, lat, lng, agencyId: p.agencyId, approx: p.lat == null && !!st };
    }),
    ...agencies.map((a) => ({ id: a.id, kind: "agency" as const, name: a.name, city: a.city, district: null, lat: a.lat, lng: a.lng, agencyId: null, approx: false, served: a._count.agencyFor })),
    ...ours.map((s) => ({ id: s.id, kind: "ours" as const, name: `Euronics ${s.name}`, city: s.city, district: null, lat: s.lat, lng: s.lng, agencyId: null, approx: false })),
  ];
  return (
    <div className="grid gap-5 min-w-0 @container">
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><MapIcon className="size-3.5" aria-hidden /> Αποστολές</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Χάρτης δικτύου</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">Πού είναι οι συνεργάτες, τα πρακτορεία και τα καταστήματά μας, και σε ποιο πρακτορείο πάει ο καθένας. Οι συνεργάτες χωρίς πρακτορείο φαίνονται κίτρινοι: σε αυτούς δεν μπορεί να σταλεί ό,τι δεν έχουν σε απόθεμα.</p>
      </div>
      <NetworkMap points={pts} canWrite={can(user.permissions, "stores.partners.write")} canWriteCarriers={can(user.permissions, "settings.write")} />
    </div>
  );
}
