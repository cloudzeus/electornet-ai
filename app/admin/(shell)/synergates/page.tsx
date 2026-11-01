import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { PartnerImport } from "@/components/admin/partners/PartnerImport";
import { MissingStoresTools } from "@/components/admin/partners/PartnerStoreTools";
import { creatableBranches } from "@/lib/b2b/branch-stores";
import { VIVA_WHERE } from "@/lib/b2b/viva";

export const metadata = { title: "Συνεργάτες (B2B)" };
export const dynamic = "force-dynamic";

const fmt = (d: Date | null) => (d ? d.toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }) : "—");

/** Μέλη Euronics από το SoftOne (πελάτες με εμπορική κατηγορία ΜΕΛΟΣ), τα υποκαταστήματά τους και η σύνδεση με τα καταστήματα του eshop. */
export default async function PartnersAdmin({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string; view?: string }> }) {
  const user = await requirePermission("stores.partners.read");
  const canWrite = can(user.permissions, "stores.partners.write");
  const { q = "", cat = "", view = "" } = await searchParams;

  const where: Prisma.PartnerWhereInput = {};
  if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, { afm: { contains: q } }, { city: { contains: q, mode: "insensitive" } }, { branches: { some: { OR: [{ name: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }] } } }];
  if (cat) where.s1Business = Number(cat);
  if (view === "unlinked") where.branches = { some: { storeId: null, s1Missing: false } };
  if (view === "missing") where.s1Missing = true;
  if (view === "hidden") where.stores = { some: { active: false } };
  if (view === "viva") where.AND = [{ OR: VIVA_WHERE }];

  const [partners, cats, totals, lastSync, unlinkedStores] = await Promise.all([
    db.partner.findMany({
      where, orderBy: [{ name: "asc" }], take: 400,
      select: { id: true, code: true, name: true, city: true, category: true, groupName: true, status: true, s1Missing: true, branches: { where: { s1Missing: false }, select: { storeId: true, store: { select: { active: true } } } } },
    }),
    db.partner.groupBy({ by: ["s1Business", "category"], _count: { _all: true }, orderBy: { s1Business: "asc" } }),
    Promise.all([db.partner.count({ where: { s1Missing: false } }), db.partnerBranch.count({ where: { s1Missing: false } }), db.partnerBranch.count({ where: { s1Missing: false, storeId: null } }), db.store.count(), db.store.count({ where: { partnerId: null } }), db.partnerBranch.count({ where: creatableBranches }), db.store.count({ where: { partnerId: { not: null }, lat: 0, lng: 0, geoLat: null } }), db.store.count({ where: { partnerId: { not: null }, active: false } }), db.partner.count({ where: { OR: VIVA_WHERE } }), db.partnerInterest.count({ where: { status: "new" } })]),
    db.partner.aggregate({ _max: { s1SyncedAt: true } }),
    view === "stores" ? db.store.findMany({ where: { partnerId: null }, orderBy: [{ city: "asc" }, { name: "asc" }], select: { id: true, name: true, city: true, zip: true, member: true } }) : Promise.resolve([]),
  ]);
  const [nPartners, nBranches, nBranchesFree, nStores, nStoresFree, nCreatable, nUngeocoded, nHidden, nViva, nInterest] = totals;

  const chip = (href: string, label: string, active: boolean) => (
    <Link key={href} href={href} className={`inline-flex items-center rounded-full px-3 min-h-11 text-[length:var(--fs-13)] font-bold border ${active ? "bg-eu-navy text-white border-eu-navy" : "border-eu-line text-eu-ink hover:border-eu-navy"}`}>{label}</Link>
  );
  const qs = (o: Record<string, string>) => { const p = new URLSearchParams({ ...(q ? { q } : {}), ...(cat ? { cat } : {}), ...(view ? { view } : {}), ...o }); for (const [k, v] of [...p]) if (!v) p.delete(k); const s = p.toString(); return s ? `?${s}` : ""; };

  return (
    <div className="grid gap-3 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)] leading-tight">Συνεργάτες (B2B) <span className="text-eu-muted font-normal text-[length:var(--fs-16)] tabular-nums">· {nPartners}</span></h2>
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)] max-w-[80ch]">Τα μέλη Euronics όπως είναι στο SoftOne (πελάτες με εμπορική κατηγορία «ΜΕΛΟΣ») και τα υποκαταστήματά τους. Κάθε υποκατάστημα συνδέεται με ένα κατάστημα του eshop· εκεί θα φαίνεται η διαθεσιμότητά του. Τελευταία εισαγωγή: {fmt(lastSync._max.s1SyncedAt)}.</p>
          <Link data-help="partners.interest" href="/admin/synergates/endiaferon" className="mt-2 inline-flex items-center gap-2 rounded-full px-3 min-h-11 text-[length:var(--fs-13)] font-bold border border-eu-line text-eu-ink hover:border-eu-navy">Ενδιαφέρον συνεργατών<span className={`rounded-full px-2 tabular-nums ${nInterest ? "bg-eu-yellow text-eu-navy" : "bg-eu-surface-2"}`}>{nInterest} νέες</span></Link>
        </div>
        {canWrite && <div data-help="partners.import"><PartnerImport /></div>}
      </div>
      {canWrite && <div data-help="partners.create"><MissingStoresTools creatable={nCreatable} ungeocoded={nUngeocoded} /></div>}

      <div data-help="partners.kpis" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          ["Μέλη", nPartners, ""],
          ["Υποκαταστήματα SoftOne", nBranches, ""],
          ["Υποκαταστήματα χωρίς κατάστημα", nBranchesFree, "unlinked"],
          ["Καταστήματα eshop χωρίς μέλος", `${nStoresFree} / ${nStores}`, "stores"],
        ].map(([label, n, v]) => (
          <Link key={label as string} href={v ? qs({ view: v as string }) : qs({ view: "" })} className="rounded-xl border border-eu-line bg-white p-3 hover:border-eu-navy min-w-0">
            <span className="block text-eu-ink-3 text-[length:var(--fs-12)]">{label}</span>
            <span className="block font-heading font-bold text-eu-ink text-[length:var(--fs-20)] tabular-nums">{n}</span>
          </Link>
        ))}
      </div>

      <form data-help="partners.filters" className="flex flex-wrap items-center gap-2" action="/admin/synergates">
        <input name="q" defaultValue={q} placeholder="Επωνυμία, κωδικός, ΑΦΜ, πόλη…" className="min-h-11 rounded-full border border-eu-line px-4 text-[length:var(--fs-14)] w-full sm:w-72" aria-label="Αναζήτηση" />
        {cat && <input type="hidden" name="cat" value={cat} />}
        {view && <input type="hidden" name="view" value={view} />}
        <button className="min-h-11 rounded-full bg-eu-navy text-white font-bold px-5 text-[length:var(--fs-14)]">Αναζήτηση</button>
        <div className="flex flex-wrap gap-2 basis-full">
          {chip(qs({ cat: "" }), "Όλες οι κατηγορίες", !cat)}
          {cats.filter((c) => c.s1Business !== null).map((c) => chip(qs({ cat: String(c.s1Business) }), `${c.category ?? c.s1Business} · ${c._count._all}`, cat === String(c.s1Business)))}
          {chip(qs({ view: view === "hidden" ? "" : "hidden" }), `Με κρυφά καταστήματα · ${nHidden}`, view === "hidden")}
          {chip(qs({ view: view === "missing" ? "" : "missing" }), "Δεν υπάρχουν πια στο SoftOne", view === "missing")}
          <span data-help="partners.viva" className="contents">{chip(qs({ view: view === "viva" ? "" : "viva" }), `Θέλουν Viva · ${nViva}`, view === "viva")}{view === "viva" && nViva > 0 && <a href="/api/admin/partners/viva" className="inline-flex items-center rounded-full px-3 min-h-11 text-[length:var(--fs-13)] font-bold border border-emerald-400 text-emerald-900 bg-emerald-50 hover:border-emerald-700">Λήψη λίστας για τον account manager (CSV)</a>}</span>
        </div>
      </form>

      {view === "stores" ? (
        <section data-help="partners.stores" className="grid gap-2">
          <h3 className="m-0 font-heading font-bold text-[length:var(--fs-16)]">Καταστήματα eshop χωρίς μέλος · {unlinkedStores.length}</h3>
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Δεν βρέθηκε μονοσήμαντα από το email. Άνοιξε το μέλος (αναζήτηση με την επωνυμία ή την πόλη) και σύνδεσέ το από το υποκατάστημά του.</p>
          <ul className="m-0 p-0 list-none grid gap-1.5">
            {unlinkedStores.map((s) => (
              <li key={s.id} className="rounded-xl border border-eu-line bg-white p-3 flex flex-wrap items-center justify-between gap-2 min-w-0">
                <span className="min-w-0"><b className="break-words">{s.name}</b><span className="block text-eu-ink-3 text-[length:var(--fs-13)]">{s.city} {s.zip}{s.member ? ` · ${s.member}` : ""}</span></span>
                <Link href={`/admin/synergates?q=${encodeURIComponent(s.city)}`} className="text-eu-blue font-bold text-[length:var(--fs-13)] hover:underline">Μέλη στην πόλη</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <ul data-help="partners.list" className="m-0 p-0 list-none grid gap-1.5">
          {partners.map((p) => {
            const linked = p.branches.filter((b) => b.storeId).length;
            const hidden = p.branches.filter((b) => b.store && !b.store.active).length;
            return (
              <li key={p.id}>
                <Link href={`/admin/synergates/${p.id}`} className="rounded-xl border border-eu-line bg-white p-3 grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center hover:border-eu-navy min-w-0">
                  <span className="min-w-0">
                    <b className="break-words text-eu-ink">{p.name}</b>
                    <span className="block text-eu-ink-3 text-[length:var(--fs-13)]">{[p.code, p.city, p.category, p.groupName].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="flex flex-wrap gap-1.5 text-[length:var(--fs-12)]">
                    {p.s1Missing && <span className="rounded-full bg-eu-red/10 text-eu-red px-2 py-0.5 font-bold">όχι στο SoftOne</span>}
                    {hidden > 0 && <span className="rounded-full bg-eu-surface-2 text-eu-ink-2 px-2 py-0.5 font-bold">{hidden} κρυφ{hidden === 1 ? "ό" : "ά"}</span>}
                    <span className={`rounded-full px-2 py-0.5 font-bold ${linked === p.branches.length ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{linked}/{p.branches.length} καταστήματα</span>
                  </span>
                </Link>
              </li>
            );
          })}
          {!partners.length && <li className="text-eu-ink-3 text-[length:var(--fs-14)] p-3">{nPartners ? "Κανένα μέλος με αυτά τα φίλτρα." : "Δεν έχει γίνει ακόμη εισαγωγή από το SoftOne."}</li>}
        </ul>
      )}
    </div>
  );
}
