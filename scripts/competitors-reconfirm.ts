// Εφαρμογή των κανόνων 1 (σίγουρο ζευγάρι με κωδικό προμηθευτή, μοναδικότητα, ψεύτικο EAN) και 2 (μεγάλη διαφορά τιμής) στα υπάρχοντα.
// npx tsx --conditions=react-server scripts/competitors-reconfirm.ts                 (dry-run: διαβάζει τα suggested, καμία εγγραφή)
// npx tsx --conditions=react-server scripts/competitors-reconfirm.ts --apply [--budget 300]
// - suggested με extId: μία ανάγνωση του είδους με τον pacer, decidePrice με strongMatch + μοναδικότητα + SANITY_PCT.
// - auto: χωρίς ανάγνωση, από το αποθηκευμένο diffPct, μόνο auto → suggested (το manual ποτέ).
// Γράφει ΜΟΝΟ CompetitorPrice / CompetitorPriceHistory. Μέσα από το runJob: ίδιο lock ομάδας «competitors» με τη σάρωση.
import { db } from "../lib/db";
import { runJob } from "../lib/scheduler";
import { fetchProduct } from "../lib/competitors/kotsovolos/client";
import { createPacer, KotStopError } from "../lib/competitors/kotsovolos/pacer";
import { decidePrice, insane, isOddResponse, ourPrice, reasonOf, sanityMsg, TAKEN, type Decision } from "../lib/competitors/run-core";

const COMP = "kotsovolos";
const arg = (k: string, d: number) => { const i = process.argv.indexOf(`--${k}`); const n = i > 0 ? Number(process.argv[i + 1]) : NaN; return Number.isFinite(n) && n > 0 ? n : d; };
// σημειώσεις που ξαναϋπολογίζει το decidePrice· οι υπόλοιπες (AI, πολλά υποψήφια, κωδικός τίτλου) μένουν ως note
const recomputed = (e: string | null) => !!e && (e.startsWith("διαφορετικό EAN") || e.startsWith("μεγάλη διαφορά τιμής") || e === TAKEN);

async function reconfirm(apply: boolean, budget: number) {
  const pacer = createPacer({ budget, until: new Date(Date.now() + 4 * 3600_000) });
  const pairOf = new Map((await db.competitorPrice.findMany({ where: { competitor: COMP, match: { in: ["auto", "manual"] }, extId: { not: null } }, select: { productId: true, extId: true }, orderBy: { match: "asc" } })).map((r) => [r.extId as string, r.productId]));
  const product = { select: { id: true, title: true, modelCode: true, ean: true, price: true, offer: { select: { price: true } }, energy: { select: { class: true, eprel: { select: { energyClass: true } } } } } };
  const sugg = await db.competitorPrice.findMany({ where: { competitor: COMP, match: "suggested", extId: { not: null }, product: { active: true } }, select: { id: true, extId: true, lastError: true, offerPrice: true, listPrice: true, ourPrice: true, missCount: true, extUrl: true, product } });
  const autos = await db.competitorPrice.findMany({ where: { competitor: COMP, match: "auto", diffPct: { not: null }, product: { active: true } }, select: { id: true, productId: true, extId: true, diffPct: true } });

  const tally = new Map<string, number>(); const bump = (k: string) => tally.set(k, (tally.get(k) ?? 0) + 1);
  const writes: { id: string; d: Decision; title: string | null }[] = [];
  let odd = 0, read = 0, stopped: string | null = null;
  try {
    for (const row of sugg) {
      const p = row.product, art = row.extId!;
      const r = await fetchProduct(art, pacer); read++;
      if ("error" in r) { if (!isOddResponse(r.error)) odd = 0; else if (++odd >= 5) throw new KotStopError("blocked", "5 συνεχόμενες μη έγκυρες απαντήσεις"); bump(`σφάλμα ανάγνωσης (${r.error})`); continue; }
      odd = 0;
      const owner = pairOf.get(art);
      const d = decidePrice({
        prev: { match: "suggested", extUrl: row.extUrl, missCount: row.missCount, their: row.offerPrice != null ? Number(row.offerPrice) : row.listPrice != null ? Number(row.listPrice) : null, ourPrice: row.ourPrice != null ? Number(row.ourPrice) : null },
        base: "suggested", note: recomputed(row.lastError) ? null : row.lastError, parsed: r, ourEan: p.ean, ourPrice: ourPrice({ price: p.price, offer: p.offer }),
        ours: { model: p.modelCode, title: p.title, energyClass: p.energy?.eprel?.energyClass ?? p.energy?.class ?? null }, taken: !!owner && owner !== p.id,
      });
      if (d.match === "auto") { pairOf.set(art, p.id); bump("γίνονται auto"); console.log(`  ✓ auto  ${p.title.slice(0, 50)} ↔ ${r.title.slice(0, 50)}`); }
      else bump(`μένουν suggested: ${reasonOf(d.lastError)}`);
      writes.push({ id: row.id, d, title: r.title || null });
    }
  } catch (e) {
    if (!(e instanceof KotStopError)) throw e;
    stopped = `σταμάτησε (${e.reason}) μετά από ${read} αναγνώσεις`;
  }
  const demote = autos.filter((a) => insane("auto", a.diffPct));
  for (const a of demote) console.log(`  ↓ έλεγχος ${a.extId} ${a.diffPct}%`);

  console.log([...tally].sort().map(([k, n]) => `${k}: ${n}`).join("\n"));
  console.log(`auto → έλεγχος λόγω διαφοράς τιμής: ${demote.length} · αναγνώσεις ${pacer.used}${stopped ? ` · ${stopped}` : ""}`);
  const summary = `${tally.get("γίνονται auto") ?? 0} από ${sugg.length} suggested γίνονται auto · ${demote.length} auto για έλεγχο (διαφορά > 40%)${stopped ? ` · ${stopped}` : ""}`;
  if (!apply) return { ok: true, idle: true, message: `dry-run: ${summary}` };

  for (const w of writes) {
    const { d } = w;
    const row = await db.competitorPrice.update({ where: { id: w.id }, data: {
      match: d.match, lastError: d.lastError, missCount: d.missCount, checkedAt: new Date(), ...(w.title ? { extTitle: w.title } : {}),
      ...(d.available !== undefined ? { available: d.available } : {}),
      ...(d.prices ? { listPrice: d.prices.list, offerPrice: d.prices.offer, ourPrice: d.prices.ourPrice, diffPct: d.prices.diff } : {}),
    } });
    if (d.prices && d.history) await db.competitorPriceHistory.create({ data: { competitorPriceId: row.id, price: d.prices.their, ourPrice: d.prices.ourPrice } });
  }
  for (const a of demote) await db.competitorPrice.update({ where: { id: a.id }, data: { match: "suggested", lastError: sanityMsg(a.diffPct!) } });
  return { ok: !stopped, message: `γράφτηκαν: ${summary}` };
}

async function main() {
  const apply = process.argv.includes("--apply"), budget = arg("budget", 300);
  // dry-run: χωρίς runJob, ώστε να μη γράφει ούτε την κατάσταση εργασίας
  if (!apply) { console.log((await reconfirm(false, budget)).message); return; }
  const r = await runJob({
    key: "competitor-kotsovolos-reconfirm", label: "Κωτσόβολος: επανέλεγχος προτάσεων (script)", schedule: { dailyAt: [0, 0] }, group: "competitors", maxMin: 300,
    run: () => reconfirm(apply, budget),
  }, "manual");
  console.log(r.ran ? `${r.ok ? "OK" : "ΣΦΑΛΜΑ"} · ${r.message}` : `τρέχει ήδη: ${r.message}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
