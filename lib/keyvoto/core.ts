/**
 * **Keyvoto PIM — καθαρή λογική** (χωρίς δίκτυο, βάση ή ρυθμίσεις).
 *
 * Το Keyvoto είναι η πλατφόρμα περιεχομένου των προμηθευτών: εμείς είμαστε ο «retailer» που διαβάζει το `sharedContent`
 * των καταλόγων στους οποίους μας έχουν γράψει. Η σύνδεση είναι OAuth 2.0 client credentials (machine-to-machine):
 * ένα αίτημα για token, μετά `Authorization: Bearer <token>` σε κάθε κλήση· χωρίς refresh token — όταν λήξει, ζητάμε νέο.
 *
 * Το κάθε προϊόν έρχεται ως **ελεύθερο JSON έγγραφο** (`document`), διαφορετικό ανά εκδότη και κατηγορία. Για να μπορεί
 * να αντιστοιχιστεί όπως ένα XML feed, το «ισιώνουμε» σε ζεύγη διαδρομή → τιμή (`flattenDocument`) και μαζεύουμε τις
 * διαδρομές όλων των προϊόντων σε πεδία με κάλυψη και δείγματα (`documentFields`) — αυτά είναι οι «στήλες» του.
 */

export interface TokenInput {
  grantType: string;
  clientId: string;
  clientSecret: string;
  scope: string;
}

/** Το σώμα του αιτήματος token (application/x-www-form-urlencoded). Κενά πεδία δεν στέλνονται. */
export function tokenForm(i: TokenInput): string {
  const p = new URLSearchParams();
  for (const [k, v] of [["grant_type", i.grantType], ["client_id", i.clientId], ["client_secret", i.clientSecret], ["scope", i.scope]]) {
    if (v?.trim()) p.set(k, v.trim());
  }
  return p.toString();
}

/** Πότε θεωρούμε ληγμένο το token: ένα λεπτό πριν από την ώρα του server, και ποτέ λιγότερο από ένα λεπτό ζωής. */
export function tokenExpiry(now: Date, expiresIn: number): Date {
  const live = Math.max(60, (Number.isFinite(expiresIn) ? expiresIn : 0) - 60);
  return new Date(now.getTime() + live * 1000);
}

export interface SharedContentQuery {
  page?: number;
  pageSize?: number;
  includeDocument?: boolean;
  contentTypes?: string[];
  contentIds?: string[];
  gtinCodes?: string[];
  publishers?: string[];
  catalogues?: string[];
  categories?: string[];
  statuses?: string[];
  languages?: string[];
  /** «πραγματική» αλλαγή στα δεδομένα, όχι απλή αναδημοσίευση (effectiveUpdatedAfter) */
  updatedAfter?: string;
  searchValue?: string;
}

/**
 * Το query του `GET /v1.1-alpha/{businessAccountId}/sharedContent`. Το `includeDocument` μπαίνει πάντα ρητά: χωρίς αυτό
 * γυρίζει μόνο η σύνοψη, χωρίς την προϊοντική πληροφορία.
 */
export function sharedContentQuery(q: SharedContentQuery = {}): string {
  const p = new URLSearchParams();
  p.set("includeDocument", String(q.includeDocument !== false));
  p.set("page", String(q.page && q.page > 0 ? q.page : 1));
  if (q.pageSize && q.pageSize > 0) p.set("pageSize", String(q.pageSize));
  const list: [string, string[] | undefined][] = [
    ["publishers", q.publishers], ["catalogues", q.catalogues], ["contentIds", q.contentIds], ["contentTypes", q.contentTypes],
    ["gtinCodes", q.gtinCodes], ["categories", q.categories], ["statuses", q.statuses], ["languages", q.languages],
  ];
  for (const [k, v] of list) { const vals = (v ?? []).map((x) => x.trim()).filter(Boolean); if (vals.length) p.set(k, vals.join(",")); }
  if (q.updatedAfter?.trim()) p.set("effectiveUpdatedAfter", q.updatedAfter.trim());
  if (q.searchValue?.trim()) p.set("searchValue", q.searchValue.trim());
  return p.toString();
}

type Json = unknown;

/**
 * Το `languages` ενός πολύγλωσσου πεδίου: `{languages:["el-GR","en-GB"], "el-GR":"κείμενο"}`. Το αναγνωρίζουμε από το
 * ότι **κάποια** τιμή του είναι και κλειδί του ίδιου αντικειμένου — «κάποια» και όχι «κάθε», γιατί συχνά δηλώνονται
 * γλώσσες που δεν έχουν ακόμη μετάφραση. Αλλιώς είναι κανονικό πεδίο του προμηθευτή και μένει.
 */
const isLanguageList = (o: Record<string, Json>, v: Json): boolean =>
  Array.isArray(v) && v.some((x) => typeof x === "string" && x in o);

/** Το έγγραφο σε ζεύγη `διαδρομή → κείμενο`. Κενά (null, undefined, άδειο αντικείμενο/πίνακας) παραλείπονται. */
export function flattenDocument(doc: Json, prefix = ""): [string, string][] {
  const out: [string, string][] = [];
  if (doc == null) return out;
  if (Array.isArray(doc)) {
    doc.forEach((v, i) => out.push(...flattenDocument(v, `${prefix}[${i}]`)));
    return out;
  }
  if (typeof doc === "object") {
    const o = doc as Record<string, Json>;
    for (const [k, v] of Object.entries(o)) {
      if (k === "languages" && isLanguageList(o, v)) continue; // μεταδεδομένο μετάφρασης, όχι περιεχόμενο
      out.push(...flattenDocument(v, prefix ? `${prefix}.${k}` : k));
    }
    return out;
  }
  const s = String(doc);
  if (s !== "") out.push([prefix, s]);
  return out;
}

export interface DocField {
  /** η διαδρομή χωρίς δείκτες πίνακα: `images[].path` */
  path: string;
  /** σε πόσα προϊόντα του δείγματος υπάρχει */
  n: number;
  samples: string[];
}

const SAMPLES = 3;
const noIndex = (p: string) => p.replace(/\[\d+\]/g, "[]");

/**
 * Τα πεδία ενός δείγματος προϊόντων, με τη σειρά που πρωτοεμφανίζονται: πόσα προϊόντα τα έχουν και έως τρία δείγματα
 * τιμών. Είναι η είσοδος της αντιστοίχισης — ό,τι είναι για ένα XML feed οι στήλες του.
 */
export function documentFields(docs: Json[]): DocField[] {
  const map = new Map<string, DocField>();
  for (const doc of docs) {
    const seen = new Set<string>();
    for (const [path, value] of flattenDocument(doc)) {
      const key = noIndex(path);
      const f = map.get(key) ?? { path: key, n: 0, samples: [] };
      if (!seen.has(key)) { f.n++; seen.add(key); }
      if (f.samples.length < SAMPLES && !f.samples.includes(value)) f.samples.push(value);
      map.set(key, f);
    }
  }
  return [...map.values()].sort((a, b) => b.n - a.n);
}

/** Ένωση βάσης και διαδρομής χωρίς διπλές καθέτους. */
export const apiUrl = (base: string, path: string) => `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

/**
 * Οι εκδότες και οι κατάλογοί τους, όπως τους γυρίζει το Keyvoto, σε επιλογές για τα μενού του οδηγού.
 *
 * Το κλειδί και στα δύο είναι το **`id`** (π.χ. `BusinessAccount-4b69…`, `CatalogueV2-9bc8…`) — επαληθευμένο με
 * πραγματική απάντηση. Ό,τι δεν έχει `id` το πετάμε: μια επιλογή με κενή τιμή δείχνει να «μη διαλέγεται» και η πηγή
 * δεν σώζεται ποτέ.
 */
/** Το Keyvoto στέλνει και άλλα πεδία (image, email, version, publishedAt…) — κρατάμε μόνο όσα χρησιμοποιούμε. */
export interface KeyvotoPublisher { id?: string; title?: string; [k: string]: unknown }
export interface KeyvotoCatalogue { id?: string; name?: string; publisher?: string; products?: number; isDeleted?: boolean; [k: string]: unknown }

export const publisherOptions = (rows: KeyvotoPublisher[] | null | undefined): { id: string; title: string }[] =>
  (rows ?? [])
    .map((x) => ({ id: String(x.id ?? "").trim(), title: String(x.title ?? "").trim() }))
    .filter((x) => x.id)
    .map((x) => ({ id: x.id, title: x.title || x.id }));

export const catalogueOptions = (rows: KeyvotoCatalogue[] | null | undefined): { id: string; name: string; publisher: string; products: number }[] =>
  (rows ?? [])
    .filter((x) => !x.isDeleted)
    .map((x) => ({ id: String(x.id ?? "").trim(), name: String(x.name ?? "").trim(), publisher: String(x.publisher ?? "").trim(), products: Number(x.products ?? 0) || 0 }))
    .filter((x) => x.id)
    .map((x) => ({ ...x, name: x.name || x.id }));

/** Η gallery του Keyvoto, όταν οι ρυθμίσεις δεν λένε άλλη. */
export const KEYVOTO_GALLERY = "https://gallery-api.keyvoto.com";

/**
 * Η πραγματική διεύθυνση ενός αρχείου της gallery από το `path` του.
 *
 * Το έγγραφο δεν δίνει διευθύνσεις: δίνει διαδρομές σαν `BusinessAccount-4b69…/01_Sera_white-6a97….png`. Δύο
 * λεπτομέρειες, και οι δύο δοκιμασμένες ζωντανά, αλλιώς γυρίζει 404:
 * 1. το endpoint είναι **`/v1/files/`** (όχι v2, όπως δείχνει ο κατάλογος του core API),
 * 2. ΟΛΗ η διαδρομή είναι **ένα** τμήμα — η κάθετος πρέπει να γίνει `%2F`.
 * Δεν θέλει token: το αρχείο σερβίρεται δημόσια, οπότε η διεύθυνση δουλεύει και σε `<img>` και στο κατέβασμα.
 */
export function galleryFileUrl(base: string, path: string, width?: number): string {
  const p = (path ?? "").trim();
  if (!p) return "";
  if (/^https?:\/\//i.test(p)) return p;
  const q = width && width > 0 ? `?width=${Math.round(width)}` : "";
  return `${apiUrl(base || KEYVOTO_GALLERY, `/v1/files/${encodeURIComponent(p)}`)}${q}`;
}

/**
 * Η κύρια φωτογραφία ενός προϊόντος: αυτή που ο εκδότης έχει σημάνει «Hero Image», αλλιώς η πρώτη εικόνα του.
 * (Το `image` της σύνοψης ΔΕΝ είναι φωτογραφία προϊόντος — είναι το λογότυπο του εκδότη.)
 */
export function heroImagePath(doc: unknown): string {
  const pairs = flattenDocument(doc as Json);
  const idx = (p: string) => Number(p.match(/images\[(\d+)\]/)?.[1] ?? -1);
  const paths = pairs.filter(([k]) => /(^|\.)images\[\d+\]\.path$/.test(k));
  if (!paths.length) return "";
  const hero = pairs.find(([k, v]) => /(^|\.)images\[\d+\]\.viewAttributes\[\d+\]$/.test(k) && /hero/i.test(v));
  if (hero) {
    const at = idx(hero[0]);
    const match = paths.find(([k]) => idx(k) === at);
    if (match) return match[1];
  }
  return paths[0][1];
}

/** Ο διαχωριστής της ιεραρχίας — ο ίδιος που χρησιμοποιεί ο οδηγός για τις κατηγορίες ενός XML. */
export const CATEGORY_SEP = " › ";

/**
 * Μια κατηγορία του Keyvoto, όπως τη γυρίζει το API κατηγοριών. Το `path` είναι οι **γονείς** της, κωδικοί χωρισμένοι
 * με κόμμα (`,root,mid,`), και οι ονομασίες είναι πολύγλωσσες.
 */
export interface KeyvotoCategory {
  id?: string;
  path?: string;
  translations?: Record<string, { name?: string } | undefined>;
}

/** Η ονομασία σε όποια γλώσσα ζητήθηκε: ακριβές ταίριασμα, μετά «el» ≈ «el-GR», μετά ό,τι υπάρχει. */
export function categoryName(row: KeyvotoCategory, lang = "el"): string {
  const t = row.translations ?? {};
  const base = (s: string) => s.toLowerCase().split("-")[0];
  const keys = Object.keys(t);
  const pick = keys.find((k) => k.toLowerCase() === lang.toLowerCase())
    ?? keys.find((k) => base(k) === base(lang))
    ?? keys.find((k) => base(k) === "el")
    ?? keys[0];
  return (pick ? t[pick]?.name ?? "" : "").trim();
}

/**
 * Κωδικός κατηγορίας → πλήρης διαδρομή με ονομασίες («Ηλεκτρικά Είδη › Ψυγεία › Καταψύκτες»).
 *
 * Γιατί διαδρομή και όχι σκέτη ονομασία: το ίδιο φύλλο («Καταψύκτες») μπορεί να κρέμεται αλλού, και ο οδηγός
 * αντιστοιχίζει ήδη κατηγορίες με αυτή τη μορφή. Γονέας που λείπει απλώς παραλείπεται — ποτέ κωδικός στην οθόνη.
 */
export function categoryPaths(rows: KeyvotoCategory[] | null | undefined, lang = "el"): Record<string, string> {
  const byId = new Map<string, KeyvotoCategory>();
  for (const r of rows ?? []) if (r?.id) byId.set(String(r.id), r);
  const out: Record<string, string> = {};
  for (const [id, row] of byId) {
    const chain = [...String(row.path ?? "").split(",").filter(Boolean), id];
    const names = chain.map((x) => (byId.has(x) ? categoryName(byId.get(x)!, lang) : "")).filter(Boolean);
    if (names.length) out[id] = names.join(CATEGORY_SEP);
  }
  return out;
}

/**
 * Οι γλώσσες που ζητάμε από το `sharedContent`, από τη ρύθμιση.
 *
 * **Προσοχή — παγίδα που κόστισε όλα τα ονόματα:** το Keyvoto θέλει πλήρη ετικέτα (`el-GR`). Με σκέτο `el` απαντά
 * κανονικά, αλλά κάθε πολύγλωσσο πεδίο γυρίζει **άδειο** (`{"languages":["el-GR"]}` χωρίς κείμενο) — δηλαδή χάνονται
 * σιωπηλά ονόματα και περιγραφές. Γι' αυτό κρατάμε μόνο σωστές ετικέτες· ό,τι άλλο το αγνοούμε, που σημαίνει
 * «φέρε ό,τι έχει ο εκδότης» — πάντα ασφαλέστερο από το να γυρίσουμε με άδεια χέρια.
 */
export const languageTags = (setting: string): string[] =>
  (setting ?? "").split(",").map((x) => x.trim()).filter((x) => /^[a-z]{2,3}-[A-Za-z0-9]{2,8}$/.test(x));
