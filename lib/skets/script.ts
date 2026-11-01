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
  hello: `Σοβαρά; Τι υπέροχα νέα, ${s.presenter.vocative}! Συγχαρητήρια — τόσο καιρό το περίμενες, και το άξιζες. Και τώρα… σπίτι από το μηδέν, ε;`,
  start: "Έλα, θα το στήσουμε μαζί. Ξεκινάμε από τα βασικά.",
  summary: `Έτοιμο το σπίτι! Πέντε συσκευές, σύνολο ${eurSpoken(s.total)}${s.instalments ? `, ή ${s.instalments.months} άτοκες δόσεις των ${eurSpoken(s.instalments.amount)}` : ""}.`,
  ask: "Θέλεις να βρω το πλησιέστερο κατάστημα, να τα παραλάβεις σήμερα κιόλας;",
  map: `Βρήκα ${s.stores.length} καταστήματα κοντά στο νέο σου σπίτι. Ποιο σε βολεύει;`,
  call: "Μισό λεπτό — παίρνω τηλέφωνο {store}, να σου τα κρατήσουν.",
  done: `Κανονίστηκε! {Store} σου τα κρατάει για σήμερα. Καλή αρχή στη Λάρισα, ${s.presenter.vocative}!`,
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
    { id: "hello", act: { t: "intro" }, say: L.hello, wait: "presenter", cue: "«Ναι, από το μηδέν! Βοήθησέ με.»" },
    { id: "start", say: L.start, wait: "auto", delay: 300 },
  ];
  for (const c of s.cats) {
    b.push({ id: `${c.key}-ask`, act: { t: "cat", cat: c.key }, say: c.lines.ask, wait: "presenter", cue: `«${c.lines.answer}»` });
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
    { who: "hermes", text: "Καλησπέρα σας! Είμαι ο Ερμής, ο ψηφιακός σύμβουλος της Euronics. Σας καλώ για λογαριασμό ενός πελάτη μας — έχετε ένα λεπτό;" },
    { who: "store", text: `Ναι, γεια σας, Euronics ${st.street}, πείτε μου.` },
    { who: "hermes", text: `Ο κύριος ${s.presenter.full} μόλις ήρθε στη Λάρισα και εξοπλίζει το σπίτι του. Θα ήθελε να παραλάβει σήμερα πέντε συσκευές — σας τις έστειλα. Μπορείτε να του τις κρατήσετε;` },
    { who: "store", text: "Ναι, τις βλέπω. Μπορώ να τις ετοιμάσω για σήμερα το απόγευμα." },
    { who: "hermes", text: `Τέλεια! Στο όνομα ${s.presenter.full}. Σας ευχαριστώ πολύ — καλή συνέχεια!` },
    { who: "store", text: "Ευχαριστούμε κι εμείς, τον περιμένουμε!" },
  ];
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
  return [...out];
}
