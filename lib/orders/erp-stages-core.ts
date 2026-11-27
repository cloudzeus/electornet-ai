/**
 * Ενημέρωση πελάτη από τα στάδια της παραγγελίας στο SoftOne — καθαρή λογική (χωρίς I/O).
 * Ο διαχειριστής διαλέγει στις «Ρυθμίσεις ενημέρωσης» ποιοι τύποι παραστατικών στέλνουν email και με ποιο κείμενο.
 * Από 27/11/2026 οι μετασχηματισμοί αλλάζουν και την κατάσταση της παραγγελίας στο site (statusFromDocs / statusPath).
 */
import { nextStatuses, type OrderStatus } from "./model";
export interface StageType { fprms: string; notify: boolean; title: string | null; message: string | null }
export interface StageDoc { findoc: number; fprms: string | null; docNo: string; date: string }

/** Οι μεταβλητές που γράφει ο διαχειριστής στο κείμενο. */
export const PLACEHOLDERS = [
  { key: "όνομα", help: "Το μικρό όνομα του πελάτη" },
  { key: "παραγγελία", help: "Ο αριθμός της παραγγελίας στο eshop" },
  { key: "παραστατικό", help: "Ο αριθμός του παραστατικού στο SoftOne (π.χ. της απόδειξης)" },
  { key: "ημερομηνία", help: "Η ημερομηνία του παραστατικού" },
] as const;

export function fillMessage(text: string, vars: Record<string, string>) {
  return text.replace(/\{([^{}]+)\}/g, (m, k: string) => vars[k.trim()] ?? m);
}

/** Τα τέσσερα στάδια που βλέπει ο πελάτης. Το `step` κάθε τύπου παραστατικού δείχνει πού φτάνει η μπάρα. */
export const CUSTOMER_STEPS = ["Καταχωρήθηκε", "Πληρώθηκε", "Προετοιμασία αποστολής", "Απεστάλη"] as const;

export interface StageInfo {
  /** 0–3: ποιο από τα CUSTOMER_STEPS έχει φτάσει. null = δεν προχωρά τη μπάρα (π.χ. ακύρωση) */
  step: 0 | 1 | 2 | 3 | null;
  /** Ο τίτλος που βλέπει ο πελάτης (λογαριασμός και email) */
  title: string;
  /** Το κείμενο του email όταν ο διαχειριστής δεν έχει γράψει δικό του */
  message: string;
  cancelled?: boolean;
}

/**
 * Τα στάδια της παραγγελίας στο SoftOne, όπως τα όρισε η Euronics (πίνακας σειρών → κείμενο πληροφόρησης, 11/2026),
 * με κλειδί τον **τύπο** παραστατικού (FPRMS) — εκεί δουλεύει ο μηχανισμός ενημέρωσης, ώστε ένα κείμενο να καλύπτει
 * όλες τις σειρές του ίδιου τύπου. Προσοχή: η σειρά 7180 ανήκει στον τύπο 7080 «PKP ΑΠΟΘΗΚΗΣ».
 * Ο διαχειριστής μπορεί να αλλάξει τίτλο και κείμενο στις «Παραγγελίες → Ρυθμίσεις ενημέρωσης»· αυτά είναι οι προεπιλογές.
 */
export const STAGE_BY_FPRMS: Record<string, StageInfo> = {
  "7005": { step: 0, title: "Η παραγγελία καταχωρήθηκε", message: "Γεια σου {όνομα}, η παραγγελία {παραγγελία} καταχωρήθηκε με επιτυχία και ξεκινά η επεξεργασία της." },
  "7007": { step: 1, title: "Η πληρωμή ολοκληρώθηκε", message: "Γεια σου {όνομα}, η πληρωμή για την παραγγελία {παραγγελία} ολοκληρώθηκε. Ετοιμάζουμε τα προϊόντα σου." },
  "7008": { step: 0, title: "Σε αναμονή πληρωμής", message: "Γεια σου {όνομα}, η παραγγελία {παραγγελία} περιμένει την πληρωμή. Μόλις ολοκληρωθεί, ξεκινά η προετοιμασία της." },
  "7009": { step: null, cancelled: true, title: "Η παραγγελία ακυρώθηκε", message: "Γεια σου {όνομα}, η παραγγελία {παραγγελία} ακυρώθηκε. Αν έχει γίνει πληρωμή, τα χρήματα επιστρέφονται στον τρόπο πληρωμής που χρησιμοποίησες." },
  "7152": { step: 2, title: "Σε επεξεργασία", message: "Γεια σου {όνομα}, η παραγγελία {παραγγελία} είναι σε επεξεργασία." },
  "7153": { step: 2, title: "Σε επεξεργασία", message: "Γεια σου {όνομα}, για την παραγγελία {παραγγελία} φέρνουμε προϊόν από άλλο κατάστημα. Θα σε ενημερώσουμε μόλις είναι έτοιμη για αποστολή." },
  "7049": { step: 2, title: "Προετοιμασία αποστολής", message: "Γεια σου {όνομα}, η παραγγελία {παραγγελία} ετοιμάζεται για αποστολή." },
  "7080": { step: 2, title: "Προετοιμασία αποστολής", message: "Γεια σου {όνομα}, τα προϊόντα της παραγγελίας {παραγγελία} συγκεντρώνονται στην αποθήκη." },
  "7141": { step: 3, title: "Η παραγγελία απεστάλη", message: "Γεια σου {όνομα}, η παραγγελία {παραγγελία} στάλθηκε στις {ημερομηνία}. Θα τη λάβεις σύντομα." },
  "7315": { step: 3, title: "Εκδόθηκε η απόδειξη", message: "Γεια σου {όνομα}, για την παραγγελία {παραγγελία} εκδόθηκε η απόδειξη {παραστατικό} στις {ημερομηνία}." },
  "7261": { step: 3, title: "Εκδόθηκε το τιμολόγιο", message: "Γεια σου {όνομα}, για την παραγγελία {παραγγελία} εκδόθηκε το τιμολόγιο {παραστατικό} στις {ημερομηνία}." },
};

export const stageOf = (fprms: string | null | undefined): StageInfo | null => (fprms ? STAGE_BY_FPRMS[fprms] ?? null : null);

/**
 * Το τρέχον στάδιο μιας παραγγελίας από τα παραστατικά που έχουν καταγραφεί: το πιο «προχωρημένο» βήμα, και σε
 * ισοβαθμία το πιο πρόσφατο. Η ακύρωση υπερισχύει πάντα. Παραστατικά τύπου που δεν γνωρίζουμε αγνοούνται.
 */
export function currentStage<T extends { fprms: string | null; at: string }>(rows: T[]): (T & { info: StageInfo }) | null {
  const known = rows.flatMap((r) => { const info = stageOf(r.fprms); return info ? [{ ...r, info }] : []; });
  const cancelled = known.filter((r) => r.info.cancelled).sort((a, b) => b.at.localeCompare(a.at))[0];
  if (cancelled) return cancelled;
  return known.sort((a, b) => (b.info.step ?? -1) - (a.info.step ?? -1) || b.at.localeCompare(a.at))[0] ?? null;
}

/** Παλαιότερα παραστατικά δεν στέλνουν email (π.χ. την πρώτη φορά που ανοίγει η λειτουργία ή ο τύπος). */
export const MAX_AGE_DAYS = 2;

/**
 * Ποια παραστατικά είναι καινούργια (για καταγραφή) και ποια από αυτά στέλνουν email.
 * - η ρίζα (η ίδια η παραγγελία) ποτέ: ο πελάτης έχει ήδη την επιβεβαίωση του checkout
 * - μόνο επιλεγμένοι τύποι με κείμενο, μόνο πρόσφατα, και μία φορά ανά τύπο σε κάθε παραγγελία
 */
export function decide(input: { root: number; docs: StageDoc[]; seen: { findoc: number; fprms: string | null; notified: boolean }[]; types: StageType[]; today: string }) {
  const seenIds = new Set(input.seen.map((s) => s.findoc));
  const sentTypes = new Set(input.seen.filter((s) => s.notified && s.fprms).map((s) => s.fprms!));
  const byType = new Map(input.types.map((t) => [t.fprms, t]));
  const fresh = input.docs.filter((d) => !seenIds.has(d.findoc));
  const notify: StageDoc[] = [];
  for (const d of [...fresh].sort((a, b) => a.date.localeCompare(b.date) || a.findoc - b.findoc)) {
    const t = d.fprms ? byType.get(d.fprms) : undefined;
    if (d.findoc === input.root || !t?.notify || !t.message?.trim() || sentTypes.has(d.fprms!)) continue;
    if ((Date.parse(input.today) - Date.parse(d.date)) / 864e5 > MAX_AGE_DAYS) continue;
    sentTypes.add(d.fprms!);
    notify.push(d);
  }
  return { fresh, notify };
}

/** Πόσο «μπροστά» είναι μια κατάσταση: το SoftOne πάει την παραγγελία μόνο προς τα μπρος, ποτέ πίσω. */
const RANK: Record<string, number> = { pending: 0, paid: 1, processing: 2, shipped: 3, "ready-for-pickup": 3, delivered: 4 };

/**
 * Η κατάσταση του site που αντιστοιχεί στα παραστατικά της πορείας (ρίζα μαζί): ακύρωση (7009) → «Ακυρώθηκε»· βήμα 1
 * (Πληρωμένη) → «Πληρώθηκε»· βήμα 2 (Παραγγελία, PKP, εκκρεμότητα) → «Σε επεξεργασία»· βήμα 3 (Δελτίο αποστολής, απόδειξη,
 * τιμολόγιο) → «Στάλθηκε» μόνο με courier / μεταφορική. Παραλαβή από κατάστημα και ραντεβού μένουν «Σε επεξεργασία»:
 * το «Έτοιμη για παραλαβή» / «Παραδόθηκε» τα βάζει το κατάστημα, γιατί το δελτίο δεν λέει ότι έφτασε στο κατάστημα.
 * `driver` = το παραστατικό που το προκάλεσε (για το email). null όταν τίποτα δεν προχωρά την παραγγελία.
 */
export function statusFromDocs<T extends { fprms: string | null; date: string; findoc: number }>(docs: T[], fulfilment: string): { to: OrderStatus; driver: T } | null {
  const top = currentStage(docs.map((d) => ({ ...d, at: d.date })));
  if (!top) return null;
  if (top.info.cancelled) return { to: "cancelled", driver: top };
  const ship = fulfilment === "courier" || fulfilment === "freight";
  const to: OrderStatus | null = top.info.step === 1 ? "paid" : top.info.step === 2 ? "processing" : top.info.step === 3 ? (ship ? "shipped" : "processing") : null;
  return to ? { to, driver: top } : null;
}

/**
 * Τα βήματα από την τωρινή κατάσταση ως τη ζητούμενη, μόνο με επιτρεπτές αλλαγές (nextStatuses) και μόνο προς τα μπρος.
 * π.χ. Νέα → Στάλθηκε = [Σε επεξεργασία, Στάλθηκε]. Ακύρωση μόνο απευθείας. [] = τίποτα να γίνει (ή δεν γίνεται).
 */
export function statusPath(from: string, to: OrderStatus, fulfilment: string): OrderStatus[] {
  if (from === to) return [];
  if (to === "cancelled") return nextStatuses(from, fulfilment).includes("cancelled") ? ["cancelled"] : [];
  if (!(from in RANK) || RANK[to] <= RANK[from]) return [];
  // συντομότερη διαδρομή χωρίς ακύρωση / επιστροφή στη μέση
  const prev = new Map<string, string>([[from, ""]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === to) break;
    for (const n of nextStatuses(cur, fulfilment)) if (n in RANK && RANK[n] <= RANK[to] && !prev.has(n)) { prev.set(n, cur); queue.push(n); }
  }
  if (!prev.has(to)) return [];
  const path: OrderStatus[] = [];
  for (let c: string = to; c !== from; c = prev.get(c)!) path.unshift(c as OrderStatus);
  return path;
}
