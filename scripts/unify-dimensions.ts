/**
 * Ομογενοποίηση διαστάσεων όλων των προϊόντων στη βάση: πάντα εκατοστά, πάντα Π×Υ×Β (ERP και EPREL).
 * Ξαναδιαβάζει τις περιγραφές, διορθώνει λάθος μονάδα / μικτές μονάδες / λάθος σειρά αξόνων όπου το λάθος εξηγείται,
 * και ξαναϋπολογίζει την ετυμηγορία ERP ↔ EPREL. Γράφει μόνο ό,τι άλλαξε· τρέχει όσες φορές χρειαστεί.
 *
 *   npx tsx --conditions=react-server scripts/unify-dimensions.ts
 */
import "dotenv/config";
import { db } from "../lib/db";
import { projectDimensions } from "../lib/catalog/product-dimensions";

async function main() {
  const t0 = Date.now();
  const r = await projectDimensions();
  console.log(`Προϊόντα ${r.products.toLocaleString("el-GR")} · με διαστάσεις ${r.withDims.toLocaleString("el-GR")} · νέες ${r.created} · αλλαγμένες ${r.updated} · αφαιρέθηκαν ${r.removed}`);
  console.log(`Διορθώθηκαν αυτόματα: ERP ${r.fixed} · EPREL ${r.eprelFixed} · εκτός τυπικών ορίων χωρίς ασφαλή λύση: ${r.outOfBounds}`);
  console.log(`ERP ↔ EPREL: ${JSON.stringify(r.status)} · ${Math.round((Date.now() - t0) / 1000)} s`);
  const fixes = await db.productDimension.findMany({ where: { warning: { startsWith: "Διορθώθηκε" } }, take: 400, select: { source: true, w: true, h: true, d: true, rawValue: true, warning: true, product: { select: { sku: true, category: { select: { name: true } } } } } });
  for (const f of fixes.slice(0, 12)) console.log(`  ${f.product.category.name} · ${f.product.sku} · ${f.source}: «${(f.rawValue ?? "").slice(0, 40)}» → ${f.w} × ${f.h} × ${f.d} εκ.`);
  await db.$disconnect();
}
main().catch(async (e) => { console.error("ΣΦΑΛΜΑ:", e instanceof Error ? e.message : e); await db.$disconnect(); process.exit(1); });
