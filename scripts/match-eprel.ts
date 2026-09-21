/**
 * Αντιστοίχιση όλων των προϊόντων με το EPREL και αποθήκευση των τιμών του (ετικέτα, τεχνικά, διαστάσεις).
 *
 *   npx tsx --conditions=react-server scripts/match-eprel.ts            # όσα δεν έχουν ελεγχθεί
 *   npx tsx --conditions=react-server scripts/match-eprel.ts --retry    # ξανά όσα δεν βρέθηκαν
 *   npx tsx --conditions=react-server scripts/match-eprel.ts --max 300  # μέχρι 300 προϊόντα
 *
 * Θέλει EPREL_API_KEY στο .env. Συνεχίζει από εκεί που σταμάτησε· 1–3 κλήσεις ανά προϊόν με παύση 250 ms.
 */
try { process.loadEnvFile(); } catch {}
import { db } from "../lib/db";
import { matchEprelBatch, eprelMatchStats } from "../lib/catalog/eprel-match";

const has = (n: string) => process.argv.includes(`--${n}`);
const val = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? undefined : process.argv[i + 1]; };

async function main() {
  const max = Number(val("max")) || Infinity, t0 = Date.now();
  const before = await eprelMatchStats();
  console.log(`Τύποι με ενεργειακή ετικέτα: ${before.types} · προϊόντα: ${before.eligible.toLocaleString("el-GR")} · ήδη δεμένα ${before.matched} · εκκρεμούν ${before.pending.toLocaleString("el-GR")}`);
  if (!before.hasKey) throw new Error("Λείπει το EPREL_API_KEY στο .env.");
  let total = 0, matched = 0;
  while (total < max) {
    const r = await matchEprelBatch({ limit: Math.min(100, max - total), retry: has("retry"), concurrency: Number(val("concurrency")) || 3 });
    total += r.checked; matched += r.matched;
    console.log(`  +${r.checked}: ${r.matched} βρέθηκαν, ${r.ambiguous} αμφίβολα, ${r.none} όχι · απομένουν ${r.remaining.toLocaleString("el-GR")} · ${Math.round((Date.now() - t0) / 1000)} s`);
    for (const s of r.samples.slice(0, 3)) console.log("     ", s);
    if (!r.ok) throw new Error(r.error);
    if (!r.checked || (!r.remaining && !has("retry")) || (has("retry") && r.checked < 100)) break;
  }
  const after = await eprelMatchStats();
  console.log(`Σύνολο: ελέγχθηκαν ${total}, δέθηκαν ${matched}. Διαστάσεις ERP ↔ EPREL:`, JSON.stringify(after.dim));
}
main().then(() => db.$disconnect()).catch(async (e) => { console.error("ΣΦΑΛΜΑ:", (e as Error).message); await db.$disconnect(); process.exit(1); });
