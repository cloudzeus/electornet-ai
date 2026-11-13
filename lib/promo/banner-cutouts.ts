import "server-only";
import sharp from "sharp";
import { db } from "@/lib/db";
import { ingest } from "@/lib/media/repo";
import { removeBackground } from "@/lib/media/process";

/**
 * Φωτογραφίες προϊόντων ΧΩΡΙΣ φόντο για τα σχεδιασμένα banners: μία ανά προϊόν, στη βιβλιοθήκη media (φάκελος
 * «Προϊόντα χωρίς φόντο», αρχείο «cutout-<id προϊόντος>.png»). Φτιάχνονται ΜΙΑ φορά, όταν αποθηκεύεται το banner —
 * ποτέ τη στιγμή που φορτώνει η σελίδα του πελάτη (~2″ και ~0,9 GB η καθεμία). Όποιο προϊόν δεν έχει, μπαίνει σε λευκό πλαίσιο.
 */
const FOLDER = "Προϊόντα χωρίς φόντο";
const fileOf = (id: string) => `cutout-${id}.png`;

export async function bannerCutouts(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await db.mediaAsset.findMany({ where: { filename: { in: ids.map(fileOf) } }, select: { filename: true, url: true } });
  return new Map(rows.map((r) => [r.filename.slice(7, -4), r.url]));
}

/** Φτιάχνει όσες λείπουν. Επιστρέφει πόσες έγιναν και όσες απέτυχαν (το banner δουλεύει και χωρίς αυτές). */
export async function ensureBannerCutouts(ids: string[], by: string | null): Promise<{ made: number; failed: string[] }> {
  const have = await bannerCutouts(ids);
  const todo = [...new Set(ids)].filter((id) => !have.has(id));
  if (!todo.length) return { made: 0, failed: [] };
  const folder = (await db.mediaFolder.findFirst({ where: { name: FOLDER, parentId: null } })) ?? (await db.mediaFolder.create({ data: { name: FOLDER } }));
  const products = await db.product.findMany({ where: { id: { in: todo } }, select: { id: true, title: true, media: { where: { hidden: false, kind: "image" }, orderBy: { sortNo: "asc" }, take: 1, select: { url: true } } } });
  let made = 0;
  const failed: string[] = [];
  for (const p of products) {
    try {
      const src = p.media[0]?.url;
      if (!src?.startsWith("https://")) throw new Error("χωρίς φωτογραφία");
      const res = await fetch(src, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`λήψη ${res.status}`);
      // κομμένο γύρω από το προϊόν και έως 900 px: στο banner φαίνεται το πολύ ~300 px
      const png = await sharp(await removeBackground(Buffer.from(await res.arrayBuffer()))).trim().resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true }).png().toBuffer();
      await ingest({ bytes: png, filename: fileOf(p.id), mime: "image/png", folderId: folder.id, createdBy: by, keepFormat: true, title: `${p.title} · χωρίς φόντο` });
      made++;
    } catch (e) { failed.push(`${p.title}: ${e instanceof Error ? e.message : "σφάλμα"}`); }
  }
  return { made, failed };
}
