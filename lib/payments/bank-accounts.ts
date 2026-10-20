/**
 * Τραπεζικοί λογαριασμοί για την «Κατάθεση σε τράπεζα» (Ρυθμίσεις → Πληρωμές). Αποθηκεύονται ως JSON στο πεδίο
 * `bankAccounts` της ενότητας payments· εδώ μόνο καθαροί κανόνες: έλεγχος IBAN (mod-97), τράπεζα από τον κωδικό του
 * ελληνικού IBAN, έλεγχος της λίστας πριν την αποθήκευση και ό,τι βλέπει ο πελάτης (μόνο πλήρεις, έγκυροι λογαριασμοί).
 */
export interface BankAccount {
  /** λογότυπο από τη βιβλιοθήκη πολυμέσων (https ή /διαδρομή)· κενό = χωρίς λογότυπο */
  logo: string;
  /** αναλογία πλάτους/ύψους μετά την αυτόματη περικοπή — για ίδιο οπτικό βάρος όλων των λογοτύπων */
  logoAspect?: number;
  bank: string;
  /** δικαιούχος */
  holder: string;
  /** κανονικοποιημένο: κεφαλαία, χωρίς κενά */
  iban: string;
}

export const MAX_ACCOUNTS = 12;

/** Κωδικός τράπεζας (θέσεις 5–7 του ελληνικού IBAN) → όνομα. Μόνο όσες είμαστε βέβαιοι· άγνωστος κωδικός = το γράφει ο διαχειριστής. */
const GR_BANKS: Record<string, string> = { "011": "Εθνική Τράπεζα", "014": "Alpha Bank", "016": "Attica Bank", "017": "Τράπεζα Πειραιώς", "026": "Eurobank" };

export const normalizeIban = (s: string) => String(s ?? "").replace(/[\s-]+/g, "").toUpperCase();

export function ibanValid(raw: string): boolean {
  const s = normalizeIban(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  if (s.startsWith("GR") && s.length !== 27) return false;
  // mod-97 σε κομμάτια (ο αριθμός ξεπερνά τα όρια του Number)
  let rem = 0;
  for (const ch of s.slice(4) + s.slice(0, 4)) {
    const d = ch >= "A" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const x of d) rem = (rem * 10 + Number(x)) % 97;
  }
  return rem === 1;
}

export const formatIban = (s: string) => normalizeIban(s).replace(/(.{4})(?=.)/g, "$1 ");

export function bankFromIban(raw: string): string | null {
  const s = normalizeIban(raw);
  return s.startsWith("GR") && s.length >= 7 ? GR_BANKS[s.slice(4, 7)] ?? null : null;
}

/** https://… ή δική μας διαδρομή /… (όχι //host, όχι javascript:, όχι http) */
const safeLogo = (u: string) => !u || /^https:\/\/[^\s"'<>]+$/i.test(u) || /^\/(?!\/)[^\s"'<>]*$/.test(u);

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Από την αποθηκευμένη τιμή (JSON string ή πίνακας)· ό,τι δεν είναι λογαριασμός αγνοείται. */
export function parseAccounts(raw: unknown): BankAccount[] {
  let v: unknown = raw;
  if (typeof raw === "string") { try { v = raw.trim() ? JSON.parse(raw) : []; } catch { return []; } }
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x))
    .slice(0, MAX_ACCOUNTS)
    .map((x) => {
      const a = typeof x.logoAspect === "number" && Number.isFinite(x.logoAspect) && x.logoAspect > 0.1 && x.logoAspect < 20 ? x.logoAspect : null;
      return { logo: str(x.logo, 500), ...(a ? { logoAspect: a } : {}), bank: str(x.bank, 80), holder: str(x.holder, 120), iban: normalizeIban(str(x.iban, 60)) };
    });
}

export type AccountError = { index: number; field: "bank" | "holder" | "iban" | "logo"; message: string };

export function validateAccounts(list: BankAccount[]): AccountError[] {
  const errs: AccountError[] = [];
  const seen = new Set<string>();
  if (list.length > MAX_ACCOUNTS) errs.push({ index: MAX_ACCOUNTS, field: "iban", message: `Έως ${MAX_ACCOUNTS} λογαριασμοί.` });
  list.forEach((a, index) => {
    if (!a.bank.trim()) errs.push({ index, field: "bank", message: "Γράψε το όνομα της τράπεζας." });
    if (!a.holder.trim()) errs.push({ index, field: "holder", message: "Γράψε τον δικαιούχο." });
    const iban = normalizeIban(a.iban);
    if (!ibanValid(iban)) errs.push({ index, field: "iban", message: iban.startsWith("GR") || !iban ? "Μη έγκυρο IBAN: ελληνικό IBAN = GR + 25 ψηφία, με σωστά ψηφία ελέγχου." : "Μη έγκυρο IBAN (λάθος ψηφία ελέγχου ή μήκος)." });
    else if (seen.has(iban)) errs.push({ index, field: "iban", message: "Αυτό το IBAN υπάρχει ήδη σε άλλη γραμμή." });
    seen.add(iban);
    if (!safeLogo(a.logo.trim())) errs.push({ index, field: "logo", message: "Το λογότυπο πρέπει να είναι εικόνα από τη βιβλιοθήκη (https)." });
  });
  return errs;
}

/** Ό,τι βλέπει ο πελάτης: μόνο πλήρεις λογαριασμοί με έγκυρο IBAN· λογότυπο που δεν περνά τον έλεγχο απλώς δεν εμφανίζεται. */
export function usableAccounts(raw: unknown): BankAccount[] {
  return parseAccounts(raw)
    .filter((a) => a.bank && a.holder && ibanValid(a.iban))
    .map((a) => (safeLogo(a.logo) ? a : { bank: a.bank, holder: a.holder, iban: a.iban, logo: "" }));
}

/** «Εθνική Τράπεζα · Eurobank» — ο υπότιτλος της επιλογής στο checkout. */
export const bankNames = (list: BankAccount[]) => [...new Set(list.map((a) => a.bank).filter(Boolean))].join(" · ");

/** Για την αποθήκευση από τη φόρμα: κανονικοποιημένο JSON (κενό = κανένας λογαριασμός) ή ένα μήνυμα με τα λάθη ανά γραμμή. */
export function accountsForSave(raw: string): { value: string; message: string | null } {
  const list = parseAccounts(raw);
  const errs = validateAccounts(list);
  if (errs.length) {
    const rows = [...new Set(errs.map((e) => e.index))].map((i) => `Λογαριασμός ${i + 1}: ${errs.filter((e) => e.index === i).map((e) => e.message).join(" ")}`);
    return { value: "", message: rows.join(" · ") };
  }
  return { value: list.length ? JSON.stringify(list) : "", message: null };
}
