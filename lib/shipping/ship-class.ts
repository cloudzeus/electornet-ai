/**
 * Κατηγορίες Α–Ε παράδοσης στο σπίτι (πολιτική Euronics 26/11/2026, §1-3): κάθε προϊόν μπαίνει σε μία από τις 5
 * κλάσεις χρέωσης· η χρέωση του καλαθιού βγαίνει από basketCharge. Καθαρές συναρτήσεις, ίδιες σε server και tests.
 */
import { inchesOf } from "@/lib/ar/plan";

export type ShipClass = "A" | "B" | "G" | "D" | "E";
export const SHIP_CLASSES: ShipClass[] = ["A", "B", "G", "D", "E"];
export const CLASS_LABEL: Record<ShipClass, string> = {
  A: "Α · Πολύ μικρά προϊόντα", B: "Β · Μικροσυσκευές",
  G: "Γ · Τηλεοράσεις έως 55\"", D: "Δ · Λευκές συσκευές / τηλεοράσεις 55\"–85\"",
  E: "Ε · Ντουλάπα/side-by-side, πλυντήρια >10 κιλά, τηλεοράσεις 85\"+",
};
/** Βασικός πίνακας χρέωσης (σε λεπτά): Ηπειρωτική Ελλάδα/Κρήτη πάνω από το δωρεάν όριο χιλιομέτρων. */
export const BASE_CLASS_PRICES: Record<ShipClass, number> = { A: 300, B: 900, G: 5000, D: 5000, E: 10000 };

/** Κατηγορίες που ανήκουν εξ ορισμού στις «λευκές/ογκώδεις» (Δ), εκτός αν κριθούν Ε παρακάτω. */
const WHITE_GOODS: ReadonlySet<string> = new Set([
  "psygeia", "psygeiokatapsyktes", "psygeia-typos", "katapsyktes", "syntirites-krasion",
  "plyntiria-stegnotiria", "plyntiria-roychon", "plyntiria-piaton", "plyntiria-stegnotiria-typos", "stegnotiria",
  "foyrnakia-koyzinakia", "foyrnakia-koyzinakia-typos", "koyzines", "oles-oi-koyzines",
  "aporrofitires", "oloi-oi-aporrofitires", "klimatistika-inverter", "imiepaggelmatika",
  "iliakoi-thermosifones", "oloi-oi-iliakoi-thermosifones",
  "entoichizomena", "psygeia-entoichizomena", "set-entoichismoy-entoichizomena", "esties", "foyrnoi",
  "foyrnoi-mikrokymaton-entoichizomena",
]);
/** Πάντα Ε (υπερμεγέθη), ανεξάρτητα από βάρος/διαστάσεις. */
const ALWAYS_E: ReadonlySet<string> = new Set(["ntoylapes-side-by-side"]);
/** Μικρές συσκευές που δεν πάνε με courier αλλά δεν είναι «λευκές» (π.χ. μίνι ψυγεία): Β. */
const SMALL_APPLIANCE_OVERRIDE: ReadonlySet<string> = new Set(["mikra-psygeia-mini-bars"]);
/** Κατηγορίες «μικροσυσκευών» (Β) όταν δεν ταιριάζουν σε τηλεόραση/λευκή συσκευή. */
const SMALL_APPLIANCES: ReadonlySet<string> = new Set([
  "skoypes", "ilektrikes-skoypes", "skoypes-stick", "skoypes-rompot", "atmokatharistes",
  "michanes-kafe-rofimaton", "michanes-espresso", "kafetieres-filtroy", "michanes-rofimaton", "syskeyes-frape", "michanes-ellinikoy-kafe",
  "raptomichanes", "oles-oi-raptomichanes", "koyzinomichanes-polymixer", "artoparaskeyastes",
  "forita-klimatistika", "anemistires", "anemistires-dapedoy", "epitrapezioi-anemistires",
  "afygrantires", "oloi-oi-afygrantires", "thermantika-somata", "aerotherma", "thermastres-petrelaioy",
  "thermopompoi-convector", "ilektrika-kalorifer", "ionistes-ygrantires-katharistes-aera",
  "foyrnoi-mikrokymaton", "oloi-oi-foyrnoi-mikrokymaton", "apotrichotikes-michanes", "monimi-apotrichosi",
  "ilektrikes-koyvertes", "koptikes-michanes",
  "syskeyes-sideromatos", "sidera", "systimata-sideromatos", "preses", "siderostres",
  "mplenter-polykoftes-multi", "epitrapezia-mixer", "mixer-cheiros", "ravdomplenter", "tostieres",
  "fryganieres", "fritezes", "psistieres-gkrilieres", "atmomageires", "vrastires", "stiftes", "apochymotes",
  "syskeyes-mageirikis", "eidikes-syskeyes", "zygaries",
]);
const WASHER_CATS: ReadonlySet<string> = new Set(["plyntiria-roychon"]);
const TV_CATS: ReadonlySet<string> = new Set(["tileoraseis"]);

export interface ClassifyFacts {
  categoryPath: string[];
  title: string;
  weightKg: number | null;
  dimsCm: [number, number, number] | null;
  /** χωρητικότητα πλυντηρίου σε κιλά, όταν είναι γνωστή (π.χ. χαρακτηριστικό «Χωρητικότητα») */
  washerKg?: number | null;
}

/** Ρητή απόφαση διαχειριστή ανά κατηγορία (ή στην πιο κοντινή γονική) — προαιρετική, προτεραιότητα έναντι των defaults. */
export type ClassOverrides = Record<string, ShipClass>;
export const isShipClass = (v: unknown): v is ShipClass => typeof v === "string" && (SHIP_CLASSES as string[]).includes(v);

/**
 * Κλάση Α–Ε ενός προϊόντος. Σειρά: ρητή απόφαση διαχειριστή (γονική-γονική) → τηλεόραση (ίντσες από τον τίτλο) →
 * πλυντήριο (χωρητικότητα) → πάντα-Ε → λευκές/ογκώδεις (Δ) → μικρές ειδικές συσκευές (Β) → μικροσυσκευές (Β) →
 * Α (ό,τι άλλο, π.χ. αξεσουάρ, μικροηλεκτρονικά).
 */
export function classifyShipClass(f: ClassifyFacts, overrides: ClassOverrides = {}): ShipClass {
  const own = f.categoryPath.map((s) => overrides[s]).find(Boolean);
  if (own) return own;
  if (f.categoryPath.some((s) => TV_CATS.has(s))) {
    const inch = inchesOf(f.title);
    if (inch == null) return "D"; // άγνωστες ίντσες: ασφαλέστερο να υποθέσουμε μεσαίο μέγεθος
    return inch <= 55 ? "G" : inch < 85 ? "D" : "E";
  }
  if (f.categoryPath.some((s) => WASHER_CATS.has(s))) return (f.washerKg ?? 0) > 10 ? "E" : "D";
  if (f.categoryPath.some((s) => ALWAYS_E.has(s))) return "E";
  if (f.categoryPath.some((s) => SMALL_APPLIANCE_OVERRIDE.has(s))) return "B";
  if (f.categoryPath.some((s) => WHITE_GOODS.has(s))) return "D";
  if (f.categoryPath.some((s) => SMALL_APPLIANCES.has(s))) return "B";
  if ((f.weightKg ?? 0) > 2) return "B";
  return "A";
}

export const normalizeClassOverrides = (raw: unknown): ClassOverrides => {
  const out: ClassOverrides = {};
  for (const [k, v] of Object.entries((raw ?? {}) as Record<string, unknown>)) if (k && isShipClass(v)) out[k.slice(0, 160)] = v;
  return out;
};

/**
 * Χρέωση καλαθιού (§3): 100% για το πρώτο τεμάχιο κάθε κατηγορίας, 50% για κάθε επιπλέον τεμάχιο της ίδιας
 * κατηγορίας — ακόμη κι αν τα τεμάχια είναι του ίδιου κωδικού. Ποσά σε λεπτά.
 */
export function basketCharge(items: { cls: ShipClass; qty: number }[], prices: Record<ShipClass, number>): number {
  const byClass = new Map<ShipClass, number>();
  for (const i of items) byClass.set(i.cls, (byClass.get(i.cls) ?? 0) + Math.max(0, Math.round(i.qty)));
  let total = 0;
  for (const [cls, qty] of byClass) if (qty > 0) total += prices[cls] + Math.max(0, qty - 1) * Math.round(prices[cls] / 2);
  return total;
}
