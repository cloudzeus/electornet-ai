import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Package, ScanText, BadgePercent, Images, Euro, Database, ExternalLink, Clapperboard } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { listProductImages } from "@/lib/catalog/product-images";
import { ProductImages } from "@/components/admin/catalog/ProductImages";
import { ProductPromos } from "@/components/admin/promos/ProductPromos";
import { getProductsByIds } from "@/lib/data/repo";
import { arPlan } from "@/lib/ar/plan";
import { SoftoneRefresh } from "@/components/admin/catalog/SoftoneRefresh";
import { ProductEditor, type EditorValues } from "@/components/admin/catalog/ProductEditor";
import { AccordionItem } from "@/components/admin/ui/Accordion";
import { itemWriteEnabled } from "@/lib/softone/item-write";
import { loadBannerStudio } from "@/lib/catalog/banner-studio-data";
import { BannerStudio } from "@/components/admin/banner-studio/BannerStudio";
import { ProductVideosAdmin } from "@/components/admin/catalog/ProductVideosAdmin";
import { productVideos } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const p = await db.product.findUnique({ where: { id: (await params).id }, select: { title: true } });
  return { title: p?.title ?? "Προϊόν" };
}

/**
 * Καρτέλα προϊόντος, σε ενότητες που ανοιγοκλείνουν: προσφορές, φωτογραφίες, τα στοιχεία του είδους (γράφονται στο SoftOne
 * και στο e-shop μαζί), τιμή & απόθεμα (από το SoftOne), banners και ο συγχρονισμός.
 */
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("catalog.products.read");
  const { id } = await params;
  const p = await db.product.findUnique({ where: { id }, select: { id: true, title: true, sku: true, ean: true, erpCode: true, slug: true, active: true, summary: true, source: true, s1SyncedAt: true, price: true, stock: true, brand: { select: { name: true } }, category: { select: { name: true, parent: { select: { name: true, parent: { select: { name: true } } } } } }, energy: { select: { class: true } }, _count: { select: { specs: true, facetValues: true } } } });
  if (!p) notFound();
  const mtrl = Number(p.erpCode);
  const fromS1 = p.source === "softone" && Number.isInteger(mtrl);
  const canWrite = can(user.permissions, "catalog.products.write");
  const [images, banners, studio, sectionCount, arRow, [shop], item, writeOn, descDim, videos] = await Promise.all([
    listProductImages(p.id),
    listProductImages(p.id, "banner"),
    canWrite ? loadBannerStudio(p.id) : Promise.resolve(null),
    db.productSection.count({ where: { productId: p.id, hidden: false } }),
    db.productAr.findUnique({ where: { productId: p.id }, select: { enabled: true, glbUrl: true, placement: true, frontImage: true } }),
    getProductsByIds([p.id]),
    fromS1 ? db.s1Item.findUnique({ where: { mtrl } }) : Promise.resolve(null),
    itemWriteEnabled(),
    db.productDimension.findUnique({ where: { productId_source: { productId: id, source: "s1-desc" } } }),
    productVideos(id),
  ]);
  // «Όψη AR» μόνο όπου ο πελάτης βλέπει το στερεό από φωτογραφία (όχι με δικό μας 3D μοντέλο ή χωρίς AR)
  const arPl = shop ? arPlan(shop, arRow) : null;
  const arFront = arPl?.on && !arPl.custom && arPl.archetype !== "tv" ? { front: arRow?.frontImage ?? null } : undefined;
  const bannersShown = banners.filter((b) => !b.hidden).length, bannersHidden = banners.length - bannersShown;
  const path = [p.category.parent?.parent?.name, p.category.parent?.name, p.category.name].filter(Boolean).join(" › ");
  const canErp = canWrite && can(user.permissions, "catalog.sync.run");
  const visibleImages = images.filter((i) => !i.hidden).length;
  const when = (d: Date | null | undefined) => d ? d.toLocaleString("el-GR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
  const eur = (v: number | null | undefined) => v != null ? `${v.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : "—";
  const initial: EditorValues | null = item ? {
    name: item.name, barcode: item.barcode, factoryCode: item.factoryCode, active: item.active ? 1 : 0, shortDesc: item.shortDesc, longDesc: item.longDesc,
    availText: item.availText, extWarranty: item.extWarranty ? 1 : 0, guaranteeMonths: item.guaranteeMonths, weightKg: item.weightKg, lengthCm: item.lengthCm, widthCm: item.widthCm, heightCm: item.heightCm,
  } : null;
  const readonlyReason = !canErp ? "Μόνο ανάγνωση: χρειάζονται τα δικαιώματα «Επεξεργασία προϊόντων» και «Εκτέλεση συγχρονισμού ERP»." : !writeOn ? "Μόνο ανάγνωση: η εγγραφή στο SoftOne είναι κλειστή (Ρυθμίσεις → SoftOne → Αλλαγές προϊόντων προς SoftOne)." : undefined;
  const chip = (t: string) => <span className="rounded-full bg-eu-surface text-eu-ink-3 font-bold px-2 py-0.5 text-[length:var(--fs-12)] tabular-nums">{t}</span>;

  return (
    <div className="grid gap-3 min-w-0">
      <div className="grid gap-1">
        <Link href="/admin/catalog" className="inline-flex items-center gap-1.5 min-h-11 font-bold text-eu-blue text-[length:var(--fs-14)] hover:underline justify-self-start"><ArrowLeft className="size-4" aria-hidden /> Όλα τα προϊόντα</Link>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><Package className="size-3.5" aria-hidden /> {path}</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)] text-balance">{p.title}</h2>
        <div className="flex flex-wrap items-center gap-2 text-[length:var(--fs-13)]">
          <span className={`rounded-full px-2 py-0.5 font-bold ${p.active ? "bg-eu-green/12 text-eu-green" : "bg-eu-surface text-eu-muted"}`}>{p.active ? "Ενεργό στο site" : "Ανενεργό"}</span>
          <span className="text-eu-muted">κωδικός {p.sku}{p.ean ? ` · EAN ${p.ean}` : ""}</span>
          {p.active && <a href={`/proion/${p.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-eu-blue hover:underline min-h-9"><ExternalLink className="size-3.5" aria-hidden /> Στο site</a>}
        </div>
      </div>

      {can(user.permissions, "catalog.promos.write") && (
        <AccordionItem id="promos" title="Προσφορές" icon={<BadgePercent className="size-4" aria-hidden />} summary="Τιμή στη βιτρίνα και προσφορές που αφορούν το προϊόν">
          <ProductPromos productId={p.id} canWrite embedded />
        </AccordionItem>
      )}

      <AccordionItem id="photos" title="Φωτογραφίες" icon={<Images className="size-4" aria-hidden />} summary={visibleImages ? "Η πρώτη είναι η κύρια· η «Όψη AR» γεμίζει την πρόσοψη του στερεού" : "Χωρίς φωτογραφία — δεν εμφανίζεται σωστά στο κατάστημα"} badge={chip(`${visibleImages}`)} defaultOpen>
        <ProductImages productId={p.id} initial={images} canWrite={canWrite} canUploadToLibrary={can(user.permissions, "cms.media.write")} ar={arFront} embedded />
      </AccordionItem>

      <AccordionItem id="videos" title="Βίντεο" icon={<Clapperboard className="size-4" aria-hidden />} summary={videos.filter((v) => !v.hidden).length ? "Στη σελίδα του προϊόντος, ενότητα «Βίντεο»" : "Κανένα βίντεο — πρόσθεσε σύνδεσμο YouTube, Vimeo ή .mp4"} badge={chip(`${videos.filter((v) => !v.hidden).length}`)}>
        <ProductVideosAdmin productId={p.id} initial={videos} canWrite={canWrite} />
      </AccordionItem>

      {fromS1 && initial ? (
        <ProductEditor key={item?.syncedAt?.toISOString()} productId={p.id} initial={initial} readonly={!!readonlyReason} readonlyReason={readonlyReason} descDims={descDim ? { w: descDim.w, h: descDim.h, d: descDim.d, line: `${descDim.rawKey ?? "Διαστάσεις"}: ${descDim.rawValue ?? ""}`.slice(0, 120), note: descDim.warning } : null} meta={{ code: p.sku, mtrl: p.erpCode, brand: p.brand.name, category: path }} />
      ) : (
        <p className="m-0 rounded-xl bg-eu-surface px-3 py-2 text-eu-ink-3 text-[length:var(--fs-14)]">Το προϊόν δεν προέρχεται από το SoftOne — τα στοιχεία του δεν επεξεργάζονται από εδώ.</p>
      )}

      <AccordionItem id="price" title="Τιμή & απόθεμα" icon={<Euro className="size-4" aria-hidden />} summary={`${eur(p.price)} · ${p.stock > 0 ? `${p.stock} τεμ. στην κεντρική` : "κατόπιν παραγγελίας"}`}>
        <dl className="m-0 grid gap-x-6 gap-y-2 [grid-template-columns:repeat(auto-fill,minmax(12rem,1fr))] text-[length:var(--fs-14)]">
          <div><dt className="text-eu-muted text-[length:var(--fs-13)]">Τιμή eshop (με ΦΠΑ)</dt><dd className="m-0 font-bold text-eu-ink">{eur(p.price)}</dd></div>
          <div><dt className="text-eu-muted text-[length:var(--fs-13)]">Κεντρική αποθήκη</dt><dd className="m-0 font-bold text-eu-ink">{p.stock > 0 ? `${p.stock} τεμ. — άμεσα διαθέσιμο` : "0 — κατόπιν παραγγελίας"}</dd></div>
          <div><dt className="text-eu-muted text-[length:var(--fs-13)]">Ενεργειακή κλάση</dt><dd className="m-0 font-bold text-eu-ink">{p.energy?.class ?? "—"}</dd></div>
          <div><dt className="text-eu-muted text-[length:var(--fs-13)]">Χαρακτηριστικά / φίλτρα</dt><dd className="m-0 font-bold text-eu-ink">{p._count.specs} · {p._count.facetValues} τιμές φίλτρων</dd></div>
        </dl>
        <p className="m-0 mt-2 text-eu-muted text-[length:var(--fs-12)]">Η τιμή (MTREXTRA.NUM04) και το απόθεμα έρχονται από το SoftOne — αλλάζουν εκεί.</p>
      </AccordionItem>

      <AccordionItem id="banners" title="Banners κατασκευαστή & απόδελτίωση" icon={<ScanText className="size-4" aria-hidden />} summary={`${bannersShown} ${bannersShown === 1 ? "banner" : "banners"} ως εικόνα${bannersHidden ? ` · ${bannersHidden} κρυμμένα` : ""} · ${sectionCount} ${sectionCount === 1 ? "ενότητα κειμένου" : "ενότητες κειμένου"} στη σελίδα`} badge={chip(`${bannersShown}`)}>
        <div className="grid gap-5">
          <ProductImages kind="banner" productId={p.id} initial={banners} canWrite={canWrite} canUploadToLibrary={can(user.permissions, "cms.media.write")} embedded />
          {studio && (
            <div className="grid gap-3 border-t border-eu-line pt-4">
              <div>
                <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Απόδελτίωση: banner → κείμενο της σελίδας</h3>
                <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Ο βοηθός διαβάζει το κείμενο των banners, ξεχωρίζει τις φωτογραφίες και φτιάχνει ενότητες της σελίδας του προϊόντος· ελέγχεις πριν δημοσιευτούν.</p>
              </div>
              <BannerStudio key={studio.banners.map((b) => b.id).join()} {...studio} embedded />
            </div>
          )}
        </div>
      </AccordionItem>

      {fromS1 && (
        <AccordionItem id="sync" title="Συγχρονισμός με SoftOne" icon={<Database className="size-4" aria-hidden />} summary={`Τελευταία ανάγνωση: ${when(item?.syncedAt ?? p.s1SyncedAt)}${writeOn ? " · εγγραφή ανοιχτή" : " · μόνο ανάγνωση"}`} defaultOpen>
          <div className="grid gap-2">
            <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Ο προγραμματισμένος συγχρονισμός διαβάζει όλο τον κατάλογο· με το κουμπί διαβάζεται τώρα μόνο αυτό το είδος (MTRL {p.erpCode}){item?.s1UpdatedAt ? ` — τελευταία αλλαγή στο SoftOne: ${when(item.s1UpdatedAt)}` : ""}.</p>
            {canWrite && <SoftoneRefresh productId={p.id} />}
          </div>
        </AccordionItem>
      )}
    </div>
  );
}
