/**
 * Αριθμητικά κριτήρια πάνω στα χαρακτηριστικά των προϊόντων («SCOP ≥ 5», «Θόρυβος ≤ 40 dB», «HDMI ≥ 4», «R32»).
 * Τα χαρακτηριστικά έρχονται από πολλές πηγές και γράφονται ακατάστατα — εδώ διαβάζονται με έναν τρόπο. Καθαρές συναρτήσεις.
 */

export type Op = "gte" | "lte" | "eq" | "has";
export interface SpecCriterion { keys: string[]; op: Op; value: number | string; need: string }

/**
 * Ο πρώτος αριθμός μιας τιμής: «9.000 Btu/h» → 9000, «1.400 rpm» → 1400, «4,6» → 4.6, «4.3» → 4.3, «2.6 (0.6-3.1) kWatt» → 2.6,
 * «139,7 cm (55")» → 139.7. Τελεία με ακριβώς 3 ψηφία μετά = χιλιάδες· αλλιώς δεκαδικά.
 */
export function firstNumber(v: string): number | null {
  const m = v.match(/-?\d+(?:[.,]\d+)*/);
  if (!m) return null;
  let s = m[0];
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+$/.test(s) && !/,\d{1,2}$/.test(s)) s = s.replace(/,/g, "");
  else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Ίντσες σε τιμή όπως «139,7 cm (55")» ή «55"»: προτιμάται ο αριθμός με τα εισαγωγικά. */
export function numberOf(v: string, key = ""): number | null {
  const inch = v.match(/(\d+(?:[.,]\d+)?)\s*(?:"|″|''|ιντσ)/);
  if (inch && (/ίντσ|ιντσ|οθόνη|οθονη|screen/i.test(key) || !/\d\s*(cm|mm)\b/.test(v.slice(0, v.indexOf(inch[0]))))) return Number(inch[1].replace(",", "."));
  return firstNumber(v);
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ς/g, "σ").replace(/[\s\-‑_]+/g, "");

/** Περνά η τιμή το κριτήριο; null = δεν κρίνεται από αυτή την τιμή (π.χ. «Ναι» σε αριθμητικό κριτήριο). */
export function passes(value: string, c: Pick<SpecCriterion, "op" | "value">, key = ""): boolean | null {
  if (c.op === "has" || (c.op === "eq" && typeof c.value === "string")) return fold(value).includes(fold(String(c.value)));
  const t = typeof c.value === "number" ? c.value : firstNumber(String(c.value));
  // λίστα σκαλών («40 / 35 / 30 / 21 dB(A)»): «κάτω από» κρίνεται στη χαμηλότερη, «πάνω από» στην υψηλότερη
  const steps = /\d\s*\/\s*\d/.test(value) ? value.split("/").map((x) => firstNumber(x)).filter((x): x is number => x !== null) : [];
  const n = steps.length > 1 ? (c.op === "lte" ? Math.min(...steps) : c.op === "gte" ? Math.max(...steps) : steps[0]) : numberOf(value, key);
  if (n === null || t === null) return null;
  return c.op === "gte" ? n >= t : c.op === "lte" ? n <= t : Math.abs(n - t) <= Math.max(0.01, Math.abs(t) * 0.03);
}

/** Ένα προϊόν (όλες οι τιμές του για τα κλειδιά του κριτηρίου): περνά αν κάποια τιμή περνά· null αν καμία δεν κρίνεται. */
export function productPasses(values: { key: string; value: string }[], c: SpecCriterion): boolean | null {
  let judged = false;
  for (const v of values) { const p = passes(v.value, c, v.key); if (p) return true; if (p === false) judged = true; }
  return judged ? false : null;
}

export interface SpecKeyInfo { key: string; count: number; samples: string[]; min: number | null; max: number | null }

/** Από τις γραμμές (κλειδί, τιμή) μιας κατηγορίας: τα κλειδιά με αρκετά προϊόντα, δείγματα τιμών και αριθμητικό εύρος. */
export function indexSpecs(rows: { key: string; value: string; productId: string }[], minProducts: number): SpecKeyInfo[] {
  const by = new Map<string, { products: Set<string>; values: Map<string, number>; nums: number[] }>();
  for (const r of rows) {
    const e = by.get(r.key) ?? { products: new Set<string>(), values: new Map<string, number>(), nums: [] as number[] };
    e.products.add(r.productId); e.values.set(r.value, (e.values.get(r.value) ?? 0) + 1);
    const n = numberOf(r.value, r.key); if (n !== null) e.nums.push(n);
    by.set(r.key, e);
  }
  return [...by.entries()].filter(([, e]) => e.products.size >= minProducts).map(([key, e]) => {
    const numeric = e.nums.length >= e.products.size * 0.6;
    return { key, count: e.products.size, samples: [...e.values.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([v]) => v.slice(0, 40)), min: numeric ? Math.min(...e.nums) : null, max: numeric ? Math.max(...e.nums) : null };
  }).sort((a, b) => b.count - a.count);
}

const MEMORY_KEY = /ram|μνήμη|μνημη|memory|αποθηκ|storage|ssd|δίσκ|δισκ|capacity|χωρητικότητα$/i;

/**
 * RAM και αποθήκευση από τον τίτλο, όταν το προϊόν δεν έχει χαρακτηριστικά («8/256GB», «R7/16/512/11H», «2*8GB», «16GB/512GB», «1TB»).
 * Σε GB· RAM = έως 32, αποθήκευση = από 64 (καμία καταναλωτική συσκευή δεν μπερδεύει τα δύο).
 */
export function titleMemory(title: string): { ram: number | null; storage: number | null } {
  const nums: number[] = [];
  for (const m of title.matchAll(/(?<![\w.])(\d+)\s*\*\s*(\d+)\s*GB\b/gi)) nums.push(Number(m[1]) * Number(m[2]));
  const t = title.replace(/(?<![\w.])\d+\s*\*\s*\d+\s*GB\b/gi, " ");
  // με μονάδα (GB/TB) πάντα· «G» ή σκέτος αριθμός μόνο μέσα σε ομάδα με «/» (αλλιώς «5G», «iPhone 17» θα μετρούσαν)
  for (const m of t.matchAll(/(?<![\w.])(\d+)\s*(GB|TB|G)?(?=\s*(\/)|[\s,+)]|$)/gi)) {
    const unit = m[2]?.toUpperCase(), slash = !!m[3] || /\/\s*$/.test(t.slice(0, m.index));
    if ((!unit || unit === "G") && !slash) continue;
    nums.push(Number(m[1]) * (unit === "TB" ? 1024 : 1));
  }
  return { ram: nums.find((n) => n >= 2 && n <= 32) ?? null, storage: nums.find((n) => n >= 64) ?? null };
}

/** Κριτήριο μνήμης/αποθήκευσης πάνω στον τίτλο (null = δεν κρίνεται: άλλο κριτήριο ή ο τίτλος δεν το γράφει). */
export function titlePasses(title: string, c: SpecCriterion): boolean | null {
  if (typeof c.value !== "number" || c.op === "has" || !c.keys.some((k) => MEMORY_KEY.test(k))) return null;
  const mem = titleMemory(title), n = c.value <= 32 ? mem.ram : c.value >= 64 ? mem.storage : null;
  return n === null ? null : passes(String(n), c);
}
