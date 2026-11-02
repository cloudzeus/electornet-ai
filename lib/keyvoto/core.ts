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

/** Το έγγραφο σε ζεύγη `διαδρομή → κείμενο`. Κενά (null, undefined, άδειο αντικείμενο/πίνακας) παραλείπονται. */
export function flattenDocument(doc: Json, prefix = ""): [string, string][] {
  const out: [string, string][] = [];
  if (doc == null) return out;
  if (Array.isArray(doc)) {
    doc.forEach((v, i) => out.push(...flattenDocument(v, `${prefix}[${i}]`)));
    return out;
  }
  if (typeof doc === "object") {
    for (const [k, v] of Object.entries(doc as Record<string, Json>)) out.push(...flattenDocument(v, prefix ? `${prefix}.${k}` : k));
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
