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
  ["κρασ", "wine"], ["συντηρητ", "conservation"], ["set", "bundles"], ["περιφερει", "peripherals"], ["καλωδ", "cables"], ["ακουστ", "akoustika"],
];
/** Επαγγελματικά: μόνο για κατηγορίες μας αυτού του είδους. */
const PRO_PATH = /epaggelm/;
const PRO_NAME = /επαγγελμ|βιτριν/;
/** Κομμάτια-προσδιορισμοί: δεν προτείνονται αν δεν τα λέει και το όνομα μας (π.χ. built-in χωρίς «Εντοιχιζόμενα»). */
const QUALIFIERS: [string, RegExp][] = [["built", /εντοιχ/], ["gaming", /gaming/]];
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
export const bestByName = (name: string, parentName: string | null, known: string[], within?: string) => rank(name, parentName, known, within)?.p ?? null;

type Ranked = { p: string; score: number; clear: boolean };
function rank(name: string, parentName: string | null, known: string[], within?: string): Ranked | null {
  const own = plain(`${name} ${parentName ?? ""}`);
  const acc = ACC_NAME.test(own), pro = PRO_NAME.test(own);
  if (!acc) for (const [re, p] of OVERRIDES) if (re.test(own) && known.includes(p) && (!within || p.startsWith(within))) return { p, score: 100, clear: true };
  // Λέξεις μας στο τελευταίο κομμάτι: 4 + ένα ανά κομμάτι που ταιριάζει (+0,5 όταν ταιριάζει η ίδια η λέξη σε greeklish).
  // Του γονέα, όσες δεν τις έχει ήδη το όνομα, μόνο στα προηγούμενα κομμάτια (Εντοιχιζόμενα › Ψυγεία → built-in/fridges).
  const leaf = words(name).map(forms);
  const ctx = words(parentName ?? "").map(forms).filter((f) => !leaf.some((l) => l.some((x) => f.some((y) => tokMatch(x, y)))));
  const hit = (fs: string[], t: string) => fs.some((f) => tokMatch(f, t));
  type C = { p: string; score: number; miss: number; last: string[]; words: number };
  const cands: C[] = [];
  const scope = known.filter((p) => (!within || p === within || p.startsWith(within + "/")) && ROOTS.has(p.split("/")[0]) && (acc || !ACC_PATH.test(p)) && (pro || !PRO_PATH.test(p)))
    .map((p) => ({ p, segs: p.split("/").map((s) => s.split("-").map(canon).filter(Boolean)) }));
  // Σπάνια λέξη = πιο συγκεκριμένη: «μικροκυμάτων» (2 διαδρομές) μετρά περισσότερο από «φούρνοι» (πολλές)
  const df = leaf.map((f) => scope.filter(({ segs }) => segs[segs.length - 1].some((t) => hit(f, t))).length);
  for (const { p, segs } of scope) {
    const last = segs[segs.length - 1];
    let score = 0, matched = 0;
    leaf.forEach((f, i) => {
      const n = last.filter((t) => hit(f, t)).length;
      if (n) { matched++; score += 4 + n + (last.some((t) => tokMatch(f[0], t)) ? 0.5 : 0) + 2 / df[i]; }
    });
    if (!score) continue;
    for (const f of ctx) for (const toks of segs.slice(0, -1)) score += toks.filter((t) => hit(f, t)).length;
    for (const [q, re] of QUALIFIERS) if (segs.flat().includes(q) && !re.test(own)) score -= 2;
    const miss = last.filter((t) => !leaf.some((f) => hit(f, t))).length;
    cands.push({ p, score, miss, last, words: matched });
  }
  if (!cands.length) return null;
  const top = Math.max(...cands.map((c) => c.score));
  let tied = cands.filter((c) => c.score === top);
  // fridges ↔ fridges/fridges: όταν η υποκατηγορία έχει το ίδιο όνομα με τον γονέα, κρατάμε την υποκατηγορία
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((t) => b.includes(t));
  tied = tied.filter((a) => !tied.some((b) => b.p.startsWith(a.p + "/") && same(a.last, b.last)));
  tied.sort((a, b) => a.miss - b.miss || a.p.length - b.p.length);
  // «Καθαρό» = ταιριάζει τουλάχιστον τις μισές λέξεις του ονόματός μας· αλλιώς είναι εικασία
  return { p: tied[0].p, score: top, clear: tied[0].words * 2 >= leaf.length };
}

// ---- Ριζική κατηγορία μας → ενότητα πρώτου επιπέδου του Κωτσόβολου ----
/** Η αυθεντία για τις γνωστές ριζικές (ελέγχθηκαν στο categoriesSiteMap 11/11/2026). */
const ROOT_MAP: Record<string, string> = {
  λευκεσσυσκευεσ: "household-appliances", εικονακαιηχοσ: "sound-vision", τηλεφωνια: "mobile-phones-gps", computing: "computing",
  κλιματισμοσθερμανση: "air-condition-heaters", gaming: "gaming-gadgets", imaging: "imaging", οικιακοσεξοπλισμοσ: "small-home-appliances", προσωπικηφροντιδα: "personal-care",
};
const rootKey = (s: string) => plain(s).replace(/ς/g, "σ").replace(/[^\p{L}\p{N}]/gu, "");

/**
 * Σε ποια ενότητα πρώτου επιπέδου του Κωτσόβολου αντιστοιχεί μια ριζική κατηγορία μας: πρώτα ο πίνακας,
 * αλλιώς πού δείχνει η πλειοψηφία των ήδη αντιστοιχισμένων/προτεινόμενων κατηγοριών της (`paths`). Πάντα υπαρκτή ενότητα.
 */
export function rootSegment(rootName: string, paths: string[], known: string[]): string | null {
  const t = ROOT_MAP[rootKey(rootName)];
  if (t && knownPath(t, known)) return t;
  const votes = new Map<string, number>();
  for (const p of paths) { const s = p.split("/")[0]; votes.set(s, (votes.get(s) ?? 0) + 1); }
  const top = [...votes].sort((a, b) => b[1] - a[1])[0];
  return top && top[1] * 2 > paths.length && knownPath(top[0], known) ? top[0] : null;
}

export type Cat = { id: string; parentId: string | null; grandId: string | null; name: string; parentName: string | null; rootName?: string | null };

/**
 * Πρόταση για μια κατηγορία μας. Τα βαθύτερα επίπεδα δικά μας και του Κωτσόβολου δεν αντιστοιχούν ένα-ένα, και η εργασία
 * ψάχνει με πρόθεμα (η διαδρομή καλύπτει όλες τις υποκατηγορίες της), άρα προτιμάμε σωστή πλατιά διαδρομή από στενή εικασία:
 * 1. ενότητα πρώτου επιπέδου = `rootSegment` της ριζικής μας (χωρίς `rootName`: των επιβεβαιωμένων αδελφών/ξαδερφών)·
 * 2. μέσα της η πιο βαθιά διαδρομή που ταιριάζει καθαρά με το όνομα (εξαίρεση: αλλού ταιριάζει καθαρά καλύτερα)·
 * 3. αν το ταίριασμα δεν είναι καθαρό, ο γονέας δεύτερου επιπέδου του (π.χ. household-appliances/washing-machines)·
 * 4. αν δεν ταιριάζει τίποτα, ο δεύτερος επίπεδος που ταιριάζει με το όνομα του γονέα μας, αλλιώς η ίδια η ενότητα.
 */
export function suggestPath(cat: Cat, mapped: { id: string; parentId: string | null; grandId: string | null; extPath: string }[], known: string[]): string | null {
  const sib = cat.parentId ? mapped.filter((m) => m.id !== cat.id && m.parentId === cat.parentId) : [];
  const pool = sib.length ? sib : cat.grandId ? mapped.filter((m) => m.id !== cat.id && m.grandId === cat.grandId) : [];
  const top = rootSegment(cat.rootName ?? "", pool.map((m) => m.extPath), known);
  const all = rank(cat.name, cat.parentName, known);
  const inside = top ? rank(cat.name, cat.parentName, known, top) : null;
  const r = inside && (!all || !all.clear || all.score < inside.score + 4) ? inside : all;
  const level2 = (p: string) => p.split("/").slice(0, 2).join("/");
  if (r) return r.clear ? r.p : level2(r.p);
  if (!top) return null;
  const byParent = cat.parentName ? rank(cat.parentName, null, known, top) : null;
  return byParent ? level2(byParent.p) : top;
}

/** Ελληνική ετικέτα για κομμάτι διαδρομής του Κωτσόβολου (το sitemap δεν έχει ονόματα)· αλλιώς το slug ευανάγνωστο. */
const LABELS: Record<string, string> = {
  "household-appliances": "Λευκές συσκευές", "small-home-appliances": "Μικρές οικιακές", "air-condition-heaters": "Κλιματισμός & θέρμανση", computing: "Υπολογιστές",
  "mobile-phones-gps": "Κινητά & GPS", "sound-vision": "Εικόνα & ήχος", "gaming-gadgets": "Gaming & gadgets", imaging: "Φωτογραφία", "personal-care": "Προσωπική φροντίδα",
  "kipos-ergaleia-spiti": "Κήπος & εργαλεία", fridges: "Ψυγεία", "fridge-freezers": "Ψυγειοκαταψύκτες", freezers: "Καταψύκτες", "mini-bars": "Mini bars",
  "side-by-side-fridges": "Ντουλάπες side by side", "wine-conservation": "Συντηρητές κρασιών", "washing-machines": "Πλυντήρια", "dish-washing-machines": "Πλυντήρια πιάτων",
  dryers: "Στεγνωτήρια", "washing-machines-dryers": "Πλυντήρια-στεγνωτήρια", cookers: "Κουζίνες", "hlektrikes-kouzines": "Ηλεκτρικές κουζίνες", hoods: "Απορροφητήρες",
  aporrofhthres: "Απορροφητήρες", "built-in": "Εντοιχιζόμενα", hobs: "Εστίες", ovens: "Φούρνοι", microwaves: "Φούρνοι μικροκυμάτων", "built-in-bundles": "Σετ εντοιχισμού",
  "syntirites-krasion": "Συντηρητές κρασιών", "built-in-washing-machines": "Εντοιχιζόμενα πλυντήρια", dishwashers: "Πλυντήρια πιάτων",
  "epaggelmatikes-lefkes-syskeves": "Επαγγελματικές λευκές", "epaggelmetika-psygeia-vitrines": "Ψυγεία βιτρίνες", "small-cooking-appliances": "Μικρές συσκευές μαγειρικής",
  "vacuum-cleaners": "Σκούπες", "skoupes-robot": "Σκούπες ρομπότ", "skoupes-stick": "Σκούπες stick", ironing: "Σιδέρωμα", sidera: "Σίδερα", coffeemakers: "Καφετιέρες",
  "air-condition": "Κλιματιστικά", "klimatistika-multi": "Κλιματιστικά multi", afigranthres: "Αφυγραντήρες", anemistires: "Ανεμιστήρες", "thermosifones-boiler": "Θερμοσίφωνες",
  televisions: "Τηλεοράσεις", "led-lcd": "Τηλεοράσεις LED/LCD", "home-cinema": "Home cinema", soundbars: "Soundbars", projectors: "Προβολείς",
  "mobile-phones": "Κινητά", smartphones: "Smartphones", wearables: "Wearables", smartwatches: "Smartwatches", akoystika: "Ακουστικά",
  "laptop-tablet-ipad": "Laptop & tablet", "notebook-macbook-ultrabook": "Laptop", "tablets-ipad": "Tablets", monitors: "Οθόνες", peripherals: "Περιφερειακά",
  "desktops-and-upgrade-tools": "Desktop", "desktops-mac-all-in-one": "Desktop & all in one", headsets: "Ακουστικά headsets", "usb-hubs-and-cables": "Hubs & καλώδια",
};
export const segLabel = (seg: string) => LABELS[seg] ?? (seg.charAt(0).toUpperCase() + seg.slice(1)).replace(/-/g, " ");
/** household-appliances/washing-machines/dryers → «Λευκές συσκευές › Πλυντήρια › Στεγνωτήρια» */
export const pathLabel = (path: string) => path.split("/").map(segLabel).join(" › ");
