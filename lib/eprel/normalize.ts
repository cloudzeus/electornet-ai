import type { EprelRaw } from "./client";
import { FIELDS_EL, HIDDEN_FIELDS } from "./fields";

/**
 * Από την ακατέργαστη εγγραφή του EPREL στις στήλες του μοντέλου μας.
 *
 * Οι χρονοσφραγίδες `…TS` είναι σε δευτερόλεπτα για τις ημερομηνίες αγοράς
 * και δημοσίευσης, αλλά σε χιλιοστά για `importedOn`/`exportDateTS` —
 * κρίνουμε από το μέγεθος. Η ετήσια κατανάλωση δεν υπάρχει ως ένα πεδίο:
 * κάθε κανονισμός την εκφράζει αλλιώς, οπότε τη φέρνουμε σε kWh/έτος με τις
 * παραδοχές του ίδιου του κανονισμού (220 κύκλοι πλύσης, 280 πλυντηρίου
 * πιάτων, 160 στεγνωτηρίου, οθόνη 4 h/ημέρα, λαμπτήρας 1000 h/έτος).
 */
export const tsToDate = (ts: unknown): Date | null => {
  if (typeof ts !== "number" || !Number.isFinite(ts) || ts <= 0) return null;
  return new Date(ts > 1e11 ? ts : ts * 1000);
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const round1 = (n: number) => Math.round(n * 10) / 10;

export function annualKwh(raw: EprelRaw): { kwh: number; basis: string } | null {
  const g = raw.productGroup;
  const pick = (...keys: string[]) => { for (const k of keys) { const v = num(raw[k]); if (v != null) return { v, k }; } return null; };
  let r: { v: number; k: string } | null;
  switch (g) {
    case "washingmachines2019": r = pick("energyConsPer100Cycle"); return r ? { kwh: round1(r.v * 2.2), basis: `${r.k} × 220 κύκλοι/έτος` } : null;
    case "washerdriers2019": r = pick("energyConsumption100Wash"); return r ? { kwh: round1(r.v * 2.2), basis: `${r.k} × 220 κύκλοι/έτος` } : null;
    case "dishwashers2019": r = pick("energyCons100"); return r ? { kwh: round1(r.v * 2.8), basis: `${r.k} × 280 κύκλοι/έτος` } : null;
    case "tumbledryers20232534": r = pick("energyConsDry"); return r ? { kwh: round1(r.v * 1.6), basis: `${r.k} × 160 κύκλοι/έτος` } : null;
    case "refrigeratingappliances2019": r = pick("energyConsAnnualV2", "energyConsAnnual"); return r ? { kwh: round1(r.v), basis: r.k } : null;
    case "refrigeratingappliancesdirectsalesfunction": r = pick("energyConsAnnual"); return r ? { kwh: round1(r.v), basis: r.k } : null;
    case "electronicdisplays": r = pick("powerOnModeSDR"); return r ? { kwh: round1((r.v * 4 * 365) / 1000), basis: `${r.k} (W) × 4 h/ημέρα` } : null;
    case "lightsources": r = pick("energyConsOnMode"); return r ? { kwh: round1(r.v), basis: `${r.k} (kWh/1000 h) × 1000 h/έτος` } : null;
    case "rangehoods": r = pick("energyAnnual"); return r ? { kwh: round1(r.v), basis: r.k } : null;
    case "waterheaters": r = pick("declaredLoadProfileWaterHeatingAnnualElectricityCons"); return r ? { kwh: round1(r.v), basis: r.k } : null;
    default: {
      r = pick("energyConsAnnual", "energyAnnual");
      return r ? { kwh: round1(r.v), basis: r.k } : null;
    }
  }
}

export interface EprelRow {
  registrationNumber: string; groupUrlCode: string; implementingAct: string | null; modelIdentifier: string; supplierOrTrademark: string; trademarkOwner: string | null; organisationName: string | null; status: string | null;
  energyClass: string | null; energyClassRange: string | null; energyClassImage: string | null; energyEfficiencyIndex: number | null; annualKwh: number | null; annualKwhBasis: string | null;
  noise: number | null; noiseClass: string | null; dimensionWidth: number | null; dimensionHeight: number | null; dimensionDepth: number | null; guaranteeDuration: number | null;
  repairabilityClass: string | null; repairabilityIndex: number | null; webLink: string | null; onMarketStart: Date | null; onMarketEnd: Date | null; firstPublishedAt: Date | null; versionNumber: number | null; lastVersion: boolean;
}

/**
 * Οι διαστάσεις στο EPREL ΔΕΝ έχουν ενιαία μονάδα: τα πλυντήρια δηλώνονται σε εκατοστά (60 × 85 × 57), τα ψυγεία σε
 * χιλιοστά (700 × 1845 × 720). Καμία οικιακή συσκευή δεν ξεπερνά τα 2,5 μ., οπότε ό,τι έχει πλευρά > 250 είναι χιλιοστά.
 */
export function eprelDimsCm(raw: EprelRaw): { w: number; h: number; d: number } | null {
  const w = num(raw.dimensionWidth), h = num(raw.dimensionHeight), d = num(raw.dimensionDepth);
  if (!w || !h || !d || w <= 0 || h <= 0 || d <= 0) return null;
  const k = Math.max(w, h, d) > 250 ? 0.1 : 1;
  const r = (n: number) => Math.round(n * k * 10) / 10;
  return { w: r(w), h: r(h), d: r(d) };
}

/** Το EPREL κωδικοποιεί τα «+» της παλιάς κλίμακας ως P: AP = A+, APP = A++, APPP = A+++. */
export const classLabel = (c: string | null) => (c ? c.trim().replace(/^A(P{1,3})$/i, (_, p: string) => `A${"+".repeat(p.length)}`) : c);

export function toRow(raw: EprelRaw): EprelRow {
  const a = annualKwh(raw);
  const intOrNull = (v: unknown) => { const n = num(v); return n == null ? null : Math.round(n); };
  const dims = eprelDimsCm(raw);
  return {
    registrationNumber: String(raw.eprelRegistrationNumber),
    groupUrlCode: raw.productGroup,
    implementingAct: str(raw.implementingAct),
    modelIdentifier: String(raw.modelIdentifier ?? "").trim(),
    supplierOrTrademark: String(raw.supplierOrTrademark ?? "").trim(),
    trademarkOwner: str(raw.trademarkOwner),
    organisationName: str(raw.organisation?.organisationName) ?? str(raw.organisation?.organisationTitle),
    status: str(raw.status),
    energyClass: classLabel(str(raw.energyClass) ?? str(raw.energyClassSDR) ?? str(raw.coolingEnergyClass) ?? str(raw.energyClassWash)),
    energyClassRange: str(raw.energyClassRange),
    energyClassImage: str(raw.energyClassImageWithScale) ?? str(raw.energyClassImage),
    energyEfficiencyIndex: num(raw.energyEfficiencyIndex),
    annualKwh: a?.kwh ?? null,
    annualKwhBasis: a?.basis ?? null,
    noise: intOrNull(raw.noise),
    noiseClass: str(raw.noiseClass),
    dimensionWidth: dims ? Math.round(dims.w) : null, // πάντα εκατοστά (βλ. eprelDimsCm)
    dimensionHeight: dims ? Math.round(dims.h) : null,
    dimensionDepth: dims ? Math.round(dims.d) : null,
    guaranteeDuration: intOrNull(raw.guaranteeDuration ?? raw.guranteeDuration),
    repairabilityClass: str(raw.repairabilityClass),
    repairabilityIndex: num(raw.repairabilityIndex),
    webLink: str(raw.webLinkSupplier) ?? str(raw.webLinkManufacturer),
    onMarketStart: tsToDate(raw.onMarketStartDateTS),
    onMarketEnd: tsToDate(raw.onMarketEndDateTS),
    firstPublishedAt: tsToDate(raw.firstPublicationDateTS),
    versionNumber: num(raw.versionNumber),
    lastVersion: raw.lastVersion !== false,
  };
}

export interface SpecLine { key: string; label: string; value: string; unit?: string }

/** Τα τεχνικά που αξίζει να δει ο πελάτης, με ελληνική ετικέτα και μονάδα. */
export function specLines(data: unknown, opts: { all?: boolean } = {}): SpecLine[] {
  const raw = (data ?? {}) as Record<string, unknown>;
  const out: SpecLine[] = [];
  for (const [key, v] of Object.entries(raw)) {
    if (HIDDEN_FIELDS.has(key) || v == null || v === "" || (Array.isArray(v) && !v.length)) continue;
    const def = FIELDS_EL[key];
    if (!def && !opts.all) continue;
    let value: string;
    if (def?.kind === "date") { const d = tsToDate(v); if (!d) continue; value = d.toLocaleDateString("el-GR"); }
    else if (typeof v === "boolean" || def?.kind === "bool") value = v ? "Ναι" : "Όχι";
    else if (typeof v === "number") value = v.toLocaleString("el-GR", { maximumFractionDigits: 2 });
    else if (Array.isArray(v)) value = v.filter((x) => typeof x !== "object").map(String).join(", ") || `${v.length} εγγραφές`;
    else if (typeof v === "object") continue;
    else value = String(v).replace(/_/g, " ");
    out.push({ key, label: def?.label ?? key, value, unit: def?.unit });
  }
  return out;
}

/** «A_G» → «A–G» για την ένδειξη κλίμακας δίπλα στην κλάση. */
export const scaleLabel = (range: string | null | undefined) => (range ? range.replace(/PPP/g, "+++").replace(/PP/g, "++").replace(/P/g, "+").replace("_", "–") : "");

/** Ανοχή στον κωδικό μοντέλου: το EPREL έχει «WW90T534DAW/LE», το ERP «WW90T534DAW LE». */
export const normalizeModel = (s: string) => s.toUpperCase().replace(/[\s\-_./\\]+/g, "");
