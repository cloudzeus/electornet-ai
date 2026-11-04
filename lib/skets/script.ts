import type { Alts, CatKey, SkCategory, Snapshot } from "./types";

/**
 * Το σενάριο του σκετς ως αλυσίδα βημάτων. Κάθε βήμα: τι κάνει η σκηνή (act), τι λέει ο Ερμής (say) και πότε προχωρά:
 *  - presenter: περιμένει τον παρουσιαστή (`cue` = τι λέει εκείνος· ο χειριστής πατά «Επόμενο» ή Space)
 *  - auto: μόλις τελειώσει η φράση (+ delay)
 *  - store: περιμένει επιλογή καταστήματος στον χάρτη · call: περιμένει να κλείσει η κλήση
 * Στο `say` το «{store}» / «{Store}» γίνεται το spoken του καταστήματος που διάλεξε ο παρουσιαστής (fillStore).
 */
export type Act =
  | { t: "idle" } | { t: "intro" }
  | { t: "cat"; cat: CatKey }
  | { t: "reject"; cat: CatKey; id: string; reason: string }
  | { t: "pick"; cat: CatKey; id: string }
  | { t: "summary" } | { t: "map" } | { t: "call" } | { t: "done" };
export interface Beat { id: string; act?: Act; say?: string; wait: "presenter" | "auto" | "store" | "call"; delay?: number; cue?: string }

/** Η διακλάδωση που ισχύει για την ομάδα (null = βασικό σενάριο) και ό,τι εξαρτάται από αυτήν: επιλογή, σύνολο. */
export const variant = (c: SkCategory, alts: Alts = {}) => c.alts?.find((a) => a.key === alts[c.key]) ?? null;
export const pickOf = (c: SkCategory, alts: Alts = {}) => { const id = variant(c, alts)?.pick ?? c.pick; return c.candidates.find((p) => p.id === id)!; };
export const totalOf = (s: Snapshot, alts: Alts = {}) => Math.round(s.cats.reduce((t, c) => t + pickOf(c, alts).price, 0) * 100) / 100;
export const instalmentsOf = (s: Snapshot, alts: Alts = {}) => (s.instalments ? { months: s.instalments.months, amount: Math.round((totalOf(s, alts) / s.instalments.months) * 100) / 100 } : null);

/** Όλοι οι συνδυασμοί διακλαδώσεων (για να ηχογραφηθεί το σύνολο του καθενός). */
export function altCombos(s: Snapshot): Alts[] {
  let out: Alts[] = [{}];
  for (const c of s.cats) if (c.alts?.length) out = out.flatMap((a) => [a, ...c.alts!.map((x) => ({ ...a, [c.key]: x.key }))]);
  return out;
}

export const lines = (s: Snapshot, alts: Alts = {}) => ({
  hello: `Συγχαρητήρια, ${s.presenter.vocative}! Πώς μπορώ να βοηθήσω;`,
  start: "Ευχαρίστως. Ας ξεκινήσουμε από τα βασικά.",
  summary: ((inst) => `Το σπίτι είναι έτοιμο. Πέντε συσκευές, σύνολο ${eurSpoken(totalOf(s, alts))}${inst ? `, ή ${inst.months} άτοκες δόσεις των ${eurSpoken(inst.amount)}` : ""}.`)(instalmentsOf(s, alts)),
  ask: "Θέλετε να βρω το πλησιέστερο κατάστημα, για να τα παραλάβετε σήμερα κιόλας;",
  map: `Βρήκα ${s.stores.length} καταστήματα κοντά στο νέο σας σπίτι. Ποιο σας βολεύει;`,
  call: "Ένα λεπτό — καλώ {store}, να σας τα κρατήσουν.",
  done: `Κανονίστηκε. {Store} σας τα κρατάει για σήμερα. Καλή αρχή στη Λάρισα, ${s.presenter.vocative}!`,
});

/** «1.847,50 €» → «1.847 ευρώ και 50 λεπτά» — ο αριθμός διαβάζεται σωστά από τη φωνή. */
export function eurSpoken(n: number) {
  const e = Math.floor(n), c = Math.round((n - e) * 100);
  return `${e.toLocaleString("el-GR")} ευρώ${c ? ` και ${c} λεπτά` : ""}`;
}

/** ahead: ομάδες που ο παρουσιαστής απάντησε ήδη νωρίτερα — η ερώτησή τους γίνεται «μου το είπατε ήδη» και προχωρά μόνη της */
export function buildBeats(s: Snapshot, alts: Alts = {}, ahead: CatKey[] = []): Beat[] {
  const L = lines(s, alts);
  const b: Beat[] = [
    { id: "idle", act: { t: "idle" }, wait: "presenter", cue: "«Ερμή, έχω νέα! Πήρα επιτέλους τη θέση στη Λάρισα!»" },
    { id: "hello", act: { t: "intro" }, say: L.hello, wait: "presenter", cue: "«Να με βοηθήσεις να εξοπλίσουμε το νέο μου σπίτι από το μηδέν.»" },
    { id: "start", say: L.start, wait: "auto", delay: 300 },
  ];
  for (const c of s.cats) {
    const known = ahead.includes(c.key) && !!c.lines.known;
    if (known) b.push({ id: `${c.key}-ask`, act: { t: "cat", cat: c.key }, say: c.lines.known, wait: "auto", delay: 300 });
    else b.push({ id: `${c.key}-ask`, act: { t: "cat", cat: c.key }, say: c.lines.ask, wait: "presenter", cue: `«${c.lines.answer}»` });
    if (c.lines.follow && !known) b.push({ id: `${c.key}-ask2`, say: c.lines.follow.ask, wait: "presenter", cue: `«${c.lines.follow.answer}»` });
    const v = variant(c, alts);
    b.push({ id: `${c.key}-verdict`, say: v?.verdict ?? c.lines.verdict, wait: "auto", delay: 200 });
    (v?.reject ?? c.reject).forEach((r, i) => b.push({ id: `${c.key}-x${i}`, act: { t: "reject", cat: c.key, id: r.id, reason: r.reason }, wait: "auto", delay: 1300 }));
    if (!v && c.lines.verdict2) {
      b.push({ id: `${c.key}-verdict2`, say: c.lines.verdict2, wait: "auto", delay: 200 });
      c.reject2.forEach((r, i) => b.push({ id: `${c.key}-y${i}`, act: { t: "reject", cat: c.key, id: r.id, reason: r.reason }, wait: "auto", delay: 1300 }));
    }
    b.push({ id: `${c.key}-pick`, act: { t: "pick", cat: c.key, id: pickOf(c, alts).id }, say: v?.pickLine ?? c.lines.pick, wait: "auto", delay: 900 });
  }
  b.push(
    { id: "summary", act: { t: "summary" }, say: L.summary, wait: "auto", delay: 600 },
    { id: "ask", say: L.ask, wait: "presenter", cue: "«Ναι!»" },
    { id: "map", act: { t: "map" }, say: L.map, wait: "store", cue: "Λέει ποιο κατάστημα θέλει («της Ηπείρου», «το πρώτο») — ή κλικ στον χάρτη" },
    { id: "call", act: { t: "call" }, say: L.call, wait: "call", cue: "Η κλήση τρέχει — απαντά ο θεατής-κατάστημα" },
    { id: "done", act: { t: "done" }, say: L.done, wait: "presenter", cue: "Τέλος σκετς" },
  );
  return b;
}

export interface Scene { mode: "idle" | "intro" | "cat" | "summary" | "map" | "call" | "done"; cat: CatKey | null; rejected: Record<string, string>; picked: Partial<Record<CatKey, string>> }

/** Η σκηνή στο βήμα i: σύνθεση όλων των act μέχρι εκεί — έτσι το «Πίσω» και το άλμα σε βήμα δουλεύουν χωρίς ιστορικό. */
export function sceneAt(beats: Beat[], i: number): Scene {
  const sc: Scene = { mode: "idle", cat: null, rejected: {}, picked: {} };
  for (const { act } of beats.slice(0, i + 1)) {
    if (!act) continue;
    if (act.t === "cat") { sc.mode = "cat"; sc.cat = act.cat; }
    else if (act.t === "reject") sc.rejected = { ...sc.rejected, [act.id]: act.reason };
    else if (act.t === "pick") sc.picked = { ...sc.picked, [act.cat]: act.id };
    else sc.mode = act.t;
  }
  return sc;
}

/** Εφεδρική κλήση (χωρίς δίκτυο ή σε στεγνή πρόβα): η συνομιλία της πρώτης πραγματικής δοκιμής, προσαρμοσμένη. */
export function fallbackCall(s: Snapshot, store: number): { who: "hermes" | "store"; text: string }[] {
  const st = s.stores[store];
  return [
    { who: "hermes", text: "Καλησπέρα σας! Είμαι ο Ερμής, ο ψηφιακός σύμβουλος της Euronics, και σας καλώ για έναν πελάτη μας που θέλει να παραλάβει σήμερα από το κατάστημά σας." },
    { who: "store", text: `Ναι, γεια σας, Euronics ${st.street}, πείτε μου.` },
    { who: "hermes", text: `Ο κύριος ${s.presenter.full} μόλις ήρθε στη Λάρισα και εξοπλίζει το σπίτι του. Θα ήθελε να παραλάβει σήμερα πέντε συσκευές — σας τις έστειλα. Μπορείτε να του τις κρατήσετε;` },
    { who: "store", text: "Ναι, τις βλέπω. Μπορώ να τις ετοιμάσω για σήμερα το απόγευμα." },
    { who: "hermes", text: `Τέλεια! Στο όνομα του ${s.presenter.genitive}. Σας ευχαριστώ πολύ — καλή συνέχεια!` },
    { who: "store", text: "Ευχαριστούμε κι εμείς, τον περιμένουμε!" },
  ];
}

/** Μονάδες όπως λέγονται στο τηλέφωνο — η φωνή διαβάζει άσχημα «BTU», «kg», «″» και το λατινικό «A». */
const THOUSANDS: Record<number, string> = { 7: "επτά", 9: "εννιά", 12: "δώδεκα", 18: "δεκαοχτώ", 24: "είκοσι τεσσάρων" };
export function spokenKey(key: string): string {
  const btu = key.match(/^([\d.]+)\s*BTU$/i);
  if (btu) { const k = Math.round(Number(btu[1].replace(/\./g, "")) / 1000); return `${THOUSANDS[k] ?? k} χιλιάδων μπι-τι-γιου`; }
  if (/εστίες$/.test(key)) return `με ${key.toLowerCase()}`;
  return key.replace(/^(\d+(?:[.,]\d+)?)\s*kg$/i, "$1 κιλών").replace(/^(\d+)″$/, "$1 ιντσών").replace(/^Κλάση\s+([A-G])(\+*)$/, (_, l: string, p: string) => `ενεργειακής κλάσης ${["άλφα", "βήτα", "γάμα", "δέλτα", "έψιλον", "ζήτα", "ήτα"]["ABCDEFG".indexOf(l)]}${p.length ? ` ${p.length} συν` : ""}`);
}
const brandSpoken = (b: string) => (b.length <= 3 ? b : b.charAt(0) + b.slice(1).toLowerCase());

/** Τα προϊόντα του σπιτιού όπως τα λέει ο Ερμής στο κατάστημα: μάρκα, μέγεθος και κωδικός (για όταν τον ζητήσουν). */
/** Κωδικός μοντέλου όπως διαβάζεται στο τηλέφωνο: γράμμα-γράμμα με την αγγλική του προφορά, ψηφία ελληνικά, κόμμα = μικρή παύση.
 * «WGG254ZHGR» → «ντάμπλιου, τζι, τζι, δύο, πέντε, τέσσερα, ζεντ, έιτς, τζι, αρ». Η φωνή αλλιώς τον διαβάζει σαν λέξη. */
const LETTERS: Record<string, string> = { A: "έι", B: "μπι", C: "σι", D: "ντι", E: "ι", F: "εφ", G: "τζι", H: "έιτς", I: "άι", J: "τζέι", K: "κέι", L: "ελ", M: "εμ", N: "εν", O: "όου", P: "πι", Q: "κιου", R: "αρ", S: "ες", T: "τι", U: "γιου", V: "βι", W: "ντάμπλιου", X: "εξ", Y: "γουάι", Z: "ζεντ" };
const DIGITS = ["μηδέν", "ένα", "δύο", "τρία", "τέσσερα", "πέντε", "έξι", "επτά", "οκτώ", "εννιά"];
// η κατάληξη μετά την τελεία (π.χ. «.API», έκδοση αγοράς) δεν χρειάζεται στο τηλέφωνο
export const spellCode = (code: string) => [...code.toUpperCase().replace(/\.[A-Z]+$/, "")].map((ch) => LETTERS[ch] ?? (/\d/.test(ch) ? DIGITS[+ch] : ch === "/" ? "κάθετος" : ch === "-" ? "παύλα" : ch === "." ? "τελεία" : "")).filter(Boolean).join(", ");

export function callItems(s: Snapshot, alts: Alts = {}): string {
  const items = s.cats.map((c) => { const p = pickOf(c, alts); return `${c.label.toLowerCase()} ${brandSpoken(p.brand)} ${spokenKey(p.key)}${p.model ? ` (κωδικός μοντέλου, αν σου τον ζητήσουν: «${spellCode(p.model)}»)` : ""}`; });
  return `${items.slice(0, -1).join(", ")} και ${items.at(-1)}`;
}

/** Για τη φωνή: το ελληνικό «;» η εκφώνηση το διαβάζει σαν ανακοίνωση, και ούτε το «?» αρκεί πάντα (μετρημένο με STT: χωρίς ερωτηματικό).
 * Κάθε πρόταση-ερώτηση παίρνει «?» και μπροστά την ένδειξη τόνου «[curious]» του eleven_v3 (δεν εκφωνείται) — έτσι ανεβαίνει ο τόνος. */
export const forVoice = (t: string) => liveSentences(t).map((x) => (/[;\u037e?]»?$/.test(x) ? `[curious] ${x.replace(/[;\u037e](?=»?$)/, "?")}` : x)).join(" ");

export const fillStore = (say: string, spoken: string) => say.replace("{store}", spoken).replace("{Store}", spoken.charAt(0).toUpperCase() + spoken.slice(1));
const hasStore = (say: string) => /\{[sS]tore\}/.test(say);

/** Όλες οι φράσεις που πρέπει να ηχογραφηθούν (και οι παραλλαγές ανά κατάστημα). */
export function allPhrases(s: Snapshot): string[] {
  const out = new Set<string>();
  for (const alts of altCombos(s)) for (const x of buildBeats(s, alts)) {
    if (!x.say) continue;
    if (hasStore(x.say)) for (const st of s.stores) out.add(fillStore(x.say, st.spoken));
    else out.add(x.say);
  }
  for (const c of s.cats) if (c.lines.known) out.add(c.lines.known);
  for (const x of s.qa ?? []) out.add(x.a);
  return [...out];
}

/** Ζωντανή ερώτηση: ο Ερμής «κερδίζει χρόνο» όσο ψάχνει (ηχογραφούνται μία φορά, στο άνοιγμα της σκηνής). */
/** Ο Ερμής του σκετς μιλά λίγο πιο γρήγορα από του eshop (×, πάνω στο tempo των ρυθμίσεων φωνής). */
export const SKETS_VOICE = { key: "skets", tempo: 1.05 } as const;

/** σύντομη αναμονή όταν ο παρουσιαστής είπε κάτι εκτός σεναρίου και η απάντηση αργεί (όχι «κατάλογος»: μπορεί να είναι χαιρετισμός) */
export const TURN_FILLERS = ["Μάλιστα…", "Χμ…", "Για να δούμε…", "Ναι…", "Ωραία…", "Ένα λεπτό…"];

export const LIVE_FILLERS = ["Καλή ερώτηση! Μισό λεπτό να κοιτάξω στον κατάλογο.", "Για να δω τι έχουμε διαθέσιμο…", "Μισό λεπτό, το ψάχνω αμέσως."];
export const LIVE_BACK = "Λοιπόν, πάμε πίσω εκεί που μείναμε.";

/** Η απάντηση του Ερμή του eshop είναι γραμμένη για chat: στη σκηνή λέγονται οι πρώτες 2–3 προτάσεις (γρήγορη εκφώνηση). */
export function liveSpoken(text: string, max = 320): string {
  const clean = text.replace(/[*_`#]/g, "").replace(/\s+/g, " ").trim();
  const parts = liveSentences(clean);
  let out = "", n = 0;
  for (const p of parts) { if (out && (out + " " + p).length > max) break; out = out ? `${out} ${p}` : p; if (++n >= 3) break; }
  return out || clean.slice(0, max);
}
/** Προτάσεις: τελεία/ερωτηματικό ακολουθούμενο από κενό — όχι η τελεία μέσα σε αριθμό («5.200 mAh», «0,19 €»). */
export const liveSentences = (t: string) => t.split(/(?<=[.!?;»])\s+/).map((x) => x.trim()).filter(Boolean);

/** Αριθμός μέσα στην απάντηση του παρουσιαστή: «40», «2,5», «σαράντα», «δυόμισι», «τρία και μισό» (το STT γράφει και τα δύο). */
const UNITS: Record<string, number> = { ενα: 1, ενας: 1, μια: 1, δυο: 2, τρια: 3, τρεις: 3, τεσσερα: 4, τεσσερις: 4, πεντε: 5, εξι: 6, επτα: 7, εφτα: 7, οκτω: 8, οχτω: 8, εννια: 9, εννεα: 9 };
const TENS: Record<string, number> = { δεκα: 10, εντεκα: 11, δωδεκα: 12, δεκαπεντε: 15, δεκαεξι: 16, δεκαεπτα: 17, δεκαεφτα: 17, δεκαοκτω: 18, δεκαοχτω: 18, εικοσι: 20, τριαντα: 30, σαραντα: 40, πενηντα: 50, εξηντα: 60, εβδομηντα: 70, ογδοντα: 80 };
const HALF: Record<string, number> = { εναμιση: 1.5, εναμισι: 1.5, μιαμιση: 1.5, μιαμισι: 1.5, δυομιση: 2.5, δυομισι: 2.5, τρισημιση: 3.5, τρισημισι: 3.5, τρεισημιση: 3.5, τρεισημισι: 3.5, τεσσερισημιση: 4.5, τεσσερισημισι: 4.5 };
export const plain = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
export function spokenNumber(text: string): number | null {
  const t = plain(text);
  const d = t.match(/\d+(?:[.,]\d+)?/);
  if (d) return parseFloat(d[0].replace(",", "."));
  const w = t.split(/[^\p{L}]+/u).filter(Boolean);
  for (let i = 0; i < w.length; i++) {
    if (HALF[w[i]]) return HALF[w[i]];
    const base = TENS[w[i]] ?? UNITS[w[i]];
    if (base === undefined) continue;
    let n = base;
    if (TENS[w[i]] && w[i + 1] && UNITS[w[i + 1]]) n += UNITS[w[i + 1]];
    if (/^μισ/.test(w.slice(i + 1, i + 4).join(" ").replace(/^και /, ""))) n += 0.5;
    return n;
  }
  return null;
}

/** Ποια διακλάδωση ταιριάζει σε ό,τι είπε ο παρουσιαστής: key, "" = το βασικό σενάριο (αριθμός μέσα στο αναμενόμενο), null = δεν είπε κάτι μετρήσιμο. */
export function altFor(c: SkCategory, said: string): string | null {
  if (!c.alts?.length) return null;
  let n = spokenNumber(said);
  if (n !== null && c.unit === "m" && /εκατοστ/.test(plain(said))) n /= 100;
  const ok = n !== null && (c.unit === "m2" ? n >= 8 && n <= 300 : n >= 0.5 && n <= 10);
  if (ok) return c.alts.find((a) => (a.min === undefined || n! >= a.min) && (a.max === undefined || n! <= a.max))?.key ?? "";
  return c.alts.find((a) => a.words && new RegExp(a.words).test(plain(said)))?.key ?? null;
}

function lev(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(row[j] + 1, cur[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = cur;
  }
  return row[b.length];
}

/**
 * Τι είπε ο παρουσιαστής για ΚΑΘΕ ομάδα, όχι μόνο για την τρέχουσα: «μεγάλος κάδος, 30 τετραγωνικά, με την καλύτερη ενεργειακή κλάση»
 * → πλυντήριο ναι, κλιματιστικό (30 → βασικό σενάριο), ψυγείο ναι. Ανά φράση (κόμμα, «και»), ώστε κάθε αριθμός να πάει με τη μονάδα του.
 */
export function slotsIn(s: Snapshot, said: string): { cat: CatKey; alt: string }[] {
  const out = new Map<CatKey, string>();
  const has = (k: CatKey) => s.cats.some((c) => c.key === k);
  for (const cl of plain(said).replace(/τ\.\s?μ\.?/g, "τμ").replace(/(\d)[.,](\d)/g, "$1·$2").split(/[,.;;!?]|\s(?:και(?!\s+μισ)|επισης|ενω|μετα|αλλα)\s/u).map((x) => x.replace(/·/g, ".")).map((x) => x.trim()).filter(Boolean)) {
    if (/καδ|παπλωμ|κιλ/.test(cl) && !/μικρ/.test(cl) && has("washer")) out.set("washer", "");
    if (/ενεργειακ|ρευμα|οικονομικ|κλαση/.test(cl) && has("fridge")) out.set("fridge", "");
    if (/κεραμικ/.test(cl) && has("cooker")) out.set("cooker", "");
    const ac = s.cats.find((c) => c.key === "ac"), tv = s.cats.find((c) => c.key === "tv");
    if (ac && /τετραγων|(?<!\p{L})τ ?μ(?!\p{L})/u.test(cl)) { const a = altFor(ac, cl); if (a !== null) out.set("ac", a); }
    else if (tv && /μετρ|εκατοστ/.test(cl)) { const a = altFor(tv, cl); if (a !== null) out.set("tv", a); }
  }
  return [...out].map(([cat, alt]) => ({ cat, alt }));
}

// το \b της JS δεν βλέπει ελληνικά γράμματα ως λέξη: όρια με \p{L}
const word = (x: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${x})(?![\\p{L}\\p{N}])`, "u");
const ORD: [RegExp, number][] = [[word("πρωτο|πρωτη|1"), 0], [word("δευτερο|δευτερη|2"), 1], [word("τριτο|τριτη|3"), 2], [word("τεταρτο|τεταρτη|4"), 3]];
/** Επιλογή καταστήματος με φωνή: οδός («της Ηπείρου»), σειρά («το πρώτο») ή «το πιο κοντινό». */
export function storeFor(s: Snapshot, said: string): number | null {
  // το STT γράφει όπως ακούει («Ιπείρου», «Δραγούμι»): σύγκριση με ήχο (ι/η/υ/ει/οι, ο/ω, ε/αι) και ανοχή ενός-δύο γραμμάτων
  const ph = (w: string) => w.replace(/ει|οι|η|υ/g, "ι").replace(/ω/g, "ο").replace(/αι/g, "ε");
  const t = plain(said), heard = t.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3).map(ph);
  const stem = (w: string) => w.slice(0, Math.max(4, w.length - 2));
  const near = (a: string, b: string) => Math.min(a.length, b.length) >= 6 && lev(a, b) <= (Math.min(a.length, b.length) >= 8 ? 2 : 1);
  for (const [n, st] of s.stores.entries()) {
    const words = plain(`${st.street} ${st.name}`).split(/[^\p{L}]+/u).filter((w) => w.length > 4).map(ph);
    if (words.some((w) => heard.some((h) => h.startsWith(stem(w)) || w.startsWith(stem(h)) || near(h, w)))) return n;
  }
  if (/κοντινοτερ|πλησιεστερ|πιο κοντ/.test(t)) return s.stores.reduce((b, st, n) => (st.km < s.stores[b].km ? n : b), 0);
  for (const [re, n] of ORD) if (re.test(t) && s.stores[n]) return n;
  return null;
}
