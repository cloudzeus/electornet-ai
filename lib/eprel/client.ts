import "server-only";

/**
 * EPREL — European Product Registry for Energy Labelling, δημόσιο API.
 *
 * Βάση `https://eprel.ec.europa.eu/api`, κλειδί στην κεφαλίδα `x-api-key`
 * (μεταβλητή EPREL_API_KEY). Ό,τι ξέρουμε το επιβεβαιώσαμε με πραγματικές
 * κλήσεις, όχι από την τεκμηρίωση (θέλει EU Login):
 *
 * - GET /product-groups                         δημόσιο· [{code, name, url_code, regulation}]
 * - GET /products/{url_code}?_page&_limit&…     αναζήτηση μέσα σε ομάδα· {size, offset, hits[]}
 *       φίλτρα = ονόματα πεδίων (modelIdentifier, supplierOrTrademark, energyClass…),
 *       το `*` λειτουργεί ως μπαλαντέρ, ταξινόμηση sort0=πεδίο&order0=ASC|DESC
 * - GET /product/{registrationNumber}           πλήρης εγγραφή (τα πεδία διαφέρουν ανά ομάδα)
 * - GET /product/{reg}/labels?format=SVG|PNG|PDF   301 → /labels/{group}/Label_{reg}.{ext}
 * - GET /product/{reg}/fiches?language=EL          301 → /fiches/{group}/Fiche_{reg}_EL.pdf
 * - GET /product/{reg}/nested-label                SVG με το μικρό βέλος της κλάσης
 *
 * Ετικέτες και δελτία σερβίρονται από τη ρίζα του host, δημόσια, χωρίς κλειδί.
 * Το κλειδί ΔΕΝ γράφεται ποτέ σε log ή σφάλμα.
 */
export const EPREL_BASE = "https://eprel.ec.europa.eu";
const API = `${EPREL_BASE}/api`;

export interface EprelGroupRaw { code: string; name: string; url_code: string; regulation?: string | null }
export interface EprelSearch<T = EprelRaw> { size: number; offset: number; hits: T[] }
/** Η εγγραφή όπως έρχεται — κοινά πεδία τυπωμένα, τα υπόλοιπα ελεύθερα. */
export interface EprelRaw {
  eprelRegistrationNumber: string;
  productGroup: string; // url_code
  implementingAct?: string | null;
  modelIdentifier: string;
  supplierOrTrademark: string;
  trademarkOwner?: string | null;
  organisation?: { organisationName?: string | null; organisationTitle?: string | null } | null;
  status?: string | null;
  energyClass?: string | null;
  energyClassRange?: string | null;
  energyClassImage?: string | null;
  energyEfficiencyIndex?: number | null;
  noise?: number | null;
  noiseClass?: string | null;
  dimensionWidth?: number | null;
  dimensionHeight?: number | null;
  dimensionDepth?: number | null;
  guaranteeDuration?: number | null;
  guranteeDuration?: number | null; // sic — έτσι το γράφει το EPREL στα στεγνωτήρια 2023
  repairabilityClass?: string | null;
  repairabilityIndex?: number | null;
  webLinkSupplier?: string | null;
  webLinkManufacturer?: string | null;
  onMarketStartDateTS?: number | null;
  onMarketEndDateTS?: number | null;
  firstPublicationDateTS?: number | null;
  versionNumber?: number | null;
  lastVersion?: boolean | null;
  [key: string]: unknown;
}

export class EprelError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); this.name = "EprelError"; }
}

const key = () => process.env.EPREL_API_KEY ?? "";
export const hasEprelKey = () => key().length > 0;

async function api<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  if (!hasEprelKey()) throw new EprelError("Λείπει το EPREL_API_KEY στο .env.", 0, "NO_KEY");
  const r = await fetch(`${API}${path}`, { ...init, headers: { "x-api-key": key(), accept: "application/json", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(20000), cache: "no-store" });
  if ((r.status === 429 || r.status >= 500) && attempt < 2) {
    await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
    return api<T>(path, init, attempt + 1);
  }
  const text = await r.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* όχι JSON */ }
  if (!r.ok) {
    const b = (body ?? {}) as { code?: string; message?: string };
    throw new EprelError(b.message ? `EPREL: ${b.message}` : `EPREL HTTP ${r.status}`, r.status, b.code);
  }
  return body as T;
}

/** Ομάδες προϊόντων — δημόσιο endpoint, αλλά το καλούμε με κλειδί για ενιαία μεταχείριση. */
export const listGroups = () => api<EprelGroupRaw[]>("/product-groups");

export interface SearchOpts { page?: number; limit?: number; sort?: string; order?: "ASC" | "DESC"; filters?: Record<string, string | number | boolean | undefined> }

/** Αναζήτηση μέσα σε ομάδα. Η σελίδα ξεκινά από 1, όριο έως 100 ανά κλήση. */
export function searchProducts(urlCode: string, opts: SearchOpts = {}) {
  const q = new URLSearchParams({ _page: String(Math.max(1, opts.page ?? 1)), _limit: String(Math.min(100, Math.max(1, opts.limit ?? 20))) });
  if (opts.sort) { q.set("sort0", opts.sort); q.set("order0", opts.order ?? "ASC"); }
  for (const [k, v] of Object.entries(opts.filters ?? {})) if (v !== undefined && v !== "") q.set(k, String(v));
  return api<EprelSearch>(`/products/${encodeURIComponent(urlCode)}?${q}`);
}

/** Πλήρης εγγραφή με τον αριθμό καταχώρισης (ο ίδιος αριθμός που τυπώνεται πάνω στην ετικέτα ως QR). */
export const getProduct = (registrationNumber: string) => api<EprelRaw>(`/product/${encodeURIComponent(registrationNumber)}`);

/** Τα δημόσια αρχεία έχουν σταθερή διαδρομή — δεν χρειάζεται κλήση για να τα βρούμε. */
export const labelUrl = (urlCode: string, reg: string, format: "svg" | "png" | "pdf" = "svg") => `${EPREL_BASE}/labels/${urlCode}/Label_${reg}.${format}`;
export const ficheUrl = (urlCode: string, reg: string, lang = "EL") => `${EPREL_BASE}/fiches/${urlCode}/Fiche_${reg}_${lang.toUpperCase()}.pdf`;

/** Το μικρό SVG βέλος (κλάση + κλίμακα) για κάρτες προϊόντων. */
export async function getNestedLabelSvg(registrationNumber: string): Promise<string | null> {
  if (!hasEprelKey()) return null;
  const r = await fetch(`${API}/product/${encodeURIComponent(registrationNumber)}/nested-label`, { headers: { "x-api-key": key() }, signal: AbortSignal.timeout(20000), cache: "no-store" });
  if (!r.ok || !(r.headers.get("content-type") ?? "").includes("svg")) return null;
  const svg = await r.text();
  return svg.includes("<svg") ? svg : null;
}

/** Λήψη δημόσιου αρχείου (ετικέτα/δελτίο) — χωρίς κλειδί, με έλεγχο ότι είναι όντως αυτό που περιμένουμε. */
export async function fetchPublicFile(url: string, expect: "svg" | "png" | "pdf"): Promise<{ bytes: Buffer; mime: string } | null> {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000), cache: "no-store" });
  if (!r.ok) return null;
  const bytes = Buffer.from(await r.arrayBuffer());
  const head = bytes.toString("latin1", 0, 8);
  const ok = expect === "pdf" ? head.startsWith("%PDF") : expect === "png" ? head.startsWith("\x89PNG") : bytes.toString("utf8", 0, 200).includes("<svg") || bytes.toString("utf8", 0, 200).startsWith("<?xml");
  if (!ok) return null;
  return { bytes, mime: expect === "pdf" ? "application/pdf" : expect === "png" ? "image/png" : "image/svg+xml" };
}
