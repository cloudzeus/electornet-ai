import { QUESTION_STEPS } from "./questions";
import { CONN_TYPES } from "./connection-types";

/** Επιλογές της «Εκδήλωσης ενδιαφέροντος» (κοινές για τη φόρμα, τον server και τη διαχείριση). */
export type Opt = { value: string; label: string; hint?: string };

const fromQuestion = (key: string): Opt[] => QUESTION_STEPS.flatMap((s) => s.questions).find((q) => q.key === key)?.options ?? [];

/** Τι θέλει να συνδέσει με το euronics.gr (είδος διασύνδεσης). */
export const INTEREST_KINDS: Opt[] = [
  { value: "stock", label: "Διαθεσιμότητα αποθέματος", hint: "οι πελάτες βλέπουν τι έχει το ράφι σας" },
  { value: "pickup", label: "Παραλαβή από το κατάστημα", hint: "αγορά online, παραλαβή από εσάς" },
  { value: "orders", label: "Παραγγελίες του eshop", hint: "εξυπηρετείτε παραγγελίες της περιοχής σας" },
  { value: "payments", label: "Αυτόματη εκκαθάριση πληρωμών", hint: "το ποσό πιστώνεται σε εσάς" },
  { value: "restock", label: "Αναπλήρωση αποθέματος", hint: "παραγγελίες αναπλήρωσης από την Euronics" },
];
export const INTEREST_BANKS: Opt[] = fromQuestion("banks");
export const INTEREST_ERP: Opt[] = fromQuestion("erp");
export const INTEREST_ESHOP: Opt[] = fromQuestion("eshop");
export const INTEREST_METHODS: Opt[] = [
  ...CONN_TYPES.map((c) => ({ value: c.type, label: c.title, hint: c.blurb })),
  { value: "unsure", label: "Δεν ξέρω ακόμη", hint: "θα σας προτείνουμε τον πιο εύκολο τρόπο" },
];

export const INTEREST_STATUS: Record<string, { label: string; tone: "warn" | "info" | "good" | "neutral" }> = {
  new: { label: "Νέα", tone: "warn" },
  contacted: { label: "Σε επικοινωνία", tone: "info" },
  done: { label: "Ολοκληρώθηκε", tone: "good" },
  rejected: { label: "Δεν προχωρά", tone: "neutral" },
};

const pick = (opts: Opt[], v: string | null | undefined) => opts.find((o) => o.value === v)?.label ?? v ?? "—";
export const interestLabel = {
  kind: (v: string) => pick(INTEREST_KINDS, v),
  bank: (v: string) => pick(INTEREST_BANKS, v),
  erp: (v: string | null) => (v ? pick(INTEREST_ERP, v) : "—"),
  eshop: (v: string | null) => (v ? pick(INTEREST_ESHOP, v) : "—"),
  method: (v: string | null) => (v ? pick(INTEREST_METHODS, v) : "—"),
};

/** Πρόταση τρόπου από τις απαντήσεις (ίδια λογική με το ερωτηματολόγιο της πύλης, χωρίς τα πεδία που δεν ρωτάμε εδώ). */
export function suggestMethod(erp: string, eshop: string): string {
  if (erp === "softone") return "softone-ws";
  if (eshop === "woocommerce") return "woocommerce";
  if (erp && erp !== "excel") return "feed-url";
  return "manual";
}
