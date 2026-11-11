/** Πρόσθετα πεδία καρτέλας (CustomField): ορισμοί ανά entity, τιμές στο `extra` της εγγραφής. Κοινό για server και client. */
export type FieldEntity = "partner" | "carrier";
export const FIELD_TYPES = { text: "Κείμενο", number: "Αριθμός", date: "Ημερομηνία", bool: "Ναι / Όχι", select: "Επιλογή από λίστα", link: "Σύνδεσμος (π.χ. αρχείο στο Drive)" } as const;
export type FieldType = keyof typeof FIELD_TYPES;
export interface FieldDef { id: string; key: string; label: string; type: FieldType; options: string[]; groupName: string | null; help: string | null; sort: number; active: boolean }
export type ExtraValues = Record<string, string | number | boolean | null>;

/** «Ημερομηνία λήξης σύμβασης» → «imerominia_lixis_symvasis» */
export function fieldKey(label: string): string {
  const map: Record<string, string> = { α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i", κ: "k", λ: "l", μ: "m", ν: "n", ξ: "x", ο: "o", π: "p", ρ: "r", σ: "s", ς: "s", τ: "t", υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o" };
  return label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/./g, (c) => map[c] ?? c).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "pedio";
}

/** Τιμή από τη φόρμα → αποθηκεύσιμη τιμή (ή σφάλμα). Κενό = null. */
export function cleanValue(def: Pick<FieldDef, "type" | "options" | "label">, v: unknown): { ok: true; value: string | number | boolean | null } | { ok: false; error: string } {
  if (v == null || v === "") return { ok: true, value: null };
  switch (def.type) {
    case "number": { const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, error: `«${def.label}»: γράψε αριθμό` }; }
    case "bool": return { ok: true, value: v === true || v === "true" };
    case "date": return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? { ok: true, value: String(v) } : { ok: false, error: `«${def.label}»: μη έγκυρη ημερομηνία` };
    case "select": return def.options.includes(String(v)) ? { ok: true, value: String(v) } : { ok: false, error: `«${def.label}»: διάλεξε από τη λίστα` };
    case "link": { const s = String(v).trim(); return /^https?:\/\/\S+$/i.test(s) ? { ok: true, value: s } : { ok: false, error: `«${def.label}»: ο σύνδεσμος πρέπει να ξεκινά με https://` }; }
    default: return { ok: true, value: String(v).slice(0, 2000) };
  }
}
