// Καθαρό: τι δείχνει το badge Κωτσόβολου (μόνο στη διαχείριση). Χωρίς DB — δουλεύει και σε client component.
import { badgeState } from "./kotsovolos/core";

/** Σειριοποιήσιμη μορφή του CompetitorPrice (χωρίς Decimal/Date) για client components. */
export type KotView = {
  match: string; extId: string | null; extUrl: string | null; extTitle: string | null;
  listPrice: number | null; offerPrice: number | null; available: boolean; ourPrice: number | null;
  diffPct: number | null; lastError: string | null; checkedAt: string | null;
};
type Num = { toString(): string } | number | null | undefined;
const num = (v: Num) => (v == null ? null : Number(v.toString()));

export function kotView(r: { match: string; extId: string | null; extUrl: string | null; extTitle: string | null; listPrice: Num; offerPrice: Num; available: boolean; ourPrice: Num; diffPct: number | null; lastError: string | null; checkedAt: Date | null } | null | undefined): KotView | null {
  if (!r) return null;
  return { match: r.match, extId: r.extId, extUrl: r.extUrl, extTitle: r.extTitle, listPrice: num(r.listPrice), offerPrice: num(r.offerPrice), available: r.available, ourPrice: num(r.ourPrice), diffPct: r.diffPct, lastError: r.lastError, checkedAt: r.checkedAt?.toISOString() ?? null };
}

export const eur = (v: number) => `${v.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
/** +27,5% · −7,7% (σωστό σύμβολο μείον) · 0,0% */
export const pct = (d: number) => `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d).toLocaleString("el-GR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/** Τιμή Κωτσόβολου = προσφορά ?? κατάλογος. */
export const theirPrice = (v: Pick<KotView, "listPrice" | "offerPrice">) => v.offerPrice ?? v.listPrice;
/** Διαγραμμένη «παλιά» τιμή μόνο όταν ο κατάλογος είναι πάνω από την προσφορά (ο Κωτσόβολος έχει μερικές φορές παλιό, χαμηλότερο κατάλογο). */
export const wasPrice = (v: Pick<KotView, "listPrice" | "offerPrice">) => (v.listPrice != null && v.offerPrice != null && v.listPrice > v.offerPrice ? v.listPrice : null);

export type BadgeKind = "up" | "down" | "eq" | "gone" | "none" | "suggested";
/** Μόνο auto/manual μετρούν με ποσοστό· suggested = πρόταση προς επιβεβαίωση· rejected/lost/χωρίς γραμμή = χωρίς ζευγάρι. */
export function badge(v: KotView | null, short = false): { kind: BadgeKind; text: string } {
  const name = short ? "Κωτσ." : "Κωτσόβολος";
  if (!v || !v.extId || v.match === "rejected" || v.match === "lost") return { kind: "none", text: short ? "Χωρίς ζευγάρι" : "Δεν βρέθηκε ζευγάρι στον Κωτσόβολο" };
  if (v.match === "suggested") return { kind: "suggested", text: "Πρόταση ζευγαριού · επιβεβαίωσε" };
  const their = theirPrice(v);
  const s = badgeState(v.diffPct, v.available);
  if (s === "gone") return { kind: "gone", text: short ? "Δεν διατίθεται πια" : "Δεν διατίθεται πια στον Κωτσόβολο" };
  if (their == null) return { kind: "none", text: `${name}: χωρίς τιμή` };
  if (s === "none") return { kind: "none", text: `${name} ${eur(their)}` };
  return { kind: s, text: `${pct(v.diffPct!)} · ${name} ${eur(their)}` };
}

/** «Είμαστε 179,01 € ακριβότεροι» — με βάση την τιμή μας τη στιγμή του ελέγχου. */
export function gapText(v: KotView | null): string | null {
  if (!v || (v.match !== "auto" && v.match !== "manual") || !v.available) return null;
  const their = theirPrice(v);
  if (their == null || v.ourPrice == null || v.diffPct == null) return null;
  if (Math.abs(v.diffPct) <= 0.5) return "Πρακτικά ίδια τιμή (διαφορά έως 0,5%).";
  const gap = Math.abs(v.ourPrice - their);
  return `Είμαστε ${eur(gap)} ${v.diffPct > 0 ? "ακριβότεροι" : "φθηνότεροι"}.`;
}

// ---- Γράφημα 30 ημερών (βηματικές γραμμές: κάθε τιμή ισχύει ώσπου να αλλάξει) ----
export type HistPoint = { t: number; ours: number | null; theirs: number | null };
const DAY = 86_400_000;
/** Σημεία μέσα στις 30 ημέρες· η τελευταία τιμή πριν από το παράθυρο μπαίνει στην αρχή του. null = λιγότερα από 2 σημεία (κενή κατάσταση). */
export function chartData(h: HistPoint[], now: number, days = 30): { points: HistPoint[]; from: number; to: number; min: number; max: number } | null {
  const from = now - days * DAY;
  const sorted = [...h].sort((a, b) => a.t - b.t);
  const before = sorted.filter((p) => p.t < from).at(-1);
  const points = [...(before ? [{ ...before, t: from }] : []), ...sorted.filter((p) => p.t >= from && p.t <= now)];
  if (points.length < 2) return null;
  const vals = points.flatMap((p) => [p.ours, p.theirs]).filter((x): x is number => x != null);
  if (!vals.length) return null;
  let min = Math.min(...vals), max = Math.max(...vals);
  const pad = Math.max((max - min) * 0.15, max * 0.02, 1);
  min = Math.max(0, min - pad); max += pad;
  return { points, from: points[0].t, to: now, min, max };
}
