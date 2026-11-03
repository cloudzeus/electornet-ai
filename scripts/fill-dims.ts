/**
 * Μαζική συμπλήρωση διαστάσεων και βάρους σε προϊόντα που τα έχουν κενά («Ημιτελές: Χωρίς διαστάσεις ή βάρος»).
 *
 *   npm run dims:fill                              # ΔΟΚΙΜΗ: τι θα γραφτεί, χωρίς καμία εγγραφή
 *   npm run dims:fill -- --limit 50                # μόνο τα 50 πρώτα
 *   npm run dims:fill -- --only 30491              # ένα προϊόν (κωδικός ERP / MTRL ή id προϊόντος)
 *   npm run dims:fill -- --web 20                  # ώς 20 προϊόντα ψάχνουν και στο internet (~$0,01 το καθένα)
 *   npm run dims:fill -- --sellable --web 50       # μόνο όσα πουλιούνται τώρα (τιμή και απόθεμα)
 *   npm run dims:fill -- --skip 827919,68801001025 # εξαιρούνται (κωδικός ERP / SKU / id, χωρισμένα με κόμμα)
 *   npm run dims:fill -- --limit 50 --web 10 --apply   # ΕΓΓΡΑΦΗ στο SoftOne και στο e-shop
 *
 * Δύο πηγές, φθηνότερη πρώτα (βλ. lib/catalog/dim-fill-core.ts):
 *  1. ό,τι έχουμε ήδη — η γραμμή διαστάσεων της περιγραφής / του διαχειριστή / του EPREL και το βάρος από τα
 *     χαρακτηριστικά. Μηδενικό κόστος, τρέχει για όλα.
 *  2. internet — η μηχανή εμπλουτισμού (`enrichProduct`: Icecat → Channel3 → σελίδα κατασκευαστή → καταστήματα) μόνο
 *     για όσα μένουν κενά και μόνο μέχρι το όριο του `--web`.
 *
 * Η εγγραφή περνά από το `writeItem` (lib/softone/item-write.ts) — τους ίδιους τρεις φραγμούς με την καρτέλα προϊόντος:
 * έλεγχος σύγκρουσης, μόνο τα πεδία που αλλάζουν, επαλήθευση με νέα ανάγνωση. Μετά από επιτυχία το είδος ξαναδιαβάζεται
 * από το SoftOne (`syncItem` + `projectItem`) και ξαναμετριέται η πληρότητα.
 */
import { db } from "../lib/db";
import { planFill, webTargets, DESC_SOURCES, WEB_SOURCES, type FillRow, type FillPlan } from "../lib/catalog/dim-fill-core";
import { itemWriteEnabled, writeItem, type ItemChanges } from "../lib/softone/item-write";

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const value = (name: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const num = (name: string, fallback: number) => { const v = Number(value(name)); return Number.isFinite(v) && v >= 0 ? v : fallback; };

const apply = flag("apply");
const limit = num("limit", Infinity);
const webLimit = num("web", 0);
const only = value("only");
const skip = new Set((value("skip") ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const PAUSE_MS = 150;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const blank = (v: number | null) => !v || v <= 0;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const cm = (p: FillPlan) => `${p.write.widthCm} × ${p.write.heightCm} × ${p.write.lengthCm} εκ.`;

/** Τα προϊόντα που τους λείπει έστω ένα από βάρος / πλάτος / ύψος / μήκος — ενεργά, από το SoftOne, χωρίς τα σετ. */
async function candidates() {
  const items = await db.s1Item.findMany({
    where: { missing: false, OR: [{ weightKg: null }, { weightKg: 0 }, { widthCm: null }, { widthCm: 0 }, { heightCm: null }, { heightCm: 0 }, { lengthCm: null }, { lengthCm: 0 }] },
    select: { mtrl: true, weightKg: true, widthCm: true, heightCm: true, lengthCm: true },
  });
  const itemOf = new Map(items.map((i) => [String(i.mtrl), i]));
  const where = only
    ? { OR: [{ id: only }, { erpCode: only }, { sku: only }] }
    : { source: "softone", active: true, kind: "item", erpCode: { in: [...itemOf.keys()] }, ...(flag("sellable") ? { price: { gt: 0 }, stock: { gt: 0 } } : {}) };
  const products = await db.product.findMany({ where, orderBy: { sku: "asc" }, select: { id: true, sku: true, erpCode: true, title: true, kind: true, category: { select: { name: true } } } });
  return products
    .map((p) => ({ ...p, item: itemOf.get(p.erpCode) ?? null }))
    .filter((p) => (only || p.item) && ![p.id, p.sku, p.erpCode].some((k) => k && skip.has(k)));
}

type Candidate = Awaited<ReturnType<typeof candidates>>[number];

/** Οι γραμμές διαστάσεων και τα χαρακτηριστικά των προϊόντων — για την πηγή που εξετάζεται. */
async function rows(list: Candidate[], sources: string[]): Promise<FillRow[]> {
  const ids = list.map((p) => p.id);
  const [dims, specs, items] = await Promise.all([
    db.productDimension.findMany({ where: { productId: { in: ids }, source: { in: sources } }, select: { productId: true, source: true, w: true, h: true, d: true, kind: true, warning: true } }),
    db.spec.findMany({ where: { productId: { in: ids }, key: { contains: "άρος", mode: "insensitive" }, ...(sources.includes("s1-desc") ? {} : { source: { in: sources } }) }, select: { productId: true, key: true, value: true } }),
    db.s1Item.findMany({ where: { mtrl: { in: list.map((p) => Number(p.erpCode)).filter(Number.isInteger) } }, select: { mtrl: true, weightKg: true, widthCm: true, heightCm: true, lengthCm: true } }),
  ]);
  const itemOf = new Map(items.map((i) => [String(i.mtrl), i]));
  const by = <T extends { productId: string }>(l: T[]) => { const m = new Map<string, T[]>(); for (const x of l) m.set(x.productId, [...(m.get(x.productId) ?? []), x]); return m; };
  const dimOf = by(dims), specOf = by(specs);
  return list.map((p) => {
    const it = itemOf.get(p.erpCode) ?? null;
    return {
      productId: p.id, erpCode: p.erpCode, title: `${p.sku} · ${p.title}`, typeName: p.category.name, isSet: p.kind === "set",
      item: it ? { weightKg: it.weightKg, widthCm: it.widthCm, heightCm: it.heightCm, lengthCm: it.lengthCm } : null,
      specs: (specOf.get(p.id) ?? []).map((s) => ({ key: s.key, value: s.value })),
      dims: (dimOf.get(p.id) ?? []).map((d) => ({ source: d.source, w: d.w, h: d.h, d: d.d, kind: d.kind, warning: d.warning })),
    };
  });
}

/** Η εγγραφή ενός προϊόντος: SoftOne (με τους τρεις φραγμούς) και μετά e-shop. */
async function write(p: FillPlan): Promise<{ ok: boolean; message: string }> {
  const mtrl = Number(p.erpCode);
  const item = await db.s1Item.findUnique({ where: { mtrl }, select: { weightKg: true, widthCm: true, heightCm: true, lengthCm: true } });
  if (!item) return { ok: false, message: "το είδος δεν υπάρχει στον καθρέφτη" };
  const changes: ItemChanges = {};
  // ανάγνωση ακριβώς πριν: γράφουμε μόνο όπου είναι ΑΚΟΜΗ κενό
  if (p.write.widthCm != null && blank(item.widthCm) && blank(item.heightCm) && blank(item.lengthCm)) {
    changes.widthCm = { from: item.widthCm, to: p.write.widthCm };
    changes.heightCm = { from: item.heightCm, to: p.write.heightCm! };
    changes.lengthCm = { from: item.lengthCm, to: p.write.lengthCm! };
  }
  if (p.write.weightKg != null && blank(item.weightKg)) changes.weightKg = { from: item.weightKg, to: p.write.weightKg };
  if (!Object.keys(changes).length) return { ok: false, message: "τα πεδία γέμισαν στο μεταξύ — δεν γράφτηκε τίποτα" };
  const w = await writeItem(mtrl, changes);
  if (!w.ok) return { ok: false, message: w.error ?? w.conflicts.map((c) => `${c.field}: είδαμε «${c.saw}», τώρα «${c.now}»`).join(", ") };
  const [{ syncItem }, { projectItem }, { projectPublishReady }] = await Promise.all([import("../lib/softone/catalog"), import("../lib/softone/project"), import("../lib/catalog/publish-ready-server")]);
  await syncItem(mtrl, "manual");
  await projectItem(mtrl);
  await projectPublishReady([p.productId]);
  return { ok: true, message: w.written.join(", ") };
}

(async () => {
  const list = await candidates();
  // το --limit είναι όριο ΕΞΕΤΑΣΗΣ: ό,τι αναφέρεται (και προς εγγραφή και προς έλεγχο) αφορά αυτά τα προϊόντα
  const pool = list.slice(0, Number.isFinite(limit) ? limit : list.length);
  const first = await rows(pool, DESC_SOURCES);
  const plans = new Map<string, FillPlan>();
  for (const r of first) plans.set(r.productId, planFill(r));
  const usable = [...plans.values()].filter((p) => !p.skip);
  const todo = usable.filter((p) => Object.keys(p.write).length);
  console.log(`${apply ? "ΕΓΓΡΑΦΗ" : "ΔΟΚΙΜΗ (χωρίς εγγραφή)"} — ${list.length} προϊόντα με κενή διάσταση ή βάρος· εξετάζονται ${pool.length}· ${todo.length} έχουν τιμή από όσα έχουμε ήδη.`);

  // internet μόνο για όσα μένουν κενά, μέχρι το όριο
  const web = webTargets(usable, webLimit);
  let fromWeb = 0, webCost = 0;
  if (web.length) {
    const { enrichProduct } = await import("../lib/catalog/enrich-run");
    console.log(`Internet: ${web.length} προϊόντα (όριο --web ${webLimit}).`);
    for (const p of web) {
      const run = await enrichProduct(p.productId).catch((e: Error) => { console.log(`  ✗ ${p.title}: ${e.message}`); return null; });
      webCost += run?.costUsd ?? 0;
      const [after] = await rows(list.filter((x) => x.id === p.productId), WEB_SOURCES);
      if (!after) continue;
      const next = planFill(after, { web: true });
      plans.set(p.productId, next);
      if (next.source === "web") fromWeb++;
      await sleep(PAUSE_MS);
    }
  }

  const final = [...plans.values()].filter((p) => !p.skip && Object.keys(p.write).length);
  if (final.length) console.log(`\nΤιμές για ${apply ? "εγγραφή" : "εγγραφή (δεν γράφονται τώρα)"} — ${final.length}:`);
  for (const p of final.slice(0, apply ? 0 : 40)) {
    const bits = [p.write.widthCm != null ? cm(p) : null, p.write.weightKg != null ? `${p.write.weightKg.toLocaleString("el-GR")} κιλά` : null].filter(Boolean);
    console.log(`  ${p.source === "web" ? "internet" : "περιγραφή"} · ${p.title}: ${bits.join(" · ")}`);
  }
  const review = [...plans.values()].filter((p) => p.review.length);
  // ένα προϊόν μπορεί να είναι και στις δύο λίστες: π.χ. διαστάσεις εντάξει, βάρος ύποπτο
  const onlyReview = review.filter((p) => !Object.keys(p.write).length);
  if (review.length) {
    console.log(`\nΘέλει μάτι — τιμές που ΔΕΝ γράφονται, σε ${plural(review.length, "προϊόν", "προϊόντα")} (${onlyReview.length === 1 ? "1 από αυτά μένει" : `${onlyReview.length} από αυτά μένουν`} χωρίς καμία τιμή):`);
    for (const p of review.slice(0, 20)) console.log(`  ${p.title}: ${p.review.join(" · ")}`);
    if (review.length > 20) console.log(`  … και άλλα ${review.length - 20}`);
  }

  let written = 0, failed = 0;
  if (apply && final.length) {
    if (!(await itemWriteEnabled())) {
      console.log("\nΗ εγγραφή στο SoftOne είναι κλειστή (Ρυθμίσεις → SoftOne → Αλλαγές προϊόντων προς SoftOne). Δεν γράφτηκε τίποτα.");
    } else {
      for (const p of final) {
        const r = await write(p);
        if (r.ok) { written++; console.log(`  ✓ ${p.title}: ${r.message}`); }
        else { failed++; console.log(`  ✗ ${p.title}: ${r.message}`); }
        await sleep(PAUSE_MS);
      }
    }
  }

  const desc = final.filter((p) => p.source !== "web").length;
  const dimsN = final.filter((p) => p.write.widthCm != null).length, kgN = final.filter((p) => p.write.weightKg != null).length;
  console.log([
    "",
    `Σύνοψη — εξετάστηκαν ${pool.length} από τα ${list.length} προϊόντα με κενό:`,
    `  ${apply ? "Γράφτηκαν" : "Θα γράφονταν"}: ${plural(final.length, "προϊόν", "προϊόντα")} (διαστάσεις σε ${dimsN}, βάρος σε ${kgN}) — ${desc} από την περιγραφή, ${fromWeb} από το internet${webCost ? ` (κόστος $${webCost.toFixed(3)})` : ""}.`,
    `  Θέλει μάτι: ${plural(review.length, "προϊόν", "προϊόντα")} με τιμή που κόπηκε στους ελέγχους, από τα οποία ${onlyReview.length === 1 ? "1 μένει" : `${onlyReview.length} μένουν`} χωρίς καμία τιμή.`,
    apply ? `  Αποτέλεσμα εγγραφής: ${written} πέτυχαν, ${failed} απέτυχαν.` : "  Δοκιμή — δεν γράφτηκε τίποτα. Με --apply γίνεται η εγγραφή.",
  ].join("\n"));
  await db.$disconnect();
})();
