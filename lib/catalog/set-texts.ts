import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/rbac/audit";

/**
 * Κείμενα προϊόντος-σετ. Το σετ δεν έχει δικό του είδος (MTRL) στο SoftOne — είναι «Set ειδών» (SPCS) — άρα τα κείμενά
 * του ζουν μόνο στη βάση του eshop. Ο συγχρονισμός των σετ αλλάζει μόνο τιμή, απόθεμα, κατηγορία, όχι αυτά.
 */
export interface SetTexts { title?: string | null; summary?: string | null; description?: string | null }
const LIMIT = { title: 200, summary: 4000, description: 20000 } as const;
const LABEL = { title: "Όνομα", summary: "Σύντομη περιγραφή", description: "Αναλυτική περιγραφή" } as const;

export async function isSetProduct(productId: string) {
  return (await db.product.findUnique({ where: { id: productId }, select: { kind: true } }))?.kind === "set";
}

export async function saveSetTexts(productId: string, userId: string, t: SetTexts): Promise<{ ok: boolean; message: string; written: string[] }> {
  const p = await db.product.findUnique({ where: { id: productId }, select: { kind: true, title: true, summary: true, description: true } });
  if (p?.kind !== "set") return { ok: false, message: "Δεν είναι προϊόν-σετ.", written: [] };
  const data: { title?: string; summary?: string | null; description?: string | null } = {};
  for (const k of ["title", "summary", "description"] as const) {
    if (t[k] === undefined) continue;
    const v = String(t[k] ?? "").replace(/\r\n?/g, "\n").trim();
    if (k === "title" && v.length < 3) return { ok: false, message: "Το όνομα θέλει τουλάχιστον 3 χαρακτήρες.", written: [] };
    if (v.length > LIMIT[k]) return { ok: false, message: `${LABEL[k]}: έως ${LIMIT[k].toLocaleString("el-GR")} χαρακτήρες.`, written: [] };
    const next = v || null;
    if (next === (p[k] ?? null)) continue;
    if (k === "title") data.title = v; else data[k] = next;
  }
  const written = Object.keys(data) as (keyof SetTexts)[];
  if (!written.length) return { ok: true, message: "Καμία αλλαγή για αποθήκευση.", written: [] };
  await db.product.update({ where: { id: productId }, data });
  await audit(userId, "catalog.set.texts", "Product", productId, Object.fromEntries(written.map((k) => [k, p[k]])), data);
  const { resetCatalogCache } = await import("@/lib/data/db-catalog");
  resetCatalogCache();
  const { projectPublishReady } = await import("@/lib/catalog/publish-ready-server");
  await projectPublishReady([productId]);
  return { ok: true, message: `Αποθηκεύτηκε στο eshop: ${written.map((k) => LABEL[k]).join(", ")}.`, written };
}
