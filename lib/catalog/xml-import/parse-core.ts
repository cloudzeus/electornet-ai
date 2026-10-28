import { XMLParser } from "fast-xml-parser";
import iconv from "iconv-lite";

/**
 * XML feed προμηθευτή → εικονικός πίνακας. Καθαρή λογική (χωρίς βάση, δίκτυο ή server-only): ό,τι βγαίνει από εδώ περνά
 * αυτούσιο στο υπάρχον `toRows(matrix, 0, config)` του foreign-import, άρα από εκεί και κάτω τίποτα δεν ξέρει για XML.
 *
 * Δύο μετασχηματισμοί κάνουν όλη τη δουλειά:
 * - tag που επαναλαμβάνεται → αριθμημένες στήλες («imageurl 1», «imageurl 2»), με τη σειρά του εγγράφου· έτσι οι
 *   φωτογραφίες έχουν εξ αρχής σειρά για το drag-and-drop.
 * - tag που επαναλαμβάνεται και οι τιμές του είναι «Ετικέτα: τιμή» → μία στήλη ανά ετικέτα («spec:Χρώμα»). Έτσι η
 *   «Brand» του feed γίνεται κανονική στήλη και αντιστοιχίζεται μία φορά, αντί να κρύβεται μέσα στα χαρακτηριστικά.
 */

/** Πρόθεμα των στηλών που βγήκαν από ετικέτα χαρακτηριστικού — το UI και ο suggest το αναγνωρίζουν. */
export const SPEC_PREFIX = "spec:";

/** Ετικέτα έως 80 χαρακτήρες πριν το ΠΡΩΤΟ «:», τιμή όλο το υπόλοιπο (μπορεί να έχει και άλλα «:», και αλλαγές γραμμής — εξ ου το `[\s\S]`). */
const LABEL = /^([^:]{1,80}):\s*([\s\S]+)$/;
/** Διεύθυνση, όχι ετικέτα: το «https» πριν το «:» δεν είναι χαρακτηριστικό. */
const SCHEME = /^(https?|ftp|ftps|sftp|mailto|tel|data|file|urn)$/i;
/** Πόσες τιμές ενός επαναλαμβανόμενου tag αρκούν για να θεωρηθεί «Ετικέτα: τιμή» ώστε να σπάσει σε στήλες. */
const LABEL_RATIO = 0.8;
/** Ενδεικτική αναγνώριση φωτογραφιών από το όνομα του tag — μόνο για το πλήθος στο βήμα ελέγχου. */
const IMAGE_TAG = /image|img|photo|picture|φωτογραφ/i;

const txt = (v: unknown): string => {
  if (v == null || typeof v === "boolean") return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  // tag με παιδιά ή με attributes: κρατάμε μόνο το κείμενό του, αν έχει
  if (typeof v === "object" && "#text" in (v as Record<string, unknown>)) return txt((v as Record<string, unknown>)["#text"]);
  return "";
};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]);

/** «Ετικέτα: τιμή» → τα δύο μέρη· διεύθυνση, κενή ετικέτα ή κενή τιμή → null. */
function labelled(raw: string): { label: string; value: string } | null {
  const m = LABEL.exec(raw.trim());
  if (!m) return null;
  const label = m[1].trim(), value = m[2].trim();
  if (!label || !value || SCHEME.test(label) || value.startsWith("//")) return null;
  return { label, value };
}

/** Οι τιμές ενός `ProductSpecification` (ή άλλου tag με ετικέτες) ενός προϊόντος → ετικέτα → τιμή. Διπλή ετικέτα ενώνεται με «|». */
export function specColumns(values: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of values) {
    const l = labelled(v);
    if (!l) continue;
    out[l.label] = out[l.label] ? `${out[l.label]} | ${l.value}` : l.value;
  }
  return out;
}

/** Η κωδικοποίηση από τη δήλωση του XML (διαβάζεται ως ASCII — όλες οι υποψήφιες είναι ASCII-συμβατές), με BOM να υπερισχύει. */
function decode(bytes: Buffer): string {
  if (bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) {
    return iconv.decode(bytes, bytes[0] === 0xff ? "utf-16le" : "utf-16be").replace(/^﻿/, "");
  }
  const body = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  const head = body.subarray(0, 200).toString("latin1");
  const declared = /encoding\s*=\s*["']([\w-]+)["']/i.exec(head)?.[1];
  const enc = declared && iconv.encodingExists(declared) ? declared : "utf-8";
  return iconv.decode(body, enc).replace(/^﻿/, "");
}

export interface FeedCounts {
  products: number;
  /** διακριτά ονόματα tag, όπως στο XML (το `imageurl` μετριέται μία φορά όσες φορές κι αν επαναλαμβάνεται) */
  tags: number;
  /** διακριτά ζεύγη CategoryParent → Category */
  categories: number;
  /** διακριτές ετικέτες χαρακτηριστικών */
  specLabels: number;
  /** ενδεικτικό πλήθος φωτογραφιών (tags που μοιάζουν με φωτογραφίες από το όνομα) */
  images: number;
}
export interface ParsedFeed {
  headers: string[];
  /** `matrix[0]` είναι οι επικεφαλίδες — περνά στο `toRows(matrix, 0, config)` */
  matrix: string[][];
  counts: FeedCounts;
}

/** Το `<Product>` μπορεί να κάθεται οπουδήποτε στο έγγραφο — βρίσκουμε το πρώτο επίπεδο που είναι λίστα προϊόντων. */
function findProducts(node: unknown): Record<string, unknown>[] {
  if (!node || typeof node !== "object") return [];
  const obj = node as Record<string, unknown>;
  for (const key of ["Product", "product", "item", "Item", "entry"]) {
    if (key in obj) return arr(obj[key]).filter((p): p is Record<string, unknown> => !!p && typeof p === "object");
  }
  for (const v of Object.values(obj)) {
    const found = findProducts(v);
    if (found.length) return found;
  }
  return [];
}

export function parseFeed(bytes: Buffer): ParsedFeed {
  const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true, processEntities: true });
  const products = findProducts(parser.parse(decode(bytes)));

  // ---- 1ο πέρασμα: ποια tags υπάρχουν, πόσες φορές το πολύ, και ποια έχουν τιμές «Ετικέτα: τιμή» ----
  const order: string[] = [];
  const maxCount = new Map<string, number>();
  const labelStats = new Map<string, { labelled: number; total: number }>();
  /** tag → ετικέτα → σε πόσα προϊόντα εμφανίστηκε. Ετικέτα που ξαναέρχεται = σακούλα χαρακτηριστικών, όχι ελεύθερο κείμενο. */
  const labelSeen = new Map<string, Map<string, number>>();
  for (const p of products) {
    for (const [tag, v] of Object.entries(p)) {
      if (!order.includes(tag)) order.push(tag);
      const values = arr(v).map(txt);
      maxCount.set(tag, Math.max(maxCount.get(tag) ?? 0, values.length));
      const s = labelStats.get(tag) ?? { labelled: 0, total: 0 };
      const seen = labelSeen.get(tag) ?? new Map<string, number>();
      for (const val of values) {
        if (!val) continue;
        s.total++;
        const l = labelled(val);
        if (!l) continue;
        s.labelled++;
        seen.set(l.label, (seen.get(l.label) ?? 0) + 1);
      }
      labelStats.set(tag, s);
      labelSeen.set(tag, seen);
    }
  }
  /**
   * Σπάει σε στήλες ανά ετικέτα όταν σχεδόν όλες οι τιμές είναι «Ετικέτα: τιμή» ΚΑΙ υπάρχει σημάδι ότι είναι σακούλα
   * χαρακτηριστικών και όχι πεδίο κειμένου που τυχαίνει να έχει «:»: είτε το tag επαναλαμβάνεται μέσα στο ίδιο προϊόν,
   * είτε κάποια ετικέτα ξαναέρχεται σε άλλο προϊόν (π.χ. «Χρώμα» σε 1.883 προϊόντα).
   */
  const byLabel = new Set(
    order.filter((t) => {
      const s = labelStats.get(t);
      if (!s?.total || s.labelled / s.total < LABEL_RATIO) return false;
      return (maxCount.get(t) ?? 0) > 1 || [...(labelSeen.get(t)?.values() ?? [])].some((n) => n >= 2);
    }),
  );

  // ---- 2ο πέρασμα: οι ετικέτες κάθε tag που σπάει, με τη σειρά πρώτης εμφάνισης ----
  const labelsOf = new Map<string, string[]>();
  for (const p of products) {
    for (const tag of byLabel) {
      const list = labelsOf.get(tag) ?? [];
      for (const label of Object.keys(specColumns(arr(p[tag]).map(txt)))) if (!list.includes(label)) list.push(label);
      labelsOf.set(tag, list);
    }
  }

  // ---- επικεφαλίδες ----
  const headers: string[] = [];
  const plan: { tag: string; kind: "scalar" | "nth" | "label"; n?: number; label?: string }[] = [];
  for (const tag of order) {
    if (byLabel.has(tag)) {
      for (const label of labelsOf.get(tag) ?? []) { headers.push(`${SPEC_PREFIX}${label}`); plan.push({ tag, kind: "label", label }); }
    } else if ((maxCount.get(tag) ?? 0) > 1) {
      for (let n = 1; n <= maxCount.get(tag)!; n++) { headers.push(`${tag} ${n}`); plan.push({ tag, kind: "nth", n }); }
    } else {
      headers.push(tag); plan.push({ tag, kind: "scalar" });
    }
  }

  // ---- γραμμές ----
  const matrix: string[][] = [headers];
  const pairs = new Set<string>();
  let images = 0;
  for (const p of products) {
    const specs = new Map<string, Record<string, string>>();
    for (const tag of byLabel) specs.set(tag, specColumns(arr(p[tag]).map(txt)));
    matrix.push(plan.map((c) => {
      if (c.kind === "label") return specs.get(c.tag)![c.label!] ?? "";
      const values = arr(p[c.tag]).map(txt);
      return c.kind === "nth" ? values[c.n! - 1] ?? "" : values[0] ?? "";
    }));
    const parent = txt(p.CategoryParent), cat = txt(p.Category);
    if (parent || cat) pairs.add(`${parent}\u0000${cat}`);
    for (const tag of order) if (!byLabel.has(tag) && IMAGE_TAG.test(tag)) images += arr(p[tag]).map(txt).filter(Boolean).length;
  }

  return {
    headers,
    matrix,
    counts: {
      products: products.length,
      tags: order.length,
      categories: pairs.size,
      specLabels: [...byLabel].reduce((n, t) => n + (labelsOf.get(t)?.length ?? 0), 0),
      images,
    },
  };
}
