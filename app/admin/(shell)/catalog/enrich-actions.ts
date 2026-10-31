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
  const [rows, suggestions, external, channel3, copy] = await Promise.all([
    db.productEnrichment.findMany({ where: { productId }, select: { source: true, status: true, url: true, sourceName: true, specCount: true, error: true, checkedAt: true } }),
    listSuggestions(productId),
    externalSpecsNotInErp(productId),
    import("@/lib/catalog/channel3").then((m) => m.channel3Usage()).catch(() => null),
    db.product.findUnique({ where: { id: productId }, select: { summary: true, description: true } }),
  ]);
  return { sources: rows.map((r) => ({ ...r, checkedAt: r.checkedAt.toISOString() })), suggestions, external, channel3, copy: { short: copy?.summary ?? null, long: copy?.description ?? null } };
}
export type EnrichState = Awaited<ReturnType<typeof enrichStateAction>>;

/** «Αναζήτηση τώρα»: όλη η ροή, χωρίς να παραλείπει όσα ελέγχθηκαν πρόσφατα (μέχρι ~2 λεπτά, κόστος έως ~$0,03). */
export async function enrichNowAction(productId: string) {
  const user = await requirePermission("catalog.products.write");
  const { enrichProduct } = await import("@/lib/catalog/enrich-run");
  const run = await enrichProduct(productId, { force: true });
  if (!run) return null;
  await audit(user.id, "catalog.product.enrich", "Product", productId, null, { steps: run.steps.map((s) => `${s.source}:${s.status}`), costUsd: run.costUsd, suggestions: run.suggestions, energy: run.energy });
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

export interface DecideResult { images: number; specsErp: number; specsEshop: number; dims: number; rejected: number; failed: { message: string }[]; erpMessage?: string }

/**
 * Έγκριση / απόρριψη προτάσεων. Φωτογραφίες → γκαλερί. Χαρακτηριστικά καταστημάτων → SoftOne (και από εκεί e-shop)·
 * αν η εγγραφή στο SoftOne δεν γίνεται (κλειστή, δικαιώματα, είδος εκτός SoftOne) → μόνο e-shop, με τον λόγο.
 */
export async function decideSuggestionsAction(productId: string, ids: string[], decision: "approve" | "reject") {
  const user = await requirePermission("catalog.products.write");
  const m = await import("@/lib/catalog/enrich-suggestions");
  const pick = ids.slice(0, 60);
  const out: DecideResult = { images: 0, specsErp: 0, specsEshop: 0, dims: 0, rejected: 0, failed: [] };
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
    // διαστάσεις κατασκευαστή → πεδία διαστάσεων του SoftOne, και στο site ως επιλογή διαχειριστή (πάνω από την περιγραφή)
    const dim = rows.find((r) => r.kind === "dims");
    const d = dim && m.dimsOf(dim.fingerprint);
    if (dim && d) {
      const { applySuggestionAction } = await import("./completeness/actions");
      const w = await applySuggestionAction(productId, { specs: [], dims: d });
      if (w.ok) {
        const { db } = await import("@/lib/db");
        const data = { w: d.w, h: d.h, d: d.d, kind: "product", rawKey: "Έγκριση πρότασης", rawValue: `${dim.value ?? ""} · ${dim.sourceName ?? dim.source}`.slice(0, 190), warning: null };
        await db.productDimension.upsert({ where: { productId_source: { productId, source: "manual" } }, create: { productId, source: "manual", ...data }, update: data });
        await m.markApproved(rows.filter((r) => r.kind === "dims").map((r) => r.id), user.id);
        out.dims = 1;
      } else out.erpMessage = w.message;
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

/** «Περιγραφή με AI»: πρόχειρο σύντομης + αναλυτικής περιγραφής (marketing) — δεν αποθηκεύει τίποτα. Κόστος ~$0,01. */
export async function draftCopyAction(productId: string) {
  const user = await requirePermission("catalog.products.write");
  const { draftMarketingCopy } = await import("@/lib/catalog/marketing-copy");
  const r = await draftMarketingCopy(productId);
  if (!("error" in r)) await audit(user.id, "catalog.product.copy-draft", "Product", productId, null, { model: r.model, costUsd: r.costUsd, examples: r.examples.length, specs: r.specCount });
  return r;
}

/**
 * Έγκριση περιγραφής: σύντομη → CCCWREMARKS1· αναλυτική → το κείμενο της CCCWREMARKS (οι γραμμές χαρακτηριστικών μένουν
 * από κάτω όπως ήταν). Γράφεται στο SoftOne και από εκεί στο e-shop, όπως κάθε αλλαγή κειμένων.
 */
export async function saveCopyAction(productId: string, pick: { short?: string; long?: string }) {
  await requirePermission("catalog.products.write");
  const [{ db }, { replaceMemoText, cleanCopy }, { saveProductFields }] = await Promise.all([import("@/lib/db"), import("@/lib/catalog/marketing-copy-core"), import("./actions")]);
  const p = await db.product.findUnique({ where: { id: productId }, select: { erpCode: true, source: true } });
  const mtrl = Number(p?.erpCode);
  const item = p?.source === "softone" && Number.isInteger(mtrl) ? await db.s1Item.findUnique({ where: { mtrl }, select: { shortDesc: true, longDesc: true } }) : null;
  if (!item) return { ok: false as const, message: "Το προϊόν δεν προέρχεται από το SoftOne." };
  const changes: import("@/lib/softone/item-write").ItemChanges = {};
  const short = cleanCopy(pick.short ?? "").replace(/\n+/g, " ");
  if (short && short !== (item.shortDesc ?? "").trim()) changes.shortDesc = { from: item.shortDesc, to: short.slice(0, 4000) };
  if (pick.long?.trim()) {
    const memo = replaceMemoText(item.longDesc, pick.long);
    if (memo !== (item.longDesc ?? "").replace(/\r\n?/g, "\n")) changes.longDesc = { from: item.longDesc, to: memo };
  }
  if (!Object.keys(changes).length) return { ok: true as const, message: "Καμία αλλαγή για αποθήκευση." };
  const r = await saveProductFields(productId, changes);
  if (r.written?.length) { const { projectPublishReady } = await import("@/lib/catalog/publish-ready-server"); await projectPublishReady([productId]); }
  revalidatePath(`/admin/catalog/${productId}`);
  revalidatePath("/admin/catalog/completeness");
  return { ok: r.ok, message: r.message };
}
