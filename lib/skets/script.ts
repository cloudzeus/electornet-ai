import type { CatKey, Snapshot } from "./types";

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

export const lines = (s: Snapshot) => ({
  hello: `Συγχαρητήρια, ${s.presenter.vocative}! Πώς μπορώ να βοηθήσω;`,
  start: "Ευχαρίστως. Ας ξεκινήσουμε από τα βασικά.",
  summary: `Το σπίτι είναι έτοιμο. Πέντε συσκευές, σύνολο ${eurSpoken(s.total)}${s.instalments ? `, ή ${s.instalments.months} άτοκες δόσεις των ${eurSpoken(s.instalments.amount)}` : ""}.`,
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

export function buildBeats(s: Snapshot): Beat[] {
  const L = lines(s);
  const b: Beat[] = [
    { id: "idle", act: { t: "idle" }, wait: "presenter", cue: "«Ερμή, έχω νέα! Πήρα επιτέλους τη θέση στη Λάρισα!»" },
    { id: "hello", act: { t: "intro" }, say: L.hello, wait: "presenter", cue: "«Να με βοηθήσεις να εξοπλίσουμε το νέο μου σπίτι από το μηδέν.»" },
    { id: "start", say: L.start, wait: "auto", delay: 300 },
  ];
  for (const c of s.cats) {
    b.push({ id: `${c.key}-ask`, act: { t: "cat", cat: c.key }, say: c.lines.ask, wait: "presenter", cue: `«${c.lines.answer}»` });
    if (c.lines.follow) b.push({ id: `${c.key}-ask2`, say: c.lines.follow.ask, wait: "presenter", cue: `«${c.lines.follow.answer}»` });
    b.push({ id: `${c.key}-verdict`, say: c.lines.verdict, wait: "auto", delay: 200 });
    c.reject.forEach((r, i) => b.push({ id: `${c.key}-x${i}`, act: { t: "reject", cat: c.key, id: r.id, reason: r.reason }, wait: "auto", delay: 1300 }));
    if (c.lines.verdict2) {
      b.push({ id: `${c.key}-verdict2`, say: c.lines.verdict2, wait: "auto", delay: 200 });
      c.reject2.forEach((r, i) => b.push({ id: `${c.key}-y${i}`, act: { t: "reject", cat: c.key, id: r.id, reason: r.reason }, wait: "auto", delay: 1300 }));
    }
    b.push({ id: `${c.key}-pick`, act: { t: "pick", cat: c.key, id: c.pick }, say: c.lines.pick, wait: "auto", delay: 900 });
  }
  b.push(
    { id: "summary", act: { t: "summary" }, say: L.summary, wait: "auto", delay: 600 },
    { id: "ask", say: L.ask, wait: "presenter", cue: "«Ναι!»" },
    { id: "map", act: { t: "map" }, say: L.map, wait: "store", cue: "Διαλέγει κατάστημα στον χάρτη (ή ο χειριστής: κουμπί καταστήματος)" },
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
    { who: "hermes", text: `Τέλεια! Στο όνομα του κυρίου ${s.presenter.genitive}. Σας ευχαριστώ πολύ — καλή συνέχεια!` },
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
export function callItems(s: Snapshot): string {
  const items = s.cats.map((c) => { const p = c.candidates.find((x) => x.id === c.pick)!; return `${c.label.toLowerCase()} ${brandSpoken(p.brand)} ${spokenKey(p.key)}${p.model ? ` (κωδικός ${p.model})` : ""}`; });
  return `${items.slice(0, -1).join(", ")} και ${items.at(-1)}`;
}

export const fillStore = (say: string, spoken: string) => say.replace("{store}", spoken).replace("{Store}", spoken.charAt(0).toUpperCase() + spoken.slice(1));
const hasStore = (say: string) => /\{[sS]tore\}/.test(say);

/** Όλες οι φράσεις που πρέπει να ηχογραφηθούν (και οι παραλλαγές ανά κατάστημα). */
export function allPhrases(s: Snapshot): string[] {
  const out = new Set<string>();
  for (const x of buildBeats(s)) {
    if (!x.say) continue;
    if (hasStore(x.say)) for (const st of s.stores) out.add(fillStore(x.say, st.spoken));
    else out.add(x.say);
  }
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
