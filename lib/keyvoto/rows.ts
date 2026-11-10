import { flattenDocument, galleryFileUrl, KEYVOTO_GALLERY } from "@/lib/keyvoto/core";
import type { ParsedFeed } from "@/lib/catalog/xml-import/parse-core";

/**
 * **Το περιεχόμενο του Keyvoto ως πίνακας** — καθαρή λογική, χωρίς δίκτυο ή βάση.
 *
 * Γιατί: ο οδηγός αντιστοίχισης, η λίστα ελέγχου και η εισαγωγή δουλεύουν ήδη με «επικεφαλίδες + γραμμές» (ό,τι βγάζει
 * ο `parseFeed` ενός XML). Το Keyvoto δίνει **ελεύθερο JSON** ανά προϊόν, διαφορετικό ανά εκδότη. Το ισιώνουμε σε
 * διαδρομές (`main.Χρώμα`, `images[].path`) και φτιάχνουμε τον ίδιο εικονικό πίνακα — έτσι από εκεί και κάτω τίποτα δεν
 * ξέρει αν η πηγή ήταν XML ή PIM, και ο χρήστης βλέπει τον ίδιο οδηγό.
 *
 * Οι επαναλήψεις (φωτογραφίες) γίνονται αριθμημένες στήλες, όπως ακριβώς τα επαναλαμβανόμενα tags ενός XML — ώστε να
 * δουλεύει αυτούσια η σειρά των φωτογραφιών με drag-and-drop.
 */

/** Τα προϊόντα μιας λήψης, όπως τα αποθηκεύουμε (συμπιεσμένα) στο στιγμιότυπο του feed. */
export interface KeyvotoItem {
  id?: string;
  code?: string;
  name?: string;
  category?: string;
  publisher?: string;
  productStatus?: string;
  document?: unknown;
  /** το αναγνωριστικό του περιεχομένου στο Keyvoto και όσα ο εκδότης έχει δέσει μαζί του (`relatives`) */
  contentId?: string;
  relatives?: string[];
  /** μετά το `pairUnits`: ο κωδικός της εξωτερικής μονάδας που ενώθηκε σε αυτή τη γραμμή */
  pairedWith?: string;
  /** και πώς βγήκε το βάρος του σετ («29,1 kg = 8 + 21,1»), όταν αθροίστηκε */
  setWeight?: string;
}
export interface KeyvotoPack {
  keyvoto: 1;
  fetchedAt: string;
  /** η gallery της στιγμής της λήψης — ώστε το στιγμιότυπο να δίνει τις ίδιες διευθύνσεις αργότερα */
  gallery?: string;
  /** κωδικός κατηγορίας → πλήρης ονομασία («Ηλεκτρικά Είδη › Ψυγεία › Καταψύκτες»), λυμένη στη λήψη */
  categories?: Record<string, string>;
  /** κλειδί χαρακτηριστικού (`noiselevel`) → η ονομασία του στο σχήμα της κατηγορίας («Στάθμη Θορύβου [dB(A)]»), λυμένη στη λήψη */
  labels?: Record<string, string>;
  /** η γλώσσα των κειμένων που κρατάμε (πλήρης ετικέτα, π.χ. el-GR) */
  lang?: string;
  items: KeyvotoItem[];
}

/** Η στήλη που λέει ότι η γραμμή είναι σετ δύο μονάδων — υπάρχει μόνο όταν η λήψη έχει τουλάχιστον ένα σετ. */
const SET_COLUMN: [string, (it: KeyvotoItem) => string] = ["Keyvoto: σετ", (it) => (it.pairedWith ? `Εσωτερική + εξωτερική μονάδα (${it.pairedWith})${it.setWeight ? ` · βάρος σετ ${it.setWeight}` : ""}` : "")];
/** Τα βάρη που αθροίζονται στο σετ: ό,τι ζυγίζει ο πελάτης και ο μεταφορέας είναι και οι δύο μονάδες μαζί. */
const WEIGHTS = ["netWeightObj", "grossWeightObj"] as const;
const num = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/** Κάτω από αυτό το κλειδί μπαίνουν στο έγγραφο της εσωτερικής μονάδας τα στοιχεία της εξωτερικής (στήλες «εξωτερική μονάδα.…»). */
export const OUTDOOR = "εξωτερική μονάδα";
const plain = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const nameOf = (it: KeyvotoItem) => flattenDocument(it.document).find(([k]) => /(^|\.)name(\.|$)/.test(k))?.[1] ?? "";
const weightOf = (it: KeyvotoItem) => {
  const p = new Map(flattenDocument(it.document));
  const v = Number(p.get("unit-dimensions.netWeightObj.value"));
  return Number.isFinite(v) && v > 0 ? { v, unit: p.get("unit-dimensions.netWeightObj.unit") ?? "" } : null;
};

/**
 * **Split κλιματιστικά: εσωτερική + εξωτερική μονάδα → ένα προϊόν.** Ο εκδότης τα δημοσιεύει ως δύο εγγραφές με δικό τους
 * barcode και τα δένει μεταξύ τους με `relatives` (επαληθευμένο στην Inventor: 46 εγγραφές = 23 κλιματιστικά). Στο eshop
 * και στο SoftOne το κλιματιστικό είναι η **εσωτερική** μονάδα, οπότε η γραμμή της κρατιέται και η εξωτερική φεύγει·
 * ό,τι έχει διαφορετικό η εξωτερική (όνομα, κωδικοί, barcode, διαστάσεις, βάρος) μένει ως στήλες «εξωτερική μονάδα.…».
 * Οι φωτογραφίες της δεν μεταφέρονται: είναι οι ίδιες εικόνες ανεβασμένες δεύτερη φορά.
 *
 * Ενώνονται ΜΟΝΟ ζεύγη που δείχνουν αποκλειστικά το ένα στο άλλο και ξεχωρίζουν με σιγουριά: τα ονόματα λένε
 * εσωτερική / εξωτερική, ή έχουν το ίδιο όνομα και η μία είναι ελαφρύτερη (η εσωτερική). Οτιδήποτε άλλο μένει δύο γραμμές.
 */
export function pairUnits(items: KeyvotoItem[]): { items: KeyvotoItem[]; pairs: number } {
  const byId = new Map(items.filter((x) => x.contentId).map((x) => [x.contentId!, x]));
  const only = (x: KeyvotoItem) => (x.relatives?.length === 1 ? byId.get(x.relatives[0]) : undefined);
  const side = (x: KeyvotoItem) => { const n = plain(nameOf(x)); return /εσω|indoor/.test(n) ? "in" : /εξω|outdoor/.test(n) ? "out" : null; };
  const gone = new Set<KeyvotoItem>(), merged = new Map<KeyvotoItem, KeyvotoItem>();
  for (const a of items) {
    const b = only(a);
    if (!b || b === a || only(b) !== a || gone.has(a) || merged.has(a)) continue;
    const sa = side(a), sb = side(b);
    let indoor: KeyvotoItem | null = sa === "in" && sb === "out" ? a : sa === "out" && sb === "in" ? b : null;
    if (!indoor && !sa && !sb && plain(nameOf(a)) === plain(nameOf(b))) {
      const wa = weightOf(a), wb = weightOf(b);
      if (wa && wb && wa.unit === wb.unit && wa.v !== wb.v) indoor = wa.v < wb.v ? a : b;
    }
    if (!indoor) continue;
    const outdoor = indoor === a ? b : a;
    const mine = new Map(flattenDocument(indoor.document));
    // μόνο ό,τι διαφέρει από την εσωτερική, χωρίς τα αρχεία της (φωτογραφίες, έγγραφα)
    // (η μονάδα μέτρησης πάει μαζί με την τιμή της, ακόμη κι αν είναι η ίδια — αλλιώς η τιμή δεν διαβάζεται)
    const theirPairs = flattenDocument(outdoor.document).filter(([k]) => !k.startsWith("media."));
    const differs = new Set(theirPairs.filter(([k, v]) => mine.get(k) !== v).map(([k]) => k));
    const extra = Object.fromEntries(theirPairs.filter(([k]) => differs.has(k) || (k.endsWith(".unit") && differs.has(`${k.slice(0, -5)}.value`))));
    // Βάρος: το προϊόν είναι το σετ, άρα στο πεδίο βάρους μπαίνει το άθροισμα (μόνο με ίδια μονάδα μέτρησης και στις δύο).
    // Το βάρος της εξωτερικής μένει στη δική της στήλη· της εσωτερικής φαίνεται στη στήλη «Keyvoto: σετ».
    const dims = { ...((indoor.document as Record<string, unknown>)?.["unit-dimensions"] as Record<string, { value?: unknown; unit?: unknown } | undefined> | undefined) };
    const theirs = new Map(flattenDocument(outdoor.document));
    let setWeight: string | undefined;
    for (const w of WEIGHTS) {
      const a1 = Number(dims[w]?.value), b1 = Number(theirs.get(`unit-dimensions.${w}.value`));
      if (!(a1 > 0) || !(b1 > 0) || String(dims[w]?.unit ?? "") !== (theirs.get(`unit-dimensions.${w}.unit`) ?? "")) continue;
      dims[w] = { ...dims[w], value: Math.round((a1 + b1) * 100) / 100 };
      if (w === "netWeightObj") setWeight = `${num(a1 + b1)} = ${num(a1)} + ${num(b1)}`;
    }
    merged.set(indoor, { ...indoor, document: { ...(indoor.document as object), "unit-dimensions": dims, [OUTDOOR]: extra }, pairedWith: outdoor.code || outdoor.contentId, setWeight });
    gone.add(outdoor);
  }
  return { items: items.filter((x) => !gone.has(x)).map((x) => merged.get(x) ?? x), pairs: merged.size };
}


export const keyvotoEnvelope = (items: KeyvotoItem[], fetchedAt = new Date(), gallery = "", categories: Record<string, string> = {}, labels: Record<string, string> = {}, lang = ""): Buffer =>
  Buffer.from(JSON.stringify({
    keyvoto: 1, fetchedAt: fetchedAt.toISOString(), gallery: gallery || undefined,
    categories: Object.keys(categories).length ? categories : undefined,
    labels: Object.keys(labels).length ? labels : undefined, lang: lang || undefined, items,
  } satisfies KeyvotoPack), "utf8");

/** Είναι αυτά τα bytes πακέτο Keyvoto (και όχι XML); Κοιτάζει μόνο την αρχή — το πακέτο μπορεί να είναι δεκάδες MB. */
export function isKeyvotoBytes(bytes: Buffer): boolean {
  const head = bytes.subarray(0, 64).toString("utf8").replace(/^﻿/, "").trimStart();
  return head.startsWith("{") && /^\{\s*"keyvoto"\s*:/.test(head);
}

const noIndex = (p: string) => p.replace(/\[\d+\]/g, "[]");
/** Πεδίο αρχείου της gallery: η τελευταία βαθμίδα λέγεται `path` (media.images[].path, media.documents[].path). */
const FILE_PATH = /(^|\.)path$/;

// ---------- έτοιμες στήλες ----------

/** Οι επικεφαλίδες που ο οδηγός αναγνωρίζει ήδη μόνος του (ίδιες συμβάσεις με ένα XML feed): `spec:` = χαρακτηριστικό. */
const SPEC = "spec:";
/** Η στήλη κατηγορίας που ο οδηγός αντιστοιχίζει τιμή-προς-τιμή (ίδια με το `CATEGORY_PAIR` του parse-core — το ελέγχει test). */
export const CATEGORY_COL = "Κατηγορία (πλήρης)";
/** Ό,τι έρχεται ακατέργαστο από το έγγραφο: ο οδηγός το αγνοεί εκτός αν ο χρήστης το διαλέξει ρητά. */
export const RAW = "raw:";

const TO_CM: Record<string, number> = { centimeters: 1, millimeters: 0.1, meters: 100 };
const TO_KG: Record<string, number> = { kilograms: 1, grams: 0.001 };
const UNIT_EL: Record<string, string> = { "square meters": "τ.μ.", meters: "m", centimeters: "εκ.", millimeters: "χιλ.", kilograms: "kg", grams: "g", liters: "L", watts: "W" };
const round = (n: number) => String(Math.round(n * 100) / 100);
/** `{value, unit}` → αριθμός στη δική μας μονάδα· άγνωστη μονάδα ή αποτέλεσμα που δεν στέκει (βάρος σε «Milligrams») = κενό, όχι λάθος νούμερο. */
const measure = (flat: Map<string, string>, path: string, table: Record<string, number>, min = 0): string => {
  const v = Number(flat.get(`${path}.value`)), k = table[(flat.get(`${path}.unit`) ?? "").toLowerCase()];
  return v > 0 && k && v * k >= min ? round(v * k) : "";
};
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Η τιμή ενός χαρακτηριστικού ως κείμενο για τον πελάτη: γλώσσα, «80 τ.μ.», «Ναι/Όχι», λίστα με κόμματα. */
function specText(v: unknown, lang: string): string {
  if (v == null || v === "") return "";
  if (typeof v === "boolean") return v ? "Ναι" : "Όχι";
  if (Array.isArray(v)) return v.map((x) => specText(x, lang)).filter(Boolean).join(", ");
  if (isObj(v)) {
    if ("value" in v && "unit" in v) { const u = String(v.unit ?? ""); return v.value == null || v.value === "" ? "" : `${v.value} ${UNIT_EL[u.toLowerCase()] ?? u}`.trim(); }
    const langs = Object.keys(v).filter((k) => /^[a-z]{2,3}-[A-Za-z0-9]{2,8}$/.test(k));
    if (langs.length) return specText(v[lang] ?? v[langs.find((k) => k.startsWith(lang.split("-")[0])) ?? langs[0]], lang);
    return flattenDocument(v).map(([, x]) => x).join(", ");
  }
  return String(v).trim();
}

/** Οι φωτογραφίες με πρώτη όποια ο εκδότης έχει σημάνει «Hero Image» — αυτή γίνεται η κύρια του προϊόντος. */
function imageUrls(doc: Record<string, unknown>, gallery: string): string[] {
  const list = (isObj(doc.media) && Array.isArray(doc.media.images) ? doc.media.images : Array.isArray(doc.images) ? doc.images : []) as unknown[];
  const imgs = list.filter(isObj).map((x) => ({ path: String(x.path ?? "").trim(), hero: Array.isArray(x.viewAttributes) && x.viewAttributes.some((a) => /hero/i.test(String(a))) })).filter((x) => x.path);
  return [...imgs.filter((x) => x.hero), ...imgs.filter((x) => !x.hero)].map((x) => galleryFileUrl(gallery, x.path));
}

/**
 * Το πακέτο μιας λήψης → ο ίδιος εικονικός πίνακας που δίνει ένα XML feed, σε δύο μέρη:
 *
 * 1. **Έτοιμες στήλες** με επικεφαλίδες που ο οδηγός αναγνωρίζει μόνος του (SKU, EAN, Name, Image 1…, `spec:…`). Το
 *    έγγραφο του Keyvoto έχει σταθερή δομή (identity-codes, gs1-and-barcode, general-information, media, unit-dimensions,
 *    main), άρα ξέρουμε από πριν πού είναι το καθετί — ο χρήστης δεν αντιστοιχίζει 300 διαδρομές με το χέρι. Οι μονάδες
 *    γίνονται εκατοστά / κιλά εδώ (διαφέρουν από προϊόν σε προϊόν), τα χαρακτηριστικά παίρνουν την ελληνική ονομασία
 *    τους από το σχήμα της κατηγορίας (`labels`) και η κύρια φωτογραφία μπαίνει πρώτη.
 * 2. **Ακατέργαστες στήλες** (`raw:διαδρομή`) με όλο το υπόλοιπο έγγραφο, για ό,τι θελήσει κανείς να προσθέσει.
 */
export function parseKeyvotoRows(bytes: Buffer): ParsedFeed {
  const pack = JSON.parse(bytes.toString("utf8")) as KeyvotoPack;
  const { items, pairs } = pairUnits(pack.items ?? []);
  const gallery = (pack.gallery ?? "").trim() || KEYVOTO_GALLERY;
  const cats = pack.categories ?? {}, labels = pack.labels ?? {}, lang = pack.lang || "el-GR";
  if (!items.length) return { headers: [], matrix: [[]], counts: { products: 0, tags: 0, categories: 0, specLabels: 0, images: 0 } };

  // ---- ανά προϊόν: έτοιμα πεδία, φωτογραφίες, χαρακτηριστικά, ακατέργαστα ----
  const specOrder: string[] = [], rawOrder: string[] = [], rawMax = new Map<string, number>();
  let maxImages = 0;
  const rows = items.map((it) => {
    const doc = (isObj(it.document) ? it.document : {}) as Record<string, unknown>;
    const pairsFlat = flattenDocument(doc);
    const flat = new Map<string, string>();
    for (const [k, v] of pairsFlat) if (!flat.has(k)) flat.set(k, v);
    const text = (path: string) => { const at = path.split(".").reduce<unknown>((o, k) => (isObj(o) ? o[k] : undefined), doc); return specText(at, lang); };
    const out = (flat.get(`${OUTDOOR}.identity-codes.billingProductName`) ?? "") || (it.pairedWith ?? "");
    const outFlat = new Map([...flat].filter(([k]) => k.startsWith(`${OUTDOOR}.`)).map(([k, v]) => [k.slice(OUTDOOR.length + 1), v]));
    const outDims = ["widthObj", "heightObj", "lengthObj"].map((d) => measure(outFlat, `unit-dimensions.${d}`, TO_CM)).filter(Boolean);
    const fixed: Record<string, string> = {
      SKU: (it.code ?? "").trim(),
      MPN: flat.get("identity-codes.billingProductName") ?? "",
      EAN: flat.get("gs1-and-barcode.gtin") ?? flat.get("gtin") ?? "",
      Name: text("general-information.name"),
      Description: text("general-information.description"),
      Brand: flat.get("identity-codes.manufacturer") ?? "",
      [CATEGORY_COL]: cats[(it.category ?? "").trim()] ?? "",
      PriceRetail: flat.get("general-information.recRetailPriceObj.value") ?? "",
      Width: measure(flat, "unit-dimensions.widthObj", TO_CM),
      Height: measure(flat, "unit-dimensions.heightObj", TO_CM),
      Length: measure(flat, "unit-dimensions.lengthObj", TO_CM),
      NetWeight: measure(flat, "unit-dimensions.netWeightObj", TO_KG, 0.01),
      "Keyvoto: κατάσταση": (it.productStatus ?? "").trim(),
      "Keyvoto: σετ": SET_COLUMN[1](it),
    };
    const specs = new Map<string, string>();
    const put = (label: string, value: string) => { if (!value) return; if (!specOrder.includes(label)) specOrder.push(label); specs.set(label, value); };
    for (const [k, v] of Object.entries(isObj(doc.main) ? doc.main : {})) {
      const key = k.trim();
      put(labels[key] && !(specs.has(labels[key])) ? labels[key] : labels[key] ? `${labels[key]} (${key})` : key, specText(v, lang));
    }
    if (it.pairedWith) {
      put("Εξωτερική μονάδα: μοντέλο", out);
      put("Εξωτερική μονάδα: διαστάσεις", outDims.length === 3 ? `${outDims.join(" × ")} εκ.` : "");
      put("Εξωτερική μονάδα: βάρος (kg)", measure(outFlat, "unit-dimensions.netWeightObj", TO_KG, 0.01));
    }
    const images = imageUrls(doc, gallery);
    maxImages = Math.max(maxImages, images.length);
    const raw = new Map<string, string[]>();
    for (const [path, value] of pairsFlat) {
      if (path.startsWith("main.")) continue; // είναι ήδη χαρακτηριστικά
      const key = noIndex(path);
      if (!rawOrder.includes(key)) rawOrder.push(key);
      raw.set(key, [...(raw.get(key) ?? []), FILE_PATH.test(key) ? galleryFileUrl(gallery, value) : value]);
    }
    for (const [k, l] of raw) rawMax.set(k, Math.max(rawMax.get(k) ?? 0, l.length));
    return { fixed, specs, images, raw, it };
  });

  // ---- επικεφαλίδες: έτοιμες (χωρίς όσες είναι παντού κενές), φωτογραφίες, χαρακτηριστικά, ακατέργαστα ----
  const fixedHeaders = Object.keys(rows[0].fixed).filter((h) => rows.some((r) => r.fixed[h]));
  const imageHeaders = Array.from({ length: maxImages }, (_, i) => `Image ${i + 1}`);
  const rawCols = rawOrder.flatMap((path) => Array.from({ length: rawMax.get(path) ?? 1 }, (_, at) => ({ path, at, header: `${RAW}${(rawMax.get(path) ?? 1) === 1 ? path : `${path} ${at + 1}`}` })));
  const rawSummary: [string, (it: KeyvotoItem) => string][] = [["Keyvoto: κατηγορία (κωδικός)", (it) => it.category ?? ""], ["Keyvoto: κατάλογος", (it) => it.name ?? ""], ["Keyvoto: εκδότης", (it) => it.publisher ?? ""]];
  const headers = [...fixedHeaders, ...imageHeaders, ...specOrder.map((l) => `${SPEC}${l}`), ...rawSummary.map(([h]) => `${RAW}${h}`), ...rawCols.map((c) => c.header)];
  const matrix: string[][] = [headers, ...rows.map((r) => [
    ...fixedHeaders.map((h) => r.fixed[h]),
    ...imageHeaders.map((_, i) => r.images[i] ?? ""),
    ...specOrder.map((l) => r.specs.get(l) ?? ""),
    ...rawSummary.map(([, read]) => read(r.it).trim()),
    ...rawCols.map((c) => r.raw.get(c.path)?.[c.at] ?? ""),
  ])];

  return {
    headers,
    matrix,
    counts: {
      products: items.length,
      tags: headers.length,
      // μετράμε ΟΝΟΜΑΣΙΕΣ: δύο κωδικοί που δείχνουν στην ίδια κατηγορία είναι μία κατηγορία
      categories: new Set(items.map((x) => cats[(x.category ?? "").trim()] || (x.category ?? "").trim()).filter(Boolean)).size,
      specLabels: specOrder.length,
      images: maxImages,
      ...(pairs ? { sets: pairs } : {}),
    },
  };
}

// ---------- η πηγή ως «διεύθυνση» ----------

/**
 * Ένα feed Keyvoto δεν έχει διεύθυνση — έχει εκδότη (και προαιρετικά συγκεκριμένο κατάλογό του). Το γράφουμε ως
 * ψευδοδιεύθυνση ώστε να μπει αυτούσιο στο υπάρχον μοντέλο (`SupplierFeed.url`, στιγμιότυπα, χρονοπρογραμματισμός).
 */
export const KEYVOTO_SCHEME = "keyvoto:";
export const keyvotoUrl = (publisher: string, catalogue = "") =>
  `${KEYVOTO_SCHEME}${publisher.trim()}${catalogue.trim() ? `/${catalogue.trim()}` : ""}`;

export function parseKeyvotoUrl(url: string): { publisher: string; catalogue: string } | null {
  const u = (url ?? "").trim();
  if (!u.toLowerCase().startsWith(KEYVOTO_SCHEME)) return null;
  const [publisher = "", catalogue = ""] = u.slice(KEYVOTO_SCHEME.length).split("/");
  return { publisher: publisher.trim(), catalogue: catalogue.trim() };
}
