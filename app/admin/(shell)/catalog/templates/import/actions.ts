"use server";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { audit } from "@/lib/rbac/audit";
import { findMapping } from "@/lib/catalog/foreign-import/read";
import { applyForeign, replanForeign, type ForeignPlanRow } from "@/lib/catalog/foreign-import/server";
import { ensureFreshSpecGroups } from "@/lib/catalog/supplier-sheet";
import { itemWriteEnabled } from "@/lib/softone/item-write";
import { resetCatalogCache } from "@/lib/data/db-catalog";
import { UserError, type SavedConfig } from "@/lib/catalog/foreign-import/core";

const SWITCH_CHANGED = "Ο διακόπτης του SoftOne άλλαξε από την προεπισκόπηση — ξανακάνε προεπισκόπηση.";
import type { SavedMappingRef } from "@/lib/catalog/foreign-import/ui-core";

/** Αποθηκευμένη αντιστοίχιση για αυτές τις επικεφαλίδες (όταν ο χρήστης αλλάζει φύλλο ή γραμμή επικεφαλίδας). */
export async function lookupMapping(headers: string[]): Promise<SavedMappingRef | null> {
  await requirePermission("catalog.products.write");
  const m = await findMapping(headers.slice(0, 200).map((h) => String(h ?? "")));
  return m ? { id: m.id, name: m.name, config: m.config as SavedConfig } : null;
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
