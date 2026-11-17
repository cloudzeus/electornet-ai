/**
 * «Διαστάσεις και βάρος από το περιεχόμενο» — η καθαρή λογική (χωρίς βάση και δίκτυο): από κάθε πηγή κειμένου του
 * προϊόντος (χαρακτηριστικά, περιγραφές, απόδελτιώσεις banner, PDF) βγάζει διαστάσεις Π×Υ×Β σε εκ. και βάρος σε κιλά,
 * κρατά από πού βγήκε η κάθε τιμή και προτείνει την τιμή που συμφωνούν οι περισσότερες πηγές.
 * Ξαναχρησιμοποιεί τους ίδιους αναγνώστες με την προβολή του ERP (`extractDims`, `parseDims`, `weightFromSpecs`).
 */
import { compareDims, extractDims, type Dims3 } from "./dimensions";
import { weightFromSpecs, checkDims, checkWeight } from "./dim-fill-core";

export interface ContentSource {
  id: string;
  /** π.χ. «Χαρακτηριστικά», «Εγχειρίδιο PDF · σελ. 14» */
  label: string;
  specs?: { key: string; value: string }[];
  text?: string;
  /** διαστάσεις που έχουν ήδη διαβαστεί (γραμμές ProductDimension: EPREL, web…) */
  dims?: Dims3 & { raw: string };
}
export interface DimsHit extends Dims3 { sourceId: string; label: string; raw: string }
export interface WeightHit { kg: number; sourceId: string; label: string; raw: string }
export type Agreement = { agree: number; differ: { label: string; value: number }[] };
export interface ContentProposal {
  dims: DimsHit[];
  weights: WeightHit[];
  /** η πρόταση: η τριάδα με τις περισσότερες συμφωνίες (ισοπαλία → η σειρά των πηγών) */
  bestDims: string | null; // sourceId
  bestWeight: string | null;
  /** ανά άξονας της πρότασης: πόσες πηγές συμφωνούν και ποιες διαφέρουν */
  axes: { w: Agreement; h: Agreement; d: Agreement } | null;
  weightAgree: Agreement | null;
  /** προειδοποίηση λογικής για την πρόταση (εκτός ορίων τύπου, απίθανο βάρος) */
  warning: string | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const near = (a: number, b: number) => Math.abs(a - b) <= 2 || Math.abs(a - b) / Math.max(a, b) <= 0.03;
const nearKg = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b) <= 0.05;

/** Ελεύθερο κείμενο → γραμμές «ετικέτα: τιμή» για τους αναγνώστες χαρακτηριστικών. */
export function textToSpecs(text: string): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  // κείμενο PDF: λέξεις κομμένες σε δύο γραμμές («Πλά-\nτος») ενώνονται
  const clean = text.replace(/\u00a0/g, " ").replace(/<[^>]+>/g, "\n").replace(/(\p{L})-\s*\n\s*(\p{L})/gu, "$1$2");
  for (const line of clean.split(/\n|[•·|;]\s|\.\s+(?=[Α-ΩA-Z])/)) {
    const m = /^\s*([^:：]{2,60}?)\s*[:：]\s*(.{1,120})$/.exec(line.trim());
    if (m) out.push({ key: m[1].trim(), value: m[2].trim() });
  }
  // «… διαστάσεις 59,5 x 203 x 68,2 εκ. …» μέσα σε πρόταση, χωρίς «:»
  for (const m of clean.matchAll(/(διαστάσ\S*|dimensions?)\s*(\([^)]{0,20}\))?\s*[:-]?\s*((?:[ΠΥΒWHDπυβwhd]\s*)?\d+(?:[.,]\d+)?\s*(?:mm|cm|εκ\.?)?\s*[x×*Χχ]\s*(?:[ΠΥΒWHDπυβwhd]\s*)?\d+(?:[.,]\d+)?\s*(?:mm|cm|εκ\.?)?\s*[x×*Χχ]\s*(?:[ΠΥΒWHDπυβwhd]\s*)?\d+(?:[.,]\d+)?\s*(?:mm|cm|εκ\.?|χιλ\S*)?)/giu)) {
    out.push({ key: `Διαστάσεις ${m[2] ?? ""}`.trim(), value: m[3] });
  }
  // ξεχωριστοί άξονες χωρίς «:» (δελτίο EPREL: «Ύψος   1 850», χιλιάδες με κενό)
  for (const m of clean.matchAll(/(?<!\p{L})(ύψος|πλάτος|βάθος|height|width|depth)\s*(?:\([^)]{0,20}\))?\s*[:=]?\s*(\d{1,3}(?: \d{3})+|\d+(?:[.,]\d+)?)\s*(mm|cm|εκ\.?)?(?!\d)/giu)) {
    out.push({ key: m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(), value: `${m[2].replace(/ /g, "")}${m[3] ? ` ${m[3]}` : ""}` });
  }
  for (const m of clean.matchAll(/((?:καθαρό |μεικτό |net |gross )?(?:βάρος|weight))\s*(?:\([^)]{0,20}\))?\s*[:-]?\s*(\d+(?:[.,]\d+)?\s*(?:kg|κιλ[άα]?|g|gr|γρ\.?))(?![\p{L}\d])/giu)) {
    out.push({ key: m[1][0].toUpperCase() + m[1].slice(1), value: m[2] });
  }
  return out;
}

function hitsOf(src: ContentSource, typeName: string): { dims: DimsHit | null; weight: WeightHit | null } {
  const specs = [...(src.specs ?? []), ...(src.text ? textToSpecs(src.text) : [])];
  // διαστάσεις που έχουν ήδη διαβαστεί (π.χ. η γραμμή του SoftOne) υπερισχύουν· το βάρος βγαίνει από τα χαρακτηριστικά της ίδιας πηγής
  const ex = src.dims ? null : extractDims(specs, typeName);
  const dims = src.dims ? { w: src.dims.w, h: src.dims.h, d: src.dims.d, sourceId: src.id, label: src.label, raw: src.dims.raw } : ex ? { w: ex.w, h: ex.h, d: ex.d, sourceId: src.id, label: src.label, raw: `${ex.key}: ${ex.value}` } : null;
  const kg = weightFromSpecs(specs);
  // η γραμμή που έδωσε ΑΥΤΟ το βάρος (με πολλές γραμμές βάρους κρατιέται η μεγαλύτερη, όχι η πρώτη)
  const wline = kg != null ? specs.find((s) => weightFromSpecs([s]) === kg) : null;
  return { dims, weight: kg != null ? { kg, sourceId: src.id, label: src.label, raw: wline ? `${wline.key}: ${wline.value}` : `${kg} kg` } : null };
}

/** Συγκεντρώνει τις τιμές όλων των πηγών και διαλέγει την πρόταση. */
export function proposeFromContent(sources: ContentSource[], typeName = ""): ContentProposal {
  const dims: DimsHit[] = [], weights: WeightHit[] = [];
  for (const s of sources) {
    const h = hitsOf(s, typeName);
    if (h.dims) dims.push({ ...h.dims, w: round1(h.dims.w), h: round1(h.dims.h), d: round1(h.dims.d) });
    if (h.weight) weights.push(h.weight);
  }
  const score = (a: Dims3) => dims.filter((b) => compareDims(a, b).verdict === "match").length;
  const best = dims.slice().sort((a, b) => score(b) - score(a))[0] ?? null; // sort σταθερό: ισοπαλία → σειρά πηγών
  const wScore = (a: WeightHit) => weights.filter((b) => nearKg(a.kg, b.kg)).length;
  const bestW = weights.slice().sort((a, b) => wScore(b) - wScore(a))[0] ?? null;
  const agreement = (pick: (x: DimsHit) => number): Agreement => {
    const v = pick(best!);
    return { agree: dims.filter((x) => near(pick(x), v)).length, differ: dims.filter((x) => !near(pick(x), v)).map((x) => ({ label: x.label, value: pick(x) })) };
  };
  const warning = [best && (checkDims(best, typeName) ?? null), bestW && checkWeight(bestW.kg, best)].filter(Boolean).join(" · ") || null;
  return {
    dims, weights,
    bestDims: best?.sourceId ?? null,
    bestWeight: bestW?.sourceId ?? null,
    axes: best ? { w: agreement((x) => x.w), h: agreement((x) => x.h), d: agreement((x) => x.d) } : null,
    weightAgree: bestW ? { agree: weights.filter((x) => nearKg(x.kg, bestW.kg)).length, differ: weights.filter((x) => !nearKg(x.kg, bestW.kg)).map((x) => ({ label: x.label, value: x.kg })) } : null,
    warning,
  };
}

