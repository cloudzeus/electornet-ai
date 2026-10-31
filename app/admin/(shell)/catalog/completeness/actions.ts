"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { projectPublishReady, savePublishGate, tallyPublish } from "@/lib/catalog/publish-ready-server";
import { resetCatalogCache } from "@/lib/data/db-catalog";

/** Πόσα θα κρύβονταν με αυτά τα κριτήρια (πριν την αποθήκευση). */
export async function previewGateAction(raw: unknown) {
  await requirePermission("catalog.products.read");
  return tallyPublish(raw);
}

/** Διακόπτης + κριτήρια: αποθήκευση και άμεση εφαρμογή στη βιτρίνα. */
export async function saveGateAction(raw: unknown) {
  const user = await requirePermission("settings.write");
  const { before, after } = await savePublishGate(raw, user.id);
  await audit(user.id, "catalog.publish-gate.save", "Setting", "catalog.publish", before, after);
  const changed = await projectPublishReady();
  resetCatalogCache();
  revalidatePath("/admin/catalog/completeness");
  return { ok: true as const, changed, enabled: after.enabled };
}

/** Ξαναμέτρημα όλου του καταλόγου (π.χ. μετά από μαζικό ανέβασμα φωτογραφιών). */
export async function recomputePublishAction() {
  await requirePermission("catalog.products.write");
  const changed = await projectPublishReady();
  resetCatalogCache();
  revalidatePath("/admin/catalog/completeness");
  return { changed };
}

/**
 * «Γρήγορη διόρθωση»: τα στοιχεία που χρειάζεται το παράθυρο της λίστας για ένα ημιτελές προϊόν — τι λείπει, τα πεδία
 * του SoftOne (ίδια φόρμα με την καρτέλα προϊόντος) και οι φωτογραφίες. Μόνο ανάγνωση· οι αποθηκεύσεις περνούν από τα
 * υπάρχοντα actions του προϊόντος (saveProductFields, φωτογραφίες).
 */
export async function quickFixAction(productId: string) {
  const user = await requirePermission("catalog.products.read");
  const [{ db }, { can }, { listProductImages }, { itemWriteEnabled }] = await Promise.all([import("@/lib/db"), import("@/lib/rbac/permissions"), import("@/lib/catalog/product-images"), import("@/lib/softone/item-write")]);
  const p = await db.product.findUnique({ where: { id: productId }, select: { id: true, title: true, sku: true, erpCode: true, source: true, publishReady: true, publishMissing: true, brand: { select: { name: true } }, category: { select: { name: true } } } });
  if (!p) return null;
  const mtrl = Number(p.erpCode);
  const fromS1 = p.source === "softone" && Number.isInteger(mtrl);
  const [images, item, writeOn, dims] = await Promise.all([
    listProductImages(p.id),
    fromS1 ? db.s1Item.findUnique({ where: { mtrl } }) : Promise.resolve(null),
    itemWriteEnabled(),
    db.productDimension.findMany({ where: { productId: p.id }, orderBy: { source: "asc" } }),
  ]);
  const canWrite = can(user.permissions, "catalog.products.write");
  const canErp = canWrite && can(user.permissions, "catalog.sync.run");
  const readonlyReason = !canErp ? "Μόνο ανάγνωση: χρειάζονται τα δικαιώματα «Επεξεργασία προϊόντων» και «Εκτέλεση συγχρονισμού ERP»." : !writeOn ? "Μόνο ανάγνωση: η εγγραφή στο SoftOne είναι κλειστή (Ρυθμίσεις → SoftOne → Αλλαγές προϊόντων προς SoftOne)." : undefined;
  return {
    id: p.id, title: p.title, sku: p.sku, publishReady: p.publishReady, missing: p.publishMissing,
    images, canWrite, canMedia: can(user.permissions, "cms.media.write"),
    editor: item ? {
      initial: {
        name: item.name, barcode: item.barcode, factoryCode: item.factoryCode, active: item.active ? 1 : 0, shortDesc: item.shortDesc, longDesc: item.longDesc,
        availText: item.availText, extWarranty: item.extWarranty ? 1 : 0, guaranteeMonths: item.guaranteeMonths, weightKg: item.weightKg, lengthCm: item.lengthCm, widthCm: item.widthCm, heightCm: item.heightCm,
      },
      readonlyReason,
      meta: { code: p.sku, mtrl: p.erpCode, brand: p.brand.name, category: p.category.name },
      dimCandidates: dims.map((x) => ({ source: x.source, w: x.w, h: x.h, d: x.d, kind: x.kind, line: `${x.rawKey ?? "Διαστάσεις"}: ${x.rawValue ?? ""}`.slice(0, 120), note: x.warning })),
    } : null,
  };
}
export type QuickFixData = NonNullable<Awaited<ReturnType<typeof quickFixAction>>>;

/** Μετά τη διόρθωση: ξαναμέτρημα μόνο αυτού του προϊόντος (φωτογραφίες δεν περνούν από την προβολή του SoftOne). */
export async function recheckProductAction(productId: string) {
  await requirePermission("catalog.products.read");
  const { db } = await import("@/lib/db");
  const changed = await projectPublishReady([productId]);
  if (changed) resetCatalogCache();
  revalidatePath("/admin/catalog/completeness");
  const p = await db.product.findUnique({ where: { id: productId }, select: { publishReady: true, publishMissing: true } });
  return { publishReady: p?.publishReady ?? false, missing: p?.publishMissing ?? [] };
}

/** «Πρόταση από την απόδελτίωση»: χαρακτηριστικά της κατηγορίας, διαστάσεις και βάρος (μία κλήση AI, χωρίς εγγραφή). */
export async function suggestSpecsAction(productId: string) {
  await requirePermission("catalog.products.write");
  const { suggestSpecs } = await import("@/lib/catalog/spec-suggest");
  return suggestSpecs(productId);
}

/**
 * Εισαγωγή των επιλεγμένων προτάσεων: τα χαρακτηριστικά που λείπουν μπαίνουν στο τέλος της αναλυτικής περιγραφής
 * («Ετικέτα : τιμή», τα υπάρχοντα δεν αλλάζουν) και διαστάσεις / βάρος στα πεδία τους — με την ίδια εγγραφή
 * (SoftOne → έλεγχος → e-shop) όπως η καρτέλα προϊόντος.
 */
export async function applySuggestionAction(productId: string, pick: { specs: { label: string; value: string }[]; dims?: { w: number; h: number; d: number } | null; weightKg?: number | null }) {
  const user = await requirePermission("catalog.products.write");
  const [{ db }, { fillBlankMemo }, { saveProductFields }] = await Promise.all([import("@/lib/db"), import("@/lib/catalog/foreign-import/core"), import("../actions")]);
  const p = await db.product.findUnique({ where: { id: productId }, select: { erpCode: true, source: true } });
  const mtrl = Number(p?.erpCode);
  const item = p?.source === "softone" && Number.isInteger(mtrl) ? await db.s1Item.findUnique({ where: { mtrl }, select: { longDesc: true, widthCm: true, heightCm: true, lengthCm: true, weightKg: true } }) : null;
  if (!item) return { ok: false as const, message: "Το προϊόν δεν προέρχεται από το SoftOne." };
  const changes: import("@/lib/softone/item-write").ItemChanges = {};
  const specs = pick.specs.filter((s) => s.label.trim() && s.value.trim()).slice(0, 80);
  if (specs.length) {
    const memo = fillBlankMemo(item.longDesc ?? "", specs);
    if (memo !== (item.longDesc ?? "")) changes.longDesc = { from: item.longDesc, to: memo };
  }
  const ok = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n > 0;
  if (pick.dims && ok(pick.dims.w) && ok(pick.dims.h) && ok(pick.dims.d)) {
    changes.widthCm = { from: item.widthCm, to: pick.dims.w };
    changes.heightCm = { from: item.heightCm, to: pick.dims.h };
    changes.lengthCm = { from: item.lengthCm, to: pick.dims.d };
  }
  if (ok(pick.weightKg)) changes.weightKg = { from: item.weightKg, to: pick.weightKg! };
  if (!Object.keys(changes).length) return { ok: true as const, message: "Καμία αλλαγή για εισαγωγή." };
  await audit(user.id, "catalog.product.spec-suggest-apply", "Product", productId, null, { specs: specs.length, dims: !!changes.widthCm, weight: !!changes.weightKg });
  const r = await saveProductFields(productId, changes);
  if (r.written?.length) await projectPublishReady([productId]);
  return { ok: r.ok, message: r.message };
}
