/**
 * Μαζική εισαγωγή φωτογραφιών προϊόντων: φάκελος → WebP → Bunny CDN → Media των προϊόντων.
 * Ανεβαίνει ΜΙΑ εκδοχή ανά φωτογραφία (≤ 1600px)· τα μικρότερα μεγέθη τα παράγει το <Image> του Next. Όπου το ίδιο πλάνο
 * υπάρχει σε περισσότερα μεγέθη, στο προϊόν δένεται μόνο το μεγαλύτερο (οπτικό αποτύπωμα, βλ. dedupeShots).
 *
 *   npx tsx --conditions=react-server scripts/import-product-images.ts --dir "/Volumes/home/MEGA-ELECTRIC/productImages" --dry
 *   npx tsx --conditions=react-server scripts/import-product-images.ts --dir "…" --limit 200        # δοκιμή
 *   npx tsx --conditions=react-server scripts/import-product-images.ts --dir "…"                     # όλα· ξανατρέχει με ασφάλεια
 *
 * Επιλογές: --dry (μόνο αναφορά) · --limit N (αρχεία) · --key <πρόθεμα κλειδιού> · --concurrency N (προεπιλογή 6)
 *           --force (ξανά και τα ήδη ανεβασμένα) · --all (και όσα δεν ταιριάζουν με είδος — κανονικά παραλείπονται)
 *
 * Τρέχει στο μηχάνημα που βλέπει τον φάκελο (ο server δεν βλέπει το NAS). Τα στοιχεία του Bunny
 * διαβάζονται από τις Ρυθμίσεις της εφαρμογής — κανένα κλειδί στον κώδικα ή στη γραμμή εντολών.
 */
try { process.loadEnvFile(); } catch {}
import fs from "node:fs";
import path from "node:path";
import { db } from "../lib/db";
import { parseImageName, bunnyPaths, preferNew, type ParsedImageName } from "../lib/catalog/image-files";
import { processProductImage, bunnyUploader, matchKeys, associateImages, imageStats } from "../lib/catalog/image-import";

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i === -1 ? undefined : process.argv[i + 1]?.startsWith("--") || process.argv[i + 1] === undefined ? "true" : process.argv[i + 1]; };
const DIR = arg("dir"), DRY = !!arg("dry"), FORCE = !!arg("force"), ALL = !!arg("all"), KEY = arg("key");
const LIMIT = Number(arg("limit")) || Infinity, CONCURRENCY = Math.min(16, Math.max(1, Number(arg("concurrency")) || 6));

async function main() {
  if (!DIR || DIR === "true") throw new Error('Δώσε τον φάκελο: --dir "/Volumes/…/productImages"');
  const t0 = Date.now();
  const names = fs.readdirSync(DIR).filter((n) => !n.startsWith("."));
  const every: ParsedImageName[] = [], unparsed: string[] = [];
  for (const n of names) { const p = parseImageName(n); if (p) every.push(p); else unparsed.push(n); }
  const parsed = preferNew(every);
  if (parsed.length !== every.length) console.log(`«new» λήψεις: παραλείπονται ${every.length - parsed.length} παλιότερες φωτογραφίες των ίδιων προϊόντων`);
  const matches = await matchKeys(parsed.map((p) => ({ key: p.key, model: p.model })));
  const keys = new Set(parsed.map((p) => p.key));
  const unmatched = [...keys].filter((k) => !matches.has(k));
  const by = { barcode: 0, code: 0, model: 0 }; for (const m of matches.values()) by[m.by]++;
  console.log(`Φάκελος: ${names.length.toLocaleString("el-GR")} αρχεία · ${keys.size.toLocaleString("el-GR")} κλειδιά · εκτός μοτίβου ${unparsed.length} · αντιστοίχιση: barcode ${by.barcode}, κωδικός ${by.code}, μοντέλο ${by.model}, καμία ${unmatched.length} (${Math.round((Date.now() - t0) / 1000)} s)`);
  if (unparsed.length) console.log("  εκτός μοτίβου:", unparsed.slice(0, 8).join(" | "));
  if (unmatched.length) console.log("  χωρίς είδος:", unmatched.slice(0, 12).join(" | "));

  const done = new Map((await db.imageImport.findMany({ where: { status: "done" }, select: { sourceFile: true, srcBytes: true } })).map((r) => [r.sourceFile, r.srcBytes]));
  let todo = parsed.filter((p) => (ALL || matches.has(p.key)) && (!KEY || p.key.startsWith(KEY)));
  const candidates = todo.length;
  if (!FORCE) todo = todo.filter((p) => !done.has(p.sourceFile));
  todo.sort((a, b) => a.key.localeCompare(b.key) || a.seq - b.seq);
  const pending = todo.length;
  if (todo.length > LIMIT) todo = todo.slice(0, LIMIT);
  console.log(`Προς ανέβασμα: ${todo.length.toLocaleString("el-GR")}${todo.length < pending ? ` (όριο --limit· εκκρεμούν ${pending.toLocaleString("el-GR")})` : ""} από ${candidates.toLocaleString("el-GR")} · ήδη ανεβασμένα: ${(candidates - pending).toLocaleString("el-GR")}${DRY ? " — ΔΟΚΙΜΗ, δεν ανεβαίνει τίποτα" : ""}`);
  if (DRY || !todo.length) { if (!DRY) console.log("Αντιστοίχιση:", JSON.stringify(await associateImages())); console.log("Σύνολα:", JSON.stringify(await imageStats())); return; }

  const put = await bunnyUploader();
  let ok = 0, failed = 0, inBytes = 0, outBytes = 0, next = 0;
  const worker = async () => {
    for (;;) {
      const p = todo[next++]; if (!p) return;
      const base = { key: p.key, model: p.model, seq: p.seq };
      try {
        const src = fs.readFileSync(path.join(DIR, p.sourceFile));
        const img = await processProductImage(src);
        const rel = bunnyPaths(p);
        const url = await put(rel.main, img.main);
        const data = { ...base, srcBytes: src.length, status: "done", path: rel.main, url, thumbUrl: null, phash: img.phash, width: img.width, height: img.height, bytes: img.main.length, blur: img.blur, lowRes: img.lowRes, error: null };
        await db.imageImport.upsert({ where: { sourceFile: p.sourceFile }, create: { sourceFile: p.sourceFile, ...data }, update: data });
        ok++; inBytes += src.length; outBytes += img.main.length;
      } catch (e) {
        failed++;
        const error = (e as Error).message.slice(0, 300);
        await db.imageImport.upsert({ where: { sourceFile: p.sourceFile }, create: { sourceFile: p.sourceFile, ...base, srcBytes: 0, status: "failed", error }, update: { status: "failed", error } }).catch(() => {});
        if (/HTTP 40[13]/.test(error)) { console.error("Το Bunny απέρριψε το κλειδί — σταματώ."); process.exit(1); }
      }
      if ((ok + failed) % 250 === 0) { const s = (Date.now() - t0) / 1000; console.log(`  ${ok + failed}/${todo.length} · ${failed} σφάλματα · ${Math.round(((ok + failed) / s) * 60)} αρχεία/λεπτό · απομένουν ~${Math.round(((todo.length - ok - failed) / Math.max(1, ok + failed)) * s / 60)} λεπτά`); }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`Ανέβηκαν ${ok.toLocaleString("el-GR")}, σφάλματα ${failed} · ${(inBytes / 1048576).toFixed(0)} MB → ${(outBytes / 1048576).toFixed(0)} MB WebP (${inBytes ? Math.round((1 - outBytes / inBytes) * 100) : 0}% μικρότερα) · ${Math.round((Date.now() - t0) / 1000)} s`);
  console.log("Αντιστοίχιση:", JSON.stringify(await associateImages()));
  console.log("Σύνολα:", JSON.stringify(await imageStats()));
}
main().then(() => db.$disconnect()).catch(async (e) => { console.error("ΣΦΑΛΜΑ:", (e as Error).message); await db.$disconnect(); process.exit(1); });
