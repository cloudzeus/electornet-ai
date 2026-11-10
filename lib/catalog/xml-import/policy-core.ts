import type { FieldKey } from "@/lib/catalog/supplier-sheet";
import { parseMoney, priceFrom, type Rounding } from "@/lib/catalog/pricing/markup";
import type { ForeignPrice } from "@/lib/catalog/foreign-import/plan-core";
import { normEan } from "@/lib/catalog/foreign-import/core";

/**
 * **Τι επιτρέπεται να αλλάξει το XML σε είδη που υπάρχουν ήδη στο SoftOne** — καθαρή λογική, χωρίς βάση.
 *
 * Τρεις ομάδες πεδίων, η καθεμία με δικό της τρόπο:
 * - `off`: το XML δεν αγγίζει την ομάδα,
 * - `blank`: η προεπιλεγμένη, «έξυπνη» συμπεριφορά — συμπληρώνει ό,τι είναι κενό στο SoftOne **και βελτιώνει μόνο όπου
 *   το καινούργιο είναι αποδεδειγμένα καλύτερο**, ποτέ το αντίστροφο:
 *   · τιμή: μπαίνει όπου λείπει, ανεβαίνει όπου η νέα είναι μεγαλύτερη (`priceApplies`),
 *   · περιγραφές: αντικαθίστανται όταν του προμηθευτή είναι αισθητά πληρέστερη (`richer`),
 *   · barcode: αντικαθίσταται όταν το δικό μας δεν είναι έγκυρο EAN και του προμηθευτή είναι (`improves`),
 * - `overwrite`: αντικαθιστά και ό,τι διαφέρει.
 * Το όνομα του είδους δεν αντικαθίσταται ποτέ (είναι η ταυτότητά του στο ERP): μόνο συμπληρώνεται αν λείπει.
 * Οι κωδικοί (MTRL, κωδικός) είναι κλειδιά ταιριάσματος και δεν είναι πεδία προς ενημέρωση.
 */
export type GroupMode = "off" | "blank" | "overwrite";
export type FieldGroup = "price" | "content" | "tech";
export interface UpdatePolicy {
  price: GroupMode;
  content: GroupMode;
  tech: GroupMode;
  /** η τιμή του feed (κόστος ή λιανική) περιλαμβάνει ήδη ΦΠΑ */
  vatIncluded: boolean;
  /** ποσοστό markup που όρισε ο χρήστης για αυτή την εισαγωγή· `null` = ό,τι λέει ο κανόνας τιμολόγησης */
  markupPercent: number | null;
}

export const DEFAULT_POLICY: UpdatePolicy = { price: "blank", content: "blank", tech: "blank", vatIncluded: false, markupPercent: null };

export const GROUPS: { key: FieldGroup; label: string; help: string }[] = [
  { key: "price", label: "Τιμή", help: "Τιμή web από το κόστος × κανόνα τιμολόγησης ή από τη λιανική του προμηθευτή. «Κενή ή μεγαλύτερη»: μπαίνει όπου λείπει και ανεβαίνει όπου η νέα είναι μεγαλύτερη· «Αντικατάσταση»: αλλάζει και προς τα κάτω." },
  { key: "content", label: "Περιγραφές & χαρακτηριστικά", help: "Σύντομη και αναλυτική περιγραφή, εγγύηση, χαρακτηριστικά της ομάδας. «Κενά ή πληρέστερα»: μπαίνουν όπου το είδος δεν έχει τίποτα, και μια περιγραφή αντικαθίσταται μόνο όταν του προμηθευτή είναι αισθητά πληρέστερη (τουλάχιστον 20 % μακρύτερη)· τα χαρακτηριστικά που έχουν ήδη τιμή μένουν. «Αντικατάσταση»: αλλάζει και ό,τι απλώς διαφέρει — χάνονται δικές σας διορθώσεις στο SoftOne." },
  { key: "tech", label: "EAN, βάρος, διαστάσεις", help: "Barcode, κωδικός κατασκευαστή, βάρος, πλάτος, ύψος, βάθος. «Κενά ή έγκυρο EAN»: συμπληρώνονται όπου λείπουν, και το barcode διορθώνεται μόνο όταν το δικό μας δεν είναι έγκυρο EAN και του προμηθευτή είναι· βάρος, διαστάσεις και κωδικός κατασκευαστή που υπάρχουν μένουν. «Αντικατάσταση»: αλλάζουν και όσα διαφέρουν από του προμηθευτή." },
];

const KEYS = new Set<FieldKey>(["mtrl", "code"]);
const GROUP_OF: Partial<Record<FieldKey, FieldGroup>> = {
  name: "content", shortDesc: "content", descText: "content", guaranteeMonths: "content",
  barcode: "tech", factoryCode: "tech", weightKg: "tech", widthCm: "tech", heightCm: "tech", lengthCm: "tech",
};
export const groupOfField = (k: FieldKey): FieldGroup | null => GROUP_OF[k] ?? null;

const isMode = (v: unknown): v is GroupMode => v === "off" || v === "blank" || v === "overwrite";
export function normPolicy(x: unknown): UpdatePolicy {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  return {
    price: isMode(o.price) ? o.price : DEFAULT_POLICY.price,
    content: isMode(o.content) ? o.content : DEFAULT_POLICY.content,
    tech: isMode(o.tech) ? o.tech : DEFAULT_POLICY.tech,
    vatIncluded: o.vatIncluded === true,
    markupPercent: typeof o.markupPercent === "number" && Number.isFinite(o.markupPercent) && o.markupPercent >= 0 && o.markupPercent <= 1000 ? o.markupPercent : null,
  };
}

const plainLen = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim().length;
/**
 * «Πληρέστερη» περιγραφή: τουλάχιστον 20 % ΚΑΙ 30 χαρακτήρες μακρύτερη (χωρίς HTML). Τα δύο όρια μαζί αποκλείουν τις
 * διαφορές στίξης/διατύπωσης — μια περιγραφή που κάποιος έγραψε με το χέρι δεν χάνεται για λίγες λέξεις παραπάνω.
 */
export const richer = (current: string, incoming: string): boolean => { const c = plainLen(current), n = plainLen(incoming); return c > 0 && n >= c * 1.2 && n - c >= 30; };

/**
 * Στην «έξυπνη» λειτουργία: αξίζει να αντικατασταθεί αυτό το πεδίο που ΕΧΕΙ ήδη τιμή; Μόνο περιγραφές που γίνονται
 * πληρέστερες και barcode που γίνεται έγκυρο EAN. Όνομα, κωδικοί, εγγύηση, βάρος και διαστάσεις δεν έχουν «καλύτερο» που
 * να κρίνεται μηχανικά — μένουν όπως είναι, εκτός αν ο χρήστης διαλέξει «Αντικατάσταση».
 */
export function improves(k: FieldKey, current: string, incoming: string): boolean {
  if (k === "shortDesc" || k === "descText") return richer(current, incoming);
  if (k === "barcode") return !!current.trim() && !normEan(current) && !!normEan(incoming);
  return false;
}

type Part = { fields: Partial<Record<FieldKey, string>>; specs: Record<string, string> };

/** Χωρίζει τα πεδία μιας γραμμής σε «μόνο κενά» και «αντικατάσταση». Τα κλειδιά πάνε και στα δύο, ώστε κάθε μέρος να βρίσκει το είδος. */
export function splitByPolicy(fields: Partial<Record<FieldKey, string>>, specs: Record<string, string>, p: UpdatePolicy, /** «έξυπνη» λειτουργία: το πεδίο έχει ήδη τιμή αλλά η καινούργια είναι καλύτερη → αντικατάσταση μόνο αυτού */ better?: (k: FieldKey, v: string) => boolean): { blank: Part | null; over: Part | null } {
  const keys: Partial<Record<FieldKey, string>> = {};
  const blank: Part = { fields: {}, specs: {} }, over: Part = { fields: {}, specs: {} };
  for (const [k, v] of Object.entries(fields) as [FieldKey, string][]) {
    if (v == null) continue;
    if (KEYS.has(k)) { keys[k] = v; continue; }
    const g = groupOfField(k);
    const mode = g ? p[g] : "off";
    if (mode === "off") continue;
    // το όνομα: ποτέ αντικατάσταση
    if (k !== "name" && (mode === "overwrite" || (mode === "blank" && better?.(k, v)))) over.fields[k] = v; else blank.fields[k] = v;
  }
  if (p.content !== "off") Object.assign(p.content === "overwrite" ? over.specs : blank.specs, specs);
  const has = (x: Part) => Object.keys(x.fields).length > 0 || Object.keys(x.specs).length > 0;
  return {
    blank: has(blank) ? { fields: { ...keys, ...blank.fields }, specs: blank.specs } : null,
    over: has(over) ? { fields: { ...keys, ...over.fields }, specs: over.specs } : null,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Η τιμή web από το feed, όπως όρισε ο χρήστης στο τελευταίο βήμα:
 * - `cost`: κόστος (χωρίς ΦΠΑ — αν το feed το δίνει με ΦΠΑ, αφαιρείται πρώτα) × markup + ΦΠΑ,
 * - `retail`: η λιανική του feed, καθαρή × markup + ΦΠΑ (χωρίς markup: αυτούσια).
 * Το `markupPercent` του χρήστη υπερισχύει του κανόνα τιμολόγησης και κάνει τον κανόνα προαιρετικό.
 * Ίδιο σχήμα αποτελέσματος με το `planPrice`, ώστε η προεπισκόπηση να μην αλλάζει.
 */
export function policyPrice(i: { mode: "cost" | "retail"; cost: string | null; rrp: string | null; rule: { percent: number; rounding: Rounding } | null; label: string; vat: number; vatIncluded: boolean; markupPercent?: number | null }): { price?: ForeignPrice; warning?: string } {
  const k = 1 + i.vat / 100;
  const m = typeof i.markupPercent === "number" ? i.markupPercent : null;
  const pct = (n: number) => `${String(Math.round(n * 100) / 100).replace(".", ",")}%`;
  if (i.mode === "retail") {
    if (!i.rrp?.trim()) return {};
    const r = parseMoney(i.rrp);
    if (r == null) return { warning: `Η λιανική «${i.rrp.trim()}» δεν είναι ποσό.` };
    const base = i.vatIncluded ? r / k : r;
    const price = round2(base * (1 + (m ?? 0) / 100) * k);
    const cost = i.cost ? parseMoney(i.cost) : null;
    const net = cost == null ? 0 : i.vatIncluded ? cost / k : cost;
    const how = m == null ? (i.vatIncluded ? "λιανική του feed (με ΦΠΑ)" : `λιανική του feed + ΦΠΑ ${i.vat}%`) : `λιανική του feed + markup ${pct(m)} + ΦΠΑ ${i.vat}%`;
    return { price: { cost: round2(net), price, rule: how, capped: false, margin: round2(price / k - net) } };
  }
  if (!i.cost?.trim()) return {};
  const c = parseMoney(i.cost);
  if (c == null) return { warning: `Το κόστος «${i.cost.trim()}» δεν είναι ποσό.` };
  const percent = m ?? i.rule?.percent;
  if (percent == null) return { warning: "Δεν υπάρχει κανόνας τιμολόγησης." };
  const net = i.vatIncluded ? round2(c / k) : c;
  const rrp = i.rrp ? parseMoney(i.rrp) : null;
  // η προτεινόμενη λιανική (όριο) είναι πάντα τελική τιμή με ΦΠΑ, όπως στο Excel
  const p = priceFrom({ cost: net, percent, vat: i.vat, rounding: i.rule?.rounding ?? "none", rrp });
  const label = m == null ? i.label : `markup ${pct(m)}`;
  return { price: { cost: net, price: p.price, rule: i.vatIncluded ? `${label} (κόστος με ΦΠΑ → χωρίς)` : label, capped: p.capped, margin: p.margin } };
}
