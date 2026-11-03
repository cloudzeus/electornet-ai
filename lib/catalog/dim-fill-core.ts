/**
 * Μαζική συμπλήρωση διαστάσεων και βάρους σε είδη που τα έχουν κενά — η καθαρή λογική (χωρίς βάση και χωρίς δίκτυο):
 * τι λείπει, από ποια πηγή μπορεί να συμπληρωθεί και ποιες τιμές είναι λογικές για να γραφτούν στο ERP.
 *
 * Σειρά πηγών (φθηνότερη πρώτα):
 *  1. «desc» — ό,τι έχουμε ήδη: η γραμμή διαστάσεων της περιγραφής / του διαχειριστή / του EPREL (`ProductDimension`,
 *     όπως τη διάβασε και την ομογενοποίησε η προβολή) και το βάρος από τα χαρακτηριστικά. Μηδενικό κόστος.
 *  2. «web» — οι εξωτερικές πηγές (σελίδα κατασκευαστή, Icecat, Channel3) που φέρνει η μηχανή εμπλουτισμού. Κοστίζει,
 *     οπότε ζητείται ρητά και με όριο.
 *
 * Κανόνες (το ERP είναι σε παραγωγή):
 *  - τιμή που υπάρχει ήδη στο SoftOne δεν ξαναγράφεται ποτέ·
 *  - οι τρεις διαστάσεις γράφονται μόνο ΜΑΖΙ και μόνο όταν και οι τρεις είναι κενές: μισογεμάτο είδος θέλει άνθρωπο·
 *  - ό,τι είναι εκτός ορίων (διαστάσεις 0,3–400 εκ., βάρος 0,002–300 κιλά), εκτός των τυπικών ορίων του τύπου, με
 *    αναλογίες που δεν βγάζουν νόημα ή με βάρος απίθανο για το μέγεθός του μπαίνει στη λίστα «θέλει μάτι», δεν φτάνει
 *    στο ERP. Τα κάτω όρια είναι χαμηλά επίτηδες: το πάχος ενός κινητού (0,72 εκ.) και τα 2 γρ. μιας κάρτας μνήμης
 *    είναι σωστές τιμές, και αυτές οι κατηγορίες έχουν τα περισσότερα κενά·
 *  - γραμμή διαστάσεων με προειδοποίηση (διορθώθηκε αυτόματα ή εκτός ορίων) δεν γίνεται υποψήφια·
 *  - τα σετ παίρνουν διαστάσεις και βάρος από τα μέλη τους (`setShipFacts`) — δεν αγγίζονται.
 */
import { plausible, pickDims, type Dims3 } from "./dimensions";

export const DIM_MIN = 0.3, DIM_MAX = 400, KG_MIN = 0.002, KG_MAX = 300;
/** Πάνω από αυτή τη σχέση μεγαλύτερης προς μικρότερη πλευρά η τριάδα δεν είναι αντικείμενο — είναι λάθος καταχώριση. */
const MAX_RATIO = 100;
/** Κάτω από αυτό το βάρος θέλουμε και μικρό αντικείμενο: 2 γρ. σε κάτι 11 εκ. είναι λάθος μονάδα. */
const TINY_KG = 0.01, TINY_SIDE_CM = 10;
/** Οι πηγές που έχουμε χωρίς κόστος, με τη σειρά προτίμησης του `pickDims`. */
export const DESC_SOURCES = ["manual", "s1-desc", "eprel"];
/** Οι πηγές από το internet (μηχανή εμπλουτισμού). */
export const WEB_SOURCES = ["icecat", "web", "channel3"];

export interface ItemFields { weightKg: number | null; widthCm: number | null; heightCm: number | null; lengthCm: number | null }
export interface DimRow { source: string; w: number; h: number; d: number; kind: string; warning: string | null }
export interface FillRow {
  productId: string;
  erpCode: string;
  title: string;
  /** η κατηγορία του προϊόντος — για τα τυπικά όρια του τύπου */
  typeName: string;
  isSet: boolean;
  /** τα πεδία του είδους στο SoftOne (null = το προϊόν δεν είναι είδος του SoftOne) */
  item: ItemFields | null;
  /** τα χαρακτηριστικά της πηγής που εξετάζεται (περιγραφή ERP ή εξωτερικές) — για το βάρος */
  specs: { key: string; value: string }[];
  dims: DimRow[];
}

export type FillSource = "desc" | "web";
export interface FillCandidate { dims: Dims3 | null; weightKg: number | null; kind: FillSource; note: string }
export interface FillPlan {
  productId: string;
  erpCode: string;
  title: string;
  /** από πού βγήκαν οι τιμές που γράφονται (των διαστάσεων· αλλιώς του βάρους) */
  source: FillSource | null;
  write: { widthCm?: number; heightCm?: number; lengthCm?: number; weightKg?: number };
  /** λείπει ακόμη κάτι που θα μπορούσε να το βρει το internet */
  needWeb: boolean;
  /** «θέλει μάτι»: παράλογες τιμές, μισογεμάτο είδος — τίποτα από αυτά δεν γράφεται */
  review: string[];
  /** γιατί το προϊόν δεν εξετάζεται καθόλου */
  skip: string | null;
}

const blank = (v: number | null | undefined) => !v || v <= 0;

/** Τι λείπει από το είδος του SoftOne. `partialDims`: κάποιες διαστάσεις υπάρχουν και κάποιες όχι. */
export function fillMissing(item: ItemFields | null) {
  const axes = [item?.widthCm, item?.heightCm, item?.lengthCm];
  const empty = axes.filter(blank).length;
  return { dims: empty > 0, weight: blank(item?.weightKg), partialDims: empty > 0 && empty < 3 };
}

export function checkDims(d: Dims3, typeName: string): string | null {
  const sides = [d.w, d.h, d.d];
  const out = sides.filter((n) => !(n >= DIM_MIN && n <= DIM_MAX));
  if (out.length) return `εκτός ορίων ${DIM_MIN}–${DIM_MAX} εκ.: ${out.map((n) => n.toLocaleString("el-GR")).join(", ")}`;
  const ratio = Math.max(...sides) / Math.min(...sides);
  if (ratio > MAX_RATIO) return `οι αναλογίες δεν βγάζουν νόημα (η μεγάλη πλευρά ${Math.round(ratio)}× τη μικρή)`;
  return plausible(d, typeName);
}

/**
 * Το βάρος, μαζί με το μέγεθος του αντικειμένου: κάτω από 10 γρ. δεκτό μόνο όταν ΞΕΡΟΥΜΕ ότι το αντικείμενο είναι
 * όντως μικρό (κάρτα μνήμης). Χωρίς διαστάσεις, ή σε κάτι μεγαλύτερο από 10 εκ., είναι σχεδόν πάντα λάθος μονάδα
 * στην περιγραφή — πάει στη λίστα «θέλει μάτι» αντί στο ERP.
 */
export function checkWeight(kg: number, dims?: Dims3 | null): string | null {
  if (!(kg >= KG_MIN && kg <= KG_MAX)) return `βάρος εκτός ορίων ${KG_MIN}–${KG_MAX} κιλά: ${kg.toLocaleString("el-GR")}`;
  if (kg >= TINY_KG) return null;
  const side = dims ? Math.max(dims.w, dims.h, dims.d) : null;
  if (side == null) return `απίθανα μικρό βάρος (${(kg * 1000).toLocaleString("el-GR")} γρ.) και χωρίς διαστάσεις για να επιβεβαιωθεί`;
  if (side > TINY_SIDE_CM) return `απίθανο βάρος για αντικείμενο ${side.toLocaleString("el-GR")} εκ.: ${(kg * 1000).toLocaleString("el-GR")} γρ. — μάλλον λάθος μονάδα στην περιγραφή`;
  return null;
}

/**
 * Βάρος από τα χαρακτηριστικά, αυστηρά — η τιμή πάει στο ERP, δεν ξαναδιαβάζεται από άνθρωπο:
 *  - μόνο γραμμές που μιλούν για το βάρος ΤΟΥ προϊόντος ή της συσκευασίας του («Βάρος», «Καθαρό βάρος (kg)»,
 *    «Βάρος συσκευασίας», «Βάρος (με τις μπαταρίες)», «Βάρος χωρίς βάση»). Το «Βάρος μέσων δίσκου χαρτιού:
 *    64 - 105 g/m²» ενός εκτυπωτή και το «Μέγιστο βάρος φορτίου» μιας βάσης ΔΕΝ είναι βάρος προϊόντος·
 *  - με πολλές γραμμές κρατάμε τη μεγαλύτερη: στο ποντίκι το «Βάρος: 1,8 g» είναι του δέκτη USB και το πραγματικό
 *    βάρος γράφεται «Βάρος (με τις μπαταρίες): 69,3 γρ»·
 *  - μόνο σκέτη μάζα: ένας αριθμός με kg / g / γρ. ή χωρίς μονάδα (τότε κιλά). Εύρη και μονάδες ανά επιφάνεια πετιούνται·
 *  - πρώτα η συσκευασία (αυτή πληρώνει ο courier), μετά το καθαρό — το μεγαλύτερο όταν υπάρχουν πολλά.
 */
const WEIGHT_PACK = /^(μεικτ|μικτ)ό βάρος|^βάρος (συσκευασ|πακέτου|χαρτοκιβωτ)|με συσκευασία/i;
// το \b του JavaScript δεν πιάνει ελληνικά γράμματα — το όριο λέξης γράφεται ρητά
const WEIGHT_NET = /^(καθαρό\s+)?βάρος(?!\p{L})|^net weight(?!\p{L})|^weight(?!\p{L})/iu;
/** «Βάρος» που αφορά άλλο πράγμα: το χαρτί του εκτυπωτή, το φορτίο μιας βάσης, τα κιλά που αντέχει ένα ράφι. */
const WEIGHT_OTHER = /μέσων|χαρτ|δίσκου|φορτ|ανύψωσ|αντοχ|στήριξ|μέγιστο|ελάχιστο|χρήστη|ασθεν/i;
const MASS = /^(\d+(?:[.,]\d+)?)\s*(kg|κιλ[άα]?|g|gr|γρ\.?|grams?|kilograms?)?$/i;
export function weightFromSpecs(specs: { key: string; value: string }[]): number | null {
  const mass = (v: string) => {
    const m = MASS.exec(v.trim().replace(/\s+/g, " "));
    if (!m) return null;
    const n = Number(m[1].replace(",", "."));
    const grams = /^(g|gr|γρ\.?|grams?)$/i.test(m[2] ?? "");
    const kg = grams ? n / 1000 : n;
    return Number.isFinite(kg) && kg > 0 ? Math.round(kg * 1000) / 1000 : null;
  };
  const pick = (re: RegExp) => { const v = specs.filter((s) => re.test(s.key.trim()) && !WEIGHT_OTHER.test(s.key)).map((s) => mass(s.value)).filter((x): x is number => x != null); return v.length ? Math.max(...v) : null; };
  return pick(WEIGHT_PACK) ?? pick(WEIGHT_NET);
}

/** Υποψήφιες τιμές από μία ομάδα πηγών: η καλύτερη γραμμή διαστάσεων χωρίς προειδοποίηση και το βάρος των χαρακτηριστικών. */
function candidate(row: FillRow, sources: string[], kind: FillSource): FillCandidate {
  const rows = row.dims.filter((d) => sources.includes(d.source));
  const best = pickDims(rows.filter((d) => !d.warning));
  const note = !best && rows.length ? "η γραμμή διαστάσεων έχει προειδοποίηση — θέλει έλεγχο" : "";
  return { dims: best ? { w: best.w, h: best.h, d: best.d } : null, weightKg: weightFromSpecs(row.specs), kind, note };
}
export const descCandidate = (row: FillRow) => candidate(row, DESC_SOURCES, "desc");
export const webCandidate = (row: FillRow) => candidate(row, WEB_SOURCES, "web");

/** Τι θα γραφτεί σε ένα προϊόν. Χωρίς `opts.web` χρησιμοποιούνται μόνο όσα έχουμε ήδη (μηδενικό κόστος). */
export function planFill(row: FillRow, opts: { web?: boolean } = {}): FillPlan {
  const base: FillPlan = { productId: row.productId, erpCode: row.erpCode, title: row.title, source: null, write: {}, needWeb: false, review: [], skip: null };
  if (!row.item) return { ...base, skip: "Το προϊόν δεν προέρχεται από το SoftOne." };
  if (row.isSet) return { ...base, skip: "Σετ: οι διαστάσεις και το βάρος βγαίνουν από τα μέλη του." };
  const miss = fillMissing(row.item);
  if (!miss.dims && !miss.weight) return { ...base, skip: "Έχει ήδη διαστάσεις και βάρος." };

  const cands = [descCandidate(row), ...(opts.web ? [webCandidate(row)] : [])];
  const review: string[] = [];
  const write: FillPlan["write"] = {};
  let source: FillSource | null = null;

  if (miss.dims) {
    if (miss.partialDims) review.push("μερικές διαστάσεις υπάρχουν ήδη στο SoftOne — δεν συμπληρώνονται αυτόματα");
    else for (const c of cands) {
      if (!c.dims) { if (c.note) review.push(`${c.kind}: ${c.note}`); continue; }
      const bad = checkDims(c.dims, row.typeName);
      if (bad) { review.push(`διαστάσεις ${c.dims.w} × ${c.dims.h} × ${c.dims.d} εκ. (${c.kind}): ${bad}`); continue; }
      write.widthCm = c.dims.w; write.heightCm = c.dims.h; write.lengthCm = c.dims.d; source = c.kind;
      break;
    }
  }
  // για τον έλεγχο του βάρους μετράει το μέγεθος του αντικειμένου: ό,τι γράφεται τώρα, αλλιώς ό,τι έχει ήδη το ERP
  const it = row.item;
  const size: Dims3 | null = write.widthCm != null ? { w: write.widthCm, h: write.heightCm!, d: write.lengthCm! }
    : !blank(it.widthCm) && !blank(it.heightCm) && !blank(it.lengthCm) ? { w: it.widthCm!, h: it.heightCm!, d: it.lengthCm! }
    : cands.find((c) => c.dims)?.dims ?? null;
  if (miss.weight) for (const c of cands) {
    if (c.weightKg == null) continue;
    const bad = checkWeight(c.weightKg, size);
    if (bad) { review.push(`${bad} (${c.kind})`); continue; }
    write.weightKg = c.weightKg; source ??= c.kind;
    break;
  }

  const dimsLeft = miss.dims && !miss.partialDims && write.widthCm == null;
  const weightLeft = miss.weight && write.weightKg == null;
  return { ...base, source, write, review, needWeb: dimsLeft || weightLeft };
}

/** Πόσα και ποια προϊόντα αξίζει να πάνε στο internet, με το όριο που δόθηκε. */
export const webTargets = (plans: FillPlan[], limit: number) => plans.filter((p) => !p.skip && p.needWeb).slice(0, Math.max(0, limit));
