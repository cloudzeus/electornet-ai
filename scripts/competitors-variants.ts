// «Ίδιο μοντέλο, άλλο χρώμα» (Ruling 15) για τα προϊόντα που η σάρωση έγραψε «δεν βρέθηκε στον Κωτσόβολο».
// npx tsx --conditions=react-server scripts/competitors-variants.ts                  (λίστα: 1 λήψη sitemap, καμία εγγραφή)
// npx tsx --conditions=react-server scripts/competitors-variants.ts --apply [--budget 400]   (διαβάζει τιμές με τον pacer, γράφει variant)
// Μέσα από το runJob: ίδιο lock ομάδας «competitors» με τη σάρωση, άρα δεν τρέχουν ποτέ μαζί.
import { db } from "../lib/db";
import { runJob } from "../lib/scheduler";
import { fetchProduct, fetchSitemap } from "../lib/competitors/kotsovolos/client";
import { createPacer, KotStopError } from "../lib/competitors/kotsovolos/pacer";
import { brandPool, matchVariant, modelTokens, slugIndex, type KotItem } from "../lib/competitors/kotsovolos/core";
import { decideVariant, isOddResponse, ourPrice } from "../lib/competitors/run-core";
import { NOT_FOUND } from "../lib/competitors/run";

const COMP = "kotsovolos";
const arg = (k: string, d: number) => { const i = process.argv.indexOf(`--${k}`); const n = i > 0 ? Number(process.argv[i + 1]) : NaN; return Number.isFinite(n) && n > 0 ? n : d; };

async function variants(apply: boolean, budget: number) {
  const pacer = createPacer({ budget, until: new Date(Date.now() + 4 * 3600_000) });
  const ix = slugIndex(await fetchSitemap(pacer));
  const brandMaps = new Map((await db.competitorBrandMap.findMany({ where: { competitor: COMP } })).map((b) => [b.brandId, b]));
  const rows = await db.competitorPrice.findMany({
    where: { competitor: COMP, extId: null, lastError: NOT_FOUND },
    select: { id: true, rejectedExtIds: true, product: { select: { title: true, modelCode: true, ean: true, price: true, brandId: true, brand: { select: { name: true } }, offer: { select: { price: true } } } } },
  });
  const found: { row: (typeof rows)[number]; v: KotItem }[] = [];
  for (const row of rows) {
    const p = row.product, bm = brandMaps.get(p.brandId);
    if (bm?.notCarried) continue;
    const all = brandPool(ix, p.brand.name, bm?.alias).filter((k) => !row.rejectedExtIds.includes(k.art));
    const v = [...new Set([p.modelCode, ...modelTokens(p.title)])].map((m) => matchVariant({ brand: p.brand.name, alias: bm?.alias, model: m }, all)).find(Boolean);
    if (v) { found.push({ row, v }); console.log(`${p.title} → ${v.path}/${v.last}`); }
  }
  console.log(`${found.length} από ${rows.length} «δεν βρέθηκε» έχουν ίδιο μοντέλο σε άλλο χρώμα`);
  if (!apply) return { ok: true, idle: true, message: `dry-run: ${found.length} ενδεικτικά` };

  let saved = 0, odd = 0;
  try {
    for (const { row, v } of found) {
      const p = row.product;
      const r = await fetchProduct(v.art, pacer);
      if ("error" in r) { if (isOddResponse(r.error) && ++odd >= 5) throw new KotStopError("blocked", "5 συνεχόμενες μη έγκυρες απαντήσεις"); console.log(`  ✗ ${v.art}: ${r.error}`); continue; }
      odd = 0;
      const ours = ourPrice({ price: p.price, offer: p.offer });
      const d = decideVariant({ prev: { match: null, extUrl: null, missCount: 0, their: null, ourPrice: null }, parsed: r, ourEan: p.ean, ourPrice: ours });
      await db.competitorPrice.update({ where: { id: row.id }, data: {
        match: d.match, lastError: d.lastError, missCount: 0, checkedAt: new Date(), extId: v.art, extUrl: `${v.path}/${v.last}`, extTitle: r.title || null,
        ...(d.available !== undefined ? { available: d.available } : {}),
        ...(d.prices ? { listPrice: d.prices.list, offerPrice: d.prices.offer, ourPrice: d.prices.ourPrice, diffPct: d.prices.diff } : {}),
      } });
      if (d.prices) await db.competitorPriceHistory.create({ data: { competitorPriceId: row.id, price: d.prices.their, ourPrice: d.prices.ourPrice } });
      saved++;
    }
  } catch (e) {
    if (!(e instanceof KotStopError)) throw e;
    return { ok: false, message: `σταμάτησε (${e.reason}) μετά από ${saved} · τα υπόλοιπα στην επόμενη εκτέλεση` };
  }
  return { ok: true, message: `${saved} ενδεικτικά (άλλο χρώμα) γράφτηκαν από ${found.length} · ${pacer.used} κλήσεις Κωτσόβολου` };
}

async function main() {
  const apply = process.argv.includes("--apply"), budget = arg("budget", 400);
  const r = await runJob({
    key: "competitor-kotsovolos-variants", label: "Κωτσόβολος: ίδιο μοντέλο, άλλο χρώμα (script)", schedule: { dailyAt: [0, 0] }, group: "competitors", maxMin: 300,
    run: () => variants(apply, budget),
  }, "manual");
  console.log(r.ran ? `${r.ok ? "OK" : "ΣΦΑΛΜΑ"} · ${r.message}` : `τρέχει ήδη: ${r.message}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
