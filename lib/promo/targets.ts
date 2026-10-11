import { matches, type PromoTarget } from "./engine";

export type Line = { productId: string; variantId: string; brandId: string; categoryIds: string[] };
/**
 * Οι στόχοι της προσφοράς μετά την προσθήκη / αφαίρεση ενός προϊόντος. Οι δικοί του στόχοι (ένταξη ή εξαίρεση) φεύγουν·
 * αν μπαίνει ήδη από μάρκα / κατηγορία / «όλα», η προσθήκη δεν χρειάζεται τίποτα και η αφαίρεση γίνεται με εξαίρεση.
 */
export function nextTargets(targets: PromoTarget[], l: Line, remove: boolean): PromoTarget[] {
  const mine = (t: PromoTarget) => t.kind === "product" && (t.refId === l.productId || (!!l.variantId && t.refId === l.variantId));
  const others = targets.filter((t) => !mine(t));
  const viaOthers = matches({ targets: others }, l);
  if (remove) return viaOthers ? [...others, { kind: "product", refId: l.productId, exclude: true }] : others;
  return viaOthers ? others : [...others, { kind: "product", refId: l.productId, exclude: false }];
}

