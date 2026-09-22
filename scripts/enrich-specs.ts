/**
 * Εμπλουτισμός χαρακτηριστικών από εξωτερικές πηγές (lib/catalog/enrich.ts). Συνεχίζει από εκεί που σταμάτησε.
 *
 *   npx tsx --conditions=react-server scripts/enrich-specs.ts --source icecat                 # δωρεάν, όλα τα προϊόντα της βιτρίνας
 *   npx tsx --conditions=react-server scripts/enrich-specs.ts --source web --max 300           # επίσημα sites, ~$0,015/προϊόν, μόνο όσα δεν έδωσε το Icecat
 *   npx tsx --conditions=react-server scripts/enrich-specs.ts --source web --type "Κλιματιστικά Inverter"
 *   npx tsx --conditions=react-server scripts/enrich-specs.ts --stats
 */
import "dotenv/config";
import { db } from "../lib/db";
import { enrichBatch, enrichStats, type EnrichSource } from "../lib/catalog/enrich";

const has = (n: string) => process.argv.includes(`--${n}`);
const val = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? undefined : process.argv[i + 1]; };

async function main() {
  if (has("stats")) { const s = await enrichStats(); console.log(`Προϊόντα βιτρίνας: ${s.listed}`); for (const r of s.rows) console.log(`  ${r.source.padEnd(7)} ${r.status.padEnd(7)} ${String(r.products).padStart(5)} προϊόντα · ${r.specs} χαρακτηριστικά · $${r.costUsd.toFixed(2)}`); return; }
  const source = (val("source") ?? "icecat") as EnrichSource, max = Number(val("max")) || Infinity, types = val("type") ? [val("type")!] : undefined;
  const t0 = Date.now(); let total = 0, found = 0, specs = 0, cost = 0;
  while (total < max) {
    const r = await enrichBatch({ source, limit: Math.min(100, max - total), types, retry: has("retry"), concurrency: Number(val("concurrency")) || undefined });
    total += r.checked; found += r.found; specs += r.specs; cost += r.costUsd;
    console.log(`  +${r.checked}: ${r.found} βρέθηκαν, ${r.none} όχι, ${r.failed} σφάλμα · ${r.specs} χαρακτηριστικά · $${r.costUsd.toFixed(3)} · απομένουν ${r.remaining.toLocaleString("el-GR")} · ${Math.round((Date.now() - t0) / 1000)} s`);
    for (const s of r.samples.slice(0, 4)) console.log("     ", s);
    if (!r.checked || !r.remaining) break;
  }
  console.log(`Σύνολο (${source}): ${total} ελέγχθηκαν, ${found} βρέθηκαν (${total ? Math.round((found / total) * 100) : 0} %), ${specs} χαρακτηριστικά, $${cost.toFixed(2)}`);
}
main().catch(async (e) => { console.error("ΣΦΑΛΜΑ:", e instanceof Error ? e.message : e); process.exit(1); }).finally(() => db.$disconnect());
