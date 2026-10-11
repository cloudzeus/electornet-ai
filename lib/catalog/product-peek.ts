import "server-only";
import { db } from "@/lib/db";
import { productOverview } from "@/lib/catalog/product-overview";
import { productReadiness } from "@/lib/catalog/readiness";
import { LOW_RES_PX } from "@/lib/catalog/product-images";
import { hasEnergyLabel } from "@/lib/catalog/energy-types";
import { fitMatters } from "@/lib/catalog/fit-types";
import { warrantyFromSpecs } from "@/lib/warranty/policy";

/**
 * Η γρήγορη εικόνα ενός προϊόντος για το άνοιγμα γραμμής στη λίστα του καταλόγου: πωλήσεις (ίδια με την Επισκόπηση
 * της καρτέλας), φωτογραφίες, χαρακτηριστικά με την πηγή τους, ενεργειακή ετικέτα και διαστάσεις ανά πηγή, και το
 * είδος όπως είναι στο SoftOne. Μόνο αναγνώσεις από τη βάση — καμία κλήση στο SoftOne.
 */
export type ProductPeek = NonNullable<Awaited<ReturnType<typeof productPeek>>>;

export async function productPeek(id: string) {
  const p = await db.product.findUnique({ where: { id }, select: { id: true, title: true, slug: true, sku: true, ean: true, erpCode: true, modelCode: true, active: true, price: true, stock: true, summary: true, source: true, s1SyncedAt: true, dimStatus: true, dimNote: true, eprelStatus: true, brand: { select: { name: true } }, category: { select: { name: true, parent: { select: { name: true, parent: { select: { name: true } } } } } }, energy: { select: { class: true, scale: true, source: true, labelUrl: true, ficheUrl: true, eprelRegistrationNumber: true } } } });
  if (!p) return null;
  const mtrl = Number(p.erpCode);
  const [overview, media, specs, dims, item] = await Promise.all([
    productOverview(id),
    db.media.findMany({ where: { productId: id, kind: "image" }, orderBy: { sortNo: "asc" }, select: { id: true, url: true, thumbUrl: true, width: true, height: true, hidden: true, source: true } }),
    db.spec.findMany({ where: { productId: id }, orderBy: [{ sortNo: "asc" }, { id: "asc" }], select: { groupName: true, key: true, value: true, source: true } }),
    db.productDimension.findMany({ where: { productId: id }, orderBy: { source: "asc" }, select: { source: true, kind: true, w: true, h: true, d: true, warning: true } }),
    p.source === "softone" && Number.isInteger(mtrl) ? db.s1Item.findUnique({ where: { mtrl }, select: { code: true, name: true, barcode: true, factoryCode: true, active: true, priceRetail: true, eshopPrice: true, stockCentral: true, stockByWh: true, availText: true, extWarranty: true, guaranteeMonths: true, weightKg: true, widthCm: true, heightCm: true, lengthCm: true, shortDesc: true, longDesc: true, onOrder: true, missing: true, s1UpdatedAt: true, syncedAt: true } }) : null,
  ]);
  const pathNames = [p.category.parent?.parent?.name, p.category.parent?.name, p.category.name].filter((x): x is string => !!x);
  const photos = media.filter((m) => !m.hidden && m.source !== "eprel-label");
  const main = photos[0];
  const energyNeeded = hasEnergyLabel(p.category.name);
  const readiness = productReadiness({
    photos: photos.length,
    mainLowRes: main && main.width != null && main.height != null ? Math.max(main.width, main.height) < LOW_RES_PX : null,
    description: !!(item?.longDesc?.trim() || item?.shortDesc?.trim() || p.summary?.trim()),
    specs: specs.length,
    dims: { needed: fitMatters(pathNames), present: dims.length > 0 || !!(item?.widthCm && item.heightCm && item.lengthCm) },
    energy: { needed: energyNeeded, present: !!p.energy },
    ar: { applies: false, on: false, reason: null },
    price: p.price,
  });
  const ws = warrantyFromSpecs(specs);
  const bySource = new Map<string, number>();
  for (const s of specs) bySource.set(s.source ?? "other", (bySource.get(s.source ?? "other") ?? 0) + 1);
  return {
    id: p.id, title: p.title, slug: p.slug, sku: p.sku, ean: p.ean, erpCode: p.erpCode, modelCode: p.modelCode, active: p.active,
    brand: p.brand.name, path: pathNames.join(" › "), price: p.price, stock: p.stock, syncedAt: p.s1SyncedAt?.toISOString() ?? null,
    overview,
    readiness: { done: readiness.done, total: readiness.total, missing: readiness.missing.map((m) => ({ label: m.label, level: m.level, tab: m.tab })) },
    photos: photos.slice(0, 12).map((m) => ({ id: m.id, src: m.thumbUrl ?? m.url, w: m.width, h: m.height, low: m.width != null && m.height != null && Math.max(m.width, m.height) < LOW_RES_PX })),
    photoCount: photos.length, hiddenPhotos: media.filter((m) => m.hidden).length,
    specs: specs.slice(0, 60), specCount: specs.length, specSources: [...bySource].map(([source, n]) => ({ source, n })).sort((a, b) => b.n - a.n),
    energy: p.energy ? { cls: p.energy.class, scale: p.energy.scale, source: p.energy.source, label: p.energy.labelUrl, fiche: p.energy.ficheUrl, eprel: p.energy.eprelRegistrationNumber } : null,
    energyNeeded, eprelStatus: p.eprelStatus,
    dims, dimStatus: p.dimStatus, dimNote: p.dimNote,
    warranty: item?.guaranteeMonths ? { months: item.guaranteeMonths, from: "softone" as const, text: null } : ws ? { months: ws.months, from: "specs" as const, text: ws.text } : { months: 24, from: "default" as const, text: null },
    erp: item ? { ...item, stockByWh: (item.stockByWh ?? null) as Record<string, number> | null, shortDesc: item.shortDesc?.slice(0, 400) ?? null, longDesc: item.longDesc ? item.longDesc.length : 0, s1UpdatedAt: item.s1UpdatedAt?.toISOString() ?? null, syncedAt: item.syncedAt.toISOString() } : null,
  };
}
