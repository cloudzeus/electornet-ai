import type { BrandBlock } from "./brand-store";
import { afterZone, TOP_ZONE, type HomeDoc, type HomeSection } from "./home-sections";
import { diffLists, revertInList, type Body, type ListChange } from "./list-diff";
export { stable } from "./list-diff";

/* Η αρχική ως μία λίστα (ενότητες + components με τη σειρά της σελίδας) και οι διαφορές πρόχειρου ↔ δημοσιευμένης. */

export type HomeItem = { key: string; kind: "section"; s: HomeSection } | { key: string; kind: "block"; b: BrandBlock };
export const secKey = (id: string) => `sec:${id}`;
export const blkKey = (id: string) => `blk:${id}`;

/** Έγγραφο → λίστα με τη σειρά που εμφανίζεται στη σελίδα. */
export function flatten(doc: HomeDoc): HomeItem[] {
  const at = (zone: string) => doc.blocks.filter((b) => (b.zone ?? TOP_ZONE) === zone).map((b): HomeItem => ({ key: blkKey(b.id), kind: "block", b }));
  return [...at(TOP_ZONE), ...doc.sections.flatMap((s) => [{ key: secKey(s.id), kind: "section", s } as HomeItem, ...at(afterZone(s.id))])];
}
/** Λίστα → έγγραφο: κάθε component παίρνει τη ζώνη της ενότητας που προηγείται (ή «κορυφή»). */
export function rebuild(items: HomeItem[]): HomeDoc {
  let zone = TOP_ZONE;
  const sections: HomeSection[] = [], blocks: BrandBlock[] = [];
  for (const it of items) {
    if (it.kind === "section") { sections.push(it.s); zone = afterZone(it.s.id); } else blocks.push({ ...it.b, zone });
  }
  return { sections, blocks };
}

const body = (x: HomeItem): Body => (x.kind === "section" ? { ...x.s } : { ...x.b, zone: undefined });

export type HomeChange = ListChange<HomeItem>;

/** Οι αλλαγές του πρόχειρου από τη δημοσιευμένη: προσθήκες, αφαιρέσεις, αλλαγές, σειρά. */
export function diffHome(doc: HomeDoc, pub: HomeDoc | null): HomeChange[] {
  return pub ? diffLists(flatten(doc), flatten(pub), body) : [];
}

/** Αναίρεση μίας αλλαγής: το στοιχείο (ή η σειρά) γυρίζει όπως είναι δημοσιευμένο· τα υπόλοιπα μένουν. */
export function revertChange(doc: HomeDoc, pub: HomeDoc, c: HomeChange): HomeDoc {
  return rebuild(revertInList(flatten(doc), flatten(pub), c));
}
