import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { RESTOCK_INCLUDE, RestockList } from "@/components/admin/partners/RestockList";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { cityKey } from "@/lib/b2b/partners-core";
import { BranchStoreLink } from "@/components/admin/partners/BranchStoreLink";
import { CreateBranchStore, StoreVisibility } from "@/components/admin/partners/PartnerStoreTools";
import { PartnerContacts } from "@/components/admin/partners/PartnerContacts";
import { onboardingOf } from "@/lib/partner-portal/data";
import { answerLabel, isVivaLead, QUESTION_STEPS } from "@/lib/partner-portal/questions";
import { connTypeInfo } from "@/lib/partner-portal/connection-types";
import { PartnerEshopSetup } from "@/components/admin/partners/PartnerEshopSetup";
import { normalizeDelivery, MODE_LABEL, type RouteMode } from "@/lib/delivery/routing";
import { distanceKm } from "@/lib/stores/geocode";
import { loadFieldDefs } from "@/lib/custom-fields-db";
import type { ExtraValues } from "@/lib/custom-fields";
import { ExtraFields } from "@/components/admin/extra/ExtraFields";
import { EntityMap } from "@/components/admin/geo/EntityMap";
import type { MapLine, MapMarker } from "@/components/admin/stores/StoreMapClient";
import { PartnerCardTabs, type PartnerTab } from "@/components/admin/partners/PartnerCardTabs";

export const metadata = { title: "Συνεργάτης" };
export const dynamic = "force-dynamic";

const fmtD = (d: Date | string) => new Date(d).toLocaleDateString("el-GR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Athens" });
const AUDIT_LABEL: Record<string, string> = { "partner.extra": "Άλλαξαν πρόσθετα στοιχεία", "partner.geocode": "Εντοπισμός θέσης από τη διεύθυνση", "partner.geo.manual": "Η θέση ορίστηκε στον χάρτη", "partner.agency": "Άλλαξε πρακτορείο", "partner.delivery": "Άλλαξε η αρχικοποίηση eshop" };
const ROUTE_STATUS: Record<string, string> = { open: "σε εξέλιξη", done: "ολοκληρώθηκε", cancelled: "ακυρώθηκε" };
const MATCHED: Record<string, string> = { "email-branch": "αυτόματα, email υποκαταστήματος", "email-partner": "αυτόματα, email μέλους", manual: "με το χέρι", created: "νέο κατάστημα από το υποκατάστημα" };

/** Ένα μέλος: στοιχεία από το SoftOne (μόνο ανάγνωση) και τα υποκαταστήματά του με τη σύνδεση στα καταστήματα του eshop. */
export default async function PartnerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePermission("stores.partners.read");
  const canWrite = can(user.permissions, "stores.partners.write");
  const { id } = await params;
  const { tab } = await searchParams;
  const [p, stores] = await Promise.all([
    db.partner.findUnique({ where: { id }, include: { agency: { select: { id: true, name: true, city: true, phone: true, lat: true, lng: true } }, stores: { select: { id: true, name: true, city: true, lat: true, lng: true } }, branches: { orderBy: [{ s1Missing: "asc" }, { isCenter: "desc" }, { name: "asc" }], include: { store: { select: { id: true, name: true, city: true, slug: true, active: true, lat: true, lng: true } } } } } }),
    db.store.findMany({ orderBy: [{ city: "asc" }, { name: "asc" }], select: { id: true, name: true, city: true, zip: true, branch: { select: { id: true } } } }),
  ]);
  if (!p) notFound();
  const contacts = await db.partnerContact.findMany({
    where: { partnerId: p.id }, orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    include: { account: { select: { id: true, active: true, passwordHash: true, lastLoginAt: true, lockedUntil: true, tokens: { where: { purpose: "set", usedAt: null, expiresAt: { gt: new Date() } }, select: { expiresAt: true }, take: 1 } } } },
  });

  const ob = onboardingOf(p.onboarding);
  const [aadeLog, answeredAt, portalChanges, restocks] = await Promise.all([
    db.partnerLog.findFirst({ where: { partnerId: p.id, kind: "profile", message: { startsWith: "ΑΑΔΕ:" } }, orderBy: { createdAt: "desc" }, select: { ok: true, message: true, createdAt: true } }),
    db.partnerChange.findFirst({ where: { partnerId: p.id, field: "onboarding.answers" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    db.partnerChange.count({ where: { partnerId: p.id, entity: "Store" } }),
    db.partnerRestock.findMany({ where: { partnerId: p.id }, orderBy: { createdAt: "desc" }, take: 10, include: RESTOCK_INCLUDE }),
  ]);
  // αρχικοποίηση για το eshop (lib/delivery): τι λείπει και ποια πρακτορεία χρησιμοποιούν οι γειτονικοί συνεργάτες
  const delivery = normalizeDelivery(p.delivery);
  const storeIds = p.branches.flatMap((b) => (b.store ? [b.store.id] : []));
  const [stockRows, agencies, neighbours] = await Promise.all([
    storeIds.length ? db.storeStock.count({ where: { storeId: { in: storeIds }, qty: { gt: 0 } } }) : Promise.resolve(0),
    db.carrier.findMany({ where: { role: "agency", active: true, s1Missing: false }, orderBy: { name: "asc" }, select: { id: true, name: true, city: true } }).catch(() => []),
    db.partner.findMany({ where: { id: { not: p.id }, agencyId: { not: null }, OR: [...(p.district ? [{ district: p.district }] : []), ...(p.zip ? [{ zip: { startsWith: p.zip.slice(0, 2) } }] : [])] }, select: { agencyId: true } }).catch(() => []),
  ]);
  const near = new Set(neighbours.map((n) => n.agencyId));
  const portalOk = contacts.some((c) => c.account?.active && c.account.passwordHash);
  const setupSteps = [
    { key: "stores", label: "Καταστήματα συνδεδεμένα", done: storeIds.length > 0, hint: storeIds.length ? `${storeIds.length} καταστήματα στο eshop` : "Σύνδεσε τα υποκαταστήματα με καταστήματα (παρακάτω)" },
    { key: "stock", label: "Απόθεμα από τον συνεργάτη", done: stockRows > 0, hint: stockRows ? `${stockRows} είδη με απόθεμα` : "Χωρίς απόθεμα δρομολογείται μόνο μέσω πρακτορείου" },
    { key: "portal", label: "Πρόσβαση στην πύλη", done: portalOk, hint: portalOk ? "Βλέπει και επιβεβαιώνει παραδόσεις" : "Δώσε λογαριασμό σε μια επαφή (παρακάτω)" },
    { key: "zips", label: "Περιοχές εξυπηρέτησης", done: delivery.homeDelivery && delivery.zips.length > 0, hint: delivery.zips.length ? `${delivery.zips.length} Τ.Κ.` : "Γράψε τους Τ.Κ. που καλύπτει" },
    { key: "agency", label: "Πρακτορείο", done: !!p.agencyId, hint: p.agencyId ? "Ορίστηκε" : "Για ό,τι δεν έχει σε απόθεμα" },
    { key: "live", label: "Σε λειτουργία", done: p.status === "live", hint: p.status === "live" ? "Παίρνει παραγγελίες" : `Κατάσταση: ${p.status}` },
  ];
  const advice = ob.advice as { type?: string; why?: string } | null | undefined;

  // καρτέλες: μεταφορά, παραγγελίες eshop, ιστορικό, πρόσθετα πεδία, χάρτης
  const [s1Carrier, routes, routeCount, changes, logs, audits, defs, ourStores] = await Promise.all([
    p.s1CarrierId ? db.carrier.findUnique({ where: { s1Id: p.s1CarrierId }, select: { id: true, name: true, role: true } }) : null,
    db.orderRoute.findMany({ where: { partnerId: p.id }, orderBy: { createdAt: "desc" }, take: 20, select: { orderId: true, mode: true, status: true, createdAt: true, order: { select: { number: true } }, agency: { select: { name: true } } } }),
    db.orderRoute.count({ where: { partnerId: p.id } }),
    db.partnerChange.findMany({ where: { partnerId: p.id }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, entity: true, field: true, createdAt: true, accountId: true } }),
    db.partnerLog.findMany({ where: { partnerId: p.id }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, kind: true, ok: true, message: true, createdAt: true } }),
    db.auditLog.findMany({ where: { entity: "Partner", entityId: p.id }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, action: true, createdAt: true, staff: { select: { name: true } } } }),
    loadFieldDefs("partner"),
    db.store.findMany({ where: { active: true, partnerId: null, NOT: { lat: 0 } }, select: { id: true, name: true, city: true, lat: true, lng: true } }),
  ]);
  const history = [
    ...changes.map((c) => ({ id: c.id, at: c.createdAt, who: c.accountId ? "Ο συνεργάτης από την πύλη" : "Διαχείριση", what: `Αλλαγή ${c.entity === "Store" ? "καταστήματος" : c.entity}: ${c.field}`, ok: true })),
    ...logs.map((l) => ({ id: l.id, at: l.createdAt, who: l.kind, what: l.message, ok: l.ok })),
    ...audits.map((a) => ({ id: a.id, at: a.createdAt, who: a.staff?.name ?? "Σύστημα", what: AUDIT_LABEL[a.action] ?? a.action, ok: true })),
  ].sort((x, y) => y.at.getTime() - x.at.getTime()).slice(0, 40);
  const point = p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng, source: p.geoSource, label: p.geoLabel } : null;
  const partnerStores = [...new Map([...p.stores, ...p.branches.flatMap((b) => (b.store ? [b.store] : []))].map((s) => [s.id, s])).values()].filter((s) => s.lat || s.lng);
  const origin = point ?? partnerStores[0] ?? null;
  const nearOurs = origin ? ourStores.map((s) => ({ ...s, km: distanceKm(origin, s) })).sort((a, b) => a.km - b.km).slice(0, 2) : [];
  const others: MapMarker[] = [
    ...partnerStores.map((s) => ({ id: `s-${s.id}`, lat: s.lat, lng: s.lng, label: `Κατάστημα ${s.name}`, href: `/admin/stores/${s.id}`, tone: "green" as const })),
    ...(p.agency?.lat != null && p.agency.lng != null ? [{ id: "agency", lat: p.agency.lat, lng: p.agency.lng, label: `Πρακτορείο ${p.agency.name}`, href: `/admin/apostoles/praktoreia/${p.agency.id}`, tone: "blue" as const }] : []),
    ...nearOurs.map((s) => ({ id: `o-${s.id}`, lat: s.lat, lng: s.lng, label: `Euronics ${s.name} · ${Math.round(s.km)} km`, href: `/admin/stores/${s.id}`, tone: "navy" as const })),
  ];
  const lines: MapLine[] = origin && p.agency?.lat != null && p.agency.lng != null ? [{ from: [origin.lat, origin.lng], to: [p.agency.lat, p.agency.lng], tone: "blue" }] : [];
  const initialTab = (["overview", "docs", "orders", "transport", "stores", "contacts", "extra", "history"] as PartnerTab[]).find((t) => t === tab) ?? "overview";

  const field = (label: string, v: string | null | undefined) => (
    <div className="min-w-0"><dt className="text-eu-ink-3 text-[length:var(--fs-12)]">{label}</dt><dd className="m-0 break-words text-[length:var(--fs-14)]">{v || "—"}</dd></div>
  );

  const transportHead = (
    <dl className="m-0 grid gap-3 @2xl:grid-cols-2">
      <div className="min-w-0"><dt className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Πρακτορείο για το eshop</dt>
        <dd className="m-0 text-[length:var(--fs-14)]">{p.agency ? <Link className="font-bold text-eu-blue hover:underline" href={`/admin/apostoles/praktoreia/${p.agency.id}`}>{p.agency.name}{p.agency.city ? ` · ${p.agency.city}` : ""}</Link> : <span className="font-bold text-eu-red">Δεν έχει οριστεί: ό,τι δεν έχει σε απόθεμα δεν μπορεί να του σταλεί</span>}</dd></div>
      <div className="min-w-0"><dt className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Προεπιλεγμένος μεταφορέας στο SoftOne</dt>
        <dd className="m-0 text-[length:var(--fs-14)]">{s1Carrier ? <Link className="font-bold text-eu-blue hover:underline" href={`/admin/apostoles/praktoreia/${s1Carrier.id}`}>{s1Carrier.name}</Link> : p.s1CarrierId ? `SOCARRIER ${p.s1CarrierId}` : "Κανένας"}{s1Carrier && p.agency && s1Carrier.id !== p.agency.id ? <span className="block text-eu-amber text-[length:var(--fs-13)]">Διαφέρει από το πρακτορείο του eshop. Έλεγξε ποιο ισχύει.</span> : null}</dd></div>
    </dl>
  );
  const orders = (
    <div className="grid gap-4 min-w-0">
      <section data-help="partner.routes" className="rounded-2xl border border-eu-line bg-white p-4 grid gap-2 min-w-0">
        <h3 className="m-0 font-heading font-bold text-[length:var(--fs-16)]">Παραγγελίες eshop που πήγαν σε αυτόν <span className="text-eu-muted font-normal text-[length:var(--fs-13)]">{routeCount}</span></h3>
        {!routes.length ? <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Καμία παραγγελία του eshop δεν έχει δρομολογηθεί ακόμη σε αυτόν τον συνεργάτη.</p> : (
          <ul className="m-0 p-0 list-none divide-y divide-eu-line">{routes.map((r) => (
            <li key={r.orderId}><Link href={`/admin/orders/${r.order.number}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 min-h-11 hover:bg-eu-surface-2 rounded-lg px-1">
              <span className="flex-1 min-w-[180px]"><b className="text-[length:var(--fs-14)]">#{r.order.number}</b> <span className="text-eu-ink-3 text-[length:var(--fs-13)]">· {fmtD(r.createdAt)} · {MODE_LABEL[r.mode as RouteMode] ?? r.mode}{r.agency ? ` · ${r.agency.name}` : ""}</span></span>
              <span className="text-[length:var(--fs-12)] font-bold rounded-full px-2.5 py-1 bg-eu-surface-2 text-eu-ink-3">{ROUTE_STATUS[r.status] ?? r.status}</span>
            </Link></li>))}</ul>)}
      </section>
      {restocks.length > 0 ? (
        <section data-help="partner.restocks" className="grid gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="m-0 font-heading font-bold text-[length:var(--fs-16)]">Αναπληρώσεις</h3>
            <Link href="/admin/synergates/anaplirosis?view=all" className="text-eu-blue font-bold text-[length:var(--fs-13)] hover:underline">Όλες οι αναπληρώσεις</Link>
          </div>
          <RestockList rows={restocks} canWrite={canWrite} hide={{ partner: true }} />
        </section>
      ) : <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Δεν έχει ζητήσει αναπλήρωση αποθέματος από την πύλη.</p>}
      <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Οι παραγγελίες του στο SoftOne είναι στην ενότητα «Παραστατικά», φίλτρο «Παραγγελία».</p>
    </div>
  );
  const historyPanel = (
    <section data-help="partner.history" className="rounded-2xl border border-eu-line bg-white p-4 grid gap-2 min-w-0">
      <h3 className="m-0 font-heading font-bold text-[length:var(--fs-16)]">Ιστορικό</h3>
      <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Αλλαγές από την πύλη, συνδέσεις και ό,τι άλλαξε η διαχείριση. Τα 40 πιο πρόσφατα.</p>
      {!history.length ? <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Τίποτα ακόμη.</p> : (
        <ol className="m-0 p-0 list-none divide-y divide-eu-line">{history.map((h) => (
          <li key={h.id} className="py-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[length:var(--fs-14)]">
            <span className="tabular-nums text-eu-ink-3 text-[length:var(--fs-13)] w-28 shrink-0">{fmtD(h.at)}</span>
            <span className={`flex-1 min-w-[200px] [overflow-wrap:anywhere] ${h.ok ? "text-eu-ink" : "text-eu-red"}`}>{h.what}<span className="block text-eu-muted text-[length:var(--fs-12)]">{h.who}</span></span>
          </li>))}</ol>)}
    </section>
  );

  return (
    <div className="grid gap-3 min-w-0 @container">
      <Link href="/admin/synergates" className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)] hover:underline"><ChevronLeft className="size-4" aria-hidden /> Όλοι οι συνεργάτες</Link>
      <div className="min-w-0">
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)] leading-tight break-words">{p.name}</h2>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">{[p.code, p.category, p.groupName, p.s1Trdr ? `TRDR ${p.s1Trdr}` : null].filter(Boolean).join(" · ")}{p.s1Missing ? " · δεν βρέθηκε στην τελευταία εισαγωγή από το SoftOne" : ""}</p>
      </div>

      <PartnerCardTabs partnerId={p.id} hasTrdr={!!p.s1Trdr} initial={initialTab} transportHead={transportHead}
        counts={{ orders: routeCount, stores: p.branches.filter((b) => !b.s1Missing).length, contacts: contacts.length }}
        panels={{
          overview: <>
            <section data-help="partner.map" className="rounded-2xl border border-eu-line bg-white p-4 grid gap-2 min-w-0">
              <h3 className="m-0 font-heading font-bold text-[length:var(--fs-16)]">Στον χάρτη</h3>
              <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]"><span className="text-eu-red font-bold">●</span> ο συνεργάτης · <span className="text-eu-green font-bold">●</span> τα καταστήματά του · <span className="text-[#2C6ED5] font-bold">●</span> το πρακτορείο του · <span className="text-eu-navy font-bold">●</span> τα κοντινότερα δικά μας</p>
              <EntityMap entity="partner" id={p.id} name={p.name} point={point} others={others} lines={lines} canWrite={canWrite} />
            </section>
              <section data-help="partner.identity" className="rounded-xl border border-eu-line bg-white p-3 grid gap-2">
        <h3 className="m-0 font-heading font-bold text-[length:var(--fs-16)]">Στοιχεία από το SoftOne</h3>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-12)]">Τα εμπορικά και φορολογικά στοιχεία αλλάζουν μόνο στο SoftOne· εδώ ενημερώνονται με την επόμενη εισαγωγή.</p>
        <dl className="m-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
          {field("ΑΦΜ", p.afm)}{field("ΔΟΥ", p.taxOffice)}{field("Διεύθυνση", [p.address, p.zip, p.city].filter(Boolean).join(", "))}
          {field("Τηλέφωνο", [p.phone, p.phone2].filter(Boolean).join(" · "))}{field("Email", p.email)}{field("Website", p.website)}
        </dl>
      </section>
          </>,
          transport: <>
      <PartnerEshopSetup partnerId={p.id} steps={setupSteps} initial={delivery} agencyId={p.agencyId} defaultZip={p.zip} canWrite={canWrite} agencies={agencies.map((a) => ({ ...a, suggested: near.has(a.id) })).sort((a, b) => Number(b.suggested) - Number(a.suggested))} />
          </>,
          orders,
          stores: <>
      <section data-help="partner.branches" className="grid gap-2">
        <h3 className="m-0 font-heading font-bold text-[length:var(--fs-16)]">Υποκαταστήματα · {p.branches.filter((b) => !b.s1Missing).length}</h3>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Η διαθεσιμότητα αναφέρεται σε υποκατάστημα: κάθε υποκατάστημα πρέπει να δείχνει στο κατάστημα του eshop που του αντιστοιχεί. Αν δεν υπάρχει, φτιάξε νέο (κρυφό)· ο διακόπτης ορίζει αν φαίνεται στο eshop (χάρτης, σελίδες καταστημάτων, παραλαβή).</p>
        <ul className="m-0 p-0 list-none grid gap-2">
          {p.branches.map((b) => {
            const options = stores.map((s) => ({ id: s.id, label: `${s.city} · ${s.name}`, taken: !!s.branch && s.branch.id !== b.id, near: (!!b.zip && s.zip.replace(/\D/g, "") === b.zip.replace(/\D/g, "")) || (!!b.city && cityKey(s.city) === cityKey(b.city)) }));
            return (
              <li key={b.id} className={`rounded-xl border bg-white p-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:items-start min-w-0 ${b.s1Missing ? "border-dashed border-eu-line opacity-70" : "border-eu-line"}`}>
                <div className="min-w-0">
                  <b className="break-words">{b.name}</b>
                  <span className="block text-eu-ink-3 text-[length:var(--fs-13)] break-words">
                    {[b.isCenter ? "Έδρα" : null, b.s1BranchId ? `TRDBRANCH ${b.s1BranchId}` : "από τη διεύθυνση του μέλους (χωρίς υποκατάστημα στο SoftOne)", [b.address, b.zip, b.city].filter(Boolean).join(", "), b.email].filter(Boolean).join(" · ")}
                  </span>
                  {b.s1Missing && <span className="block text-eu-red text-[length:var(--fs-12)] font-bold">Δεν υπάρχει πια στο SoftOne</span>}
                  {b.store && <span className="block text-[length:var(--fs-12)] text-eu-ink-3">Σύνδεση: {MATCHED[b.matchedBy ?? ""] ?? "—"} · <Link className="text-eu-blue hover:underline" href={`/admin/stores/${b.store.id}`}>άνοιγμα καταστήματος</Link></span>}
                </div>
                <div data-help="partner.store" className="grid gap-2 min-w-0">
                  {canWrite ? <BranchStoreLink key={`link-${b.storeId ?? "none"}`} branchId={b.id} storeId={b.storeId} options={options} /> : <span className="text-[length:var(--fs-14)]">{b.store ? `${b.store.city} · ${b.store.name}` : "Χωρίς κατάστημα"}</span>}
                  {b.store && (canWrite
                    ? <StoreVisibility key={`vis-${b.store.id}`} storeId={b.store.id} active={b.store.active} hasPoint={b.store.lat !== 0 || b.store.lng !== 0} />
                    : <span className="text-[length:var(--fs-13)]">{b.store.active ? "Εμφανίζεται στο eshop" : "Κρυφό στο eshop"}</span>)}
                  {!b.store && !b.s1Missing && canWrite && <CreateBranchStore branchId={b.id} />}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
          </>,
          contacts: <>
      <section data-help="partner.contacts" className="rounded-xl border border-eu-line bg-white p-3 grid gap-2">
        <h3 className="m-0 font-heading font-bold text-[length:var(--fs-16)]">Επαφές & πρόσβαση στην πύλη συνεργατών</h3>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-12)]">Τις επαφές τις δημιουργούμε εμείς. Για πρόσβαση: email με πρόσκληση ή link ορισμού κωδικού για αντιγραφή (72 ώρες, μία χρήση). Κάθε ενέργεια καταγράφεται.</p>
        <PartnerContacts partnerId={p.id} canWrite={canWrite} contacts={contacts.map((c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, role: c.role, isPrimary: c.isPrimary, account: c.account ? { id: c.account.id, active: c.account.active, hasPassword: !!c.account.passwordHash, lastLoginAt: c.account.lastLoginAt?.toISOString() ?? null, lockedUntil: c.account.lockedUntil?.toISOString() ?? null, pendingLink: c.account.tokens[0]?.expiresAt.toISOString() ?? null } : null }))} />
      </section>
      <section data-help="partner.portal-answers" className="rounded-xl border border-eu-line bg-white p-3 grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="m-0 font-heading font-bold text-[length:var(--fs-16)]">Από την πύλη συνεργατών</h3>
          {isVivaLead(ob.answers) && <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-300 text-emerald-900 font-bold px-3 min-h-8 text-[length:var(--fs-13)]">Θέλει Viva{ob.vivaAt ? ` · από ${fmtD(ob.vivaAt)}` : ""}</span>}
        </div>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-12)]">Ό,τι δήλωσε ο ίδιος ο συνεργάτης στην πύλη: ερωτηματολόγιο, έλεγχος ΑΑΔΕ και αλλαγές καταστημάτων ({portalChanges}).{answeredAt ? ` Τελευταία ενημέρωση ερωτηματολογίου: ${fmtD(answeredAt.createdAt)}.` : ""}</p>
        {ob.answers ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {QUESTION_STEPS.map((st) => (
              <dl key={st.key} className="m-0 grid gap-1.5 content-start rounded-lg bg-eu-surface-2 p-2.5 min-w-0">
                <dt className="font-bold text-eu-ink text-[length:var(--fs-13)]">{st.title}</dt>
                {st.questions.map((q) => <dd key={q.key} className="m-0 text-[length:var(--fs-13)] min-w-0"><span className="block text-eu-ink-3 text-[length:var(--fs-12)]">{q.label}</span><span className="break-words">{answerLabel(q.key, ob.answers?.[q.key])}</span></dd>)}
              </dl>
            ))}
          </div>
        ) : <p className="m-0 text-[length:var(--fs-14)] text-eu-ink-3">Δεν έχει συμπληρώσει ακόμη το ερωτηματολόγιο.</p>}
        <dl className="m-0 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
          {field("Πρόταση σύνδεσης", advice?.type ? `${connTypeInfo(advice.type)?.title ?? advice.type}${advice.why ? ` · ${advice.why}` : ""}` : null)}
          {field("Έλεγχος ΑΑΔΕ (από τον συνεργάτη)", aadeLog ? `${aadeLog.message.replace(/^ΑΑΔΕ:\s*/, "")} · ${fmtD(aadeLog.createdAt)}` : "Δεν έχει γίνει")}
        </dl>
      </section>
          </>,
          extra: <ExtraFields entity="partner" id={p.id} defs={defs} values={(p.extra ?? {}) as ExtraValues} canWrite={canWrite} />,
          history: historyPanel,
        }} />
    </div>
  );
}
