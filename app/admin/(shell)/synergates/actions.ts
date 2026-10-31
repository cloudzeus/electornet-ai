"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { importPartners, type ImportSummary } from "@/lib/b2b/partners-import";
import { createMissingStores, createStoreFromBranch, setStoreVisible } from "@/lib/b2b/branch-stores";
import { geocodeStore } from "@/lib/stores/geocode";

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

/** Νέο κατάστημα (κρυφό) από υποκατάστημα· δοκιμάζει αμέσως και τη γεωκωδικοποίηση. */
export async function createBranchStore(branchId: string) {
  const user = await requirePermission("stores.partners.write");
  try {
    const r = await createStoreFromBranch(branchId);
    const geo = await geocodeStore(r.storeId).catch(() => ({ ok: false as const }));
    await audit(user.id, "b2b.branch.store-create", "PartnerBranch", branchId, null, { storeId: r.storeId, geocoded: geo.ok });
    revalidatePath("/admin/synergates", "layout");
    return { ok: true as const, geocoded: geo.ok };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Αποτυχία" };
  }
}

/** Όλα τα υποκαταστήματα χωρίς κατάστημα → κρυφά καταστήματα (χωρίς σημείο· μετά «Γεωκωδικοποίηση»). */
export async function createAllMissingStores() {
  const user = await requirePermission("stores.partners.write");
  const r = await createMissingStores();
  await audit(user.id, "b2b.stores.create-missing", "Store", "*", null, r);
  revalidatePath("/admin/synergates", "layout");
  return { ok: true as const, ...r };
}

/** Γεωκωδικοποίηση έως 20 καταστημάτων μελών χωρίς σημείο (Nominatim, 1 αίτημα/δευτ.). Δεν αλλάζει την εμφάνιση. */
export async function geocodePartnerStores() {
  const user = await requirePermission("stores.partners.write");
  const where = { partnerId: { not: null }, lat: 0, lng: 0, geoLat: null };
  const rows = await db.store.findMany({ where, take: 20, select: { id: true } });
  let done = 0;
  for (const r of rows) {
    const g = await geocodeStore(r.id).catch(() => ({ ok: false as const }));
    if (g.ok) done++;
    else await db.store.update({ where: { id: r.id }, data: { geoLat: 0, geoLng: 0, geoLabel: "δεν βρέθηκε" } }); // για να μην ξαναδοκιμάζεται σε κάθε γύρο
    await new Promise((res) => setTimeout(res, 1100));
  }
  const left = await db.store.count({ where });
  await audit(user.id, "b2b.stores.geocode", "Store", "*", null, { done, left });
  revalidatePath("/admin/synergates", "layout");
  return { ok: true as const, done, failed: rows.length - done, left };
}

/** Εμφάνιση ή απόκρυψη καταστήματος μέλους στο eshop. */
export async function setPartnerStoreVisible(storeId: string, visible: boolean) {
  const user = await requirePermission("stores.partners.write");
  const r = await setStoreVisible(storeId, visible);
  if (!r.ok) return r;
  await audit(user.id, visible ? "store.show" : "store.hide", "Store", storeId, { active: r.before }, { active: visible });
  revalidatePath("/admin/synergates", "layout");
  revalidatePath("/admin/stores");
  return { ok: true as const };
}
