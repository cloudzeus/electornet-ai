/**
 * **Πρόταση κατηγορίας ανά προϊόν με AI** — καθαρά κομμάτια (χωρίς βάση, δίκτυο ή server-only), για να ελέγχονται με tests.
 *
 * Το AI δεν «βάζει» ποτέ κατηγορία: προτείνει, και ο χρήστης αποδέχεται. Ό,τι απαντήσει περνά από εδώ πριν φανεί — id που
 * δεν είναι δική μας κατηγορία ή προϊόν που δεν ρωτήθηκε πετιέται, ώστε να μη φτάσει ποτέ στην οθόνη κάτι επινοημένο.
 */

/** Ένα προϊόν προς ταξινόμηση: το `key` είναι ό,τι βολεύει τον καλούντα (γραμμή Excel, id είδους σε αναμονή). */
export interface CatAsk { key: string; name: string; brand?: string; extra?: string }
/** Μια κατηγορία-στόχος: μόνο όσες δίνουν ομάδα χαρακτηριστικών, γιατί χωρίς ομάδα ένα νέο είδος δεν δημιουργείται. */
export interface CatOption { id: string; path: string; groupS1Id: number }
export interface CatGuess { key: string; categoryId: string; path: string; groupS1Id: number; sure: boolean }

/** Πόσα προϊόντα ανά ερώτημα: αρκετά λίγα ώστε η απάντηση να μη κόβεται, αρκετά πολλά ώστε να μη γίνονται δεκάδες κλήσεις. */
export const CAT_BATCH = 40;
/** Πάνω από τόσα σε ένα πάτημα δεν ρωτάμε — ο χρήστης το πατά ξανά για τα υπόλοιπα, και βλέπει τι πληρώνει. */
export const CAT_MAX = 400;

export const CAT_SYSTEM =
  "Ταξινομείς προϊόντα ενός e-shop ηλεκτρικών και ηλεκτρονικών ειδών στις κατηγορίες του καταστήματος. " +
  "Απαντάς ΜΟΝΟ με JSON: {\"items\":[{\"key\":string (όπως σου δόθηκε),\"n\":number|null (ο αριθμός της κατηγορίας από τη λίστα, ή null αν καμία δεν ταιριάζει),\"sure\":boolean}]}. " +
  "Διάλεξε την πιο ειδική κατηγορία που περιγράφει τι ΕΙΝΑΙ το προϊόν (όχι αξεσουάρ ή ανταλλακτικό του, εκτός αν είναι αυτό). " +
  "sure=true μόνο όταν το όνομα δείχνει καθαρά το είδος· αν διστάζεις ανάμεσα σε δύο, sure=false. Αν καμία δεν ταιριάζει, n=null — μην μαντεύεις. Μία γραμμή ανά προϊόν.";

/** Το μήνυμα ενός ερωτήματος: οι κατηγορίες αριθμημένες (ο αριθμός είναι φθηνότερος και ασφαλέστερος από ένα cuid) και τα προϊόντα. */
export const catUser = (options: CatOption[], asks: CatAsk[]) => ({
  categories: options.map((o, i) => `${i + 1}. ${o.path}`),
  products: asks.map((a) => ({ key: a.key, name: a.name.slice(0, 160), ...(a.brand ? { brand: a.brand } : {}), ...(a.extra ? { info: a.extra.slice(0, 200) } : {}) })),
});

/** Η απάντηση του AI → έγκυρες προτάσεις: μόνο κλειδιά που ρωτήθηκαν, μόνο αριθμοί της λίστας, μία ανά προϊόν. */
export function readGuesses(json: unknown, options: CatOption[], asks: CatAsk[]): CatGuess[] {
  const items = (json && typeof json === "object" && Array.isArray((json as { items?: unknown }).items) ? (json as { items: unknown[] }).items : []) as { key?: unknown; n?: unknown; sure?: unknown }[];
  const asked = new Set(asks.map((a) => a.key));
  const out = new Map<string, CatGuess>();
  for (const it of items) {
    const key = String(it?.key ?? "");
    const n = Number(it?.n);
    if (!asked.has(key) || out.has(key) || !Number.isInteger(n) || n < 1 || n > options.length) continue;
    const o = options[n - 1];
    out.set(key, { key, categoryId: o.id, path: o.path, groupS1Id: o.groupS1Id, sure: it.sure === true });
  }
  return [...out.values()];
}
