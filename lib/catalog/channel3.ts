import "server-only";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings/store";
import { blockedHost } from "./enrich-core";
import { c3Images, c3Offer, c3Query, c3Specs, pickMatch, type C3Product } from "./channel3-core";
import type { EnrichResult } from "./enrich";

/**
 * Channel3 (channel3.ai) ως πηγή στα «Στοιχεία από το internet»: μία αναζήτηση (`POST /v1/search`, 1 credit) με μάρκα +
 * κωδικό κατασκευαστή, σε καταστήματα της ευρωζώνης (EUR χωρίς χώρα — με country GR ο κατάλογος έδινε έπιπλα και γυαλιά
 * για τηλεόραση Samsung· τα κείμενα έρχονται στα αγγλικά). Κλειδί και μηνιαίο όριο στις Ρυθμίσεις → AI & υπηρεσίες → «Στοιχεία προϊόντων».
 * Κάθε αναζήτηση γράφεται στο `AiUsage` (feature enrich-channel3, model channel3/search): από εκεί μετράει το όριο του
 * μήνα (1.000 δωρεάν, μετά $0,007) και φαίνεται στις αναφορές κόστους. Η θέση κρατιέται ΠΡΙΝ την κλήση, ώστε παράλληλες
 * αναζητήσεις να μην ξεπερνούν το όριο.
 */
const API = "https://api.trychannel3.com/v1/search";
const MODEL = "channel3/search";
const FREE = 1000, OVERAGE_USD = 0.007;
const month = () => new Date().toISOString().slice(0, 7);

export async function channel3Config() {
  const { data, secrets } = await getSetting("ai").catch(() => ({ data: {} as Record<string, unknown>, secrets: {} as Record<string, string> }));
  const raw = Number(data.channel3MonthlyLimit);
  return { key: secrets.channel3ApiKey?.trim() || "", limit: Number.isFinite(raw) && String(data.channel3MonthlyLimit ?? "") !== "" ? Math.max(0, Math.round(raw)) : FREE };
}

/** Αναζητήσεις του τρέχοντος μήνα (UTC) — μόνο όσες χρεώθηκαν (ok). */
export async function channel3Usage() {
  const [{ key, limit }, used] = await Promise.all([channel3Config(), db.aiUsage.count({ where: { model: MODEL, day: { startsWith: month() }, ok: true } })]);
  return { configured: !!key, used, limit, left: Math.max(0, limit - used), month: month() };
}
export type Channel3Usage = Awaited<ReturnType<typeof channel3Usage>>;

const fail = (error: string): EnrichResult => ({ source: "channel3", status: "failed", specs: [], costUsd: 0, error });

export async function enrichFromChannel3(p: { brand: string; title: string; modelCode: string | null; sku: string }): Promise<EnrichResult> {
  const { key, limit } = await channel3Config();
  if (!key) return fail("χωρίς κλειδί Channel3");
  // κράτηση θέσης: αν μετά από αυτήν ξεπερνιέται το όριο, ακυρώνεται και η αναζήτηση δεν γίνεται
  const used = await db.aiUsage.count({ where: { model: MODEL, day: { startsWith: month() }, ok: true } });
  const costUsd = used >= FREE ? OVERAGE_USD : 0;
  const slot = await db.aiUsage.create({ data: { day: new Date().toISOString().slice(0, 10), feature: "enrich-channel3", model: MODEL, tokensIn: 1, costUsd, billedUsd: costUsd } });
  const rank = await db.aiUsage.count({ where: { model: MODEL, day: { startsWith: month() }, ok: true, createdAt: { lte: slot.createdAt } } });
  if (rank > limit) {
    await db.aiUsage.delete({ where: { id: slot.id } }).catch(() => null);
    return fail(`όριο μήνα ${limit.toLocaleString("el-GR")} αναζητήσεων`);
  }
  const t0 = Date.now();
  const done = (ok: boolean, error?: string) => db.aiUsage.update({ where: { id: slot.id }, data: { ms: Date.now() - t0, ok, error: error?.slice(0, 300), ...(ok ? {} : { costUsd: 0, billedUsd: 0 }) } }).catch(() => null);
  let products: C3Product[];
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "x-api-key": key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ query: c3Query(p), limit: 10, filters: { availability: ["InStock", "OutOfStock"] }, config: { currency: "EUR", length_unit: "cm", weight_unit: "kg" } }),
      signal: AbortSignal.timeout(25_000),
    });
    const j = (await res.json().catch(() => null)) as { products?: C3Product[]; detail?: unknown } | null;
    if (!res.ok) {
      const msg = res.status === 401 ? "μη έγκυρο κλειδί Channel3" : res.status === 402 ? "τελείωσαν τα credits της Channel3 (χρειάζεται τρόπος πληρωμής)" : `Channel3 ${res.status}: ${typeof j?.detail === "string" ? j.detail : res.statusText}`;
      await done(false, msg);
      return fail(msg);
    }
    products = Array.isArray(j?.products) ? j!.products : [];
    await done(true);
  } catch (e) {
    const msg = `Channel3: ${(e as Error).message}`;
    await done(false, msg);
    return fail(msg);
  }
  const hit = pickMatch(products, p);
  if (!hit) return { source: "channel3", status: "none", specs: [], costUsd, error: products.length ? `${products.length} αποτελέσματα, κανένα με τον κωδικό ${p.modelCode || p.sku}` : "δεν βρέθηκε στη Channel3" };
  const specs = c3Specs(hit), images = c3Images(hit).filter((u) => !blockedHost(u));
  if (!specs.length && !images.length) return { source: "channel3", status: "none", specs: [], costUsd, error: "βρέθηκε χωρίς χαρακτηριστικά ή φωτογραφίες" };
  const offer = c3Offer(hit, blockedHost);
  return { source: "channel3", status: "found", url: offer?.url.slice(0, 500), sourceName: `Channel3${offer ? ` · ${offer.domain}` : ""}`.slice(0, 120), specs: specs.slice(0, 80), images, costUsd };
}
