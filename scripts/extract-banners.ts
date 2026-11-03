/**
 * Μαζική αυτόματη απόδελτίωση banners (lib/catalog/banner-batch.ts). Συνεχίζει από εκεί που σταμάτησε.
 *
 *   npx tsx --conditions=react-server scripts/extract-banners.ts --estimate --all                 # πόσα μένουν, χωρίς κόστος
 *   npx tsx --conditions=react-server scripts/extract-banners.ts --type "Τηλεοράσεις" --max 50    # πρόχειρα για έγκριση
 *   npx tsx --conditions=react-server scripts/extract-banners.ts --all --publish                  # ενότητες στη σελίδα αντί για banners
 *   npx tsx --conditions=react-server scripts/extract-banners.ts --publish-drafts                 # δημοσίευση έτοιμων πρόχειρων (χωρίς ανάλυση)
 *   npx tsx --conditions=react-server scripts/extract-banners.ts --undo --type "Τηλεοράσεις"      # αναίρεση
 *   npx tsx --conditions=react-server scripts/extract-banners.ts --unpublish                      # αυτόματες → πρόχειρα για έγκριση
 * Με --publish κρύβονται ΜΟΝΟ τα banners που πέρασαν τον έλεγχο ποιότητας (κάλυψη ≥ 80 %, πλάτος ≥ 700px)· τα υπόλοιπα
 * μένουν εικόνα, «για έλεγχο». Χωρίς --publish όλα μένουν πρόχειρα. Όλα αναιρούνται με --undo / --unpublish.
 */
import "dotenv/config";
import { db } from "../lib/db";
import { autoExtractBatch, autoTodoEstimate, publishAutoDrafts, undoAuto, unpublishAuto } from "../lib/catalog/banner-batch";

const has = (n: string) => process.argv.includes(`--${n}`);
const vals = (n: string) => process.argv.flatMap((a, i) => (a === `--${n}` && process.argv[i + 1] ? [process.argv[i + 1]] : []));

async function main() {
  const types = vals("type");
  const scope = types.length ? types : undefined;
  if (has("unpublish")) { console.log("Πίσω σε πρόχειρο:", await unpublishAuto()); return; }
  if (has("undo")) { console.log("Αναίρεση:", await undoAuto(scope)); return; }
  if (has("estimate")) {
    const e = await autoTodoEstimate(scope);
    console.log(`${e.products} προϊόντα · ${e.banners} ορατά banners · ${e.unique} μοναδικά · ${e.toAnalyse} χωρίς ανάλυση (πληρώνονται, ~$0,002 το καθένα + ένας σχεδιασμός ανά προϊόν)`);
    return;
  }
  if (has("publish-drafts")) {
    const r = await publishAutoDrafts({ types: scope, limit: Number(vals("max")[0]) || undefined, onProduct: (x) => console.log(`  ${x.error ? "✗" : "✓"} ${x.title.slice(0, 60).padEnd(60)} ${x.sections} ενότητες · ${x.hidden} banners κρυμμένα${x.error ? ` · ${x.error.slice(0, 80)}` : ""}`) });
    console.log(`— ${r.products} προϊόντα δημοσιεύτηκαν · ${r.sections} ενότητες · ${r.hidden} banners κρυμμένα · ${r.failed} αποτυχίες`);
    return;
  }
  if (!types.length && !has("all")) throw new Error("Δώσε --type \"…\" (μία ή περισσότερες φορές) ή --all.");
  const publish = has("publish");
  const max = Number(vals("max")[0]) || Infinity, conc = Number(vals("concurrency")[0]) || 3, t0 = Date.now();
  const tot = { products: 0, banners: 0, analysed: 0, reused: 0, review: 0, sections: 0, dropped: 0, cost: 0, ai: 0, published: 0, hidden: 0 };
  console.log(publish ? "Λειτουργία: ΔΗΜΟΣΙΕΥΣΗ (κρύβονται τα banners που πέρασαν τον έλεγχο)" : "Λειτουργία: πρόχειρα για έγκριση");
  for (;;) {
    const left = max - tot.products; if (left <= 0) break;
    const { results, remaining } = await autoExtractBatch({ limit: Math.min(30, left), types: scope, concurrency: conc, publish, onProduct: (r) => {
      console.log(`  ${r.error && !r.sections ? "✗" : r.review ? "◐" : "✓"} ${r.title.slice(0, 52).padEnd(52)} ${r.banners} banners · ${r.analysed} νέα · ${r.reused} ίδια · ${r.review} για έλεγχο · ${r.sections} ενότητες${r.dropped ? ` (−${r.dropped})` : ""}${r.published ? ` · δημοσιεύτηκε, ${r.hidden} κρυμμένα` : ""} · ${r.design} · $${r.costUsd.toFixed(3)}${r.error ? ` · ${r.error.slice(0, 80)}` : ""}`);
    } });
    for (const r of results) { tot.products++; tot.banners += r.banners; tot.analysed += r.analysed; tot.reused += r.reused; tot.review += r.review; tot.sections += r.sections; tot.dropped += r.dropped; tot.cost += r.costUsd; if (r.design === "ai") tot.ai++; if (r.published) tot.published++; tot.hidden += r.hidden ?? 0; }
    console.log(`— ${tot.products} προϊόντα (${tot.published} δημοσιεύτηκαν) · ${tot.banners} banners (${tot.analysed} αναλύθηκαν, ${tot.reused} ίδια με άλλο προϊόν, ${tot.review} για έλεγχο, ${tot.hidden} κρυμμένα) · ${tot.sections} ενότητες · $${tot.cost.toFixed(2)} · απομένουν ${remaining} · ${Math.round((Date.now() - t0) / 1000)} s`);
    if (!results.length || !remaining) break;
  }
}
main().catch((e) => { console.error("ΣΦΑΛΜΑ:", e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => db.$disconnect());
