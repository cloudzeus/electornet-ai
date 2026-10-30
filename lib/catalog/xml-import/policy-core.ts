import type { FieldKey } from "@/lib/catalog/supplier-sheet";
import { parseMoney, priceFrom, type Rounding } from "@/lib/catalog/pricing/markup";
import type { ForeignPrice } from "@/lib/catalog/foreign-import/plan-core";

/**
 * **Τι επιτρέπεται να αλλάξει το XML σε είδη που υπάρχουν ήδη στο SoftOne** — καθαρή λογική, χωρίς βάση.
 *
 * Τρεις ομάδες πεδίων, η καθεμία με δικό της τρόπο:
 * - `off`: το XML δεν αγγίζει την ομάδα,
 * - `blank`: συμπληρώνει μόνο ό,τι είναι κενό στο SoftOne (η προηγούμενη και προεπιλεγμένη συμπεριφορά),
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
}

export const DEFAULT_POLICY: UpdatePolicy = { price: "blank", content: "blank", tech: "blank", vatIncluded: false };

export const GROUPS: { key: FieldGroup; label: string; help: string }[] = [
  { key: "price", label: "Τιμή", help: "Τιμή web από το κόστος × κανόνα τιμολόγησης ή από τη λιανική του feed." },
  { key: "content", label: "Περιγραφές & χαρακτηριστικά", help: "Σύντομη και αναλυτική περιγραφή, εγγύηση, χαρακτηριστικά της ομάδας." },
  { key: "tech", label: "EAN, βάρος, διαστάσεις", help: "Barcode, κωδικός κατασκευαστή, βάρος, πλάτος, ύψος, βάθος." },
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
  };
}

type Part = { fields: Partial<Record<FieldKey, string>>; specs: Record<string, string> };

/** Χωρίζει τα πεδία μιας γραμμής σε «μόνο κενά» και «αντικατάσταση». Τα κλειδιά πάνε και στα δύο, ώστε κάθε μέρος να βρίσκει το είδος. */
export function splitByPolicy(fields: Partial<Record<FieldKey, string>>, specs: Record<string, string>, p: UpdatePolicy): { blank: Part | null; over: Part | null } {
  const keys: Partial<Record<FieldKey, string>> = {};
  const blank: Part = { fields: {}, specs: {} }, over: Part = { fields: {}, specs: {} };
  for (const [k, v] of Object.entries(fields) as [FieldKey, string][]) {
    if (v == null) continue;
    if (KEYS.has(k)) { keys[k] = v; continue; }
    const g = groupOfField(k);
    const mode = g ? p[g] : "off";
    if (mode === "off") continue;
    // το όνομα: ποτέ αντικατάσταση
    if (mode === "overwrite" && k !== "name") over.fields[k] = v; else blank.fields[k] = v;
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
 * - `cost`: κόστος (χωρίς ΦΠΑ — αν το feed το δίνει με ΦΠΑ, αφαιρείται πρώτα) × κανόνας markup + ΦΠΑ,
 * - `retail`: η λιανική του feed (αν είναι χωρίς ΦΠΑ, προστίθεται).
 * Ίδιο σχήμα αποτελέσματος με το `planPrice`, ώστε η προεπισκόπηση να μην αλλάζει.
 */
export function policyPrice(i: { mode: "cost" | "retail"; cost: string | null; rrp: string | null; rule: { percent: number; rounding: Rounding } | null; label: string; vat: number; vatIncluded: boolean }): { price?: ForeignPrice; warning?: string } {
  const k = 1 + i.vat / 100;
  if (i.mode === "retail") {
    if (!i.rrp?.trim()) return {};
    const r = parseMoney(i.rrp);
    if (r == null) return { warning: `Η λιανική «${i.rrp.trim()}» δεν είναι ποσό.` };
    const price = round2(i.vatIncluded ? r : r * k);
    const cost = i.cost ? parseMoney(i.cost) : null;
    const net = cost == null ? 0 : i.vatIncluded ? cost / k : cost;
    return { price: { cost: round2(net), price, rule: i.vatIncluded ? "λιανική του feed (με ΦΠΑ)" : `λιανική του feed + ΦΠΑ ${i.vat}%`, capped: false, margin: round2(price / k - net) } };
  }
  if (!i.cost?.trim()) return {};
  const c = parseMoney(i.cost);
  if (c == null) return { warning: `Το κόστος «${i.cost.trim()}» δεν είναι ποσό.` };
  if (!i.rule) return { warning: "Δεν υπάρχει κανόνας τιμολόγησης." };
  const net = i.vatIncluded ? round2(c / k) : c;
  const rrp = i.rrp ? parseMoney(i.rrp) : null;
  // η προτεινόμενη λιανική (όριο) είναι πάντα τελική τιμή με ΦΠΑ, όπως στο Excel
  const p = priceFrom({ cost: net, percent: i.rule.percent, vat: i.vat, rounding: i.rule.rounding, rrp });
  return { price: { cost: net, price: p.price, rule: i.vatIncluded ? `${i.label} (κόστος με ΦΠΑ → χωρίς)` : i.label, capped: p.capped, margin: p.margin } };
}
