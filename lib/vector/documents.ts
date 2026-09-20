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
 * Οι τιμές χαρακτηριστικών ανά είδος δεν υπάρχουν ακόμη στον καθρέφτη (δεν
 * εκτίθενται από το ERP)· όταν έρθουν, μπαίνουν εδώ σε μία γραμμή και όλα τα
 * embeddings ανανεώνονται μόνα τους, γιατί αλλάζει το hash.
 */
export const DOC_VERSION = 1;

const stripHtml = (s: string) => s.replace(/<(br|\/p|\/li|\/div|\/h\d)\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
const cap = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, "")}…` : s);

export interface BuiltDoc { kind: "product"; refId: string; title: string; text: string; meta: Record<string, string | number | boolean | null>; hash: string }

export interface DocContext {
  brands: Map<number, string>; cat: Map<string, string>; groups: Map<number, { name: string; specs: string[] }>;
  eprel: Map<string, { cls: string | null; kwh: number | null; lines: string[] }>;
}

export async function loadDocContext(): Promise<DocContext> {
  const [brands, cats, groups, eprel] = await Promise.all([
    db.brand.findMany({ where: { s1Id: { not: null } }, select: { s1Id: true, name: true } }),
    db.s1WebCategory.findMany({ where: { missing: false } }),
    db.s1SpecGroup.findMany({ where: { missing: false }, include: { specs: { where: { missing: false, active: true }, orderBy: { code: "asc" }, select: { name: true } } } }),
    db.eprelProduct.findMany({ select: { modelIdentifier: true, energyClass: true, annualKwh: true, data: true } }),
  ]);
  return {
    brands: new Map(brands.map((b) => [Number(b.s1Id), b.name])),
    cat: new Map(cats.map((c) => [c.key, c.name])),
    groups: new Map(groups.map((g) => [g.s1Id, { name: g.name, specs: g.specs.map((s) => s.name) }])),
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
  const title = [brand, it.name].filter(Boolean).join(" ");
  const lines = [
    title,
    path && `Κατηγορία: ${path}`,
    `Κωδικός: ${it.code}${it.factoryCode ? ` · μοντέλο κατασκευαστή ${it.factoryCode}` : ""}${it.barcode ? ` · barcode ${it.barcode}` : ""}`,
    it.name2 && it.name2 !== it.name ? it.name2 : null,
    it.shortDesc && cap(stripHtml(it.shortDesc), 600),
    it.longDesc && cap(stripHtml(it.longDesc), 1800),
    group?.specs.length ? `Χαρακτηριστικά αυτού του τύπου προϊόντος: ${cap(group.specs.join(", "), 500)}` : null,
    it.widthCm && it.heightCm && it.lengthCm ? `Διαστάσεις: πλάτος ${it.widthCm} εκ., ύψος ${it.heightCm} εκ., βάθος ${it.lengthCm} εκ.${it.weightKg ? ` Βάρος ${it.weightKg} κιλά.` : ""}` : null,
    ep ? `Ενεργειακή ετικέτα EPREL: κλάση ${ep.cls ?? "—"}${ep.kwh ? `, ${ep.kwh} kWh τον χρόνο` : ""}. ${ep.lines.join(". ")}` : null,
    it.guaranteeMonths ? `Εγγύηση ${it.guaranteeMonths} μήνες${it.extWarranty ? ", με δυνατότητα επέκτασης εγγύησης" : ""}.` : it.extWarranty ? "Με δυνατότητα επέκτασης εγγύησης." : null,
    it.availText ? `Διαθεσιμότητα: ${it.availText}` : null,
    it.priceRetail ? `Τιμή καρτέλας: ${it.priceRetail.toLocaleString("el-GR")} €` : null,
  ].filter(Boolean) as string[];
  const text = lines.join("\n");
  const meta = { mtrl: it.mtrl, code: it.code, brand, brandS1Id: it.manufacturerS1Id, cat1: it.webCat1, cat2: it.webCat2, group: it.specGroupS1Id, price: it.priceRetail, active: it.active && !it.missing, hasEprel: !!ep };
  const hash = createHash("sha256").update(`${DOC_VERSION}|${model}|${text}`).digest("hex");
  return { kind: "product", refId: String(it.mtrl), title, text, meta, hash };
}
