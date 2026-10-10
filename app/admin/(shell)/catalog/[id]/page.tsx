import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Package, ExternalLink } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { listProductImages } from "@/lib/catalog/product-images";
import { ProductImages } from "@/components/admin/catalog/ProductImages";
import { ProductPromos } from "@/components/admin/promos/ProductPromos";
import { getProductsByIds } from "@/lib/data/repo";
import { arPlan, productDims } from "@/lib/ar/plan";
import { SoftoneRefresh } from "@/components/admin/catalog/SoftoneRefresh";
import { ProductEditor, type EditorValues } from "@/components/admin/catalog/ProductEditor";
import { itemWriteEnabled } from "@/lib/softone/item-write";
import { loadBannerStudio } from "@/lib/catalog/banner-studio-data";
import { BannerStudio } from "@/components/admin/banner-studio/BannerStudio";
import { ProductVideosAdmin } from "@/components/admin/catalog/ProductVideosAdmin";
import { productVideos, productStickers } from "../actions";
import { ProductStickersAdmin } from "@/components/admin/catalog/ProductStickersAdmin";
import { productReadiness, type TabId } from "@/lib/catalog/readiness";
import { ReadinessBar, WorkspaceTabs, WorkspaceSection as Section, isTab } from "@/components/admin/catalog/ProductWorkspace";
import { SiteCardPreview } from "@/components/admin/catalog/SiteCardPreview";
import { EnergyLabelPanel } from "@/components/admin/catalog/EnergyLabelPanel";
import { ArRow } from "@/app/admin/(shell)/ar/ArRow";
import { arRowDataFor } from "@/lib/ar/admin-row";
import { getArCategories } from "@/lib/ar/categories";
import { hasEnergyLabel } from "@/lib/catalog/energy-types";
import { fitMatters } from "@/lib/catalog/fit-types";
import { getSettings } from "@/lib/cms/settings-server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const p = await db.product.findUnique({ where: { id: (await params).id }, select: { title: true } });
  return { title: p?.title ?? "Προϊόν" };
}

/**
 * Χώρος εργασίας ενός προϊόντος: κεφαλίδα με την ετοιμότητα για το site (κάθε έλλειψη ανοίγει την καρτέλα που τη
 * διορθώνει), πέντε καρτέλες (`?tab=`) με τη σειρά της δουλειάς και η κάρτα όπως στο site. Αποδίδεται μόνο η ενεργή καρτέλα.
 */
export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePermission("catalog.products.read");
  const { id } = await params;
  const t = (await searchParams).tab;
  const tab: TabId = isTab(t) ? t : "media";
  const p = await db.product.findUnique({ where: { id }, select: { id: true, title: true, sku: true, ean: true, erpCode: true, slug: true, active: true, summary: true, source: true, s1SyncedAt: true, price: true, stock: true, brand: { select: { name: true } }, category: { select: { name: true, parent: { select: { name: true, parent: { select: { name: true } } } } } }, energy: { select: { class: true, scale: true, labelUrl: true, ficheUrl: true, source: true, eprelRegistrationNumber: true } }, _count: { select: { specs: true, facetValues: true } } } });
  if (!p) notFound();
  const mtrl = Number(p.erpCode);
  const fromS1 = p.source === "softone" && Number.isInteger(mtrl);
  const canWrite = can(user.permissions, "catalog.products.write");
  const canMedia = can(user.permissions, "cms.media.write");
  const [images, banners, studio, sectionCount, arRow, [shop], item, writeOn, descDim, videos, manualStickers, settings, arCats] = await Promise.all([
    listProductImages(p.id),
    tab === "content" ? listProductImages(p.id, "banner") : Promise.resolve([]),
    canWrite && tab === "content" ? loadBannerStudio(p.id) : Promise.resolve(null),
    tab === "content" ? db.productSection.count({ where: { productId: p.id, hidden: false } }) : Promise.resolve(0),
    db.productAr.findUnique({ where: { productId: p.id } }),
    getProductsByIds([p.id]),
    fromS1 ? db.s1Item.findUnique({ where: { mtrl } }) : Promise.resolve(null),
    itemWriteEnabled(),
    db.productDimension.findUnique({ where: { productId_source: { productId: id, source: "s1-desc" } } }),
    productVideos(id),
    tab === "commerce" ? productStickers(id).catch(() => []) : Promise.resolve([]),
    getSettings(),
    getArCategories(),
  ]);
  // «Όψη AR» μόνο όπου ο πελάτης βλέπει το στερεό από φωτογραφία (όχι με δικό μας 3D μοντέλο ή χωρίς AR)
  const arPl = shop ? arPlan(shop, arRow, arCats) : null;
  const arFront = arPl?.on && !arPl.custom && arPl.archetype !== "tv" ? { front: arRow?.frontImage ?? null } : undefined;
  const bannersShown = banners.filter((b) => !b.hidden).length, bannersHidden = banners.length - bannersShown;
  const pathNames = [p.category.parent?.parent?.name, p.category.parent?.name, p.category.name].filter((x): x is string => !!x);
  const path = pathNames.join(" › ");
  const canErp = canWrite && can(user.permissions, "catalog.sync.run");
  const shown = images.filter((i) => !i.hidden && i.source !== "eprel-label"); // η ετικέτα EPREL δεν μετρά ως φωτογραφία
  const when = (d: Date | null | undefined) => d ? d.toLocaleString("el-GR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
  const eur = (v: number | null | undefined) => v != null ? `${v.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : "—";
  const initial: EditorValues | null = item ? {
    name: item.name, barcode: item.barcode, factoryCode: item.factoryCode, active: item.active ? 1 : 0, shortDesc: item.shortDesc, longDesc: item.longDesc,
    availText: item.availText, extWarranty: item.extWarranty ? 1 : 0, guaranteeMonths: item.guaranteeMonths, weightKg: item.weightKg, lengthCm: item.lengthCm, widthCm: item.widthCm, heightCm: item.heightCm,
  } : null;
  const readonlyReason = !canErp ? "Μόνο ανάγνωση: χρειάζονται τα δικαιώματα «Επεξεργασία προϊόντων» και «Εκτέλεση συγχρονισμού ERP»." : !writeOn ? "Μόνο ανάγνωση: η εγγραφή στο SoftOne είναι κλειστή (Ρυθμίσεις → SoftOne → Αλλαγές προϊόντων προς SoftOne)." : undefined;

  const arApplies = !!arPl && arPl.code !== "none" && arPl.code !== "cat-off";
  const energyNeeded = hasEnergyLabel(p.category.name);
  const r = productReadiness({
    photos: shown.length,
    mainLowRes: shown[0] ? (shown[0].width != null ? shown[0].lowRes : null) : null,
    description: !!(item?.longDesc?.trim() || item?.shortDesc?.trim() || p.summary?.trim()),
    specs: p._count.specs,
    dims: { needed: arApplies || fitMatters(pathNames), present: !!(shop && productDims(shop)) },
    energy: { needed: energyNeeded, present: !!p.energy },
    ar: { applies: arApplies, on: !!arPl?.on, reason: arPl?.reason ?? null },
    price: p.price,
  });
  const href = (to: TabId) => `/admin/catalog/${p.id}?tab=${to}`;

  const editor = (only: Parameters<typeof ProductEditor>[0]["only"]) => fromS1 && initial ? (
    <ProductEditor key={item?.syncedAt?.toISOString()} only={only} productId={p.id} initial={initial} readonly={!!readonlyReason} readonlyReason={readonlyReason} descDims={descDim ? { w: descDim.w, h: descDim.h, d: descDim.d, line: `${descDim.rawKey ?? "Διαστάσεις"}: ${descDim.rawValue ?? ""}`.slice(0, 120), note: descDim.warning } : null} meta={{ code: p.sku, mtrl: p.erpCode, brand: p.brand.name, category: path }} />
  ) : (
    <p className="m-0 rounded-xl bg-eu-surface px-3 py-2 text-eu-ink-3 text-[length:var(--fs-14)]">Το προϊόν δεν προέρχεται από το SoftOne — τα στοιχεία του δεν επεξεργάζονται από εδώ.</p>
  );

  return (
    <div className="@container grid gap-3 min-w-0">
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

      <div className="grid gap-3 @5xl:grid-cols-[minmax(0,1fr)_17rem] @5xl:items-start">
        <div className="grid gap-3 min-w-0">
          <ReadinessBar r={r} href={href} />
          <WorkspaceTabs active={tab} states={r.tabs} href={href} />

          {tab === "media" && (<>
            <Section title={`Φωτογραφίες (${shown.length})`} hint="Προτείνονται 4+ φωτογραφίες, τουλάχιστον 600 px.">
              <ProductImages productId={p.id} initial={images} canWrite={canWrite} canUploadToLibrary={canMedia} ar={arFront} embedded />
            </Section>
            <Section title={`Βίντεο (${videos.filter((v) => !v.hidden).length})`}>
              <ProductVideosAdmin productId={p.id} initial={videos} canWrite={canWrite} />
            </Section>
          </>)}

          {tab === "content" && (<>
            {editor(["texts", "specs"])}
            <Section title="Banners κατασκευαστή & απόδελτίωση" hint={`${bannersShown} ${bannersShown === 1 ? "banner" : "banners"} ως εικόνα${bannersHidden ? ` · ${bannersHidden} κρυμμένα` : ""} · ${sectionCount} ${sectionCount === 1 ? "ενότητα κειμένου" : "ενότητες κειμένου"} στη σελίδα.`}>
              <ProductImages kind="banner" productId={p.id} initial={banners} canWrite={canWrite} canUploadToLibrary={canMedia} embedded />
              {studio && (
                <div className="grid gap-3 border-t border-eu-line pt-4">
                  <div>
                    <h4 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-15)]">Απόδελτίωση: banner → κείμενο της σελίδας</h4>
                    <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Ο βοηθός διαβάζει το κείμενο των banners, ξεχωρίζει τις φωτογραφίες και φτιάχνει ενότητες της σελίδας του προϊόντος· ελέγχεις πριν δημοσιευτούν.</p>
                  </div>
                  <BannerStudio key={studio.banners.map((b) => b.id).join()} {...studio} embedded />
                </div>
              )}
            </Section>
          </>)}

          {tab === "dims" && (<>
            {editor(["dims"])}
            {shop && arApplies && (
              <Section title="Δες το στον χώρο σου (AR)" hint="Το στερεό φτιάχνεται από τις διαστάσεις· η «Όψη AR» (καρτέλα Εικόνες) ντύνει την πρόσοψή του.">
                <ArRow row={arRowDataFor(shop, arRow, arCats)} open />
              </Section>
            )}
            <EnergyLabelPanel productId={p.id} needed={energyNeeded} canWrite={canWrite} label={p.energy ? { cls: p.energy.class, scale: p.energy.scale, labelUrl: p.energy.labelUrl, ficheUrl: p.energy.ficheUrl, source: p.energy.source, registrationNumber: p.energy.eprelRegistrationNumber } : null} />
          </>)}

          {tab === "commerce" && (<>
            <Section title="Τιμή & απόθεμα" hint="Η τιμή (MTREXTRA.NUM04) και το απόθεμα έρχονται από το SoftOne — αλλάζουν εκεί.">
              <dl className="m-0 grid gap-x-6 gap-y-2 [grid-template-columns:repeat(auto-fill,minmax(12rem,1fr))] text-[length:var(--fs-14)]">
                <div><dt className="text-eu-muted text-[length:var(--fs-13)]">Τιμή eshop (με ΦΠΑ)</dt><dd className="m-0 font-bold text-eu-ink">{eur(p.price)}</dd></div>
                <div><dt className="text-eu-muted text-[length:var(--fs-13)]">Κεντρική αποθήκη</dt><dd className="m-0 font-bold text-eu-ink">{p.stock > 0 ? `${p.stock} τεμ. — άμεσα διαθέσιμο` : "0 — κατόπιν παραγγελίας"}</dd></div>
              </dl>
            </Section>
            {can(user.permissions, "catalog.promos.write") && (
              <Section title="Προσφορές" hint="Τιμή στη βιτρίνα και προσφορές που αφορούν το προϊόν.">
                <ProductPromos productId={p.id} canWrite embedded />
              </Section>
            )}
            <Section title="Stickers στην κάρτα">
              <ProductStickersAdmin productId={p.id} initial={manualStickers} auto={(shop?.stickers ?? []).filter((s) => s.source !== "manual")} canWrite={canWrite} />
            </Section>
          </>)}

          {tab === "erp" && (<>
            {editor(["basics", "warranty"])}
            {fromS1 && (
              <Section title="Συγχρονισμός με SoftOne" hint={`Τελευταία ανάγνωση: ${when(item?.syncedAt ?? p.s1SyncedAt)}${writeOn ? " · εγγραφή ανοιχτή" : " · μόνο ανάγνωση"}.`}>
                <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Ο προγραμματισμένος συγχρονισμός διαβάζει όλο τον κατάλογο· με το κουμπί διαβάζεται τώρα μόνο αυτό το είδος (MTRL {p.erpCode}){item?.s1UpdatedAt ? ` — τελευταία αλλαγή στο SoftOne: ${when(item.s1UpdatedAt)}` : ""}.</p>
                {canWrite && <SoftoneRefresh productId={p.id} />}
              </Section>
            )}
          </>)}
        </div>

        {shop && (
          <aside className="@5xl:sticky @5xl:top-4 min-w-0">
            <SiteCardPreview product={shop} settings={settings} />
          </aside>
        )}
      </div>
    </div>
  );
}
