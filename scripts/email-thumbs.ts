/**
 * Μικρογραφίες email (360px JPEG σε λευκό) για ό,τι υπάρχει ήδη: φωτογραφίες προϊόντων (Media) και αρχεία της
 * βιβλιοθήκης (MediaAsset) που δεν έχουν ακόμη `emailUrl`.
 *
 * Γιατί: τα email (πελάτη, συνεργάτη, εσωτερικά) δεν μπορούν να δείξουν WebP/AVIF και δεν πρέπει να κουβαλούν
 * φωτογραφίες 1920px για να τις εμφανίσουν σε 64px. Η μετατροπή γίνεται μία φορά εδώ, όχι σε κάθε αποστολή.
 *
 * Τρέξε:  npx tsx --conditions=react-server scripts/email-thumbs.ts [--dry] [--limit 500] [--concurrency 6] [--all]
 * Από προεπιλογή πιάνει ΜΟΝΟ την πρώτη ορατή φωτογραφία κάθε προϊόντος — μόνο αυτή μπαίνει στα email.
 * Πρώτα το SQL: prisma/sql/2026-11-14-media-email-url.sql
 *
 * Ασφάλεια: γράφει ΜΟΝΟ νέα αρχεία `*.email.jpg` δίπλα στα υπάρχοντα και συμπληρώνει τη στήλη `emailUrl`.
 * Καμία εικόνα δεν αντικαθίσταται, κανένα αρχείο δεν σβήνεται. Ξανατρέχει άφοβα: πιάνει μόνο ό,τι λείπει.
 */
try { process.loadEnvFile(); } catch {}
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { db } from "../lib/db";
import { emailThumbOf } from "../lib/media/process";
import { getBunny } from "../lib/media/cdn";
import { emailThumbPath as emailPath, relOfCdnUrl } from "../lib/media/cdn-path";
import { bunnyUploader } from "../lib/catalog/image-import";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? undefined : process.argv[i + 1]?.startsWith("--") || process.argv[i + 1] === undefined ? "true" : process.argv[i + 1]; };
const DRY = !!arg("dry");
const ALL = !!arg("all"); // και δεύτερες φωτογραφίες και banners χαρακτηριστικών — τα email δεν τα δείχνουν
const LIMIT = Number(arg("limit")) || Infinity;
const CONCURRENCY = Math.min(12, Math.max(1, Number(arg("concurrency")) || 6));
const PUBLIC = path.join(process.cwd(), "public");


/** Τα bytes της εικόνας: από το CDN (μόνο από τον ρυθμισμένο host) ή από τοπικό αρχείο μέσα στο public. */
async function bytesOf(url: string, cdnUrl: string): Promise<Buffer> {
  if (url.startsWith("/")) {
    const abs = path.normalize(path.join(PUBLIC, url));
    if (!abs.startsWith(PUBLIC + path.sep)) throw new Error("διαδρομή εκτός public");
    return readFile(abs);
  }
  if (!cdnUrl || !url.startsWith(`${cdnUrl}/`)) throw new Error("η εικόνα δεν είναι στο CDN μας");
  // λίγες διαδρομές του CDN απαντούν αργά (ώσπου να «ζεσταθούν»): 45″ αντί 20″ έσωσε 27 στις 34 αποτυχίες
  const r = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(45000) });
  if (!r.ok) throw new Error(`λήψη HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

const SQL_FILE = "prisma/sql/2026-11-14-media-email-url.sql";

/** Η στήλη μπαίνει με το SQL του φακέλου prisma/sql (δεν τρέχουμε migrations σε αυτή τη βάση). */
async function columnReady() {
  const rows = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM information_schema.columns WHERE table_name = 'Media' AND column_name = 'emailUrl'`;
  return Number(rows[0]?.n ?? 0) > 0;
}

async function main() {
  if (!(await columnReady())) {
    console.error(`Λείπει η στήλη «Media.emailUrl» από τη βάση. Τρέξε πρώτα το SQL και ξαναδοκίμασε:\n\n  npx prisma db execute --file ${SQL_FILE} --schema prisma/schema.prisma\n`);
    process.exit(1);
  }
  const b = await getBunny();
  const cdnUrl = b.cdnUrl;
  const put = b.enabled ? await bunnyUploader() : null;

  // 1. Φωτογραφίες που κρέμονται από αρχείο της βιβλιοθήκης: η μικρογραφία υπάρχει ήδη — αρκεί να την δείξουμε
  // ένα ερώτημα, όχι ένα ανά γραμμή: οι ~4.000 μεμονωμένες ενημερώσεις κρατούσαν λεπτά σε απομακρυσμένη βάση
  const copied = DRY
    ? await db.media.count({ where: { emailUrl: null, assetId: { not: null }, asset: { emailUrl: { not: null } } } })
    : await db.$executeRaw`UPDATE "Media" m SET "emailUrl" = a."emailUrl" FROM "MediaAsset" a WHERE m."assetId" = a.id AND m."emailUrl" IS NULL AND a."emailUrl" IS NOT NULL`;
  console.log(`Από τη βιβλιοθήκη (χωρίς μετατροπή): ${copied.toLocaleString("el-GR")}${DRY ? " — ΔΟΚΙΜΗ" : ""}`);

  // 2. Ό,τι μένει: μετατροπή από την ίδια την εικόνα
  type Job = { kind: "media" | "asset"; id: string; url: string; rel: string | null };
  // Προεπιλογή: μόνο η ΠΡΩΤΗ ορατή φωτογραφία κάθε προϊόντος — αυτή και μόνο μπαίνει στα email (9.807 αντί 80.376,
  // από τις οποίες 38.033 είναι banners χαρακτηριστικών που δεν εμφανίζονται ποτέ σε email). `--all` για όλες.
  const ids = ALL
    ? null
    : (await db.$queryRaw<{ id: string }[]>`
        SELECT id FROM (
          SELECT DISTINCT ON ("productId") id, "emailUrl"
          FROM "Media" WHERE kind = 'image' AND hidden = false
          ORDER BY "productId", "sortNo" ASC, id ASC
        ) t WHERE "emailUrl" IS NULL`).map((r) => r.id);
  const media = await db.media.findMany({ where: ids ? { id: { in: ids } } : { emailUrl: null, kind: { in: ["image", "banner"] } }, select: { id: true, url: true }, orderBy: { id: "asc" } });
  const assets = await db.mediaAsset.findMany({ where: { emailUrl: null, kind: "image" }, select: { id: true, url: true, path: true }, orderBy: { id: "asc" } });
  let jobs: Job[] = [
    ...media.map((m) => ({ kind: "media" as const, id: m.id, url: m.url, rel: null })),
    ...assets.map((a) => ({ kind: "asset" as const, id: a.id, url: a.url, rel: a.path })),
  ];
  console.log(`Προς μετατροπή: ${jobs.length.toLocaleString("el-GR")} (φωτογραφίες προϊόντων ${media.length.toLocaleString("el-GR")}${ALL ? " — ΟΛΕΣ, μαζί με banners" : " — πρώτη κάθε προϊόντος"} · βιβλιοθήκη ${assets.length.toLocaleString("el-GR")})`);
  if (jobs.length > LIMIT) jobs = jobs.slice(0, LIMIT);
  if (DRY) {
    console.log("ΔΟΚΙΜΗ — δεν γράφεται τίποτα. Δείγμα:", jobs.slice(0, 5).map((j) => j.url).join("\n  "));
    return;
  }
  if (!jobs.length) { console.log("Τίποτα να κάνω."); return; }

  const t0 = Date.now();
  let ok = 0, failed = 0, next = 0, bytes = 0;
  const errors = new Map<string, number>();
  const worker = async () => {
    for (;;) {
      const j = jobs[next++];
      if (!j) return;
      try {
        const src = await bytesOf(j.url, cdnUrl);
        const jpg = await emailThumbOf(src);
        let url: string;
        if (j.url.startsWith("/")) {
          const abs = emailPath(path.join(PUBLIC, j.url));
          await mkdir(path.dirname(abs), { recursive: true });
          await writeFile(abs, jpg);
          url = emailPath(j.url);
        } else {
          if (!put) throw new Error("το Bunny CDN δεν είναι ενεργό");
          const rel = emailPath(j.rel ?? relOfCdnUrl(j.url, cdnUrl, b.basePath));
          url = await put(rel, jpg);
        }
        if (j.kind === "media") await db.media.update({ where: { id: j.id }, data: { emailUrl: url } });
        else await db.mediaAsset.update({ where: { id: j.id }, data: { emailUrl: url } });
        ok++; bytes += jpg.length;
      } catch (e) {
        failed++;
        const msg = (e as Error).message.slice(0, 80);
        errors.set(msg, (errors.get(msg) ?? 0) + 1);
      }
      if ((ok + failed) % 200 === 0) {
        const s = (Date.now() - t0) / 1000;
        console.log(`  ${ok + failed}/${jobs.length} · ${failed} σφάλματα · ${Math.round(((ok + failed) / s) * 60)} /λεπτό · απομένουν ~${Math.round(((jobs.length - ok - failed) / Math.max(1, ok + failed)) * s / 60)} λεπτά`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`Έτοιμο: ${ok.toLocaleString("el-GR")} μικρογραφίες (${(bytes / 1048576).toFixed(1)} MB, μέσος όρος ${ok ? Math.round(bytes / ok / 1024) : 0} KB) · σφάλματα ${failed} · ${Math.round((Date.now() - t0) / 1000)} s`);
  for (const [m, n] of [...errors].sort((a, b) => b[1] - a[1]).slice(0, 5)) console.log(`  ${n}× ${m}`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
