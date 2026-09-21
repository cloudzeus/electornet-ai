import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { chat, getAi, overBudget, parseJson } from "@/lib/ai/openrouter";
import { catalogTree, dbProductsByIds, hrefOf, LISTED, type CatNode } from "@/lib/data/db-catalog";
import { searchVector } from "@/lib/vector/index";
import { dimsFor, fitMattersFor } from "@/lib/data/dims";
import { fitVerdict, type MySpace } from "@/lib/space/fit";
import type { Product } from "@/lib/data/types";
import type { AdvisorAnswer } from "./answer";

/**
 * Ο Ερμής πάνω στον πραγματικό κατάλογο. Το LLM ΔΕΝ «ξέρει» προϊόντα: καταλαβαίνει την ερώτηση, διαλέγει εργαλεία και
 * εξηγεί — τα προϊόντα, οι τιμές, το απόθεμα και τα χαρακτηριστικά έρχονται ΜΟΝΟ από τη βάση μας.
 *
 *   1. understand  (γρήγορο μοντέλο)  ερώτηση → τύποι προϊόντος του καταλόγου μας, προϋπολογισμός, μάρκες, όρια χώρου, ανάγκες
 *   2. mapNeeds    (γρήγορο μοντέλο)  ανάγκες («9 κιλά», «wifi») → ΤΙΜΕΣ των φίλτρων που έχει όντως ο τύπος στο ERP
 *   3. retrieve    (βάση + pgvector)  φίλτρα SQL → κατάταξη με σημασιολογική ομοιότητα, απόθεμα, τιμή· χαλάρωση όταν δεν βγαίνει τίποτα
 *   4. compose     (κύριο μοντέλο)    από ≤ 8 υποψήφια με πλήρες δελτίο στοιχείων διαλέγει έως 3 και τεκμηριώνει — μόνο με όσα του δόθηκαν
 *
 * Κάθε βήμα έχει ντετερμινιστική εφεδρεία: χωρίς κλειδί / όριο κόστους / αποτυχία, ο Ερμής απαντά από τη βάση με κανόνες.
 */
export interface AdvisorInput { q: string; prev?: string; space?: MySpace | null; pid?: string }
export interface AdvisorContext { name: string; commerce: { freeShippingFrom: number; returnDays: number; warrantyYears: number; maxInstalments: number; noCardInstalments: { min: number; max: number; months: number }; codMax: number; codFee: number; clickCollectHours: number } }

/** Τα δύο βήματα κατανόησης θέλουν ταχύτητα, όχι ευγλωττία: μικρό γρήγορο μοντέλο (αλλάζει με ADVISOR_ROUTER_MODEL). Η απάντηση γράφεται από το κύριο. */
const ROUTER = process.env.ADVISOR_ROUTER_MODEL || "google/gemini-3.5-flash-lite";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ς/g, "σ");
const clean = (label: string) => label.replace(/\s*\([^)]*\)/, "").trim();
const eur = (n: number) => `${n.toLocaleString("el-GR", { maximumFractionDigits: 2 })} €`;

// ---------- 1. Κατανόηση ----------

interface TypeRow { i: number; node: CatNode; path: CatNode[]; label: string; hint: string }
let hintCache: { at: number; v: Map<string, string> } | null = null;
/**
 * Τι ΠΩΛΕΙΤΑΙ πραγματικά κάτω από κάθε τύπο, από τους τίτλους των προϊόντων του: οι «Φριτέζες» είναι air fryers, τα «Handsfree
 * Bluetooth» είναι earbuds. Το όνομα του τύπου στο ERP δεν το λέει — οι συχνότερες λέξεις των τίτλων το λένε, χωρίς χειροκίνητη λίστα.
 */
async function typeHints(): Promise<Map<string, string>> {
  if (hintCache && Date.now() - hintCache.at < 30 * 60_000) return hintCache.v;
  const rows = await db.product.findMany({ where: LISTED, select: { categoryId: true, title: true, brand: { select: { name: true } } } });
  const by = new Map<string, { n: number; words: Map<string, number> }>();
  for (const r of rows) {
    const e = by.get(r.categoryId) ?? { n: 0, words: new Map<string, number>() }; e.n++;
    const brand = norm(r.brand.name);
    for (const w of new Set(norm(r.title).split(/[^a-zα-ω]+/).filter((x) => x.length >= 4 && x !== brand))) e.words.set(w, (e.words.get(w) ?? 0) + 1);
    by.set(r.categoryId, e);
  }
  const v = new Map([...by.entries()].map(([id, e]) => [id, [...e.words.entries()].filter(([, c]) => c >= Math.max(3, e.n * 0.12)).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w).join(", ")]));
  hintCache = { at: Date.now(), v };
  return v;
}
async function typeList(): Promise<TypeRow[]> {
  const [t, hints] = await Promise.all([catalogTree(), typeHints()]);
  const up = (n: CatNode): CatNode[] => (n.parentId && t.byId.get(n.parentId) ? [...up(t.byId.get(n.parentId)!), n] : [n]);
  return [...t.byId.values()].filter((n) => n.depth === 2 && n.count > 0).map((node, i) => { const path = up(node); return { i, node, path, label: path.map((p) => p.name).join(" › "), hint: hints.get(node.id) ?? "" }; });
}

interface Understood {
  kind: "products" | "info" | "other";
  types: number[]; brands: string[]; minPrice: number | null; maxPrice: number | null;
  maxWidth: number | null; maxHeight: number | null; maxDepth: number | null;
  inStockOnly: boolean; needs: string[]; priority: "price" | "quality" | "energy" | "quiet" | null;
  modelCodes: string[]; search: string; understood: string[];
}

async function understand(input: AdvisorInput, types: TypeRow[], viewing: Product | null): Promise<Understood | null> {
  const r = await chat({
    feature: "advisor-understand", accounting: "background", model: ROUTER, json: true, maxTokens: 500, temperature: 0, timeoutMs: 9000, reasoning: "low",
    messages: [
      { role: "system", content: `Αναλύεις την ερώτηση πελάτη ελληνικού e-shop ηλεκτρικών. Απαντάς ΜΟΝΟ με JSON:
{"kind":"products"|"info"|"other","types":number[],"brands":string[],"minPrice":number|null,"maxPrice":number|null,"maxWidth":number|null,"maxHeight":number|null,"maxDepth":number|null,"inStockOnly":boolean,"needs":string[],"priority":"price"|"quality"|"energy"|"quiet"|null,"modelCodes":string[],"search":string,"understood":string[]}
- kind: "products" όταν ψάχνει/συγκρίνει προϊόν· "info" για παράδοση, δόσεις, επιστροφές, εγγύηση, εγκατάσταση, καταστήματα· "other" για οτιδήποτε άσχετο.
- types: έως 3 αριθμοί από τη ΛΙΣΤΑ ΤΥΠΩΝ που ταιριάζουν στο προϊόν που ζητά (π.χ. «κάτι να στεγνώνω ρούχα» → Στεγνωτήρια). Ποτέ αξεσουάρ όταν ζητά τη συσκευή. Άδειο αν δεν ζητά συγκεκριμένο είδος.
- maxWidth/maxHeight/maxDepth σε εκατοστά, μόνο αν ο πελάτης δίνει χώρο («χωράει σε 60 εκ. πλάτος», «ύψος έως 1,70» → 170).
- needs: κάθε απαίτηση χαρακτηριστικού ως σύντομη φράση («9 κιλά», «wifi», «inverter», «55 ιντσών», «λευκό», «no frost»). ΟΧΙ τιμή, μάρκα, διαστάσεις χώρου.
- priority: "price" (φθηνό/οικονομικό), "energy" (χαμηλή κατανάλωση), "quiet" (αθόρυβο), "quality" (το καλύτερο/κορυφαίο), αλλιώς null.
- modelCodes: κωδικοί μοντέλου όπως γράφτηκαν («WW90T534»).
- search: η ουσία της ανάγκης σε μία φυσική φράση για σημασιολογική αναζήτηση.
- understood: 2–5 σύντομες ελληνικές φράσεις με ό,τι κατάλαβες («πλυντήριο ρούχων», «έως 500 €»).
Αν υπάρχει ΠΡΟΗΓΟΥΜΕΝΗ ερώτηση και η νέα τη συνεχίζει («και σε λευκό;», «κάτι φθηνότερο;»), συνδύασέ τες. Αν βλέπει προϊόν και λέει «αυτό», ο τύπος είναι ο τύπος εκείνου.

ΛΙΣΤΑ ΤΥΠΩΝ (αριθμός|κατηγορία › τύπος|συχνές λέξεις στους τίτλους των προϊόντων του):
${types.map((t) => `${t.i}|${t.path.slice(-2).map((p) => p.name).join(" › ")}|${t.hint}`).join("\n")}` }, // η λίστα στο σταθερό μέρος: ίδιο πρόθεμα σε κάθε κλήση → το κρατά η cache του παρόχου
      { role: "user", content: `${viewing ? `ΒΛΕΠΕΙ ΤΩΡΑ: ${viewing.brand} ${viewing.title} (${viewing.path?.map((p) => p.name).join(" › ") ?? ""})\n` : ""}${input.prev ? `ΠΡΟΗΓΟΥΜΕΝΗ ΕΡΩΤΗΣΗ: ${input.prev.slice(0, 300)}\n` : ""}ΕΡΩΤΗΣΗ: ${input.q.slice(0, 500)}` },
    ],
  }).catch(() => null);
  const j = r ? parseJson<Partial<Understood>>(r.text) : null;
  if (!j) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()).slice(0, 8) : []);
  return {
    kind: j.kind === "info" || j.kind === "other" ? j.kind : "products",
    types: (Array.isArray(j.types) ? j.types : []).filter((n): n is number => Number.isInteger(n) && n >= 0 && n < types.length).slice(0, 3),
    brands: list(j.brands), minPrice: num(j.minPrice), maxPrice: num(j.maxPrice), maxWidth: num(j.maxWidth), maxHeight: num(j.maxHeight), maxDepth: num(j.maxDepth),
    inStockOnly: j.inStockOnly === true, needs: list(j.needs), priority: (["price", "quality", "energy", "quiet"] as const).find((p) => p === j.priority) ?? null,
    modelCodes: list(j.modelCodes), search: typeof j.search === "string" && j.search.trim() ? j.search.trim() : input.q, understood: list(j.understood),
  };
}

/** Εφεδρεία χωρίς LLM: τύπος από τις λέξεις της ερώτησης πάνω στα ονόματα των τύπων, προϋπολογισμός με κανόνα. */
function understandByRules(input: AdvisorInput, types: TypeRow[]): Understood {
  const n = norm(input.q), words = n.split(/[^a-z0-9α-ω]+/).filter((w) => w.length >= 4);
  const scored = types.map((t) => ({ t, s: words.reduce((a, w, i) => a + (norm(t.node.name).includes(w.slice(0, Math.max(4, w.length - 2))) ? 1 / (1 + i) : 0), 0) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || b.t.node.count - a.t.node.count);
  const budget = n.match(/(?:κατω|μεχρι|εωσ|under|<)\s*(?:απο\s*)?(\d{2,5})/)?.[1] ?? n.match(/(\d{3,5})\s*(?:€|ευρω)/)?.[1];
  return { kind: "products", types: scored.slice(0, 2).map((x) => x.t.i), brands: [], minPrice: null, maxPrice: budget ? Number(budget) : null, maxWidth: null, maxHeight: null, maxDepth: null, inStockOnly: false, needs: [], priority: /φθην|οικονομικ/.test(n) ? "price" : /αθορυβ|ησυχ/.test(n) ? "quiet" : /ρευμα|καταναλωσ/.test(n) ? "energy" : null, modelCodes: [], search: input.q, understood: [...scored.slice(0, 1).map((x) => x.t.node.name), ...(budget ? [`έως ${budget} €`] : [])] };
}

// ---------- 2. Ανάγκες → τιμές φίλτρων ----------

interface FacetInfo { label: string; raw: string[]; values: { value: string; count: number }[] }
const facetCache = new Map<string, { at: number; v: FacetInfo[] }>();
async function facetsOf(typeIds: string[]): Promise<FacetInfo[]> {
  const key = [...typeIds].sort().join(","), hit = facetCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.v;
  const v = await loadFacets(typeIds); facetCache.set(key, { at: Date.now(), v });
  return v;
}
async function loadFacets(typeIds: string[]): Promise<FacetInfo[]> {
  const facets = await db.facet.findMany({ where: { categoryId: { in: typeIds }, productCount: { gt: 0 } }, orderBy: { sortNo: "asc" }, select: { id: true, label: true } });
  if (!facets.length) return [];
  const counts = await db.productFacetValue.groupBy({ by: ["facetId", "value"], where: { facetId: { in: facets.map((f) => f.id) }, product: LISTED }, _count: { _all: true } });
  const out = new Map<string, FacetInfo>();
  for (const f of facets) {
    const k = clean(f.label), e = out.get(k) ?? { label: k, raw: [], values: [] };
    if (!e.raw.includes(f.label)) e.raw.push(f.label);
    for (const c of counts.filter((x) => x.facetId === f.id)) { const v = e.values.find((x) => x.value === c.value); if (v) v.count += c._count._all; else e.values.push({ value: c.value, count: c._count._all }); }
    out.set(k, e);
  }
  const numeric = (s: string) => parseFloat(s.replace(/\./g, "").replace(",", "."));
  return [...out.values()].filter((f) => f.values.length).map((f) => ({ ...f, values: f.values.sort((a, b) => (isNaN(numeric(a.value)) || isNaN(numeric(b.value)) ? b.count - a.count : numeric(a.value) - numeric(b.value))).slice(0, 40) }));
}

interface FacetFilter { label: string; raw: string[]; values: string[]; need: string }
async function mapNeeds(needs: string[], facets: FacetInfo[]): Promise<{ filters: FacetFilter[]; unmapped: string[] }> {
  if (!needs.length || !facets.length) return { filters: [], unmapped: needs };
  const r = await chat({
    feature: "advisor-facets", accounting: "background", model: ROUTER, json: true, maxTokens: 600, temperature: 0, timeoutMs: 9000, reasoning: "low",
    messages: [
      { role: "system", content: `Αντιστοιχίζεις απαιτήσεις πελάτη σε ΤΙΜΕΣ φίλτρων ενός e-shop. Απαντάς ΜΟΝΟ με JSON {"filters":[{"facet":string,"values":string[],"need":string}],"unmapped":string[]}.
- "facet" και "values" ΑΚΡΙΒΩΣ όπως γράφονται στη λίστα. Ποτέ τιμή που δεν υπάρχει.
- Για ποσότητες διάλεξε ΟΛΕΣ τις τιμές που ικανοποιούν την απαίτηση: «9 κιλά» → 9 kg και ό,τι είναι πολύ κοντά (8–10)· «τουλάχιστον 9 κιλά» → 9 και πάνω· «55 ιντσών» → 55" (και 54"–58" αν υπάρχουν)· «μεγάλη οθόνη» → τις μεγαλύτερες.
- Ναι/Όχι φίλτρα: «με wifi» → ["Ναι"].
- Ό,τι δεν αντιστοιχεί σε κανένα φίλτρο πάει στο "unmapped" (θα χρησιμοποιηθεί ως ελεύθερο κείμενο).` },
      { role: "user", content: `ΦΙΛΤΡΑ (όνομα: τιμές):\n${facets.map((f) => `${f.label}: ${f.values.map((v) => v.value).join(" | ")}`).join("\n")}\n\nΑΠΑΙΤΗΣΕΙΣ: ${JSON.stringify(needs)}` },
    ],
  }).catch(() => null);
  const j = r ? parseJson<{ filters?: { facet?: string; values?: string[]; need?: string }[]; unmapped?: string[] }>(r.text) : null;
  if (!j) return { filters: [], unmapped: needs };
  const filters: FacetFilter[] = [];
  for (const f of j.filters ?? []) {
    const info = facets.find((x) => x.label === f.facet); if (!info) continue;
    const values = (f.values ?? []).filter((v) => info.values.some((x) => x.value === v)); // μόνο τιμές που υπάρχουν στη βάση
    if (values.length && values.length < info.values.length) filters.push({ label: info.label, raw: info.raw, values, need: f.need ?? info.label });
  }
  return { filters, unmapped: (j.unmapped ?? []).filter((x) => typeof x === "string") };
}

// ---------- 3. Ανάκτηση από τη βάση ----------

interface Cand { id: string; erpCode: string | null; price: number | null; stock: number; score: number; noise: number | null; kwh: number | null; cls: string | null }
const CLASS_ORDER = ["A+++", "A++", "A+", "A", "B", "C", "D", "E", "F", "G"];

async function retrieve(u: Understood, typeIds: string[], filters: FacetFilter[], search: string) {
  const relaxed: string[] = [];
  const brandWhere: Prisma.ProductWhereInput[] = u.brands.length ? [{ OR: u.brands.map((b) => ({ brand: { name: { equals: b, mode: "insensitive" as const } } })) }] : [];
  const build = (fs: FacetFilter[], maxPrice: number | null, brands = true): Prisma.ProductWhereInput => ({ AND: [
    LISTED, ...(typeIds.length ? [{ categoryId: { in: typeIds } }] : []), ...(brands ? brandWhere : []),
    ...(maxPrice ? [{ price: { gt: 0, lte: maxPrice } }] : []), ...(u.minPrice ? [{ price: { gte: u.minPrice } }] : []), ...(u.inStockOnly ? [{ stock: { gt: 0 } }] : []),
    ...fs.map((f) => ({ facetValues: { some: { facet: { label: { in: f.raw } }, value: { in: f.values } } } })),
  ] });
  const select = { id: true, brandId: true, erpCode: true, price: true, stock: true, energy: { select: { class: true, eprel: { select: { annualKwh: true, noise: true } } } }, dimensions: { select: { source: true, w: true, h: true, d: true } } } satisfies Prisma.ProductSelect;
  const fetch = (w: Prisma.ProductWhereInput) => db.product.findMany({ where: w, take: 400, orderBy: [{ stock: "desc" }, { price: "desc" }], select });

  const active = [...filters];
  let maxPrice = u.maxPrice, rows = await fetch(build(active, maxPrice));
  // Χαλάρωση, από το λιγότερο δεσμευτικό: τελευταία απαίτηση → … → προϋπολογισμός +15 % → μάρκα. Ο Ερμής το λέει στον πελάτη.
  while (rows.length < 2 && active.length) { const dropped = active.pop()!; relaxed.push(`δεν υπάρχει με «${dropped.need}»`); rows = await fetch(build(active, maxPrice)); }
  if (rows.length < 2 && maxPrice) { maxPrice = Math.round(maxPrice * 1.15); const more = await fetch(build(active, maxPrice)); if (more.length > rows.length) { rows = more; relaxed.push(`τίποτα έως ${eur(u.maxPrice!)} — κοίταξα έως ${eur(maxPrice)}`); } }
  if (!rows.length && brandWhere.length) { rows = await fetch(build(active, maxPrice, false)); if (rows.length) relaxed.push(`όχι από ${u.brands.join(", ")} — άλλες μάρκες`); }

  // όρια χώρου: πάνω στις ομογενοποιημένες διαστάσεις· όσα δεν έχουν διαστάσεις δεν μπορούμε να τα υποσχεθούμε
  if (u.maxWidth || u.maxHeight || u.maxDepth) {
    const fits = rows.filter((r) => { const d = r.dimensions.find((x) => x.source === "manual") ?? r.dimensions.find((x) => x.source === "s1-desc") ?? r.dimensions.find((x) => x.source === "eprel"); return d && (!u.maxWidth || d.w <= u.maxWidth) && (!u.maxHeight || d.h <= u.maxHeight) && (!u.maxDepth || d.d <= u.maxDepth); });
    if (fits.length) rows = fits; else relaxed.push("κανένα με δηλωμένες διαστάσεις μέσα στον χώρο που έδωσες");
  }

  const sims = new Map<string, number>();
  if (rows.length > 1) { const hits = await searchVector(search, { refIds: rows.map((r) => r.erpCode).filter(Boolean) as string[], activeOnly: false }, 50).catch(() => []); for (const h of hits) sims.set(h.refId, h.score); }
  const cands: Cand[] = rows.map((r) => ({ id: r.id, erpCode: r.erpCode, price: r.price, stock: r.stock, noise: r.energy?.eprel?.noise ?? null, kwh: r.energy?.eprel?.annualKwh ?? null, cls: r.energy?.class ?? null,
    score: (sims.get(r.erpCode ?? "") ?? 0) + (r.stock > 0 ? 0.06 : 0) + (r.price && r.price > 0 ? 0.05 : -0.25) + (r.energy ? 0.02 : 0) }));
  cands.sort((a, b) => b.score - a.score);
  const top = cands.slice(0, 24);
  if (u.priority === "price") top.sort((a, b) => (a.price || 1e9) - (b.price || 1e9));
  if (u.priority === "quiet") top.sort((a, b) => (a.noise ?? 999) - (b.noise ?? 999));
  if (u.priority === "energy") top.sort((a, b) => (CLASS_ORDER.indexOf(a.cls ?? "") + 1 || 99) - (CLASS_ORDER.indexOf(b.cls ?? "") + 1 || 99) || (a.kwh ?? 1e9) - (b.kwh ?? 1e9));
  if (u.priority === "quality") top.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
  // Ένας σοβαρός πωλητής δείχνει εύρος, όχι οκτώ παραλλαγές της ίδιας σειράς: έως 2 ανά μάρκα στα υποψήφια
  const brandOf = new Map(rows.map((r) => [r.id, r.brandId])), perBrand = new Map<string, number>(), picked: Cand[] = [];
  for (const c of top) { const b = brandOf.get(c.id) ?? ""; if ((perBrand.get(b) ?? 0) >= 2 && !u.brands.length) continue; perBrand.set(b, (perBrand.get(b) ?? 0) + 1); picked.push(c); if (picked.length === 8) break; }
  return { ids: (picked.length >= 3 ? picked : top.slice(0, 8)).map((c) => c.id), total: rows.length, relaxed, applied: active };
}

async function byModelCode(codes: string[]): Promise<string[]> {
  if (!codes.length) return [];
  const rows = await db.product.findMany({ where: { AND: [LISTED, { OR: codes.flatMap((c) => [{ sku: { contains: c, mode: "insensitive" as const } }, { title: { contains: c, mode: "insensitive" as const } }, { modelCode: { contains: c, mode: "insensitive" as const } }, { ean: c }]) }] }, take: 3, select: { id: true } });
  return rows.map((r) => r.id);
}

// ---------- 4. Δελτίο στοιχείων και σύνθεση ----------

function sheet(p: Product, space: MySpace | null | undefined) {
  const dims = p.dims ?? null;
  const fit = space && dims && fitMattersFor(p) ? fitVerdict(dimsFor(p)!, space) : null;
  const label = (p.specs ?? []).filter((s) => s.group === "Από την ενεργειακή ετικέτα").map((s) => `${s.key}: ${s.value}`);
  const facts = (p.attrs ?? []).filter((a) => a.value !== "Όχι" && !/^Διαστάσεις/.test(a.key) && a.key !== "Ενεργειακή κλάση").slice(0, 16).map((a) => (a.value === "Ναι" ? a.key : `${a.key}: ${a.value}`));
  return {
    brand: p.brand, title: p.title, price: p.noPrice ? null : p.price,
    availability: p.availability.kind === "in-stock" ? `άμεσα διαθέσιμο${p.stockLeft ? ` (τελευταία ${p.stockLeft})` : ""}` : p.noPrice ? "τιμή και διαθεσιμότητα στο κατάστημα" : "κατόπιν παραγγελίας",
    energyClass: p.energy?.cls ?? null, kwhPerYear: p.energy?.kwh ?? null, label, facts, highlights: (p.highlights ?? []).slice(0, 3),
    dimsCm: dims ? { w: dims.w, h: dims.h, d: dims.d } : null,
    fit: fit ? (fit.kind === "fits" ? `χωράει, περιθώριο ${fit.margin.toFixed(0)} εκ.` : fit.kind === "tight" ? `οριακά, περιθώριο ${fit.margin.toFixed(0)} εκ.` : `δεν χωράει: λείπουν ${fit.by.toFixed(0)} εκ. ${fit.where === "door" ? "στην πόρτα" : "στην εσοχή"}`) : null,
    fitKind: fit?.kind ?? null,
  };
}
type Sheet = ReturnType<typeof sheet>;

const policy = (c: AdvisorContext["commerce"]) => [
  `Δωρεάν μεταφορικά για παραγγελίες από ${c.freeShippingFrom} €.`, `Παραλαβή από κατάστημα σε ${c.clickCollectHours} ώρες (click & collect), 350 καταστήματα-μέλη σε όλη την Ελλάδα.`,
  `Δόσεις χωρίς κάρτα για ποσά ${c.noCardInstalments.min}–${c.noCardInstalments.max} €, έως ${c.noCardInstalments.months} μήνες· με κάρτα έως ${c.maxInstalments} άτοκες.`,
  `Αντικαταβολή έως ${c.codMax} € (χρέωση ${c.codFee} €).`, `Επιστροφή εντός ${c.returnDays} ημερών.`, `Εγγύηση ${c.warrantyYears} έτη, με δυνατότητα επέκτασης.`,
  "Εγκατάσταση και σύνδεση από τον τεχνικό του καταστήματος της περιοχής· απόσυρση της παλιάς συσκευής.",
];

async function compose(input: AdvisorInput, ctx: AdvisorContext, u: Understood, sheets: Sheet[], viewing: Sheet | null, notes: { relaxed: string[]; total: number; typeNames: string[] }) {
  const r = await chat({
    feature: "advisor", accounting: "background", json: true, maxTokens: 1100, timeoutMs: 16000, reasoning: "low", temperature: 0.3,
    messages: [
      { role: "system", content: `Είσαι ο ${ctx.name}, έμπειρος σύμβουλος πωλήσεων του euronics.gr. Μιλάς ελληνικά στον ενικό, σοβαρά και με ακρίβεια, όπως ένας τεχνικά καταρτισμένος πωλητής που ξέρει το εμπόρευμά του: συγκεκριμένα νούμερα, καθαρή σύσταση, καμία υπερβολή, κανένα θαυμαστικό, καμία γενικολογία.
ΑΠΑΡΑΒΑΤΟΙ ΚΑΝΟΝΕΣ
- Προτείνεις ΜΟΝΟ προϊόντα από τη λίστα ΥΠΟΨΗΦΙΑ και αναφέρεις ΜΟΝΟ στοιχεία που υπάρχουν στο δελτίο τους ή στην ΠΟΛΙΤΙΚΗ ΚΑΤΑΣΤΗΜΑΤΟΣ. Αν ένα στοιχείο λείπει, λες ότι δεν το έχουμε καταγεγραμμένο — δεν το συμπληρώνεις από γενική γνώση.
- Ποτέ προϊόν, τιμή, διαθεσιμότητα ή χαρακτηριστικό εκτός δεδομένων. Ποτέ ανταγωνιστές ή άλλα καταστήματα.
- Αν στις ΣΗΜΕΙΩΣΕΙΣ γράφει ότι κάτι δεν βρέθηκε όπως ζητήθηκε, το λες ευθέως και εξηγείς ποια είναι η κοντινότερη λύση.
- Διαλέγεις έως 3, το καλύτερο πρώτο. Όπου έχει νόημα εξηγείς τη ΔΙΑΦΟΡΑ μεταξύ τους (τι παίρνει παραπάνω με τα επιπλέον χρήματα). Προτιμάς τα άμεσα διαθέσιμα όταν είναι ισάξια.
- Αν δίνεται «fit», το λαμβάνεις υπόψη: δεν προτείνεις κάτι που δεν χωράει χωρίς να το πεις.
- Κλείνεις με ΜΙΑ στοχευμένη ερώτηση που θα στένευε την επιλογή (χώρος, άτομα στο σπίτι, χρήση), ή με το επόμενο βήμα.
- Δεν αναφέρεις ότι είσαι AI, ούτε «σύμφωνα με τα δεδομένα».
Απαντάς ΜΟΝΟ με JSON: {"text": string (έως 75 λέξεις), "picks": [{"i": number, "why": string (έως 16 λέξεις, συγκεκριμένα στοιχεία του προϊόντος)}]}. Για ερώτηση πολιτικής (kind=info) ή χωρίς υποψήφια: picks=[].` },
      { role: "user", content: JSON.stringify({ question: input.q, previousQuestion: input.prev ?? null, kind: u.kind, understood: u.understood, priority: u.priority, customerSpace: input.space ?? null, viewingNow: viewing, notes: { productTypes: notes.typeNames, matchingInCatalogue: notes.total, relaxed: notes.relaxed }, storePolicy: policy(ctx.commerce), candidates: sheets.map((s, i) => ({ i, ...s, fitKind: undefined })) }) },
    ],
  }).catch(() => null);
  const j = r ? parseJson<{ text?: string; picks?: { i?: number; why?: string }[] }>(r.text) : null;
  if (!j?.text || j.text.trim().length < 20) return null;
  const picks = (j.picks ?? []).filter((p): p is { i: number; why: string } => Number.isInteger(p.i) && p.i! >= 0 && p.i! < sheets.length && typeof p.why === "string").filter((p, k, a) => a.findIndex((x) => x.i === p.i) === k).slice(0, 3);
  return { text: j.text.trim(), picks };
}

// ---------- Ενορχήστρωση ----------

export async function smartAdvisor(input: AdvisorInput, ctx: AdvisorContext): Promise<AdvisorAnswer | null> {
  const t0 = Date.now(), lap: string[] = [], mark = (k: string) => { if (process.env.ADVISOR_DEBUG) lap.push(`${k} ${Date.now() - t0}ms`); };
  const types = await typeList();
  if (!types.length) return null; // δεν υπάρχει κατάλογος στη βάση → ο καλών πέφτει στο demo
  const cfg = await getAi();
  const ai = !!cfg && cfg.advisorEnabled && !(await overBudget(cfg));
  const viewing = input.pid ? (await dbProductsByIds([input.pid]).catch(() => []))[0] ?? null : null;

  const u = (ai ? await understand(input, types, viewing) : null) ?? understandByRules(input, types);
  mark("understand");
  if (u.kind === "other" && !u.types.length && !u.modelCodes.length) u.kind = "info"; // άσχετη ερώτηση: ευγενική απάντηση από την πολιτική, χωρίς προϊόντα
  let chosen = u.types.map((i) => types[i]);
  if (!chosen.length && viewing?.typeSlug && u.kind === "products") { const t = types.find((x) => x.node.slug === viewing.typeSlug); if (t) chosen = [t]; }

  let ids: string[] = [], total = 0, relaxed: string[] = [];
  if (u.kind === "products") {
    const typeIds = chosen.map((t) => t.node.id);
    const { filters, unmapped } = ai && chosen.length ? await mapNeeds(u.needs, await facetsOf(typeIds)) : { filters: [], unmapped: u.needs };
    mark("facets");
    const search = [u.search, ...unmapped].join(" · ");
    const [exact, found] = await Promise.all([byModelCode(u.modelCodes), chosen.length || u.brands.length || u.maxPrice ? retrieve(u, typeIds, filters, search) : Promise.resolve({ ids: [] as string[], total: 0, relaxed: [] as string[], applied: [] as FacetFilter[] })]);
    ids = [...new Set([...exact, ...found.ids])].filter((id) => id !== viewing?.id || u.modelCodes.length > 0).slice(0, 8);
    total = found.total; relaxed = found.relaxed;
    for (const f of found.applied) if (!u.understood.some((x) => norm(x).includes(norm(f.need)))) u.understood.push(f.need);
  }
  mark("retrieve");
  const loaded = ids.length ? await dbProductsByIds(ids) : [];
  const products = ids.map((id) => loaded.find((p) => p.id === id)).filter((p): p is Product => !!p);
  const sheets = products.map((p) => sheet(p, input.space));

  const written = ai ? await compose(input, ctx, u, sheets, viewing ? sheet(viewing, input.space) : null, { relaxed, total, typeNames: chosen.map((t) => t.node.name) }) : null;
  mark("compose"); if (process.env.ADVISOR_DEBUG) console.log("      [advisor]", lap.join(" · "));
  const picks = written?.picks.length ? written.picks : sheets.slice(0, 3).map((s, i) => ({ i, why: [s.energyClass ? `κλάση ${s.energyClass}` : null, ...s.facts.slice(0, 2), s.availability].filter(Boolean).join(" · ") }));
  const text = written?.text ?? (products.length
    ? `${chosen.length ? `Από ${total} ${chosen[0].node.name.toLowerCase()} του καταλόγου` : "Από τον κατάλογο"}${u.maxPrice ? ` έως ${eur(u.maxPrice)}` : ""}, αυτά ταιριάζουν περισσότερο.${relaxed.length ? ` Σημείωση: ${relaxed.join("· ")}.` : ""}`
    : u.kind === "info" ? policy(ctx.commerce).slice(0, 3).join(" ") : "Δεν βρήκα στον κατάλογό μας κάτι που να ταιριάζει σε αυτό που περιγράφεις. Πες μου το είδος της συσκευής και τον προϋπολογισμό σου.");

  return {
    q: input.q, understood: u.understood, text,
    products: picks.map(({ i, why }) => { const p = products[i], s = sheets[i]; return { id: p.id, slug: p.slug, brand: p.brand, title: p.title, price: p.price, wasPrice: p.wasPrice, image: p.image ?? null, why, fit: (s.fitKind ?? undefined) as "fits" | "tight" | "no" | undefined }; }),
    href: chosen.length ? { label: `Όλα: ${chosen[0].node.name}`, href: `${hrefOf(chosen[0].path)}${u.maxPrice ? `?max=${u.maxPrice}` : ""}` } : undefined,
  };
}
