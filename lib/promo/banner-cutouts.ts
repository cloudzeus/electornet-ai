import "server-only";
import sharp from "sharp";
import { db } from "@/lib/db";
import { destroy, ingest } from "@/lib/media/repo";
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

const SRC = { id: true, title: true, media: { where: { hidden: false, kind: "image" }, orderBy: { sortNo: "asc" }, take: 1, select: { url: true } } } as const;
const folderId = async () => ((await db.mediaFolder.findFirst({ where: { name: FOLDER, parentId: null } })) ?? (await db.mediaFolder.create({ data: { name: FOLDER } }))).id;

/** Η κύρια φωτογραφία χωρίς φόντο, κομμένη γύρω από το προϊόν και έως 900 px (στο banner φαίνεται το πολύ ~300 px)· `clean` = πέρασε τη δικλείδα ποιότητας. */
async function cutOne(src: string | undefined): Promise<{ png: Buffer; clean: boolean }> {
  if (!src?.startsWith("https://")) throw new Error("χωρίς φωτογραφία");
  const res = await fetch(src, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`λήψη ${res.status}`);
  const orig = Buffer.from(await res.arrayBuffer());
  const cut = await removeBackground(orig);
  const clean = await keptEnough(orig, cut);
  return { png: await sharp(cut).trim().resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true }).png().toBuffer(), clean };
}

/** Φτιάχνει όσες λείπουν. Επιστρέφει πόσες έγιναν και όσες απέτυχαν (το banner δουλεύει και χωρίς αυτές). */
export async function ensureBannerCutouts(ids: string[], by: string | null): Promise<{ made: number; failed: string[] }> {
  const have = await bannerCutouts(ids);
  const todo = [...new Set(ids)].filter((id) => !have.has(id));
  if (!todo.length) return { made: 0, failed: [] };
  const folder = await folderId();
  const products = await db.product.findMany({ where: { id: { in: todo } }, select: SRC });
  let made = 0;
  const failed: string[] = [];
  for (const p of products) {
    try {
      const { png, clean } = await cutOne(p.media[0]?.url);
      if (!clean) throw new Error("η αφαίρεση φόντου έσβησε μέρος του προϊόντος — μένει η φωτογραφία του καταλόγου");
      await ingest({ bytes: png, filename: fileOf(p.id), mime: "image/png", folderId: folder, createdBy: by, keepFormat: true, title: `${p.title} · χωρίς φόντο` });
      made++;
    } catch (e) { failed.push(`${p.title}: ${e instanceof Error ? e.message : "σφάλμα"}`); }
  }
  return { made, failed };
}

/**
 * Με το χέρι: ο διαχειριστής βλέπει το αποτέλεσμα και επιβεβαιώνει, άρα εδώ η δικλείδα ποιότητας μόνο προειδοποιεί (`clean`).
 * Προεπισκόπηση και αποθήκευση δουλεύουν το ίδιο αποτέλεσμα, μία φορά (~2″ και ~0,9 GB η αφαίρεση).
 */
const manual = new Map<string, Promise<{ png: Buffer; clean: boolean; title: string; original: string | null }>>();
export function manualCutout(productId: string) {
  let p = manual.get(productId);
  if (!p) {
    p = (async () => {
      const row = await db.product.findUnique({ where: { id: productId }, select: SRC });
      if (!row) throw new Error("το προϊόν δεν βρέθηκε");
      return { ...(await cutOne(row.media[0]?.url)), title: row.title, original: row.media[0]?.url ?? null };
    })();
    p.catch(() => manual.delete(productId));
    manual.set(productId, p);
    if (manual.size > 12) manual.delete(manual.keys().next().value!);
  }
  return p;
}

/** Αποθηκεύει ό,τι επιβεβαίωσε ο διαχειριστής, στη θέση της προηγούμενης φωτογραφίας χωρίς φόντο του προϊόντος (αν υπάρχει). */
export async function saveManualCutout(productId: string, by: string | null): Promise<string> {
  const c = await manualCutout(productId);
  const prev = await db.mediaAsset.findFirst({ where: { filename: fileOf(productId) }, select: { id: true } });
  const a = await ingest({ bytes: c.png, filename: fileOf(productId), mime: "image/png", folderId: await folderId(), createdBy: by, replaceId: prev?.id, keepFormat: true, title: `${c.title} · χωρίς φόντο` });
  manual.delete(productId);
  return a.url;
}

/** Το προϊόν γυρίζει στη φωτογραφία του καταλόγου (λευκό πλαίσιο στα banners). */
export async function removeCutout(productId: string) {
  const rows = await db.mediaAsset.findMany({ where: { filename: fileOf(productId) }, select: { id: true } });
  if (rows.length) await destroy(rows.map((r) => r.id));
  manual.delete(productId);
}
