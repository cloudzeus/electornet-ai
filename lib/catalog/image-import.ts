import "server-only";
import sharp from "sharp";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getBunny } from "@/lib/media/cdn";
import { bareKey, modelKey } from "./image-files";

/**
 * Φωτογραφίες προϊόντων από τον φάκελο του παλιού site, σε δύο ανεξάρτητα βήματα:
 *
 * 1. **Ανέβασμα** (scripts/import-product-images.ts — τρέχει στο μηχάνημα που βλέπει
 *    τον φάκελο): αρχείο → WebP ≤ 1600px + μικρογραφία 480px → Bunny Storage, με μία
 *    γραμμή στο `ImageImport`. Ξανατρέχει με ασφάλεια: ό,τι είναι `done` με ίδιο μέγεθος
 *    πηγής παραλείπεται.
 * 2. **Αντιστοίχιση** (`associateImages`, μόνο βάση): `ImageImport` → `Media` του προϊόντος.
 *    Τρέχει μετά από κάθε προβολή του καταλόγου, οπότε ένα νέο είδος παίρνει τις
 *    φωτογραφίες του χωρίς νέο ανέβασμα.
 *
 * Η σύνθεση της εικόνας δεν αλλάζει (ούτε κάδρο, ούτε φόντο): το 40 % είναι τετράγωνες
 * σε λευκό, οι υπόλοιπες lifestyle / λεπτομέρειες με δικές τους αναλογίες.
 */
export const IMAGE_SOURCE = "legacy-site";
export const MAIN_MAX = 1600, THUMB = 480, LOW_RES = 600;

export interface ProcessedProductImage { main: Buffer; thumb: Buffer; blur: string; width: number; height: number; lowRes: boolean }

export async function processProductImage(input: Buffer): Promise<ProcessedProductImage> {
  const src = await sharp(input).metadata();
  // rotate(): εφαρμόζει τον προσανατολισμό EXIF πριν χαθούν τα metadata· το ICC προφίλ μετατρέπεται σε sRGB
  const main = await sharp(input).rotate().resize({ width: MAIN_MAX, height: MAIN_MAX, fit: "inside", withoutEnlargement: true }).toColourspace("srgb").webp({ quality: 82, effort: 4 }).toBuffer();
  const meta = await sharp(main).metadata();
  const thumb = await sharp(main).resize({ width: THUMB, height: THUMB, fit: "inside", withoutEnlargement: true }).webp({ quality: 78, effort: 4 }).toBuffer();
  const blur = `data:image/webp;base64,${(await sharp(main).resize(16, 16, { fit: "inside" }).webp({ quality: 40 }).toBuffer()).toString("base64")}`;
  return { main, thumb, blur, width: meta.width ?? 0, height: meta.height ?? 0, lowRes: Math.max(src.width ?? 0, src.height ?? 0) < LOW_RES };
}

/** Ένας uploader με τις ρυθμίσεις διαβασμένες μία φορά (το `uploadToStorage` τις ξαναδιαβάζει σε κάθε κλήση — ακριβό για 67.000 αρχεία) και τρεις προσπάθειες. */
export async function bunnyUploader() {
  const b = await getBunny();
  if (!b.enabled || !b.zone || !b.storagePassword || !b.cdnUrl) throw new Error("Το Bunny CDN δεν είναι ενεργό ή δεν έχει ρυθμιστεί (Ρυθμίσεις → Bunny CDN).");
  return async (rel: string, body: Buffer): Promise<string> => {
    const enc = rel.split("/").map(encodeURIComponent).join("/");
    let last = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(`${b.storageHost}/${b.zone}${b.basePath}/${enc}`, { method: "PUT", headers: { AccessKey: b.storagePassword, "Content-Type": "image/webp" }, body: body as unknown as BodyInit });
        if (res.ok) return `${b.cdnUrl}${b.basePath}/${enc}`;
        last = `HTTP ${res.status}`;
        if (res.status === 401 || res.status === 403) break; // λάθος κλειδί: δεν έχει νόημα η επανάληψη
      } catch (e) { last = (e as Error).message; }
      await new Promise((r) => setTimeout(r, 600 * attempt));
    }
    throw new Error(`Bunny upload ${last}`);
  };
}

// ---------- Αντιστοίχιση ----------

export interface KeyMatch { mtrls: number[]; by: "barcode" | "code" | "model" }

/** Κλειδί αρχείου → είδη του SoftOne: barcode, μετά κωδικός είδους, μετά το μοντέλο μέσα στο όνομα (μόνο αν δείχνει σε 1–2 είδη). */
export async function matchKeys(groups: { key: string; model: string }[]): Promise<Map<string, KeyMatch>> {
  const items = await db.s1Item.findMany({ select: { mtrl: true, code: true, name: true, barcode: true } });
  const byBarcode = new Map<string, number[]>(), byCode = new Map<string, number[]>();
  for (const it of items) {
    if (it.barcode?.trim()) { const k = bareKey(it.barcode); byBarcode.set(k, [...(byBarcode.get(k) ?? []), it.mtrl]); }
    const c = bareKey(it.code); byCode.set(c, [...(byCode.get(c) ?? []), it.mtrl]);
  }
  const names = items.map((it) => ({ mtrl: it.mtrl, n: modelKey(it.name) }));
  const out = new Map<string, KeyMatch>();
  for (const g of groups) {
    if (out.has(g.key)) continue;
    const k = bareKey(g.key);
    const b = k ? byBarcode.get(k) : undefined, c = k ? byCode.get(k) : undefined;
    if (b) { out.set(g.key, { mtrls: b, by: "barcode" }); continue; }
    if (c) { out.set(g.key, { mtrls: c, by: "code" }); continue; }
    const m = modelKey(g.model);
    if (m.length >= 6) { const hit = names.filter((x) => x.n.includes(m)); if (hit.length >= 1 && hit.length <= 2) out.set(g.key, { mtrls: hit.map((h) => h.mtrl), by: "model" }); }
  }
  return out;
}

export interface AssociateResult { files: number; keys: number; unmatchedKeys: number; products: number; created: number; updated: number; removed: number }

/** `ImageImport` (done) → `Media` των προϊόντων. Αγγίζει μόνο γραμμές με `source = legacy-site`. */
export async function associateImages(): Promise<AssociateResult> {
  const files = await db.imageImport.findMany({ where: { status: "done", url: { not: null } }, orderBy: [{ key: "asc" }, { seq: "asc" }] });
  const byKey = new Map<string, typeof files>();
  for (const f of files) byKey.set(f.key, [...(byKey.get(f.key) ?? []), f]);
  const matches = await matchKeys([...byKey.entries()].map(([key, list]) => ({ key, model: list[0].model })));

  const products = new Map((await db.product.findMany({ where: { source: "softone" }, select: { id: true, erpCode: true, title: true } })).map((p) => [p.erpCode, p]));
  const wanted = new Map<string, Prisma.MediaCreateManyInput>(); // productId|url
  const perProduct = new Map<string, number>();
  for (const [key, list] of byKey) {
    for (const mtrl of matches.get(key)?.mtrls ?? []) {
      const p = products.get(String(mtrl)); if (!p) continue;
      for (const f of list) {
        const n = (perProduct.get(p.id) ?? 0) + 1; perProduct.set(p.id, n);
        wanted.set(`${p.id}|${f.url}`, { productId: p.id, kind: "image", url: f.url!, thumbUrl: f.thumbUrl, width: f.width, height: f.height, blur: f.blur, alt: n === 1 ? p.title : `${p.title} — φωτογραφία ${n}`, sortNo: n, source: IMAGE_SOURCE, importFile: f.sourceFile });
      }
    }
  }
  const existing = await db.media.findMany({ where: { source: IMAGE_SOURCE }, select: { id: true, productId: true, url: true, sortNo: true, alt: true, thumbUrl: true } });
  const have = new Map(existing.map((m) => [`${m.productId}|${m.url}`, m]));
  const fresh = [...wanted.entries()].filter(([k]) => !have.has(k)).map(([, v]) => v);
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const [k, w] of wanted) { const e = have.get(k); if (e && (e.sortNo !== w.sortNo || e.alt !== w.alt || e.thumbUrl !== w.thumbUrl)) ops.push(db.media.update({ where: { id: e.id }, data: { sortNo: w.sortNo, alt: w.alt, thumbUrl: w.thumbUrl } })); }
  const gone = existing.filter((m) => !wanted.has(`${m.productId}|${m.url}`)).map((m) => m.id);
  for (let i = 0; i < fresh.length; i += 2000) await db.media.createMany({ data: fresh.slice(i, i + 2000), skipDuplicates: true });
  for (let i = 0; i < ops.length; i += 100) await db.$transaction(ops.slice(i, i + 100));
  for (let i = 0; i < gone.length; i += 1000) await db.media.deleteMany({ where: { id: { in: gone.slice(i, i + 1000) } } });
  return { files: files.length, keys: byKey.size, unmatchedKeys: [...byKey.keys()].filter((k) => !matches.has(k)).length, products: perProduct.size, created: fresh.length, updated: ops.length, removed: gone.length };
}

export async function imageStats() {
  const [done, failed, lowRes, bytes, media, withImages, products] = await Promise.all([
    db.imageImport.count({ where: { status: "done" } }), db.imageImport.count({ where: { status: "failed" } }), db.imageImport.count({ where: { status: "done", lowRes: true } }),
    db.imageImport.aggregate({ where: { status: "done" }, _sum: { bytes: true, srcBytes: true } }),
    db.media.count({ where: { source: IMAGE_SOURCE } }), db.product.count({ where: { source: "softone", active: true, media: { some: { kind: "image" } } } }), db.product.count({ where: { source: "softone", active: true } }),
  ]);
  return { done, failed, lowRes, webpBytes: bytes._sum.bytes ?? 0, srcBytes: bytes._sum.srcBytes ?? 0, media, withImages, products };
}
