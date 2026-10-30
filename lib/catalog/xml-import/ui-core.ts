import type { FeedCounts } from "@/lib/catalog/xml-import/parse-core";
import type { Transform, PriceMode } from "@/lib/catalog/xml-import/transform-core";
import type { Diff } from "@/lib/catalog/xml-import/diff-core";
import type { Confidence } from "@/lib/catalog/xml-import/suggest-core";

/**
 * Ό,τι μοιράζονται ο server (actions) και ο browser (οδηγός) — **καθαρή λογική**: χωρίς βάση, δίκτυο ή server-only,
 * ώστε να μπορεί να το κάνει import και client component.
 *
 * Εδώ ζουν τα DTO των server actions και οι **ελληνικές ετικέτες** των καταστάσεων. Κανένα χρώμα δεν στέκει μόνο του:
 * κάθε κατάσταση έχει λέξη, κι ο καλών βάζει και εικονίδιο.
 *
 * Τα δύο προθέματα παρακάτω είναι αντίγραφα του `parse-core` **επίτηδες**: το `parse-core` φέρνει μαζί του
 * `fast-xml-parser` και `iconv-lite`, που δεν έχουν καμία δουλειά στο bundle του browser. Ότι μένουν ίδια το φυλάει
 * το `ui-core.test.ts`.
 */
const SPEC_PREFIX = "spec:";
const CATEGORY_PAIR = "Κατηγορία (πλήρης)";

// ---------- Βήμα ①: προμηθευτές ----------

export interface SupplierCard {
  id: string;
  s1Trdr: number;
  code: string;
  name: string;
  afm: string | null;
  /** το feed του προμηθευτή — υπάρχει από τη στιγμή που αποθηκεύεται η διεύθυνση, πριν από κάθε αντιστοίχιση */
  feed: {
    id: string; url: string; lastRunAt: string | null; lastCount: number | null; items: number;
    /** ανενεργό = μένει αποθηκευμένο αλλά δεν τρέχει */
    active: boolean;
    /** true = έχει περάσει η αντιστοίχιση· false = έχει μόνο διεύθυνση */
    mapped: boolean;
  } | null;
}

// ---------- Βήμα ②: έλεγχος feed ----------

export interface InspectDTO {
  counts: FeedCounts;
  headers: string[];
  /** το πρώτο προϊόν ακατέργαστο, ως ζεύγη (η σειρά μετράει — είναι η σειρά των tags) */
  sample: [string, string][];
  bytes: number;
  source: SourceDTO;
}

// ---------- Βήμα ③: αντιστοίχιση ----------

/** Πάνω από τόσες διακριτές τιμές, η στήλη δεν μπορεί να αντιστοιχιστεί τιμή-προς-τιμή (μάρκα / κατηγορία). */
export const MAX_VALUES = 300;
/** Δείγματα τιμών που φαίνονται δίπλα σε κάθε στήλη. */
export const SAMPLES_SHOWN = 3;

export interface ColDTO {
  header: string;
  /** κωδικοποιημένος στόχος (`encodeTarget`) */
  target: string;
  /** η ετικέτα, όταν ο στόχος είναι χαρακτηριστικό */
  label: string;
  transform: Transform;
  confidence: Confidence;
  why?: string;
  samples: string[];
  /** το προϊόν από το οποίο ήρθε κάθε δείγμα (ίδιος δείκτης με το `samples`) — «τιμή — προϊόν» αντί για γυμνή τιμή */
  examples: string[];
  /** διακριτές τιμές (για μάρκα / κατηγορία / μονάδα / σήμανση)· `null` = πάρα πολλές */
  values: string[] | null;
  /** μόνο στις στήλες ταξινόμησης: ανά τιμή, πόσα προϊόντα την έχουν και έως τρία ονόματα προϊόντων */
  valueInfo?: Record<string, { n: number; ex: string[] }>;
}

/** Από πού ήρθαν τα bytes του feed — ο χρήστης πρέπει να ξέρει αν βλέπει φρέσκο ή αποθηκευμένο XML. */
export interface SourceDTO {
  from: "snapshot" | "download";
  /** πότε κατέβηκε αυτό το XML */
  fetchedAt: string;
  /** λεπτά μέχρι να επιτρέπεται νέα λήψη (0 = τώρα) */
  waitMin: number;
  /** το αποθηκευμένο XML δόθηκε επειδή ο προμηθευτής απάντησε «πάρα πολλά αιτήματα» */
  rateLimited: boolean;
  bytes: number;
  products: number | null;
}

/** Οι αποθηκευμένες επιλογές τιμών του προμηθευτή (το «πρότυπο»), για πρόγεμισμα των βημάτων. */
export interface TemplateMaps {
  brand: Record<string, string | null>;
  unit: Record<string, string | null>;
  mark: Record<string, string | null>;
}

export interface TemplateSettings {
  priceMode: PriceMode;
  toSoftone: boolean;
  minFetchMin: number;
  unitId: string | null;
  markId: string | null;
}

export interface SuggestDTO {
  cols: ColDTO[];
  /** τα ζεύγη κατηγοριών του feed με πλήθος προϊόντων και την πρόταση (τα παραδείγματα έρχονται από το `valueInfo` της στήλης) */
  cats: { value: string; n: number; categoryId: string | null; confidence: Confidence }[];
  /** οι ετικέτες χαρακτηριστικών του feed· `to` = δική μας ονομασία (null = μένει ως είναι) */
  specs: { label: string; to: string | null; confidence: Confidence }[];
  duplicates: { label: string; headers: string[] }[];
  aiUsed: boolean;
  /** true = οι επιλογές ήρθαν από το αποθηκευμένο πρότυπο του προμηθευτή, όχι από κανόνες και AI */
  fromTemplate?: boolean;
  /** οι αποθηκευμένες αντιστοιχίσεις τιμών (μάρκες, μονάδες, σημάνσεις) — οι κατηγορίες είναι μέσα στο `cats` */
  maps?: TemplateMaps;
  settings?: TemplateSettings;
  source?: SourceDTO;
}

// ---------- Βήμα ④: λίστα ελέγχου ----------

export interface ItemDTO {
  id: string;
  sku: string;
  diff: Diff;
  status: string;
  problem: string | null;
  error: string | null;
  payload: Record<string, string>;
  edits: Record<string, string> | null;
  images: string[];
  /** πόσες φωτογραφίες έχουν ήδη περάσει στη βιβλιοθήκη */
  assets: number;
  /** εξαίρεση από το καθολικό «και στο SoftOne» (null = ακολουθεί την παρτίδα) */
  softone: boolean | null;
  mtrl: number | null;
  productId: string | null;
}

export interface ItemsDTO {
  rows: ItemDTO[];
  total: number;
  page: number;
  pages: number;
  counts: { diff: Partial<Record<Diff, number>>; status: Record<string, number>; problems: number };
  /** εξαιρέσεις που πέφτουν μέσα στο τρέχον φίλτρο — χωρίς αυτό το «ν επιλεγμένα» θα έλεγε ψέματα */
  exceptionsHere: number;
  /** γραμμές του φίλτρου που δεν μπαίνουν στην ουρά επειδή έχουν πρόβλημα */
  problemsHere: number;
  /** γραμμές του φίλτρου που δεν μπαίνουν επειδή η μάρκα τους παραλείπεται */
  skippedHere: number;
}

export interface FeedStateDTO {
  feedId: string;
  url: string;
  supplier: { id: string; name: string; code: string };
  headers: string[];
  /** επικεφαλίδα → κωδικοποιημένος στόχος, για να ξέρει το modal σε ποια ενότητα πάει κάθε πεδίο */
  targets: Record<string, string>;
  priceMode: PriceMode;
  toSoftone: boolean;
  lastRunAt: string | null;
  lastCount: number | null;
  /** ελάχιστα λεπτά ανάμεσα σε δύο λήψεις — το όριο του προμηθευτή */
  minFetchMin: number;
  /** ανενεργό feed δεν τρέχει και δεν κάνει εισαγωγή — η λίστα του μένει αναγνώσιμη */
  active: boolean;
  /** το αποθηκευμένο XML της τελευταίας λήψης */
  snapshot: { has: boolean; fetchedAt: string | null; bytes: number | null; products: number | null; waitMin: number };
  /** τιμές του προμηθευτή που δεν έχει δει ποτέ ο χρήστης, ανά είδος (κατηγορίες, μάρκες, μονάδες, σημάνσεις) */
  pending: Record<ValueKindDTO, { values: number; items: number }>;
}

/** Τα τέσσερα είδη τιμών που αντιστοιχίζονται τιμή-προς-τιμή. */
export type ValueKindDTO = "category" | "brand" | "unit" | "mark";
export const VALUE_KIND: Record<ValueKindDTO, { one: string; many: string }> = {
  category: { one: "κατηγορία", many: "κατηγορίες" },
  brand: { one: "μάρκα", many: "μάρκες" },
  unit: { one: "μονάδα μέτρησης", many: "μονάδες μέτρησης" },
  mark: { one: "εμπορική σήμανση", many: "εμπορικές σημάνσεις" },
};

/** Το τελευταίο βήμα: τι έγινε προϊόν και τι είναι ακόμη πρόχειρο. */
export interface PublishRowDTO {
  itemId: string;
  sku: string;
  productId: string;
  name: string;
  /** true = φαίνεται στο site */
  active: boolean;
  images: number;
  mtrl: number | null;
}

export interface PublishDTO {
  rows: PublishRowDTO[];
  total: number;
  page: number;
  pages: number;
  counts: {
    /** γραμμές που έφτασαν σε προϊόν */
    products: number;
    /** προϊόντα που φαίνονται στο site */
    live: number;
    /** προϊόντα έτοιμα αλλά ανενεργά — αυτά δημοσιεύονται */
    draft: number;
    /** μπήκαν, αλλά δεν έχουν ακόμη προϊόν (νέα είδη σε αναμονή έγκρισης) */
    waiting: number;
  };
}

export interface QueueDTO {
  total: number;
  queued: number;
  done: number;
  errors: number;
  images: { done: number; total: number };
  running: boolean;
  writeOn: boolean;
}

// ---------- Ετικέτες ----------

/** Η επικεφαλίδα όπως τη διαβάζει άνθρωπος: η παράγωγη στήλη και τα χαρακτηριστικά παίρνουν ελληνικό πρόθεμα. */
export function headerLabel(h: string): string {
  if (h === CATEGORY_PAIR) return h;
  return h.startsWith(SPEC_PREFIX) ? `Χαρακτηριστικό: ${h.slice(SPEC_PREFIX.length)}` : h;
}

export const DIFF: Record<Diff, { label: string; help: string }> = {
  new: { label: "Νέα", help: "Δεν υπήρχαν στο προηγούμενο τρέξιμο του feed." },
  changed: { label: "Άλλαξαν", help: "Ο προμηθευτής άλλαξε κάτι από το προηγούμενο τρέξιμο." },
  same: { label: "Ίδια", help: "Τίποτα δεν άλλαξε — μπαίνουν κανονικά αν τα επιλέξεις." },
  gone: { label: "Χάθηκαν", help: "Δεν ήρθαν σε αυτό το τρέξιμο. Μόνο ένδειξη: τα δικά μας προϊόντα δεν αγγίζονται." },
};
export const DIFF_ORDER: Diff[] = ["new", "changed", "same", "gone"];

export const STATUS: Record<string, string> = {
  review: "Προς έλεγχο",
  queued: "Στην ουρά",
  importing: "Γίνεται τώρα",
  done: "Μπήκε",
  error: "Σφάλμα",
  skipped: "Παραλείπεται",
};

/** Οι μετατροπές μονάδας που προσφέρει το UI (το `{factor}` μένει για κώδικα, δεν ζητείται από τον χρήστη). */
export const TRANSFORMS: { value: Exclude<Transform, { factor: number }>; label: string }[] = [
  { value: "none", label: "όπως ήρθε" },
  { value: "g_kg", label: "γραμμάρια → κιλά" },
  { value: "kg_g", label: "κιλά → γραμμάρια" },
  { value: "mm_cm", label: "χιλιοστά → εκατοστά" },
  { value: "cm_mm", label: "εκατοστά → χιλιοστά" },
  { value: "m_cm", label: "μέτρα → εκατοστά" },
];
const TRANSFORM_SET = new Set(TRANSFORMS.map((t) => t.value));
/** Κείμενο από τον browser → μετατροπή· ό,τι δεν αναγνωρίζεται δεν μετατρέπει τίποτα. */
export const toTransform = (v: string): Transform => (TRANSFORM_SET.has(v as Exclude<Transform, { factor: number }>) ? (v as Transform) : "none");
/** Η μετατροπή ως κείμενο για το <select> (το `{factor}` δεν έχει επιλογή — φαίνεται ως «όπως ήρθε»). */
export const transformValue = (t: Transform): string => (typeof t === "string" ? t : "none");

/** Στόχοι στηλών για XML feed, με μία γραμμή εξήγησης ο καθένας. Ίδια κωδικοποίηση με το Excel (`encodeTarget`). */
export const TARGETS: { group: string; items: { value: string; label: string; help: string }[] }[] = [
  { group: "Ταυτότητα", items: [
    { value: "field:code", label: "SKU / κωδικός είδους", help: "Το κλειδί του προϊόντος: βρίσκει το είδος μας και κρατά τη γραμμή σταθερή σε κάθε τρέξιμο." },
    { value: "field:barcode", label: "EAN / barcode", help: "Βρίσκει το είδος από το barcode· γράφεται μόνο αν λείπει." },
    { value: "field:factoryCode", label: "Κωδικός κατασκευαστή", help: "Μοντέλο / MPN — μαζί με τη μάρκα βρίσκει το είδος." },
  ] },
  { group: "Κείμενα", items: [
    { value: "field:name", label: "Όνομα", help: "Μπαίνει μόνο αν το είδος δεν έχει όνομα· στα νέα είναι το όνομά τους." },
    { value: "field:shortDesc", label: "Σύντομη περιγραφή", help: "Μία–δύο προτάσεις για τη λίστα προϊόντων· μόνο αν λείπει." },
    { value: "field:descText", label: "Αναλυτική περιγραφή", help: "Κείμενο της σελίδας προϊόντος — μόνο αν το είδος δεν έχει ήδη κείμενο." },
  ] },
  { group: "Μεγέθη", items: [
    { value: "field:widthCm", label: "Πλάτος (εκ.)", help: "Διάσταση του τεμαχίου σε εκατοστά — δες τη μονάδα δίπλα." },
    { value: "field:heightCm", label: "Ύψος (εκ.)", help: "Διάσταση του τεμαχίου σε εκατοστά — δες τη μονάδα δίπλα." },
    { value: "field:lengthCm", label: "Βάθος (εκ.)", help: "Διάσταση του τεμαχίου σε εκατοστά — δες τη μονάδα δίπλα." },
    { value: "field:weightKg", label: "Βάρος (kg)", help: "Καθαρό βάρος του τεμαχίου σε κιλά — δες τη μονάδα δίπλα." },
    { value: "field:guaranteeMonths", label: "Εγγύηση (μήνες)", help: "Ακέραιος αριθμός μηνών· μόνο αν λείπει." },
  ] },
  { group: "Χαρακτηριστικά & φωτογραφίες", items: [
    { value: "spec", label: "Χαρακτηριστικό", help: "Γίνεται χαρακτηριστικό με την ετικέτα που γράφεις — μόνο αν υπάρχει στην ομάδα του είδους και δεν έχει ήδη τιμή." },
    { value: "media:image", label: "Φωτογραφία (διεύθυνση)", help: "URL φωτογραφίας: κατεβαίνει στην εισαγωγή και προστίθεται στο προϊόν (δεν αντικαθιστά τις υπάρχουσες)." },
  ] },
  { group: "Ταξινόμηση", items: [
    { value: "brand", label: "Μάρκα", help: "Κάθε τιμή αντιστοιχίζεται σε δική μας μάρκα πιο κάτω. Μάρκες δεν δημιουργούνται από εδώ." },
    { value: "category", label: "Κατηγορία", help: "Κάθε τιμή αντιστοιχίζεται σε κατηγορία μας — δίνει ομάδα χαρακτηριστικών στα νέα είδη και κανόνα τιμής." },
    { value: "unit", label: "Μονάδα μέτρησης", help: "Κάθε τιμή σε δική μας μονάδα (MTRUNIT). Μετράει μόνο στα ΝΕΑ είδη· των υπαρχόντων δεν αλλάζει." },
    { value: "mark", label: "Εμπορική σήμανση", help: "MTRMARK (PREMIUM, QLED…) — όχι η μάρκα. Μετράει μόνο στα ΝΕΑ είδη· των υπαρχόντων δεν αλλάζει." },
  ] },
  { group: "Τιμές", items: [
    { value: "cost", label: "Κόστος (χωρίς ΦΠΑ)", help: "Με τον κανόνα τιμολόγησης βγάζει την τιμή web — μόνο όπου το είδος δεν έχει τιμή." },
    { value: "rrp", label: "Λιανική του προμηθευτή", help: "Πλαφόν στην τιμή από τον κανόνα· με «τιμή από τη λιανική» γίνεται η τιμή μας." },
  ] },
  { group: "Άλλο", items: [{ value: "ignore", label: "Αγνόηση", help: "Η στήλη δεν χρησιμοποιείται." }] },
];
export const TARGET_OF = new Map(TARGETS.flatMap((g) => g.items).map((t) => [t.value, t]));

/** Σε ποια ενότητα του modal ανήκει ένα πεδίο. */
export type Section = "fields" | "specs" | "price" | "images" | "ignored";
export function sectionOf(target: string | undefined): Section {
  if (!target || target === "ignore") return "ignored";
  if (target === "spec") return "specs";
  if (target === "cost" || target === "rrp") return "price";
  if (target.startsWith("media:")) return "images";
  return "fields";
}

/** Αριθμητικά πεδία: θέλουν `inputMode="decimal"` στο modal. */
const DECIMAL = new Set(["field:widthCm", "field:heightCm", "field:lengthCm", "field:weightKg", "field:guaranteeMonths", "cost", "rrp"]);
export const isDecimal = (target: string | undefined) => !!target && DECIMAL.has(target);

export const PRICE_MODES: { value: PriceMode; label: string; help: string }[] = [
  { value: "cost", label: "Από το κόστος + markup", help: "Κόστος × κανόνας τιμολόγησης × ΦΠΑ, με πλαφόν τη λιανική του feed. Ο συνηθισμένος τρόπος." },
  { value: "retail", label: "Η λιανική του feed", help: "Η τιμή του προμηθευτή αυτούσια, χωρίς τον κανόνα markup. Μόνο όταν ο προμηθευτής ορίζει τη λιανική." },
];

/** Μέγεθος σε MB με ένα δεκαδικό. */
export const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/** Ώρα και ημέρα όπως τη διαβάζει άνθρωπος. */
export const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short" }) : "—");

/**
 * Μία πρόταση για το από πού ήρθαν τα δεδομένα. Ο χρήστης πρέπει να ξέρει αν βλέπει φρέσκο ή αποθηκευμένο XML —
 * αλλιώς θα νομίζει ότι ο προμηθευτής δεν άλλαξε τίποτα, ενώ απλώς δεν τον ρωτήσαμε.
 */
export function sourceNote(s: SourceDTO): string {
  if (s.from === "download") return `Το feed κατέβηκε τώρα (${mb(s.bytes)}).`;
  const kept = `το αποθηκευμένο XML της ${when(s.fetchedAt)}`;
  if (s.rateLimited) return `Ο προμηθευτής απάντησε «πάρα πολλά αιτήματα» — δουλέψαμε με ${kept}. Νέα λήψη σε ${s.waitMin} ${s.waitMin === 1 ? "λεπτό" : "λεπτά"}.`;
  if (s.waitMin > 0) return `Χρησιμοποιήθηκε ${kept} — νέα λήψη επιτρέπεται σε ${s.waitMin} ${s.waitMin === 1 ? "λεπτό" : "λεπτά"}.`;
  return `Χρησιμοποιήθηκε ${kept} — νέα λήψη επιτρέπεται τώρα.`;
}


