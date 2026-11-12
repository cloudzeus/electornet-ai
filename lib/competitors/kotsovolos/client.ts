import { parseSitemap, parseCategories, parseProduct, type KotItem } from "./core";
import { type Pacer } from "./pacer";
import { swr } from "@/lib/cache/swr";

const UA = "Mozilla/5.0 (compatible; price-compare/1.0)";
const SITEMAP = "https://assets.kotsovolos.gr/feeds/productSiteMap.xml";
const CATEGORIES = "https://assets.kotsovolos.gr/feeds/categoriesSiteMap.xml";
const PRODUCT = "https://www.kotsovolos.gr/api/ext/getProductByArticleNumber?articleNumber=";

// Μία κλήση μέσα από τον pacer. status 0 = σφάλμα δικτύου/timeout. Τα KotStopError του pacer περνούν προς τα πάνω.
async function get(url: string, pacer?: Pacer) {
  await pacer?.wait();
  const t0 = Date.now();
  let status = 0, text = "", ra: number | undefined;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" }, redirect: "manual", signal: AbortSignal.timeout(15000), cache: "no-store" });
    status = res.status;
    const h = Number(res.headers.get("retry-after"));
    ra = Number.isFinite(h) && h > 0 ? h : undefined;
    text = status >= 300 && status < 400 ? "" : await res.text();
  } catch { status = 0; }
  await pacer?.record({ status, ms: Date.now() - t0, retryAfterS: ra });
  return { status, text };
}

async function feed(url: string, pacer?: Pacer) {
  const { status, text } = await get(url, pacer);
  if (status !== 200) throw new Error(`Κωτσόβολος: ${url} → HTTP ${status}`);
  return text;
}

export const fetchSitemap = async (pacer?: Pacer): Promise<KotItem[]> => parseSitemap(await feed(SITEMAP, pacer));
export const fetchCategories = async (pacer?: Pacer) => parseCategories(await feed(CATEGORIES, pacer));
/** Για την οθόνη αντιστοίχισης: μία κλήση το 24ωρο (και όχι μία ανά άνοιγμα της σελίδας). */
export const cachedCategories = swr(() => fetchCategories(), 24 * 3600_000);
/** Για την αναζήτηση ζευγαριού από τη διαχείριση: μία λήψη το 24ωρο, ποτέ ανά πλήκτρο. */
export const cachedSitemap = swr(() => fetchSitemap(), 24 * 3600_000);

export async function fetchProduct(art: string, pacer?: Pacer): Promise<ReturnType<typeof parseProduct>> {
  const { status, text } = await get(PRODUCT + encodeURIComponent(art), pacer);
  if (status >= 300 && status < 400) return { error: "redirect" };
  if (status === 404) return { error: "δεν βρέθηκε (404)" };
  if (status !== 200) return { error: `HTTP ${status}` };
  try { return parseProduct(JSON.parse(text)); } catch { return { error: "η απάντηση δεν ήταν JSON" }; }
}
