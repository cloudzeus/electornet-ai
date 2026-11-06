/**
 * Γράφει τον μόνιμο οδηγό αγοράς κάθε κατηγορίας για τον Ερμή (lib/advisor/guides.json — βλ. lib/advisor/guides.ts).
 * Μόνο κατηγορίες με ≥ 3 είδη· ξαναγράφει μια κατηγορία μόνο αν άλλαξαν τα κλειδιά χαρακτηριστικών της (ή με --force).
 *
 *   npm run advisor:guides                    # νέες + όσες άλλαξαν
 *   npm run advisor:guides -- --force         # όλες από την αρχή
 *   npm run advisor:guides -- --only <slug>   # μία
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { db } from "../lib/db";
import { chat, parseJson } from "../lib/ai/openrouter";
import { SHOP_SOURCES } from "../lib/data/db-catalog";
import { indexSpecs, type SpecKeyInfo } from "../lib/advisor/spec-criteria";
import type { CategoryGuide, GuideRule } from "../lib/advisor/guides";

const FILE = path.join(process.cwd(), "lib/advisor/guides.json");
const args = process.argv.slice(2);
const force = args.includes("--force"), only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
// ίδιο εύρος με τη σκηνή (WIDE στο engine): ο οδηγός ισχύει και για το site
const WHERE = { source: { in: SHOP_SOURCES }, active: true, media: { some: { kind: "image", hidden: false } } } as const;

async function write(name: string, parent: string, n: number, index: SpecKeyInfo[], titles: string[]): Promise<Pick<CategoryGuide, "guide" | "rules"> | null> {
  const r = await chat({
    feature: "advisor-guides", model: "main", json: true, maxTokens: 2500, temperature: 0.2, timeoutMs: 90000, reasoning: "medium",
    messages: [
      { role: "system", content: `Είσαι έμπειρος πωλητής και τεχνικός ηλεκτρικών/ηλεκτρονικών ειδών στην Ελλάδα. Γράφεις τον ΟΔΗΓΟ ΑΓΟΡΑΣ μιας κατηγορίας για τον σύμβουλο πωλήσεων του καταστήματος: τη γενική γνώση που χρειάζεται για να ΚΡΙΝΕΙ τα χαρακτηριστικά και να συμβουλέψει σε σύνθετες ερωτήσεις («πολύ φωτεινό δωμάτιο», «για μοντάζ», «για ηλικιωμένο», «για μικρό μπάνιο»). ΟΧΙ προϊόντα, μάρκες ή τιμές — μόνο κριτήρια.
Απαντάς ΜΟΝΟ με JSON {"guide": string, "rules": [{"when": string, "keys": string[], "op": "gte"|"lte"|"has", "value": number|string, "why": string}]}.
- "guide": ελληνικά, έως 170 λέξεις, γραμμές που ξεκινούν με «- ». Τι μετράει περισσότερο σε αυτή την κατηγορία, ποια νούμερα είναι χαμηλά / καλά / κορυφαία (με μονάδες), οι βασικές συμβιβασμοί (τι κερδίζεις πληρώνοντας παραπάνω), τεχνολογίες και τι σημαίνουν στην πράξη, συχνά λάθη αγοράς. Γράψε ό,τι ισχύει γενικά — ακόμα κι αν δεν υπάρχει στα χαρακτηριστικά.
- "rules": 4–12 συχνές καταστάσεις πελάτη → κριτήριο πάνω στα ΧΑΡΑΚΤΗΡΙΣΤΙΚΑ. "keys" ΑΚΡΙΒΩΣ όπως στη λίστα (όλα όσα σημαίνουν το ίδιο). Αριθμός στη μονάδα των δειγμάτων και ΜΕΣΑ στο εύρος [min–max] — ένα κριτήριο που δεν πληροί κανένα είδος ή που το πληρούν όλα δεν βοηθά. "has" μόνο με λέξη που υπάρχει στα δείγματα. "when" = η κατάσταση με τα λόγια του πελάτη (έως 8 λέξεις)· "why" = μία φράση. Αν η λίστα δεν έχει κατάλληλο κλειδί, rules=[].` },
      { role: "user", content: `ΚΑΤΗΓΟΡΙΑ: ${parent} › ${name} (${n} είδη)\nΠΑΡΑΔΕΙΓΜΑΤΑ ΤΙΤΛΩΝ: ${titles.join(" | ")}\n\nΧΑΡΑΚΤΗΡΙΣΤΙΚΑ (κλειδί | είδη | εύρος | δείγματα):\n${index.map((k) => `${k.key} | ${k.count} | ${k.min !== null ? `${k.min}–${k.max}` : "—"} | ${k.samples.join(" · ")}`).join("\n") || "(κανένα)"}` },
    ],
  }).catch((e) => { console.error(`  ${name}: ${e.message}`); return null; });
  const j = r ? parseJson<{ guide?: string; rules?: Partial<GuideRule>[] }>(r.text) : null;
  if (!j?.guide || j.guide.length < 80) return null;
  const by = new Map(index.map((k) => [k.key, k]));
  const rules = (j.rules ?? []).flatMap((x): GuideRule[] => {
    const keys = (x.keys ?? []).filter((k) => by.has(k));
    if (!keys.length || !x.when || !x.op || !["gte", "lte", "has"].includes(x.op) || x.value === undefined || x.value === null || x.value === "") return [];
    if (x.op !== "has") {
      const v = Number(x.value), k = by.get(keys[0])!;
      if (!Number.isFinite(v) || k.min === null || v <= k.min || v >= k.max!) return []; // έξω από το εύρος ή το πληρούν/αποκλείουν όλα
      return [{ when: x.when, keys, op: x.op, value: v, why: x.why ?? "" }];
    }
    return [{ when: x.when, keys, op: "has", value: String(x.value), why: x.why ?? "" }];
  });
  return { guide: j.guide.trim(), rules };
}

(async () => {
  const guides: Record<string, CategoryGuide> = JSON.parse(readFileSync(FILE, "utf8"));
  const cats = await db.category.findMany({ where: { depth: 2, ...(only ? { slug: only } : {}) }, select: { id: true, slug: true, name: true, parent: { select: { name: true } } } });
  const counts = new Map((await db.product.groupBy({ by: ["categoryId"], where: WHERE, _count: true })).map((r) => [r.categoryId, r._count]));
  const todo = cats.filter((c) => (counts.get(c.id) ?? 0) >= 3);
  let made = 0, kept = 0, failed = 0;
  const queue = [...todo];
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      const n = counts.get(c.id)!, where = { ...WHERE, categoryId: c.id };
      const rows = await db.spec.findMany({ where: { product: where }, select: { key: true, value: true, productId: true } });
      // ίδιο κατώφλι με το specIndex του engine
      const index = indexSpecs(rows, Math.min(Math.max(2, Math.ceil(n * 0.5)), Math.max(5, Math.round(n * 0.15)))).slice(0, 80);
      const keysHash = createHash("sha1").update(index.map((k) => k.key).sort().join("|")).digest("hex").slice(0, 12);
      if (!force && guides[c.id]?.keysHash === keysHash) { kept++; continue; }
      const titles = (await db.product.findMany({ where, select: { title: true }, take: 8, orderBy: { price: "desc" } })).map((p) => p.title.slice(0, 70));
      const g = await write(c.name, c.parent?.name ?? "", n, index, titles);
      if (!g) { failed++; console.log(`✗ ${c.name}`); continue; }
      guides[c.id] = { name: c.name, slug: c.slug, keysHash, at: new Date().toISOString().slice(0, 10), ...g };
      made++; console.log(`✓ ${c.name} (${n} είδη, ${index.length} κλειδιά, ${g.rules.length} κανόνες)`);
      writeFileSync(FILE, JSON.stringify(guides, null, 1) + "\n"); // σε κάθε βήμα: ένα σφάλμα στη μέση δεν χάνει όσα γράφτηκαν
    }
  }));
  console.log(`\n${made} γράφτηκαν · ${kept} ίδιοι · ${failed} απέτυχαν · σύνολο ${Object.keys(guides).length}`);
  await db.$disconnect(); process.exit(failed ? 1 : 0);
})();
