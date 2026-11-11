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
 *   npm run photos:fill -- --json picks.json ...   # γράφει ποιες εικόνες διαλέχτηκαν ανά προϊόν (για έλεγχο με το μάτι)
 *   npm run photos:fill -- --all ...               # όλα τα είδη του SoftOne, και όσα έχουν «Εξαίρεση Web»
 *   npm run photos:fill -- --official ...          # μόνο Icecat + site κατασκευαστή (όχι άλλα καταστήματα)
 *   npm run photos:fill -- --small --web 10         # προϊόντα που έχουν ΜΟΝΟ μικρές φωτογραφίες (< 600 px): μπαίνουν
 *                                                   # καλύτερες και οι μικρές κρύβονται (δεν σβήνονται, ξαναφαίνονται από την καρτέλα)
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
import { db } from "../lib/db";
import { probeImage as probe, revisitFoundPages, hideSmallPhotos } from "../lib/catalog/photo-candidates";
import { isProductImageUrl, blockedHost } from "../lib/catalog/enrich-core";
import { pickPhotos, MAX_PER_PRODUCT, type PhotoCandidate, type PhotoPick } from "../lib/catalog/photo-fill-core";
import { SUGGEST_SOURCE_LABEL } from "../lib/catalog/enrich-suggestions";
import { LOW_RES_PX } from "../lib/catalog/product-images";

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
/** προϊόντα με ορατές φωτογραφίες, όλες μικρές (μεγάλη πλευρά < LOW_RES_PX — ίδιο κριτήριο με το «χαμηλή ανάλυση» της καρτέλας) */
const small = flag("small");
/** και τα προϊόντα με «Εξαίρεση Web» (ανενεργά στο eshop), με ή χωρίς τιμή / απόθεμα */
const all = flag("all");
/** μόνο επίσημες πηγές: Icecat (γκαλερί κατασκευαστή) και η σελίδα του κατασκευαστή — όχι άλλα καταστήματα / Channel3 */
const official = flag("official");
const OFFICIAL = new Set(["icecat", "web"]);
const IMG = { kind: "image", hidden: false } as const;
/** μικρή = γνωστές διαστάσεις και μεγάλη πλευρά < 600· άγνωστες διαστάσεις δεν μετράνε για μικρές */
const BIG_OR_UNKNOWN = { ...IMG, OR: [{ width: null }, { height: null }, { width: { gte: LOW_RES_PX } }, { height: { gte: LOW_RES_PX } }] };
/** πόσες προτάσεις κατεβάζουμε για έλεγχο ανά προϊόν (οι πρώτες φτάνουν — θέλουμε 6) */
const PROBE_PER_PRODUCT = 10;
const PAUSE_MS = 150;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const label = (s: string) => SUGGEST_SOURCE_LABEL[s] ?? s;

/** Ενεργά προϊόντα του SoftOne (ή με --hidden τα κρυφά με τιμή και απόθεμα) χωρίς καμία ορατή φωτογραφία (τα σετ παίρνουν εικόνες από το κύριο είδος). */
async function candidates() {
  const media = small ? { AND: [{ media: { some: IMG } }, { media: { none: BIG_OR_UNKNOWN } }] } : { media: { none: IMG } };
  const where = only
    ? { OR: [{ id: only }, { erpCode: only }, { sku: only }] }
    : all
      ? { source: "softone", kind: "item", ...media }
      : hidden
      ? { source: "softone", active: false, kind: "item", price: { gt: 0 }, stock: { gt: 0 }, ...media }
      : { source: "softone", active: true, kind: "item", ...media };
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

type Candidate = Awaited<ReturnType<typeof candidates>>[number];
interface Plan { product: Candidate; pick: PhotoPick; searched: boolean; costUsd: number }

async function planFor(p: Candidate, maySearch: boolean): Promise<Plan> {
  let rows = await pendingImages(p.id);
  let searched = false, costUsd = 0;
  // η σελίδα κατασκευαστή / καταστήματος βρέθηκε ήδη αλλά δεν έδωσε εικόνα (π.χ. πριν διαβάζονται τα <img> με το μοντέλο):
  // ξαναδιαβάζεται δωρεάν, χωρίς νέα αναζήτηση
  if (!rows.length && await revisitFoundPages(p.id, official ? ["web"] : ["web", "shop"])) rows = await pendingImages(p.id);
  if (!rows.length && maySearch) {
    const { enrichProduct } = await import("../lib/catalog/enrich-run");
    const run = await enrichProduct(p.id).catch((e: Error) => { console.log(`  ✗ ${p.sku}: ${e.message}`); return null; });
    costUsd = run?.costUsd ?? 0; searched = true;
    rows = await pendingImages(p.id);
  }
  // οι ίδιοι έλεγχοι διεύθυνσης που κάνει και η καρτέλα προϊόντος, πριν ξοδέψουμε κατέβασμα
  const usable = rows.filter((r) => (!official || OFFICIAL.has(r.source)) && isProductImageUrl(r.url!) && !blockedHost(r.url!)).slice(0, PROBE_PER_PRODUCT);
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
    `${apply ? "ΑΠΟΘΗΚΕΥΣΗ" : "ΔΟΚΙΜΗ (χωρίς κανένα ανέβασμα)"} — ${list.length} ${all ? "(ενεργά και με Εξαίρεση Web)" : hidden ? "κρυφά (Εξαίρεση Web) με τιμή και απόθεμα" : "ενεργά"} προϊόντα του SoftOne ${small ? `με μόνο μικρές φωτογραφίες (< ${LOW_RES_PX} px)` : "χωρίς καμία φωτογραφία"}.`,
    ...(small ? [] : [`  Από αυτά, ${onlyPhotoMissing} μένουν έξω από τη βιτρίνα ΜΟΝΟ γι' αυτόν τον λόγο.`]),
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
  const jsonOut = value("json");
  if (jsonOut) (await import("node:fs")).writeFileSync(jsonOut, JSON.stringify(withPhotos.map((x) => ({ sku: x.product.sku, title: x.product.title, photos: x.pick.take.map((t) => ({ url: t.url, source: t.source, w: t.probe?.width, h: t.probe?.height })) })), null, 1));
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
  }

  let saved = 0, failed = 0;
  if (apply && withPhotos.length) {
    const { approveImages, pendingRows } = await import("../lib/catalog/enrich-suggestions");
    for (const x of withPhotos) {
      const rows = (await pendingRows(x.product.id, x.pick.take.map((t) => t.id))).filter((r) => r.kind === "image");
      const r = await approveImages(x.product.id, rows, null);
      saved += r.images; failed += r.failed.length;
      // οι νέες έχουν μεγάλη πλευρά ≥ 600 (checkImage) και το φίλτρο κρύβει μόνο όσες έχουν ΚΑΙ τις δύο < 600: πιάνει μόνο τις παλιές
      const hid = small && r.images ? await hideSmallPhotos(x.product.id) : 0;
      console.log(`  ${r.images ? "✓" : "✗"} ${x.product.sku}: ${plural(r.images, "φωτογραφία", "φωτογραφίες")}${hid ? ` · κρύφτηκαν ${hid} μικρές` : ""}${r.failed.length ? ` · ${r.failed.length} απέτυχαν: ${r.failed[0].message}` : ""}`);
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
    `Σύνοψη — εξετάστηκαν ${pool.length} από τα ${list.length} προϊόντα ${small ? "με μικρές φωτογραφίες" : "χωρίς φωτογραφία"}:`,
    `  ${apply ? "Αποθηκεύτηκαν" : "Θα αποθηκεύονταν"}: ${plural(photos, "φωτογραφία", "φωτογραφίες")} σε ${plural(withPhotos.length, "προϊόν", "προϊόντα")} (ώς ${MAX_PER_PRODUCT} ανά προϊόν).`,
    `  Πηγές: ${[...bySource.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${label(s)} ${n}`).join(", ") || "—"}.`,
    `  Χωρίς καμία υποψήφια εικόνα: ${plural(nothing, "προϊόν", "προϊόντα")}. Αναζητήσεις internet: ${searches}${cost ? ` (κόστος $${cost.toFixed(3)})` : ""}.`,
    apply ? `  Αποτέλεσμα: ${saved} αποθηκεύτηκαν, ${failed} απέτυχαν.` : "  Δοκιμή — τίποτα δεν ανέβηκε. Με --apply γίνεται η αποθήκευση.",
  ].join("\n"));
  await db.$disconnect();
})();
