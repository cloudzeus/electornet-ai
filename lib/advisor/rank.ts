/**
 * Κατάταξη υποψηφίων του Ερμή (χωρίς AI). Κανόνας του καταστήματος: ΠΡΩΤΑ όσα είναι σε προσφορά και άμεσα διαθέσιμα,
 * μετά όσα είναι σε προσφορά, μετά τα άμεσα διαθέσιμα, μετά τα υπόλοιπα. Μέσα σε κάθε ομάδα: σχετικότητα με την ερώτηση
 * (ή η προτεραιότητα του πελάτη: τιμή / θόρυβος / κατανάλωση / ποιότητα). Σε γενική ερώτηση («θέλω πλυντήριο»)
 * οι υποψήφιοι κάθε ομάδας μοιράζονται σε φθηνά / μεσαία / ακριβά, ώστε η έρευνα να βλέπει όλο το εύρος.
 */
export interface RankCand { id: string; brandId: string; price: number | null; stock: number; sim: number; offer: boolean; energy: boolean; noise: number | null; kwh: number | null; cls: string | null }
export type Priority = "price" | "quiet" | "energy" | "quality" | null | undefined;
const CLASS_ORDER = ["A+++", "A++", "A+", "A", "B", "C", "D", "E", "F", "G"];

export const tierOf = (c: Pick<RankCand, "offer" | "stock">) => (c.offer ? 2 : 0) + (c.stock > 0 ? 1 : 0);
const score = (c: RankCand) => c.sim + (c.price && c.price > 0 ? 0.05 : -0.25) + (c.energy ? 0.02 : 0);

function byPriority(p: Priority): (a: RankCand, b: RankCand) => number {
  if (p === "price") return (a, b) => (a.price || 1e9) - (b.price || 1e9);
  if (p === "quiet") return (a, b) => (a.noise ?? 999) - (b.noise ?? 999);
  if (p === "energy") return (a, b) => (CLASS_ORDER.indexOf(a.cls ?? "") + 1 || 99) - (CLASS_ORDER.indexOf(b.cls ?? "") + 1 || 99) || (a.kwh ?? 1e9) - (b.kwh ?? 1e9);
  if (p === "quality") return (a, b) => (b.price ?? 0) - (a.price ?? 0);
  return (a, b) => score(b) - score(a);
}

/** Φθηνά / μεσαία / ακριβά εναλλάξ (με βάση τα τριτημόρια τιμής όλων των υποψηφίων), κρατώντας τη σειρά μέσα σε κάθε ζώνη. */
function spread(list: RankCand[], cuts: [number, number]): RankCand[] {
  const band = (c: RankCand) => (!c.price ? 1 : c.price <= cuts[0] ? 0 : c.price <= cuts[1] ? 1 : 2);
  const q: RankCand[][] = [[], [], []];
  for (const c of list) q[band(c)].push(c);
  const out: RankCand[] = [];
  for (let i = 0; out.length < list.length; i++) for (const b of [1, 0, 2]) { const c = q[b][i]; if (c) out.push(c); }
  return out;
}

export function rankCandidates(cands: RankCand[], o: { take: number; priority?: Priority; generic?: boolean; brandLock?: boolean; perBrand?: number }): string[] {
  const cmp = byPriority(o.priority);
  const prices = cands.map((c) => c.price ?? 0).filter((p) => p > 0).sort((a, b) => a - b);
  const cuts: [number, number] = [prices[Math.floor(prices.length / 3)] ?? 0, prices[Math.floor((2 * prices.length) / 3)] ?? 0];
  const ordered: RankCand[] = [];
  for (const t of [3, 2, 1, 0]) {
    const group = cands.filter((c) => tierOf(c) === t).sort(cmp);
    ordered.push(...(o.generic && !o.priority ? spread(group, cuts) : group));
  }
  // εύρος, όχι παραλλαγές της ίδιας σειράς: έως 4 ανά μάρκα (εκτός αν ζητήθηκε συγκεκριμένη μάρκα)
  const cap = o.perBrand ?? 4, per = new Map<string, number>(), picked: RankCand[] = [];
  for (const c of ordered) { if (!o.brandLock && (per.get(c.brandId) ?? 0) >= cap) continue; per.set(c.brandId, (per.get(c.brandId) ?? 0) + 1); picked.push(c); if (picked.length === o.take) break; }
  return (picked.length >= 3 ? picked : ordered.slice(0, o.take)).map((c) => c.id);
}
