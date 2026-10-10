import type { BrandBlock, BrandStore } from "./brand-store";
import { diffLists, revertInList, type Body, type ListChange } from "./list-diff";

/*
 * Η σελίδα μάρκας ως μία λίστα (για τον χάρτη του editor και τις διαφορές πρόχειρου ↔ δημοσιευμένης):
 *   ρυθμίσεις σελίδας: Ταυτότητα & Google, Χρώματα
 *   σελίδα: [ζώνη πάνω] · Hero · [κύρια ζώνη] · ── κάτω ζώνη ── · [κάτω ζώνη]   (μετά ακολουθεί ο κατάλογος)
 * Η ζώνη κάθε component προκύπτει από τη θέση του ως προς το Hero και το διαχωριστικό.
 */
export type BrandPart = "identity" | "theme" | "hero";
export type BrandItem =
  | { key: `part:${BrandPart}`; kind: "part"; part: BrandPart; data: Body }
  | { key: "div:bottom"; kind: "divider" }
  | { key: string; kind: "block"; b: BrandBlock };

export const blkKey = (id: string) => `blk:${id}`;
const IDENTITY = ["name", "wordmark", "tagline", "logo", "logoAspect", "seo"] as const;
const THEME = ["theme", "website"] as const;
const PART_KEYS: Record<BrandPart, readonly string[]> = { identity: IDENTITY, theme: THEME, hero: ["hero"] };
const pick = (s: BrandStore, keys: readonly string[]) => Object.fromEntries(keys.filter((k) => (s as unknown as Body)[k] !== undefined).map((k) => [k, (s as unknown as Body)[k]]));

export function flattenBrand(s: BrandStore): BrandItem[] {
  const at = (z: string) => s.blocks.filter((b) => (b.zone ?? "main") === z).map((b): BrandItem => ({ key: blkKey(b.id), kind: "block", b }));
  return [
    { key: "part:identity", kind: "part", part: "identity", data: pick(s, PART_KEYS.identity) },
    { key: "part:theme", kind: "part", part: "theme", data: pick(s, PART_KEYS.theme) },
    ...at("top"),
    { key: "part:hero", kind: "part", part: "hero", data: pick(s, PART_KEYS.hero) },
    ...at("main"),
    { key: "div:bottom", kind: "divider" },
    ...at("bottom"),
  ];
}

/** Λίστα → σελίδα: τα πεδία των ρυθμίσεων από τα αντίστοιχα στοιχεία, η ζώνη κάθε component από τη θέση του. */
export function rebuildBrand(items: BrandItem[], base: BrandStore): BrandStore {
  let zone = "top";
  let out: BrandStore = { ...base, blocks: [] };
  const blocks: BrandBlock[] = [];
  for (const it of items) {
    if (it.kind === "part") {
      // όλα τα πεδία της ρύθμισης από το στοιχείο (όσα λείπουν σβήνονται, π.χ. λογότυπο που αφαιρέθηκε)
      const o = { ...out } as unknown as Body;
      for (const k of PART_KEYS[it.part]) { if (it.data[k] === undefined) delete o[k]; else o[k] = it.data[k]; }
      out = o as unknown as BrandStore;
      if (it.part === "hero") zone = "main";
    }
    else if (it.kind === "divider") zone = "bottom";
    else blocks.push({ ...it.b, zone });
  }
  return { ...out, blocks };
}

const body = (x: BrandItem): Body => (x.kind === "part" ? x.data : x.kind === "block" ? { ...x.b, zone: undefined } : {});
export type BrandChange = ListChange<BrandItem>;

export function diffBrand(doc: BrandStore, pub: BrandStore | null): BrandChange[] {
  return pub ? diffLists(flattenBrand(doc), flattenBrand(pub), body) : [];
}
export function revertBrandChange(doc: BrandStore, pub: BrandStore, c: BrandChange): BrandStore {
  return rebuildBrand(revertInList(flattenBrand(doc), flattenBrand(pub), c), doc);
}
