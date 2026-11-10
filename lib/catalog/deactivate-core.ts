/**
 * **Απενεργοποίηση προϊόντων από Excel** — καθαρά κομμάτια (χωρίς βάση ή δίκτυο).
 *
 * Δύο τρόποι, γιατί δεν είναι το ίδιο πράγμα:
 * - `web`: το είδος φεύγει **μόνο από το eshop** — τσεκάρεται η «Εξαίρεση Web» στο SoftOne. Μένει ενεργό στο ERP, άρα τα
 *   καταστήματα συνεχίζουν να το πουλούν και να το παραγγέλνουν.
 * - `erp`: το είδος γίνεται **ανενεργό στο SoftOne** (ISACTIVE=0) — φεύγει από παντού: eshop, παραγγελίες, παραστατικά.
 */
export type DeactMode = "web" | "erp";

/** Τι είναι σήμερα το είδος μιας γραμμής του αρχείου. */
export type DeactState =
  | "live"       // ενεργό και στο eshop → θα φύγει
  | "web-off"    // ενεργό στο SoftOne αλλά ήδη με «Εξαίρεση Web» (ή χωρίς web κατηγορία): στο eshop δεν φαίνεται
  | "inactive"   // ήδη ανενεργό στο SoftOne
  | "notfound"   // κανένα είδος με αυτό το κλειδί
  | "problem";   // διφορούμενο κλειδί / το ίδιο είδος δύο φορές

export interface DeactItem { active: boolean; webExcluded: boolean; onWeb: boolean }

export function deactState(it: DeactItem | null, problem: string | null): DeactState {
  if (problem) return "problem";
  if (!it) return "notfound";
  if (!it.active) return "inactive";
  return it.webExcluded || !it.onWeb ? "web-off" : "live";
}

/** Έχει κάτι να κάνει η εκτέλεση για αυτή τη γραμμή, με αυτόν τον τρόπο; */
export const deactApplies = (state: DeactState, mode: DeactMode): boolean =>
  state === "live" || (mode === "erp" && state === "web-off");

export const DEACT_LABEL: Record<DeactState, string> = {
  live: "Στο eshop", "web-off": "Εκτός eshop, ενεργό στο SoftOne", inactive: "Ήδη ανενεργό", notfound: "Δεν βρέθηκε", problem: "Πρόβλημα",
};
