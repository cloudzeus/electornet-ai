/**
 * Χαρτογράφηση των custom (CCC) πινάκων και πεδίων του SoftOne.
 * ΜΟΝΟ μεταδεδομένα: getObjects → getObjectTables → getTableFields. Δεν
 * εκτελεί λίστες, αναφορές ή scripts και δεν διαβάζει δεδομένα πελατών.
 * Τρέξε: npx tsx --conditions=react-server scripts/s1-custom-schema.ts
 */
try { process.loadEnvFile(); } catch {}
import { writeFileSync } from "node:fs";
import { s1 } from "../lib/softone";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isCustom = (n: string) => /^\$?CCC/i.test(n);
// Βασικά αντικείμενα του e-shop: εδώ ψάχνουμε custom πεδία πάνω σε standard πίνακες
const CORE = ["ITEM", "SERVICE", "CUSTOMER", "SUPPLIER", "SALDOC", "RETAILDOC", "PURDOC", "ITEDOC", "INST", "SOACTION", "ITECATEGORY", "ITEGROUP", "MTRMARK", "MTRMANFCTR", "WHOUSE", "BRANCH", "VAT", "PAYMENT", "SHIPMENT", "SOCARRIER", "PRCRULE", "TRDBRANCH"];

interface Field { name: string; caption?: string; type?: string; size?: number; editor?: string; required?: boolean }
interface TableOut { name: string; caption?: string; custom: boolean; fields: Field[]; customFields: Field[] }
interface ObjOut { name: string; type?: string; caption?: string; custom: boolean; tables: TableOut[]; error?: string }

async function main() {
  const all = await s1("getObjects", {});
  if (all.success === false) throw new Error(all.error);
  const objects: { name: string; type?: string; caption?: string }[] = all.objects ?? [];
  const customObjs = objects.filter((o) => isCustom(o.name));
  const targets = [...customObjs, ...CORE.map((n) => objects.find((o) => o.name.toUpperCase() === n) ?? { name: n })];
  console.log(`objects: ${objects.length} · custom (CCC): ${customObjs.length} · core: ${CORE.length}`);
  const out: ObjOut[] = [];
  let calls = 1;
  for (const o of targets) {
    const rec: ObjOut = { name: o.name, type: o.type, caption: o.caption, custom: isCustom(o.name), tables: [] };
    const t = await s1("getObjectTables", { OBJECT: o.name }); calls++; await sleep(120);
    if (t.success === false) { rec.error = String(t.error).slice(0, 120); out.push(rec); console.log(`  ${o.name}: ✗ ${rec.error}`); continue; }
    const tables: { name: string; caption?: string }[] = t.tables ?? [];
    for (const tb of tables) {
      // Σε standard αντικείμενο διαβάζουμε πεδία όλων των πινάκων (τα CCC πεδία κρύβονται παντού)· σε custom αντικείμενο το ίδιο.
      const f = await s1("getTableFields", { OBJECT: o.name, TABLE: tb.name }); calls++; await sleep(120);
      const fields: Field[] = f.success === false ? [] : (f.fields ?? []).map((x: Record<string, unknown>) => ({ name: String(x.name), caption: x.caption as string, type: x.type as string, size: x.size as number, editor: (x.editor as string) || undefined, required: !!x.required }));
      const customFields = fields.filter((x) => isCustom(x.name));
      rec.tables.push({ name: tb.name, caption: tb.caption, custom: isCustom(tb.name), fields: isCustom(tb.name) || rec.custom ? fields : [], customFields });
    }
    const ct = rec.tables.filter((x) => x.custom).length, cf = rec.tables.reduce((a, x) => a + x.customFields.length, 0);
    console.log(`  ${o.name}: ${tables.length} tables · ${ct} custom tables · ${cf} custom fields`);
    out.push(rec);
  }
  writeFileSync("docs/softone-custom-schema.json", JSON.stringify({ at: new Date().toISOString(), calls, objects: out }, null, 1));
  console.log(`done: ${calls} metadata calls → docs/softone-custom-schema.json`);
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
