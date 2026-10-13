import Link from "next/link";
import type { Product } from "@/lib/data/types";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ProductActions } from "@/components/admin/catalog/ProductActions";
import { PromoPicker } from "@/components/admin/catalog/QuickActions";
import { ProductSources, type SourcesData } from "@/components/admin/catalog/ProductSources";
import { warrantyFromSpecs } from "@/lib/warranty/policy";
import { productOverview } from "@/lib/catalog/product-overview";
import { ProductOverview } from "@/components/admin/catalog/ProductOverview";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { listProductImages } from "@/lib/catalog/product-images";
import { ProductImages } from "@/components/admin/catalog/ProductImages";
import { ProductPromos } from "@/components/admin/promos/ProductPromos";
import { getProductBySlug, getProductsByIds } from "@/lib/data/repo";
import { arPlan, productDims } from "@/lib/ar/plan";
import { SoftoneRefresh } from "@/components/admin/catalog/SoftoneRefresh";
import { ProductEditor, type EditorValues } from "@/components/admin/catalog/ProductEditor";
import { itemWriteEnabled } from "@/lib/softone/item-write";
import { loadBannerStudio } from "@/lib/catalog/banner-studio-data";
import { BannerStudio } from "@/components/admin/banner-studio/BannerStudio";
import { ProductVideosAdmin } from "@/components/admin/catalog/ProductVideosAdmin";
import { productVideos, productStickers } from "../actions";
import { ProductStickersAdmin } from "@/components/admin/catalog/ProductStickersAdmin";
import { productReadiness } from "@/lib/catalog/readiness";
import { ReadinessBar, WorkspaceTabs, WorkspaceSection as Section, isTab, type WorkspaceTab } from "@/components/admin/catalog/ProductWorkspace";
import { setForProduct } from "@/lib/catalog/sets";
import { SetMemberLabel } from "@/components/admin/catalog/SetMemberLabel";
import { SiteCardPreview } from "@/components/admin/catalog/SiteCardPreview";
import { SpecSources } from "@/components/admin/catalog/SpecSources";
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
  const tab: WorkspaceTab = isTab(t) ? t : "overview";
  const p = await db.product.findUnique({ where: { id }, select: { id: true, title: true, sku: true, ean: true, erpCode: true, slug: true, active: true, summary: true, source: true, s1SyncedAt: true, price: true, stock: true, brand: { select: { name: true } }, category: { select: { name: true, parent: { select: { name: true, parent: { select: { name: true } } } } } }, energy: { select: { class: true, scale: true, labelUrl: true, ficheUrl: true, source: true, eprelRegistrationNumber: true } }, _count: { select: { specs: true, facetValues: true } } } });
  if (!p) notFound();
  const mtrl = Number(p.erpCode);
  const fromS1 = p.source === "softone" && Number.isInteger(mtrl);
  const canWrite = can(user.permissions, "catalog.products.write");
  const canMedia = can(user.permissions, "cms.media.write");
  // ένας γύρος για όλα (πριν ήταν δύο διαδοχικοί — η επισκόπηση δεν εξαρτάται από τα υπόλοιπα)
  const [images, banners, studio, sectionCount, arRow, [shop], item, writeOn, descDim, videos, manualStickers, settings, arCats, specRows, set, overview, specSrc, dimRows, warrantySpecs] = await Promise.all([
    listProductImages(p.id),
    tab === "content" ? listProductImages(p.id, "banner") : Promise.resolve([]),
    canWrite && tab === "content" ? loadBannerStudio(p.id) : Promise.resolve(null),
    tab === "content" ? db.productSection.count({ where: { productId: p.id, hidden: false } }) : Promise.resolve(0),
    db.productAr.findUnique({ where: { productId: p.id } }),
    // το προϊόν όπως το βλέπει ο πελάτης (για την απόφαση AR) — από τη μνήμη του καταλόγου
    // (ανενεργό / χωρίς φωτογραφία δεν είναι στη μνήμη του site → απευθείας, όπως πριν)
    getProductBySlug(p.slug).then((x): Promise<Product[]> | Product[] => (x ? [x] : getProductsByIds([p.id]))),
    fromS1 ? db.s1Item.findUnique({ where: { mtrl } }) : Promise.resolve(null),
    itemWriteEnabled(),
    db.productDimension.findMany({ where: { productId: id }, orderBy: { source: "asc" } }),
    productVideos(id),
    productStickers(id).catch(() => []),
    getSettings(),
    getArCategories(),
    tab === "content" ? db.spec.findMany({ where: { productId: id }, orderBy: [{ sortNo: "asc" }, { id: "asc" }], select: { id: true, groupName: true, key: true, value: true, source: true } }) : Promise.resolve([]),
    setForProduct(p.erpCode).catch(() => null),
    tab === "overview" ? productOverview(p.id) : null,
    tab === "overview" ? db.spec.groupBy({ by: ["source"], where: { productId: id }, _count: true }) : [],
    tab === "overview" ? db.productDimension.findMany({ where: { productId: id }, select: { source: true, w: true, h: true, d: true, kind: true, warning: true } }) : [],
    tab === "overview" ? db.spec.findMany({ where: { productId: id, key: { contains: "γγ", mode: "insensitive" } }, select: { key: true, value: true, source: true } }) : [],
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
  const ws = warrantyFromSpecs(warrantySpecs);
  const wsRow = ws ? warrantySpecs.find((x) => x.value.trim() === ws.text) ?? warrantySpecs[0] : null;
  const sources: SourcesData = {
    specs: specSrc.map((x) => ({ source: x.source, n: x._count })),
    energy: p.energy ? { cls: p.energy.class, source: p.energy.source, eprel: p.energy.eprelRegistrationNumber } : null,
    energyNeeded: hasEnergyLabel(p.category.name),
    dims: dimRows,
    warranty: item?.guaranteeMonths ? { months: item.guaranteeMonths, from: "softone", text: null, source: "s1-desc" } : ws ? { months: ws.months, from: "specs", text: ws.text, source: wsRow?.source ?? null } : { months: 24, from: "default", text: null, source: null },
    canFix: { texts: !!(fromS1 && initial), dims: !!(fromS1 && initial), warranty: !!(fromS1 && initial), energy: canWrite },
  };
  const href = (to: WorkspaceTab) => `/admin/catalog/${p.id}?tab=${to}`;

  const editor = (only: Parameters<typeof ProductEditor>[0]["only"]) => fromS1 && initial ? (
    <ProductEditor key={item?.syncedAt?.toISOString()} only={only} productId={p.id} initial={initial} readonly={!!readonlyReason} readonlyReason={readonlyReason} dimCandidates={descDim.map((x) => ({ source: x.source, w: x.w, h: x.h, d: x.d, kind: x.kind, line: `${x.rawKey ?? "Διαστάσεις"}: ${x.rawValue ?? ""}`.slice(0, 120), note: x.warning }))} meta={{ code: p.sku, mtrl: p.erpCode, brand: p.brand.name, category: path }} />
  ) : (
    <p className="m-0 rounded-xl bg-eu-surface px-3 py-2 text-eu-ink-3 text-[length:var(--fs-14)]">Το προϊόν δεν προέρχεται από το SoftOne — τα στοιχεία του δεν επεξεργάζονται από εδώ.</p>
  );

  return (
    <div className="@container grid gap-2.5 min-w-0">
      <header className="grid gap-1 min-w-0">
        <nav aria-label="Διαδρομή" className="flex flex-wrap items-center gap-x-1.5 text-[length:var(--fs-12)] text-eu-muted">
          <Link href="/admin/catalog" className="inline-flex items-center gap-1 min-h-11 md:min-h-7 font-bold text-eu-blue hover:underline"><ArrowLeft className="size-3.5" aria-hidden /> Προϊόντα</Link>
          {pathNames.map((n) => <span key={n} className="inline-flex items-center gap-1.5"><span aria-hidden>/</span>{n}</span>)}
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="grid gap-1 min-w-0 flex-1 basis-[22rem]">
            <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)] leading-tight text-balance">{p.title}</h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[length:var(--fs-12)]">
              <span className={`rounded-full px-2 py-0.5 font-bold ${p.active ? "bg-eu-green/12 text-eu-green" : "bg-eu-surface text-eu-muted"}`}>{p.active ? "Ενεργό στο site" : "Ανενεργό"}</span>
              {set && <Link href={href("set")} className="rounded-full px-2 py-0.5 font-bold bg-eu-navy text-white hover:bg-eu-blue">Set · {set.members.length} είδη</Link>}
              <span className="text-eu-ink-3">{p.brand?.name}</span>
              <span className="text-eu-muted font-mono">{p.sku}{p.ean ? ` · ${p.ean}` : ""}</span>
            </div>
          </div>
          <div data-help="product.actions" className="shrink-0">
            <ProductActions productId={p.id} title={p.title} siteHref={p.active ? `/proion/${p.slug}` : null} canPromo={can(user.permissions, "catalog.promos.write")} canSoftone={fromS1 && canWrite}
              codes={[{ label: "κωδικού", value: p.sku }, ...(p.ean ? [{ label: "EAN", value: p.ean }] : []), ...(p.erpCode ? [{ label: "MTRL", value: p.erpCode }] : [])]}
              modals={{
                ...(can(user.permissions, "catalog.promos.write") ? { promo: <div className="@container"><PromoPicker productId={p.id} /></div> } : {}),
                texts: editor(["texts", "specs"]),
                dims: editor(["dims"]),
                warranty: editor(["basics", "warranty"]),
                energy: <EnergyLabelPanel productId={p.id} needed={energyNeeded} canWrite={canWrite} label={p.energy ? { cls: p.energy.class, scale: p.energy.scale, labelUrl: p.energy.labelUrl, ficheUrl: p.energy.ficheUrl, source: p.energy.source, registrationNumber: p.energy.eprelRegistrationNumber } : null} />,
                stickers: <ProductStickersAdmin productId={p.id} initial={manualStickers} auto={(shop?.stickers ?? []).filter((s) => s.source !== "manual")} canWrite={canWrite} />,
              }} />
          </div>
        </div>
      </header>

      <div className="grid gap-2.5 @5xl:grid-cols-[minmax(0,1fr)_15rem] @5xl:items-start">
        <div className="grid gap-2.5 min-w-0">
          <ReadinessBar r={r} href={href} />
          <WorkspaceTabs active={tab} states={r.tabs} href={href} hide={set ? [] : ["set"]} />

          {tab === "overview" && overview && <ProductOverview o={overview} price={p.price} stock={p.stock} />}
          {tab === "overview" && <ProductSources d={sources} />}

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
            <Section title={`Χαρακτηριστικά στο site (${specRows.length})`} hint="Όλα όσα βλέπει ο πελάτης, με την πηγή του καθενός: EPREL (ενεργειακή ετικέτα), ERP (περιγραφή SoftOne), Icecat ή web.">
              <SpecSources specs={specRows} eprel={p.energy?.eprelRegistrationNumber ?? null} />
            </Section>
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
            <div className="grid gap-2.5 @4xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start">
              <div className="grid gap-2.5 min-w-0">{editor(["dims"])}</div>
              <EnergyLabelPanel productId={p.id} needed={energyNeeded} canWrite={canWrite} label={p.energy ? { cls: p.energy.class, scale: p.energy.scale, labelUrl: p.energy.labelUrl, ficheUrl: p.energy.ficheUrl, source: p.energy.source, registrationNumber: p.energy.eprelRegistrationNumber } : null} />
            </div>
            {shop && arApplies && (
              <Section title="Δες το στον χώρο σου (AR)" hint="Το στερεό φτιάχνεται από τις διαστάσεις. Η «Όψη AR» (καρτέλα Εικόνες) ντύνει την πρόσοψή του.">
                <ArRow row={arRowDataFor(shop, arRow, arCats)} />
              </Section>
            )}
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

          {tab === "set" && set && (
            <Section title={`Set: ${set.name}`} hint={`Πουλιέται μαζί με ${set.members.length - 1 === 1 ? "ένα ακόμη είδος" : `${set.members.length - 1} ακόμη είδη`} (SoftOne «Set ειδών» ${set.code}). Διαθέσιμο όσο φτάνουν όλα τα μέλη.`}>
              <p className={`m-0 font-bold text-[length:var(--fs-15)] ${set.available > 0 ? "text-eu-green" : "text-eu-ink-3"}`}>{set.available > 0 ? `${set.available} διαθέσιμα sets` : "Κάποιο μέλος δεν έχει απόθεμα — ο πελάτης βλέπει «κατόπιν παραγγελίας»."}</p>
              <ul className="m-0 p-0 list-none grid gap-2">
                {set.members.map((m) => (
                  <li key={m.lineNum} className="grid gap-2 rounded-xl border border-eu-line p-3 @3xl:grid-cols-[minmax(0,1fr)_7rem_minmax(0,18rem)] @3xl:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5"><span className={`rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-12)] ${m.isMain ? "bg-eu-navy text-white" : "bg-eu-surface text-eu-ink-3"}`}>{m.isMain ? "Κύριο" : "Μέλος"}</span><span className="font-bold text-eu-ink break-words">{m.name}</span></div>
                      <div className="text-eu-muted text-[length:var(--fs-13)]">{m.code ? `κωδικός ${m.code} · ` : ""}MTRL {m.mtrl}{m.qty !== 1 ? ` · × ${m.qty}` : ""}</div>
                    </div>
                    <div className={`tabular-nums font-bold text-[length:var(--fs-14)] ${m.stock >= (m.qty || 1) ? "text-eu-green" : "text-eu-red"}`}>{m.stock >= (m.qty || 1) ? `${m.stock} τεμ.` : "Χωρίς απόθεμα"}</div>
                    <label className="grid gap-1 text-[length:var(--fs-12)] font-bold text-eu-ink-3 min-w-0">Όνομα στο «Περιλαμβάνει»{m.suggested && !m.label ? " · αυτόματη πρόταση" : ""}
                      <SetMemberLabel spcs={set.spcs} lineNum={m.lineNum} initial={m.label} placeholder={m.suggested ?? m.name} canWrite={canWrite} />
                    </label>
                  </li>
                ))}
              </ul>
              <Link href={`/admin/catalog/sets?q=${encodeURIComponent(set.code)}`} className="justify-self-start font-bold text-eu-blue hover:underline text-[length:var(--fs-14)] min-h-11 inline-flex items-center">Όλα τα sets →</Link>
            </Section>
          )}

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
