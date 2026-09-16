"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { inspectGlb } from "@/lib/ar/custom";
import { readAsset } from "@/lib/ar/serve";

const paths = (productId: string) => { revalidatePath("/admin/ar"); revalidatePath(`/proion`); void productId; };

/** Ενεργοποίηση / απενεργοποίηση του AR για ένα προϊόν. */
export async function setArEnabled(productId: string, enabled: boolean) {
  const user = await requirePermission("catalog.products.write");
  await db.productAr.upsert({ where: { productId }, update: { enabled, updatedById: user.id }, create: { productId, enabled, updatedById: user.id } });
  await audit(user.id, enabled ? "ar.enable" : "ar.disable", "ProductAr", productId, null, null);
  paths(productId);
  return { ok: true as const };
}

export async function setArFit(productId: string, fitToDims: boolean) {
  const user = await requirePermission("catalog.products.write");
  await db.productAr.upsert({ where: { productId }, update: { fitToDims, updatedById: user.id }, create: { productId, fitToDims, updatedById: user.id } });
  paths(productId);
  return { ok: true as const };
}

/**
 * Σύνδεση ανεβασμένου μοντέλου (από τη βιβλιοθήκη πολυμέσων) με το προϊόν.
 * Το GLB ελέγχεται και μετριέται, ώστε η διαχείριση να δει αν το μέγεθός
 * του ταιριάζει με τις δηλωμένες διαστάσεις.
 */
export async function attachArModel(productId: string, kind: "glb" | "usdz", asset: { id: string; url: string; filename: string }) {
  const user = await requirePermission("catalog.products.write");
  if (kind === "glb") {
    const bytes = await readAsset(asset.url);
    if (!bytes) return { ok: false as const, error: "Το αρχείο δεν διαβάστηκε από τον αποθηκευτικό χώρο." };
    const info = inspectGlb(bytes);
    if (!info.ok) return { ok: false as const, error: info.error };
    await db.productAr.upsert({ where: { productId }, update: { glbUrl: asset.url, glbAssetId: asset.id, modelBox: info.box, enabled: true, updatedById: user.id }, create: { productId, glbUrl: asset.url, glbAssetId: asset.id, modelBox: info.box, enabled: true, updatedById: user.id } });
    await audit(user.id, "ar.model.attach", "ProductAr", productId, null, { kind, filename: asset.filename, box: info.box, meshes: info.meshes });
    paths(productId);
    return { ok: true as const, box: info.box, meshes: info.meshes };
  }
  if (!/\.usdz$/i.test(asset.filename)) return { ok: false as const, error: "Για το iPhone χρειάζεται αρχείο .usdz." };
  await db.productAr.upsert({ where: { productId }, update: { usdzUrl: asset.url, usdzAssetId: asset.id, updatedById: user.id }, create: { productId, usdzUrl: asset.url, usdzAssetId: asset.id, updatedById: user.id } });
  await audit(user.id, "ar.model.attach", "ProductAr", productId, null, { kind, filename: asset.filename });
  paths(productId);
  return { ok: true as const };
}

/** Αφαίρεση δικού μας μοντέλου: το προϊόν γυρίζει στη γεννήτρια (ή σε ανενεργό). Το αρχείο μένει στη βιβλιοθήκη. */
export async function detachArModel(productId: string, kind: "glb" | "usdz") {
  const user = await requirePermission("catalog.products.write");
  await db.productAr.update({ where: { productId }, data: kind === "glb" ? { glbUrl: null, glbAssetId: null, modelBox: Prisma.DbNull, updatedById: user.id } : { usdzUrl: null, usdzAssetId: null, updatedById: user.id } }).catch(() => null);
  await audit(user.id, "ar.model.detach", "ProductAr", productId, null, { kind });
  paths(productId);
  return { ok: true as const };
}
