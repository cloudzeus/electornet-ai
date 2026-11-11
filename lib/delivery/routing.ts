/**
 * Δρομολόγηση παραγγελίας: ποιος την πάει στον πελάτη. Καθαρές συναρτήσεις (ίδιες στο checkout, στη δημιουργία
 * διαδρομής και στην προεπισκόπηση της αρχικοποίησης συνεργάτη).
 *
 * courier → courier · click-collect → παραλαβή από κατάστημα
 * μεταφορική / ραντεβού → συνεργάτης που εξυπηρετεί τον Τ.Κ.:
 *   έχει απόθεμα → «partner» (παραδίδει ο ίδιος από το δικό του)
 *   δεν έχει, αλλά έχει πρακτορείο → «agency» (οδηγός μας → πρακτορείο → συνεργάτης → πελάτης)
 *   αλλιώς → «unrouted»: διαλέγει ο διαχειριστής μεταφορική απευθείας στον πελάτη → «freight»
 */
export type RouteMode = "courier" | "pickup" | "partner" | "agency" | "freight" | "unrouted";
export type StepKey = "load" | "agency" | "partner" | "carrier" | "customer";

export interface PartnerDelivery {
  /** προθέματα ή πλήρεις Τ.Κ. που εξυπηρετεί */
  zips: string[];
  homeDelivery: boolean;
  /** παραδίδει ογκώδη (λευκές συσκευές, τηλεοράσεις > 65″) */
  bulkyOk: boolean;
  /** κάνει εγκατάσταση */
  installs: boolean;
  eta: string;
}
export interface RouteCandidate { id: string; name: string; delivery: PartnerDelivery | null; agencyId: string | null; hasStock: boolean }
export interface RouteInput { fulfilment: string; zip: string | null | undefined; bulky: boolean; install: boolean; candidates: RouteCandidate[] }
export interface RouteDecision { mode: RouteMode; partnerId: string | null; agencyId: string | null; reason: string }

export const STEPS: Record<RouteMode, StepKey[]> = {
  courier: ["carrier", "customer"],
  pickup: ["partner", "customer"],
  partner: ["partner", "customer"],
  agency: ["load", "agency", "partner", "customer"],
  freight: ["load", "carrier", "customer"],
  unrouted: [],
};
export const STEP_LABEL: Record<StepKey, string> = {
  load: "Φόρτωσε ο οδηγός μας",
  agency: "Στο πρακτορείο",
  partner: "Στον συνεργάτη",
  carrier: "Στη μεταφορική",
  customer: "Παραδόθηκε στον πελάτη",
};
export const MODE_LABEL: Record<RouteMode, string> = {
  courier: "Courier",
  pickup: "Παραλαβή από κατάστημα",
  partner: "Συνεργάτης από δικό του απόθεμα",
  agency: "Μέσω πρακτορείου στον συνεργάτη",
  freight: "Μεταφορική απευθείας στον πελάτη",
  unrouted: "Χωρίς δρομολόγηση",
};

/** Πόσο ειδικά ταιριάζει ο Τ.Κ. στη λίστα του συνεργάτη (μήκος του προθέματος)· 0 = δεν τον εξυπηρετεί. */
export function zipMatch(d: PartnerDelivery | null, zip: string | null | undefined): number {
  if (!d || !/^\d{5}$/.test(zip ?? "")) return 0;
  return d.zips.reduce((best, p) => (zip!.startsWith(p) && p.length > best ? p.length : best), 0);
}

/** Ο συνεργάτης που εξυπηρετεί: όσοι μπορούν (ογκώδη / εγκατάσταση), πρώτα όποιος έχει απόθεμα, μετά ο πιο ειδικός Τ.Κ. */
export function pickPartner(input: RouteInput): RouteCandidate | null {
  const ok = input.candidates.filter((c) => c.delivery?.homeDelivery && zipMatch(c.delivery, input.zip) > 0 && (!input.bulky || c.delivery.bulkyOk) && (!input.install || c.delivery.installs));
  return ok.sort((a, b) => Number(b.hasStock) - Number(a.hasStock) || zipMatch(b.delivery, input.zip) - zipMatch(a.delivery, input.zip) || a.name.localeCompare(b.name, "el"))[0] ?? null;
}

export function decideRoute(input: RouteInput): RouteDecision {
  if (input.fulfilment === "courier") return { mode: "courier", partnerId: null, agencyId: null, reason: "Ο πελάτης διάλεξε courier" };
  if (input.fulfilment === "click-collect") return { mode: "pickup", partnerId: null, agencyId: null, reason: "Παραλαβή από κατάστημα" };
  const p = pickPartner(input);
  if (!p) return { mode: "unrouted", partnerId: null, agencyId: null, reason: /^\d{5}$/.test(input.zip ?? "") ? `Κανένας συνεργάτης δεν εξυπηρετεί τον Τ.Κ. ${input.zip}${input.bulky ? " για ογκώδη" : ""}${input.install ? " με εγκατάσταση" : ""}` : "Άγνωστος Τ.Κ." };
  if (p.hasStock) return { mode: "partner", partnerId: p.id, agencyId: null, reason: `${p.name}: έχει απόθεμα και εξυπηρετεί τον Τ.Κ.` };
  if (p.agencyId) return { mode: "agency", partnerId: p.id, agencyId: p.agencyId, reason: `${p.name}: χωρίς απόθεμα, το στέλνουμε στο πρακτορείο του` };
  return { mode: "unrouted", partnerId: p.id, agencyId: null, reason: `${p.name}: χωρίς απόθεμα και χωρίς πρακτορείο. Διάλεξε μεταφορική` };
}

/** Το επόμενο βήμα που περιμένουμε (null = ολοκληρώθηκε ή δεν έχει βήματα). */
export function nextStep(steps: { key: string; sort: number; doneAt: Date | null }[]): string | null {
  return [...steps].sort((a, b) => a.sort - b.sort).find((s) => !s.doneAt)?.key ?? null;
}

/** Ό,τι έρχεται από τη φόρμα/βάση γίνεται έγκυρο PartnerDelivery. */
export function normalizeDelivery(raw: unknown): PartnerDelivery {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const zipsIn = Array.isArray(r.zips) ? r.zips : String(r.zips ?? "").split(/[\s,;]+/);
  const zips = [...new Set(zipsIn.map((z) => String(z).trim()).filter((z) => /^\d{2,5}$/.test(z)))].slice(0, 400);
  return { zips, homeDelivery: r.homeDelivery === true, bulkyOk: r.bulkyOk === true, installs: r.installs === true, eta: String(r.eta ?? "").trim().slice(0, 60) };
}

export type CarrierRole = "driver" | "courier" | "agency" | "partner-vehicle" | "other";
export const ROLE_LABEL: Record<CarrierRole, string> = { driver: "Οδηγός μας", courier: "Courier", agency: "Πρακτορείο / μεταφορική", "partner-vehicle": "Όχημα συνεργάτη", other: "Άλλο" };
export const isCarrierRole = (v: unknown): v is CarrierRole => typeof v === "string" && v in ROLE_LABEL;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-ZΑ-Ω0-9 ]/g, " ").replace(/\s+/g, " ").trim();
/**
 * Πρόταση ρόλου από τον κωδικό SOCARRIER και το όνομα: 1xxx οδηγοί μας, 2xxx couriers, όνομα με «πρακτορείο / μεταφορική /
 * pallets / trans» → πρακτορείο, ίδιο όνομα με συνεργάτη → όχημα συνεργάτη. Μόνο πρόταση: ο διαχειριστής επιβεβαιώνει.
 */
export function suggestRole(c: { s1Id: string | null; name: string }, partnerNames: string[]): CarrierRole {
  const n = Number(c.s1Id);
  if (n >= 1000 && n < 2000) return "driver";
  if (n >= 2000 && n < 3000) return "courier";
  const name = norm(c.name);
  if (/ΠΡΑΚΤΟΡ|ΜΕΤΑΦΟΡ|PALLET|TRANS|ΣΤΕΦΑΝΙΔΗ/.test(name)) return "agency";
  const head = name.split(" - ")[0].split(" ").slice(0, 2).join(" ");
  if (head.length >= 5 && partnerNames.some((p) => norm(p).startsWith(head))) return "partner-vehicle";
  return "other";
}
