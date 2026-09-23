import "server-only";
import { db } from "@/lib/db";
import { chat, getAi, parseJson } from "@/lib/ai/openrouter";

/**
 * Εμπλουτισμός χαρακτηριστικών από ΕΞΩΤΕΡΙΚΕΣ πηγές — για να ξέρει ο Ερμής (και η σελίδα προϊόντος) τα πάντα, ακόμη κι όταν
 * η περιγραφή του ERP είναι δύο γραμμές. Δύο πηγές, με τη σειρά:
 *
 *  1. Icecat (Open Icecat, δωρεάν): ο ανοιχτός κατάλογος προδιαγραφών των κατασκευαστών, δομημένος και στα ελληνικά.
 *     Αναζήτηση με barcode (GTIN), αλλιώς μάρκα + κωδικό κατασκευαστή. Καλύπτει τους μεγάλους (Samsung, LG, Bosch, HP…),
 *     όχι τα ελληνικά εισαγωγής (Toyotomi, Inventor, Crystal Audio) ούτε τα κινητά (Full Icecat, επί πληρωμή).
 *  2. Web (LLM με αναζήτηση, perplexity/sonar-pro): τα επίσημα χαρακτηριστικά από τον ιστότοπο του κατασκευαστή ή του
 *     εισαγωγέα (toyotomi.gr, inventor.gr, κατάλογοι PDF). ~$0,015 ανά προϊόν, μόνο για όσα δεν έδωσε το Icecat.
 *
 * Τα χαρακτηριστικά γράφονται στον πίνακα `Spec` με `source` icecat | web, στις δικές τους ομάδες, ΧΩΡΙΣ να αγγίζουν όσα
 * ήρθαν από το ERP (s1-desc) ή την ενεργειακή ετικέτα (eprel). Η πηγή, το URL και το κόστος μένουν στο `ProductEnrichment`,
 * ώστε ο διαχειριστής να βλέπει από πού προήλθε κάθε στοιχείο και η διαδικασία να συνεχίζει από εκεί που σταμάτησε.
 */
export type EnrichSource = "icecat" | "web";
export interface EnrichResult { source: EnrichSource; status: "found" | "none" | "failed"; url?: string; sourceName?: string; specs: { group: string; key: string; value: string }[]; confidence?: number; costUsd: number; error?: string }

const ICECAT = () => ({ shop: process.env.ICECAT_SHOPNAME || "openIcecat-live", key: process.env.ICECAT_APP_KEY || "" });
const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
/** Τιμές που δεν λένε τίποτα στον πελάτη. */
const USELESS = /^(ναι|yes|y|-|—|n\/a|na|null|0|όχι|no)$/i;

// ---------- Icecat ----------

interface IcecatData { GeneralInfo?: { Title?: string; Brand?: string; ProductName?: string; Description?: { LongDesc?: string }; SummaryDescription?: { ShortSummaryDescription?: string } }; FeaturesGroups?: { FeatureGroup?: { Name?: { Value?: string } }; Features?: { Feature?: { Name?: { Value?: string } }; PresentationValue?: string; Value?: string }[] }[]; Gallery?: { Pic?: string; Pic500x500?: string }[] }

async function icecatFetch(params: Record<string, string>): Promise<{ status: number; data: IcecatData | null; msg?: string }> {
  const { shop, key } = ICECAT();
  const u = new URL("https://live.icecat.biz/api");
  u.searchParams.set("shopname", shop); u.searchParams.set("lang", "el");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  if (key) u.searchParams.set("app_key", key);
  const res = await fetch(u, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!res) return { status: 0, data: null, msg: "network" };
  const j = (await res.json().catch(() => null)) as { data?: IcecatData; Message?: string; msg?: string } | null;
  return { status: res.status, data: res.ok ? (j?.data ?? null) : null, msg: j?.Message ?? j?.msg };
}

export async function enrichFromIcecat(p: { ean: string | null; sku: string; modelCode: string | null; brand: string }): Promise<EnrichResult> {
  const tries: Record<string, string>[] = [];
  if (p.ean && /^\d{8,14}$/.test(p.ean)) tries.push({ GTIN: p.ean });
  // Icecat θέλει τον κωδικό του κατασκευαστή («WW90J6410CW»), όχι τον κωδικό είδους της αποθήκης
  const codes = [...new Set([p.modelCode, p.sku].filter((c): c is string => !!c && /[A-Za-z]/.test(c) && c.length >= 5).map((c) => c.split(/[\s/]/)[0]))];
  for (const c of codes.slice(0, 2)) tries.push({ Brand: p.brand, ProductCode: c });
  let last: Awaited<ReturnType<typeof icecatFetch>> | null = null;
  for (const t of tries) {
    last = await icecatFetch(t);
    if (last.status === 403) return { source: "icecat", status: "none", specs: [], costUsd: 0, error: "μόνο Full Icecat (συνδρομή)" };
    if (last.data) break;
  }
  const d = last?.data;
  if (!d) return { source: "icecat", status: last && last.status >= 500 ? "failed" : "none", specs: [], costUsd: 0, error: last?.msg?.slice(0, 120) };
  const specs: EnrichResult["specs"] = [];
  for (const g of d.FeaturesGroups ?? []) {
    const group = clean(g.FeatureGroup?.Name?.Value) || "Τεχνικά χαρακτηριστικά";
    for (const f of g.Features ?? []) { const key = clean(f.Feature?.Name?.Value), value = clean(f.PresentationValue ?? f.Value); if (key && value && !USELESS.test(value) && value.length <= 200) specs.push({ group, key, value }); }
  }
  return { source: "icecat", status: specs.length ? "found" : "none", url: `https://icecat.biz/`, sourceName: `Icecat · ${clean(d.GeneralInfo?.Brand) || p.brand}`, specs, confidence: 1, costUsd: 0 };
}

// ---------- Web (επίσημος ιστότοπος) ----------

const WEB_MODEL = process.env.ENRICH_WEB_MODEL || "perplexity/sonar-pro";

export async function enrichFromWeb(p: { brand: string; title: string; modelCode: string | null; sku: string; typeName: string }): Promise<EnrichResult> {
  if (!(await getAi())) return { source: "web", status: "failed", specs: [], costUsd: 0, error: "χωρίς κλειδί OpenRouter" };
  const model = p.modelCode || p.sku;
  const r = await chat({
    feature: "enrich-web", model: WEB_MODEL, maxTokens: 4000, temperature: 0, timeoutMs: 70000,
    messages: [
      { role: "system", content: `Είσαι ερευνητής προδιαγραφών προϊόντων για ελληνικό e-shop ηλεκτρικών. Βρίσκεις τα ΕΠΙΣΗΜΑ τεχνικά χαρακτηριστικά ενός προϊόντος από τον ιστότοπο του κατασκευαστή ή του επίσημου εισαγωγέα για την Ελλάδα (π.χ. samsung.com/gr, lg.com/gr, toyotomi.gr, inventor.gr, bosch-home.gr, κατάλογοι/δελτία PDF του κατασκευαστή). ΟΧΙ από e-shops τρίτων, marketplaces ή συγκριτικά sites.
Απαντάς ΜΟΝΟ με JSON: {"found":boolean,"sourceUrl":string|null,"sourceName":string|null,"specs":[{"group":string,"key":string,"value":string}],"confidence":number 0-1}.
- Έως 40 χαρακτηριστικά, τα πιο χρήσιμα για αγοραστή πρώτα (απόδοση, κατανάλωση, θόρυβος, χωρητικότητα, διαστάσεις, βάρος, συνδεσιμότητα, λειτουργίες, περιεχόμενα συσκευασίας, εγγύηση).
- Κλειδιά και ομάδες στα ελληνικά, τιμές με μονάδες όπως τις δίνει η πηγή. Μόνο όσα βρήκες ΠΡΑΓΜΑΤΙΚΑ για ΑΥΤΟ το μοντέλο — ποτέ εικασίες, ποτέ στοιχεία παρόμοιου μοντέλου.
- Αν δεν υπάρχει αξιόπιστη επίσημη πηγή: found=false, specs=[].` },
      { role: "user", content: `Προϊόν: ${p.brand} ${model} — ${p.title} (${p.typeName}). Βρες τα επίσημα τεχνικά χαρακτηριστικά.` },
    ],
  }).catch((e) => ({ text: "", costUsd: 0, error: e instanceof Error ? e.message : String(e) }) as { text: string; costUsd: number; error?: string });
  if ("error" in r && r.error) return { source: "web", status: "failed", specs: [], costUsd: 0, error: r.error.slice(0, 200) };
  const j = parseJson<{ found?: boolean; sourceUrl?: string | null; sourceName?: string | null; specs?: { group?: string; key?: string; value?: string }[]; confidence?: number }>(r.text);
  if (!j) return { source: "web", status: "failed", specs: [], costUsd: r.costUsd, error: "μη έγκυρο JSON" };
  const specs = (j.specs ?? []).map((s) => ({ group: clean(s.group) || "Τεχνικά χαρακτηριστικά", key: clean(s.key), value: clean(s.value) })).filter((s) => s.key && s.value && !USELESS.test(s.value) && s.value.length <= 200);
  const conf = typeof j.confidence === "number" ? j.confidence : 0;
  // πηγή χωρίς URL ή με χαμηλή βεβαιότητα δεν γράφεται: καλύτερα «δεν ξέρουμε» παρά λάθος στοιχείο
  if (!j.found || !specs.length || !j.sourceUrl || conf < 0.6) return { source: "web", status: "none", specs: [], confidence: conf, costUsd: r.costUsd, error: !j.found ? "δεν βρέθηκε επίσημη πηγή" : conf < 0.6 ? `χαμηλή βεβαιότητα ${conf}` : "χωρίς URL πηγής" };
  return { source: "web", status: "found", url: j.sourceUrl.slice(0, 500), sourceName: clean(j.sourceName).slice(0, 120) || new URL(j.sourceUrl).hostname, specs: specs.slice(0, 80), confidence: conf, costUsd: r.costUsd };
}

// ---------- Αποθήκευση ----------

const SOURCE_GROUP: Record<EnrichSource, string> = { icecat: "Επίσημα χαρακτηριστικά (Icecat)", web: "Επίσημα χαρακτηριστικά (κατασκευαστής)" };

/** Γράφει το αποτέλεσμα: αντικαθιστά τα specs της ίδιας πηγής, ενημερώνει το μητρώο. Δεν αγγίζει άλλες πηγές. */
export async function storeEnrichment(productId: string, r: EnrichResult) {
  await db.$transaction([
    db.spec.deleteMany({ where: { productId, source: r.source } }),
    ...(r.status === "found" ? [db.spec.createMany({ data: r.specs.map((s, i) => ({ productId, groupName: `${SOURCE_GROUP[r.source]} · ${s.group}`.slice(0, 120), key: s.key.slice(0, 120), value: s.value, sortNo: 1000 + i, source: r.source })) })] : []),
    db.productEnrichment.upsert({ where: { productId_source: { productId, source: r.source } }, create: { productId, source: r.source, status: r.status, url: r.url, sourceName: r.sourceName, specCount: r.specs.length, confidence: r.confidence, costUsd: r.costUsd, error: r.error }, update: { status: r.status, url: r.url, sourceName: r.sourceName, specCount: r.specs.length, confidence: r.confidence, costUsd: r.costUsd, error: r.error, checkedAt: new Date() } }),
  ]);
}

export interface EnrichBatch { checked: number; found: number; none: number; failed: number; specs: number; costUsd: number; remaining: number; samples: string[] }

/**
 * Μία παρτίδα: προϊόντα της βιτρίνας που δεν έχουν ελεγχθεί ακόμη στην πηγή (ή, με `retry`, βγήκαν none/failed πριν από
 * `retryDays` ημέρες). `web` μόνο για όσα ΔΕΝ έδωσε το Icecat — το δωρεάν πρώτα. `types`: περιορισμός σε ονόματα τύπων.
 */
export async function enrichBatch(opts: { source: EnrichSource; limit?: number; concurrency?: number; types?: string[]; retry?: boolean; retryDays?: number; minSpecsFromIcecat?: number } = { source: "icecat" }): Promise<EnrichBatch> {
  const limit = Math.min(500, opts.limit ?? 100), conc = Math.max(1, Math.min(8, opts.concurrency ?? (opts.source === "icecat" ? 4 : 2)));
  const since = new Date(Date.now() - (opts.retryDays ?? 30) * 86400000);
  // retry: τα «σφάλμα» ξανά αμέσως, τα «δεν βρέθηκε» μόνο αν πέρασαν retryDays
  const notYet = { enrichments: { none: { source: opts.source, ...(opts.retry ? { OR: [{ status: "found" }, { status: "none", checkedAt: { gt: since } }] } : {}) } } };
  const products = await db.product.findMany({
    where: { source: "softone", active: true, media: { some: { hidden: false } }, ...(opts.types?.length ? { category: { name: { in: opts.types } } } : {}), ...notYet,
      // web μόνο όπου το Icecat δεν έδωσε αρκετά
      ...(opts.source === "web" ? { NOT: { enrichments: { some: { source: "icecat", status: "found", specCount: { gte: opts.minSpecsFromIcecat ?? 8 } } } } } : {}) },
    orderBy: [{ stock: "desc" }, { price: "desc" }], take: limit,
    select: { id: true, sku: true, ean: true, title: true, modelCode: true, brand: { select: { name: true } }, category: { select: { name: true } } },
  });
  const out: EnrichBatch = { checked: 0, found: 0, none: 0, failed: 0, specs: 0, costUsd: 0, remaining: 0, samples: [] };
  let next = 0;
  await Promise.all(Array.from({ length: conc }, async () => {
    for (;;) {
      const p = products[next++]; if (!p) return;
      const r = opts.source === "icecat" ? await enrichFromIcecat({ ean: p.ean, sku: p.sku, modelCode: p.modelCode, brand: p.brand.name }) : await enrichFromWeb({ brand: p.brand.name, title: p.title, modelCode: p.modelCode, sku: p.sku, typeName: p.category.name });
      await storeEnrichment(p.id, r).catch(() => { r.status = "failed"; });
      out.checked++; out[r.status]++; out.specs += r.specs.length; out.costUsd += r.costUsd;
      if (out.samples.length < 6) out.samples.push(`${r.status === "found" ? "✓" : r.status === "none" ? "–" : "✗"} ${p.brand.name} ${p.title.slice(0, 40)}: ${r.status === "found" ? `${r.specs.length} χαρακτηριστικά · ${r.sourceName}` : r.error ?? r.status}`);
      if (opts.source === "icecat") await new Promise((res) => setTimeout(res, 150));
    }
  }));
  out.remaining = Math.max(0, (await db.product.count({ where: { source: "softone", active: true, media: { some: { hidden: false } }, ...(opts.types?.length ? { category: { name: { in: opts.types } } } : {}), ...notYet, ...(opts.source === "web" ? { NOT: { enrichments: { some: { source: "icecat", status: "found", specCount: { gte: opts.minSpecsFromIcecat ?? 8 } } } } } : {}) } })));
  return out;
}

export async function enrichStats() {
  const rows = await db.productEnrichment.groupBy({ by: ["source", "status"], _count: { _all: true }, _sum: { specCount: true, costUsd: true } });
  const listed = await db.product.count({ where: { source: "softone", active: true, media: { some: { hidden: false } } } });
  return { listed, rows: rows.map((r) => ({ source: r.source, status: r.status, products: r._count._all, specs: r._sum.specCount ?? 0, costUsd: r._sum.costUsd ?? 0 })) };
}
