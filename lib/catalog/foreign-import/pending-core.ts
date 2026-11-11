import type { PendingItem } from "@prisma/client";
import type { FieldKey, ParsedRow, RowRefs } from "@/lib/catalog/supplier-sheet";
import { rekeySpecs } from "@/lib/catalog/foreign-import/plan-core";

/**
 * Νέα είδη από ξένο Excel σε αναμονή έγκρισης — καθαρές αποφάσεις (χωρίς βάση). Ο pending.ts τις τροφοδοτεί και εκτελεί.
 */
export type PendingFields = Partial<Record<FieldKey, string>>;
/** Το webCategoryId δεν ελέγχεται: η κατηγορία του site βγαίνει από την ομάδα χαρακτηριστικών (προβολή → s1:g:N) — είναι μόνο ένδειξη. */
export type PendingCheck = Pick<PendingItem, "code" | "fields" | "brandId" | "specGroupS1Id"> & { brandS1Id: string | null; webCategoryId?: string | null };

/** Καταστάσεις από τις οποίες ξεκινά έγκριση / αλλαγή / απόρριψη. */
export const OPEN = ["pending", "error"];
/** «creating» παλιότερο από τόσα λεπτά = η έγκριση διακόπηκε (π.χ. επανεκκίνηση) — ανακτήσιμο. */
export const STALE_MIN = 15;
export const staleBefore = (now: Date) => new Date(now.getTime() - STALE_MIN * 60_000);
export const isStaleCreating = (p: Pick<PendingItem, "status" | "updatedAt">, now: Date) => p.status === "creating" && p.updatedAt < staleBefore(now);
/** Μπορεί να ξεκινήσει έγκριση: pending/error που δεν έχει ήδη είδος στο SoftOne, ή «creating» που κόλλησε. */
export const canApprove = (p: Pick<PendingItem, "status" | "updatedAt" | "mtrl">, now: Date) => (OPEN.includes(p.status) && p.mtrl == null) || isStaleCreating(p, now);

/** Τα πεδία της γραμμής ως αντικείμενο (το Json της βάσης μπορεί να είναι οτιδήποτε). */
export const pendingFields = (v: PendingItem["fields"]): PendingFields =>
  v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === "string")) as PendingFields : {};

/**
 * Πεδία ERP που όρισε ο χρήστης για το νέο είδος (αριθμοί SoftOne): συνήθης προμηθευτής (TRDR), business unit, λογιστική
 * κατηγορία (MTRACN), φόρος ανακύκλωσης σε € (EXPVAL1). Ζουν στο `fields._erp` — το `pendingFields` κρατά μόνο κείμενα, άρα
 * δεν μπερδεύονται με τα πεδία του αρχείου. Όσα λείπουν έρχονται από το αδελφό είδος στη δημιουργία.
 */
export type PendingErp = { supplier?: number; busUnit?: number; acn?: number; expval1?: number };
export const ERP_KEYS = ["supplier", "busUnit", "acn", "expval1"] as const;
export const erpValueOk = (k: keyof PendingErp, n: number) => Number.isFinite(n) && (k === "expval1" ? n >= 0 && n <= 1000 : Number.isInteger(n) && n > 0);
export function pendingErp(v: PendingItem["fields"]): PendingErp {
  const e = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>)._erp : null;
  if (!e || typeof e !== "object" || Array.isArray(e)) return {};
  const out: PendingErp = {};
  for (const k of ERP_KEYS) { const x = (e as Record<string, unknown>)[k]; const n = Number(x); if (x != null && x !== "" && erpValueOk(k, n)) out[k] = n; }
  return out;
}

/** Τι λείπει για να δημιουργηθεί το είδος στο SoftOne (ετικέτες για τον χρήστη, με σταθερή σειρά). */
export function pendingMissing(p: PendingCheck): string[] {
  const out: string[] = [];
  const code = (p.code ?? "").trim();
  if (!code) out.push("Κωδικός"); else if (code.length > 25) out.push("Κωδικός (έως 25 χαρακτήρες)");
  if (!(pendingFields(p.fields).name ?? "").trim()) out.push("Όνομα");
  if (!p.brandId) out.push("Μάρκα"); else if (!p.brandS1Id) out.push("Μάρκα συνδεδεμένη με το SoftOne");
  if (p.specGroupS1Id == null) out.push("Ομάδα χαρακτηριστικών");
  return out;
}

/**
 * Η γραμμή για τη μηχανή του template (`applyImport`, νέο είδος): ο κωδικός του PendingItem υπερισχύει, χωρίς MTRL (αλλιώς
 * θα διαβαζόταν ως υπάρχον είδος). Τα χαρακτηριστικά πρέπει να έχουν ήδη τα ονόματα της ομάδας (`pendingSpecs`).
 */
export function pendingRow(p: Pick<PendingItem, "rowNo" | "code" | "fields" | "specs">, sheet: string, groupS1Id: number, refs?: RowRefs): ParsedRow {
  const fields: PendingFields = { ...pendingFields(p.fields), code: p.code.trim() };
  delete fields.mtrl;
  const specs = p.specs && typeof p.specs === "object" && !Array.isArray(p.specs)
    ? Object.fromEntries(Object.entries(p.specs).filter((e): e is [string, string] => typeof e[1] === "string" && !!e[1].trim())) : {};
  const erp = pendingErp(p.fields);
  const pick: RowRefs = { ...(refs?.unit != null ? { unit: refs.unit } : {}), ...(refs?.mark != null ? { mark: refs.mark } : {}), ...(Object.keys(erp).length ? { erp } : {}) };
  return { sheet, rowNo: p.rowNo, groupS1Id, fields, specs, ...(Object.keys(pick).length ? { refs: pick } : {}) };
}

/**
 * Τα χαρακτηριστικά του PendingItem είναι με τις ετικέτες του χρήστη (όπως ήρθαν από το αρχείο)· στην έγκριση αντιστοιχίζονται
 * στα ονόματα της ΤΕΛΙΚΗΣ ομάδας (μπορεί να ορίστηκε/άλλαξε μετά την προεπισκόπηση). Παλιές εγγραφές με ήδη τα ονόματα της
 * ομάδας περνούν ίδιες. Ό,τι δεν υπάρχει στην ομάδα → προειδοποίηση (μπαίνει στη σημείωση του είδους).
 */
export function pendingSpecs(v: PendingItem["specs"] | null, groupSpecNames: string[]): { specs: Record<string, string>; warnings: string[] } {
  const raw = v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === "string")) : {};
  return rekeySpecs(raw, groupSpecNames);
}

/** URLs πολυμέσων του PendingItem ({image, banner, video}) — ό,τι δεν είναι λίστα κειμένων αγνοείται. */
export function pendingMedia(v: PendingItem["media"]): { image: string[]; banner: string[]; video: string[] } {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string" && !!s.trim()) : []);
  return { image: list(o.image), banner: list(o.banner), video: list(o.video) };
}

/**
 * «Περιγραφή για Web» του SoftOne (WEBNAME, έως 64 χαρακτήρες): το όνομα όταν χωρά. Όταν δεν χωρά, ξεκινά από μάρκα και
 * μοντέλο (όπως τα παλιά είδη του ERP, π.χ. «GAUZER BSLP 12/21 …») και ακολουθεί η υπόλοιπη περιγραφή, κομμένη σε ολόκληρη λέξη.
 */
export function webNameOf(name: string, max = 64, ids?: { brand?: string | null; model?: string | null }): string {
  let s = name.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const lead = [ids?.brand, ids?.model].map((x) => x?.trim()).filter((x): x is string => !!x);
  if (lead.length) {
    const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rest = lead.reduce((t, x) => t.replace(new RegExp(`(^|\\s)${esc(x)}(?=\\s|$)`, "i"), " "), s).replace(/\s+/g, " ").trim();
    s = `${lead.join(" ")} ${rest}`.trim();
  }
  const cut = s.slice(0, max + 1), at = cut.lastIndexOf(" ");
  return (at > max / 2 ? cut.slice(0, at) : s.slice(0, max)).trim();
}

/** Σύντομη περιγραφή όταν η πηγή δεν δίνει (π.χ. Keyvoto): η πρώτη πρόταση της αναλυτικής, χωρίς HTML, έως 300 χαρακτήρες. */
export function leadSentence(text: string | null | undefined): string {
  const s = (text ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
  const m = s.match(/^.{20,300}?[.!](?=\s|$)/);
  return (m ? m[0] : webNameOf(s, 200)).trim();
}

/** Κωδικός νέου είδους στο SoftOne: ο κωδικός κατασκευαστή / μοντέλο της πηγής (όπως τα πρόσφατα είδη του ERP)· ο κωδικός του feed μόνο όταν λείπει ή δεν χωρά (25 χαρ.). */
export function newItemCode(fields: { code?: string; factoryCode?: string }): string {
  const model = (fields.factoryCode ?? "").trim();
  return model && model.length <= 25 ? model : (fields.code ?? "").trim() || model.slice(0, 25);
}

// ---------- Χαρακτηριστικά του αρχείου που λείπουν από την ομάδα του SoftOne ----------

const specTokens = (s: string) => new Set(s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/ς/g, "σ").split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 3));
/** Το πιο κοντινό υπάρχον χαρακτηριστικό της ομάδας (κοινές λέξεις ≥ 60% της μικρότερης ετικέτας) — μόνο πρόταση, αποφασίζει ο χρήστης. */
export function similarSpec(label: string, names: string[]): string | null {
  const a = specTokens(label);
  let best: string | null = null, top = 0;
  for (const n of names) {
    const b = specTokens(n);
    const common = [...a].filter((t) => b.has(t)).length, score = common / Math.max(1, Math.min(a.size, b.size));
    if (common && score >= 0.6 && score > top) { best = n; top = score; }
  }
  return best;
}

export interface MissingSpec { groupS1Id: number; label: string; sample: string; items: number; similar: string | null }
/** Ποιες ετικέτες χαρακτηριστικών των ειδών δεν υπάρχουν στην ομάδα τους (ανά ομάδα + ετικέτα, με ένα δείγμα τιμής). */
export function missingSpecs(items: { specGroupS1Id: number | null; specs: unknown }[], groupNames: Map<number, string[]>, keyOf: (s: string) => string): MissingSpec[] {
  const out = new Map<string, MissingSpec>();
  for (const it of items) {
    const names = it.specGroupS1Id != null ? groupNames.get(it.specGroupS1Id) : undefined;
    if (!names || !it.specs || typeof it.specs !== "object" || Array.isArray(it.specs)) continue;
    const have = new Set(names.map(keyOf));
    for (const [label, v] of Object.entries(it.specs as Record<string, unknown>)) {
      if (typeof v !== "string" || !v.trim() || have.has(keyOf(label))) continue;
      const k = `${it.specGroupS1Id}:${keyOf(label)}`, m = out.get(k);
      if (m) m.items++; else out.set(k, { groupS1Id: it.specGroupS1Id!, label: label.trim(), sample: v.trim().slice(0, 80), items: 1, similar: similarSpec(label, names) });
    }
  }
  return [...out.values()];
}

/** Η ετικέτα του αρχείου γίνεται το υπάρχον χαρακτηριστικό της ομάδας (τιμή που υπάρχει ήδη εκεί δεν πατιέται). */
export function renameSpec(specs: unknown, from: string, to: string, keyOf: (s: string) => string): Record<string, string> | null {
  if (!specs || typeof specs !== "object" || Array.isArray(specs)) return null;
  const e = Object.entries(specs as Record<string, string>), hit = e.find(([k]) => keyOf(k) === keyOf(from));
  if (!hit) return null;
  const out = Object.fromEntries(e.filter(([k]) => k !== hit[0]));
  if (!e.some(([k]) => k !== hit[0] && keyOf(k) === keyOf(to))) out[to] = hit[1];
  return out;
}
