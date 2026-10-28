import { suggestTarget, type Target } from "@/lib/catalog/foreign-import/core";
import type { FieldKey } from "@/lib/catalog/supplier-sheet";
import { guessTransform, type Transform } from "@/lib/catalog/xml-import/transform-core";
import { SPEC_PREFIX, CATEGORY_PAIR } from "@/lib/catalog/xml-import/parse-core";

/**
 * Προτάσεις αντιστοίχισης στηλών — καθαρή λογική (χωρίς βάση, δίκτυο ή server-only).
 *
 * Ο υπάρχων `suggestTarget` γράφτηκε για ελληνικές επικεφαλίδες Excel («Κωδικός είδους», «Πλάτος (εκ.)») και στα
 * αγγλικά tags ενός XML feed λύνει 6 από 73 — και ένα το κάνει λάθος: το `spec:Μέγιστο βάρος` το περνά για βάρος
 * προϊόντος. Γι' αυτό εδώ μπαίνει ένα επίπεδο κανόνων για XML ΠΡΙΝ από αυτόν, και ό,τι μείνει πάει στο AI.
 *
 * Κανόνας που δεν παραβιάζεται: **στήλη χαρακτηριστικού μένει χαρακτηριστικό.** Μια ετικέτα του προμηθευτή δεν γίνεται
 * ποτέ πεδίο του είδους από μόνη της — μόνο η μάρκα, που είναι αναγνωρίσιμη και χρειάζεται για τη δημιουργία είδους.
 */

export type Confidence = "sure" | "unsure";
export interface ColumnSuggestion {
  target: Target;
  transform: Transform;
  /** «unsure» = οι κανόνες δεν το έλυσαν· πάει στο AI και, ό,τι κι αν πει, δείχνεται με badge στο βήμα ③ */
  confidence: Confidence;
  why?: string;
}

/** Κανονικοποίηση επικεφαλίδας για ταίριασμα: πεζά, χωρίς τόνους, μόνο γράμματα και ψηφία. */
const key = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-zα-ω0-9]/g, "");

const F = (k: FieldKey): Target => ({ kind: "field", key: k });

/** Αγγλικά (και ελληνικά) tags που ξέρουμε σίγουρα. Το κλειδί είναι κανονικοποιημένο. */
const RULES: Record<string, Target> = {
  // ταυτότητα
  sku: F("code"), itemcode: F("code"), code: F("code"),
  mpn: F("factoryCode"), manufacturercode: F("factoryCode"), model: F("factoryCode"),
  barcodepiece: F("barcode"), barcode: F("barcode"), ean: F("barcode"), ean13: F("barcode"), gtin: F("barcode"), upc: F("barcode"),
  // κείμενα
  name: F("name"), title: F("name"), productname: F("name"),
  description: F("descText"), longdescription: F("descText"),
  shortdescription: F("shortDesc"),
  // διαστάσεις και βάρος του ΤΕΜΑΧΙΟΥ (όχι της συσκευασίας)
  netweight: F("weightKg"), weight: F("weightKg"), pieceweight: F("weightKg"),
  piecewidth: F("widthCm"), width: F("widthCm"),
  pieceheight: F("heightCm"), height: F("heightCm"),
  piecelength: F("lengthCm"), length: F("lengthCm"), piecedepth: F("lengthCm"), depth: F("lengthCm"),
  // τιμές
  price: { kind: "cost" }, wholesaleprice: { kind: "cost" }, costprice: { kind: "cost" }, netprice: { kind: "cost" },
  // ΜΙΑ μόνο στήλη γίνεται προτεινόμενη λιανική: αλλιώς τρεις στήλες του feed (PriceRetail, StartingRetailPrice,
  // PromoRetailPrice) έγραφαν η μία πάνω στην άλλη. Η τιμή εκκίνησης είναι η ίδια λιανική πριν από έκπτωση, και η
  // τιμή προσφοράς είναι χρονικά περιορισμένη (έχει δικές της ημερομηνίες, που αγνοούμε) — καμία δεν είναι η λιανική μας.
  priceretail: { kind: "rrp" }, retailprice: { kind: "rrp" }, srp: { kind: "rrp" },
};

/**
 * Ό,τι αγνοείται με βεβαιότητα, ώστε να μη σπαταλιέται ερώτημα στο AI:
 * - συσκευασία / κιβώτιο / δεματοποίηση — κρατάμε μόνο τα μεγέθη του τεμαχίου (απόφαση στο spec)
 * - αγγλικές μεταφράσεις — η μετάφραση είναι εκτός πεδίου
 * - εσωτερικά κλειδιά και σύνδεσμοι του προμηθευτή
 * - τα δύο μέρη της κατηγορίας, που τα καλύπτει η παράγωγη στήλη του ζεύγους
 */
const IGNORE = /^(box|package|subbox|pallet|carton)/;
const IGNORE_EXACT = new Set([
  "barcodebox", "barcodesubbox", "nameen", "descriptionen", "productid", "id", "link", "url", "producturl",
  "categoryparent", "category", "categoryid", "parentcategory",
  "startingretailprice", "promoretailprice", "promostartdate", "promoenddate",
]);

/** Ετικέτες χαρακτηριστικού που είναι στην πραγματικότητα η μάρκα. */
const BRAND_LABEL = /^(brand|manufacturer|vendor|marka|marca|μαρκα|κατασκευαστης|κατασκευαστρια|εταιρεια)$/;
/** Στήλη φωτογραφίας: «imageurl 3», «image 1», «PhotoUrl 2», «picture 4». */
const IMAGE_COL = /^(imageurl|image|img|photo|photourl|picture|pictureurl)\d+$/;

/** Αριθμητικά πεδία όπου έχει νόημα να μαντέψουμε μονάδα. */
const NUMERIC: FieldKey[] = ["weightKg", "widthCm", "heightCm", "lengthCm"];

export function suggestColumn(header: string, samples: string[]): ColumnSuggestion {
  const sure = (target: Target, why?: string): ColumnSuggestion => ({
    target,
    transform: target.kind === "field" && NUMERIC.includes(target.key) ? guessTransform(target.key, samples) : "none",
    confidence: "sure",
    ...(why ? { why } : {}),
  });

  if (header === CATEGORY_PAIR) return sure({ kind: "category" }, "Το πλήρες ζεύγος κατηγοριών του feed.");

  if (header.startsWith(SPEC_PREFIX)) {
    const label = header.slice(SPEC_PREFIX.length).trim();
    if (BRAND_LABEL.test(key(label))) return sure({ kind: "brand" }, "Η μάρκα ήρθε ως χαρακτηριστικό του feed.");
    // Ρητά ΠΡΙΝ από τον suggestTarget: αλλιώς ετικέτες σαν «Μέγιστο βάρος» γίνονταν πεδίο του είδους.
    return sure({ kind: "spec", label }, "Ετικέτα χαρακτηριστικού του feed.");
  }

  const k = key(header);
  if (IMAGE_COL.test(k)) return sure({ kind: "media", type: "image" }, "Διεύθυνση φωτογραφίας — η σειρά της στήλης είναι η αρχική σειρά.");
  if (IGNORE_EXACT.has(k) || IGNORE.test(k)) return sure({ kind: "ignore" });
  if (RULES[k]) return sure(RULES[k]);

  // Τελευταία ευκαιρία στους κανόνες του Excel — πιάνουν ελληνικές επικεφαλίδες που δεν είναι στον πίνακα από πάνω.
  const fallback = suggestTarget(header);
  if (fallback.kind !== "ignore") return sure(fallback);
  return { target: { kind: "ignore" }, transform: "none", confidence: "unsure" };
}

/**
 * Στόχος που «χωράει» μία στήλη: δύο στήλες στο ίδιο πεδίο ή στην ίδια ετικέτα είναι σύγκρουση — η μία θα έγραφε πάνω
 * στην άλλη. Οι αγνοημένες στήλες και οι φωτογραφίες είναι εξ ορισμού πολλαπλές.
 */
const exclusive = (t: Target): string | null => {
  if (t.kind === "field") return `field:${t.key}`;
  if (t.kind === "spec") return `spec:${t.label}`;
  if (t.kind === "brand" || t.kind === "category" || t.kind === "cost" || t.kind === "rrp") return t.kind;
  return null; // ignore, media
};

/**
 * Στήλες που δείχνουν στον ίδιο μοναδικό στόχο. Στο δείγμα της Estia συμβαίνει αληθινά: `PieceLength` και `PieceDepth`
 * δείχνουν και οι δύο στο «Βάθος». Το βήμα ③ πρέπει να το δείξει — αλλιώς μία από τις δύο τιμές χάνεται αμίλητα.
 */
export function duplicateTargets(suggestions: Record<number, ColumnSuggestion>, headers: string[]): { label: string; headers: string[] }[] {
  const by = new Map<string, string[]>();
  for (const [i, s] of Object.entries(suggestions)) {
    const label = exclusive(s.target);
    if (!label) continue;
    by.set(label, [...(by.get(label) ?? []), headers[Number(i)] ?? `#${i}`]);
  }
  return [...by].filter(([, hs]) => hs.length > 1).map(([label, hs]) => ({ label, headers: hs }));
}

/** Οι δείκτες στηλών που οι κανόνες δεν έλυσαν — αυτοί και μόνο πάνε στο AI. */
export function unresolvedColumns(suggestions: Record<number, ColumnSuggestion>): number[] {
  return Object.entries(suggestions)
    .filter(([, s]) => s.confidence === "unsure")
    .map(([i]) => Number(i))
    .sort((a, b) => a - b);
}
