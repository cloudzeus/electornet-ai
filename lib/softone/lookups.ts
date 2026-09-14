import "server-only";
import { db } from "@/lib/db";
import { s1 } from "@/lib/softone";

/**
 * SoftOne reference tables → our own models.
 *
 * Read side: the official `GetTable` service (TABLE / FIELDS / FILTER) returns
 * positional rows in the FIELDS order. Each lookup definition maps a row to
 * `{ s1Id, code, name, active, extra }`. Sync upserts by `s1Id`: on first
 * sight the row is created with our fields initialised from SoftOne; later
 * syncs only refresh the S1 mirror columns (`s1Name`, `s1Data`, `s1Missing`)
 * and never overwrite what the admin edited. Rows that disappeared from
 * SoftOne are flagged `s1Missing`, not deleted.
 */
export interface LookupField { key: string; label: string; type: "text" | "number" | "boolean" | "select" | "media"; options?: { value: string; label: string }[]; help?: string; width?: "half" | "full" }
export interface LookupDef {
  kind: string;
  label: string;
  plural: string;
  description: string;
  model: string; // Prisma delegate name
  table: string; // SoftOne table (GetTable) — or the object name when `browser` is set
  fields: string[]; // FIELDS in order
  filter?: string;
  /** Some tables (SERIES) are not fully served by GetTable; read them through the object browser instead. */
  browser?: { object: string; filters?: string; cols: string[] };
  map: (r: string[]) => { s1Id: string; code: string; name: string; active: boolean; extra?: Record<string, unknown>; s1Extra?: Record<string, unknown> } | null;
  /** editable columns of our model shown in the admin, besides code/name/active */
  editable: LookupField[];
  /** columns of our model shown in the list */
  columns?: string[];
}

const yes = (v: string) => v === "1" || v === "true";
const slugify = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9α-ω]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);

export const PAYMENT_KINDS = [{ value: "card", label: "Κάρτα (PSP)" }, { value: "cod", label: "Αντικαταβολή" }, { value: "bank", label: "Τραπεζική κατάθεση" }, { value: "paypal", label: "PayPal" }, { value: "wallet", label: "Apple / Google Pay" }, { value: "loan", label: "Δόσεις / δάνειο" }, { value: "cash", label: "Μετρητά στο κατάστημα" }, { value: "other", label: "Άλλο" }];
export const PROVIDERS = [{ value: "", label: "—" }, { value: "viva", label: "Viva Wallet" }, { value: "revolut", label: "Revolut" }, { value: "paypal", label: "PayPal" }, { value: "iris", label: "IRIS" }, { value: "bank", label: "Τράπεζα" }];
export const CARRIERS = [{ value: "", label: "—" }, { value: "acs", label: "ACS" }, { value: "geniki", label: "Γενική Ταχυδρομική" }, { value: "elta", label: "ΕΛΤΑ Courier" }, { value: "speedex", label: "Speedex" }, { value: "boxnow", label: "BOX NOW" }, { value: "store", label: "Μεταφορική καταστήματος" }, { value: "pickup", label: "Παραλαβή από κατάστημα" }];
export const PURPOSES = [{ value: "", label: "—" }, { value: "order", label: "Παραγγελία e-shop" }, { value: "order-paid", label: "Παραγγελία πληρωμένη" }, { value: "order-phone", label: "Τηλεφωνική παραγγελία" }, { value: "invoice", label: "Τιμολόγιο" }, { value: "receipt", label: "Απόδειξη λιανικής" }, { value: "credit", label: "Πιστωτικό" }, { value: "proforma", label: "Προ-τιμολόγιο" }, { value: "quote", label: "Προσφορά" }, { value: "other", label: "Άλλο" }];
const REGIONS = ["Αττική", "Κεντρική Μακεδονία", "Θεσσαλία", "Δυτική Ελλάδα", "Πελοπόννησος", "Στερεά Ελλάδα", "Ήπειρος", "Ανατολική Μακεδονία & Θράκη", "Δυτική Μακεδονία", "Κρήτη", "Νότιο Αιγαίο", "Βόρειο Αιγαίο", "Ιόνια Νησιά"].map((r) => ({ value: r, label: r }));

export const LOOKUPS: LookupDef[] = [
  { kind: "vat", label: "Φ.Π.Α.", plural: "Συντελεστές Φ.Π.Α.", description: "Συντελεστές από τον πίνακα VAT· ο προεπιλεγμένος χρησιμοποιείται όταν το είδος δεν ορίζει.", model: "vatRate", table: "VAT", fields: ["VAT", "NAME", "PERCNT", "ISACTIVE", "CCCVAT", "MYDATACODE"],
    map: (r) => ({ s1Id: r[0], code: r[0], name: r[1], active: yes(r[3]), extra: { percent: Number(r[2]) || 0 }, s1Extra: { cccVat: r[4], myDataCode: r[5] } }),
    editable: [{ key: "percent", label: "Ποσοστό %", type: "number", width: "half" }, { key: "isDefault", label: "Προεπιλογή", type: "boolean", width: "half" }], columns: ["percent", "isDefault"] },
  { kind: "unit", label: "Μονάδα μέτρησης", plural: "Μονάδες μέτρησης", description: "MTRUNIT: τεμάχιο, σετ, πακέτο, κιλά.", model: "unit", table: "MTRUNIT", fields: ["MTRUNIT", "SHORTCUT", "NAME", "QDECIMALS", "ISACTIVE", "MYDATACODE"],
    map: (r) => ({ s1Id: r[0], code: r[1] || r[0], name: r[2], active: yes(r[4]), extra: { decimals: Number(r[3]) || 0 }, s1Extra: { myDataCode: r[5] } }),
    editable: [{ key: "decimals", label: "Δεκαδικά ποσότητας", type: "number", width: "half" }], columns: ["decimals"] },
  { kind: "brand", label: "Μάρκα", plural: "Μάρκες", description: "Κατασκευαστές (MTRMANFCTR) — στο SoftOne της Euronics αυτή είναι η «μάρκα» του είδους· το MTRMARK είναι εμπορική σήμανση (Premium, QLED…).", model: "brand", table: "MTRMANFCTR", fields: ["MTRMANFCTR", "CODE", "NAME", "ISACTIVE"],
    map: (r) => ({ s1Id: r[0], code: r[1] || r[0], name: r[2], active: yes(r[3]), extra: { slug: slugify(r[2]) || `brand-${r[0]}` } }),
    editable: [{ key: "slug", label: "Slug", type: "text", width: "half" }, { key: "logo", label: "Λογότυπο (SVG ή εικόνα)", type: "media", width: "full", help: "Ανέβασε το vector (SVG) ή PNG με διαφάνεια από τη Media library· αποθηκεύεται στο Bunny CDN." }, { key: "featured", label: "Προβεβλημένη", type: "boolean", width: "half" }, { key: "sort", label: "Σειρά", type: "number", width: "half" }], columns: ["logo", "slug", "featured"] },
  { kind: "taxOffice", label: "Δ.Ο.Υ.", plural: "Δ.Ο.Υ.", description: "IRSDATA — για τιμολόγια σε επιχειρήσεις.", model: "taxOffice", table: "IRSDATA", fields: ["IRSDATA", "CODE", "NAME", "ADDRESS", "CITY", "ISACTIVE"],
    map: (r) => ({ s1Id: r[0], code: r[1] || r[0], name: r[2], active: yes(r[5]), extra: { address: r[3] || null, city: r[4] || null } }),
    editable: [{ key: "address", label: "Διεύθυνση", type: "text", width: "half" }, { key: "city", label: "Πόλη", type: "text", width: "half" }], columns: ["city"] },
  { kind: "country", label: "Χώρα", plural: "Χώρες", description: "COUNTRY με ISO κωδικό, ένδειξη ΕΕ και νόμισμα.", model: "country", table: "COUNTRY", fields: ["COUNTRY", "SHORTCUT", "NAME", "COUNTRYTYPE", "SOCURRENCY", "ISACTIVE"],
    map: (r) => ({ s1Id: r[0], code: (r[1] || r[0]).toUpperCase(), name: r[2], active: yes(r[5]), extra: { eu: r[3] === "1", currency: r[4] === "1" ? "EUR" : null } }),
    editable: [{ key: "eu", label: "Μέλος ΕΕ", type: "boolean", width: "half" }, { key: "currency", label: "Νόμισμα", type: "text", width: "half" }], columns: ["eu"] },
  { kind: "district", label: "Νομός", plural: "Νομοί", description: "DISTRICT — το SoftOne δεν έχει πίνακα πόλεων· οι διευθύνσεις πελατών έχουν ελεύθερο κείμενο πόλης και Τ.Κ. Οι νομοί ομαδοποιούνται σε περιφέρειες για ζώνες αποστολής.", model: "district", table: "DISTRICT", fields: ["DISTRICT", "CODE", "NAME", "COUNTRY"],
    map: (r) => ({ s1Id: r[0], code: r[1] || r[0], name: r[2], active: true, s1Extra: { country: r[3] } }),
    editable: [{ key: "region", label: "Περιφέρεια (ζώνη αποστολής)", type: "select", options: [{ value: "", label: "—" }, ...REGIONS], width: "half" }], columns: ["region"] },
  { kind: "postalCode", label: "Τ.Κ.", plural: "Ταχυδρομικοί κώδικες", description: "ZIP — κάθε Τ.Κ. με τον νομό του. Η πόλη συμπληρώνεται από εμάς (geocoding) γιατί το SoftOne δεν την κρατά.", model: "postalCode", table: "ZIP", fields: ["ZIP", "CODE", "DISTRICT", "COUNTRY", "ISACTIVE"],
    map: (r) => (r[1] ? { s1Id: r[1], code: r[1], name: r[1], active: yes(r[4]), s1Extra: { districtS1: r[2], country: r[3] } } : null),
    editable: [{ key: "city", label: "Πόλη", type: "text", width: "half" }], columns: ["city", "district"] },
  { kind: "payment", label: "Τρόπος πληρωμής", plural: "Τρόποι πληρωμής", description: "PAYMENT (πελατών, SODTYPE 13). Κάθε τρόπος αντιστοιχίζεται στον πάροχο του site (Viva, Revolut, PayPal, αντικαταβολή, κατάθεση).", model: "paymentMethod", table: "PAYMENT", fields: ["PAYMENT", "CODE", "NAME", "ISACTIVE", "SODTYPE", "COMPANY"], filter: "COMPANY=1 AND SODTYPE=13",
    map: (r) => ({ s1Id: r[0], code: r[1] || r[0], name: r[2], active: false, extra: { kind: /αντικαταβολ/i.test(r[2]) ? "cod" : /paypal/i.test(r[2]) ? "paypal" : /κάρτα|card/i.test(r[2]) ? "card" : /έμβασμα|κατάθεσ|τράπεζ/i.test(r[2]) ? "bank" : /loan|δόσ/i.test(r[2]) ? "loan" : /μετρητ/i.test(r[2]) ? "cash" : "other" }, s1Extra: { sodtype: r[4] } }),
    editable: [{ key: "kind", label: "Είδος", type: "select", options: PAYMENT_KINDS, width: "half" }, { key: "provider", label: "Πάροχος site", type: "select", options: PROVIDERS, width: "half" }, { key: "fee", label: "Χρέωση (€)", type: "number", width: "half" }, { key: "maxTotal", label: "Μέγιστο ποσό (€)", type: "number", width: "half" }, { key: "sort", label: "Σειρά", type: "number", width: "half" }], columns: ["kind", "provider", "fee"] },
  { kind: "shipping", label: "Τρόπος αποστολής", plural: "Τρόποι αποστολής", description: "SHIPMENT — στο SoftOne της Euronics έχει 4 εμπορικές τιμές (Διαφημιστικό, Δώρο…). Οι δικοί μας τρόποι (ACS, Γενική, παραλαβή) δημιουργούνται εδώ και αντιστοιχίζονται.", model: "shippingMethod", table: "SHIPMENT", fields: ["SHIPMENT", "CODE", "NAME", "ISACTIVE"],
    map: (r) => ({ s1Id: r[0], code: r[1] || r[0], name: r[2], active: false }),
    editable: [{ key: "carrier", label: "Courier / τρόπος", type: "select", options: CARRIERS, width: "half" }, { key: "fee", label: "Κόστος (€)", type: "number", width: "half" }, { key: "freeFrom", label: "Δωρεάν από (€)", type: "number", width: "half" }, { key: "sort", label: "Σειρά", type: "number", width: "half" }], columns: ["carrier", "fee"] },
  { kind: "carrier", label: "Μεταφορέας", plural: "Μεταφορείς", description: "SOCARRIER — μεταφορικά μέσα/οδηγοί του ERP (για δελτία αποστολής).", model: "carrier", table: "SOCARRIER", fields: ["SOCARRIER", "CODE", "NAME", "PHONE01", "ISACTIVE"],
    map: (r) => ({ s1Id: r[0], code: r[1] || r[0], name: r[2], active: yes(r[4]), extra: { phone: r[3] || null } }),
    editable: [{ key: "phone", label: "Τηλέφωνο", type: "text", width: "half" }], columns: ["phone"] },
  { kind: "series", label: "Σειρά παραστατικού", plural: "Σειρές παραστατικών πώλησης", description: "SERIES με SOSOURCE 1351 (πωλήσεις), μέσω του browser του SoftOne. Ο «σκοπός» λέει στο module παραγγελιών σε ποια σειρά καταχωρεί (π.χ. PES = Παραγγελία e-Shop).", model: "docSeries", table: "SERIES", fields: ["SERIES", "CODE", "NAME", "FPRMS", "ISACTIVE"],
    browser: { object: "SERIES", filters: "SERIES.SOSOURCE=1351", cols: ["SERIES.SERIES", "SERIES.CODE", "SERIES.NAME", "SERIES.FPRMS", "SERIES.ISACTIVE"] },
    map: (r) => ({ s1Id: r[0], code: r[1] || r[0], name: r[2], active: r[4] === "1", extra: { s1Fprms: r[3] || null, purpose: /e-?shop/i.test(r[2]) && /πληρωμ/i.test(r[2]) ? "order-paid" : /τηλεφων/i.test(r[2]) && /παραγγελ/i.test(r[2]) ? "order-phone" : /e-?shop/i.test(r[2]) && /παραγγελ/i.test(r[2]) ? "order" : /πιστωτικ/i.test(r[2]) ? "credit" : /προ-?τιμολ/i.test(r[2]) ? "proforma" : /προσφορ/i.test(r[2]) ? "quote" : /απόδειξη λιαν/i.test(r[2]) ? "receipt" : /τιμολόγιο πώλησης/i.test(r[2]) ? "invoice" : null } }),
    editable: [{ key: "purpose", label: "Σκοπός στο site", type: "select", options: PURPOSES, width: "half" }, { key: "isDefault", label: "Προεπιλογή για τον σκοπό", type: "boolean", width: "half" }], columns: ["purpose", "isDefault", "s1Fprms"] },
  { kind: "warehouse", label: "Αποθηκευτικός χώρος", plural: "Αποθηκευτικοί χώροι", description: "WHOUSE — ποιοι χώροι μετράνε στη διαθεσιμότητα του site και σε ποιο κατάστημα-μέλος ανήκουν.", model: "warehouse", table: "WHOUSE", fields: ["WHOUSE", "CODE", "NAME", "BRANCH", "ISACTIVE", "COMPANY"], filter: "COMPANY=1",
    map: (r) => ({ s1Id: r[0], code: r[1] || r[0], name: r[2], active: yes(r[4]), extra: { branchS1: r[3] || null } }),
    editable: [{ key: "sellable", label: "Μετρά στη διαθεσιμότητα", type: "boolean", width: "half" }, { key: "storeId", label: "Κατάστημα (id)", type: "text", width: "half" }], columns: ["sellable", "storeId"] },
  { kind: "branch", label: "Υποκατάστημα", plural: "Υποκαταστήματα ERP", description: "BRANCH της εταιρείας στο SoftOne.", model: "branch", table: "BRANCH", fields: ["BRANCH", "CODE", "NAME", "ISACTIVE", "COMPANY"], filter: "COMPANY=1",
    map: (r) => ({ s1Id: r[0], code: r[1] || r[0], name: r[2], active: yes(r[3]) }), editable: [] },
  { kind: "businessUnit", label: "Business unit", plural: "Business units", description: "BUSUNITS — εμπορικές μονάδες (Λευκά, Μαύρα, Κλιματισμός…).", model: "businessUnit", table: "BUSUNITS", fields: ["BUSUNITS", "CODE", "NAME", "COMPANY"], filter: "COMPANY=1",
    map: (r) => ({ s1Id: r[0], code: r[1] || r[0], name: r[2], active: true }), editable: [] },
  { kind: "currency", label: "Νόμισμα", plural: "Νομίσματα", description: "SOCURRENCY.", model: "currency", table: "SOCURRENCY", fields: ["SOCURRENCY", "INTERCODE", "NAME", "SHORTCUT", "VDECIMALS", "ISACTIVE"],
    map: (r) => ({ s1Id: r[0], code: (r[1] || r[0]).toUpperCase(), name: r[2], active: yes(r[5]), extra: { symbol: r[3] || null, decimals: Number(r[4]) || 2 } }),
    editable: [{ key: "symbol", label: "Σύμβολο", type: "text", width: "half" }, { key: "decimals", label: "Δεκαδικά", type: "number", width: "half" }], columns: ["symbol"] },
];
export const lookupByKind = (kind: string) => LOOKUPS.find((l) => l.kind === kind) ?? null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const delegate = (model: string) => (db as any)[model] as { findMany: (a: unknown) => Promise<Record<string, unknown>[]>; findUnique: (a: unknown) => Promise<Record<string, unknown> | null>; create: (a: unknown) => Promise<Record<string, unknown>>; update: (a: unknown) => Promise<Record<string, unknown>>; updateMany: (a: unknown) => Promise<unknown>; count: (a?: unknown) => Promise<number> };

/**
 * Τα σφάλματα του Prisma έρχονται ως πολυσέλιδο dump με διαδρομές αρχείων και
 * ολόκληρο το payload. Στο ιστορικό θέλουμε μία πρόταση που λέει τι φταίει.
 */
export function friendlyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const unknownArg = raw.match(/Unknown argument `(\w+)`/);
  if (unknownArg) return `Άγνωστο πεδίο «${unknownArg[1]}» στο μοντέλο — λείπει από το schema ή δεν έγινε prisma generate μετά από db push.`;
  const unique = raw.match(/Unique constraint failed on the fields: \(`?([^`)]+)`?\)/);
  if (unique) return `Διπλή τιμή στο μοναδικό πεδίο «${unique[1]}».`;
  const fk = raw.match(/Foreign key constraint (?:failed|violated)[^\n]*/);
  if (fk) return `Παραβίαση σχέσης: ${fk[0].trim()}`;
  const notFound = raw.match(/No '?(\w+)'? record/);
  if (notFound) return `Δεν βρέθηκε εγγραφή ${notFound[1]}.`;
  if (/GetTable|getBrowserInfo|getBrowserData/.test(raw)) return raw.split("\n")[0].slice(0, 300);
  if (/timeout|aborted/i.test(raw)) return "Λήξη χρόνου αναμονής από το SoftOne.";
  // αλλιώς: η πρώτη ουσιαστική γραμμή, χωρίς διαδρομές αρχείων
  const line = raw.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("at ") && !l.includes("/") && !/^\d+\s/.test(l));
  const pick = (line ?? raw.split("\n")[0]).trim();
  const invocation = pick.match(/Invalid `[\w.]*?(\w+)\(\)` invocation/);
  if (invocation) return `Η εγγραφή στη βάση απέτυχε (${invocation[1]}) — δες τα logs για λεπτομέρειες.`;
  return pick.slice(0, 300) || "Άγνωστο σφάλμα.";
}

/** Official GetTable → positional rows. */
export async function getTable(TABLE: string, FIELDS: string[], FILTER = ""): Promise<string[][]> {
  const r = await s1("GetTable", { TABLE, FIELDS: FIELDS.join(","), FILTER });
  if (!r.success) throw new Error(`GetTable ${TABLE}: ${r.error ?? r.errorcode ?? "failed"}`);
  const rows = (r.data ?? r.rows ?? []) as (string[] | Record<string, string>)[];
  return rows.map((row) => (Array.isArray(row) ? row.map((v) => (v == null ? "" : String(v))) : FIELDS.map((f) => String(row[f] ?? ""))));
}

/** Browser values come back display-formatted («1|Ναι», «7005|ΠΑΡΑΓΓΕΛΙΑ…»): keep the id half. */
const idOf = (v: string) => (v.includes("|") ? v.slice(0, v.indexOf("|")) : v);

/** Object browser → positional rows in the order of `cols`, ids un-formatted. Used where GetTable is incomplete. */
export async function getBrowserRows(object: string, cols: string[], filters = ""): Promise<string[][]> {
  const info = await s1("getBrowserInfo", { object, list: "", filters });
  if (!info.success) throw new Error(`getBrowserInfo ${object}: ${info.error ?? info.errorcode ?? "failed"}`);
  const names = (info.fields as { name: string }[]).map((f) => f.name);
  const total = Number(info.totalcount) || 0;
  const out: string[][] = [];
  for (let start = 0; start < total; start += 500) {
    const d = await s1("getBrowserData", { reqID: info.reqID, start, limit: 500 });
    for (const row of (d.rows ?? []) as string[][]) {
      out.push(cols.map((c) => { const i = names.indexOf(c); return i < 0 ? "" : idOf(String(row[i] ?? "")); }));
    }
    if (!d.rows?.length) break;
  }
  return out;
}

const readSource = (def: LookupDef) => (def.browser ? getBrowserRows(def.browser.object, def.browser.cols, def.browser.filters ?? "") : getTable(def.table, def.fields, def.filter));

/**
 * Sync one reference table. Batched for a remote database: one read of the
 * existing rows, one createMany for the unseen ones, targeted updates only
 * where the SoftOne mirror actually changed, one updateMany for the vanished.
 */
export async function syncLookup(kind: string, trigger: "manual" | "cron" | "script" = "manual") {
  const def = lookupByKind(kind);
  if (!def) throw new Error(`unknown lookup ${kind}`);
  const t0 = Date.now();
  const run = await db.s1SyncRun.create({ data: { kind, trigger } });
  try {
    const rows = await readSource(def);
    const d = delegate(def.model);
    const existing = (await d.findMany({ select: { id: true, s1Id: true, code: true, s1Name: true, s1Data: true, ...(def.kind === "brand" ? { slug: true } : {}) } })) as { id: string; s1Id: string | null; code: string; s1Name: string | null; s1Data: unknown; slug?: string }[];
    const byS1 = new Map(existing.filter((e) => e.s1Id).map((e) => [e.s1Id as string, e]));
    const codes = new Set(existing.map((e) => e.code));
    const slugs = new Set(existing.map((e) => e.slug).filter(Boolean) as string[]);
    const districts = def.kind === "postalCode" ? new Map((await db.district.findMany({ select: { id: true, s1Id: true } })).filter((x) => x.s1Id).map((x) => [x.s1Id as string, x.id])) : null;
    const seen = new Set<string>();
    let skipped = 0;
    const now = new Date();
    const creates: Record<string, unknown>[] = [];
    const updates: { id: string; data: Record<string, unknown> }[] = [];
    for (const raw of rows) {
      const m = def.map(raw);
      // Αγνοούμε γραμμές χωρίς κωδικό και διπλότυπα (το SoftOne έχει π.χ. τον
      // ίδιο Τ.Κ. σε δύο νομούς). Έτσι κλείνει η αρίθμηση: γραμμές = νέες + ενημερωμένες + αγνοημένες.
      if (!m || !m.s1Id || seen.has(m.s1Id)) { skipped++; continue; }
      seen.add(m.s1Id);
      const s1Data = { ...Object.fromEntries(def.fields.map((f, i) => [f, raw[i] ?? ""])), ...(m.s1Extra ?? {}) };
      const prev = byS1.get(m.s1Id);
      if (prev) {
        if (prev.s1Name !== m.name || JSON.stringify(prev.s1Data) !== JSON.stringify(s1Data)) updates.push({ id: prev.id, data: { s1Name: m.name, s1Data, s1SyncedAt: now, s1Missing: false } });
        continue;
      }
      const extra: Record<string, unknown> = { ...(m.extra ?? {}) };
      let code = m.code;
      if (codes.has(code)) code = `${code}-${m.s1Id}`;
      codes.add(code);
      if (def.kind === "brand") { let slug = String(extra.slug); if (slugs.has(slug)) slug = `${slug}-${m.s1Id}`; slugs.add(slug); extra.slug = slug; }
      if (def.kind === "postalCode" && districts) { const dist = districts.get(String((m.s1Extra as { districtS1?: string } | undefined)?.districtS1 ?? "")); if (dist) extra.districtId = dist; }
      creates.push({ code, name: m.name, active: m.active, s1Id: m.s1Id, ...extra, s1Name: m.name, s1Data, s1SyncedAt: now, s1Missing: false });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dd = (db as any)[def.model] as { createMany: (a: unknown) => Promise<{ count: number }> };
    let created = 0;
    for (let i = 0; i < creates.length; i += 500) created += (await dd.createMany({ data: creates.slice(i, i + 500), skipDuplicates: true })).count;
    for (let i = 0; i < updates.length; i += 25) await Promise.all(updates.slice(i, i + 25).map((u) => d.update({ where: { id: u.id }, data: u.data })));
    if (seen.size) await d.updateMany({ where: { s1Id: { in: [...seen] }, s1SyncedAt: { lt: now } }, data: { s1SyncedAt: now, s1Missing: false } });
    const missingRes = (await d.updateMany({ where: { s1Id: { not: null, notIn: [...seen] }, s1Missing: false }, data: { s1Missing: true } })) as { count: number };
    const ms = Date.now() - t0;
    await db.s1SyncRun.update({ where: { id: run.id }, data: { ok: true, fetched: rows.length, created, updated: updates.length, missing: missingRes.count, skipped, ms } });
    return { ok: true as const, kind, fetched: rows.length, created, updated: updates.length, missing: missingRes.count, skipped, ms };
  } catch (e) {
    const error = friendlyError(e);
    await db.s1SyncRun.update({ where: { id: run.id }, data: { ok: false, error, ms: Date.now() - t0 } });
    return { ok: false as const, kind, error };
  }
}

export async function syncAllLookups(trigger: "manual" | "cron" | "script" = "cron") {
  const out = [];
  for (const def of LOOKUPS) out.push(await syncLookup(def.kind, trigger));
  return out;
}

/** Overview numbers for the admin: rows, linked to S1, missing in S1, last run. */
export async function lookupStats() {
  return Promise.all(LOOKUPS.map(async (def) => {
    const d = delegate(def.model);
    const [total, linked, missing, active, last] = await Promise.all([d.count(), d.count({ where: { s1Id: { not: null } } }), d.count({ where: { s1Missing: true } }), d.count({ where: { active: true } }), db.s1SyncRun.findFirst({ where: { kind: def.kind }, orderBy: { at: "desc" } })]);
    return { kind: def.kind, label: def.plural, description: def.description, table: def.table, total, linked, missing, active, last };
  }));
}

const PAGE = 50;

/** One page of our rows, filtered server-side (code, name, SoftOne name/id). */
export async function lookupRows(kind: string, opts: { q?: string; page?: number; missing?: boolean } = {}) {
  const def = lookupByKind(kind);
  if (!def) return { rows: [], total: 0, page: 1, pages: 1 };
  const d = delegate(def.model);
  const q = (opts.q ?? "").trim();
  const page = Math.max(1, opts.page ?? 1);
  const where: Record<string, unknown> = {};
  if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, { s1Name: { contains: q, mode: "insensitive" } }, { s1Id: q }];
  if (opts.missing) where.s1Missing = true;
  const [total, rows] = await Promise.all([
    d.count({ where }),
    d.findMany({ where, orderBy: [{ active: "desc" }, { name: "asc" }], skip: (page - 1) * PAGE, take: PAGE, ...(def.kind === "postalCode" ? { include: { district: { select: { name: true } } } } : {}) }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE)) };
}

/** Admin edit of our columns (never the s1* mirror). */
export async function updateLookupRow(kind: string, id: string, patch: Record<string, unknown>) {
  const def = lookupByKind(kind);
  if (!def) throw new Error("unknown lookup");
  const allowed = new Set(["code", "name", "active", ...def.editable.map((f) => f.key)]);
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!allowed.has(k)) continue;
    const f = def.editable.find((x) => x.key === k);
    if (f?.type === "number") data[k] = v === "" || v == null ? null : Number(v);
    else if (f?.type === "boolean" || k === "active") data[k] = v === true || v === "true" || v === "on";
    else data[k] = v === "" ? null : v;
  }
  if (data.name === null) delete data.name;
  if (data.code === null) delete data.code;
  const d = delegate(def.model);
  // a single default per purpose (series) / one default VAT
  if (data.isDefault === true) {
    if (def.kind === "vat") await d.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    if (def.kind === "series") { const row = await d.findUnique({ where: { id } }); const purpose = (data.purpose as string | undefined) ?? (row?.purpose as string | null); if (purpose) await d.updateMany({ where: { purpose, isDefault: true }, data: { isDefault: false } }); }
  }
  return d.update({ where: { id }, data });
}

/** Create a row of ours that has no SoftOne counterpart (e.g. our own shipping method «ACS»). */
export async function createLookupRow(kind: string, input: { code: string; name: string } & Record<string, unknown>) {
  const def = lookupByKind(kind);
  if (!def) throw new Error("unknown lookup");
  const d = delegate(def.model);
  const data: Record<string, unknown> = { code: input.code.trim(), name: input.name.trim(), active: true };
  for (const f of def.editable) if (input[f.key] !== undefined && input[f.key] !== "") data[f.key] = f.type === "number" ? Number(input[f.key]) : f.type === "boolean" ? input[f.key] === true || input[f.key] === "on" : input[f.key];
  if (def.kind === "brand" && !data.slug) data.slug = slugify(String(data.name)) || data.code;
  return d.create({ data });
}
