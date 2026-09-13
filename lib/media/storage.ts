
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { getBunny, uploadToStorage, deleteFromStorage, purge } from "./cdn";

export type Storage = "local" | "bunny";

/**
 * Where media bytes live. Bunny Storage + Pull Zone when Settings → Bunny CDN
 * is enabled and configured (production); otherwise `public/uploads` (dev).
 */
export async function activeStorage(): Promise<{ storage: Storage; notice: string | null }> {
  const b = await getBunny();
  if (b.enabled && b.zone && b.storagePassword && b.cdnUrl) return { storage: "bunny", notice: null };
  return { storage: "local", notice: "Το Bunny CDN δεν είναι ενεργό στις Ρυθμίσεις — τα αρχεία αποθηκεύονται τοπικά (public/uploads)." };
}

const LOCAL_ROOT = path.join(process.cwd(), "public", "uploads");

export async function storeBytes(rel: string, bytes: Buffer, mime: string): Promise<{ storage: Storage; url: string }> {
  const { storage } = await activeStorage();
  if (storage === "bunny") {
    const url = await uploadToStorage(rel, bytes, mime);
    return { storage, url };
  }
  const abs = path.join(LOCAL_ROOT, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, bytes);
  return { storage, url: `/uploads/${rel}` };
}

export async function removeBytes(storage: Storage, rel: string, url?: string) {
  try {
    if (storage === "bunny") {
      await deleteFromStorage(rel);
      if (url) await purge(url);
    } else await unlink(path.join(LOCAL_ROOT, rel));
  } catch {
    /* already gone */
  }
}

/** yyyy/mm/<id>-<slug>.<ext> */
export function mediaPath(id: string, filename: string, ext: string) {
  const d = new Date();
  const slug = filename.replace(/\.[^.]+$/, "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "file";
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${id}-${slug}.${ext}`;
}
