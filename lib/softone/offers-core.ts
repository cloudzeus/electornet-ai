/**
 * **Τι από τα πρόσθετα πεδία του είδους (`MTREXTRA`) ορίζει τη βιτρίνα** — καθαρές συναρτήσεις, χωρίς δίκτυο και βάση.
 *
 * Οι λεζάντες διαβάστηκαν από το ERP (`getTableFields ITEM / ITEEXTRA`, 30/10/2026):
 * `NUM04` «Τιμή Web», `BOOL01` «Λίστα», `BOOL02` «B2B», **`BOOL04` «Εξαίρεση Web»**. Το `BOOL04` είναι η σημαία του site:
 * `1` = το είδος δεν ανεβαίνει. Επαληθεύτηκε απέναντι στο sitemap του euronics.gr — 90 % των `BOOL04=0` υπάρχουν εκεί,
 * μόνο 9 % των `BOOL04=1`. Βλ. docs/softone-catalog-sync.md §7.
 */

export const EXTRA_OFFER_COLS = ["MTRL", "NUM04", "DATE01", "BOOL01", "BOOL02", "BOOL04"] as const;

/**
 * Ποιες γραμμές του `MTREXTRA` μας ενδιαφέρουν. Το `BOOL04=1` είναι μέσα επίτηδες: αν έλειπε, τα εξαιρεμένα είδη χωρίς
 * τιμή δεν θα γύρναγαν καθόλου και θα τα περνούσαμε για «χωρίς σήμανση», δηλαδή ζωντανά.
 */
export const EXTRA_OFFER_FILTER = "NUM04>0 OR BOOL01=1 OR BOOL02=1 OR BOOL04=1";

export interface Offers {
  eshopPrice: number | null;
  eshopDate01: Date | null;
  eshopFlag1: boolean;
  eshopFlag2: boolean;
  webExcluded: boolean;
}

const num = (v: string) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
const posNum = (v: string) => { const n = num(v); return n && n > 0 ? n : null; };
const yes = (v: string) => v === "1" || /^true$/i.test(v ?? "");
const date = (v: string) => { if (!v) return null; const d = new Date(String(v).replace(" ", "T")); return Number.isNaN(d.getTime()) ? null : d; };

/** Η γραμμή όπως τη δίνει το `GetTable` με τις `EXTRA_OFFER_COLS`. `null` = το είδος δεν έχει γραμμή: τίποτα σημαδεμένο. */
export function offersFromExtra(row: string[] | null | undefined): Offers {
  if (!row) return { eshopPrice: null, eshopDate01: null, eshopFlag1: false, eshopFlag2: false, webExcluded: false };
  const at = (n: (typeof EXTRA_OFFER_COLS)[number]) => row[EXTRA_OFFER_COLS.indexOf(n)] ?? "";
  return {
    eshopPrice: posNum(at("NUM04")), eshopDate01: date(at("DATE01")),
    eshopFlag1: yes(at("BOOL01")), eshopFlag2: yes(at("BOOL02")), webExcluded: yes(at("BOOL04")),
  };
}

/** Μπαίνει το είδος στη βιτρίνα; Ενεργό στο ERP, υπαρκτό στον καθρέφτη και χωρίς «Εξαίρεση Web». */
export const onSite = (it: { active: boolean; missing: boolean; webExcluded: boolean }) => it.active && !it.missing && !it.webExcluded;

/**
 * Αποθήκες που ΔΕΝ είναι πωλήσιμο απόθεμα: 2 Transit, 9 Επιστροφές, 55 Ανταλλακτικά, 90 Διαφημιστικά, 91 Showroom,
 * 99 Ελαττωματικά, 1000 Eshop. Όλες οι άλλες μετράνε — και οι αποθήκες προμηθευτών (π.χ. 56 «Γ.Ε. ΔΗΜΗΤΡΙΟΥ», όπου ζουν
 * τα Toyotomi), όπως στο παλιό euronics.gr. Μόνο με 1 + 10 χάναμε ~100 «Άμεσα διαθέσιμα» (αντιπαραβολή 21/11/2026).
 */
export const NON_SALEABLE_WAREHOUSES = ["2", "9", "55", "90", "91", "99", "1000"];
/** Πωλήσιμο απόθεμα από τα υπόλοιπα ανά αποθήκη (αρνητικό υπόλοιπο αποθήκης = 0, δεν τρώει τις άλλες). */
export const saleableStock = (byWh: Record<string, number>) =>
  Object.entries(byWh).reduce((a, [wh, q]) => a + (NON_SALEABLE_WAREHOUSES.includes(wh) ? 0 : Math.max(0, q)), 0);
