import type { FieldKey } from "@/lib/catalog/supplier-sheet";
import { detectHeaderRow, type MappingConfig, type SavedConfig, type Target } from "@/lib/catalog/foreign-import/core";

/**
 * Εισαγωγή από ξένο Excel — καθαρά κομμάτια της οθόνης (χωρίς βάση, server-only ή React): τι στέλνει ο έλεγχος αρχείου
 * στον browser, κωδικοποίηση στόχων για τα <select>, έλεγχος της αντιστοίχισης που έρχεται από τον browser, αυτόματη
 * αντιστοίχιση ονομάτων μάρκας/κατηγορίας.
 */
export const PREVIEW_ROWS = 40;
const PREVIEW_COLS = 200; // όσες και οι στήλες: οι επικεφαλίδες της προεπισκόπησης ορίζουν τις προτάσεις και την αποθηκευμένη αντιστοίχιση
const MAX_COLS = 200;
/** Πάνω από τόσες διαφορετικές τιμές η στήλη δεν είναι μάρκα/κατηγορία — δεν στέλνονται τιμές. */
export const MAX_VALUES = 300;

/** Διαφορετικές τιμές μιας στήλης με τον τελευταίο δείκτη γραμμής όπου εμφανίζονται (για να κρυφτούν όσες είναι μόνο πάνω από την επικεφαλίδα). */
export type ColValues = { many: true } | { many?: false; values: { v: string; last: number }[] };
export type SavedMappingRef = { id: string; name: string; config: SavedConfig };
export type InspectSheet = { name: string; rowCount: number; headerRow: number; preview: string[][]; cols: ColValues[]; mapping: SavedMappingRef | null };

const txt = (v: unknown) => (v == null ? "" : String(v)).trim();
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Ό,τι χρειάζεται η οθόνη από ένα φύλλο: πλήθος γραμμών, προτεινόμενη επικεφαλίδα, οι πρώτες 40 γραμμές (κομμένες) και οι τιμές ανά στήλη. */
export function inspectSheet(matrix: string[][]): Omit<InspectSheet, "name" | "mapping"> {
  const width = Math.min(MAX_COLS, Math.max(0, ...matrix.map((r) => r?.length ?? 0)));
  const cols: ColValues[] = [];
  for (let c = 0; c < width; c++) {
    const last = new Map<string, number>();
    let many = false;
    for (let r = 0; r < matrix.length && !many; r++) {
      const v = txt(matrix[r]?.[c]);
      if (!v) continue;
      if (!last.has(v) && last.size >= MAX_VALUES) many = true; else last.set(v, r);
    }
    cols.push(many ? { many: true } : { values: [...last].map(([v, l]) => ({ v, last: l })).sort((a, b) => a.v.localeCompare(b.v, "el")) });
  }
  return {
    rowCount: matrix.filter((r) => r?.some((c) => txt(c))).length,
    headerRow: detectHeaderRow(matrix),
    preview: matrix.slice(0, PREVIEW_ROWS).map((r) => (r ?? []).slice(0, PREVIEW_COLS).map((c) => cut(txt(c), 160))),
    cols,
  };
}

/** Οι τιμές της στήλης που εμφανίζονται κάτω από την επικεφαλίδα (null = πάρα πολλές για αντιστοίχιση). */
export function valuesAfter(col: ColValues | undefined, headerRow: number): string[] | null {
  if (!col) return [];
  if (col.many) return null;
  return col.values.filter((x) => x.last > headerRow).map((x) => x.v);
}

// ---------- Στόχοι ----------

export const FIELD_KEYS: FieldKey[] = ["mtrl", "code", "name", "barcode", "factoryCode", "shortDesc", "descText", "guaranteeMonths", "widthCm", "heightCm", "lengthCm", "weightKg"];

/** Τιμή <option> για έναν στόχο: "field:name", "spec", "media:image", "brand", … */
export function encodeTarget(t: Target): string {
  switch (t.kind) {
    case "field": return `field:${t.key}`;
    case "media": return `media:${t.type}`;
    default: return t.kind;
  }
}

/** Αντίστροφο του encodeTarget· το χαρακτηριστικό παίρνει την ετικέτα που δίνεται. Άγνωστο → αγνόηση. */
export function decodeTarget(s: string, label = ""): Target {
  const [k, sub] = s.split(":");
  if (k === "field" && FIELD_KEYS.includes(sub as FieldKey)) return { kind: "field", key: sub as FieldKey };
  if (k === "media" && (sub === "image" || sub === "banner" || sub === "video")) return { kind: "media", type: sub };
  if (k === "spec") return { kind: "spec", label };
  if (k === "brand" || k === "category" || k === "cost" || k === "rrp") return { kind: k };
  return { kind: "ignore" };
}

// ---------- Έλεγχος αντιστοίχισης από τον browser ----------

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const idOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

function parseTarget(v: unknown): Target | null {
  if (!isObj(v) || typeof v.kind !== "string") return null;
  if (v.kind === "spec") {
    const label = txt(v.label);
    if (!label) throw new Error("Κάθε στήλη-χαρακτηριστικό χρειάζεται ετικέτα.");
    if (label.length > 80) throw new Error("Η ετικέτα χαρακτηριστικού έχει έως 80 χαρακτήρες.");
    return { kind: "spec", label };
  }
  const t = decodeTarget(v.kind === "field" ? `field:${v.key}` : v.kind === "media" ? `media:${v.type}` : v.kind);
  return t.kind === "ignore" && v.kind !== "ignore" ? null : t;
}

function parseMap(v: unknown): Record<string, string | null> {
  if (v == null) return {};
  if (!isObj(v)) throw new Error("Μη έγκυρη αντιστοίχιση τιμών.");
  const out: Record<string, string | null> = {};
  for (const [k, x] of Object.entries(v).slice(0, 5000)) if (k.trim()) out[k] = idOrNull(x);
  return out;
}

/** Η αντιστοίχιση όπως ήρθε από τον browser → MappingConfig, ή Error με ελληνικό μήνυμα. Άγνωστοι στόχοι απορρίπτονται. */
export function parseConfig(raw: unknown): MappingConfig {
  if (!isObj(raw) || !isObj(raw.columns)) throw new Error("Μη έγκυρη αντιστοίχιση στηλών.");
  const columns: Record<number, Target> = {};
  for (const [k, v] of Object.entries(raw.columns)) {
    const i = Number(k);
    if (!Number.isInteger(i) || i < 0 || i >= MAX_COLS) throw new Error("Μη έγκυρη στήλη στην αντιστοίχιση.");
    const t = parseTarget(v);
    if (!t) throw new Error(`Μη έγκυρος στόχος για τη στήλη ${i + 1}.`);
    if (t.kind !== "ignore") columns[i] = t;
  }
  return { columns, brandMap: parseMap(raw.brandMap), categoryMap: parseMap(raw.categoryMap), sheetBrandId: idOrNull(raw.sheetBrandId), sheetCategoryId: idOrNull(raw.sheetCategoryId) };
}

/** Όλα τα id μάρκας/κατηγορίας που αναφέρει η αντιστοίχιση (για έλεγχο ότι υπάρχουν). */
export function configIds(c: MappingConfig): { brands: string[]; categories: string[] } {
  const brands = new Set([...Object.values(c.brandMap), c.sheetBrandId].filter((x): x is string => !!x));
  const categories = new Set([...Object.values(c.categoryMap), c.sheetCategoryId].filter((x): x is string => !!x));
  return { brands: [...brands], categories: [...categories] };
}

// ---------- Αυτόματη αντιστοίχιση ονομάτων ----------

/** Σύγκριση ονομάτων: πεζά, χωρίς τόνους, μόνο γράμματα/ψηφία (π.χ. «Hewlett-Packard» = «hewlett packard»). */
export const nameKey = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/ς/g, "σ").replace(/[^\p{L}\p{N}]+/gu, "");

/** Για κάθε τιμή του αρχείου: το id της επιλογής με ίδιο κανονικοποιημένο όνομα, μόνο αν είναι μοναδική — αλλιώς null. */
export function autoMatch(values: string[], options: { id: string; name: string }[]): Record<string, string | null> {
  const by = new Map<string, string[]>();
  for (const o of options) { const k = nameKey(o.name); if (k) by.set(k, [...(by.get(k) ?? []), o.id]); }
  return Object.fromEntries(values.map((v) => { const l = by.get(nameKey(v)); return [v, l?.length === 1 ? l[0] : null]; }));
}
