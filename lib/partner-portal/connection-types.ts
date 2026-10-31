/**
 * Οι τρόποι σύνδεσης της Φάσης 1 όπως τους βλέπει το μέλος: περιγραφή, πεδία (με τους ίδιους ελέγχους που κάνει η
 * μηχανή, για άμεσο μήνυμα στο πεδίο) και τι θα χρειαστεί. Οι υπόλοιποι τύποι του συμβολαίου έρχονται αργότερα.
 * Κοινό για server και client — καμία εξάρτηση.
 */
export type FieldSpec = {
  key: string;
  label: string;
  help: string;
  /** config: αποθηκεύεται και εδώ · secret: μόνο στη μηχανή (κρυπτογραφημένο) */
  kind: "config" | "secret";
  input: "text" | "url" | "password" | "select";
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  pattern?: { re: string; message: string };
  autoComplete?: string;
  defaultValue?: string;
};

export type ConnType = "feed-url" | "manual" | "softone-ws" | "woocommerce";

export type ConnTypeInfo = {
  type: ConnType;
  title: string;
  blurb: string;
  /** για ποιον ταιριάζει */
  bestFor: string;
  /** τι χρειάζεται να έχει έτοιμο */
  needs: string[];
  effort: "λίγα λεπτά" | "10′ με τον τεχνικό σας" | "με τον τεχνικό σας";
  automatic: boolean;
  /** το άρθρο του οδηγού */
  guide: string;
  fields: FieldSpec[];
  /** αντιστοίχιση στηλών (feed/αρχείο) */
  columns: boolean;
};

export const CONN_TYPES: ConnTypeInfo[] = [
  {
    type: "softone-ws", title: "SoftOne (Web Services)", blurb: "Διαβάζουμε το απόθεμα ανά υποκατάστημα κατευθείαν από το SoftOne σας, μόνο ανάγνωση.",
    bestFor: "Όσους έχουν SoftOne (oncloud ή on-premise με web services)", needs: ["Serial ή διεύθυνση web services", "AppID", "Χρήστη web account με δικαίωμα ανάγνωσης ειδών", "Εταιρεία, υποκατάστημα, refid"],
    effort: "10′ με τον τεχνικό σας", automatic: true, guide: "softone", columns: false,
    fields: [
      { key: "url", label: "Serial ή διεύθυνση", help: "Το όνομα πριν το .oncloud.gr (π.χ. 01102358330113) ή η πλήρης διεύθυνση https://…/s1services.", kind: "config", input: "text", required: true, placeholder: "01102358330113", pattern: { re: "^(https://\\S+|[A-Za-z0-9-]{3,})$", message: "Γράψε το serial ή διεύθυνση που ξεκινά με https://" } },
      { key: "appId", label: "AppID", help: "Αριθμός που ορίζεται στο SoftOne → Web & Mobile → Web Services.", kind: "config", input: "text", required: true, placeholder: "1001", pattern: { re: "^\\d{3,6}$", message: "Το AppID είναι αριθμός 3–6 ψηφίων" } },
      { key: "company", label: "Εταιρεία (COMPANY)", help: "Ο κωδικός της εταιρείας στο SoftOne.", kind: "config", input: "text", required: true, placeholder: "1001", pattern: { re: "^\\d{1,6}$", message: "Αριθμός" } },
      { key: "branch", label: "Υποκατάστημα σύνδεσης (BRANCH)", help: "Το υποκατάστημα με το οποίο συνδέεται ο χρήστης· το απόθεμα διαβάζεται για όλα.", kind: "config", input: "text", required: true, placeholder: "1000", pattern: { re: "^\\d{1,6}$", message: "Αριθμός" } },
      { key: "module", label: "MODULE", help: "Συνήθως 0.", kind: "config", input: "text", defaultValue: "0", pattern: { re: "^\\d{1,4}$", message: "Αριθμός" } },
      { key: "refid", label: "REFID", help: "Ο κωδικός του χρήστη (REFID) του web account.", kind: "config", input: "text", required: true, placeholder: "15", pattern: { re: "^\\d{1,6}$", message: "Αριθμός" } },
      { key: "username", label: "Χρήστης web account", help: "Χρήστης μόνο με δικαίωμα ανάγνωσης.", kind: "secret", input: "text", required: true, autoComplete: "off" },
      { key: "password", label: "Κωδικός web account", help: "Φυλάσσεται κρυπτογραφημένος· δεν εμφανίζεται ξανά.", kind: "secret", input: "password", required: true, autoComplete: "new-password" },
    ],
  },
  {
    type: "woocommerce", title: "WooCommerce", blurb: "Διαβάζουμε το απόθεμα από το eshop σας μέσω του REST API, μόνο ανάγνωση.",
    bestFor: "Όσους έχουν eshop WooCommerce με ενημερωμένο απόθεμα", needs: ["Διεύθυνση του eshop (https)", "Κλειδί REST API μόνο για ανάγνωση (ck_ / cs_)"],
    effort: "λίγα λεπτά", automatic: true, guide: "woocommerce", columns: false,
    fields: [
      { key: "baseUrl", label: "Διεύθυνση eshop", help: "Η αρχική σελίδα, π.χ. https://shop.example.gr (χωρίς /wp-json).", kind: "config", input: "url", required: true, placeholder: "https://shop.example.gr", pattern: { re: "^https://[^\\s/]+\\.[^\\s]+$", message: "Η διεύθυνση πρέπει να ξεκινά με https://" } },
      { key: "consumerKey", label: "Consumer key", help: "WooCommerce → Ρυθμίσεις → Για προχωρημένους → REST API → Προσθήκη κλειδιού, δικαίωμα «Ανάγνωση».", kind: "secret", input: "text", required: true, placeholder: "ck_…", autoComplete: "off", pattern: { re: "^ck_[a-fA-F0-9]{20,64}$", message: "Το Consumer key ξεκινά με ck_ και ακολουθούν 40 χαρακτήρες" } },
      { key: "consumerSecret", label: "Consumer secret", help: "Εμφανίζεται μία φορά στο WooCommerce· φυλάσσεται κρυπτογραφημένο.", kind: "secret", input: "password", required: true, placeholder: "cs_…", autoComplete: "new-password", pattern: { re: "^cs_[a-fA-F0-9]{20,64}$", message: "Το Consumer secret ξεκινά με cs_" } },
    ],
  },
  {
    type: "feed-url", title: "Feed XML / Excel σε διεύθυνση", blurb: "Ένα αρχείο (XML, Excel, CSV ή JSON) σε σταθερή διεύθυνση που ενημερώνεται αυτόματα από το σύστημά σας.",
    bestFor: "Όσους βγάζουν ήδη feed για Skroutz/BestPrice ή export από το ERP", needs: ["Τη διεύθυνση του αρχείου", "Στοιχεία πρόσβασης, αν το αρχείο είναι προστατευμένο"],
    effort: "λίγα λεπτά", automatic: true, guide: "feed", columns: true,
    fields: [
      { key: "url", label: "Διεύθυνση αρχείου", help: "Η διεύθυνση που ανοίγει το αρχείο, π.χ. https://shop.gr/feeds/stock.xml.", kind: "config", input: "url", required: true, placeholder: "https://…/stock.xml", pattern: { re: "^https?://\\S+$", message: "Γράψε πλήρη διεύθυνση που ξεκινά με https://" } },
      { key: "format", label: "Μορφή", help: "Αν το αφήσεις «Αυτόματα», την αναγνωρίζουμε από το περιεχόμενο.", kind: "config", input: "select", defaultValue: "auto", options: [{ value: "auto", label: "Αυτόματα" }, { value: "xml", label: "XML" }, { value: "xlsx", label: "Excel (.xlsx)" }, { value: "csv", label: "CSV" }, { value: "json", label: "JSON" }] },
      { key: "encoding", label: "Κωδικοποίηση", help: "Για παλιά ελληνικά αρχεία μπορεί να χρειαστεί Windows-1253.", kind: "config", input: "select", defaultValue: "auto", options: [{ value: "auto", label: "Αυτόματα" }, { value: "utf8", label: "UTF-8" }, { value: "win1253", label: "Windows-1253" }, { value: "iso-8859-7", label: "ISO-8859-7" }] },
      { key: "username", label: "Χρήστης", help: "Μόνο αν το αρχείο ζητά όνομα χρήστη και κωδικό.", kind: "secret", input: "text", autoComplete: "off" },
      { key: "password", label: "Κωδικός", help: "Φυλάσσεται κρυπτογραφημένος.", kind: "secret", input: "password", autoComplete: "new-password" },
    ],
  },
  {
    type: "manual", title: "Ανέβασμα αρχείου", blurb: "Ανεβάζετε εσείς ένα Excel ή CSV με το απόθεμα όποτε θέλετε. Ο πιο γρήγορος τρόπος να ξεκινήσετε.",
    bestFor: "Όσους δεν έχουν ERP με web services ή θέλουν να ξεκινήσουν αμέσως", needs: ["Ένα Excel (.xlsx) ή CSV με κωδικό/EAN, ποσότητα και (αν έχετε πολλά) κατάστημα"],
    effort: "λίγα λεπτά", automatic: false, guide: "upload", columns: true, fields: [],
  },
];

export const connTypeInfo = (t: string) => CONN_TYPES.find((c) => c.type === t);

/** Έλεγχος πεδίων όπως στο UI· επιστρέφει μηνύματα ανά πεδίο. */
export function validateFields(type: ConnType, values: Record<string, string>, opts: { secretsSet?: string[] } = {}) {
  const info = connTypeInfo(type);
  const errors: Record<string, string> = {};
  for (const f of info?.fields ?? []) {
    const v = (values[f.key] ?? "").trim();
    const kept = f.kind === "secret" && opts.secretsSet?.includes(f.key);
    if (!v) { if (f.required && !kept) errors[f.key] = "Υποχρεωτικό πεδίο"; continue; }
    if (f.pattern && !new RegExp(f.pattern.re).test(v)) errors[f.key] = f.pattern.message;
  }
  if (type === "feed-url" && !!values.username !== !!values.password && !opts.secretsSet?.length) errors.password = "Δώσε και χρήστη και κωδικό, ή κανένα";
  return errors;
}

// ---------- Αντιστοίχιση στηλών ----------

export const MAP_FIELDS = [
  { key: "sku", label: "Κωδικός είδους", help: "Ο κωδικός σας για το προϊόν. Χρειάζεται αυτός ή το EAN.", group: "id" },
  { key: "ean", label: "EAN / Barcode", help: "Το barcode (8 ή 13 ψηφία). Με αυτό βρίσκουμε το προϊόν στον κατάλογο πιο σίγουρα.", group: "id" },
  { key: "qty", label: "Ποσότητα", help: "Το διαθέσιμο απόθεμα — αριθμός. Υποχρεωτικό.", group: "required" },
  { key: "location", label: "Κατάστημα / αποθήκη", help: "Αν το αρχείο έχει απόθεμα για πολλά καταστήματα. Χωρίς αυτό: ενιαίο απόθεμα.", group: "optional" },
  { key: "mpn", label: "Κωδικός κατασκευαστή", help: "Βοηθά στην αντιστοίχιση όταν λείπει το EAN.", group: "optional" },
  { key: "brand", label: "Μάρκα", help: "Βοηθά στην αντιστοίχιση.", group: "optional" },
  { key: "title", label: "Περιγραφή", help: "Μόνο για να αναγνωρίζετε το είδος στους ελέγχους.", group: "optional" },
] as const;
export type MapField = (typeof MAP_FIELDS)[number]["key"];
export type FieldMapping = Partial<Record<MapField, string>>;

/** Ακριβώς ο κανόνας της μηχανής (b2buronics lib/feed/parse toQty) — ό,τι δείχνει η προεπισκόπηση το δέχεται και η μηχανή. */
export function toQty(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const s = v.trim().toLowerCase();
  if (/^(in ?stock|instock|yes|ναι|διαθέσιμο|διαθεσιμο|true)$/.test(s)) return 1;
  if (/^(out ?of ?stock|outofstock|no|όχι|οχι|μη διαθέσιμο|false)$/.test(s)) return 0;
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export type MappingCheck = { key: string; ok: boolean; level: "error" | "warn" | "info"; message: string };

/** Οι έλεγχοι της οθόνης αντιστοίχισης (ζωντανά, σε κάθε αλλαγή). */
export function checkMapping(map: FieldMapping, columns: string[], rows: Record<string, string>[]): MappingCheck[] {
  const out: MappingCheck[] = [];
  const has = (k: MapField) => !!map[k] && columns.includes(map[k]!);
  out.push({ key: "id", ok: has("sku") || has("ean"), level: "error", message: has("sku") || has("ean") ? "Υπάρχει στήλη για κωδικό ή EAN" : "Διάλεξε στήλη για κωδικό είδους ή EAN" });
  out.push({ key: "qty", ok: has("qty"), level: "error", message: has("qty") ? "Υπάρχει στήλη ποσότητας" : "Διάλεξε τη στήλη με την ποσότητα" });
  const used = Object.entries(map).filter(([, c]) => c);
  const dup = used.filter(([, c], i) => used.findIndex(([, c2]) => c2 === c) !== i);
  out.push({ key: "dup", ok: !dup.length, level: "warn", message: dup.length ? `Η στήλη «${dup[0][1]}» χρησιμοποιείται για δύο πεδία` : "Κάθε στήλη σε ένα πεδίο" });
  if (has("qty") && rows.length) {
    const bad = rows.filter((r) => toQty(r[map.qty!]) === null).length;
    out.push({ key: "qty-num", ok: bad === 0, level: bad === rows.length ? "error" : "warn", message: bad ? `${bad} από ${rows.length} γραμμές του δείγματος δεν ${bad === 1 ? "έχει" : "έχουν"} αριθμό στην ποσότητα` : "Οι ποσότητες του δείγματος είναι αριθμοί" });
  }
  if (has("ean") && rows.length) {
    const bad = rows.filter((r) => r[map.ean!] && !/^\d{8}$|^\d{12,14}$/.test(r[map.ean!].trim())).length;
    out.push({ key: "ean-fmt", ok: bad === 0, level: "warn", message: bad ? `${bad} τιμές EAN δεν έχουν 8 ή 13 ψηφία — μήπως είναι άλλη στήλη;` : "Τα EAN του δείγματος έχουν σωστή μορφή" });
  }
  if ((has("sku") || has("ean")) && rows.length) {
    const ids = rows.map((r) => (map.sku && r[map.sku]) || (map.ean && r[map.ean]) || "");
    const empty = ids.filter((x) => !x).length;
    if (empty) out.push({ key: "id-empty", ok: false, level: "warn", message: `${empty} ${empty === 1 ? "γραμμή" : "γραμμές"} χωρίς κωδικό — θα ${empty === 1 ? "αγνοηθεί" : "αγνοηθούν"}` });
  }
  out.push({ key: "location", ok: true, level: "info", message: has("location") ? "Απόθεμα ανά κατάστημα από τη στήλη «" + map.location + "»" : "Χωρίς στήλη καταστήματος: το απόθεμα θα θεωρηθεί ενιαίο" });
  return out;
}

/** Ό,τι θα δεχτεί η μηχανή από τις γραμμές του δείγματος με αυτή την αντιστοίχιση. */
export function applyMapping(map: FieldMapping, rows: Record<string, string>[]) {
  return rows.map((r) => {
    const sku = (map.sku && r[map.sku]) || (map.ean && r[map.ean]) || "";
    const qty = toQty(map.qty ? r[map.qty] : undefined);
    return { sku, ean: map.ean ? r[map.ean] ?? "" : "", title: map.title ? r[map.title] ?? "" : "", location: map.location ? r[map.location] ?? "" : "default", qty, ok: !!sku && qty !== null };
  });
}

// ---------- Αντιστοίχιση τοποθεσιών ----------

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9α-ω]+/g, " ").trim();

/** Πρόταση καταστήματος για μια αποθήκη τους: ίδιος κωδικός υποκαταστήματος SoftOne, ή κοινές λέξεις στο όνομα/πόλη. */
export function suggestStore(ref: string, name: string, stores: { id: string; name: string; city: string; s1BranchId: number | null; code: string | null }[]) {
  const r = norm(ref), n = norm(name);
  const byCode = stores.find((s) => (s.s1BranchId !== null && String(s.s1BranchId) === ref.trim()) || (s.code && norm(s.code) === r));
  if (byCode) return { storeId: byCode.id, why: "ίδιος κωδικός υποκαταστήματος" };
  let best: { id: string; score: number } | null = null;
  for (const s of stores) {
    const words = new Set(norm(`${s.name} ${s.city}`).split(" ").filter((w) => w.length > 2));
    const score = `${r} ${n}`.split(" ").filter((w) => w.length > 2 && words.has(w)).length;
    if (score && (!best || score > best.score)) best = { id: s.id, score };
  }
  if (best) return { storeId: best.id, why: "ταιριάζει το όνομα ή η πόλη" };
  if (stores.length === 1) return { storeId: stores[0].id, why: "το μόνο σας κατάστημα" };
  return null;
}
