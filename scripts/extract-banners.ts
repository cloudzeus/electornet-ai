/**
 * Μαζική αυτόματη απόδελτίωση banners (lib/catalog/banner-batch.ts). Συνεχίζει από εκεί που σταμάτησε.
 *
 *   npx tsx --conditions=react-server scripts/extract-banners.ts --type "Τηλεοράσεις" --max 50
 *   npx tsx --conditions=react-server scripts/extract-banners.ts --all                       # όλος ο κατάλογος
 *   npx tsx --conditions=react-server scripts/extract-banners.ts --undo --type "Τηλεοράσεις"  # αναίρεση
 *   npx tsx --conditions=react-server scripts/extract-banners.ts --unpublish                  # αυτόματες → πρόχειρα για έγκριση
 * Η μαζική απόδελτίωση ΔΕΝ δημοσιεύει: ετοιμάζει πρόχειρα, δημοσιεύει μόνο άνθρωπος από το εργαλείο.
 */
import "dotenv/config";
import { db } from "../lib/db";
import { autoExtractBatch, undoAuto, unpublishAuto } from "../lib/catalog/banner-batch";

const has = (n: string) => process.argv.includes(`--${n}`);
const vals = (n: string) => process.argv.flatMap((a, i) => (a === `--${n}` && process.argv[i + 1] ? [process.argv[i + 1]] : []));

async function main() {
  const types = vals("type");
  if (has("unpublish")) { console.log("Πίσω σε πρόχειρο:", await unpublishAuto()); return; }
  if (has("undo")) { console.log("Αναίρεση:", await undoAuto(types.length ? types : undefined)); return; }
  if (!types.length && !has("all")) throw new Error("Δώσε --type \"…\" (μία ή περισσότερες φορές) ή --all.");
  const max = Number(vals("max")[0]) || Infinity, conc = Number(vals("concurrency")[0]) || 3, t0 = Date.now();
  const tot = { products: 0, banners: 0, analysed: 0, reused: 0, review: 0, sections: 0, dropped: 0, cost: 0, ai: 0 };
  for (;;) {
    const left = max - tot.products; if (left <= 0) break;
    const { results, remaining } = await autoExtractBatch({ limit: Math.min(30, left), types: types.length ? types : undefined, concurrency: conc, onProduct: (r) => {
      console.log(`  ${r.error && !r.sections ? "✗" : r.review ? "◐" : "✓"} ${r.title.slice(0, 52).padEnd(52)} ${r.banners} banners · ${r.analysed} νέα · ${r.reused} ίδια · ${r.review} για έλεγχο · ${r.sections} ενότητες${r.dropped ? ` (−${r.dropped})` : ""} · ${r.design} · $${r.costUsd.toFixed(3)}${r.error ? ` · ${r.error.slice(0, 80)}` : ""}`);
    } });
    for (const r of results) { tot.products++; tot.banners += r.banners; tot.analysed += r.analysed; tot.reused += r.reused; tot.review += r.review; tot.sections += r.sections; tot.dropped += r.dropped; tot.cost += r.costUsd; if (r.design === "ai") tot.ai++; }
    console.log(`— ${tot.products} προϊόντα · ${tot.banners} banners (${tot.analysed} αναλύθηκαν, ${tot.reused} ίδια με άλλο προϊόν, ${tot.review} για έλεγχο) · ${tot.sections} ενότητες · $${tot.cost.toFixed(2)} · απομένουν ${remaining} · ${Math.round((Date.now() - t0) / 1000)} s`);
    if (!results.length || !remaining) break;
  }
}
main().catch((e) => { console.error("ΣΦΑΛΜΑ:", e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => db.$disconnect());
