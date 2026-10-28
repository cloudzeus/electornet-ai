import "server-only";
import { db } from "@/lib/db";
import { chat, getAi, overBudget, parseJson } from "@/lib/ai/openrouter";
import { SPEC_PREFIX, CATEGORY_PAIR } from "@/lib/catalog/xml-import/parse-core";
import { suggestColumn, unresolvedColumns, duplicateTargets, type ColumnSuggestion, type Confidence } from "@/lib/catalog/xml-import/suggest-core";
import type { Target } from "@/lib/catalog/foreign-import/core";
import type { Transform } from "@/lib/catalog/xml-import/transform-core";

/**
 * Προτάσεις αντιστοίχισης για ένα XML feed: **κανόνες πρώτα, AI μόνο για ό,τι έμεινε** (προσέγγιση Γ του spec).
 *
 * Στο δείγμα της Estia οι κανόνες λύνουν 66 από 74 στήλες· στο AI πάνε 8. Τρεις κλήσεις το πολύ, **μία φορά ανά feed**
 * και ποτέ ανά προϊόν — γι' αυτό και είναι φθηνό. Η τελική αντιστοίχιση αποθηκεύεται στο `SupplierFeed`, άρα το
 * επόμενο τρέξιμο δεν καλεί AI καθόλου.
 *
 * Χωρίς κλειδί, πάνω από το ημερήσιο όριο, timeout ή άκυρο JSON: επιστρέφονται μόνο τα rule-based με `aiUsed: false`
 * και **κανένα σφάλμα στον χρήστη** — ο οδηγός δουλεύει πλήρως, απλώς με λιγότερα προ-συμπληρωμένα.
 */

/** Πόσα δείγματα τιμών ανά στήλη δίνονται στο AI (και φαίνονται στο βήμα ③). */
export const SAMPLES = 5;
/** Πάνω από τόσες κατηγορίες δικές μας, το prompt γίνεται ακριβό — στέλνονται οι πιο πιθανές (ίδιο πρώτο γράμμα/λέξη). */
const MAX_CATS = 400;

export interface CategorySuggestion { categoryId: string | null; specGroupS1Id: number | null; confidence: Confidence }
/** Η ετικέτα του feed → η δική μας ονομασία χαρακτηριστικού (`null` = μένει ως είναι). Το ταίριασμα με το `S1SpecDef` το κάνει ο υπάρχων `rekeySpecs` ανά ομάδα. */
export interface SpecSuggestion { label: string | null; confidence: Confidence }

export interface MappingSuggestion {
  columns: Record<number, ColumnSuggestion>;
  categories: Record<string, CategorySuggestion>;
  specs: Record<string, SpecSuggestion>;
  /** στήλες που δείχνουν στον ίδιο μοναδικό στόχο — το βήμα ③ τις δείχνει ως σύγκρουση */
  duplicates: { label: string; headers: string[] }[];
  aiUsed: boolean;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Οι τιμές μιας στήλης: έως `SAMPLES` μη κενές, διακριτές, με τη σειρά που εμφανίστηκαν. */
function samplesOf(matrix: string[][], i: number): string[] {
  const out: string[] = [];
  for (let r = 1; r < matrix.length && out.length < SAMPLES; r++) {
    const v = matrix[r][i];
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

/** Οι διακριτές τιμές της στήλης κατηγορίας (το πλήρες ζεύγος), με πλήθος προϊόντων. */
function categoryValues(headers: string[], matrix: string[][]): { value: string; n: number }[] {
  const i = headers.indexOf(CATEGORY_PAIR) >= 0 ? headers.indexOf(CATEGORY_PAIR) : headers.indexOf("Category");
  if (i < 0) return [];
  const n = new Map<string, number>();
  for (let r = 1; r < matrix.length; r++) {
    const v = matrix[r][i];
    if (v) n.set(v, (n.get(v) ?? 0) + 1);
  }
  return [...n].map(([value, count]) => ({ value, n: count })).sort((a, b) => b.n - a.n);
}

export async function suggestMapping(input: { headers: string[]; matrix: string[][] }): Promise<MappingSuggestion> {
  const { headers, matrix } = input;

  // ---- 1. Κανόνες (καμία κλήση, πάντα διαθέσιμοι) ----
  const columns: Record<number, ColumnSuggestion> = {};
  headers.forEach((h, i) => { columns[i] = suggestColumn(h, samplesOf(matrix, i)); });

  const cats = categoryValues(headers, matrix);
  const specLabels = headers.filter((h) => h.startsWith(SPEC_PREFIX)).map((h) => h.slice(SPEC_PREFIX.length));

  const categories: Record<string, CategorySuggestion> = {};
  const specs: Record<string, SpecSuggestion> = {};

  // Κατηγορίες: ταίριασμα ονόματος χωρίς τόνους πριν το AI — τα προφανή δεν κοστίζουν τίποτα.
  const ourCats = await db.category.findMany({ where: { active: true }, select: { id: true, name: true, erpCode: true }, orderBy: { name: "asc" } });
  const catByName = new Map(ourCats.map((c) => [norm(c.name), c]));
  /** Η ομάδα χαρακτηριστικών βγαίνει από το erpCode της κατηγορίας («s1:g:<id>») όπου υπάρχει. */
  const groupOfCat = (erpCode: string | null) => {
    const m = /^s1:g:(\d+)$/.exec(erpCode ?? "");
    return m ? Number(m[1]) : null;
  };
  for (const { value } of cats) {
    // Το φύλλο του ζεύγους είναι το πιο πιθανό να ταιριάξει με δική μας κατηγορία.
    const leaf = norm(value.split("›").pop() ?? value);
    const hit = catByName.get(leaf);
    categories[value] = hit
      ? { categoryId: hit.id, specGroupS1Id: groupOfCat(hit.erpCode), confidence: "sure" }
      : { categoryId: null, specGroupS1Id: null, confidence: "unsure" };
  }
  // Χαρακτηριστικά: ετικέτα που ταιριάζει με όνομα ομάδας/χαρακτηριστικού μας μένει ως είναι.
  const ourSpecNames = new Set((await db.s1SpecDef.findMany({ where: { missing: false, active: true }, select: { name: true }, distinct: ["name"] })).map((s) => norm(s.name)));
  for (const label of specLabels) specs[label] = ourSpecNames.has(norm(label)) ? { label: null, confidence: "sure" } : { label: null, confidence: "unsure" };

  const duplicates = duplicateTargets(columns, headers);
  const base: MappingSuggestion = { columns, categories, specs, duplicates, aiUsed: false };

  // ---- 2. AI, μόνο για τα «unsure» ----
  const cfg = await getAi();
  if (!cfg || (await overBudget(cfg))) return base;

  const askCols = unresolvedColumns(columns);
  const askCats = Object.entries(categories).filter(([, c]) => c.confidence === "unsure").map(([v]) => v);
  const askSpecs = Object.entries(specs).filter(([, s]) => s.confidence === "unsure").map(([l]) => l);
  if (!askCols.length && !askCats.length && !askSpecs.length) return base;

  let aiUsed = false;
  const ask = async <T>(system: string, user: unknown): Promise<T | null> => {
    const r = await chat({ feature: "xml-mapping", messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(user) }], json: true, maxTokens: Math.max(cfg.maxTokens, 1800), reasoning: "low", timeoutMs: 30000 }).catch(() => null);
    if (!r) return null;
    const j = parseJson<T>(r.text);
    if (j) aiUsed = true;
    return j;
  };

  // (α) Στήλες
  if (askCols.length) {
    const j = await ask<{ columns?: { header: string; target: string; label?: string; unit?: string; why?: string }[] }>(
      `Αντιστοιχίζεις στήλες από XML feed προμηθευτή ηλεκτρικών ειδών στα πεδία ενός e-shop. Απαντάς ΜΟΝΟ με JSON: {"columns":[{"header":string,"target":"ignore"|"spec"|"name"|"barcode"|"factoryCode"|"shortDesc"|"descText"|"guaranteeMonths"|"widthCm"|"heightCm"|"lengthCm"|"weightKg","label":string (μόνο για target "spec": η ελληνική ετικέτα),"unit":"none"|"g_kg"|"mm_cm"|"cm_mm"|"m_cm" (μόνο για αριθμητικά πεδία),"why":string (έως 12 λέξεις, ελληνικά)}]}. Κανόνες: ημερομηνίες, διαθεσιμότητα, εσωτερικά κλειδιά και ό,τι δεν ταιριάζει σε πεδίο → "ignore". Τεχνικό στοιχείο του προϊόντος (υλικό, χωρητικότητα, διάμετρος) → "spec" με ελληνική ετικέτα. Μην μαντεύεις: σε αμφιβολία "ignore".`,
      { columns: askCols.map((i) => ({ header: headers[i], samples: samplesOf(matrix, i) })) },
    );
    for (const c of j?.columns ?? []) {
      const i = headers.indexOf(c.header);
      if (i < 0 || columns[i]?.confidence === "sure") continue;
      const target = aiTarget(c.target, c.label);
      if (!target) continue;
      columns[i] = { target, transform: aiUnit(c.unit), confidence: "unsure", ...(c.why ? { why: c.why.trim() } : {}) };
    }
  }

  // (β) Κατηγορίες
  if (askCats.length) {
    const pool = ourCats.slice(0, MAX_CATS).map((c) => ({ id: c.id, name: c.name, group: groupOfCat(c.erpCode) }));
    const j = await ask<{ categories?: { value: string; id?: string | null; sure?: boolean }[] }>(
      `Αντιστοιχίζεις κατηγορίες προμηθευτή στις κατηγορίες ενός e-shop ηλεκτρικών. Απαντάς ΜΟΝΟ με JSON: {"categories":[{"value":string (η κατηγορία του προμηθευτή, όπως σου δόθηκε),"id":string|null (id δικής μας κατηγορίας, ή null αν δεν ταιριάζει καμία),"sure":boolean}]}. Μην μαντεύεις: όταν δεν υπάρχει καθαρό ταίριασμα βάλε null.`,
      { supplier: askCats, ours: pool },
    );
    for (const c of j?.categories ?? []) {
      if (!categories[c.value] || categories[c.value].confidence === "sure") continue;
      const hit = c.id ? ourCats.find((o) => o.id === c.id) : null;
      if (hit) categories[c.value] = { categoryId: hit.id, specGroupS1Id: groupOfCat(hit.erpCode), confidence: "unsure" };
    }
  }

  // (γ) Ετικέτες χαρακτηριστικών
  if (askSpecs.length) {
    const names = [...ourSpecNames].slice(0, 600);
    const j = await ask<{ specs?: { from: string; to?: string | null }[] }>(
      `Αντιστοιχίζεις ετικέτες χαρακτηριστικών προμηθευτή στις ονομασίες που χρησιμοποιεί ένα e-shop. Απαντάς ΜΟΝΟ με JSON: {"specs":[{"from":string (η ετικέτα του προμηθευτή),"to":string|null (δική μας ονομασία από τη λίστα, ή null για να μείνει ως είναι)}]}. Μόνο ταιριάσματα που είναι το ίδιο πράγμα με άλλη ονομασία — αλλιώς null.`,
      { supplier: askSpecs, ours: names },
    );
    for (const s of j?.specs ?? []) {
      if (!specs[s.from] || specs[s.from].confidence === "sure") continue;
      const to = (s.to ?? "").trim();
      if (to && ourSpecNames.has(norm(to))) specs[s.from] = { label: to, confidence: "unsure" };
    }
  }

  return { columns, categories, specs, duplicates: duplicateTargets(columns, headers), aiUsed };
}

const FIELDS = new Set(["name", "barcode", "factoryCode", "shortDesc", "descText", "guaranteeMonths", "widthCm", "heightCm", "lengthCm", "weightKg"]);
/** Η απάντηση του AI → στόχος, ή `null` όταν είναι άκυρη. Τίποτα δεν περνά χωρίς έλεγχο. */
function aiTarget(kind: string | undefined, label: string | undefined): Target | null {
  const k = (kind ?? "").trim();
  if (k === "ignore") return { kind: "ignore" };
  if (k === "spec") { const l = (label ?? "").trim(); return l ? { kind: "spec", label: l } : null; }
  return FIELDS.has(k) ? ({ kind: "field", key: k as Exclude<Target & { kind: "field" }, never>["key"] }) : null;
}
const UNITS = new Set<Transform>(["none", "g_kg", "kg_g", "mm_cm", "cm_mm", "m_cm"]);
const aiUnit = (u: string | undefined): Transform => (UNITS.has((u ?? "none") as Transform) ? ((u ?? "none") as Transform) : "none");
