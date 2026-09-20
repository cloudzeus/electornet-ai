/**
 * Πού τοποθετείται το προϊόν στο AR: στο πάτωμα ή κολλημένο στον τοίχο.
 * Αυτόματα από την κατηγορία, με δυνατότητα αλλαγής ανά προϊόν στη
 * διαχείριση (π.χ. τηλεόραση που θα μπει σε έπιπλο).
 */
export type Placement = "floor" | "wall";
const WALL = new Set(["air-condition", "tileoraseis", "aporrofitires", "thermosifones"]);

export function placementFor(p: { category?: string; subcategory?: string }, override?: string | null): Placement {
  if (override === "wall" || override === "floor") return override;
  return WALL.has(p.subcategory ?? "") || WALL.has(p.category ?? "") ? "wall" : "floor";
}
