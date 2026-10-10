"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { inspectGlb, autoRotationY } from "@/lib/ar/custom";
import { dimsFor } from "@/lib/data/dims";
import { getProductsByIds } from "@/lib/data/repo";
import { arPlan } from "@/lib/ar/plan";
import { getArCategories } from "@/lib/ar/categories";
import { invalidateArIndex } from "@/lib/ar/index";
import { forgetArLookup } from "@/lib/ar/serve";
import { readAsset } from "@/lib/ar/serve";

/** Μετά από κάθε αλλαγή: νέα απόφαση στη σελίδα, στον server των μοντέλων και στα φίλτρα της διαχείρισης */
/**
 * Η πρώτη ρύθμιση ενός προϊόντος (όψη, επιφάνεια, προσαρμογή, USDZ) δημιουργεί τη γραμμή ProductAr. Το AR μένει όπως ήταν:
 * ενεργό αν ήταν αυτόματα ενεργό — αλλιώς μια απλή ρύθμιση θα το έκλεινε, αφού ρητή γραμμή σημαίνει «ισχύει το enabled της».
 */
async function autoEnabled(productId: string) {
  const [[p], cats] = await Promise.all([getProductsByIds([productId]), getArCategories()]);
  return p ? arPlan(p, null, cats).on : false;
}

const paths = (productId: string) => { invalidateArIndex(); forgetArLookup(productId); revalidatePath("/admin/ar"); revalidatePath(`/proion`); };

/** Ενεργοποίηση / απενεργοποίηση του AR για ένα προϊόν. */
export async function setArEnabled(productId: string, enabled: boolean) {
  const user = await requirePermission("catalog.products.write");
  await db.productAr.upsert({ where: { productId }, update: { enabled, updatedById: user.id }, create: { productId, enabled, updatedById: user.id } });
  await audit(user.id, enabled ? "ar.enable" : "ar.disable", "ProductAr", productId, null, null);
  paths(productId);
  return { ok: true as const };
}

export async function setArFit(productId: string, fitToDims: boolean, fitMode: "box" | "height" = "box") {
  const user = await requirePermission("catalog.products.write");
  await db.productAr.upsert({ where: { productId }, update: { fitToDims, fitMode, updatedById: user.id }, create: { productId, enabled: await autoEnabled(productId), fitToDims, fitMode, updatedById: user.id } });
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
    const [prod] = await getProductsByIds([productId]);
    const rotationY = autoRotationY(info.box, prod ? dimsFor(prod) : null);
    // Μοντέλο κατασκευαστή: ακριβείς αναλογίες, κλίμακα μόνο από το ύψος
    await db.productAr.upsert({ where: { productId }, update: { glbUrl: asset.url, glbAssetId: asset.id, modelBox: info.box as unknown as Prisma.InputJsonValue, rotationY, source: "upload", fitMode: "height", enabled: true, updatedById: user.id }, create: { productId, glbUrl: asset.url, glbAssetId: asset.id, modelBox: info.box as unknown as Prisma.InputJsonValue, rotationY, source: "upload", fitMode: "height", enabled: true, updatedById: user.id } });
    await audit(user.id, "ar.model.attach", "ProductAr", productId, null, { kind, filename: asset.filename, box: info.box, meshes: info.meshes });
    paths(productId);
    return { ok: true as const, box: info.box, meshes: info.meshes };
  }
  if (!/\.usdz$/i.test(asset.filename)) return { ok: false as const, error: "Για το iPhone χρειάζεται αρχείο .usdz." };
  await db.productAr.upsert({ where: { productId }, update: { usdzUrl: asset.url, usdzAssetId: asset.id, updatedById: user.id }, create: { productId, enabled: await autoEnabled(productId), usdzUrl: asset.url, usdzAssetId: asset.id, updatedById: user.id } });
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

/** Η φωτογραφία που γεμίζει την πρόσοψη του στερεού όταν δεν υπάρχει 3D μοντέλο. null = αυτόματα η πιο μετωπική. */
export async function setArFrontImage(productId: string, frontImage: string | null) {
  const user = await requirePermission("catalog.products.write");
  await db.productAr.upsert({ where: { productId }, update: { frontImage, updatedById: user.id }, create: { productId, enabled: await autoEnabled(productId), frontImage, updatedById: user.id } });
  await audit(user.id, "ar.front-image", "ProductAr", productId, null, { frontImage });
  paths(productId);
  return { ok: true as const };
}

/** Πάτωμα, έπιπλο, πάγκος, τοίχος ή αυτόματα από το προφίλ της κατηγορίας. */
export async function setArPlacement(productId: string, placement: "floor" | "furniture" | "counter" | "wall" | null) {
  const user = await requirePermission("catalog.products.write");
  if (placement && !["floor", "furniture", "counter", "wall"].includes(placement)) throw new Error("Άγνωστη επιφάνεια.");
  await db.productAr.upsert({ where: { productId }, update: { placement, updatedById: user.id }, create: { productId, enabled: await autoEnabled(productId), placement, updatedById: user.id } });
  await audit(user.id, "ar.placement", "ProductAr", productId, null, { placement });
  paths(productId);
  return { ok: true as const };
}

/** Περιστροφή του μοντέλου κατά 90° (όταν η αυτόματη επιλογή δεν πέτυχε την πρόσοψη). */
export async function rotateArModel(productId: string, delta: 90 | -90) {
  const user = await requirePermission("catalog.products.write");
  const cur = await db.productAr.findUnique({ where: { productId }, select: { rotationY: true } });
  const rotationY = (((cur?.rotationY ?? 0) + delta) % 360 + 360) % 360;
  await db.productAr.update({ where: { productId }, data: { rotationY, updatedById: user.id } });
  paths(productId);
  return { ok: true as const, rotationY };
}

/** Ποιες κατηγορίες συμμετέχουν στο AR (slug → ναι/όχι· ό,τι λείπει = αυτόματο). Ισχύει αμέσως σε site, μοντέλα και λίστα. */
export async function saveArCategoriesAction(choices: Record<string, boolean>) {
  const user = await requirePermission("catalog.products.write");
  const { catalogTree } = await import("@/lib/data/db-catalog");
  const { saveArCategories } = await import("@/lib/ar/categories");
  const known = (await catalogTree()).bySlug;
  const clean = Object.fromEntries(Object.entries(choices).filter(([k, v]) => known.has(k) && typeof v === "boolean"));
  const prev = await saveArCategories(clean, user.id);
  await audit(user.id, "ar.categories", "Setting", "ar.categories", prev, clean);
  invalidateArIndex(); forgetArLookup();
  revalidatePath("/admin/ar"); revalidatePath("/proion/[slug]", "page");
  return { ok: true as const, count: Object.keys(clean).length };
}
