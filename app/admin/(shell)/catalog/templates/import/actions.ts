"use server";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { audit } from "@/lib/rbac/audit";
import { findMapping } from "@/lib/catalog/foreign-import/read";
import { applyForeign } from "@/lib/catalog/foreign-import/server";
import { itemWriteEnabled } from "@/lib/softone/item-write";
import { resetCatalogCache } from "@/lib/data/db-catalog";
import type { SavedConfig } from "@/lib/catalog/foreign-import/core";
import type { SavedMappingRef } from "@/lib/catalog/foreign-import/ui-core";

/** Αποθηκευμένη αντιστοίχιση για αυτές τις επικεφαλίδες (όταν ο χρήστης αλλάζει φύλλο ή γραμμή επικεφαλίδας). */
export async function lookupMapping(headers: string[]): Promise<SavedMappingRef | null> {
  await requirePermission("catalog.products.write");
  const m = await findMapping(headers.slice(0, 200).map((h) => String(h ?? "")));
  return m ? { id: m.id, name: m.name, config: m.config as SavedConfig } : null;
}

export type RunResult = { done: number; waiting: number; pending: number; errors: { rowNo: number; error: string }[] } | { error: string };

/**
 * Εκτέλεση μίας παρτίδας (έως 50 γραμμές) της προεπισκόπησης. Όπως στην εισαγωγή template: όταν η εγγραφή στο SoftOne
 * είναι ανοιχτή χρειάζεται και το «Εκτέλεση συγχρονισμού ERP», γιατί υπάρχοντα είδη γράφονται στο ERP.
 */
export async function runForeignBatch(jobId: string, rowNos: number[]): Promise<RunResult> {
  const user = await requirePermission("catalog.products.write");
  if ((await itemWriteEnabled()) && !can(user.permissions, "catalog.sync.run")) return { error: "Η εγγραφή στο SoftOne είναι ανοιχτή: για εκτέλεση χρειάζεται και το δικαίωμα «Εκτέλεση συγχρονισμού ERP»." };
  const rows = [...new Set(rowNos.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 50);
  if (!rows.length) return { error: "Δεν επιλέχθηκε καμία γραμμή." };
  try {
    const res = await applyForeign(String(jobId), rows, user.id);
    resetCatalogCache();
    await audit(user.id, "catalog.foreign-import.apply", "ImportJob", jobId, null, { rows, done: res.done, waiting: res.waiting, pending: res.pending, errors: res.errors.length });
    return res;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Η εκτέλεση απέτυχε." };
  }
}
