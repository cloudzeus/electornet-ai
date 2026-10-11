import Link from "next/link";
import { Package, ImageOff, AlertTriangle, Images, Ruler, ScanText } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { Pagination } from "@/components/admin/Pagination";
import { LOW_RES_PX } from "@/lib/catalog/product-images";
import { hasEnergyLabel } from "@/lib/catalog/energy-types";
import { ProductTable, ProductCards, type ProductRow } from "@/components/admin/catalog/ProductTable";

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
export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string; cat?: string; page?: string; s?: string; d?: string; n?: string }> }) {
  const user = await requirePermission("catalog.products.read");
  const promoWrite = can(user.permissions, "catalog.promos.write");
  const { q = "", f = "", cat = "", page: p = "1", s: sRaw = "", d: dRaw = "", n: nRaw = "" } = await searchParams;
  const page = Math.max(1, Number(p) || 1);
  const sort = SORTS[sRaw] ? sRaw : "updated";
  const dir: Dir = dRaw === "asc" || dRaw === "desc" ? dRaw : sort === "updated" || sort === "photos" || sort === "specs" || sort === "stock" ? "desc" : "asc";
  const PAGE = SIZES.includes(Number(nRaw)) ? Number(nRaw) : 50;
  const where: Prisma.ProductWhereInput = {
    ...(q.trim() ? { OR: [{ title: { contains: q.trim(), mode: "insensitive" } }, { sku: { contains: q.trim(), mode: "insensitive" } }, { ean: { contains: q.trim() } }, { erpCode: q.trim() }] } : {}),
    ...(cat ? { category: { parent: { parentId: cat } } } : {}),
    ...(f === "noimg" ? { media: { none: shown } } : f === "lowres" ? { media: { some: { ...shown, width: { lt: LOW_RES_PX }, height: { lt: LOW_RES_PX } } } } : f === "one" ? { media: { some: shown }, NOT: { media: { some: { ...shown, sortNo: { gt: 1 } } } } } : f === "inactive" ? { active: false } : {}),
  };
  const [rows, total, masters, all, withImg, lowRes] = await Promise.all([
    db.product.findMany({ where, orderBy: [SORTS[sort](dir), { id: "asc" }], skip: (page - 1) * PAGE, take: PAGE, select: { id: true, title: true, sku: true, ean: true, erpCode: true, active: true, price: true, stock: true, dimStatus: true, updatedAt: true, s1SyncedAt: true, brand: { select: { name: true } }, category: { select: { name: true, parent: { select: { name: true } } } }, energy: { select: { class: true, source: true } }, offer: { select: { price: true } }, media: { where: shown, orderBy: { sortNo: "asc" }, take: 1, select: { thumbUrl: true, url: true, width: true, height: true } }, _count: { select: { media: { where: shown }, specs: true, dimensions: true } } } }),
    db.product.count({ where }),
    db.category.findMany({ where: { depth: 0, active: true }, orderBy: { sortNo: "asc" }, select: { id: true, name: true } }),
    db.product.count({ where: { active: true } }),
    db.product.count({ where: { active: true, media: { some: shown } } }),
    db.product.count({ where: { active: true, media: { some: { ...shown, width: { lt: LOW_RES_PX }, height: { lt: LOW_RES_PX } } } } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  // προϊόντα που πουλιούνται ως «Set ειδών» στο SoftOne (σήμανση «Set»)
  const codes = rows.map((r) => Number(r.erpCode)).filter(Number.isInteger);
  const setHeads = new Set(codes.length ? (await db.s1Set.findMany({ where: { mtrl: { in: codes }, active: true }, select: { mtrl: true } }).catch(() => [])).map((s) => String(s.mtrl)) : []);
  // τεμάχια που πουλήθηκαν (e-shop + παραστατικά SoftOne, χωρίς ακυρωμένα) — μόνο για τις γραμμές της σελίδας
  const ids = rows.map((r) => r.id);
  const [erpSold, variants] = await Promise.all([
    db.purchaseLine.groupBy({ by: ["productId"], where: { productId: { in: ids }, purchase: { parentId: null, kind: { in: ["order", "receipt", "invoice"] }, NOT: { status: "cancelled" } } }, _sum: { qty: true } }),
    db.variant.findMany({ where: { productId: { in: ids } }, select: { id: true, productId: true } }),
  ]);
  const shopSold = variants.length ? await db.orderLine.groupBy({ by: ["variantId"], where: { variantId: { in: variants.map((v) => v.id) }, isGift: false, order: { status: { notIn: ["cancelled", "failed"] } } }, _sum: { qty: true } }) : [];
  const sold = new Map<string, number>();
  for (const x of erpSold) if (x.productId) sold.set(x.productId, (sold.get(x.productId) ?? 0) + (x._sum.qty ?? 0));
  const vp = new Map(variants.map((v) => [v.id, v.productId]));
  for (const x of shopSold) { const pid = vp.get(x.variantId); if (pid) sold.set(pid, (sold.get(pid) ?? 0) + (x._sum.qty ?? 0)); }
  const list: ProductRow[] = rows.map((r) => { const m = r.media[0]; return {
    id: r.id, title: r.title, brand: r.brand.name, category: `${r.category.parent?.name ? `${r.category.parent.name} › ` : ""}${r.category.name}`, sku: r.sku, ean: r.ean, erpCode: r.erpCode, active: r.active, isSet: setHeads.has(r.erpCode ?? ""),
    thumb: m ? m.thumbUrl ?? m.url : null, photos: r._count.media, lowMain: m?.width != null && m.height != null && Math.max(m.width, m.height) < LOW_RES_PX, specs: r._count.specs,
    price: r.price, offer: r.offer ? Number(r.offer.price) : null, stock: r.stock, sold: sold.get(r.id) ?? 0,
    energy: r.energy ? { cls: r.energy.class, source: r.energy.source } : null, energyNeeded: hasEnergyLabel(r.category.name), dims: r._count.dimensions, dimStatus: r.dimStatus,
    updated: r.updatedAt.toISOString(), synced: r.s1SyncedAt?.toISOString() ?? null,
  }; });
  const query = { q, f, cat, s: sRaw, d: dRaw, n: nRaw };
  const href = (n: number) => { const u = new URLSearchParams({ ...query, page: String(n) }); [...u.keys()].forEach((k) => !u.get(k) && u.delete(k)); return `?${u}`; };
  const n = (v: number) => v.toLocaleString("el-GR");

  return (
    <div className="grid gap-5 min-w-0">
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><Package className="size-3.5" aria-hidden /> Κατάλογος</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Προϊόντα</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">Όνομα, περιγραφή και κατηγορία έρχονται από το SoftOne. Οι φωτογραφίες είναι δικές μας: άνοιξε ένα προϊόν για να ανεβάσεις νέες, να διαλέξεις από τη βιβλιοθήκη πολυμέσων ή να αλλάξεις τη σειρά τους.</p>
        <Link href="/admin/catalog/dimensions" className="mt-2 inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-chip"><Ruler className="size-4" aria-hidden /> Διαστάσεις & EPREL</Link>
        <Link href="/admin/catalog/banners" className="mt-2 ml-2 inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-chip"><ScanText className="size-4" aria-hidden /> Απόδελτίωση banners</Link>
      </div>

      <div className="grid grid-cols-1 @2xl:grid-cols-3 gap-3">
        {[
          { t: "Ενεργά προϊόντα", v: n(all), s: `${n(withImg)} με φωτογραφία`, href: "?", Icon: Images },
          { t: "Χωρίς φωτογραφία", v: n(all - withImg), s: "δεν μπορούν να εμφανιστούν σωστά στο κατάστημα", href: "?f=noimg", Icon: ImageOff },
          { t: "Με μικρή φωτογραφία", v: n(lowRes), s: `κάτω από ${LOW_RES_PX}px — αξίζει αντικατάσταση`, href: "?f=lowres", Icon: AlertTriangle },
        ].map((c) => (
          <Link key={c.t} href={c.href} className="rounded-2xl bg-white border border-eu-line p-4 min-w-0 hover:border-eu-navy focus-visible:outline-2 focus-visible:outline-eu-blue">
            <div className="text-eu-muted text-[length:var(--fs-13)] inline-flex items-center gap-1.5"><c.Icon className="size-4" aria-hidden /> {c.t}</div>
            <div className="font-heading font-extrabold text-eu-ink text-[length:var(--fs-24)] tabular-nums">{c.v}</div>
            <div className="text-eu-ink-3 text-[length:var(--fs-13)]">{c.s}</div>
          </Link>
        ))}
      </div>

      <form className="flex flex-wrap gap-2" data-help="catalog.filters">
        {sRaw && <input type="hidden" name="s" value={sRaw} />}{dRaw && <input type="hidden" name="d" value={dRaw} />}{nRaw && <input type="hidden" name="n" value={nRaw} />}
        <label className="sr-only" htmlFor="cat-q">Αναζήτηση</label>
        <input id="cat-q" name="q" defaultValue={q} placeholder="Τίτλος, κωδικός, barcode…" className="flex-1 min-w-[240px] rounded-full border border-eu-line px-4 min-h-11 text-[length:var(--fs-14)]" />
        <label className="sr-only" htmlFor="cat-c">Κατηγορία</label>
        <select id="cat-c" name="cat" defaultValue={cat} className="rounded-full border border-eu-line px-3 min-h-11 text-[length:var(--fs-14)] bg-white"><option value="">Όλες οι κατηγορίες</option>{masters.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        <label className="sr-only" htmlFor="cat-f">Φίλτρο</label>
        <select id="cat-f" name="f" defaultValue={f} className="rounded-full border border-eu-line px-3 min-h-11 text-[length:var(--fs-14)] bg-white"><option value="">Όλα</option><option value="noimg">Χωρίς φωτογραφία</option><option value="one">Με μία μόνο φωτογραφία</option><option value="lowres">Με μικρή φωτογραφία</option><option value="inactive">Ανενεργά</option></select>
        <button className="rounded-full bg-eu-navy text-white px-5 min-h-11 font-bold text-[length:var(--fs-14)] cursor-pointer hover:bg-eu-blue">Φίλτρο</button>
      </form>

      {promoWrite && (
        <form id="bulk-promo" action="/admin/prosfores/new" method="get" className="flex flex-wrap items-center gap-2 rounded-2xl bg-eu-chip px-4 py-2">
          <span className="font-bold text-eu-navy text-[length:var(--fs-14)]">Προσφορά για τα επιλεγμένα:</span>
          <label className="sr-only" htmlFor="bulk-t">Είδος προσφοράς</label>
          <select id="bulk-t" name="template" className="rounded-full border border-eu-line px-3 min-h-11 text-[length:var(--fs-14)] bg-white"><option value="percent">Έκπτωση %</option><option value="amount">Έκπτωση €</option><option value="special">Ειδική τιμή</option><option value="nplusm">1+1 / 2+1</option><option value="nth">2ο −Χ %</option><option value="gift">Δώρο με αγορά</option><option value="service">Δωρεάν υπηρεσία</option><option value="shipping">Δωρεάν μεταφορικά</option></select>
          <button className="rounded-full bg-eu-navy text-white px-4 min-h-11 font-bold text-[length:var(--fs-14)] cursor-pointer hover:bg-eu-blue">Νέα προσφορά</button>
          {cat && <Link href={`/admin/prosfores/new?category=${cat}`} className="rounded-full border-2 border-eu-navy text-eu-navy px-4 min-h-11 inline-flex items-center font-bold text-[length:var(--fs-14)] hover:bg-white">…ή για όλη την κατηγορία</Link>}
        </form>
      )}
      {!all && <p className="m-0 rounded-2xl bg-white border border-eu-line p-8 text-center text-eu-muted">Δεν υπάρχουν προϊόντα ακόμη — τρέξε «Προβολή στο κατάστημα» από το SoftOne ERP › Κατάλογος & CCC.</p>}
      <div className="hidden @3xl:block"><ProductTable rows={list} sort={sort} dir={dir} query={query} perPage={PAGE} total={total} from={(page - 1) * PAGE + 1} canPromo={promoWrite} /></div>
      <div className="@3xl:hidden"><ProductCards rows={list} canPromo={promoWrite} /></div>
      <div className="flex justify-center"><Pagination page={page} pages={pages} total={total} label="προϊόντα" href={href} /></div>
    </div>
  );
}
