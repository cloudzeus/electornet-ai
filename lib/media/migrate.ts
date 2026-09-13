import "server-only";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { activeStorage } from "./storage";
import { uploadToStorage } from "./cdn";

const LOCAL_ROOT = path.join(process.cwd(), "public", "uploads");
const relOf = (url: string | null) => (url && url.startsWith("/uploads/") ? url.slice("/uploads/".length) : null);
const mimeOf = (rel: string) => (rel.endsWith(".webp") ? "image/webp" : rel.endsWith(".jpg") ? "image/jpeg" : rel.endsWith(".png") ? "image/png" : rel.endsWith(".mp3") ? "audio/mpeg" : rel.endsWith(".wav") ? "audio/wav" : rel.endsWith(".mp4") ? "video/mp4" : rel.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream");

/** How many rows still point to public/uploads. */
export async function localCount() {
  const [m, v] = await Promise.all([db.mediaAsset.count({ where: { storage: "local" } }), db.voicePhrase.count({ where: { storage: "local" } })]);
  return { media: m, voice: v };
}

/**
 * Move everything stored locally (media assets with their thumb/email
 * variants, cached voice phrases) to Bunny Storage and repoint the rows to
 * the pull zone. Local copies are removed after a successful upload. Safe to
 * re-run: only rows with storage="local" are touched.
 */
export async function migrateLocalToCdn(): Promise<{ media: number; voice: number; failed: string[] }> {
  const { storage } = await activeStorage();
  if (storage !== "bunny") throw new Error("Το Bunny CDN δεν είναι ενεργό.");
  const failed: string[] = [];
  const up = async (rel: string) => { const bytes = await readFile(path.join(LOCAL_ROOT, rel)); const url = await uploadToStorage(rel, bytes, mimeOf(rel)); return url; };
  let media = 0, voice = 0;
  for (const a of await db.mediaAsset.findMany({ where: { storage: "local" } })) {
    try {
      const url = await up(a.path);
      const tRel = relOf(a.thumbUrl), eRel = relOf(a.emailUrl);
      const thumbUrl = tRel ? await up(tRel) : a.thumbUrl;
      const emailUrl = eRel ? await up(eRel) : a.emailUrl;
      await db.mediaAsset.update({ where: { id: a.id }, data: { storage: "bunny", url, thumbUrl, emailUrl } });
      for (const rel of [a.path, tRel, eRel]) if (rel) await unlink(path.join(LOCAL_ROOT, rel)).catch(() => null);
      media++;
    } catch (e) { failed.push(`${a.filename}: ${(e as Error).message}`); }
  }
  for (const p of await db.voicePhrase.findMany({ where: { storage: "local" } })) {
    try {
      const url = await up(p.path);
      await db.voicePhrase.update({ where: { id: p.id }, data: { storage: "bunny", url } });
      await unlink(path.join(LOCAL_ROOT, p.path)).catch(() => null);
      voice++;
    } catch (e) { failed.push(`φράση ${p.key ?? p.id}: ${(e as Error).message}`); }
  }
  return { media, voice, failed };
}
