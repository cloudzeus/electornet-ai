"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";

/**
 * Εξωτερικές πηγές ανά προϊόν (Πληρότητα + σελίδα προϊόντος): Icecat → Channel3 → site κατασκευαστή → άλλα καταστήματα, με
 * φωτογραφίες και χαρακτηριστικά καταστημάτων ως προτάσεις προς έγκριση (lib/catalog/enrich-run.ts, enrich-suggestions.ts).
 */
export async function enrichStateAction(productId: string) {
  await requirePermission("catalog.products.read");
  const [{ db }, { listSuggestions, externalSpecsNotInErp }] = await Promise.all([import("@/lib/db"), import("@/lib/catalog/enrich-suggestions")]);
  const [rows, suggestions, external, channel3] = await Promise.all([
    db.productEnrichment.findMany({ where: { productId }, select: { source: true, status: true, url: true, sourceName: true, specCount: true, error: true, checkedAt: true } }),
    listSuggestions(productId),
    externalSpecsNotInErp(productId),
    import("@/lib/catalog/channel3").then((m) => m.channel3Usage()).catch(() => null),
  ]);
  return { sources: rows.map((r) => ({ ...r, checkedAt: r.checkedAt.toISOString() })), suggestions, external, channel3 };
}
export type EnrichState = Awaited<ReturnType<typeof enrichStateAction>>;

/** «Αναζήτηση τώρα»: όλη η ροή, χωρίς να παραλείπει όσα ελέγχθηκαν πρόσφατα (μέχρι ~2 λεπτά, κόστος έως ~$0,03). */
export async function enrichNowAction(productId: string) {
  const user = await requirePermission("catalog.products.write");
  const { enrichProduct } = await import("@/lib/catalog/enrich-run");
  const run = await enrichProduct(productId, { force: true });
  if (!run) return null;
  await audit(user.id, "catalog.product.enrich", "Product", productId, null, { steps: run.steps.map((s) => `${s.source}:${s.status}`), costUsd: run.costUsd, suggestions: run.suggestions });
  revalidatePath(`/admin/catalog/${productId}`);
  return { run, state: await enrichStateAction(productId) };
}

/** Χαρακτηριστικά → αναλυτική περιγραφή του SoftOne (μόνο όσα λείπουν), με την ίδια εγγραφή όπως η «Πρόταση από την απόδελτίωση». */
async function writeSpecsToErp(productId: string, specs: { key: string; value: string }[]) {
  const { applySuggestionAction } = await import("./completeness/actions");
  const r = await applySuggestionAction(productId, { specs: specs.map((s) => ({ label: s.key, value: s.value })) });
  if (r.ok) await (await import("@/lib/catalog/enrich-suggestions")).dropExternalDuplicates(productId);
  return r;
}

export interface DecideResult { images: number; specsErp: number; specsEshop: number; rejected: number; failed: { message: string }[]; erpMessage?: string }

/**
 * Έγκριση / απόρριψη προτάσεων. Φωτογραφίες → γκαλερί. Χαρακτηριστικά καταστημάτων → SoftOne (και από εκεί e-shop)·
 * αν η εγγραφή στο SoftOne δεν γίνεται (κλειστή, δικαιώματα, είδος εκτός SoftOne) → μόνο e-shop, με τον λόγο.
 */
export async function decideSuggestionsAction(productId: string, ids: string[], decision: "approve" | "reject") {
  const user = await requirePermission("catalog.products.write");
  const m = await import("@/lib/catalog/enrich-suggestions");
  const pick = ids.slice(0, 60);
  const out: DecideResult = { images: 0, specsErp: 0, specsEshop: 0, rejected: 0, failed: [] };
  if (decision === "reject") out.rejected = (await m.rejectSuggestions(productId, pick, user.id)).rejected;
  else {
    const rows = await m.pendingRows(productId, pick);
    const img = await m.approveImages(productId, rows, user.id);
    out.images = img.images; out.failed = img.failed;
    const specs = rows.filter((r) => r.kind === "spec" && r.key && r.value);
    if (specs.length) {
      const w = await writeSpecsToErp(productId, specs.map((s) => ({ key: s.key!, value: s.value! })));
      if (w.ok) { await m.markApproved(specs.map((s) => s.id), user.id); out.specsErp = specs.length; }
      else { out.specsEshop = await m.approveSpecsEshopOnly(productId, specs, user.id); out.erpMessage = w.message; }
    }
    const { projectPublishReady } = await import("@/lib/catalog/publish-ready-server");
    await projectPublishReady([productId]);
  }
  await audit(user.id, `catalog.product.enrich-${decision}`, "Product", productId, null, out);
  revalidatePath(`/admin/catalog/${productId}`);
  revalidatePath("/admin/catalog/completeness");
  return { result: out, state: await enrichStateAction(productId) };
}

/** «Εισαγωγή στο SoftOne»: επιλεγμένα χαρακτηριστικά Icecat / Channel3 / κατασκευαστή / καταστήματος που λείπουν από το ERP. */
export async function pushSpecsToErpAction(productId: string, specIds: string[]) {
  const user = await requirePermission("catalog.products.write");
  const { db } = await import("@/lib/db");
  const { EXTERNAL } = await import("@/lib/catalog/enrich-suggestions");
  const rows = await db.spec.findMany({ where: { productId, id: { in: specIds.slice(0, 80) }, source: { in: EXTERNAL } }, select: { key: true, value: true } });
  if (!rows.length) return { ok: false as const, message: "Δεν επιλέχθηκε χαρακτηριστικό.", state: await enrichStateAction(productId) };
  const w = await writeSpecsToErp(productId, rows);
  await audit(user.id, "catalog.product.enrich-to-erp", "Product", productId, null, { specs: rows.length, ok: w.ok });
  revalidatePath(`/admin/catalog/${productId}`);
  return { ok: w.ok, message: w.message, state: await enrichStateAction(productId) };
}
