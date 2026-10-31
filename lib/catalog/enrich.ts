import "server-only";
import { db } from "@/lib/db";
import { chat, getAi, parseJson } from "@/lib/ai/openrouter";
import { blockedHost, icecatImages, isHomePage, looksLikeImageFile, modelKeys, modelsFromSpecs, seriesWords } from "./enrich-core";
import { readProductPage, searchSiteForModel } from "./enrich-page";
import { CATALOG_TEXT_MODEL, WEB_SEARCH_MODEL } from "./ai-models";
import { suggestFromResult } from "./enrich-suggestions";

/**
 * Εμπλουτισμός χαρακτηριστικών από ΕΞΩΤΕΡΙΚΕΣ πηγές — για να ξέρει ο Ερμής (και η σελίδα προϊόντος) τα πάντα, ακόμη κι όταν
 * η περιγραφή του ERP είναι δύο γραμμές. Δύο πηγές, με τη σειρά:
 *
 *  1. Icecat (Open Icecat, δωρεάν): ο ανοιχτός κατάλογος προδιαγραφών των κατασκευαστών, δομημένος και στα ελληνικά.
 *     Αναζήτηση με barcode (GTIN), αλλιώς μάρκα + κωδικό κατασκευαστή. Καλύπτει τους μεγάλους (Samsung, LG, Bosch, HP…),
 *     όχι τα ελληνικά εισαγωγής (Toyotomi, Inventor, Crystal Audio) ούτε τα κινητά (Full Icecat, επί πληρωμή).
 *  2. Web (LLM με αναζήτηση, perplexity/sonar-pro): τα επίσημα χαρακτηριστικά από τον ιστότοπο του κατασκευαστή ή του
 *     εισαγωγέα (toyotomi.gr, inventor.gr, κατάλογοι PDF). ~$0,015 ανά προϊόν, μόνο για όσα δεν έδωσε το Icecat.
 *  1β. Channel3 (channel3.ai, κατάλογος προϊόντων καταστημάτων): μετά το Icecat, πριν από το web. Ταίριασμα μόνο με τον
 *     κωδικό κατασκευαστή στον τίτλο· 1 credit ανά αναζήτηση με μηνιαίο όριο (lib/catalog/channel3.ts).
 *  3. Shop (ίδιο μοντέλο): άλλα ηλεκτρονικά καταστήματα, μόνο όταν δεν βρέθηκε επίσημη πηγή. Ποτέ συγκριτικά τιμών ή
 *     marketplaces (blockedHost). Τα χαρακτηριστικά τους ΔΕΝ γράφονται απευθείας: μένουν προτάσεις προς έγκριση.
 *
 * Οι φωτογραφίες (γκαλερί Icecat, εικόνες που δηλώνει η σελίδα της πηγής) δεν μπαίνουν ποτέ αυτόματα στη βιτρίνα: γίνονται
 * προτάσεις (`EnrichSuggestion`) και κατεβαίνουν μόνο με «Έγκριση» (lib/catalog/enrich-suggestions.ts).
 *
 * Τα χαρακτηριστικά γράφονται στον πίνακα `Spec` με `source` icecat | web, στις δικές τους ομάδες, ΧΩΡΙΣ να αγγίζουν όσα
 * ήρθαν από το ERP (s1-desc) ή την ενεργειακή ετικέτα (eprel). Η πηγή, το URL και το κόστος μένουν στο `ProductEnrichment`,
 * ώστε ο διαχειριστής να βλέπει από πού προήλθε κάθε στοιχείο και η διαδικασία να συνεχίζει από εκεί που σταμάτησε.
 */
export type EnrichSource = "icecat" | "channel3" | "web" | "shop";
export interface EnrichResult { source: EnrichSource; status: "found" | "none" | "failed"; url?: string; sourceName?: string; specs: { group: string; key: string; value: string }[]; images?: string[]; /** HTML σελίδα του προϊόντος για φωτογραφίες, όταν η πηγή είναι PDF */ pageUrl?: string; /** ενεργειακή ετικέτα που δημοσιεύει η σελίδα του προϊόντος */ labelUrl?: string; confidence?: number; costUsd: number; error?: string }

const ICECAT = () => ({ shop: process.env.ICECAT_SHOPNAME || "openIcecat-live", key: process.env.ICECAT_APP_KEY || "" });
const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
/** Τιμές που δεν λένε τίποτα στον πελάτη. */
const USELESS = /^(ναι|yes|y|-|—|n\/a|na|null|0|όχι|no)$/i;

// ---------- Icecat ----------

interface IcecatData { GeneralInfo?: { Title?: string; Brand?: string; ProductName?: string; IcecatId?: number; Description?: { LongDesc?: string }; SummaryDescription?: { ShortSummaryDescription?: string } }; FeaturesGroups?: { FeatureGroup?: { Name?: { Value?: string } }; Features?: { Feature?: { Name?: { Value?: string } }; PresentationValue?: string; Value?: string }[] }[]; Gallery?: { Pic?: string; Pic500x500?: string }[] }

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
  const images = icecatImages(d.Gallery);
  const id = d.GeneralInfo?.IcecatId;
  return { source: "icecat", status: specs.length || images.length ? "found" : "none", url: id ? `https://icecat.biz/p/${id}.html` : `https://icecat.biz/`, sourceName: `Icecat · ${clean(d.GeneralInfo?.Brand) || p.brand}`, specs, images, confidence: 1, costUsd: 0 };
}

// ---------- Web (επίσημος ιστότοπος) ----------

const WEB_MODEL = WEB_SEARCH_MODEL;

export async function enrichFromWeb(p: { brand: string; title: string; modelCode: string | null; sku: string; typeName: string }): Promise<EnrichResult> {
  if (!(await getAi())) return { source: "web", status: "failed", specs: [], costUsd: 0, error: "χωρίς κλειδί OpenRouter" };
  const model = p.modelCode || p.sku;
  const r = await chat({
    feature: "enrich-web", model: WEB_MODEL, maxTokens: 4000, temperature: 0, timeoutMs: 70000,
    messages: [
      { role: "system", content: `Είσαι ερευνητής προδιαγραφών προϊόντων για ελληνικό e-shop ηλεκτρικών. Βρίσκεις τα ΕΠΙΣΗΜΑ τεχνικά χαρακτηριστικά ενός προϊόντος από τον ιστότοπο του κατασκευαστή ή του επίσημου εισαγωγέα για την Ελλάδα (π.χ. samsung.com/gr, lg.com/gr, toyotomi.gr, inventor.gr, bosch-home.gr, κατάλογοι/δελτία PDF του κατασκευαστή). ΟΧΙ από e-shops τρίτων, marketplaces ή συγκριτικά sites. Προτίμησε τη σελίδα του ελληνικού εισαγωγέα (.gr) πριν από ξένα sites ή καταλόγους PDF.
Απαντάς ΜΟΝΟ με JSON: {"found":boolean,"sourceUrl":string|null,"sourceName":string|null,"productPageUrl":string|null,"specs":[{"group":string,"key":string,"value":string}],"images":[string],"confidence":number 0-1}.
- productPageUrl: η HTML σελίδα του ΙΔΙΟΥ προϊόντος (ή της σειράς του) στο site του κατασκευαστή / εισαγωγέα — ιδίως όταν το sourceUrl είναι PDF· null αν δεν υπάρχει.
- Βάλε πάντα το χαρακτηριστικό «Μοντέλο» ακριβώς όπως το γράφει ο κατασκευαστής (π.χ. «HTN/HTG-717R32»), και την ενεργειακή κλάση ως «Ενεργειακή κλάση» (ή «Ενεργειακή κλάση ψύξης» / «θέρμανσης»).
- images: έως 8 ΑΜΕΣΕΣ διευθύνσεις αρχείων εικόνας (.jpg/.png/.webp) του ΙΔΙΟΥ προϊόντος από την ίδια επίσημη πηγή· κενό αν δεν είσαι σίγουρος.
- Έως 40 χαρακτηριστικά, τα πιο χρήσιμα για αγοραστή πρώτα (απόδοση, κατανάλωση, θόρυβος, χωρητικότητα, διαστάσεις, βάρος, συνδεσιμότητα, λειτουργίες, περιεχόμενα συσκευασίας, εγγύηση).
- Κατάλογοι και πίνακες ΣΕΙΡΑΣ έχουν μία στήλη ανά μέγεθος (π.χ. 9.000 / 12.000 / 18.000 BTU, 7 / 9 kg): πάρε ΜΟΝΟ τη στήλη του ακριβούς μοντέλου. Αν δεν φαίνεται καθαρά ποια στήλη είναι, ΜΗΝ δώσεις τιμές που αλλάζουν με το μέγεθος (απόδοση, κατανάλωση, κλάση, θόρυβος, διαστάσεις, βάρος).
- Κλειδιά και ομάδες στα ελληνικά, τιμές με μονάδες όπως τις δίνει η πηγή. Μόνο όσα βρήκες ΠΡΑΓΜΑΤΙΚΑ για ΑΥΤΟ το μοντέλο — ποτέ εικασίες, ποτέ στοιχεία παρόμοιου μοντέλου.
- Αν δεν υπάρχει αξιόπιστη επίσημη πηγή: found=false, specs=[].` },
      { role: "user", content: `Προϊόν: ${p.brand} ${model} — ${p.title} (${p.typeName}). Βρες τα επίσημα τεχνικά χαρακτηριστικά.` },
    ],
  }).catch((e) => ({ text: "", costUsd: 0, error: e instanceof Error ? e.message : String(e) }) as { text: string; costUsd: number; error?: string });
  if ("error" in r && r.error) return { source: "web", status: "failed", specs: [], costUsd: 0, error: r.error.slice(0, 200) };
  const j = parseJson<{ found?: boolean; sourceUrl?: string | null; sourceName?: string | null; productPageUrl?: string | null; specs?: { group?: string; key?: string; value?: string }[]; images?: unknown[]; confidence?: number }>(r.text);
  if (!j) return { source: "web", status: "failed", specs: [], costUsd: r.costUsd, error: "μη έγκυρο JSON" };
  if (j.sourceUrl && blockedHost(j.sourceUrl)) return { source: "web", status: "none", specs: [], costUsd: r.costUsd, error: "η πηγή ήταν συγκριτικό / marketplace" };
  const specs = (j.specs ?? []).map((s) => ({ group: clean(s.group) || "Τεχνικά χαρακτηριστικά", key: clean(s.key), value: clean(s.value) })).filter((s) => s.key && s.value && !USELESS.test(s.value) && s.value.length <= 200);
  const conf = typeof j.confidence === "number" ? j.confidence : 0;
  const ok = !!j.found && specs.length > 0 && !!j.sourceUrl && conf >= 0.6;
  let costUsd = r.costUsd;
  // η HTML σελίδα του ίδιου του μοντέλου: φωτογραφίες, ενεργειακή ετικέτα και — κυρίως — τα χαρακτηριστικά ΑΥΤΟΥ του
  // μεγέθους (οι κατάλογοι PDF και οι σελίδες σειράς έχουν όλα τα μεγέθη μαζί)
  const page = ok || j.productPageUrl || j.sourceUrl ? await modelPage(p, specs, [j.productPageUrl, j.sourceUrl]) : { costUsd: 0 };
  costUsd += page.costUsd;
  if (page.specs) return { source: "web", status: "found", url: page.url, sourceName: `${new URL(page.url!).hostname.replace(/^www\./, "")} · σελίδα του μοντέλου`, specs: page.specs, images: aiImages(j.images), pageUrl: page.url, labelUrl: page.labelUrl, confidence: Math.max(conf, 0.9), costUsd };
  // πηγή χωρίς URL ή με χαμηλή βεβαιότητα δεν γράφεται: καλύτερα «δεν ξέρουμε» παρά λάθος στοιχείο
  if (!ok) return { source: "web", status: "none", specs: [], confidence: conf, costUsd, error: !j.found ? "δεν βρέθηκε επίσημη πηγή" : conf < 0.6 ? `χαμηλή βεβαιότητα ${conf}` : "χωρίς URL πηγής" };
  return { source: "web", status: "found", url: j.sourceUrl!.slice(0, 500), sourceName: clean(j.sourceName).slice(0, 120) || new URL(j.sourceUrl!).hostname, specs: specs.slice(0, 80), images: aiImages(j.images), pageUrl: page.url, labelUrl: page.labelUrl, confidence: conf, costUsd };
}

type WebProduct = { brand: string; title: string; modelCode: string | null; sku: string };

/**
 * Η σελίδα του μοντέλου στο site του κατασκευαστή / εισαγωγέα: όποια έδωσε το AI, αλλιώς σύντομη αναζήτηση μόνο για τη
 * διεύθυνση, αλλιώς η αναζήτηση του ίδιου του site («?s=717R32»). Αν η σελίδα αναφέρει το μοντέλο, διαβάζονται από αυτή
 * τα χαρακτηριστικά του ακριβούς μοντέλου.
 */
async function modelPage(p: WebProduct, specs: { key: string; value: string }[], urls: (string | null | undefined)[]): Promise<{ url?: string; specs?: EnrichResult["specs"]; labelUrl?: string; costUsd: number }> {
  const model = modelsFromSpecs(specs)[0] ?? p.modelCode ?? p.sku;
  // και ο κωδικός από τον δικό μας τίτλο («HTN-717R32 (R32) TOYOTOMI HIRO…» → «HTN-717R32»)
  const hints = [model, ...p.title.split(/\s+/).filter((t) => /\d/.test(t) && t.replace(/[^\p{L}\p{N}]/gu, "").length >= 5)];
  let costUsd = 0;
  let url = urls.map(htmlPage).find((u) => u && !isHomePage(u));
  const origins = new Set(urls.map(htmlOrPdf).filter((u): u is string => !!u).map((u) => new URL(u).origin));
  const words = seriesWords(p.title, p.brand), tried = new Set<string>();
  const search = async (os: string[]) => { for (const o of os) { if (tried.has(o) || tried.size >= 5) continue; tried.add(o); const u = await searchSiteForModel(o, hints, words).catch(() => null); if (u) return u; } return undefined; };
  // πρώτα δωρεάν: sitemap / αναζήτηση στα sites που ήδη ξέρουμε (της πηγής) — έως 5 sites
  if (!url) url = await search([...origins].reverse());
  // και το site της μάρκας στην Ελλάδα (www.toyotomi.gr), αν υπάρχει
  const slug = p.brand.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!url && slug.length >= 3) url = await search([`https://www.${slug}.gr`, `https://www.${slug}.com`]);
  // μετά μία σύντομη αναζήτηση στο web μόνο για τη διεύθυνση· αν δώσει την αρχική σελίδα, ψάχνουμε σε εκείνο το site
  if (!url) {
    const f = await findProductPage(p, model);
    costUsd += f.costUsd;
    if (f.url && !isHomePage(f.url)) url = f.url;
    else if (f.url) url = await search([new URL(f.url).origin]);
  }
  if (!url) return { costUsd };
  const pg = await readProductPage(url, hints).catch(() => null);
  if (!pg?.ok) return { url, costUsd };
  const plain = pg.text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  // η σελίδα πρέπει να γράφει το μοντέλο — αλλιώς δεν ξέρουμε ότι είναι το ίδιο προϊόν
  if (!modelKeys(hints).some((k) => k.length >= 5 && plain.includes(k))) return { url: pg.url, costUsd };
  const x = await specsFromPage(p, model, pg.text);
  costUsd += x.costUsd;
  return { url: pg.url, specs: x.specs.length >= 5 ? x.specs : undefined, labelUrl: pg.labelUrl ?? undefined, costUsd };
}

/** Χαρακτηριστικά από το κείμενο της σελίδας του μοντέλου — μόνο του ακριβούς μοντέλου, χωρίς αναζήτηση στο web. */
async function specsFromPage(p: WebProduct, model: string, text: string): Promise<{ specs: EnrichResult["specs"]; costUsd: number }> {
  const r = await chat({
    feature: "enrich-web-page-specs", model: CATALOG_TEXT_MODEL, reasoning: "off", maxTokens: 3000, temperature: 0, timeoutMs: 60000, json: true,
    messages: [
      { role: "system", content: `Διαβάζεις το κείμενο της επίσημης σελίδας ενός προϊόντος και γράφεις τα τεχνικά χαρακτηριστικά του ΣΥΓΚΕΚΡΙΜΕΝΟΥ μοντέλου.
Απαντάς ΜΟΝΟ με JSON: {"specs":[{"group":string,"key":string,"value":string}]}.
- Μόνο ό,τι γράφει η σελίδα. Αν ο πίνακας έχει στήλες για πολλά μεγέθη / μοντέλα, πάρε ΜΟΝΟ τη στήλη του μοντέλου που σου δίνεται· αν δεν φαίνεται ποια είναι, άφησε έξω τις τιμές που αλλάζουν με το μέγεθος.
- Βάλε «Μοντέλο» όπως το γράφει η σελίδα, και τις ενεργειακές κλάσεις ως «Ενεργειακή κλάση ψύξης» / «Ενεργειακή κλάση θέρμανσης» (ή «Ενεργειακή κλάση»).
- Έως 40 χαρακτηριστικά, τα πιο χρήσιμα για αγοραστή πρώτα. Κλειδιά και ομάδες στα ελληνικά, τιμές με τις μονάδες της σελίδας. Όχι κενές τιμές, όχι μάρκετινγκ.` },
      { role: "user", content: JSON.stringify({ product: `${p.brand} ${model} — ${p.title}`, model, page: text.slice(0, 15000) }) },
    ],
  }).catch(() => null);
  if (!r) return { specs: [], costUsd: 0 };
  const j = parseJson<{ specs?: { group?: string; key?: string; value?: string }[] }>(r.text);
  const specs = (j?.specs ?? []).map((s) => ({ group: clean(s.group) || "Τεχνικά χαρακτηριστικά", key: clean(s.key), value: clean(s.value) })).filter((s) => s.key && s.value && !USELESS.test(s.value) && s.value.length <= 200).slice(0, 80);
  return { specs, costUsd: r.costUsd };
}

/** Η HTML σελίδα ενός προϊόντος στο site του κατασκευαστή / εισαγωγέα — μόνο η διεύθυνση (~$0,005). */
async function findProductPage(p: WebProduct, model: string): Promise<{ url?: string; costUsd: number }> {
  const r = await chat({
    feature: "enrich-web-page", model: WEB_MODEL, maxTokens: 300, temperature: 0, timeoutMs: 40000,
    messages: [
      { role: "system", content: 'Βρίσκεις την ΕΠΙΣΗΜΗ HTML σελίδα ενός προϊόντος (όχι PDF) στο site του ελληνικού εισαγωγέα ή του κατασκευαστή — όχι e-shop, marketplace ή συγκριτικό. Απάντηση ΜΟΝΟ JSON: {"url": string|null}. Αν βρίσκεις μόνο το site και όχι τη σελίδα, δώσε την αρχική του σελίδα. null αν δεν είσαι σίγουρος.' },
      { role: "user", content: `${p.brand} ${model} — ${p.title}. Αγορά: Ελλάδα.` },
    ],
  }).catch(() => null);
  if (!r) return { costUsd: 0 };
  return { url: htmlPage(parseJson<{ url?: string | null }>(r.text)?.url), costUsd: r.costUsd };
}

/** Site κατασκευαστή από οποιαδήποτε διεύθυνση (και PDF), για αναζήτηση στο ίδιο το site. */
const htmlOrPdf = (u: string | null | undefined) => (u && /^https?:\/\//.test(u) && !blockedHost(u) ? u : undefined);

/** Σελίδα προϊόντος για φωτογραφίες: μόνο http(s), όχι PDF, όχι συγκριτικά. */
const htmlPage = (u: string | null | undefined) => (u && /^https?:\/\//.test(u) && !/\.pdf(\?|#|$)/i.test(u) && !blockedHost(u) ? u.slice(0, 500) : undefined);

/** Διευθύνσεις εικόνων που έδωσε το AI: μόνο αρχεία εικόνας, όχι από συγκριτικά. Ελέγχονται ξανά στην έγκριση. */
const aiImages = (xs: unknown[] | undefined) => [...new Set((xs ?? []).filter((x): x is string => typeof x === "string" && /^https?:\/\//.test(x)).filter((x) => looksLikeImageFile(x) && !blockedHost(x)))].slice(0, 8);

// ---------- Άλλα καταστήματα (τελευταία λύση) ----------

export async function enrichFromShops(p: { brand: string; title: string; modelCode: string | null; sku: string; typeName: string; ean: string | null }): Promise<EnrichResult> {
  if (!(await getAi())) return { source: "shop", status: "failed", specs: [], costUsd: 0, error: "χωρίς κλειδί OpenRouter" };
  const model = p.modelCode || p.sku;
  const r = await chat({
    feature: "enrich-shop", model: WEB_MODEL, maxTokens: 4000, temperature: 0, timeoutMs: 70000,
    messages: [
      { role: "system", content: `Είσαι ερευνητής προδιαγραφών προϊόντων για ελληνικό e-shop ηλεκτρικών. Το προϊόν ΔΕΝ βρέθηκε στο site του κατασκευαστή, οπότε ψάχνεις σε σελίδες ΑΛΛΩΝ ηλεκτρονικών καταστημάτων (ελληνικών ή ευρωπαϊκών) που πουλούν ΑΚΡΙΒΩΣ αυτό το μοντέλο.
ΠΟΤΕ συγκριτικά τιμών ή marketplaces (skroutz, bestprice, glami, google shopping, amazon, ebay, aliexpress, temu, shopflix).
Απαντάς ΜΟΝΟ με JSON: {"found":boolean,"sourceUrl":string|null,"sourceName":string|null,"specs":[{"group":string,"key":string,"value":string}],"images":[string],"confidence":number 0-1}.
- sourceUrl: η σελίδα του καταστήματος με τα πιο πλήρη στοιχεία για ΑΥΤΟ το μοντέλο.
- Έως 40 χαρακτηριστικά, μόνο όσα αναγράφονται για ΑΥΤΟ το μοντέλο (ίδιος κωδικός), κατά προτίμηση όσα συμφωνούν σε δύο σελίδες. Κλειδιά και ομάδες στα ελληνικά.
- images: έως 8 ΑΜΕΣΕΣ διευθύνσεις εικόνων (.jpg/.png/.webp) του προϊόντος από αυτή τη σελίδα· κενό αν δεν είσαι σίγουρος.
- Αν δεν βρεις σελίδα με τον ίδιο κωδικό μοντέλου: found=false, specs=[].` },
      { role: "user", content: `Προϊόν: ${p.brand} ${model}${p.ean ? ` (EAN ${p.ean})` : ""} — ${p.title} (${p.typeName}).` },
    ],
  }).catch((e) => ({ text: "", costUsd: 0, error: e instanceof Error ? e.message : String(e) }) as { text: string; costUsd: number; error?: string });
  if ("error" in r && r.error) return { source: "shop", status: "failed", specs: [], costUsd: 0, error: r.error.slice(0, 200) };
  const j = parseJson<{ found?: boolean; sourceUrl?: string | null; sourceName?: string | null; specs?: { group?: string; key?: string; value?: string }[]; images?: unknown[]; confidence?: number }>(r.text);
  if (!j) return { source: "shop", status: "failed", specs: [], costUsd: r.costUsd, error: "μη έγκυρο JSON" };
  const specs = (j.specs ?? []).map((s) => ({ group: clean(s.group) || "Τεχνικά χαρακτηριστικά", key: clean(s.key), value: clean(s.value) })).filter((s) => s.key && s.value && !USELESS.test(s.value) && s.value.length <= 200);
  const conf = typeof j.confidence === "number" ? j.confidence : 0;
  const bad = !!j.sourceUrl && blockedHost(j.sourceUrl);
  if (!j.found || !j.sourceUrl || bad || conf < 0.6 || (!specs.length && !j.images?.length)) return { source: "shop", status: "none", specs: [], confidence: conf, costUsd: r.costUsd, error: !j.found ? "δεν βρέθηκε σε κατάστημα" : bad ? "η πηγή ήταν συγκριτικό / marketplace" : conf < 0.6 ? `χαμηλή βεβαιότητα ${conf}` : "χωρίς URL πηγής" };
  return { source: "shop", status: "found", url: j.sourceUrl.slice(0, 500), sourceName: clean(j.sourceName).slice(0, 120) || new URL(j.sourceUrl).hostname, specs: specs.slice(0, 80), images: aiImages(j.images), confidence: conf, costUsd: r.costUsd };
}


// ---------- Αποθήκευση ----------

const SOURCE_GROUP: Record<EnrichSource, string> = { icecat: "Επίσημα χαρακτηριστικά (Icecat)", channel3: "Χαρακτηριστικά (Channel3)", web: "Επίσημα χαρακτηριστικά (κατασκευαστής)", shop: "Χαρακτηριστικά (άλλα καταστήματα)" };
export const sourceGroup = (s: EnrichSource) => SOURCE_GROUP[s];

/**
 * Γράφει το αποτέλεσμα: αντικαθιστά τα specs της ίδιας πηγής (icecat / channel3 / web), ενημερώνει το μητρώο. Δεν αγγίζει άλλες
 * πηγές. Τα χαρακτηριστικά καταστημάτων και ΟΛΕΣ οι φωτογραφίες γίνονται προτάσεις προς έγκριση.
 */
export async function storeEnrichment(productId: string, r: EnrichResult) {
  const direct = r.source !== "shop";
  // ό,τι έχει ήδη περάσει στο SoftOne (s1-desc) δεν ξαναγράφεται από την εξωτερική πηγή — αλλιώς θα φαινόταν διπλό
  if (direct && r.specs.length) {
    // η Channel3 (στοιχεία καταστημάτων) δεν επαναλαμβάνει ό,τι έδωσε ήδη άλλη πηγή (ERP, ετικέτα, Icecat, κατασκευαστής)
    const others = r.source === "channel3" ? { source: { in: ["s1-desc", "eprel", "icecat", "web", "shop", "manual"] } } : { source: "s1-desc" };
    const erp = new Set((await db.spec.findMany({ where: { productId, ...others }, select: { key: true } })).map((s) => s.key.toLowerCase().trim()));
    r = { ...r, specs: r.specs.filter((s) => !erp.has(s.key.toLowerCase().trim())) };
  }
  await db.$transaction([
    ...(direct ? [db.spec.deleteMany({ where: { productId, source: r.source } })] : []),
    ...(direct && r.status === "found" && r.specs.length ? [db.spec.createMany({ data: r.specs.map((s, i) => ({ productId, groupName: `${SOURCE_GROUP[r.source]} · ${s.group}`.slice(0, 120), key: s.key.slice(0, 120), value: s.value, sortNo: (r.source === "channel3" ? 1500 : 1000) + i, source: r.source })) })] : []),
    db.productEnrichment.upsert({ where: { productId_source: { productId, source: r.source } }, create: { productId, source: r.source, status: r.status, url: r.url, sourceName: r.sourceName, specCount: r.specs.length, confidence: r.confidence, costUsd: r.costUsd, error: r.error }, update: { status: r.status, url: r.url, sourceName: r.sourceName, specCount: r.specs.length, confidence: r.confidence, costUsd: r.costUsd, error: r.error, checkedAt: new Date() } }),
  ]);
  if (r.status === "found") await suggestFromResult(productId, r);
}

export interface EnrichBatch { checked: number; found: number; none: number; failed: number; specs: number; costUsd: number; remaining: number; samples: string[] }

/**
 * Μία παρτίδα: προϊόντα της βιτρίνας που δεν έχουν ελεγχθεί ακόμη στην πηγή (ή, με `retry`, βγήκαν none/failed πριν από
 * `retryDays` ημέρες). `web` μόνο για όσα ΔΕΝ έδωσε το Icecat — το δωρεάν πρώτα. `types`: περιορισμός σε ονόματα τύπων.
 */
export async function enrichBatch(opts: { source: EnrichSource; limit?: number; concurrency?: number; types?: string[]; retry?: boolean; retryDays?: number; minSpecsFromIcecat?: number } = { source: "icecat" }): Promise<EnrichBatch> {
  if (opts.source !== "icecat" && opts.source !== "web") throw new Error(`μαζικά μόνο icecat / web — η πηγή ${opts.source} τρέχει ανά προϊόν (enrichProduct)`);
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
