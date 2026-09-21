/**
 * Ξαναχτίζει τα έγγραφα του vector index (ένα ανά προϊόν) και ενσωματώνει όσα άλλαξαν.
 * Τρέχει μόνο του σε κάθε συγχρονισμό· χειροκίνητα μετά από αλλαγή στη μορφή του εγγράφου (DOC_VERSION).
 *
 *   npx tsx --conditions=react-server scripts/reindex-vector.ts
 */
import "dotenv/config";
import { db } from "../lib/db";
import { refreshProductDocs, embedStale, vectorStats } from "../lib/vector/index";

async function main() {
  const t0 = Date.now();
  const r = await refreshProductDocs();
  console.log(`Έγγραφα: ${r.total} · νέα ${r.created} · αλλαγμένα ${r.changed} · αφαιρέθηκαν ${r.removed} · ${Math.round((Date.now() - t0) / 1000)} s`);
  let tokens = 0, cost = 0;
  for (;;) {
    const e = await embedStale(1500);
    tokens += e.tokens; cost += e.costUsd;
    console.log(`  ενσωματώθηκαν ${e.embedded} · απομένουν ${e.remaining} · ${Math.round((Date.now() - t0) / 1000)} s`);
    if (e.error) throw new Error(e.error);
    if (!e.remaining || !e.embedded) break;
  }
  console.log(`Σύνολο: ${tokens.toLocaleString("el-GR")} tokens · $${cost.toFixed(3)}`, await vectorStats());
  await db.$disconnect();
}
main().catch(async (e) => { console.error("ΣΦΑΛΜΑ:", e instanceof Error ? e.message : e); await db.$disconnect(); process.exit(1); });
