"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { db } from "@/lib/db";
import { syncGroups, importProduct, mirrorDocs, refreshAll, search, findByModel, linkProduct } from "@/lib/eprel/sync";

export async function syncEprelGroups() {
  const user = await requirePermission("catalog.products.write");
  const r = await syncGroups();
  await audit(user.id, "eprel.groups.sync", "EprelProductGroup", "*", null, r.ok ? { fetched: r.fetched, created: r.created } : { error: r.error });
  revalidatePath("/admin/eprel");
  return r;
}

export async function setGroupActive(code: string, active: boolean) {
  await requirePermission("catalog.products.write");
  await db.eprelProductGroup.update({ where: { code }, data: { active } });
  revalidatePath("/admin/eprel");
  return { ok: true as const };
}

/** Αναζήτηση στο EPREL (χωρίς αποθήκευση). */
export async function searchEprel(urlCode: string, model: string, brand: string, page = 1) {
  await requirePermission("catalog.products.read");
  const r = await search(urlCode, { page, limit: 20, filters: { modelIdentifier: model ? `${model.trim()}*` : undefined, supplierOrTrademark: brand || undefined } });
  return JSON.parse(JSON.stringify(r)) as typeof r;
}

/** Εισαγωγή καταχώρισης + αντίγραφα ετικέτας/δελτίου στο CDN. */
export async function importEprel(registrationNumber: string, mirror = true) {
  const user = await requirePermission("catalog.products.write");
  const r = await importProduct(registrationNumber);
  let mirrored: { ok: boolean; error?: string } = { ok: false };
  if (r.ok && mirror) mirrored = await mirrorDocs(registrationNumber, user.id);
  await audit(user.id, "eprel.import", "EprelProduct", registrationNumber, null, { ok: r.ok, mirrored: mirrored.ok, error: r.ok ? undefined : r.error });
  revalidatePath("/admin/eprel");
  return { ok: r.ok, error: r.ok ? undefined : r.error, mirrored: mirrored.ok };
}

export async function mirrorEprel(registrationNumber: string) {
  const user = await requirePermission("catalog.products.write");
  const r = await mirrorDocs(registrationNumber, user.id);
  revalidatePath("/admin/eprel");
  return r;
}

export async function refreshEprel() {
  const user = await requirePermission("catalog.products.write");
  const r = await refreshAll({ limit: 100, olderThanDays: 30 });
  await audit(user.id, "eprel.refresh", "EprelProduct", "*", null, r.ok ? { fetched: r.fetched, updated: r.updated } : { error: r.error });
  revalidatePath("/admin/eprel");
  return r;
}

export async function removeEprel(registrationNumber: string) {
  const user = await requirePermission("catalog.products.write");
  await db.eprelProduct.delete({ where: { registrationNumber } });
  await audit(user.id, "eprel.remove", "EprelProduct", registrationNumber, null, null);
  revalidatePath("/admin/eprel");
  return { ok: true as const };
}

/** Αντιστοίχιση με κωδικό μοντέλου (για το «Δέσε με προϊόν» και τον μελλοντικό συγχρονισμό καταλόγου). */
export async function matchEprel(model: string, brand?: string) {
  await requirePermission("catalog.products.read");
  return JSON.parse(JSON.stringify(await findByModel(model, brand))) as Awaited<ReturnType<typeof findByModel>>;
}

export async function linkEprelToProduct(productId: string, registrationNumber: string) {
  const user = await requirePermission("catalog.products.write");
  await linkProduct(productId, registrationNumber);
  await audit(user.id, "eprel.link", "EnergyLabel", productId, null, { registrationNumber });
  revalidatePath("/admin/eprel");
  return { ok: true as const };
}
