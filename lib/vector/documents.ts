import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { normalizeModel, specLines } from "@/lib/eprel/normalize";

/**
 * Το κείμενο που «διαβάζει» το LLM για κάθε προϊόν. Ένα έγγραφο ανά είδος,
 * γραμμένο σε φυσική γλώσσα ώστε η ερώτηση του πελάτη («ήσυχο πλυντήριο 9
 * κιλών για μικρό μπάνιο») να πέφτει κοντά του: μάρκα και όνομα, διαδρομή
 * κατηγορίας, περιγραφές, τι χαρακτηριστικά έχει ο τύπος προϊόντος,
 * διαστάσεις, εγγύηση, διαθεσιμότητα, και τα δηλωμένα στοιχεία του EPREL
 * όταν ο κωδικός εργοστασίου ταιριάζει με καταχώριση που έχουμε.
 *
 * v2: μπαίνουν και όσα ξέρει πια η βιτρίνα για το προϊόν — οι ΤΙΜΕΣ των χαρακτηριστικών του («Χωρητικότητα: 9 kg»),
 * οι ομογενοποιημένες διαστάσεις (εκ., Π × Υ × Β) και τα στοιχεία της ενεργειακής ετικέτας από την αντιστοίχιση
 * του EPREL. ΔΕΝ μπαίνουν τιμή και απόθεμα: αλλάζουν καθημερινά και θα ξαναπλήρωναν embedding κάθε φορά — αυτά τα
 * φιλτράρει ο Ερμής απευθείας στη βάση (lib/advisor/retrieve.ts). Όταν αλλάξει το κείμενο αλλάζει το hash και το
 * embedding ανανεώνεται μόνο του.
 */
export const DOC_VERSION = 2;

const stripHtml = (s: string) => s.replace(/<(br|\/p|\/li|\/div|\/h\d)\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
const cap = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, "")}…` : s);

export interface BuiltDoc { kind: "product"; refId: string; title: string; text: string; meta: Record<string, string | number | boolean | null>; hash: string }

export interface DocContext {
  brands: Map<number, string>; cat: Map<string, string>; groups: Map<number, { name: string; specs: string[] }>;
  eprel: Map<string, { cls: string | null; kwh: number | null; lines: string[] }>;
  /** ανά MTRL: ό,τι ξέρει η βιτρίνα για το προϊόν (φίλτρα με τιμές, διαστάσεις, γραμμές ενεργειακής ετικέτας) */
  shop: Map<string, { facets: string[]; dims: string | null; label: string[]; cls: string | null }>;
}

export async function loadDocContext(): Promise<DocContext> {
  const [brands, cats, groups, eprel, shopRows] = await Promise.all([
    db.brand.findMany({ where: { s1Id: { not: null } }, select: { s1Id: true, name: true } }),
    db.s1WebCategory.findMany({ where: { missing: false } }),
    db.s1SpecGroup.findMany({ where: { missing: false }, include: { specs: { where: { missing: false, active: true }, orderBy: { code: "asc" }, select: { name: true } } } }),
    db.eprelProduct.findMany({ select: { modelIdentifier: true, energyClass: true, annualKwh: true, data: true } }),
    db.product.findMany({ where: { source: "softone" }, select: {
      erpCode: true, energy: { select: { class: true } },
      facetValues: { orderBy: { facet: { sortNo: "asc" } }, select: { value: true, facet: { select: { label: true } } } },
      dimensions: { select: { source: true, w: true, h: true, d: true } },
      specs: { where: { source: "eprel" }, orderBy: { sortNo: "asc" }, select: { key: true, value: true } },
    } }),
  ]);
  const shop: DocContext["shop"] = new Map();
  for (const p of shopRows) {
    if (!p.erpCode) continue;
    const byFacet = new Map<string, string[]>();
    for (const v of p.facetValues) { const k = v.facet.label.replace(/\s*\([^)]*\)/, "").trim(); if (v.value !== "Όχι") byFacet.set(k, [...(byFacet.get(k) ?? []), v.value]); }
    const d = p.dimensions.find((x) => x.source === "manual") ?? p.dimensions.find((x) => x.source === "s1-desc") ?? p.dimensions.find((x) => x.source === "eprel");
    shop.set(p.erpCode, {
      facets: [...byFacet.entries()].map(([k, v]) => (v.length === 1 && v[0] === "Ναι" ? k : `${k}: ${v.join(", ")}`)),
      dims: d ? `πλάτος ${d.w} εκ., ύψος ${d.h} εκ., βάθος ${d.d} εκ.` : null,
      label: p.specs.map((x) => `${x.key}: ${x.value}`), cls: p.energy?.class ?? null,
    });
  }
  return {
    brands: new Map(brands.map((b) => [Number(b.s1Id), b.name])),
    cat: new Map(cats.map((c) => [c.key, c.name])),
    groups: new Map(groups.map((g) => [g.s1Id, { name: g.name, specs: g.specs.map((s) => s.name) }])),
    shop,
    eprel: new Map(eprel.map((e) => [normalizeModel(e.modelIdentifier), { cls: e.energyClass, kwh: e.annualKwh, lines: specLines(e.data).slice(0, 14).map((l) => `${l.label}: ${l.value}${l.unit ? ` ${l.unit}` : ""}`) }])),
  };
}

type Item = Awaited<ReturnType<typeof db.s1Item.findMany>>[number];

export function productDoc(it: Item, ctx: DocContext, model: string): BuiltDoc {
  const brand = it.manufacturerS1Id ? ctx.brands.get(it.manufacturerS1Id) ?? null : null;
  const c1 = it.webCat1 ? ctx.cat.get(`1:${it.webCat1}`) ?? null : null;
  const c2 = it.webCat1 && it.webCat2 ? ctx.cat.get(`2:${it.webCat1}:${it.webCat2}`) ?? null : null;
  const group = it.specGroupS1Id ? ctx.groups.get(it.specGroupS1Id) ?? null : null;
  const path = [c1, c2, group?.name].filter(Boolean).join(" › ");
  const ep = it.factoryCode ? ctx.eprel.get(normalizeModel(it.factoryCode)) ?? null : null;
  const sh = ctx.shop.get(String(it.mtrl)) ?? null;
  const title = [brand, it.name].filter(Boolean).join(" ");
  const lines = [
    title,
    path && `Κατηγορία: ${path}`,
    `Κωδικός: ${it.code}${it.factoryCode ? ` · μοντέλο κατασκευαστή ${it.factoryCode}` : ""}${it.barcode ? ` · barcode ${it.barcode}` : ""}`,
    it.name2 && it.name2 !== it.name ? it.name2 : null,
    it.shortDesc && cap(stripHtml(it.shortDesc), 600),
    it.longDesc && cap(stripHtml(it.longDesc), 1800),
    group?.specs.length ? `Χαρακτηριστικά αυτού του τύπου προϊόντος: ${cap(group.specs.join(", "), 500)}` : null,
    sh?.facets.length ? `Τι έχει αυτό το προϊόν: ${cap(sh.facets.join(" · "), 700)}` : null,
    sh?.dims ? `Διαστάσεις: ${sh.dims}${it.weightKg ? ` Βάρος ${it.weightKg} κιλά.` : ""}` : it.widthCm && it.heightCm && it.lengthCm ? `Διαστάσεις: πλάτος ${it.widthCm} εκ., ύψος ${it.heightCm} εκ., βάθος ${it.lengthCm} εκ.${it.weightKg ? ` Βάρος ${it.weightKg} κιλά.` : ""}` : null,
    sh?.label.length ? `Ενεργειακή ετικέτα (EPREL): ${sh.cls ? `κλάση ${sh.cls}. ` : ""}${sh.label.join(". ")}` : ep ? `Ενεργειακή ετικέτα EPREL: κλάση ${ep.cls ?? "—"}${ep.kwh ? `, ${ep.kwh} kWh τον χρόνο` : ""}. ${ep.lines.join(". ")}` : null,
    it.guaranteeMonths ? `Εγγύηση ${it.guaranteeMonths} μήνες${it.extWarranty ? ", με δυνατότητα επέκτασης εγγύησης" : ""}.` : it.extWarranty ? "Με δυνατότητα επέκτασης εγγύησης." : null,
  ].filter(Boolean) as string[];
  const text = lines.join("\n");
  const meta = { mtrl: it.mtrl, code: it.code, brand, brandS1Id: it.manufacturerS1Id, cat1: it.webCat1, cat2: it.webCat2, group: it.specGroupS1Id, price: it.priceRetail, active: it.active && !it.missing, hasEprel: !!ep };
  const hash = createHash("sha256").update(`${DOC_VERSION}|${model}|${text}`).digest("hex");
  return { kind: "product", refId: String(it.mtrl), title, text, meta, hash };
}
