/**
 * Έλεγχος πληρότητας: ένα προϊόν δημοσιεύεται στη βιτρίνα μόνο όταν περνά όλα τα κριτήρια που είναι ενεργά. Καθαρή
 * συνάρτηση — τα στοιχεία τα μαζεύει το `publish-ready-server.ts`. (Το `readiness.ts` μένει για τα «προτεινόμενα» της
 * καρτέλας προϊόντος· αυτό εδώ αποφασίζει αν φαίνεται.)
 */
export type PublishKey = "web" | "category" | "photo" | "specs" | "dims" | "avail";
export const PUBLISH_CRITERIA: { key: PublishKey; label: string; missing: string; hint: string }[] = [
  { key: "web", label: "Ενεργό για το web", missing: "Εξαίρεση Web στο SoftOne", hint: "Το πεδίο «Εξαίρεση Web» (BOOL04) του είδους είναι τσεκαρισμένο." },
  { key: "category", label: "Web κατηγορία", missing: "Χωρίς web κατηγορία", hint: "Το είδος δεν έχει web ομάδα χαρακτηριστικών / κατηγορία στο SoftOne." },
  { key: "photo", label: "Τουλάχιστον μία φωτογραφία", missing: "Χωρίς φωτογραφία", hint: "Καμία ορατή φωτογραφία στη βιβλιοθήκη του προϊόντος." },
  { key: "specs", label: "Χαρακτηριστικά", missing: "Χωρίς χαρακτηριστικά", hint: "Κανένα τεχνικό χαρακτηριστικό." },
  { key: "dims", label: "Διαστάσεις & βάρος", missing: "Χωρίς διαστάσεις ή βάρος", hint: "Χρειάζονται για τον υπολογισμό της αποστολής — όχι στις κατηγορίες «μόνο κατάστημα» και «μεταφορική»." },
  { key: "avail", label: "Διαθεσιμότητα", missing: "Η διαθεσιμότητα δεν επιτρέπει δημοσίευση", hint: "Κενή φράση ή κανόνας διαθεσιμότητας με «Δημοσιεύεται: όχι»." },
];
export const isPublishKey = (k: unknown): k is PublishKey => PUBLISH_CRITERIA.some((c) => c.key === k);
export const ALL_KEYS = PUBLISH_CRITERIA.map((c) => c.key);

export interface PublishInput {
  webExcluded: boolean;
  hasWebCategory: boolean;
  photos: number;
  specs: number;
  /** και οι τρεις διαστάσεις */
  dims: boolean;
  weight: boolean;
  /** η κατηγορία πάει μόνο από κατάστημα ή με μεταφορική: διαστάσεις / βάρος δεν χρειάζονται */
  shipExempt: boolean;
  avail: { label: string; publish: boolean };
}

/** Όλα τα κριτήρια που δεν περνά (ανεξάρτητα από το ποια είναι ενεργά — για τη διαχείριση). */
export function publishMissing(x: PublishInput): PublishKey[] {
  const out: PublishKey[] = [];
  if (x.webExcluded) out.push("web");
  if (!x.hasWebCategory) out.push("category");
  if (x.photos < 1) out.push("photo");
  if (x.specs < 1) out.push("specs");
  if (!x.shipExempt && !(x.dims && x.weight)) out.push("dims");
  if (!x.avail.label.trim() || !x.avail.publish) out.push("avail");
  return out;
}

export interface PublishGate { enabled: boolean; criteria: PublishKey[] }
export const DEFAULT_GATE: PublishGate = { enabled: false, criteria: ALL_KEYS };
export function normalizeGate(raw: unknown): PublishGate {
  const o = (raw ?? {}) as { enabled?: unknown; criteria?: unknown };
  const criteria = Array.isArray(o.criteria) ? [...new Set(o.criteria.filter(isPublishKey))] : DEFAULT_GATE.criteria;
  return { enabled: o.enabled === true, criteria };
}

/** Με κλειστό έλεγχο όλα δημοσιεύονται· αλλιώς μόνο όσα δεν χάνουν κανένα ενεργό κριτήριο. */
export const isPublishable = (missing: PublishKey[], gate: PublishGate) => !gate.enabled || !missing.some((k) => gate.criteria.includes(k));
