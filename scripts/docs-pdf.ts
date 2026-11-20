/**
 * Τυπώνει ένα HTML έγγραφο του docs/ σε PDF (A4) με το Chrome του υπολογιστή — ίδια διαδρομή με το help:shots.
 *   npx tsx scripts/docs-pdf.ts docs/politiki-metaforikon-v2.html
 */
import { chromium } from "playwright-core";
import { resolve } from "node:path";

async function main() {
  const src = process.argv[2];
  if (!src) throw new Error("Δώσε το HTML: npx tsx scripts/docs-pdf.ts docs/<αρχείο>.html");
  const out = resolve(src.replace(/\.html$/, ".pdf"));
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  await page.goto(`file://${resolve(src)}`, { waitUntil: "networkidle" });
  await page.pdf({ path: out, format: "A4", printBackground: true, displayHeaderFooter: false });
  await browser.close();
  console.log(`✓ ${out}`);
}
main();
