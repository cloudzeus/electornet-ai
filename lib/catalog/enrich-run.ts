import "server-only";
import { db } from "@/lib/db";
import { channel3Usage, enrichFromChannel3 } from "./channel3";
import { matchCodes } from "./channel3-core";
import { energyClassFromSpecs, modelsFromSpecs } from "./enrich-core";
import { enrichFromIcecat, enrichFromShops, enrichFromWeb, storeEnrichment, type EnrichResult, type EnrichSource } from "./enrich";
import { projectSourceDimensions } from "./product-dimensions";
import { suggestDims } from "./enrich-suggestions";

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
export interface EnrichRun { productId: string; steps: EnrichStep[]; costUsd: number; suggestions: number; energy?: EnergyOutcome }

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
  let webFound = prev.get("web")?.status === "found", labelUrl: string | undefined;
  if (icecatSpecs >= MIN_ICECAT) skip("web", `το Icecat έδωσε ${icecatSpecs} χαρακτηριστικά`);
  else if (icecatSpecs + c3Specs >= MIN_ICECAT) skip("web", `Icecat + Channel3 έδωσαν ${icecatSpecs + c3Specs} χαρακτηριστικά`);
  else if (opts.force || !settled("web")) {
    const r = await run("web", () => enrichFromWeb({ brand: p.brand.name, title: p.title, modelCode: p.modelCode, sku: p.sku, typeName: p.category.name }));
    webFound = r.status === "found"; labelUrl = r.labelUrl;
  }
  else skip("web", webFound ? "βρέθηκε ήδη" : "δεν βρέθηκε πρόσφατα");

  // 3. Άλλα καταστήματα: μόνο όταν δεν υπάρχει επίσημη πηγή ούτε Channel3
  if (icecatSpecs >= MIN_ICECAT || webFound) skip("shop", "υπάρχει επίσημη πηγή");
  else if (c3Found) skip("shop", "βρέθηκε στη Channel3");
  else if (opts.force || !settled("shop")) await run("shop", () => enrichFromShops({ brand: p.brand.name, title: p.title, modelCode: p.modelCode, sku: p.sku, typeName: p.category.name, ean: p.ean }));
  else skip("shop", prev.get("shop")?.status === "found" ? "βρέθηκε ήδη" : "ελέγχθηκε πρόσφατα");

  const anyFound = steps.some((s) => s.status === "found");
  const energy = anyFound ? await energyFromSources(productId, { labelUrl }).catch(() => undefined) : undefined;
  // διαστάσεις από τις πηγές: χρησιμοποιούνται όταν το SoftOne δεν έχει· όταν έχει και διαφέρουν → πρόταση αλλαγής
  if (anyFound) { await projectSourceDimensions([productId]).catch(() => undefined); await suggestDims(productId).catch(() => 0); }
  const after = await db.enrichSuggestion.count({ where: { productId, status: "pending" } });
  return { productId, steps, costUsd: steps.reduce((a, s) => a + s.costUsd, 0), suggestions: Math.max(0, after - before), energy };
}

const EXTERNAL_DIRECT = ["icecat", "channel3", "web"];
export type EnergyOutcome = { source: string; cls: string; registrationNumber?: string; model?: string };

/**
 * Ενεργειακή σήμανση από ό,τι βρήκαν οι πηγές, για προϊόν χωρίς ετικέτα από EPREL ή διαχειριστή:
 *  1. EPREL με το «Μοντέλο» της πηγής (και στη γραφή ζεύγους «HTN-717R32/HTG-717R32») — αν ταιριάξει, δένεται η επίσημη
 *     καταχώριση με όλα της (ετικέτα, δελτίο, χαρακτηριστικά, διαστάσεις), όπως η μαζική αντιστοίχιση.
 *  2. αλλιώς η κλάση από τα χαρακτηριστικά της πηγής («Ενεργειακή κλάση», «Κατηγορία ψύξης»), με πηγή icecat/channel3/web —
 *     μόνο αν δεν υπάρχει ήδη κλάση από την περιγραφή του SoftOne· με την ετικέτα που δημοσιεύει η σελίδα του μοντέλου
 *     (`labelUrl`), όταν υπάρχει — μοντέλα πριν από το 2019 (κανονισμός 626/2011) συχνά δεν είναι καν στο EPREL.
 */
export async function energyFromSources(productId: string, opts: { labelUrl?: string } = {}): Promise<EnergyOutcome | undefined> {
  const p = await db.product.findUnique({ where: { id: productId }, select: { sku: true, title: true, brand: { select: { name: true } }, category: { select: { name: true } }, energy: { select: { source: true, class: true } }, specs: { where: { source: { in: EXTERNAL_DIRECT } }, orderBy: { sortNo: "asc" }, select: { key: true, value: true, source: true } } } });
  if (!p || ["eprel", "manual"].includes(p.energy?.source ?? "") || !p.specs.length) return undefined;
  const { eprelGroupsFor, findInEprel, storeEprelMatch } = await import("./eprel-match");
  const { hasEprelKey } = await import("@/lib/eprel/client");
  const groups = eprelGroupsFor(p.category.name);
  if (groups && hasEprelKey()) for (const model of modelsFromSpecs(p.specs)) {
    const m = await findInEprel({ sku: p.sku, title: p.title }, model, p.brand.name, groups).catch(() => null);
    if (m?.status === "matched") { const s = await storeEprelMatch(productId, m.raw); return { source: "eprel", cls: String(m.raw.energyClass ?? ""), registrationNumber: s.registrationNumber, model }; }
  }
  if (p.energy && p.energy.source && !EXTERNAL_DIRECT.includes(p.energy.source)) return undefined; // κλάση από το SoftOne: μένει
  const en = energyClassFromSpecs(p.specs);
  if (!en) return undefined;
  const source = p.specs.find((s) => s.key === en.key)?.source ?? "web";
  const label = opts.labelUrl ? { labelUrl: opts.labelUrl } : {};
  await db.energyLabel.upsert({ where: { productId }, create: { productId, class: en.cls, scale: en.scale, source, ...label }, update: { class: en.cls, scale: en.scale, source, ...label } });
  return { source, cls: en.cls };
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
