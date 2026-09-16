"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { inspectGlb, autoRotationY } from "@/lib/ar/custom";
import { dimsFor } from "@/lib/data/dims";
import { products } from "@/lib/data/fixtures/products";
import { readAsset } from "@/lib/ar/serve";
import { startGeneration, advanceGeneration } from "@/lib/ar/generate";

const paths = (productId: string) => { revalidatePath("/admin/ar"); revalidatePath(`/proion`); void productId; };

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
  await db.productAr.upsert({ where: { productId }, update: { fitToDims, fitMode, updatedById: user.id }, create: { productId, fitToDims, fitMode, updatedById: user.id } });
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
    const prod = products.find((x) => x.id === productId);
    const rotationY = autoRotationY(info.box, prod ? dimsFor(prod) : null);
    // Μοντέλο κατασκευαστή: ακριβείς αναλογίες, κλίμακα μόνο από το ύψος
    await db.productAr.upsert({ where: { productId }, update: { glbUrl: asset.url, glbAssetId: asset.id, modelBox: info.box as unknown as Prisma.InputJsonValue, rotationY, source: "upload", fitMode: "height", enabled: true, updatedById: user.id }, create: { productId, glbUrl: asset.url, glbAssetId: asset.id, modelBox: info.box as unknown as Prisma.InputJsonValue, rotationY, source: "upload", fitMode: "height", enabled: true, updatedById: user.id } });
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

/** 3D από φωτογραφία με το Tripo3D: ξεκινά τη δημιουργία και επιστρέφει την εγγραφή για παρακολούθηση. */
export async function generateArModel(productId: string, imageUrl: string, views: { left?: string; back?: string; right?: string } = {}) {
  const user = await requirePermission("catalog.products.write");
  const g = await startGeneration(productId, imageUrl, user.id, views);
  await audit(user.id, "ar.generate.start", "ArGeneration", g.id, null, { productId, imageUrl, status: g.status, error: g.error });
  paths(productId);
  return JSON.parse(JSON.stringify(g)) as typeof g;
}

/** Η οθόνη ρωτά κάθε λίγα δευτερόλεπτα· κάθε κλήση προχωρά τη ροή κατά ένα βήμα. */
export async function pollArGeneration(genId: string) {
  await requirePermission("catalog.products.read");
  const g = await advanceGeneration(genId);
  if (g && (g.status === "done" || g.status === "failed")) paths(g.productId);
  return g ? (JSON.parse(JSON.stringify(g)) as typeof g) : null;
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
