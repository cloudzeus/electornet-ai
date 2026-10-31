import Link from "next/link";
import { swr } from "@/lib/cache/swr";
import { Package, ImageOff, AlertTriangle, Images, Ruler, ScanText, Search, CalendarCheck, ListChecks } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { Pagination } from "@/components/admin/Pagination";
import { LOW_RES_PX } from "@/lib/catalog/product-images";
import { hasEnergyLabel } from "@/lib/catalog/energy-types";
import { itemWriteEnabled } from "@/lib/softone/item-write";
import { ProductTable, ProductCards, type ProductRow } from "@/components/admin/catalog/ProductTable";
import { SoldAloneBulk } from "@/components/admin/catalog/SoldAloneBulk";
import { SetsSyncButton } from "@/components/admin/catalog/SetsSyncButton";
import { setIndex } from "@/lib/catalog/sets";

export const metadata = { title: "Κατάλογος" };
export const dynamic = "force-dynamic";

const SIZES = [25, 50, 100, 200];
type Dir = "asc" | "desc";
/** ταξινόμηση της λίστας (?s=&d=) — η προεπιλογή είναι «τελευταία αλλαγή» */
const SORTS: Record<string, (d: Dir) => Prisma.ProductOrderByWithRelationInput> = {
  title: (d) => ({ title: d }), category: (d) => ({ category: { name: d } }), brand: (d) => ({ brand: { name: d } }), sku: (d) => ({ sku: d }),
  price: (d) => ({ price: { sort: d, nulls: "last" } }), stock: (d) => ({ stock: d }), photos: (d) => ({ media: { _count: d } }), specs: (d) => ({ specs: { _count: d } }),
  active: (d) => ({ active: d }), updated: (d) => ({ updatedAt: d }),
};
const shown = { kind: "image", hidden: false } as const;

/** Τα προϊόντα του καταστήματος (προβολή του SoftOne). Από εδώ ανοίγει η καρτέλα κάθε προϊόντος για τις φωτογραφίες του. */
/** Γενικά σύνολα του καταλόγου (ίδια για όλους) — 1′ στη μνήμη: τρεις μετρήσεις σε όλα τα προϊόντα με έλεγχο φωτογραφιών. */
const totalsCache = swr(async () => {
  return Promise.all([
    db.product.count({ where: { active: true } }),
    db.product.count({ where: { active: true, media: { some: shown } } }),
    db.product.count({ where: { active: true, media: { some: { ...shown, width: { lt: LOW_RES_PX }, height: { lt: LOW_RES_PX } } } } }),
  ]);
}, 60_000, { maxStaleMs: 10 * 60_000 });
const catalogTotals = () => totalsCache();

/** Τύπος προϊόντος (?type=): είδη ή σετ (όλα / εξαρτήματα / με δώρο). */
const TYPES: { v: string; label: string }[] = [
  { v: "", label: "Όλοι οι τύποι" }, { v: "item", label: "Είδη" }, { v: "set", label: "Σετ (όλα)" }, { v: "parts", label: "Σετ εξαρτημάτων" }, { v: "gift", label: "Σετ με δώρο" },
];

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string; cat?: string; type?: string; page?: string; s?: string; d?: string; n?: string }> }) {
  const user = await requirePermission("catalog.products.read");
  const promoWrite = can(user.permissions, "catalog.promos.write");
  const { q = "", f = "", cat = "", type: tRaw = "", page: p = "1", s: sRaw = "", d: dRaw = "", n: nRaw = "" } = await searchParams;
  const type = TYPES.some((t) => t.v === tRaw) ? tRaw : "";
  const ix = await setIndex().catch(() => null);
  const spcsWhere = (test: (x: { kind: string; mainOnSite: boolean }) => boolean) => [...(ix?.bySpcs ?? new Map()).entries()].filter(([, x]) => test(x)).map(([k]) => k);
  const page = Math.max(1, Number(p) || 1);
  const sort = SORTS[sRaw] ? sRaw : "updated";
  const dir: Dir = dRaw === "asc" || dRaw === "desc" ? dRaw : sort === "updated" || sort === "photos" || sort === "specs" || sort === "stock" ? "desc" : "asc";
  const PAGE = SIZES.includes(Number(nRaw)) ? Number(nRaw) : 50;
  const where: Prisma.ProductWhereInput = {
    ...(q.trim() ? { OR: [{ title: { contains: q.trim(), mode: "insensitive" } }, { sku: { contains: q.trim(), mode: "insensitive" } }, { ean: { contains: q.trim() } }, { erpCode: q.trim() }] } : {}),
    ...(cat ? { category: { parent: { parentId: cat } } } : {}),
    ...(type === "item" ? { kind: "item" } : type === "set" ? { kind: "set" } : type === "parts" || type === "gift" ? { kind: "set", setSpcs: { in: spcsWhere((x) => x.kind === type) } } : {}),
    ...(f === "alone-no" ? { kind: "item", soldAlone: false } : f === "set-out" ? { kind: "set", active: true, stock: { lte: 0 } } : f === "set-nomain" ? { kind: "set", setSpcs: { in: spcsWhere((x) => !x.mainOnSite) } } : f === "main" ? { kind: "item", erpCode: { in: [...(ix?.mainSets.keys() ?? [])] } } : {}),
    ...(f === "noimg" ? { media: { none: shown } } : f === "lowres" ? { media: { some: { ...shown, width: { lt: LOW_RES_PX }, height: { lt: LOW_RES_PX } } } } : f === "one" ? { media: { some: shown }, NOT: { media: { some: { ...shown, sortNo: { gt: 1 } } } } } : f === "inactive" ? { active: false } : f === "incomplete" ? { active: true, publishMissing: { isEmpty: false } } : f === "unpublished" ? { active: true, publishReady: false } : {}),
  };
  const [rows, total, masters, [all, withImg, lowRes]] = await Promise.all([
    db.product.findMany({ where, orderBy: [SORTS[sort](dir), { id: "asc" }], skip: (page - 1) * PAGE, take: PAGE, select: { id: true, title: true, slug: true, source: true, kind: true, setSpcs: true, soldAlone: true, soldAloneMode: true, sku: true, ean: true, erpCode: true, active: true, price: true, stock: true, dimStatus: true, updatedAt: true, s1SyncedAt: true, brand: { select: { name: true } }, category: { select: { name: true, parent: { select: { name: true } } } }, energy: { select: { class: true, source: true } }, offer: { select: { price: true } }, media: { where: shown, orderBy: { sortNo: "asc" }, take: 1, select: { thumbUrl: true, url: true, width: true, height: true } }, _count: { select: { media: { where: shown }, specs: true, dimensions: true } } } }),
    db.product.count({ where }),
    db.category.findMany({ where: { depth: 0, active: true }, orderBy: { sortNo: "asc" }, select: { id: true, name: true } }),
    catalogTotals(),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  // sets και τεμάχια που πουλήθηκαν (e-shop + παραστατικά SoftOne, χωρίς ακυρωμένα) — μόνο για τις γραμμές της σελίδας, σε έναν γύρο
  const ids = rows.map((r) => r.id);
  const [erpSold, variants, shopSold] = await Promise.all([
    db.purchaseLine.groupBy({ by: ["productId"], where: { productId: { in: ids }, purchase: { parentId: null, kind: { in: ["order", "receipt", "invoice"] }, NOT: { status: "cancelled" } } }, _sum: { qty: true } }),
    db.variant.findMany({ where: { productId: { in: ids } }, select: { id: true, productId: true } }),
    db.orderLine.groupBy({ by: ["variantId"], where: { variant: { productId: { in: ids } }, isGift: false, order: { status: { notIn: ["cancelled", "failed"] } } }, _sum: { qty: true } }),
  ]);
  const sold = new Map<string, number>();
  for (const x of erpSold) if (x.productId) sold.set(x.productId, (sold.get(x.productId) ?? 0) + (x._sum.qty ?? 0));
  const vp = new Map(variants.map((v) => [v.id, v.productId]));
  for (const x of shopSold) { const pid = vp.get(x.variantId); if (pid) sold.set(pid, (sold.get(pid) ?? 0) + (x._sum.qty ?? 0)); }
  const list: ProductRow[] = rows.map((r) => { const m = r.media[0]; return {
    id: r.id, title: r.title, slug: r.slug, fromS1: r.source === "softone" && Number.isInteger(Number(r.erpCode)), brand: r.brand.name, category: `${r.category.parent?.name ? `${r.category.parent.name} › ` : ""}${r.category.name}`, sku: r.sku, ean: r.ean, erpCode: r.erpCode, active: r.active,
    set: r.kind === "set" && r.setSpcs != null ? (() => { const x = ix?.bySpcs.get(r.setSpcs); return { kind: x?.kind ?? "parts", members: x?.members ?? 0 }; })() : null,
    mainOf: r.kind === "item" ? ix?.mainSets.get(r.erpCode) ?? 0 : 0, soldAlone: r.soldAlone, soldAloneMode: r.soldAloneMode,
    thumb: m ? m.thumbUrl ?? m.url : null, photos: r._count.media, lowMain: m?.width != null && m.height != null && Math.max(m.width, m.height) < LOW_RES_PX, specs: r._count.specs,
    price: r.price, offer: r.offer ? Number(r.offer.price) : null, stock: r.stock, sold: sold.get(r.id) ?? 0,
    energy: r.energy ? { cls: r.energy.class, source: r.energy.source } : null, energyNeeded: hasEnergyLabel(r.category.name), dims: r._count.dimensions, dimStatus: r.dimStatus,
    updated: r.updatedAt.toISOString(), synced: r.s1SyncedAt?.toISOString() ?? null,
  }; });
  const query = { q, f, cat, type, s: sRaw, d: dRaw, n: nRaw };
  const canWrite = can(user.permissions, "catalog.products.write");
  const rowCan = { promo: promoWrite, write: canWrite, erpSave: canWrite && can(user.permissions, "catalog.sync.run") && (await itemWriteEnabled()) };
  const href = (n: number) => { const u = new URLSearchParams({ ...query, page: String(n) }); [...u.keys()].forEach((k) => !u.get(k) && u.delete(k)); return `?${u}`; };
  const n = (v: number) => v.toLocaleString("el-GR");

  return (
    <div className="grid gap-2.5 min-w-0">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="grid min-w-0">
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)] inline-flex items-center gap-2"><Package className="size-5 text-eu-blue" aria-hidden /> Προϊόντα</h2>
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Όνομα, περιγραφή και κατηγορία από το SoftOne. Φωτογραφίες, προσφορές και περιεχόμενο εδώ.</p>
        </div>
        <nav aria-label="Εργαλεία καταλόγου" className="flex flex-wrap items-center gap-1.5">
          {type && type !== "item" && can(user.permissions, "catalog.sync.run") && <span data-help="catalog.sets-sync"><SetsSyncButton /></span>}
          <Link href="/admin/catalog/dimensions" className="inline-flex items-center gap-1.5 rounded-full border border-eu-line bg-white text-eu-navy font-bold text-[length:var(--fs-13)] px-3 min-h-11 md:min-h-9 hover:border-eu-navy"><Ruler className="size-4" aria-hidden /> Διαστάσεις & EPREL</Link>
          <Link href="/admin/catalog/availability" className="inline-flex items-center gap-1.5 rounded-full border border-eu-line bg-white text-eu-navy font-bold text-[length:var(--fs-13)] px-3 min-h-11 md:min-h-9 hover:border-eu-navy"><CalendarCheck className="size-4" aria-hidden /> Διαθεσιμότητα</Link>
          <Link href="/admin/catalog/completeness" className="inline-flex items-center gap-1.5 rounded-full border border-eu-line bg-white text-eu-navy font-bold text-[length:var(--fs-13)] px-3 min-h-11 md:min-h-9 hover:border-eu-navy"><ListChecks className="size-4" aria-hidden /> Πληρότητα</Link>
          <Link href="/admin/catalog/banners" className="inline-flex items-center gap-1.5 rounded-full border border-eu-line bg-white text-eu-navy font-bold text-[length:var(--fs-13)] px-3 min-h-11 md:min-h-9 hover:border-eu-navy"><ScanText className="size-4" aria-hidden /> Απόδελτίωση banners</Link>
        </nav>
      </header>

      <div className="grid grid-cols-1 @xl:grid-cols-3 rounded-xl border border-eu-line bg-white overflow-hidden divide-y @xl:divide-y-0 @xl:divide-x divide-eu-line-2">
        {[
          { t: "Ενεργά προϊόντα", v: n(all), s: `${n(withImg)} με φωτογραφία`, href: "?", Icon: Images, on: !f },
          { t: "Χωρίς φωτογραφία", v: n(all - withImg), s: "δεν εμφανίζονται σωστά στο κατάστημα", href: "?f=noimg", Icon: ImageOff, on: f === "noimg" },
          { t: "Με μικρή φωτογραφία", v: n(lowRes), s: `κάτω από ${LOW_RES_PX}px, αξίζει αντικατάσταση`, href: "?f=lowres", Icon: AlertTriangle, on: f === "lowres" },
        ].map((c) => (
          <Link key={c.t} href={c.href} aria-current={c.on ? "true" : undefined} className={`grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 px-3 py-2 min-w-0 hover:bg-eu-surface/60 focus-visible:outline-2 focus-visible:outline-eu-blue ${c.on ? "bg-eu-chip/60" : ""}`}>
            <c.Icon className="size-4 text-eu-muted row-span-2" aria-hidden />
            <span className="flex items-baseline gap-2 min-w-0"><b className="font-heading font-extrabold text-eu-ink text-[length:var(--fs-18)] tabular-nums">{c.v}</b><span className="text-eu-ink-2 font-semibold text-[length:var(--fs-12)] truncate">{c.t}</span></span>
            <span className="text-eu-muted text-[length:var(--fs-12)] truncate">{c.s}</span>
          </Link>
        ))}
      </div>

      <div className="grid gap-1.5 @4xl:flex @4xl:items-center">
        <form className="flex flex-wrap gap-1.5 flex-1 min-w-0" data-help="catalog.filters">
          {sRaw && <input type="hidden" name="s" value={sRaw} />}{dRaw && <input type="hidden" name="d" value={dRaw} />}{nRaw && <input type="hidden" name="n" value={nRaw} />}
          <label className="relative flex-1 min-w-[14rem]"><span className="sr-only">Αναζήτηση</span><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-eu-muted" aria-hidden /><input id="cat-q" name="q" defaultValue={q} placeholder="Τίτλος, κωδικός, barcode, MTRL" className="rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9 text-[length:var(--fs-13)] w-full pl-8" /></label>
          <label className="sr-only" htmlFor="cat-c">Κατηγορία</label>
          <select id="cat-c" name="cat" defaultValue={cat} className="flex-1 @md:flex-none min-w-[9rem] rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9 text-[length:var(--fs-13)]"><option value="">Όλες οι κατηγορίες</option>{masters.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          <label className="sr-only" htmlFor="cat-t">Τύπος</label>
          <select id="cat-t" name="type" defaultValue={type} data-help="catalog.type" className="flex-1 @md:flex-none min-w-[9rem] rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9 text-[length:var(--fs-13)]">{TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}</select>
          <label className="sr-only" htmlFor="cat-f">Φίλτρο</label>
          <select id="cat-f" name="f" defaultValue={f} className="flex-1 @md:flex-none min-w-[9rem] rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9 text-[length:var(--fs-13)]"><option value="">Όλα</option><option value="noimg">Χωρίς φωτογραφία</option><option value="one">Με μία μόνο φωτογραφία</option><option value="lowres">Με μικρή φωτογραφία</option><option value="inactive">Ανενεργά</option><optgroup label="Πληρότητα"><option value="incomplete">Ημιτελή</option><option value="unpublished">Δεν δημοσιεύονται</option></optgroup><optgroup label="Σετ"><option value="main">Κύρια είδη σετ</option><option value="alone-no">Μόνο σε σετ (κρυφά από τις λίστες)</option><option value="set-out">Σετ χωρίς απόθεμα μέλους</option><option value="set-nomain">Σετ με κύριο είδος εκτός site</option></optgroup></select>
          <button className="rounded-full bg-eu-navy text-white px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] cursor-pointer hover:bg-eu-blue">Φίλτρο</button>
        </form>
        {promoWrite && (
          <form id="bulk-promo" action="/admin/prosfores/new" method="get" className="flex flex-wrap items-center gap-1.5 rounded-lg bg-eu-chip px-2 py-1">
            <span className="font-bold text-eu-navy text-[length:var(--fs-12)] px-1">Επιλεγμένα σε νέα προσφορά</span>
            <label className="sr-only" htmlFor="bulk-t">Είδος προσφοράς</label>
            <select id="bulk-t" name="template" className="rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9 text-[length:var(--fs-13)]"><option value="percent">Έκπτωση %</option><option value="amount">Έκπτωση €</option><option value="special">Ειδική τιμή</option><option value="nplusm">1+1 / 2+1</option><option value="nth">2ο −Χ %</option><option value="gift">Δώρο με αγορά</option><option value="service">Δωρεάν υπηρεσία</option><option value="shipping">Δωρεάν μεταφορικά</option></select>
            <button className="rounded-full bg-eu-navy text-white px-3 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] cursor-pointer hover:bg-eu-blue">Δημιουργία</button>
            {cat && <Link href={`/admin/prosfores/new?category=${cat}`} className="rounded-full border border-eu-navy text-eu-navy px-3 min-h-11 md:min-h-9 inline-flex items-center font-bold text-[length:var(--fs-12)] hover:bg-white">ή όλη η κατηγορία</Link>}
          </form>
        )}
      </div>
      {canWrite && <SoldAloneBulk />}
      {!all && <p className="m-0 rounded-2xl bg-white border border-eu-line p-8 text-center text-eu-muted">Δεν υπάρχουν προϊόντα ακόμη. Τρέξε «Προβολή στο κατάστημα» από το SoftOne ERP › Κατάλογος & CCC.</p>}
      <div className="hidden @3xl:block"><ProductTable rows={list} sort={sort} dir={dir} query={query} perPage={PAGE} total={total} from={(page - 1) * PAGE + 1} canPromo={promoWrite} canSelect={promoWrite || canWrite} can={rowCan} /></div>
      <div className="@3xl:hidden"><ProductCards rows={list} canPromo={promoWrite} canSelect={promoWrite || canWrite} can={rowCan} /></div>
      <div className="flex justify-center"><Pagination page={page} pages={pages} total={total} label="προϊόντα" href={href} /></div>
    </div>
  );
}
