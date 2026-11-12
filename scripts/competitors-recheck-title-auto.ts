// Επισκευή μετά τη σάρωση με τον κώδικα 2045c71: ζευγάρια «auto» που βγήκαν από κωδικό του τίτλου (ή AI) χωρίς ίδιο EAN
// γίνονται πρόταση. Το EAN του Κωτσόβολου δεν αποθηκεύεται, άρα κριτήριο: ο δικός μας modelCode ΔΕΝ ταιριάζει (matched) με το slug τους.
// Αν κάποιο είχε στην πραγματικότητα ίδιο EAN, η επόμενη νυχτερινή το ξαναβγάζει auto (decidePrice). Χωρίς δίκτυο, χωρίς AI.
// npx tsx --conditions=react-server scripts/competitors-recheck-title-auto.ts           (λίστα, χωρίς εγγραφές)
// npx tsx --conditions=react-server scripts/competitors-recheck-title-auto.ts --apply   (υποβάθμιση σε suggested)
import { db } from "../lib/db";
import { matchByModel, parseSitemap } from "../lib/competitors/kotsovolos/core";

const COMP = "kotsovolos";
const NOTE = "ζευγάρι από τίτλο χωρίς ίδιο EAN — έλεγξε";

async function main() {
  const apply = process.argv.includes("--apply");
  const aliases = new Map((await db.competitorBrandMap.findMany({ where: { competitor: COMP } })).map((b) => [b.brandId, b.alias]));
  const rows = await db.competitorPrice.findMany({
    where: { competitor: COMP, match: "auto", extId: { not: null }, extUrl: { not: null } },
    select: { id: true, extUrl: true, product: { select: { title: true, modelCode: true, brandId: true, brand: { select: { name: true } } } } },
  });
  const hits = rows.filter((r) => {
    const item = parseSitemap(`<loc>https://www.kotsovolos.gr/${r.extUrl}</loc>`)[0];
    if (!item) return false;
    return matchByModel({ brand: r.product.brand.name, alias: aliases.get(r.product.brandId), model: r.product.modelCode }, [item]).kind !== "matched";
  });
  for (const r of hits) console.log(`${r.product.title} → ${r.extUrl}`);
  console.log(`${hits.length} από ${rows.length} auto ζευγάρια ${apply ? "γίνονται" : "θα γίνονταν"} πρόταση`);
  if (!apply || !hits.length) return;
  const n = await db.competitorPrice.updateMany({ where: { id: { in: hits.map((h) => h.id) }, match: "auto" }, data: { match: "suggested", lastError: NOTE } });
  console.log(`ενημερώθηκαν ${n.count}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
