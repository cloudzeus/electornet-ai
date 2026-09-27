/**
 * Ξανασχεδιασμός σελίδων από ήδη αναλυμένα banners (χωρίς νέο OCR) — π.χ. μετά από βελτίωση του σχεδιαστή.
 *
 *   npx tsx --conditions=react-server scripts/redesign-banners.ts --product <id>
 *   npx tsx --conditions=react-server scripts/redesign-banners.ts --type "Κλιματιστικά Inverter" --type "Τηλεοράσεις"
 *   npx tsx --conditions=react-server scripts/redesign-banners.ts --all
 */
import "dotenv/config";
import { db } from "../lib/db";
import { redesignProduct } from "../lib/catalog/banner-batch";

const has = (n: string) => process.argv.includes(`--${n}`);
const vals = (n: string) => process.argv.flatMap((a, i) => (a === `--${n}` && process.argv[i + 1] ? [process.argv[i + 1]] : []));

async function main() {
  const ids = vals("product"), types = vals("type");
  if (!ids.length && !types.length && !has("all")) throw new Error("Δώσε --product <id>, --type \"…\" ή --all.");
  const list = ids.length ? ids : (await db.product.findMany({ where: { extractions: { some: { status: "published" } }, ...(types.length ? { category: { name: { in: types } } } : {}) }, select: { id: true }, orderBy: { title: "asc" } })).map((p) => p.id);
  const conc = Number(vals("concurrency")[0]) || 4;
  let next = 0, done = 0, cost = 0, before = 0, after = 0;
  await Promise.all(Array.from({ length: conc }, async () => {
    for (;;) {
      const id = list[next++]; if (!id) return;
      try {
        const r = await redesignProduct(id);
        done++; cost += r.costUsd; before += r.before; after += r.sections;
        console.log(`  ✓ ${r.title.slice(0, 52).padEnd(52)} ${r.before} → ${r.sections} ενότητες${r.dropped ? ` (−${r.dropped})` : ""} · ${r.design} · $${r.costUsd.toFixed(4)}`);
      } catch (e) { console.log(`  ✗ ${id} · ${e instanceof Error ? e.message.slice(0, 120) : e}`); }
    }
  }));
  console.log(`— ${done}/${list.length} προϊόντα · ${before} → ${after} ενότητες · $${cost.toFixed(3)}`);
}
main().catch((e) => { console.error("ΣΦΑΛΜΑ:", e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => db.$disconnect());
