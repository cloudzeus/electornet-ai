import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { UserError } from "@/lib/catalog/foreign-import/core";
import type { DraftDTO, MappingDraft } from "@/lib/catalog/xml-import/ui-core";

/**
 * Το **πρόχειρο** της αντιστοίχισης: ό,τι έχει διαλέξει ο χρήστης στα ενδιάμεσα βήματα του οδηγού, πριν πατήσει
 * «Φόρτωσε τα προϊόντα».
 *
 * Γιατί στη βάση και όχι στον browser: η δουλειά σε 120 κατηγορίες δεν χάνεται επειδή έκλεισε μια καρτέλα, γύρισε ο
 * υπολογιστής ή συνέχισε κάποιος άλλος από άλλη θέση. Κλειδί ο **προμηθευτής και η διεύθυνση** (όπως στο
 * `FeedSnapshot`): στο βήμα ② δεν υπάρχει ακόμη γραμμή `SupplierFeed`, άρα το feedId δεν κάνει για κλειδί.
 *
 * Το πρόχειρο είναι εκκρεμότητα, όχι πρότυπο: μόλις η αντιστοίχιση αποθηκευτεί κανονικά (`saveFeed`), σβήνεται.
 */

const keyOf = (url: string) => createHash("sha256").update(url.trim()).digest("hex");

/** Τα βήματα όπου έχει νόημα να γυρίσει ο χρήστης. Ό,τι άλλο στέλνει ο browser γίνεται «στήλες». */
const STEPS = new Set(["cols", "brands", "cats", "specs", "finish"]);
/** Μια αντιστοίχιση 300 μαρκών και 120 κατηγοριών είναι δεκάδες KB. Πάνω από αυτό δεν είναι πρόχειρο οδηγού. */
const MAX_BYTES = 1_000_000;

export async function putDraft(supplierId: string, url: string, step: string, value: MappingDraft, staffId: string): Promise<Date> {
  const u = String(url ?? "").trim();
  if (!u) throw new UserError("Χωρίς διεύθυνση δεν υπάρχει πρόχειρο.");
  const json = JSON.stringify(value ?? {});
  if (json.length > MAX_BYTES) throw new UserError("Το πρόχειρο είναι υπερβολικά μεγάλο για να αποθηκευτεί.");
  const data = { url: u, step: STEPS.has(step) ? step : "cols", data: JSON.parse(json) as object, staffId };
  const row = await db.feedDraft.upsert({
    where: { supplierId_urlKey: { supplierId, urlKey: keyOf(u) } },
    create: { supplierId, urlKey: keyOf(u), ...data },
    update: data,
    select: { updatedAt: true },
  });
  return row.updatedAt;
}

export async function getDraft(supplierId: string, url: string): Promise<DraftDTO | null> {
  const u = String(url ?? "").trim();
  if (!supplierId || !u) return null;
  const row = await db.feedDraft.findUnique({
    where: { supplierId_urlKey: { supplierId, urlKey: keyOf(u) } },
    select: { step: true, data: true, updatedAt: true },
  });
  return row ? { at: row.updatedAt.toISOString(), step: row.step, value: (row.data ?? {}) as unknown as MappingDraft } : null;
}

/** Σβήνει το πρόχειρο — είτε γιατί αποθηκεύτηκε η αντιστοίχιση, είτε γιατί ο χρήστης ξεκινά από την αρχή. */
export async function dropDraft(supplierId: string, url: string): Promise<void> {
  const u = String(url ?? "").trim();
  if (!supplierId || !u) return;
  await db.feedDraft.deleteMany({ where: { supplierId, urlKey: keyOf(u) } });
}
