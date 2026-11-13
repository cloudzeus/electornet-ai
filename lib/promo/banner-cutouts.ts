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

/**
 * Δικλείδα ποιότητας: σε λευκές συσκευές πάνω σε λευκό φόντο το μοντέλο σβήνει και το ίδιο το προϊόν. Συγκρίνουμε πόσο από ό,τι
 * ξεχώριζε από το φόντο στην αρχική φωτογραφία έμεινε ορατό· κάτω από 60 % (ή όταν το προϊόν βγαίνει ημιδιάφανο) η φωτογραφία απορρίπτεται και το προϊόν μένει σε λευκό πλαίσιο.
 */
async function keptEnough(orig: Buffer, cut: Buffer): Promise<boolean> {
  const N = 192, fit = { width: N, height: N, fit: "fill" as const };
  const [o, c] = await Promise.all([sharp(orig).flatten({ background: "#ffffff" }).resize(fit).removeAlpha().raw().toBuffer(), sharp(cut).resize(fit).ensureAlpha().extractChannel(3).raw().toBuffer()]);
  const bg = [o[0], o[1], o[2]];
  let content = 0, kept = 0;
  for (let i = 0; i < N * N; i++) {
    const differs = Math.abs(o[i * 3] - bg[0]) + Math.abs(o[i * 3 + 1] - bg[1]) + Math.abs(o[i * 3 + 2] - bg[2]) > 36;
    if (differs) { content++; if (c[i] > 215) kept++; }
  }
  // δεύτερος έλεγχος, στην ίδια την κομμένη εικόνα: από ό,τι φαίνεται, τουλάχιστον τα 3/4 πρέπει να είναι αδιαφανή (καλές φωτογραφίες: 80–98 %)
  let vis = 0, solid = 0;
  for (const v of c) { if (v > 24) vis++; if (v > 215) solid++; }
  if (vis && solid / vis < 0.75) return false;
  return content < N * N * 0.01 || kept / content >= 0.6;
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
      const orig = Buffer.from(await res.arrayBuffer());
      const cut = await removeBackground(orig);
      if (!(await keptEnough(orig, cut))) throw new Error("η αφαίρεση φόντου έσβησε μέρος του προϊόντος — μένει η φωτογραφία του καταλόγου");
      const png = await sharp(cut).trim().resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true }).png().toBuffer();
      await ingest({ bytes: png, filename: fileOf(p.id), mime: "image/png", folderId: folder.id, createdBy: by, keepFormat: true, title: `${p.title} · χωρίς φόντο` });
      made++;
    } catch (e) { failed.push(`${p.title}: ${e instanceof Error ? e.message : "σφάλμα"}`); }
  }
  return { made, failed };
}
