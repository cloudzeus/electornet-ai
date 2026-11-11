// Καθαρό: πρόταση κατηγορίας Κωτσόβολου για δική μας κατηγορία. Χωρίς DB/δίκτυο.

const parentOf = (p: string) => p.split("/").slice(0, -1);

/** Το κοινό ριζικό: ο μακρύτερος κοινός πρόγονος των γονέων των διαδρομών (fridges/fridge-freezers → fridges). */
export function commonRoot(paths: string[]): string | null {
  if (!paths.length) return null;
  let root = parentOf(paths[0]);
  for (const p of paths.slice(1)) {
    const s = parentOf(p);
    let i = 0;
    while (i < root.length && i < s.length && root[i] === s[i]) i++;
    root = root.slice(0, i);
  }
  return root.length ? root.join("/") : null;
}

/** Υπάρχει στον Κωτσόβολο: ίδια διαδρομή ή πρόγονος μιας γνωστής. */
export const knownPath = (path: string, known: string[]) => known.some((k) => k === path || k.startsWith(path + "/"));

// ---- Ταίριασμα με το όνομα ----
// Οι διαδρομές τους είναι αγγλικά ή greeklish (household-appliances/hoods/aporrofhthres). Το όνομά μας γίνεται greeklish
// και, για τα συνηθισμένα, μεταφράζεται με ένα μικρό λεξικό ριζών.
const DICT: [string, string][] = [
  ["ψυγειοκαταψ", "fridge-freezers"], ["ψυγ", "fridges"], ["καταψ", "freezers"], ["πλυντ", "washing"], ["ρουχ", "washing-machines"], ["πιατ", "dish"],
  ["στεγν", "dryers"], ["κουζιν", "cookers"], ["απορροφ", "hoods"], ["φουρν", "ovens"], ["μικροκυμ", "microwaves"], ["εστι", "hobs"],
  ["εντοιχ", "built"], ["κλιματ", "air-condition"], ["σκουπ", "vacuum-cleaners"], ["σιδερ", "ironing"], ["καφε", "coffeemakers"],
  ["τοστ", "toasters"], ["φρυγαν", "toasters"], ["μπλεντ", "blenders"], ["μιξερ", "mixer"], ["τηλεορ", "televisions"], ["οθον", "monitors"],
  ["ποντικ", "mouse"], ["πληκτρολ", "keyboards"], ["εκτυπωτ", "printers"], ["ηχει", "speakers"], ["θερμαστ", "heaters"], ["laptop", "notebook"],
];
const STOP = new Set(["ολες", "ολοι", "ολα", "οι", "τα", "η", "ο", "της", "των", "του", "και", "για", "με", "σε"]);
const ACC_PATH = /aksesouar|accessor|thikes|fortist|prostasia|kalwdia|cables|antallaktika|cases|power-bank|chargers|batter|consumables|brackets|eksartimata/;
const ACC_NAME = /αξεσουαρ|θηκ|φορτιστ|προστασ|καλωδ|ανταλλακτ|μπαταρ|τσαντ|σακουλ|αναλωσ|εξαρτημ|power|bank|βασεις/;
const ROOTS = new Set(["household-appliances", "small-home-appliances", "air-condition-heaters", "computing", "mobile-phones-gps", "sound-vision", "gaming-gadgets", "imaging", "personal-care", "kipos-ergaleia-spiti"]);
/** Ρητές περιπτώσεις: τα κινητά τους είναι μόνο στα smartphones (τα «kinita-tilefona» και τα αξεσουάρ δεν είναι). */
const OVERRIDES: [RegExp, string][] = [[/κινητ|smartphone/, "mobile-phones-gps/mobile-phones/smartphones"]];

const GR: Record<string, string> = { α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i", κ: "k", λ: "l", μ: "m", ν: "n", ξ: "x", ο: "o", π: "p", ρ: "r", σ: "s", ς: "s", τ: "t", υ: "i", φ: "f", χ: "x", ψ: "ps", ω: "o" };
const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Ίδια μορφή και για τις δύο πλευρές: h/y → i, w → o, ks → x (aporrofhthres ≈ aporrofitires). */
const canon = (s: string) => [...plain(s).replace(/ου/g, "u").replace(/αι/g, "e").replace(/[εο]ι/g, "i")].map((c) => GR[c] ?? c).join("")
  .replace(/ks/g, "x").replace(/[hy]/g, "i").replace(/w/g, "o").replace(/ou/g, "u").replace(/mp/g, "b").replace(/ai/g, "e").replace(/[eo]i/g, "i").replace(/[^a-z0-9]/g, "");
const tokMatch = (a: string, b: string) => {
  if (a.length < 5 || b.length < 5) return a === b;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i >= Math.max(5, Math.max(a.length, b.length) - 3); // fridge ≈ fridges, kouzines ≈ kouzinas, όχι micro ≈ microwaves
};
const words = (name: string) => plain(name).split(/[^\p{L}\p{N}]+/u).filter((w) => w && !STOP.has(w));
/** Οι εναλλακτικές μορφές μιας λέξης μας: greeklish + μετάφραση της μακρύτερης ρίζας του λεξικού. */
const forms = (w: string) => {
  const d = DICT.filter(([g]) => w.startsWith(g)).sort((a, b) => b[0].length - a[0].length)[0];
  return [canon(w), ...(d ? d[1].split("-").map(canon) : [])].filter(Boolean);
};

/** Η καλύτερη διαδρομή με το όνομα της κατηγορίας (και του γονέα της, με μικρότερο βάρος). Null = τίποτα δεν ταιριάζει. */
export function bestByName(name: string, parentName: string | null, known: string[], within?: string): string | null {
  const own = plain(`${name} ${parentName ?? ""}`);
  const acc = ACC_NAME.test(own);
  if (!acc) for (const [re, p] of OVERRIDES) if (re.test(own) && known.includes(p) && (!within || p.startsWith(within))) return p;
  // Οι λέξεις μας μετρούν στο τελευταίο κομμάτι (4 + ένα ανά κομμάτι που ταιριάζει)· του γονέα, όσες δεν τις έχει ήδη το όνομα,
  // μόνο στα προηγούμενα κομμάτια (Εντοιχιζόμενα › Ψυγεία → built-in/fridges).
  const leaf = words(name).map(forms);
  const ctx = words(parentName ?? "").map(forms).filter((f) => !leaf.some((l) => l.some((x) => f.some((y) => tokMatch(x, y)))));
  const hits = (fs: string[], toks: string[]) => toks.filter((t) => fs.some((f) => tokMatch(f, t))).length;
  let best: { p: string; score: number; miss: number } | null = null;
  for (const p of known) {
    if (within && p !== within && !p.startsWith(within + "/")) continue;
    if (!ROOTS.has(p.split("/")[0]) || (!acc && ACC_PATH.test(p))) continue;
    const segs = p.split("/").map((s) => s.split("-").map(canon).filter(Boolean));
    const last = segs[segs.length - 1];
    let score = 0;
    for (const f of leaf) { const n = hits(f, last); if (n) score += 4 + n; }
    if (!score) continue;
    for (const f of ctx) for (const toks of segs.slice(0, -1)) score += hits(f, toks);
    const miss = last.filter((t) => !leaf.some((f) => tokMatch(f[0], t) || f.some((x) => tokMatch(x, t)))).length;
    if (!best || score > best.score || (score === best.score && (miss < best.miss || (miss === best.miss && p.length < best.p.length)))) best = { p, score, miss };
  }
  return best?.p ?? null;
}

export type Cat = { id: string; parentId: string | null; grandId: string | null; name: string; parentName: string | null };

/**
 * Πρόταση για μια κατηγορία μας. Αν υπάρχουν επιβεβαιωμένες «αδελφές» (ίδιος γονέας) ή «ξαδέρφες» (ίδιος παππούς),
 * ψάχνει με το όνομα κάτω από το κοινό τους ριζικό, αλλιώς προτείνει το ίδιο το ριζικό. Χωρίς αυτές: με το όνομα σε όλα.
 */
export function suggestPath(cat: Cat, mapped: { id: string; parentId: string | null; grandId: string | null; extPath: string }[], known: string[]): string | null {
  const sib = cat.parentId ? mapped.filter((m) => m.id !== cat.id && m.parentId === cat.parentId) : [];
  const pool = sib.length ? sib : cat.grandId ? mapped.filter((m) => m.id !== cat.id && m.grandId === cat.grandId) : [];
  const root = commonRoot(pool.map((m) => m.extPath));
  if (root && knownPath(root, known)) return bestByName(cat.name, cat.parentName, known, root) ?? root;
  return bestByName(cat.name, cat.parentName, known);
}
