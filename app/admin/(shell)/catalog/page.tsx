import Link from "next/link";
import { swr } from "@/lib/cache/swr";
import { Package, ImageOff, AlertTriangle, Images, Ruler, ScanText, Search, CalendarCheck, ListChecks, SlidersHorizontal, ChevronDown, X, RotateCcw } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { Pagination } from "@/components/admin/Pagination";
import { LOW_RES_PX } from "@/lib/catalog/product-images";
import { hasEnergyLabel } from "@/lib/catalog/energy-types";
import { itemWriteEnabled } from "@/lib/softone/item-write";
import { ProductTable, ProductCards, type ProductRow } from "@/components/admin/catalog/ProductTable";
import { kotView } from "@/lib/competitors/badge";
import { SoldAloneBulk } from "@/components/admin/catalog/SoldAloneBulk";
import { CatalogBulk } from "@/components/admin/catalog/CatalogBulk";
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
  created: (d) => ({ createdAt: d }), synced: (d) => ({ s1SyncedAt: { sort: d, nulls: "last" } }), ean: (d) => ({ ean: { sort: d, nulls: "last" } }), mtrl: (d) => ({ erpCode: d }),
  offer: (d) => ({ offer: { price: d } }), energy: (d) => ({ energy: { class: d } }), dims: (d) => ({ dimensions: { _count: d } }),
};
/** επιλογές της λίστας «Ταξινόμηση» (για κινητό, όπου δεν υπάρχουν κεφαλίδες) — τιμή «κλειδί:κατεύθυνση» */
const SORT_OPTS: [string, string][] = [
  ["updated:desc", "Τελευταία αλλαγή"], ["created:desc", "Νεότερα πρώτα"], ["created:asc", "Παλαιότερα πρώτα"],
  ["price:asc", "Τιμή: φθηνότερα πρώτα"], ["price:desc", "Τιμή: ακριβότερα πρώτα"], ["offer:asc", "Τιμή προσφοράς: χαμηλότερη"],
  ["stock:desc", "Απόθεμα: περισσότερο"], ["stock:asc", "Απόθεμα: λιγότερο"], ["title:asc", "Όνομα Α–Ω"], ["title:desc", "Όνομα Ω–Α"],
  ["brand:asc", "Μάρκα Α–Ω"], ["category:asc", "Κατηγορία Α–Ω"], ["sku:asc", "Κωδικός"], ["mtrl:asc", "MTRL"], ["ean:asc", "Barcode"],
  ["photos:asc", "Λιγότερες φωτογραφίες"], ["photos:desc", "Περισσότερες φωτογραφίες"], ["specs:asc", "Λιγότερα χαρακτηριστικά"], ["specs:desc", "Περισσότερα χαρακτηριστικά"],
  ["energy:asc", "Ενεργειακή κλάση"], ["dims:desc", "Πηγές διαστάσεων"], ["synced:desc", "Τελευταίο SoftOne"], ["active:asc", "Ανενεργά πρώτα"],
];
const F_GROUPS: [string, [string, string][]][] = [
  ["", [["noimg", "Χωρίς φωτογραφία"], ["one", "Με μία μόνο φωτογραφία"], ["lowres", "Με μικρή φωτογραφία"], ["inactive", "Ανενεργά"]]],
  ["Πληρότητα", [["incomplete", "Ημιτελή"], ["unpublished", "Δεν δημοσιεύονται"]]],
  ["Σετ", [["main", "Κύρια είδη σετ"], ["alone-no", "Μόνο σε σετ (κρυφά από τις λίστες)"], ["set-out", "Σετ χωρίς απόθεμα μέλους"], ["set-nomain", "Σετ με κύριο είδος εκτός site"]]],
];
const F_OPTS = F_GROUPS.flatMap(([, o]) => o);
const ON_OFFER: Prisma.ProductOfferWhereInput = { OR: [{ promotionId: { not: null } }, { NOT: { tags: { equals: [] } } }] };
const AVAIL = [["in-stock", "Άμεσα διαθέσιμο"], ["low", "Μικρό απόθεμα"], ["order", "Κατόπιν παραγγελίας"], ["unavailable", "Μη διαθέσιμο"]] as const;
const num = (v: string) => { const x = Number(v.replace(",", ".")); return v.trim() && Number.isFinite(x) && x >= 0 ? x : null; };
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

export default async function CatalogPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("catalog.products.read");
  const promoWrite = can(user.permissions, "catalog.promos.write");
  const sp = await searchParams;
  const { q = "", f = "", cat = "", sub = "", br = "", pmin = "", pmax = "", st = "", of = "", av = "", type: tRaw = "", page: p = "1", n: nRaw = "" } = sp;
  // «Ταξινόμηση» της φόρμας (?o=κλειδί:κατεύθυνση) υπερισχύει μόνο όταν δεν ήρθε κλικ σε κεφαλίδα (?s=)
  const [oS = "", oD = ""] = (sp.o ?? "").split(":");
  const sRaw = sp.s ?? (SORTS[oS] ? oS : ""), dRaw = sp.s ? sp.d ?? "" : oD;
  const lo = num(pmin), hi = num(pmax);
  const type = TYPES.some((t) => t.v === tRaw) ? tRaw : "";
  const ix = await setIndex().catch(() => null);
  const spcsWhere = (test: (x: { kind: string; mainOnSite: boolean }) => boolean) => [...(ix?.bySpcs ?? new Map()).entries()].filter(([, x]) => test(x)).map(([k]) => k);
  const page = Math.max(1, Number(p) || 1);
  const sort = SORTS[sRaw] ? sRaw : "updated";
  const dir: Dir = dRaw === "asc" || dRaw === "desc" ? dRaw : sort === "updated" || sort === "photos" || sort === "specs" || sort === "stock" ? "desc" : "asc";
  const PAGE = SIZES.includes(Number(nRaw)) ? Number(nRaw) : 50;
  const where: Prisma.ProductWhereInput = {
    ...(q.trim() ? { OR: [{ title: { contains: q.trim(), mode: "insensitive" } }, { sku: { contains: q.trim(), mode: "insensitive" } }, { ean: { contains: q.trim() } }, { erpCode: q.trim() }] } : {}),
    ...(sub ? { category: { parentId: sub } } : cat ? { category: { parent: { parentId: cat } } } : {}),
    AND: [
      ...(br ? [{ brandId: br }] : []),
      ...(lo != null || hi != null ? [{ price: { ...(lo != null ? { gte: lo } : {}), ...(hi != null ? { lte: hi } : {}) } }] : []),
      ...(st === "in" ? [{ stock: { gt: 0 } }] : st === "out" ? [{ stock: { lte: 0 } }] : []),
      // «σε προσφορά» = έκπτωση τιμής ή προσφορά ποσότητας/δώρου/υπηρεσίας (tags)
      ...(of === "yes" ? [{ offer: ON_OFFER }] : of === "no" ? [{ NOT: { offer: ON_OFFER } }] : []),
      ...(of === "noprice" ? [{ price: null }] : []),
      ...(AVAIL.some(([k]) => k === av) ? [{ availState: av }] : []),
    ],
    ...(type === "item" ? { kind: "item" } : type === "set" ? { kind: "set" } : type === "parts" || type === "gift" ? { kind: "set", setSpcs: { in: spcsWhere((x) => x.kind === type) } } : {}),
    ...(f === "alone-no" ? { kind: "item", soldAlone: false } : f === "set-out" ? { kind: "set", active: true, stock: { lte: 0 } } : f === "set-nomain" ? { kind: "set", setSpcs: { in: spcsWhere((x) => !x.mainOnSite) } } : f === "main" ? { kind: "item", erpCode: { in: [...(ix?.mainSets.keys() ?? [])] } } : {}),
    ...(f === "noimg" ? { media: { none: shown } } : f === "lowres" ? { media: { some: { ...shown, width: { lt: LOW_RES_PX }, height: { lt: LOW_RES_PX } } } } : f === "one" ? { media: { some: shown }, NOT: { media: { some: { ...shown, sortNo: { gt: 1 } } } } } : f === "inactive" ? { active: false } : f === "incomplete" ? { active: true, publishMissing: { isEmpty: false } } : f === "unpublished" ? { active: true, publishReady: false } : {}),
  };
  const [rows, total, masters, [all, withImg, lowRes], brands, subs, stickers] = await Promise.all([
    db.product.findMany({ where, orderBy: [SORTS[sort](dir), { id: "asc" }], skip: (page - 1) * PAGE, take: PAGE, select: { id: true, title: true, slug: true, source: true, kind: true, setSpcs: true, soldAlone: true, soldAloneMode: true, sku: true, ean: true, erpCode: true, active: true, price: true, stock: true, dimStatus: true, updatedAt: true, createdAt: true, s1SyncedAt: true, brand: { select: { name: true } }, category: { select: { name: true, parent: { select: { name: true, parent: { select: { name: true } } } } } }, energy: { select: { class: true, source: true } }, offer: { select: { price: true } }, competitorPrices: { where: { competitor: "kotsovolos" }, select: { match: true, extId: true, extUrl: true, extTitle: true, listPrice: true, offerPrice: true, available: true, ourPrice: true, diffPct: true, lastError: true, checkedAt: true } }, media: { where: shown, orderBy: { sortNo: "asc" }, take: 1, select: { thumbUrl: true, url: true, width: true, height: true } }, _count: { select: { media: { where: shown }, specs: true, dimensions: true } } } }),
    db.product.count({ where }),
    db.category.findMany({ where: { depth: 0, active: true }, orderBy: { sortNo: "asc" }, select: { id: true, name: true } }),
    catalogTotals(),
    db.brand.findMany({ where: { products: { some: {} } }, orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { products: true } } } }),
    cat ? db.category.findMany({ where: { parentId: cat, active: true }, orderBy: { sortNo: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
    db.sticker.findMany({ where: { active: true }, orderBy: { sort: "asc" }, select: { id: true, name: true } }),
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
    id: r.id, title: r.title, slug: r.slug, fromS1: r.source === "softone" && Number.isInteger(Number(r.erpCode)), brand: r.brand.name, category: `${r.category.parent?.name ? `${r.category.parent.name} › ` : ""}${r.category.name}`, categoryPath: [r.category.parent?.parent?.name, r.category.parent?.name, r.category.name].filter((x): x is string => !!x), sku: r.sku, ean: r.ean, erpCode: r.erpCode, active: r.active,
    set: r.kind === "set" && r.setSpcs != null ? (() => { const x = ix?.bySpcs.get(r.setSpcs); return { kind: x?.kind ?? "parts", members: x?.members ?? 0 }; })() : null,
    mainOf: r.kind === "item" ? ix?.mainSets.get(r.erpCode) ?? 0 : 0, soldAlone: r.soldAlone, soldAloneMode: r.soldAloneMode,
    thumb: m ? m.thumbUrl ?? m.url : null, photos: r._count.media, lowMain: m?.width != null && m.height != null && Math.max(m.width, m.height) < LOW_RES_PX, specs: r._count.specs,
    price: r.price, offer: r.offer ? Number(r.offer.price) : null, stock: r.stock, sold: sold.get(r.id) ?? 0,
    energy: r.energy ? { cls: r.energy.class, source: r.energy.source } : null, energyNeeded: hasEnergyLabel(r.category.name), dims: r._count.dimensions, dimStatus: r.dimStatus,
    updated: r.updatedAt.toISOString(), created: r.createdAt.toISOString(), synced: r.s1SyncedAt?.toISOString() ?? null, kot: kotView(r.competitorPrices[0]),
  }; });
  const query = { q, f, cat, sub, br, pmin, pmax, st, of, av, type, s: sRaw, d: dRaw, n: nRaw };
  // ενεργά φίλτρα ως chips (λέξεις, όχι μόνο χρώμα)· το ✕ κάθε chip αφαιρεί μόνο αυτό
  const label = (sel: string, v: string, opts: readonly (readonly [string, string])[]) => opts.find(([k]) => k === v)?.[1] ?? sel;
  const chips: { k: (keyof typeof query)[]; t: string }[] = [
    q && { k: ["q"], t: `«${q}»` },
    cat && { k: ["cat", "sub"], t: masters.find((m) => m.id === cat)?.name ?? "Κατηγορία" },
    sub && { k: ["sub"], t: subs.find((m) => m.id === sub)?.name ?? "Υποκατηγορία" },
    br && { k: ["br"], t: `Μάρκα: ${brands.find((b) => b.id === br)?.name ?? "—"}` },
    (lo != null || hi != null) && { k: ["pmin", "pmax"], t: `Τιμή ${lo != null ? `από ${lo} €` : ""}${lo != null && hi != null ? " " : ""}${hi != null ? `έως ${hi} €` : ""}` },
    st && { k: ["st"], t: st === "in" ? "Με απόθεμα" : "Χωρίς απόθεμα" },
    of && { k: ["of"], t: of === "yes" ? "Σε προσφορά" : of === "no" ? "Χωρίς προσφορά" : "Χωρίς τιμή" },
    av && { k: ["av"], t: label("Διαθεσιμότητα", av, AVAIL) },
    type && { k: ["type"], t: TYPES.find((t) => t.v === type)?.label ?? type },
    f && { k: ["f"], t: label("Φίλτρο", f, F_OPTS) },
  ].filter((x): x is { k: (keyof typeof query)[]; t: string } => !!x);
  const without = (ks: string[]) => { const u = new URLSearchParams(Object.entries(query).filter(([k, v]) => v && !ks.includes(k))); return `?${u}`; };
  const more = !!(br || pmin || pmax || st || of || av || f || type);
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

      <div className="grid gap-1.5">
        <form className="grid gap-1.5 min-w-0" data-help="catalog.filters">
          {nRaw && <input type="hidden" name="n" value={nRaw} />}
          <div className="flex flex-wrap gap-1.5">
            <label className="relative flex-[2_1_14rem] min-w-0"><span className="sr-only">Αναζήτηση</span><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-eu-muted" aria-hidden /><input id="cat-q" name="q" type="search" defaultValue={q} placeholder="Τίτλος, κωδικός, barcode, MTRL" className="rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9 text-[length:var(--fs-13)] w-full min-w-0 pl-8" /></label>
            <label className="sr-only" htmlFor="cat-c">Κατηγορία</label>
            <select id="cat-c" name="cat" defaultValue={cat} className="flex-[1_1_9rem] rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9 text-[length:var(--fs-13)] min-w-0"><option value="">Όλες οι κατηγορίες</option>{masters.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            {subs.length > 0 && <><label className="sr-only" htmlFor="cat-sub">Υποκατηγορία</label><select id="cat-sub" name="sub" defaultValue={sub} className="flex-[1_1_9rem] rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9 text-[length:var(--fs-13)] min-w-0"><option value="">Όλες οι υποκατηγορίες</option>{subs.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></>}
            <label className="sr-only" htmlFor="cat-o">Ταξινόμηση</label>
            <select id="cat-o" name="o" defaultValue={`${sort}:${dir}`} data-help="catalog.sort" className="flex-[1_1_11rem] rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9 text-[length:var(--fs-13)] min-w-0">{!SORT_OPTS.some(([v]) => v === `${sort}:${dir}`) && <option value={`${sort}:${dir}`}>Από τις κεφαλίδες</option>}{SORT_OPTS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
            <button className="rounded-full bg-eu-navy text-white px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] cursor-pointer hover:bg-eu-blue transition-colors">Εφαρμογή</button>
          </div>
          <details open={more} data-help="catalog.more-filters" className="group rounded-lg border border-eu-line bg-white">
            <summary className="flex items-center gap-1.5 px-2.5 min-h-11 md:min-h-9 cursor-pointer select-none font-bold text-eu-navy text-[length:var(--fs-13)] list-none [&::-webkit-details-marker]:hidden"><SlidersHorizontal className="size-4" aria-hidden />Περισσότερα φίλτρα<span className="hidden @2xl:inline font-normal text-eu-muted">μάρκα, τιμή, απόθεμα, προσφορά, διαθεσιμότητα, πληρότητα</span><ChevronDown className="ml-auto size-4 transition-transform group-open:rotate-180" aria-hidden /></summary>
            <div className="grid grid-cols-2 @xl:grid-cols-4 @5xl:grid-cols-8 gap-x-2 gap-y-1.5 px-2.5 pb-2.5">
              <label className="grid gap-0.5 min-w-0 text-eu-ink-2 font-semibold text-[length:var(--fs-12)] col-span-2 @xl:col-span-1 @5xl:col-span-2">Μάρκα<select name="br" defaultValue={br} className="rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9 text-[length:var(--fs-13)] w-full min-w-0 font-normal"><option value="">Όλες ({n(brands.length)})</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name} · {n(b._count.products)}</option>)}</select></label>
              <label className="grid gap-0.5 min-w-0 text-eu-ink-2 font-semibold text-[length:var(--fs-12)]">Τιμή από (€)<input name="pmin" type="number" inputMode="decimal" min={0} step="any" defaultValue={pmin} placeholder="0" className="rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9 text-[length:var(--fs-13)] w-full min-w-0 font-normal tabular-nums" /></label>
              <label className="grid gap-0.5 min-w-0 text-eu-ink-2 font-semibold text-[length:var(--fs-12)]">Τιμή έως (€)<input name="pmax" type="number" inputMode="decimal" min={0} step="any" defaultValue={pmax} placeholder="χωρίς όριο" className="rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9 text-[length:var(--fs-13)] w-full min-w-0 font-normal tabular-nums" /></label>
              <label className="grid gap-0.5 min-w-0 text-eu-ink-2 font-semibold text-[length:var(--fs-12)]">Απόθεμα<select name="st" defaultValue={st} className="rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9 text-[length:var(--fs-13)] w-full min-w-0 font-normal"><option value="">Όλα</option><option value="in">Με απόθεμα</option><option value="out">Χωρίς απόθεμα</option></select></label>
              <label className="grid gap-0.5 min-w-0 text-eu-ink-2 font-semibold text-[length:var(--fs-12)]">Προσφορά<select name="of" defaultValue={of} className="rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9 text-[length:var(--fs-13)] w-full min-w-0 font-normal"><option value="">Όλα</option><option value="yes">Σε προσφορά</option><option value="no">Χωρίς προσφορά</option><option value="noprice">Χωρίς τιμή</option></select></label>
              <label className="grid gap-0.5 min-w-0 text-eu-ink-2 font-semibold text-[length:var(--fs-12)]">Διαθεσιμότητα<select name="av" defaultValue={av} className="rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9 text-[length:var(--fs-13)] w-full min-w-0 font-normal"><option value="">Όλες</option>{AVAIL.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
              <label className="grid gap-0.5 min-w-0 text-eu-ink-2 font-semibold text-[length:var(--fs-12)]">Τύπος<select name="type" defaultValue={type} data-help="catalog.type" className="rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9 text-[length:var(--fs-13)] w-full min-w-0 font-normal">{TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}</select></label>
              <label className="grid gap-0.5 min-w-0 text-eu-ink-2 font-semibold text-[length:var(--fs-12)] col-span-2 @xl:col-span-1">Φωτογραφίες, πληρότητα, σετ<select name="f" defaultValue={f} className="rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9 text-[length:var(--fs-13)] w-full min-w-0 font-normal"><option value="">Όλα</option>{F_GROUPS.map(([g, opts]) => g ? <optgroup key={g} label={g}>{opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</optgroup> : opts.map(([v, t]) => <option key={v} value={v}>{t}</option>))}</select></label>
            </div>
          </details>
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[length:var(--fs-12)]" aria-label="Ενεργά φίλτρα">
              <span className="text-eu-ink-3 font-semibold">{n(total)} {total === 1 ? "προϊόν" : "προϊόντα"} με:</span>
              {chips.map((c) => <Link key={c.k.join()} href={without(c.k)} aria-label={`Αφαίρεση φίλτρου: ${c.t}`} className="inline-flex items-center gap-1 rounded-full bg-eu-chip text-eu-navy font-bold pl-2.5 pr-1.5 min-h-8 hover:bg-eu-navy hover:text-white transition-colors">{c.t}<X className="size-3.5" aria-hidden /></Link>)}
              <Link href={without(Object.keys(query).filter((k) => !["s", "d", "n"].includes(k)))} className="inline-flex items-center gap-1 rounded-full px-2 min-h-8 font-bold text-eu-ink-3 hover:text-eu-red"><RotateCcw className="size-3.5" aria-hidden />Καθαρισμός όλων</Link>
            </div>
          )}
        </form>
        <CatalogBulk rows={list} stickers={stickers} canWrite={canWrite} />
        {promoWrite && (
          <form id="bulk-promo" action="/admin/prosfores/new" method="get" className="flex flex-wrap items-center gap-1.5 rounded-lg bg-eu-chip px-2 py-1 justify-self-start max-w-full">
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
      <div className="hidden @3xl:block"><ProductTable rows={list} sort={sort} dir={dir} query={query} perPage={PAGE} total={total} from={(page - 1) * PAGE + 1} canPromo={promoWrite} canSelect can={rowCan} /></div>
      <div className="@3xl:hidden"><ProductCards rows={list} canPromo={promoWrite} canSelect can={rowCan} /></div>
      <div className="flex justify-center"><Pagination page={page} pages={pages} total={total} label="προϊόντα" href={href} /></div>
    </div>
  );
}
