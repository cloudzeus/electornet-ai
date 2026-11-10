"use server";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { audit } from "@/lib/rbac/audit";
import { findMapping, autosaveMapping } from "@/lib/catalog/foreign-import/read";
import { applyForeign, replanForeign, assertConfigIds, missingFromJob, deactivateMissing, rowsWithoutCategory, setRowCategories, type ForeignPlanRow, type MissingProduct } from "@/lib/catalog/foreign-import/server";
import { suggestProductCategories, type CatGuess } from "@/lib/catalog/category-ai";
import { pendingViews } from "@/lib/catalog/foreign-import/pending";
import { groupOptions } from "@/lib/catalog/foreign-import/options";
import { db } from "@/lib/db";
import type { PendingView } from "@/components/admin/catalog/PendingItems";
import { ensureFreshSpecGroups } from "@/lib/catalog/supplier-sheet";
import { itemWriteEnabled, webFlagWriteEnabled } from "@/lib/softone/item-write";
import { resetCatalogCache } from "@/lib/data/db-catalog";
import { UserError, type SavedConfig } from "@/lib/catalog/foreign-import/core";

const SWITCH_CHANGED = "Ο διακόπτης του SoftOne άλλαξε από την προεπισκόπηση — ξανακάνε προεπισκόπηση.";
import { parseConfig, parsePrice, type SavedMappingRef } from "@/lib/catalog/foreign-import/ui-core";

/** Αποθηκευμένη αντιστοίχιση για αυτές τις επικεφαλίδες (όταν ο χρήστης αλλάζει φύλλο ή γραμμή επικεφαλίδας). */
export async function lookupMapping(headers: string[]): Promise<SavedMappingRef | null> {
  await requirePermission("catalog.products.write");
  const m = await findMapping(headers.slice(0, 200).map((h) => String(h ?? "")));
  return m ? { id: m.id, name: m.name, config: m.config as SavedConfig } : null;
}

/**
 * Αυτόματη αποθήκευση στα βήματα 2–3: στήλες, μάρκες/κατηγορίες και επιλογές τιμής (ΦΠΑ, markup) κρατιούνται ανά
 * επικεφαλίδες αρχείου, ώστε ο χρήστης να συνεχίσει άλλη μέρα ανεβάζοντας ξανά το ίδιο αρχείο. Καμία εγγραφή σε προϊόντα.
 */
export async function saveDraftMapping(headers: string[], rawConfig: unknown, rawPrice: unknown, fileName: string, saveAs: string): Promise<SavedMappingRef | { error: string }> {
  const user = await requirePermission("catalog.products.write");
  try {
    const config = parseConfig(rawConfig);
    if (!Object.keys(config.columns).length) return { error: "Δεν αντιστοιχίστηκε καμία στήλη." };
    await assertConfigIds(config);
    const m = await autosaveMapping(String(saveAs ?? "").trim().slice(0, 80), String(fileName ?? ""), headers.slice(0, 200).map((h) => String(h ?? "")), config, user.id, parsePrice(rawPrice));
    return { id: m.id, name: m.name, config: m.config as SavedConfig };
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    console.error("[foreign-import/autosave]", e);
    return { error: "Κάτι πήγε στραβά στην αυτόματη αποθήκευση." };
  }
}

export type RunResult = { done: number; waiting: number; pending: number; errors: { rowNo: number; error: string }[]; notes: { rowNo: number; note: string }[] } | { error: string };

export type ReplanResult = { jobId: string; fileName: string; rows: ForeignPlanRow[]; writeOn: boolean } | { error: string };

/**
 * «Νέα προεπισκόπηση» μιας εισαγωγής από τις «Πρόσφατες εισαγωγές»: ξαναϋπολογίζει όλες τις γραμμές της με τον τωρινό
 * διακόπτη του SoftOne (π.χ. όταν άνοιξε, για τις γραμμές «Σε αναμονή») και ανοίγει το βήμα της προεπισκόπησης. Καμία εγγραφή.
 */
export async function replanJob(jobId: string): Promise<ReplanResult> {
  const user = await requirePermission("catalog.products.write");
  try {
    await ensureFreshSpecGroups();
    const res = await replanForeign(String(jobId));
    await audit(user.id, "catalog.foreign-import.replan", "ImportJob", res.jobId, null, { rows: res.rows.length, writeOn: res.writeOn });
    return res;
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    console.error("[foreign-import/replan]", e);
    return { error: "Κάτι πήγε στραβά στη νέα προεπισκόπηση." };
  }
}

/**
 * Εκτέλεση μίας παρτίδας (έως 50 γραμμές) της προεπισκόπησης. Όπως στην εισαγωγή template: όταν η εγγραφή στο SoftOne
 * είναι ανοιχτή χρειάζεται και το «Εκτέλεση συγχρονισμού ERP», γιατί υπάρχοντα είδη γράφονται στο ERP.
 */
export async function runForeignBatch(jobId: string, rowNos: number[], previewWriteOn: boolean): Promise<RunResult> {
  const user = await requirePermission("catalog.products.write");
  const writeOn = await itemWriteEnabled();
  // Γρήγορη άρνηση εδώ· ο ίδιος έλεγχος γίνεται και στο applyForeign με τον διακόπτη που αποθηκεύτηκε στην εισαγωγή
  if (writeOn !== previewWriteOn) return { error: SWITCH_CHANGED };
  if (writeOn && !can(user.permissions, "catalog.sync.run")) return { error: "Η εγγραφή στο SoftOne είναι ανοιχτή: για εκτέλεση χρειάζεται και το δικαίωμα «Εκτέλεση συγχρονισμού ERP»." };
  const rows = [...new Set(rowNos.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 50);
  if (!rows.length) return { error: "Δεν επιλέχθηκε καμία γραμμή." };
  try {
    const res = await applyForeign(String(jobId), rows, user.id);
    resetCatalogCache();
    await audit(user.id, "catalog.foreign-import.apply", "ImportJob", jobId, null, { rows, done: res.done, waiting: res.waiting, pending: res.pending, errors: res.errors.length });
    return res;
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    console.error("[foreign-import/apply]", e);
    return { error: "Κάτι πήγε στραβά στην εκτέλεση." };
  }
}

export type FinishData = { pending: PendingView[]; groups: { id: string; name: string }[]; missing: MissingProduct[]; writeOn: boolean; canApprove: boolean; flagOn: boolean } | { error: string };

/** Βήμα 5 του οδηγού: τα νέα είδη ΑΥΤΗΣ της εισαγωγής (ό,τι δεν έχει απορριφθεί) και τα ενεργά προϊόντα της μάρκας που λείπουν από το αρχείο. Καμία εγγραφή. */
export async function finishData(jobId: string): Promise<FinishData> {
  const user = await requirePermission("catalog.products.write");
  try {
    const [rows, groups, missing, writeOn] = await Promise.all([
      db.pendingItem.findMany({ where: { jobId: String(jobId), status: { not: "discarded" } }, orderBy: { rowNo: "asc" } }),
      groupOptions(), missingFromJob(String(jobId)), itemWriteEnabled(),
    ]);
    return { pending: await pendingViews(rows), groups: groups.map((g) => ({ id: String(g.id), name: g.name })), missing, writeOn, canApprove: can(user.permissions, "catalog.sync.run"), flagOn: webFlagWriteEnabled() };
  } catch (e) { console.error("[foreign-import/finish]", e); return { error: "Δεν φορτώθηκαν τα νέα είδη της εισαγωγής — ξαναδοκίμασε." }; }
}

/** Απενεργοποίηση όσων διάλεξε ο χρήστης από τα «λείπουν από το αρχείο» (παρτίδα έως 20): γράφει «ανενεργό» στο SoftOne, άρα θέλει και το δικαίωμα συγχρονισμού ERP. */
export async function deactivateMissingProducts(jobId: string, ids: string[]): Promise<{ id: string; ok: boolean; error?: string }[] | { error: string }> {
  const user = await requirePermission("catalog.products.write");
  if (!can(user.permissions, "catalog.sync.run")) return { error: "Για απενεργοποίηση χρειάζεται και το δικαίωμα «Εκτέλεση συγχρονισμού ERP»." };
  const list = [...new Set(ids.filter((x) => typeof x === "string" && x))].slice(0, 20);
  try {
    const res = await deactivateMissing(String(jobId), list);
    if (res.some((r) => r.ok)) resetCatalogCache();
    await audit(user.id, "catalog.foreign-import.deactivate", "ImportJob", String(jobId), null, { results: res });
    return res;
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    console.error("[foreign-import/deactivate]", e);
    return { error: "Κάτι πήγε στραβά στην απενεργοποίηση." };
  }
}

export type JobCategoryAi = { guesses: (CatGuess & { label: string })[]; asked: number; left: number; options: { id: string; name: string }[] } | { error: string };

/** «Πρότεινε κατηγορία (AI)» στην προεπισκόπηση: για τα νέα είδη της εισαγωγής που δεν έχουν κατηγορία. Μόνο πρόταση — τίποτα δεν αλλάζει. */
export async function suggestJobCategories(jobId: string): Promise<JobCategoryAi> {
  const user = await requirePermission("catalog.products.write");
  try {
    const rows = await rowsWithoutCategory(String(jobId));
    if (!rows.length) return { error: "Όλα τα νέα είδη αυτής της εισαγωγής έχουν ήδη κατηγορία." };
    const res = await suggestProductCategories(rows.map((r) => ({ key: String(r.rowNo), name: r.name, brand: r.brand, extra: r.extra })));
    const nameOf = new Map(rows.map((r) => [String(r.rowNo), r.name]));
    await audit(user.id, "catalog.foreign-import.category-ai", "ImportJob", String(jobId), null, { asked: res.asked, guesses: res.guesses.length });
    return { ...res, guesses: res.guesses.map((g) => ({ ...g, label: nameOf.get(g.key) ?? "" })) };
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    console.error("[foreign-import/category-ai]", e);
    return { error: "Κάτι πήγε στραβά με τις προτάσεις κατηγορίας — ξαναδοκίμασε." };
  }
}

/** Εφαρμογή όσων προτάσεων δέχτηκε ο χρήστης: η κατηγορία μπαίνει στις γραμμές και η προεπισκόπηση ξαναϋπολογίζεται. */
export async function applyJobCategories(jobId: string, picks: { rowNo: number; categoryId: string }[]): Promise<ReplanResult> {
  await requirePermission("catalog.products.write");
  try {
    const map = Object.fromEntries((Array.isArray(picks) ? picks : []).slice(0, 10_000).filter((p) => Number.isInteger(p?.rowNo) && typeof p?.categoryId === "string" && p.categoryId).map((p) => [p.rowNo, p.categoryId]));
    await ensureFreshSpecGroups();
    return await setRowCategories(String(jobId), map);
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    console.error("[foreign-import/category-apply]", e);
    return { error: "Κάτι πήγε στραβά στην εφαρμογή των κατηγοριών." };
  }
}
