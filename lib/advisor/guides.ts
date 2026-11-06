/**
 * Μόνιμη γνώση ανά κατηγορία («οδηγός αγοράς»): τι μετράει, ποια νούμερα είναι καλά, και ποια κατάσταση του πελάτη
 * γίνεται ποιο κριτήριο πάνω στα ΠΡΑΓΜΑΤΙΚΑ κλειδιά χαρακτηριστικών της κατηγορίας («πολύ φωτεινό δωμάτιο» → Φωτεινότητα ≥ 3500).
 * Γράφεται μία φορά από το `npm run advisor:guides` (μοντέλο + ευρετήριο χαρακτηριστικών) στο guides.json, μπαίνει στο repo
 * και διορθώνεται με το χέρι αν χρειαστεί. Ξαναγράφεται μόνο όταν αλλάξουν τα κλειδιά της κατηγορίας ή με --force.
 */
import data from "./guides.json";
import type { Op } from "./spec-criteria";

export interface GuideRule { when: string; keys: string[]; op: Op; value: number | string; why: string }
export interface CategoryGuide { name: string; slug: string; keysHash: string; at: string; guide: string; rules: GuideRule[] }

const GUIDES = data as unknown as Record<string, CategoryGuide>;

export const guideOf = (categoryId: string): CategoryGuide | undefined => GUIDES[categoryId];

/** Για το prompt: ο οδηγός κάθε επιλεγμένης κατηγορίας (κενό αν καμία δεν έχει). */
export function guidesText(categoryIds: string[]): string {
  return categoryIds.map((id) => GUIDES[id]).filter((g): g is CategoryGuide => !!g).map((g) => `${g.name.toUpperCase()}\n${g.guide}`).join("\n");
}

/** Για τη χαρτογράφηση αναγκών: οι κανόνες «κατάσταση → κριτήριο» των επιλεγμένων κατηγοριών. */
export function guideRules(categoryIds: string[]): GuideRule[] {
  return categoryIds.flatMap((id) => GUIDES[id]?.rules ?? []);
}
