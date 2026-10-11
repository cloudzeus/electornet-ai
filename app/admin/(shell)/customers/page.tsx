import Link from "next/link";
import { Plus, Mail, Building2, Link2, AlertTriangle, Search, ShoppingBag, History, Ban, UserX, CircleAlert, Upload } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { getS1Config } from "@/lib/softone";
import type { Prisma } from "@prisma/client";
import { geocodeAddress, distanceKm } from "@/lib/stores/geocode";
import { StoreMapClient } from "@/components/admin/stores/StoreMapClient";
import { SegmentTools } from "@/components/admin/customers/SegmentTools";
import { Pagination } from "@/components/admin/Pagination";
import { CustomerList, type CustomerRow, type SortHead } from "@/components/admin/customers/CustomerList";
import { CustomerTable } from "@/components/admin/customers/CustomerTable";

export const metadata = { title: "Πελάτες" };
export const dynamic = "force-dynamic";

/** Ταξινόμηση από τις κεφαλίδες του πίνακα: `?s=<στήλη>&d=asc|desc`. Πρώτο κλικ: κείμενο Α→Ω, αριθμοί μεγαλύτερο πρώτα. */
type Dir = "asc" | "desc";
const SORTS: Record<string, { first: Dir; order: (d: Dir) => Prisma.CustomerOrderByWithRelationInput[] }> = {
  name: { first: "asc", order: (d) => [{ lastName: d }, { firstName: d }] },
  contact: { first: "asc", order: (d) => [{ email: { sort: d, nulls: "last" } }] },
  vat: { first: "asc", order: (d) => [{ vatNumber: { sort: d, nulls: "last" } }, { erpCode: { sort: d, nulls: "last" } }] },
  orders: { first: "desc", order: (d) => [{ purchaseCount: d }, { purchaseTotal: d }, { lastPurchaseAt: { sort: d, nulls: "last" } }] },
  points: { first: "desc", order: (d) => [{ loyaltyPoints: d }] },
  store: { first: "asc", order: (d) => [{ preferredStore: { city: d } }] },
  status: { first: "asc", order: (d) => [{ status: d }] },
  number: { first: "desc", order: (d) => [{ number: d }] },
  total: { first: "desc", order: (d) => [{ purchaseTotal: d }] },
  last: { first: "desc", order: (d) => [{ lastPurchaseAt: { sort: d, nulls: "last" } }] },
  created: { first: "desc", order: (d) => [{ createdAt: d }] },
};

/** χρονική αφετηρία του αιτήματος (εκτός render, για τον κανόνα καθαρότητας) */
const since30 = () => new Date(Date.now() - 30 * 86400_000);

/**
 * Πελάτες: KPIs, αναζήτηση, φίλτρα με πλήθη, τοποθεσία (αναδιπλούμενη), και πυκνή λίστα όπου κάθε γραμμή ανοίγει σε όλη
 * την εικόνα του πελάτη (στοιχεία, αγορές e-shop & SoftOne, αιτήματα, εγγυήσεις, πόντοι & συναινέσεις, SoftOne).
 */
export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string; p?: string; region?: string; store?: string; near?: string; km?: string; view?: string; s?: string; d?: string; n?: string }> }) {
  const user = await requirePermission("customers.read");
  const { q = "", f = "", p = "1", region = "", store = "", near = "", km = "25", view = "", s: sRaw = "", d: dRaw = "", n: nRaw = "" } = await searchParams;
  const sort = SORTS[sRaw] ? sRaw : "";
  const dir: Dir = dRaw === "asc" || dRaw === "desc" ? dRaw : sort ? SORTS[sort].first : "desc";
  const s = sort, d = sort ? dir : "";
  const orderBy: Prisma.CustomerOrderByWithRelationInput[] = sort ? [...SORTS[sort].order(dir), { number: "desc" }] : [{ createdAt: "desc" }];
  // location segmentation: by prefecture, by nearest store, or within a radius of a geocoded place
  let center: { lat: number; lng: number; label: string } | null = null;
  if (near.trim()) { const g = await geocodeAddress(/ελλάδα|greece/i.test(near) ? near : `${near}, Ελλάδα`).catch(() => null); if (g) center = { lat: g.lat, lng: g.lng, label: g.label.split(",")[0] }; }
  const radiusKm = Math.max(1, Number(km) || 25);
  const take = [25, 50, 100, 200].includes(Number(nRaw)) ? Number(nRaw) : 50;
  const page = Math.max(1, Number(p) || 1);
  const where: Prisma.CustomerWhereInput = {};
  const digits = q.replace(/\D/g, "");
  if (q) where.OR = [...(digits.length >= 6 ? [{ phoneKey: { contains: digits.slice(-10) } }] : []), { email: { contains: q, mode: "insensitive" } }, { firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { company: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { mobile: { contains: q } }, { vatNumber: { contains: q } }, { erpCode: { contains: q, mode: "insensitive" } }];
  if (f === "business") where.type = "business";
  if (f === "history") where.source = "softone-history";
  if (f === "buyers") where.purchaseCount = { gt: 0 };
  if (f === "newsletter") where.newsletter = true;
  if (f === "unlinked") where.erpTrdr = null;
  if (f === "failed") where.erpSyncStatus = "failed";
  if (f === "blocked") where.status = "blocked";
  if (f === "anonymised") where.status = "anonymised";
  if (region) where.addresses = { some: { region } };
  if (store) where.addresses = { some: { ...(region ? { region } : {}), nearestStoreId: store } };
  if (center) {
    const dLat = radiusKm / 111, dLng = radiusKm / (111 * Math.cos((center.lat * Math.PI) / 180));
    where.addresses = { some: { lat: { gte: center.lat - dLat, lte: center.lat + dLat }, lng: { gte: center.lng - dLng, lte: center.lng + dLng } } };
  }
  const [rows, total, stats] = await Promise.all([
    db.customer.findMany({ where, orderBy, skip: (page - 1) * take, take, include: { _count: { select: { orders: true, devices: true, tickets: true } }, preferredStore: { select: { city: true } }, addresses: { select: { id: true, lat: true, lng: true, city: true, region: true, isDefault: true, nearestStoreId: true, nearestKm: true } } } }),
    db.customer.count({ where }),
    Promise.all([db.customer.count(), db.customer.count({ where: { type: "business" } }), db.customer.count({ where: { newsletter: true } }), db.customer.count({ where: { erpTrdr: null, status: "active" } }), db.customer.count({ where: { erpSyncStatus: "failed" } }), db.gdprRequest.count({ where: { status: { in: ["open", "verifying", "in-progress"] } } }), db.customer.count({ where: { purchaseCount: { gt: 0 } } }), db.customer.count({ where: { createdAt: { gte: since30() }, source: { in: ["web", "store"] } } }), db.customer.count({ where: { source: "softone-history" } }), db.customer.count({ where: { status: "blocked" } }), db.customer.count({ where: { status: "anonymised" } })]),
  ]);
  const [all, business, newsletter, unlinked, failed, gdprOpen, buyers, new30, history, blocked, anonymised] = stats;
  const exact = center ? rows.filter((c) => c.addresses.some((a) => a.lat != null && distanceKm(center!, { lat: a.lat, lng: a.lng! }) <= radiusKm)) : rows;
  const [regions, storesWithCustomers] = await Promise.all([db.address.groupBy({ by: ["region"], _count: { _all: true }, orderBy: { region: "asc" }, where: { region: { not: "" } } }), db.address.groupBy({ by: ["nearestStoreId"], _count: { _all: true }, where: { nearestStoreId: { not: null } } })]);
  const storeNames = storesWithCustomers.length ? await db.store.findMany({ where: { id: { in: storesWithCustomers.map((s) => s.nearestStoreId!) } }, select: { id: true, name: true, city: true } }) : [];
  const n = take === 50 ? "" : String(take);
  const keep = (o: Record<string, string>) => { const u = new URLSearchParams({ q, f, region, store, near, km, view, s, d, n, ...o }); [...u.keys()].forEach((k) => !u.get(k) && u.delete(k)); return `?${u}`; };
  const canWrite = can(user.permissions, "customers.write");
  const erpOn = !!(await getS1Config());
  const pct = (x: number) => (all ? Math.round((x / all) * 100) : 0);
  const FILTERS = [
    { k: "", t: "Όλοι", n: all, I: null },
    { k: "buyers", t: "Με αγορές", n: buyers, I: ShoppingBag },
    { k: "business", t: "Εταιρείες", n: business, I: Building2 },
    { k: "newsletter", t: "Newsletter", n: newsletter, I: Mail },
    { k: "unlinked", t: "Χωρίς SoftOne", n: unlinked, I: Link2 },
    { k: "failed", t: "Αποτυχία sync", n: failed, I: CircleAlert },
    { k: "history", t: "Από ιστορικό SoftOne", n: history, I: History },
    { k: "blocked", t: "Μπλοκαρισμένοι", n: blocked, I: Ban },
    { k: "anonymised", t: "Ανωνυμοποιημένοι", n: anonymised, I: UserX },
  ];
  const HEADS: [string, string][] = [["name", "Πελάτης"], ["contact", "Επικοινωνία"], ["orders", "Αγορές"], ["vat", "SoftOne"], ["points", "Πόντοι"], ["store", "Κατάστημα · κατάσταση"]];
  const heads: SortHead[] = HEADS.map(([key, label]) => { const on = sort === key; const next: Dir = on ? (dir === "asc" ? "desc" : "asc") : SORTS[key].first; return { key, label, on, dir: on ? dir : null, href: keep({ s: key, d: next, p: "" }) }; });
  const list: CustomerRow[] = exact.map((c) => {
    const def = c.addresses.find((a) => a.isDefault) ?? c.addresses[0];
    return {
      id: c.id, number: c.number, name: c.type === "business" && c.company ? c.company : `${c.lastName} ${c.firstName}`, business: c.type === "business",
      sub: c.type === "business" ? `${c.lastName} ${c.firstName}` : c.source, email: c.email, phone: c.mobile ?? c.phone ?? null, vat: c.vatNumber,
      erp: { linked: !!c.erpTrdr, failed: c.erpSyncStatus === "failed", label: c.erpSyncStatus === "failed" ? "αποτυχία sync" : c.erpTrdr ? `${c.erpCode ?? "TRDR"}` : "χωρίς σύνδεση" },
      orders: Math.max(c._count.orders, c.purchaseCount), total: Number(c.purchaseTotal), last: c.lastPurchaseAt?.toISOString() ?? null, devices: c._count.devices, tickets: c._count.tickets,
      points: c.loyaltyPoints, tier: c.loyaltyTier, store: c.preferredStore?.city ?? null, region: def?.region ?? null,
      km: center && c.addresses.some((a) => a.lat != null) ? Math.min(...c.addresses.filter((a) => a.lat != null).map((a) => distanceKm(center!, { lat: a.lat!, lng: a.lng! }))) : null,
      status: c.status, newsletter: c.newsletter, tags: c.tags, source: c.source, created: c.createdAt.toISOString(), city: def?.city ?? null,
    };
  });
  return (
    <div className="grid gap-3 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)] leading-tight">Πελάτες</h2>
          <p className="m-0 mt-0.5 text-eu-ink-3 text-[length:var(--fs-14)] max-w-[90ch]">Λογαριασμοί e-shop και πελάτες καταστημάτων με το ιστορικό τους από το SoftOne. Άνοιξε μια γραμμή (▾) για όλη την εικόνα του πελάτη.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {gdprOpen > 0 && <Link href="/admin/gdpr" className="inline-flex items-center gap-1.5 rounded-full bg-eu-red/10 text-eu-red font-extrabold text-[length:var(--fs-14)] px-4 min-h-11"><AlertTriangle className="size-4" aria-hidden /> {gdprOpen} ανοιχτά GDPR</Link>}
          {can(user.permissions, "customers.write") && <Link href="/admin/customers/import" className="inline-flex items-center gap-1.5 rounded-full px-3 min-h-11 font-bold text-eu-navy text-[length:var(--fs-14)] hover:bg-eu-chip"><Upload className="size-4" aria-hidden /> Εισαγωγή nopCommerce</Link>}
          {can(user.permissions, "customers.write") && <Link href="/admin/customers/new" className="inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-blue"><Plus className="size-4" aria-hidden /> Νέος πελάτης</Link>}
        </div>
      </div>

      <dl data-help="customers.kpis" className="m-0 grid grid-cols-2 @3xl:grid-cols-4 rounded-2xl bg-white border border-eu-line divide-eu-line @3xl:divide-x [&>div]:px-3 [&>div]:py-2">
        {([
          ["Πελάτες", all.toLocaleString("el-GR"), `+${new30.toLocaleString("el-GR")} νέοι στο site (30 ημ.)`, keep({ f: "", p: "" }), false],
          ["Με αγορές", buyers.toLocaleString("el-GR"), `${pct(buyers)} % των πελατών`, keep({ f: "buyers", p: "" }), false],
          ["Newsletter", newsletter.toLocaleString("el-GR"), `${pct(newsletter)} % με συναίνεση`, keep({ f: "newsletter", p: "" }), false],
          ["Σύνδεση SoftOne", `${pct(all - unlinked)} %`, failed ? `${failed} αποτυχίες συγχρονισμού` : `${unlinked.toLocaleString("el-GR")} χωρίς καρτέλα`, keep({ f: failed ? "failed" : "unlinked", p: "" }), !!failed],
        ] as const).map(([l, v, sub, h, warn]) => (
          <div key={l} className="min-w-0"><Link href={h} className="grid hover:text-eu-blue"><dt className="text-eu-muted text-[length:var(--fs-12)] font-bold">{l}</dt><dd className="m-0 flex flex-col @5xl:flex-row @5xl:items-baseline @5xl:gap-2 min-w-0"><span className={`font-heading font-extrabold text-[length:var(--fs-20)] tabular-nums whitespace-nowrap ${warn ? "text-eu-amber" : "text-eu-ink"}`}>{v}</span><span className="text-eu-ink-3 text-[length:var(--fs-12)] leading-snug @5xl:truncate">{sub}</span></dd></Link></div>
        ))}
      </dl>

      <div data-help="customers.filters" className="grid gap-2">
        <form className="flex gap-2">
          <input type="hidden" name="f" value={f} />{s && <><input type="hidden" name="s" value={s} /><input type="hidden" name="d" value={d} /></>}{region && <input type="hidden" name="region" value={region} />}{store && <input type="hidden" name="store" value={store} />}
          <label className="relative flex-1 min-w-0"><span className="sr-only">Αναζήτηση πελάτη</span><Search className="size-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-eu-muted pointer-events-none" aria-hidden /><input name="q" defaultValue={q} enterKeyHint="search" placeholder="Όνομα, email, κινητό, ΑΦΜ, κωδικός SoftOne…" className="w-full rounded-full border-2 border-eu-line bg-white pl-11 pr-4 min-h-12 text-[length:var(--fs-15)] outline-none focus:border-eu-blue" /></label>
          <button type="submit" className="rounded-full bg-eu-navy text-white font-bold px-5 min-h-12 text-[length:var(--fs-14)] hover:bg-eu-blue">Αναζήτηση</button>
        </form>
        <nav aria-label="Φίλτρα πελατών" className="flex flex-wrap gap-1.5">
          {FILTERS.filter((x) => x.n > 0 || x.k === "" || x.k === f).map((x) => { const on = f === x.k; return (
            <Link key={x.k} href={keep({ f: x.k, p: "" })} aria-current={on ? "page" : undefined} className={`inline-flex items-center gap-1.5 rounded-full px-3 min-h-10 font-bold text-[length:var(--fs-13)] border ${on ? "bg-eu-navy text-white border-eu-navy" : "bg-white text-eu-ink-2 border-eu-line hover:border-eu-blue"}`}>
              {x.I && <x.I className="size-3.5" aria-hidden />}{x.t}<span className={`tabular-nums text-[length:var(--fs-12)] rounded-full px-1.5 ${on ? "bg-white/20" : x.k === "failed" ? "bg-eu-red/10 text-eu-red" : "bg-eu-surface text-eu-muted"}`}>{x.n.toLocaleString("el-GR")}</span>
            </Link>
          ); })}
        </nav>
      </div>
      <SegmentTools regions={regions.map((r) => ({ value: r.region, count: r._count._all }))} stores={storeNames.map((st) => ({ id: st.id, label: `${st.city} — ${st.name}`, count: storesWithCustomers.find((x) => x.nearestStoreId === st.id)?._count._all ?? 0 }))} current={{ q, f, region, store, near, km: String(radiusKm), view, s, d }} center={center} matched={exact.length} canExport={can(user.permissions, "customers.export")} exportRows={exact.map((c) => ({ email: c.email, name: c.type === "business" && c.company ? c.company : `${c.lastName} ${c.firstName}`, phone: c.mobile ?? c.phone ?? "", city: c.addresses.find((a) => a.isDefault)?.city ?? c.addresses[0]?.city ?? "", region: c.addresses.find((a) => a.isDefault)?.region ?? c.addresses[0]?.region ?? "", newsletter: c.newsletter, points: c.loyaltyPoints }))} />
      {view === "map" && <StoreMapClient markers={exact.flatMap((c) => c.addresses.filter((a) => a.lat != null).map((a) => ({ id: a.id, lat: a.lat!, lng: a.lng!, label: `${c.lastName} ${c.firstName} · ${a.city}`, href: `/admin/customers/${c.id}`, tone: a.isDefault ? "navy" : "green" as const })))} />}

      {list.length ? <>
        <div className="hidden @3xl:block"><CustomerTable rows={list} sort={sort} dir={dir} query={{ q, f, region, store, near, km: near ? km : "", view, s, d, n }} perPage={take} total={total} from={(page - 1) * take + 1} canWrite={canWrite} erpOn={erpOn} /></div>
        <div className="@3xl:hidden"><CustomerList rows={list} heads={heads} canWrite={canWrite} erpOn={erpOn} /></div>
      </> : <p className="m-0 rounded-2xl bg-white border border-eu-line p-6 text-center text-eu-muted text-[length:var(--fs-15)]">Κανένας πελάτης με αυτά τα κριτήρια.{(q || f || region || store || near) && <> <Link href="/admin/customers" className="font-bold text-eu-blue hover:underline">Καθαρισμός φίλτρων</Link></>}</p>}
      {total > take && <div className="flex justify-center"><Pagination page={page} pages={Math.max(1, Math.ceil(total / take))} total={total} label="πελάτες" href={(n) => keep({ p: String(n) })} /></div>}
    </div>
  );
}
