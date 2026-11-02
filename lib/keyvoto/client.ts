import "server-only";
import { getSetting } from "@/lib/settings/store";
import { apiUrl, galleryFileUrl, KEYVOTO_GALLERY, publisherOptions, sharedContentQuery, tokenExpiry, tokenForm, type KeyvotoCatalogue, type KeyvotoPublisher, type SharedContentQuery } from "@/lib/keyvoto/core";

/**
 * **Keyvoto PIM — η σύνδεση.** Μόνο αναγνώσεις: ζητάμε token (OAuth 2.0 client credentials) και διαβάζουμε το
 * περιεχόμενο που μας μοιράζονται οι προμηθευτές. Το token κρατά ~μία ημέρα και μένει στη μνήμη της διεργασίας· δεν
 * υπάρχει refresh token, οπότε όταν λήξει ζητάμε νέο. Τα στοιχεία έρχονται από τις Ρυθμίσεις → Keyvoto PIM.
 */

export interface KeyvotoConfig {
  enabled: boolean;
  businessAccountId: string;
  grantType: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  tokenUrl: string;
  apiBase: string;
  galleryBase: string;
  categoriesBase: string;
  languages: string;
  pageSize: number;
}

const DEFAULTS = {
  grantType: "client_credentials",
  scope: "keyvoto-core-services",
  tokenUrl: "https://noah.keyvoto.com/pauth/connect/token",
  apiBase: "https://core-api.keyvoto.com",
  galleryBase: KEYVOTO_GALLERY,
  categoriesBase: "https://categories-api.keyvoto.com",
  pageSize: 100,
};

const TIMEOUT_MS = 30_000;
/** Ο λογαριασμός των κοινών ορισμών κατηγοριών στο Categories API είναι πάντα αυτός, όχι ο δικός μας. */
export const CATEGORIES_ACCOUNT = "keyvoto";

export async function getKeyvotoConfig(): Promise<KeyvotoConfig | null> {
  const { data, secrets } = await getSetting("keyvoto");
  const str = (k: string, d = "") => String(data[k] ?? "").trim() || d;
  const clientId = str("clientId"), clientSecret = (secrets.clientSecret ?? "").trim();
  if (!clientId || !clientSecret) return null;
  return {
    enabled: data.enabled === true,
    businessAccountId: str("businessAccountId"),
    grantType: str("grantType", DEFAULTS.grantType),
    clientId, clientSecret,
    scope: str("scope", DEFAULTS.scope),
    tokenUrl: str("tokenUrl", DEFAULTS.tokenUrl),
    apiBase: str("apiBase", DEFAULTS.apiBase),
    galleryBase: str("galleryBase", DEFAULTS.galleryBase),
    categoriesBase: str("categoriesBase", DEFAULTS.categoriesBase),
    languages: str("languages"),
    pageSize: Number(data.pageSize) > 0 ? Number(data.pageSize) : DEFAULTS.pageSize,
  };
}

/** Συμπληρώνει τις προεπιλογές σε ό,τι δόθηκε (π.χ. τα πεδία της φόρμας στη «Δοκιμή σύνδεσης»). */
export const withDefaults = (c: Partial<KeyvotoConfig>): KeyvotoConfig => ({
  enabled: c.enabled ?? true,
  businessAccountId: (c.businessAccountId ?? "").trim(),
  grantType: (c.grantType ?? "").trim() || DEFAULTS.grantType,
  clientId: (c.clientId ?? "").trim(),
  clientSecret: (c.clientSecret ?? "").trim(),
  scope: (c.scope ?? "").trim() || DEFAULTS.scope,
  tokenUrl: (c.tokenUrl ?? "").trim() || DEFAULTS.tokenUrl,
  apiBase: (c.apiBase ?? "").trim() || DEFAULTS.apiBase,
  galleryBase: (c.galleryBase ?? "").trim() || DEFAULTS.galleryBase,
  categoriesBase: (c.categoriesBase ?? "").trim() || DEFAULTS.categoriesBase,
  languages: (c.languages ?? "").trim(),
  pageSize: c.pageSize && c.pageSize > 0 ? c.pageSize : DEFAULTS.pageSize,
});

// ---------- token ----------

const tokens = new Map<string, { token: string; exp: Date }>();
const keyOf = (c: KeyvotoConfig) => `${c.tokenUrl}|${c.clientId}|${c.scope}`;

export class KeyvotoError extends Error {
  constructor(message: string, readonly status?: number) { super(message); this.name = "KeyvotoError"; }
}

/** Φιλικό μήνυμα: ο χρήστης της διαχείρισης δεν διαβάζει HTTP κωδικούς. */
export function friendlyKeyvoto(status: number, body: string): string {
  if (status === 400 || status === 401) return "Τα στοιχεία δεν έγιναν δεκτά (client_id / client_secret / scope). Έλεγξέ τα με την Keyvoto.";
  if (status === 403) return "Ο λογαριασμός δεν έχει δικαίωμα σε αυτό το αίτημα — ζήτησε πρόσβαση από την Keyvoto.";
  if (status === 404) return "Η διεύθυνση δεν βρέθηκε — έλεγξε το Business Account Id και τις διευθύνσεις του API.";
  if (status === 429) return "Πάρα πολλά αιτήματα προς το Keyvoto — δοκίμασε σε λίγο.";
  if (status >= 500) return "Το Keyvoto απάντησε με σφάλμα διακομιστή — δοκίμασε ξανά σε λίγο.";
  return `Το Keyvoto απάντησε ${status}${body ? `: ${body.slice(0, 200)}` : ""}`;
}

export async function getToken(c: KeyvotoConfig, force = false): Promise<string> {
  const key = keyOf(c);
  const kept = tokens.get(key);
  if (!force && kept && kept.exp > new Date()) return kept.token;
  const res = await fetch(c.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: tokenForm(c),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((e: Error) => { throw new KeyvotoError(`Δεν έγινε σύνδεση με τη διεύθυνση token: ${e.message}`); });
  const text = await res.text();
  if (!res.ok) throw new KeyvotoError(friendlyKeyvoto(res.status, text), res.status);
  let json: { access_token?: string; expires_in?: number; token_type?: string };
  try { json = JSON.parse(text); } catch { throw new KeyvotoError("Η απάντηση του token δεν ήταν JSON."); }
  if (!json.access_token) throw new KeyvotoError("Η απάντηση δεν είχε access_token.");
  tokens.set(key, { token: json.access_token, exp: tokenExpiry(new Date(), Number(json.expires_in ?? 0)) });
  return json.access_token;
}

/** Πότε λήγει το token που κρατάμε (για τη σελίδα της διαχείρισης)· null = δεν έχουμε. */
export const tokenHeldUntil = (c: KeyvotoConfig): Date | null => tokens.get(keyOf(c))?.exp ?? null;

// ---------- κλήσεις ----------

async function kvFetch<T>(c: KeyvotoConfig, base: string, path: string, search = ""): Promise<T> {
  const url = apiUrl(base, path) + (search ? `?${search}` : "");
  const call = async (token: string) =>
    fetch(url, { headers: { Authorization: `Bearer ${token}`, accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) })
      .catch((e: Error) => { throw new KeyvotoError(`Δεν έγινε σύνδεση με το Keyvoto: ${e.message}`); });
  let res = await call(await getToken(c));
  // ληγμένο token που δεν το είχαμε καταλάβει: ένα νέο, μία φορά
  if (res.status === 401) res = await call(await getToken(c, true));
  const text = await res.text();
  if (!res.ok) throw new KeyvotoError(friendlyKeyvoto(res.status, text), res.status);
  try { return JSON.parse(text) as T; } catch { throw new KeyvotoError("Η απάντηση του Keyvoto δεν ήταν JSON."); }
}

export interface Paged<T> { totalResults?: number; totalPages?: number; page?: number; pageSize?: number; results?: T[] }
export interface Publication {
  id?: string; publisher?: string; catalogueId?: string; name?: string; image?: string;
  contentId?: string; contentType?: string; code?: string; productStatus?: string; category?: string;
  document?: unknown; documentUpdated?: string; publishedAt?: string;
}

const account = (c: KeyvotoConfig) => encodeURIComponent(c.businessAccountId);

export const publishers = (c: KeyvotoConfig, pageSize = 50) =>
  kvFetch<Paged<KeyvotoPublisher>>(c, c.apiBase, `/v1.1-alpha/${account(c)}/sharedContent/publishers`, `page=1&pageSize=${pageSize}`);

export const catalogues = (c: KeyvotoConfig, pageSize = 50) =>
  kvFetch<Paged<KeyvotoCatalogue>>(c, c.apiBase, `/v1.1-alpha/${account(c)}/sharedContent/catalogues`, `page=1&pageSize=${pageSize}`);

export const sharedContent = (c: KeyvotoConfig, q: SharedContentQuery = {}) =>
  kvFetch<Paged<Publication>>(c, c.apiBase, `/v1.1-alpha/${account(c)}/sharedContent`, sharedContentQuery({ pageSize: c.pageSize, languages: c.languages ? c.languages.split(",") : undefined, ...q }));

export const categorySchema = (c: KeyvotoConfig, categoryId: string) =>
  kvFetch<unknown>(c, c.categoriesBase, `/v1/${CATEGORIES_ACCOUNT}/schemas/categories/${encodeURIComponent(categoryId)}`);

/** Η διεύθυνση ενός αρχείου της gallery από το `path` μιας εικόνας του προϊόντος. */
export const fileUrl = (c: KeyvotoConfig, path: string, width?: number) => galleryFileUrl(c.galleryBase, path, width);

export interface KeyvotoTest { ok: boolean; ms: number; message: string; publishers?: string[]; expiresAt?: string }

/** «Δοκιμή σύνδεσης»: token + οι εκδότες του λογαριασμού. Καμία εγγραφή, κανένα κατέβασμα προϊόντων. */
export async function testKeyvoto(input: Partial<KeyvotoConfig>): Promise<KeyvotoTest> {
  const c = withDefaults(input);
  const t0 = Date.now();
  if (!c.clientId || !c.clientSecret) return { ok: false, ms: 0, message: "Συμπλήρωσε client_id και client_secret." };
  if (!c.businessAccountId) return { ok: false, ms: 0, message: "Συμπλήρωσε το Business Account Id που σου έδωσε η Keyvoto." };
  try {
    await getToken(c, true);
    const p = await publishers(c, 20);
    const names = publisherOptions(p.results).map((x) => x.title);
    return {
      ok: true, ms: Date.now() - t0, publishers: names, expiresAt: tokenHeldUntil(c)?.toISOString(),
      message: names.length ? `Σύνδεση OK — ${p.totalResults ?? names.length} εκδότες μοιράζονται περιεχόμενο μαζί μας.` : "Σύνδεση OK — ο λογαριασμός δεν έχει ακόμη εκδότες με κοινό περιεχόμενο.",
    };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, message: e instanceof Error ? e.message : String(e) };
  }
}
