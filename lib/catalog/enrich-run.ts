import "server-only";
import { db } from "@/lib/db";
import { channel3Usage, enrichFromChannel3 } from "./channel3";
import { matchCodes } from "./channel3-core";
import { enrichFromIcecat, enrichFromShops, enrichFromWeb, storeEnrichment, type EnrichResult, type EnrichSource } from "./enrich";

/**
 * Ροή εμπλουτισμού ΕΝΟΣ προϊόντος, με τη σειρά: Icecat (δωρεάν) → Channel3 (αν το Icecat έδωσε < 8 χαρακτηριστικά, με
 * κλειδί και υπόλοιπο στο μηνιαίο όριο) → site κατασκευαστή (αν Icecat + Channel3 < 8) → άλλα καταστήματα (μόνο αν δεν
 * βρέθηκε καμία από τις προηγούμενες). Χωρίς `force` (μαζική εκτέλεση) δεν ξαναπληρώνει:
 * κρατά ό,τι βρέθηκε ήδη στο web / στα καταστήματα και ξαναψάχνει τα «δεν βρέθηκε» μόνο μετά από 30 ημέρες. Το Icecat
 * (δωρεάν) ξανατρέχει όταν είχε βρεθεί, για τις φωτογραφίες.
 */
const RECENT = 30 * 86_400_000;
const MIN_ICECAT = 8;

export interface EnrichStep { source: EnrichSource; status: EnrichResult["status"] | "skipped"; specs: number; images: number; sourceName?: string; url?: string; note?: string; costUsd: number }
export interface EnrichRun { productId: string; steps: EnrichStep[]; costUsd: number; suggestions: number }

export async function enrichProduct(productId: string, opts: { force?: boolean } = {}): Promise<EnrichRun | null> {
  const p = await db.product.findUnique({ where: { id: productId }, select: { id: true, sku: true, ean: true, title: true, modelCode: true, brand: { select: { name: true } }, category: { select: { name: true } }, enrichments: { select: { source: true, status: true, specCount: true, checkedAt: true } } } });
  if (!p) return null;
  const prev = new Map(p.enrichments.map((e) => [e.source, e]));
  /** δεν χρειάζεται νέα αναζήτηση: βρέθηκε ήδη, ή δεν βρέθηκε πριν από λιγότερο από 30 ημέρες */
  const settled = (s: EnrichSource) => { const e = prev.get(s); return !!e && (e.status === "found" || (e.status === "none" && Date.now() - e.checkedAt.getTime() < RECENT)); };
  const before = await db.enrichSuggestion.count({ where: { productId, status: "pending" } });
  const steps: EnrichStep[] = [];
  const run = async (source: EnrichSource, go: () => Promise<EnrichResult>) => {
    const r = await go();
    await storeEnrichment(p.id, r);
    steps.push({ source, status: r.status, specs: r.specs.length, images: r.images?.length ?? 0, sourceName: r.sourceName, url: r.url, note: r.error, costUsd: r.costUsd });
    return r;
  };
  const skip = (source: EnrichSource, note: string) => { steps.push({ source, status: "skipped", specs: 0, images: 0, note, costUsd: 0 }); };

  // 1. Icecat: δωρεάν — ξανά και όταν είχε βρεθεί (για τις φωτογραφίες), όχι όταν πρόσφατα δεν βρέθηκε
  let icecatSpecs = prev.get("icecat")?.status === "found" ? prev.get("icecat")!.specCount : 0;
  if (opts.force || !settled("icecat") || prev.get("icecat")?.status === "found") {
    const r = await run("icecat", () => enrichFromIcecat({ ean: p.ean, sku: p.sku, modelCode: p.modelCode, brand: p.brand.name }));
    icecatSpecs = r.status === "found" ? r.specs.length : 0;
  } else skip("icecat", "δεν βρέθηκε πρόσφατα");

  // 1β. Channel3: 1 credit ανά αναζήτηση, μέσα στο μηνιαίο όριο· μόνο με κωδικό κατασκευαστή για ασφαλές ταίριασμα
  let c3Specs = prev.get("channel3")?.status === "found" ? prev.get("channel3")!.specCount : 0;
  let c3Found = prev.get("channel3")?.status === "found";
  if (icecatSpecs >= MIN_ICECAT) skip("channel3", `το Icecat έδωσε ${icecatSpecs} χαρακτηριστικά`);
  else if (!opts.force && settled("channel3")) skip("channel3", c3Found ? "βρέθηκε ήδη" : "δεν βρέθηκε πρόσφατα");
  else if (!matchCodes(p).length) skip("channel3", "χωρίς κωδικό κατασκευαστή για ταίριασμα");
  else {
    const q = await channel3Usage();
    if (!q.configured) skip("channel3", "χωρίς κλειδί (Ρυθμίσεις → AI & υπηρεσίες)");
    else if (q.left <= 0) skip("channel3", `όριο μήνα: ${q.used.toLocaleString("el-GR")}/${q.limit.toLocaleString("el-GR")} αναζητήσεις`);
    else {
      const r = await run("channel3", () => enrichFromChannel3({ brand: p.brand.name, title: p.title, modelCode: p.modelCode, sku: p.sku }));
      c3Found = r.status === "found"; c3Specs = c3Found ? r.specs.length : 0;
    }
  }

  // 2. Site κατασκευαστή: μόνο αν Icecat + Channel3 δεν έδωσαν αρκετά
  let webFound = prev.get("web")?.status === "found";
  if (icecatSpecs >= MIN_ICECAT) skip("web", `το Icecat έδωσε ${icecatSpecs} χαρακτηριστικά`);
  else if (icecatSpecs + c3Specs >= MIN_ICECAT) skip("web", `Icecat + Channel3 έδωσαν ${icecatSpecs + c3Specs} χαρακτηριστικά`);
  else if (opts.force || !settled("web")) webFound = (await run("web", () => enrichFromWeb({ brand: p.brand.name, title: p.title, modelCode: p.modelCode, sku: p.sku, typeName: p.category.name }))).status === "found";
  else skip("web", webFound ? "βρέθηκε ήδη" : "δεν βρέθηκε πρόσφατα");

  // 3. Άλλα καταστήματα: μόνο όταν δεν υπάρχει επίσημη πηγή ούτε Channel3
  if (icecatSpecs >= MIN_ICECAT || webFound) skip("shop", "υπάρχει επίσημη πηγή");
  else if (c3Found) skip("shop", "βρέθηκε στη Channel3");
  else if (opts.force || !settled("shop")) await run("shop", () => enrichFromShops({ brand: p.brand.name, title: p.title, modelCode: p.modelCode, sku: p.sku, typeName: p.category.name, ean: p.ean }));
  else skip("shop", prev.get("shop")?.status === "found" ? "βρέθηκε ήδη" : "ελέγχθηκε πρόσφατα");

  const after = await db.enrichSuggestion.count({ where: { productId, status: "pending" } });
  return { productId, steps, costUsd: steps.reduce((a, s) => a + s.costUsd, 0), suggestions: Math.max(0, after - before) };
}

/**
 * Τα κύρια είδη των «Set ειδών» δύο μελών όπου μόνο το ένα είδος υπάρχει στο site (κλιματιστικά εσωτερική/εξωτερική,
 * προϊόν + δώρο): το προϊόν της βιτρίνας που αντιπροσωπεύει το set.
 */
export async function setMainProductIds(): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    with l as (select s.spcs, sl.mtrl, p.id pid from "S1Set" s join "S1SetLine" sl using (spcs) left join "Product" p on p."erpCode" = sl.mtrl::text),
    g as (select spcs from l group by spcs having count(*) = 2 and count(pid) = 1)
    select distinct pid as id from l where pid is not null and spcs in (select spcs from g)`;
  return rows.map((r) => r.id);
}
