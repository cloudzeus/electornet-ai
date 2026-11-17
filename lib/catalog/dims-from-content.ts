import "server-only";
import { db } from "@/lib/db";
import { proposeFromContent, type ContentProposal, type ContentSource } from "./dims-from-content-core";

/**
 * Πηγές για «Διαστάσεις και βάρος από το περιεχόμενο»: χαρακτηριστικά (ανά πηγή), περιγραφή του eshop, γραμμές
 * διαστάσεων που ήδη έχουμε (EPREL, Icecat, site κατασκευαστή, Channel3), απόδελτιώσεις banner/PDF και το δελτίο EPREL (PDF).
 * Η περιγραφή του SoftOne δεν μπαίνει ξεχωριστά: τα χαρακτηριστικά «s1-desc» βγαίνουν από αυτήν (αλλιώς θα μετρούσε δύο φορές).
 */
const SPEC_LABEL: Record<string, string> = { "s1-desc": "Χαρακτηριστικά SoftOne", eprel: "Χαρακτηριστικά EPREL", icecat: "Χαρακτηριστικά Icecat", channel3: "Χαρακτηριστικά Channel3", web: "Χαρακτηριστικά site κατασκευαστή" };
const DIM_LABEL: Record<string, string> = { "s1-desc": "Περιγραφή SoftOne", eprel: "EPREL", icecat: "Icecat", web: "Site κατασκευαστή", channel3: "Channel3" };

/** Όλα τα κείμενα ενός εγγράφου απόδελτίωσης (StudioDoc), χωρίς URLs. */
function docTexts(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") { if (v.length > 1 && v.length < 600 && !/^(https?:|data:|\/)/.test(v)) out.push(v); }
  else if (Array.isArray(v)) v.forEach((x) => docTexts(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => docTexts(x, out));
  return out;
}

async function pdfText(url: string, maxPages = 6): Promise<string> {
  const { fetchPublicBytes } = await import("@/lib/net/safe-fetch");
  const { bytes } = await fetchPublicBytes(url, { max: 10 * 1024 * 1024, accept: "application/pdf", timeoutMs: 15_000 });
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // μέσα στο bundle του Next το pdfjs δεν βρίσκει το pdf.worker.mjs δίπλα του· του το δίνουμε έτοιμο (fake worker στον server)
  const g = globalThis as { pdfjsWorker?: unknown };
  // @ts-expect-error το worker δεν έχει τύπους
  g.pdfjsWorker ??= await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  let t = "";
  for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    t += c.items.map((x) => ("str" in x ? x.str + (x.hasEOL ? "\n" : " ") : "")).join("") + "\n";
  }
  await doc.cleanup();
  return t;
}

export interface ContentDimsState {
  proposal: ContentProposal;
  /** πηγές που διαβάστηκαν (για το «Διάβασα …») και όσες απέτυχαν */
  read: string[];
  failed: string[];
  current: { manual: { w: number; h: number; d: number; note: string | null } | null; erp: { w: number | null; h: number | null; l: number | null; kg: number | null } | null; weightKg: number | null; weightSource: string | null };
}

export async function contentDims(productId: string): Promise<ContentDimsState> {
  const p = await db.product.findUnique({
    where: { id: productId },
    select: { description: true, summary: true, erpCode: true, source: true, weightKg: true, weightSource: true, category: { select: { name: true } }, specs: { select: { key: true, value: true, source: true }, orderBy: { sortNo: "asc" } }, dimensions: true, energy: { select: { ficheUrl: true } }, extractions: { where: { status: { not: "discarded" } }, select: { id: true, sourceName: true, doc: true }, orderBy: { createdAt: "desc" }, take: 6 } },
  });
  if (!p) throw new Error("Το προϊόν δεν βρέθηκε.");
  const sources: ContentSource[] = [];
  const bySrc = new Map<string, { key: string; value: string }[]>();
  for (const s of p.specs) { const k = s.source ?? "eshop"; bySrc.set(k, [...(bySrc.get(k) ?? []), s]); }
  // κάθε πηγή μετρά μία φορά: τα χαρακτηριστικά της και η γραμμή διαστάσεων που βγήκε από αυτά (s1-desc, eprel, icecat…)
  const rows = new Map(p.dimensions.filter((d) => d.source !== "manual").map((d) => [d.source, d]));
  for (const k of new Set([...bySrc.keys(), ...rows.keys()])) {
    const d = rows.get(k);
    sources.push({
      id: `src:${k}`, label: bySrc.has(k) ? (SPEC_LABEL[k] ?? (k === "eshop" ? "Χαρακτηριστικά eshop" : `Χαρακτηριστικά · ${k}`)) : (DIM_LABEL[k] ?? k), specs: bySrc.get(k),
      ...(d ? { dims: { w: d.w, h: d.h, d: d.d, raw: d.rawKey && d.rawValue ? `${d.rawKey}: ${d.rawValue}` : d.rawValue ?? `${d.w} × ${d.h} × ${d.d} εκ.` } } : {}),
    });
  }
  const desc = [p.summary, p.description].filter(Boolean).join("\n");
  if (desc) sources.push({ id: "desc", label: "Περιγραφή eshop", text: desc });
  p.extractions.forEach((x, i) => sources.push({ id: `ext:${x.id}`, label: `Απόδελτίωση${p.extractions.length > 1 ? ` ${i + 1}` : ""}${x.sourceName ? ` · ${x.sourceName}` : ""}`, text: docTexts(x.doc).join("\n") }));
  const failed: string[] = [];
  if (p.energy?.ficheUrl) {
    try { sources.push({ id: "fiche", label: "Δελτίο EPREL (PDF)", text: await pdfText(p.energy.ficheUrl) }); }
    catch (e) { console.error("[content-dims] δελτίο EPREL", p.energy.ficheUrl, e); failed.push("Δελτίο EPREL (PDF)"); }
  }
  const mtrl = p.source === "softone" && /^\d+$/.test(p.erpCode) ? Number(p.erpCode) : null;
  const item = mtrl ? await db.s1Item.findUnique({ where: { mtrl }, select: { widthCm: true, heightCm: true, lengthCm: true, weightKg: true } }) : null;
  const manual = p.dimensions.find((d) => d.source === "manual");
  return {
    proposal: proposeFromContent(sources, p.category.name),
    read: sources.map((s) => s.label),
    failed,
    current: {
      manual: manual ? { w: manual.w, h: manual.h, d: manual.d, note: manual.rawKey } : null,
      erp: item ? { w: item.widthCm, h: item.heightCm, l: item.lengthCm, kg: item.weightKg } : null,
      weightKg: p.weightKg, weightSource: p.weightSource,
    },
  };
}
