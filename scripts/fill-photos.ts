/**
 * Μαζική συμπλήρωση φωτογραφιών σε προϊόντα που δεν έχουν καμία — από το Icecat, τη σελίδα του κατασκευαστή, τη
 * Channel3 ή άλλα καταστήματα, με αποθήκευση στη βιβλιοθήκη και δέσιμο στο προϊόν.
 *
 *   npm run photos:fill                             # ΔΟΚΙΜΗ: τι θα αποθηκευόταν, χωρίς κανένα ανέβασμα
 *   npm run photos:fill -- --limit 20               # μόνο τα 20 πρώτα
 *   npm run photos:fill -- --only 158512            # ένα προϊόν (κωδικός / MTRL / id)
 *   npm run photos:fill -- --web 10                 # ώς 10 προϊόντα ψάχνουν στο internet (~$0,01 το καθένα)
 *   npm run photos:fill -- --limit 20 --web 10 --apply   # ΑΠΟΘΗΚΕΥΣΗ (Bunny + προϊόν)
 *   npm run photos:fill -- --hidden --web 10        # είδη με «Εξαίρεση Web» που έχουν τιμή ΚΑΙ απόθεμα (έτοιμα αν ανοίξουν)
 *
 * Η αλυσίδα υπάρχει ολόκληρη και δεν ξαναγράφεται εδώ:
 *  - `enrichProduct` (lib/catalog/enrich-run.ts) ψάχνει και αφήνει προτάσεις εικόνων στο `EnrichSuggestion`·
 *  - `approveImages` (lib/catalog/enrich-suggestions.ts) κατεβάζει, ελέγχει τύπο, περνά από `uploadProductImage` →
 *    `ingest` (WebP, μικρογραφία, blur) → Bunny και δένει τη φωτογραφία στο προϊόν με σειρά.
 * Το script διαλέγει ΠΟΙΕΣ προτάσεις αξίζουν (lib/catalog/photo-fill-core.ts) και καλεί την υπάρχουσα έγκριση.
 *
 * Προτάσεις που περιμένουν από προηγούμενο εμπλουτισμό χρησιμοποιούνται χωρίς νέα χρέωση· το `--web` αφορά μόνο
 * προϊόντα που δεν έχουν καθόλου προτάσεις.
 */
import sharp from "sharp";
import { db } from "../lib/db";
import { fetchPublicBytes } from "../lib/net/safe-fetch";
import { isProductImageUrl, blockedHost } from "../lib/catalog/enrich-core";
import { pickPhotos, MAX_PER_PRODUCT, MIN_SIDE_PX, type PhotoCandidate, type PhotoPick } from "../lib/catalog/photo-fill-core";
import { SUGGEST_SOURCE_LABEL } from "../lib/catalog/enrich-suggestions";

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const value = (name: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const num = (name: string, fallback: number) => { const v = Number(value(name)); return Number.isFinite(v) && v >= 0 ? v : fallback; };

const apply = flag("apply");
const limit = num("limit", Infinity);
const webLimit = num("web", 0);
const only = value("only");
/** «Εξαίρεση Web» στο SoftOne (active=false) αλλά με τιμή και απόθεμα: φωτογραφίες από πριν, για όταν ανοίξουν */
const hidden = flag("hidden");
const MAX_IMAGE = 25 * 1024 * 1024;
/** πόσες προτάσεις κατεβάζουμε για έλεγχο ανά προϊόν (οι πρώτες φτάνουν — θέλουμε 6) */
const PROBE_PER_PRODUCT = 10;
const PAUSE_MS = 150;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const label = (s: string) => SUGGEST_SOURCE_LABEL[s] ?? s;

/** Ενεργά προϊόντα του SoftOne (ή με --hidden τα κρυφά με τιμή και απόθεμα) χωρίς καμία ορατή φωτογραφία (τα σετ παίρνουν εικόνες από το κύριο είδος). */
async function candidates() {
  const where = only
    ? { OR: [{ id: only }, { erpCode: only }, { sku: only }] }
    : hidden
      ? { source: "softone", active: false, kind: "item", price: { gt: 0 }, stock: { gt: 0 }, media: { none: { kind: "image", hidden: false } } }
      : { source: "softone", active: true, kind: "item", media: { none: { kind: "image", hidden: false } } };
  const rows = await db.product.findMany({
    where, orderBy: { sku: "asc" },
    select: { id: true, sku: true, erpCode: true, title: true, kind: true, publishReady: true, publishMissing: true, category: { select: { name: true } } },
  });
  return rows.filter((p) => p.kind === "item");
}

/** Οι προτάσεις εικόνων που περιμένουν — δωρεάν, από προηγούμενο εμπλουτισμό. */
const pendingImages = (productId: string) =>
  db.enrichSuggestion.findMany({
    where: { productId, status: "pending", kind: "image", url: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { id: true, source: true, url: true, sourceName: true },
  });

/** Κατέβασμα για έλεγχο: μέγεθος αρχείου, τύπος και πραγματικές διαστάσεις της εικόνας. Καμία αποθήκευση. */
async function probe(url: string): Promise<Pick<PhotoCandidate, "probe" | "error">> {
  try {
    const f = await fetchPublicBytes(url, { max: MAX_IMAGE, accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8" });
    const meta = await sharp(f.bytes).metadata().catch(() => null);
    return { probe: { bytes: f.bytes.length, width: meta?.width ?? null, height: meta?.height ?? null, mime: f.mime } };
  } catch (e) { return { probe: null, error: (e as Error).message.slice(0, 160) }; }
}

type Candidate = Awaited<ReturnType<typeof candidates>>[number];
interface Plan { product: Candidate; pick: PhotoPick; searched: boolean; costUsd: number }

async function planFor(p: Candidate, maySearch: boolean): Promise<Plan> {
  let rows = await pendingImages(p.id);
  let searched = false, costUsd = 0;
  if (!rows.length && maySearch) {
    const { enrichProduct } = await import("../lib/catalog/enrich-run");
    const run = await enrichProduct(p.id).catch((e: Error) => { console.log(`  ✗ ${p.sku}: ${e.message}`); return null; });
    costUsd = run?.costUsd ?? 0; searched = true;
    rows = await pendingImages(p.id);
  }
  // οι ίδιοι έλεγχοι διεύθυνσης που κάνει και η καρτέλα προϊόντος, πριν ξοδέψουμε κατέβασμα
  const usable = rows.filter((r) => isProductImageUrl(r.url!) && !blockedHost(r.url!)).slice(0, PROBE_PER_PRODUCT);
  const cands: PhotoCandidate[] = [];
  for (const r of usable) {
    const pr = await probe(r.url!);
    cands.push({ id: r.id, source: r.source, url: r.url!, sourceName: r.sourceName, ...pr });
  }
  return { product: p, pick: pickPhotos(cands), searched, costUsd };
}

(async () => {
  const list = await candidates();
  const onlyPhotoMissing = list.filter((p) => !p.publishReady && p.publishMissing.length === 1 && p.publishMissing[0] === "photo").length;
  const pool = list.slice(0, Number.isFinite(limit) ? limit : list.length);
  console.log([
    `${apply ? "ΑΠΟΘΗΚΕΥΣΗ" : "ΔΟΚΙΜΗ (χωρίς κανένα ανέβασμα)"} — ${list.length} ${hidden ? "κρυφά (Εξαίρεση Web) με τιμή και απόθεμα" : "ενεργά"} προϊόντα του SoftOne χωρίς καμία φωτογραφία.`,
    `  Από αυτά, ${onlyPhotoMissing} μένουν έξω από τη βιτρίνα ΜΟΝΟ γι' αυτόν τον λόγο.`,
    `  Εξετάζονται ${pool.length}· αναζήτηση στο internet σε ώς ${webLimit} (όριο --web).`,
  ].join("\n"));

  const plans: Plan[] = [];
  let searches = 0;
  for (const p of pool) {
    const plan = await planFor(p, searches < webLimit);
    if (plan.searched) searches++;
    plans.push(plan);
    await sleep(PAUSE_MS);
  }

  const withPhotos = plans.filter((x) => x.pick.take.length);
  const bySource = new Map<string, number>();
  for (const x of withPhotos) for (const t of x.pick.take) bySource.set(t.source, (bySource.get(t.source) ?? 0) + 1);
  const photos = [...bySource.values()].reduce((a, b) => a + b, 0);
  const cost = plans.reduce((a, x) => a + x.costUsd, 0);

  if (withPhotos.length) console.log(`\nΦωτογραφίες για ${apply ? "αποθήκευση" : "αποθήκευση (δεν ανεβαίνουν τώρα)"} — ${withPhotos.length} προϊόντα, ${photos} φωτογραφίες:`);
  for (const x of withPhotos.slice(0, apply ? 0 : 25)) {
    const src = [...new Set(x.pick.take.map((t) => label(t.source)))].join(" + ");
    const px = x.pick.take.map((t) => `${t.probe!.width}×${t.probe!.height}`).join(", ");
    console.log(`  ${x.product.sku} · ${x.product.title.slice(0, 60)}: ${plural(x.pick.take.length, "φωτογραφία", "φωτογραφίες")} από ${src} (${px})`);
  }

  const review = plans.filter((x) => x.pick.review.length);
  if (review.length) {
    const cut = review.reduce((a, x) => a + x.pick.review.length, 0);
    const empty = review.filter((x) => !x.pick.take.length).length;
    console.log(`\nΘέλει μάτι — ${cut} εικόνες που ΔΕΝ αποθηκεύονται, σε ${plural(review.length, "προϊόν", "προϊόντα")} (${empty === 1 ? "1 από αυτά μένει" : `${empty} από αυτά μένουν`} χωρίς καμία):`);
    for (const x of review.slice(0, 15)) for (const r of x.pick.review.slice(0, 3)) console.log(`  ${x.product.sku} · ${label(r.source)}: ${r.reason} — ${r.url.slice(0, 90)}`);
    // πόσα θα περνούσαν με τον πήχη του ελέγχου πληρότητας (μεγάλη πλευρά ≥ 600) αντί με τον δικό μας (και οι δύο)
    const looser = review.flatMap((x) => x.pick.review).filter((r) => r.probe?.width && r.probe.height && Math.max(r.probe.width, r.probe.height) >= MIN_SIDE_PX && Math.min(r.probe.width, r.probe.height) < MIN_SIDE_PX);
    const unlocks = review.filter((x) => !x.pick.take.length && x.pick.review.some((r) => r.probe?.width && r.probe.height && Math.max(r.probe.width, r.probe.height) >= MIN_SIDE_PX && Math.min(r.probe.width, r.probe.height) < MIN_SIDE_PX)).length;
    if (looser.length) console.log(`  (${looser.length} από αυτές περνούν τον πήχη του ελέγχου πληρότητας — μεγάλη πλευρά ≥ ${MIN_SIDE_PX} px· θα ξεκλείδωναν ${plural(unlocks, "προϊόν", "προϊόντα")} που τώρα ${unlocks === 1 ? "μένει" : "μένουν"} χωρίς καμία)`);
  }

  let saved = 0, failed = 0;
  if (apply && withPhotos.length) {
    const { approveImages, pendingRows } = await import("../lib/catalog/enrich-suggestions");
    for (const x of withPhotos) {
      const rows = (await pendingRows(x.product.id, x.pick.take.map((t) => t.id))).filter((r) => r.kind === "image");
      const r = await approveImages(x.product.id, rows, null);
      saved += r.images; failed += r.failed.length;
      console.log(`  ${r.images ? "✓" : "✗"} ${x.product.sku}: ${plural(r.images, "φωτογραφία", "φωτογραφίες")}${r.failed.length ? ` · ${r.failed.length} απέτυχαν: ${r.failed[0].message}` : ""}`);
      await sleep(PAUSE_MS);
    }
    const { projectPublishReady } = await import("../lib/catalog/publish-ready-server");
    await projectPublishReady(withPhotos.map((x) => x.product.id));
    const { resetCatalogCache } = await import("../lib/data/db-catalog");
    resetCatalogCache();
  }

  const nothing = plans.filter((x) => !x.pick.take.length && !x.pick.review.length).length;
  console.log([
    "",
    `Σύνοψη — εξετάστηκαν ${pool.length} από τα ${list.length} προϊόντα χωρίς φωτογραφία:`,
    `  ${apply ? "Αποθηκεύτηκαν" : "Θα αποθηκεύονταν"}: ${plural(photos, "φωτογραφία", "φωτογραφίες")} σε ${plural(withPhotos.length, "προϊόν", "προϊόντα")} (ώς ${MAX_PER_PRODUCT} ανά προϊόν).`,
    `  Πηγές: ${[...bySource.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${label(s)} ${n}`).join(", ") || "—"}.`,
    `  Χωρίς καμία υποψήφια εικόνα: ${plural(nothing, "προϊόν", "προϊόντα")}. Αναζητήσεις internet: ${searches}${cost ? ` (κόστος $${cost.toFixed(3)})` : ""}.`,
    apply ? `  Αποτέλεσμα: ${saved} αποθηκεύτηκαν, ${failed} απέτυχαν.` : "  Δοκιμή — τίποτα δεν ανέβηκε. Με --apply γίνεται η αποθήκευση.",
  ].join("\n"));
  await db.$disconnect();
})();
