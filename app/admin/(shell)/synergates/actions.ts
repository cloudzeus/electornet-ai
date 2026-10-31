"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { importPartners, type ImportSummary } from "@/lib/b2b/partners-import";

/** Εισαγωγή μελών/υποκαταστημάτων από το SoftOne (μόνο ανάγνωση από το ERP). `dryRun` = μόνο προεπισκόπηση. */
export async function runPartnerImport(dryRun: boolean): Promise<{ ok: true; summary: ImportSummary } | { ok: false; error: string }> {
  const user = await requirePermission("stores.partners.write");
  try {
    const summary = await importPartners({ dryRun, staffId: user.id });
    if (!dryRun) revalidatePath("/admin/synergates");
    return { ok: true, summary };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Η εισαγωγή απέτυχε" };
  }
}

/** Σύνδεση (ή αποσύνδεση με `storeId` null) υποκαταστήματος SoftOne με κατάστημα του eshop. */
export async function linkBranchStore(branchId: string, storeId: string | null) {
  const user = await requirePermission("stores.partners.write");
  const branch = await db.partnerBranch.findUnique({ where: { id: branchId } });
  if (!branch) return { ok: false as const, error: "Το υποκατάστημα δεν βρέθηκε" };
  if (storeId) {
    const other = await db.partnerBranch.findUnique({ where: { storeId }, include: { partner: { select: { name: true } } } });
    if (other && other.id !== branchId) return { ok: false as const, error: `Το κατάστημα είναι ήδη συνδεδεμένο με «${other.name}» (${other.partner.name}). Αποσύνδεσέ το πρώτα από εκεί.` };
  }
  await db.$transaction(async (tx) => {
    if (branch.storeId && branch.storeId !== storeId) {
      // το προηγούμενο κατάστημα αποσυνδέεται από το μέλος
      await tx.store.update({ where: { id: branch.storeId }, data: { partnerId: null } });
    }
    await tx.partnerBranch.update({ where: { id: branchId }, data: { storeId, matchedBy: "manual" } }); // «manual» και χωρίς κατάστημα: η εισαγωγή δεν το ξανασυνδέει
    if (storeId) await tx.store.update({ where: { id: storeId }, data: { partnerId: branch.partnerId } });
  });
  await audit(user.id, "b2b.branch.link", "PartnerBranch", branchId, { storeId: branch.storeId }, { storeId });
  revalidatePath(`/admin/synergates/${branch.partnerId}`);
  revalidatePath("/admin/synergates");
  return { ok: true as const };
}
