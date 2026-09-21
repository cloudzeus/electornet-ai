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
export interface ExtractedDims extends Dims3 { kind: DimKind; key: string; value: string; /** οι αριθμοί της περιγραφής ήταν χιλιοστά (δηλωμένα ή > 250) */ fromMm?: boolean }

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
export function parseDims(key: string, value: string, typeName = ""): (Dims3 & { fromMm?: boolean }) | null {
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
  const max = Math.max(...nums);
  // η μονάδα της ΤΙΜΗΣ υπερισχύει της ετικέτας («Διαστάσεις (mm): 84,5 x 59,5 x 60 cm»)· χωρίς καμία: πάνω από 250 → χιλιοστά
  const scale = unitScale(value, max) ?? unitScale(key, max) ?? (max > 250 ? 0.1 : 1);
  // κάτω από 3 κρατάμε δύο δεκαδικά: «1,86» είναι ύψος σε μέτρα που θα γίνει 186 εκ. στην ομογενοποίηση, όχι 190
  const build = (o: Axis[]) => { const x = { w: 0, h: 0, d: 0 }; o.forEach((a, i) => { const n = nums[i] * scale; x[a] = n < 3 ? Math.round(n * 100) / 100 : round1(n); }); return x; };
  order ??= axisOrder(value) ?? axisOrder(key);
  if (!order) {
    // Η σειρά δεν γράφεται πουθενά. Αν ο τύπος έχει γνωστά όρια, κρατάμε τη διάταξη που χωράει σε αυτά
    // («750x285x200» κλιματιστικού = Π×Υ×Β, «84x60x50» πλυντηρίου = Υ×Π×Β)· αλλιώς Π×Υ×Β, ή Υ×Π×Β όταν ο πρώτος αριθμός ξεχωρίζει.
    const guesses: Axis[][] = [["w", "h", "d"], ["h", "w", "d"], ["w", "d", "h"], ["d", "w", "h"], ["h", "d", "w"], ["d", "h", "w"]];
    order = (typeName ? guesses.find((g) => plausible(build(g), typeName) === null && hasBounds(typeName)) : null) ?? (nums[0] > nums[1] * 1.4 && nums[0] > nums[2] * 1.4 ? guesses[1] : guesses[0]);
  }
  const r = build(order);
  return [r.w, r.h, r.d].every((n) => n >= 0.3 && n <= 400) ? { ...r, fromMm: scale === 0.1 } : null;
}

/** Μονάδα γραμμένη σε ένα κείμενο → συντελεστής προς εκατοστά, ή null. Πιάνει και το κολλητό «12.9mm» / «60cm» (το \\b δεν δουλεύει ανάμεσα σε ψηφίο και γράμμα). */
function unitScale(text: string, max: number): number | null {
  const t = lower(text);
  if (/(?<![a-zα-ω])mm+(?![a-zα-ω])|χιλ/.test(t)) return 0.1;
  if (/(?<![a-zα-ω])cm(?![a-zα-ω])|(?<![a-zα-ω])εκ(?![a-zα-ω])|εκατοστ/.test(t)) return max > 300 ? 0.1 : 1; // «330 x 150 x 275 εκ.» σιδερώματος: κανένα προϊόν μας δεν είναι 3 μέτρα
  if (/(?<![a-zα-ω])m(?![a-zα-ω])|μετρ/.test(t) && max < 5) return 100;
  return null;
}

const oneAxis = (value: string): number | null => {
  const m = /(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*(\d+(?:[.,]\d+)?))?/.exec(value); if (!m) return null;
  const n = Math.max(parseFloat(m[1].replace(",", ".")), m[2] ? parseFloat(m[2].replace(",", ".")) : 0);
  const low = lower(value);
  const cm = n * (unitScale(low, n) ?? (n > 250 ? 0.1 : 1));
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
    // οι τρεις γραμμές έχουν την ίδια μονάδα: «245 · 330 · 380» είναι όλα χιλιοστά, όχι το πρώτο εκατοστά και τα άλλα χιλιοστά
    if (w?.v && h?.v && d?.v && ![w, h, d].some((x) => /mm|χιλ|cm|εκ(?![a-zα-ω])|(^|[^a-zα-ω])m(?![a-zα-ω])/.test(lower(x!.s.value)))) {
      const rawN = [w, h, d].map((x) => parseFloat((/(\d+(?:[.,]\d+)?)/.exec(x!.s.value)?.[1] ?? "0").replace(",", ".")));
      if (Math.max(...rawN) > 250 && Math.min(...rawN) > 25) { w.v = round1(rawN[0] / 10); h.v = round1(rawN[1] / 10); d.v = round1(rawN[2] / 10); }
    }
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
  [/^ψυγεια|^μικρα ψυγεια/, [40, 125], [45, 215], [40, 90]], // side-by-side έως ~1,2 μ.
  [/καταψυκτ/, [40, 200], [45, 215], [40, 95]], // οι μπαουλοκαταψύκτες φτάνουν τα 1,8 μ. πλάτος
  [/κλιματιστικα inverter|ημιεπαγγελματ/, [60, 130], [20, 40], [15, 35]],
  [/^φουρνοι$|^εντοιχιζομενοι φουρνοι/, [40, 95], [35, 65], [40, 65]],
  [/κουζινεσ/, [48, 95], [80, 95], [50, 70]],
  [/^εστιεσ/, [25, 95], [2.5, 16], [30, 60]], // εντοιχιζόμενες: πλάκα λίγων εκατοστών
  [/φουρνοι μικροκυματων/, [35, 65], [20, 50], [25, 60]],
  [/^τηλεορασεισ/, [45, 235], [28, 140], [0.5, 50]], // χωρίς βάση μια OLED έχει πάχος 1,5 εκ.
] as [RegExp, Range, Range, Range][]).map(([re, w, h, d]) => ({ re, w, h, d }));
const hasBounds = (typeName: string) => BOUNDS.some((x) => x.re.test(lower(typeName)));
export function plausible(d: Dims3, typeName: string): string | null {
  const t = lower(typeName);
  const b = BOUNDS.find((x) => x.re.test(t)); if (!b) return null;
  const bad = (["w", "h", "d"] as Axis[]).filter((a) => d[a] < b[a][0] || d[a] > b[a][1]);
  return bad.length ? `εκτός τυπικών ορίων για «${typeName}»: ${bad.map((a) => `${AXIS_NAME[a]} ${d[a]} εκ.`).join(", ")}` : null;
}

// ---------- Ομογενοποίηση: ίδια μονάδα (εκ.) και ίδιοι άξονες (Π×Υ×Β) παντού ----------

/**
 * Εύρος αναφοράς ενός τύπου. `strict`: ρητά όρια ανά άξονα (μεγάλες συσκευές) — επιτρέπουν διόρθωση ανά άξονα και αλλαγή σειράς.
 * Αλλιώς `side`: το 10ο–90ό εκατοστημόριο της ΜΕΓΑΛΥΤΕΡΗΣ πλευράς, μόνο για ομοιογενείς τύπους — επιτρέπει μόνο ενιαία αλλαγή μονάδας.
 */
export type DimRef = { strict: true; w: Range; h: Range; d: Range } | { strict: false; side: Range };
export const boundsRef = (typeName: string): DimRef | null => { const b = BOUNDS.find((x) => x.re.test(lower(typeName))); return b ? { w: b.w, h: b.h, d: b.d, strict: true } : null; };
/**
 * Από τα ίδια τα δεδομένα ενός τύπου χωρίς ρητά όρια. Μόνο όταν ο τύπος είναι ομοιογενής (p90 ≤ 3 × p10 στη μεγάλη πλευρά,
 * ≥ 12 προϊόντα): στα «Φορητά Ηχεία» συνυπάρχουν ηχεία τσέπης και party ηχεία ενός μέτρου — εκεί καμία στατιστική δεν ξεχωρίζει το λάθος.
 */
export function spreadRef(all: Dims3[]): DimRef | null {
  if (all.length < 12) return null;
  const v = all.map((x) => Math.max(x.w, x.h, x.d)).sort((a, b) => a - b);
  const p10 = v[Math.floor(v.length * 0.1)], p90 = v[Math.floor(v.length * 0.9)];
  return p90 <= p10 * 3 ? { strict: false, side: [p10, p90] } : null;
}

const AXES: Axis[] = ["w", "h", "d"];
const PERMS: Axis[][] = [["w", "h", "d"], ["h", "w", "d"], ["w", "d", "h"], ["d", "w", "h"], ["h", "d", "w"], ["d", "h", "w"]];
const FACTORS = [1, 10, 100, 0.1, 0.01];
const UNIT_NAME: Record<number, string> = { 10: "ήταν γραμμένο σε δεκάδες εκ. ή με λάθος υποδιαστολή", 100: "ήταν γραμμένο σε μέτρα", 0.1: "ήταν γραμμένο σε χιλιοστά", 0.01: "λάθος υποδιαστολή" };

/**
 * Φέρνει μια τριάδα στα εκατοστά και στη σειρά Π×Υ×Β όταν η περιγραφή (ή το EPREL) έχει λάθος μονάδα ή σειρά:
 * «1,86 x 59,5 x 65» (ύψος σε μέτρα), «mm: 26.2 x 45.2 x 36,5» (γράφει mm, είναι εκ.), «5.9 x 58 x 51» εστίας (Υ×Π×Β χωρίς ετικέτα),
 * EPREL «545 × 143 × 555» (ύψος 1430 γραμμένο 143). Δοκιμάζει σειρές αξόνων και δυνάμεις του 10 και κρατά τη ΦΘΗΝΟΤΕΡΗ λύση
 * που χωράει στα όρια — μία ενιαία αλλαγή μονάδας κοστίζει 1, κάθε άξονας χωριστά 1, αλλαγή σειράς 1,5. Αν δύο διαφορετικές
 * λύσεις κοστίζουν το ίδιο, ή καμία δεν χωράει, δεν αγγίζει τίποτα. Χωρίς ρητά όρια (βλ. `spreadRef`) μόνο ενιαία αλλαγή μονάδας.
 */
export function unifyDims(d: Dims3, ref: DimRef | null, fromMm = false): { dims: Dims3; fix: string | null } {
  if (!ref) return { dims: d, fix: null };
  if (!ref.strict) {
    // μόνο όταν η μεγάλη πλευρά απέχει ≥ 4 φορές από ό,τι έχει ο τύπος, και μία δύναμη του 10 τη φέρνει καθαρά μέσα
    const m = Math.max(d.w, d.h, d.d), [lo, hi] = ref.side;
    if (m >= lo / 4 && m <= hi * 4) return { dims: d, fix: null };
    const f = [10, 0.1, 100, 0.01].find((k) => m * k >= lo / 1.5 && m * k <= hi * 1.5);
    return f ? { dims: { w: round1(d.w * f), h: round1(d.h * f), d: round1(d.d * f) }, fix: `Διορθώθηκε αυτόματα: όλες οι πλευρές: ${UNIT_NAME[f]}` } : { dims: d, fix: null };
  }
  const ok = (x: Dims3) => AXES.every((a) => x[a] >= ref[a][0] && x[a] <= ref[a][1]);
  if (ok(d)) return { dims: d, fix: null };
  const src = [d.w, d.h, d.d];
  let best: { cost: number; dims: Dims3; perm: Axis[]; f: number[] }[] = [];
  for (const perm of PERMS) for (const f0 of FACTORS) for (const f1 of FACTORS) for (const f2 of FACTORS) {
    const f = [f0, f1, f2], uniform = f0 === f1 && f1 === f2;
    // Ένας άξονας μόνος του αλλάζει μόνο όταν το λάθος ΕΞΗΓΕΙΤΑΙ ως μονάδα: μέτρα (τιμή < 3), εκατοστά ανάμεσα σε χιλιοστά (× 10),
    // χιλιοστά ανάμεσα σε εκατοστά (τιμή > 250). Ό,τι άλλο θα ήταν εικασία — μένει ως έχει και σημαίνεται «εκτός ορίων».
    if (!uniform && f.some((k, i) => k !== 1 && !((k === 100 && src[i] < 3) || (k === 10 && fromMm) || (k === 0.1 && !fromMm && src[i] > 250)))) continue;
    const x = { w: 0, h: 0, d: 0 }; perm.forEach((a, i) => { x[a] = round1(src[i] * f[i]); });
    if (!ok(x)) continue;
    const cost = (perm === PERMS[0] ? 0 : 1.5) + (uniform ? (f0 === 1 ? 0 : 1) : f.filter((k) => k !== 1).length) + f.reduce((n, k) => n + Math.abs(Math.log10(k)) * 0.01, 0);
    if (!best.length || cost < best[0].cost - 1e-9) best = [{ cost, dims: x, perm, f }];
    else if (Math.abs(cost - best[0].cost) < 1e-9 && !best.some((b) => AXES.every((a) => b.dims[a] === x[a]))) best.push({ cost, dims: x, perm, f });
  }
  if (best.length !== 1) return { dims: d, fix: null };
  const b = best[0], parts: string[] = [];
  if (b.perm !== PERMS[0]) parts.push(`οι αριθμοί ήταν με σειρά ${b.perm.map((a) => ({ w: "Π", h: "Υ", d: "Β" })[a]).join("×")}`);
  if (b.f[0] === b.f[1] && b.f[1] === b.f[2]) { if (b.f[0] !== 1) parts.push(`όλες οι πλευρές: ${UNIT_NAME[b.f[0]]}`); }
  else b.perm.forEach((a, i) => { if (b.f[i] !== 1) parts.push(`${AXIS_NAME[a]} ${src[i]} → ${b.dims[a]} εκ. (${UNIT_NAME[b.f[i]]})`); });
  return { dims: b.dims, fix: `Διορθώθηκε αυτόματα: ${parts.join(" · ")}` };
}
