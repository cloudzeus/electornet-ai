/**
 * Εξωτερικές διαστάσεις προϊόντος (εκατοστά) από τα χαρακτηριστικά της περιγραφής
 * του ERP — για το AR και το «χωράει στον χώρο μου» — και σύγκριση με όσα δηλώνει
 * ο κατασκευαστής στο EPREL.
 *
 * Το ERP γράφει τις διαστάσεις με εκατοντάδες τρόπους. Όσα μετράνε:
 * - **σειρά αξόνων**: στην ετικέτα («Διαστάσεις (ΥxΠxΒ)», «Π x Β x Υ», «ύψος πλάτος βάθος»),
 *   μέσα στην τιμή («(MxΠxY) 887x211x281», «Π445 x Υ538 x Β364»), με ελληνικά ή λατινικά
 *   γράμματα (Y/Υ, B/Β, H, W, D). Μ = μήκος· όταν συνυπάρχει με Π, το Μ είναι το πλάτος
 *   της πρόσοψης και το Π το βάθος (κλιματιστικά). Χωρίς σειρά: Π×Υ×Β, εκτός αν ο πρώτος
 *   αριθμός είναι σαφώς ο μεγαλύτερος (ψυγείο «185 x 60 x 65») → Υ×Π×Β.
 * - **μονάδα**: mm / cm / εκ. / m όπου γράφεται· αλλιώς από το μέγεθος (πάνω από 250 → mm).
 * - **τι μετράει**: η συσκευή. Η συσκευασία, η εσοχή εντοιχισμού και η εξωτερική μονάδα
 *   κλιματιστικού ΔΕΝ είναι οι διαστάσεις του προϊόντος στον χώρο και απορρίπτονται.
 *   Για τηλεοράσεις προτιμάται το «χωρίς βάση» (στον τοίχο), για κλιματιστικά η εσωτερική μονάδα.
 * - **εύρη** («847-867» με ρυθμιζόμενα πόδια): κρατάμε το μεγαλύτερο — για το «χωράει;» μετράει το χειρότερο.
 *
 * Καθαρές συναρτήσεις, χωρίς βάση.
 */
export interface Dims3 { w: number; h: number; d: number }
export type DimKind = "product" | "no-stand" | "with-stand" | "indoor-unit" | "no-door" | "axes";
export interface ExtractedDims extends Dims3 { kind: DimKind; key: string; value: string }

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const lower = (s: string) => strip(s).toLowerCase().replace(/ς/g, "σ");
const round1 = (n: number) => Math.round(n * 10) / 10;

type Axis = "w" | "h" | "d";
/** Γράμμα άξονα → άξονας. Τα λατινικά που μοιάζουν με ελληνικά (Y, B, H, M) γράφονται ανάκατα στο ERP. */
const LETTER: Record<string, Axis | "len"> = { "Π": "w", W: "w", "Υ": "h", Y: "h", H: "h", "Β": "d", B: "d", D: "d", "Μ": "len", M: "len", L: "len" };
const WORD: [RegExp, Axis | "len"][] = [[/πλατοσ|width/, "w"], [/υψοσ|height/, "h"], [/βαθοσ|depth/, "d"], [/μηκοσ|length/, "len"]];

/** Η σειρά των τριών αξόνων από ένα κείμενο («ΥxΠxΒ», «Π x Β x Υ», «ύψος πλάτος βάθος»), ή null. */
function axisOrder(text: string): Axis[] | null {
  const up = strip(text).toUpperCase();
  const m = /(?:^|[^A-ZΑ-Ω])([ΠΥΒΜWHDYBML])\s*[XΧ×*]\s*([ΠΥΒΜWHDYBML])\s*[XΧ×*]\s*([ΠΥΒΜWHDYBML])(?![A-ZΑ-Ω])/.exec(up);
  let raw: (Axis | "len")[] | null = m ? [LETTER[m[1]], LETTER[m[2]], LETTER[m[3]]] : null;
  if (!raw) {
    const low = lower(text);
    const found = WORD.map(([re, a]) => ({ a, i: low.search(re) })).filter((x) => x.i >= 0).sort((x, y) => x.i - y.i);
    if (found.length === 3) raw = found.map((f) => f.a);
  }
  if (!raw) return null;
  // Μήκος: η μακριά πλευρά της πρόσοψης. Αν υπάρχει και «πλάτος», τότε αυτό είναι το βάθος (887 x 211 x 281 κλιματιστικού).
  const out = raw.map((a) => (a === "len" ? "w" : a === "w" && raw!.includes("len") ? "d" : a)) as Axis[];
  return new Set(out).size === 3 ? out : null;
}

/** Μία τιμή → τρεις αριθμοί σε εκατοστά, με τη σειρά που δίνεται (ή που συνάγεται). */
export function parseDims(key: string, value: string, typeName = ""): Dims3 | null {
  let v = value.replace(/(\d),(\d)/g, "$1.$2").replace(/(\d)\s*[-–]\s*(\d)/g, (_, a: string, b: string) => `${a}~${b}`);
  // εύρος a~b → το μεγαλύτερο
  v = v.replace(/(\d+(?:\.\d+)?)~(\d+(?:\.\d+)?)/g, (_, a: string, b: string) => String(Math.max(parseFloat(a), parseFloat(b))));
  // «Π445 x Υ538 x Β364»: οι άξονες είναι κολλημένοι στους αριθμούς
  const inline = [...strip(v).toUpperCase().matchAll(/([ΠΥΒΜWHDYBML])\s*[:=]?\s*(\d+(?:\.\d+)?)/g)];
  let order: Axis[] | null = null, nums: number[];
  if (inline.length === 3 && new Set(inline.map((m) => m[1])).size === 3) {
    order = axisOrder(inline.map((m) => m[1]).join("x"));
    nums = inline.map((m) => parseFloat(m[2]));
  } else {
    nums = [...v.replace(/\([^)]*\)/g, " ").matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => parseFloat(m[1])).slice(0, 3);
  }
  if (nums.length < 3 || nums.some((n) => !(n > 0))) return null;
  const unitText = lower(`${key} ${value}`);
  const max = Math.max(...nums);
  const scale = /\bmm\b|χιλ/.test(unitText) ? 0.1 : /\bcm\b|εκ(?![a-zα-ω])|εκατοστ/.test(unitText) ? 1 : /(^|[^a-zα-ω])m\b|μετρ/.test(unitText) && max < 5 ? 100 : max > 250 ? 0.1 : 1;
  const build = (o: Axis[]) => { const x = { w: 0, h: 0, d: 0 }; o.forEach((a, i) => { x[a] = round1(nums[i] * scale); }); return x; };
  order ??= axisOrder(value) ?? axisOrder(key);
  if (!order) {
    // Η σειρά δεν γράφεται πουθενά. Αν ο τύπος έχει γνωστά όρια, κρατάμε τη διάταξη που χωράει σε αυτά
    // («750x285x200» κλιματιστικού = Π×Υ×Β, «84x60x50» πλυντηρίου = Υ×Π×Β)· αλλιώς Π×Υ×Β, ή Υ×Π×Β όταν ο πρώτος αριθμός ξεχωρίζει.
    const guesses: Axis[][] = [["w", "h", "d"], ["h", "w", "d"], ["w", "d", "h"], ["d", "w", "h"], ["h", "d", "w"], ["d", "h", "w"]];
    order = (typeName ? guesses.find((g) => plausible(build(g), typeName) === null && hasBounds(typeName)) : null) ?? (nums[0] > nums[1] * 1.4 && nums[0] > nums[2] * 1.4 ? guesses[1] : guesses[0]);
  }
  const r = build(order);
  return [r.w, r.h, r.d].every((n) => n >= 0.3 && n <= 400) ? r : null;
}

const oneAxis = (value: string): number | null => {
  const m = /(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*(\d+(?:[.,]\d+)?))?/.exec(value); if (!m) return null;
  const n = Math.max(parseFloat(m[1].replace(",", ".")), m[2] ? parseFloat(m[2].replace(",", ".")) : 0);
  const low = lower(value);
  const cm = /\bmm\b|χιλ/.test(low) ? n / 10 : /\bcm\b|εκ(?![a-zα-ω])|εκατοστ/.test(low) ? n : /(^|[^a-zα-ω])m\b/.test(low) && n < 5 ? n * 100 : n > 250 ? n / 10 : n;
  return cm >= 0.3 && cm <= 400 ? round1(cm) : null;
};

const REJECT = /συσκευασ|κουτι|χαρτοκιβωτ|packag|εντοιχισμ|εσοχη|ανοιγμα|κοπησ|εξωτερικ|βασησ(?![a-zα-ω])|ποδι|τηλεχειρ|οθονησ|καδου|θαλαμου|εστιασ|μεταφορ/;
const kindOf = (k: string): DimKind => (/χωρισ (τη |την )?βαση|without stand|χ βαση/.test(k) ? "no-stand" : /με (τη |την )?βαση|with stand/.test(k) ? "with-stand" : /εσωτερικ/.test(k) ? "indoor-unit" : /χωρισ (την )?πορτα/.test(k) ? "no-door" : "product");

/** Η καλύτερη εκδοχή διαστάσεων ενός προϊόντος από τα χαρακτηριστικά του, ή null. */
export function extractDims(specs: { key: string; value: string }[], typeName = ""): ExtractedDims | null {
  const type = lower(typeName);
  const found: ExtractedDims[] = [];
  for (const s of specs) {
    const k = lower(s.key);
    if (!/^διαστασ|^dimension|^μεγεθοσ συσκευησ/.test(k) || REJECT.test(k)) continue;
    const d = parseDims(s.key, s.value, typeName);
    if (d) found.push({ ...d, kind: kindOf(k), key: s.key, value: s.value });
  }
  if (!found.length) {
    // τρεις ξεχωριστές γραμμές «Πλάτος / Ύψος / Βάθος»
    const get = (re: RegExp) => { const s = specs.find((x) => re.test(lower(x.key)) && !REJECT.test(lower(x.key))); return s ? { v: oneAxis(s.value), s } : null; };
    const w = get(/^πλατοσ/), h = get(/^υψοσ/), d = get(/^βαθοσ/);
    if (w?.v && h?.v && d?.v) found.push({ w: w.v, h: h.v, d: d.v, kind: "axes", key: "Πλάτος / Ύψος / Βάθος", value: `${w.s.value} · ${h.s.value} · ${d.s.value}` });
  }
  if (!found.length) return null;
  const prefer: DimKind[] = /τηλεορασ|οθον|monitor/.test(type) ? ["no-stand", "product", "with-stand", "axes", "indoor-unit", "no-door"] : /κλιματιστ/.test(type) ? ["indoor-unit", "product", "axes", "no-stand", "with-stand", "no-door"] : ["product", "axes", "with-stand", "no-stand", "indoor-unit", "no-door"];
  return found.sort((a, b) => prefer.indexOf(a.kind) - prefer.indexOf(b.kind))[0];
}

// ---------- Σύγκριση δύο πηγών ----------

export type DimVerdict = "match" | "minor" | "conflict" | "swapped";
export interface DimComparison { verdict: DimVerdict; maxPct: number; maxCm: number; axis: Axis; note: string }

const AXIS_NAME: Record<Axis, string> = { w: "πλάτος", h: "ύψος", d: "βάθος" };

/**
 * ERP έναντι EPREL. Το EPREL δίνει ακέραια εκατοστά και συχνά ΧΩΡΙΣ προεξοχές (πόρτα,
 * λαβές, κουμπιά), άρα μικρές διαφορές — ειδικά στο βάθος — είναι αναμενόμενες:
 *   match    ≤ 2 εκ. ή ≤ 3 % σε κάθε άξονα
 *   minor    ≤ 6 εκ. ή ≤ 10 % (τυπικά το βάθος με/χωρίς πόρτα)
 *   swapped  ίδιοι αριθμοί σε άλλους άξονες — κάποιος έγραψε λάθος σειρά
 *   conflict οτιδήποτε άλλο: άλλο μοντέλο, λάθος μονάδα, λάθος καταχώριση
 */
export function compareDims(erp: Dims3, eprel: Dims3): DimComparison {
  const axes: Axis[] = ["w", "h", "d"];
  const diff = axes.map((a) => ({ a, cm: Math.abs(erp[a] - eprel[a]), pct: (Math.abs(erp[a] - eprel[a]) / Math.max(erp[a], eprel[a])) * 100 }));
  const worst = diff.slice().sort((x, y) => y.pct - x.pct)[0];
  const within = (cm: number, pct: number) => diff.every((x) => x.cm <= cm || x.pct <= pct);
  let verdict: DimVerdict = within(2, 3) ? "match" : within(6, 10) ? "minor" : "conflict";
  if (verdict === "conflict") {
    const s = (o: Dims3) => [o.w, o.h, o.d].sort((x, y) => x - y);
    const a = s(erp), b = s(eprel);
    if (a.every((n, i) => Math.abs(n - b[i]) <= 2 || (Math.abs(n - b[i]) / Math.max(n, b[i])) * 100 <= 3)) verdict = "swapped";
  }
  const note = verdict === "match" ? "συμφωνούν" : verdict === "swapped" ? "ίδιοι αριθμοί σε άλλους άξονες — λάθος σειρά σε μία από τις δύο πηγές"
    : `${AXIS_NAME[worst.a]}: ERP ${erp[worst.a]} εκ. έναντι EPREL ${eprel[worst.a]} εκ. (${worst.cm.toFixed(1)} εκ., ${worst.pct.toFixed(0)} %)`;
  return { verdict, maxPct: round1(worst.pct), maxCm: round1(worst.cm), axis: worst.a, note };
}

// ---------- Έλεγχος λογικής ανά τύπο ----------

/** Τυπικά όρια (εκ.) για τους μεγάλους τύπους: πιάνει λάθος μονάδα ή μπερδεμένους άξονες ακόμη και χωρίς EPREL. [w, h, d] → [min, max]. */
type Range = [number, number];
const BOUNDS: { re: RegExp; w: Range; h: Range; d: Range }[] = ([
  [/πλυντηρια ρουχων|στεγνωτηρ|πλυντηρια πιατων|πλυντηρια-στεγνωτηρια/, [38, 70], [60, 95], [35, 75]],
  [/ψυγειοκαταψυκτ/, [45, 100], [120, 215], [50, 85]],
  [/^ψυγεια|καταψυκτ/, [40, 200], [45, 215], [40, 95]], // οι μπαουλοκαταψύκτες φτάνουν τα 1,8 μ. πλάτος
  [/κλιματιστικα inverter|ημιεπαγγελματ/, [60, 130], [20, 40], [15, 35]],
  [/^φουρνοι$|^εντοιχιζομενοι φουρνοι/, [40, 95], [35, 65], [40, 65]],
  [/κουζινεσ/, [48, 95], [80, 95], [50, 70]],
] as [RegExp, Range, Range, Range][]).map(([re, w, h, d]) => ({ re, w, h, d }));
const hasBounds = (typeName: string) => BOUNDS.some((x) => x.re.test(lower(typeName)));
export function plausible(d: Dims3, typeName: string): string | null {
  const t = lower(typeName);
  const b = BOUNDS.find((x) => x.re.test(t)); if (!b) return null;
  const bad = (["w", "h", "d"] as Axis[]).filter((a) => d[a] < b[a][0] || d[a] > b[a][1]);
  return bad.length ? `εκτός τυπικών ορίων για «${typeName}»: ${bad.map((a) => `${AXIS_NAME[a]} ${d[a]} εκ.`).join(", ")}` : null;
}
