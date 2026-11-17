/**
 * «Διαστάσεις και βάρος που λείπουν» — η καθαρή λογική (χωρίς βάση και δίκτυο): η κατάσταση μιας πρότασης και ποια πεδία
 * του είδους γράφονται στο SoftOne. Κανόνες εγγραφής ίδιοι με το `dim-fill-core`: μόνο κενά πεδία, οι τρεις διαστάσεις
 * μόνο ΜΑΖΙ και μόνο όταν και οι τρεις είναι κενές — χωριστά για τα CCC και για τα τυπικά (Διάσταση 1-3).
 */
import type { ContentProposal } from "./dims-from-content-core";

export interface RowProposal {
  id: string;
  /** τι λείπει τώρα (ζωντανά, μετά την αναζήτηση) */
  missDims: boolean;
  missWeight: boolean;
  dims: { w: number; h: number; d: number; label: string; raw: string; agree: number } | null;
  weight: { kg: number; label: string; raw: string; agree: number } | null;
  /** ready: βρέθηκε ό,τι λείπει και τίποτα δεν θέλει έλεγχο · review: βρέθηκε κάτι αλλά θέλει μάτι · none: τίποτα */
  status: "ready" | "review" | "none";
  notes: string[];
}

export function toRowProposal(id: string, miss: { dims: boolean; weight: boolean }, p: ContentProposal): RowProposal {
  const d = miss.dims ? p.dims.find((x) => x.sourceId === p.bestDims) ?? null : null;
  const k = miss.weight ? p.weights.find((x) => x.sourceId === p.bestWeight) ?? null : null;
  const notes: string[] = [];
  // «εκτός τυπικών ορίων για τον τύπο» δεν κρατά την πρόταση πίσω (απόφαση 17/11/2026: διαστάσεις συσκευασίας είναι δεκτές,
  // για την αποστολή αυτές μετράνε)· οι υπόλοιποι έλεγχοι (όρια, αναλογίες, απίθανο βάρος) μένουν
  const warn = (p.warning ?? "").split(" · ").filter((x) => x && !x.startsWith("εκτός τυπικών ορίων για")).join(" · ");
  if (warn && (d || k)) notes.push(warn);
  const axDiffer = d && p.axes ? [p.axes.w, p.axes.h, p.axes.d].flatMap((a) => a.differ) : [];
  if (axDiffer.length) notes.push(`άλλη πηγή δίνει άλλες διαστάσεις (${axDiffer[0].label})`);
  const kgDiffer = k ? p.weightAgree?.differ ?? [] : [];
  if (kgDiffer.length) notes.push(`άλλη πηγή δίνει άλλο βάρος (${kgDiffer[0].label}: ${kgDiffer[0].value.toLocaleString("el-GR")} κιλά)`);
  if (miss.dims && !d && k) notes.push("δεν βρέθηκαν διαστάσεις");
  if (miss.weight && !k && d) notes.push("δεν βρέθηκε βάρος");
  const found = !!d || !!k;
  return {
    id, missDims: miss.dims, missWeight: miss.weight,
    dims: d ? { w: d.w, h: d.h, d: d.d, label: d.label, raw: d.raw, agree: p.axes ? Math.min(p.axes.w.agree, p.axes.h.agree, p.axes.d.agree) : 1 } : null,
    weight: k ? { kg: k.kg, label: k.label, raw: k.raw, agree: p.weightAgree?.agree ?? 1 } : null,
    status: !found ? "none" : notes.length ? "review" : "ready",
    notes,
  };
}

export type S1DimField = "weightKg" | "lengthCm" | "widthCm" | "heightCm" | "mass" | "dim1" | "dim2" | "dim3";
export const S1_DIM_FIELDS: S1DimField[] = ["weightKg", "lengthCm", "widthCm", "heightCm", "mass", "dim1", "dim2", "dim3"];
const blank = (v: unknown) => !(Number(String(v ?? "").replace(",", ".")) > 0);

/** Οι αλλαγές για το `writeItem`, από τις ζωντανές τιμές του SoftOne: Π×Υ×Β → Πλάτος/Ύψος/Μήκος (CCC) και Διάσταση 2/3/1. */
export function s1Changes(live: Record<S1DimField, unknown>, pick: { dims?: { w: number; h: number; d: number } | null; kg?: number | null }) {
  const out: Partial<Record<S1DimField, { from: number | null; to: number }>> = {};
  const set = (k: S1DimField, to: number) => { out[k] = { from: Number(String(live[k] ?? "").replace(",", ".")) || null, to }; };
  if (pick.dims) {
    const { w, h, d } = pick.dims;
    if (blank(live.lengthCm) && blank(live.widthCm) && blank(live.heightCm)) { set("lengthCm", d); set("widthCm", w); set("heightCm", h); }
    if (blank(live.dim1) && blank(live.dim2) && blank(live.dim3)) { set("dim1", d); set("dim2", w); set("dim3", h); }
  }
  if (pick.kg != null) { if (blank(live.weightKg)) set("weightKg", pick.kg); if (blank(live.mass)) set("mass", pick.kg); }
  return out;
}
