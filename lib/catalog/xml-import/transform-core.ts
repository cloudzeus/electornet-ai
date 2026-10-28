import type { FieldKey } from "@/lib/catalog/supplier-sheet";
import { parseMoney, priceFrom, type Rounding } from "@/lib/catalog/pricing/markup";

/**
 * Μονάδες και τιμές του XML feed — καθαρή λογική (χωρίς βάση, δίκτυο ή server-only).
 *
 * Οι μετατροπές εφαρμόζονται ΠΡΙΝ το `toRows`, στον εικονικό πίνακα: έτσι η υπάρχουσα μηχανή εισαγωγής δεν μαθαίνει
 * ποτέ ότι ο προμηθευτής έστελνε γραμμάρια. Η τιμή βγαίνει με δύο τρόπους (κόστος + markup, ή η λιανική του feed) και
 * ο χρήστης διαλέγει — γι' αυτό `priceFromMode` και όχι ένας δρόμος.
 */

/** Μετατροπή μιας στήλης. Αποθηκεύεται στο `SupplierFeed.config`, άρα μένει JSON-serializable. */
export type Transform = "none" | "g_kg" | "kg_g" | "mm_cm" | "cm_mm" | "m_cm" | { factor: number };

const FACTOR: Record<string, number> = { none: 1, g_kg: 1 / 1000, kg_g: 1000, mm_cm: 1 / 10, cm_mm: 10, m_cm: 100 };
/** Στρογγύλεμα στα 4 δεκαδικά: αποφεύγει το 0.30000000000000004 χωρίς να χάνει ακρίβεια διαστάσεων. */
const tidy = (n: number) => String(Math.round(n * 10000) / 10000);

/**
 * Μία τιμή κελιού με τη μετατροπή της. Ό,τι δεν είναι θετικός αριθμός (κείμενο, κενό, 0, αρνητικό) μένει **αναλλοίωτο** —
 * οι μετατροπές αφορούν μεγέθη, και ένα «Μαύρο» δεν πρέπει να γίνει ποτέ αριθμός.
 */
export function applyTransform(value: string, t: Transform): string {
  const n = parseMoney(value);
  if (n == null) return value;
  const f = typeof t === "object" ? t.factor : FACTOR[t];
  if (!Number.isFinite(f) || f <= 0) return value;
  return tidy(n * f);
}

/** Αριθμητικά πεδία όπου μια λάθος μονάδα είναι πιθανή, με το κατώφλι πάνω από το οποίο η τιμή δεν στέκει στη δική μας μονάδα. */
const GUESS: Partial<Record<FieldKey, { over: number; then: Transform }>> = {
  // 1.000 g = 1 kg· συσκευή 1.000 kg δεν υπάρχει στον κατάλογό μας
  weightKg: { over: 1000, then: "g_kg" },
  // 500 cm = 5 m· κανένα είδος δεν είναι 5 μέτρα, άρα είναι χιλιοστά
  widthCm: { over: 500, then: "mm_cm" },
  heightCm: { over: 500, then: "mm_cm" },
  lengthCm: { over: 500, then: "mm_cm" },
};

/** Η διάμεσος των δειγμάτων (τα μη αριθμητικά αγνοούνται)· χωρίς δείγματα → null. */
function median(samples: string[]): number | null {
  const ns = samples.map(parseMoney).filter((n): n is number => n != null).sort((a, b) => a - b);
  if (!ns.length) return null;
  const m = Math.floor(ns.length / 2);
  return ns.length % 2 ? ns[m] : (ns[m - 1] + ns[m]) / 2;
}

/**
 * Εικασία μονάδας από την τάξη μεγέθους των δειγμάτων. Συντηρητική εξ ορισμού: μαντεύει μόνο όταν η τιμή **δεν στέκει**
 * στη δική μας μονάδα (300 cm είναι πιθανό πλάτος, άρα δεν το πειράζουμε· 1.200 δεν είναι, άρα είναι mm).
 * Ο χρήστης τη βλέπει και την αλλάζει στο βήμα της αντιστοίχισης.
 */
export function guessTransform(target: FieldKey, samples: string[]): Transform {
  const g = GUESS[target];
  if (!g) return "none";
  const m = median(samples);
  return m != null && m >= g.over ? g.then : "none";
}

/** Κόστος ≥ λιανική = ύποπτο feed (χονδρική με ΦΠΑ, ή μπερδεμένες στήλες). Μήνυμα για τη γραμμή, όχι φράγμα. */
export function priceWarning(cost: string | null, retail: string | null): string | null {
  const c = parseMoney(cost ?? ""), r = parseMoney(retail ?? "");
  if (c == null || r == null) return null;
  return c >= r ? `Το κόστος (${c.toFixed(2)}) δεν είναι μικρότερο από τη λιανική του feed (${r.toFixed(2)}) — έλεγξε ποιο πεδίο είναι τι.` : null;
}

export type PriceMode = "cost" | "retail";
export interface ModePrice {
  price?: number;
  /** από πού βγήκε η τιμή: τον κανόνα markup ή το feed */
  source: "markup" | "feed";
  warning?: string;
}

/**
 * Η τιμή πώλησης ανά τρόπο. «cost» = κόστος × markup × ΦΠΑ με πλαφόν στη λιανική του feed (ο υπάρχων `priceFrom`)·
 * «retail» = η λιανική του feed αυτούσια, **χωρίς** τον κανόνα markup. Χωρίς τα δεδομένα που χρειάζεται δεν βγάζει
 * τιμή: προειδοποίηση, ποτέ σιωπηλό μηδέν.
 */
export function priceFromMode(mode: PriceMode, i: { cost: string | null; retail: string | null; rule: { percent: number; rounding: Rounding } | null; vat: number }): ModePrice {
  if (mode === "retail") {
    const r = parseMoney(i.retail ?? "");
    return r == null ? { source: "feed", warning: "Το feed δεν δίνει λιανική τιμή για αυτό το προϊόν." } : { price: r, source: "feed" };
  }
  const cost = parseMoney(i.cost ?? "");
  if (cost == null) return { source: "markup", warning: "Το feed δεν δίνει κόστος για αυτό το προϊόν." };
  if (!i.rule) return { source: "markup", warning: "Δεν υπάρχει κανόνας τιμολόγησης για αυτή τη μάρκα / κατηγορία." };
  const { price } = priceFrom({ cost, percent: i.rule.percent, vat: i.vat, rounding: i.rule.rounding, rrp: parseMoney(i.retail ?? "") });
  return { price, source: "markup" };
}
