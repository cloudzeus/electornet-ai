import type { PendingItem } from "@prisma/client";
import type { FieldKey, ParsedRow } from "@/lib/catalog/supplier-sheet";

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
 * θα διαβαζόταν ως υπάρχον είδος). Τα χαρακτηριστικά έχουν ήδη τα ονόματα της ομάδας.
 */
export function pendingRow(p: Pick<PendingItem, "rowNo" | "code" | "fields" | "specs">, sheet: string, groupS1Id: number): ParsedRow {
  const fields: PendingFields = { ...pendingFields(p.fields), code: p.code.trim() };
  delete fields.mtrl;
  const specs = p.specs && typeof p.specs === "object" && !Array.isArray(p.specs)
    ? Object.fromEntries(Object.entries(p.specs).filter((e): e is [string, string] => typeof e[1] === "string" && !!e[1].trim())) : {};
  return { sheet, rowNo: p.rowNo, groupS1Id, fields, specs };
}

/** URLs πολυμέσων του PendingItem ({image, banner, video}) — ό,τι δεν είναι λίστα κειμένων αγνοείται. */
export function pendingMedia(v: PendingItem["media"]): { image: string[]; banner: string[]; video: string[] } {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string" && !!s.trim()) : []);
  return { image: list(o.image), banner: list(o.banner), video: list(o.video) };
}
