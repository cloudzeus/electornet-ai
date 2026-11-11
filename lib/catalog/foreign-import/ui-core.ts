import type { FieldKey } from "@/lib/catalog/supplier-sheet";
import { detectHeaderRow, UserError, PREVIEW_CELL, type ComposeField, type ComposePart, type CatSpecs, type MappingConfig, type SavedConfig, type SavedPrice, type Target } from "@/lib/catalog/foreign-import/core";
import { normPolicy } from "@/lib/catalog/xml-import/policy-core";

/** Οι επιλογές τιμής του βήματος 3 όπως έρχονται από τον browser → έγκυρες (λάθος ή απουσία = προεπιλογές). */
export function parsePrice(raw: unknown): SavedPrice {
  const p = normPolicy(raw);
  return { priceMode: (raw as { priceMode?: unknown } | null)?.priceMode === "retail" ? "retail" : "cost", vatIncluded: p.vatIncluded, markupPercent: p.markupPercent };
}

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
/** Μία από τις «Πρόσφατες εισαγωγές» (ImportJob) όπως τη δείχνει η οθόνη. */
export type RecentJob = { id: string; fileName: string; status: string; createdAt: string; counts: { update: number; unchanged: number; new: number; waiting: number; problem: number }; applied: { done?: number; waiting?: number; pending?: number; errors?: number } | null };
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
    // Κομμένα κελιά μόνο για εμφάνιση/μέγεθος· τα κλειδιά επικεφαλίδων (υπογραφή, αποθηκευμένη αντιστοίχιση) αγνοούν το «…» (core: headKey)
    preview: matrix.slice(0, PREVIEW_ROWS).map((r) => (r ?? []).slice(0, PREVIEW_COLS).map((c) => cut(txt(c), PREVIEW_CELL))),
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
  if (k === "brand" || k === "category" || k === "unit" || k === "mark" || k === "cost" || k === "rrp" || k === "availability") return { kind: k };
  return { kind: "ignore" };
}

// ---------- Έλεγχος αντιστοίχισης από τον browser ----------

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const idOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

function parseTarget(v: unknown): Target | null {
  if (!isObj(v) || typeof v.kind !== "string") return null;
  if (v.kind === "spec") {
    const label = txt(v.label);
    if (!label) throw new UserError("Κάθε στήλη-χαρακτηριστικό χρειάζεται ετικέτα.");
    if (label.length > 80) throw new UserError("Η ετικέτα χαρακτηριστικού έχει έως 80 χαρακτήρες.");
    return { kind: "spec", label };
  }
  const t = decodeTarget(v.kind === "field" ? `field:${v.key}` : v.kind === "media" ? `media:${v.type}` : v.kind);
  return t.kind === "ignore" && v.kind !== "ignore" ? null : t;
}

function parseMap(v: unknown): Record<string, string | null> {
  if (v == null) return {};
  if (!isObj(v)) throw new UserError("Μη έγκυρη αντιστοίχιση τιμών.");
  const out: Record<string, string | null> = {};
  for (const [k, x] of Object.entries(v).slice(0, 5000)) if (k.trim()) out[k] = idOrNull(x);
  return out;
}

const COMPOSE_KEYS = new Set(["name", "shortDesc", "descText"]);
/** Σύνθετα πεδία από τον browser: έως 10, έως 12 κομμάτια το καθένα, κείμενο έως 80 χαρακτήρες. Χωρίς κομμάτια → παραλείπεται. */
function parseCompose(v: unknown): ComposeField[] {
  if (v == null) return [];
  if (!Array.isArray(v) || v.length > 10) throw new UserError("Μη έγκυρα σύνθετα πεδία.");
  return v.flatMap((f): ComposeField[] => {
    if (!isObj(f) || !isObj(f.target) || !Array.isArray(f.parts) || f.parts.length > 12) throw new UserError("Μη έγκυρο σύνθετο πεδίο.");
    const t = f.target;
    let target: ComposeField["target"];
    if (t.kind === "field" && typeof t.key === "string" && COMPOSE_KEYS.has(t.key)) target = { kind: "field", key: t.key as "name" };
    else if (t.kind === "spec" && txt(t.label) && txt(t.label).length <= 80) target = { kind: "spec", label: txt(t.label) };
    else throw new UserError("Κάθε σύνθετο πεδίο χρειάζεται προορισμό (και ετικέτα, αν είναι χαρακτηριστικό).");
    const parts = f.parts.map((p): ComposePart => {
      if (isObj(p) && p.kind === "brand") return { kind: "brand" };
      if (isObj(p) && p.kind === "text" && typeof p.text === "string" && p.text.length <= 80) return { kind: "text", text: p.text };
      if (isObj(p) && p.kind === "col" && Number.isInteger(p.col) && (p.col as number) >= 0 && (p.col as number) < MAX_COLS) return { kind: "col", col: p.col as number };
      throw new UserError("Μη έγκυρο κομμάτι σε σύνθετο πεδίο.");
    });
    return parts.length ? [{ target, parts }] : [];
  });
}

/** Η αντιστοίχιση όπως ήρθε από τον browser → MappingConfig, ή Error με ελληνικό μήνυμα. Άγνωστοι στόχοι απορρίπτονται. */
export function parseConfig(raw: unknown): MappingConfig {
  if (!isObj(raw) || !isObj(raw.columns)) throw new UserError("Μη έγκυρη αντιστοίχιση στηλών.");
  const columns: Record<number, Target> = {};
  for (const [k, v] of Object.entries(raw.columns)) {
    const i = Number(k);
    if (!Number.isInteger(i) || i < 0 || i >= MAX_COLS) throw new UserError("Μη έγκυρη στήλη στην αντιστοίχιση.");
    const t = parseTarget(v);
    if (!t) throw new UserError(`Μη έγκυρος στόχος για τη στήλη ${i + 1}.`);
    if (t.kind !== "ignore") columns[i] = t;
  }
  const compose = parseCompose(raw.compose);
  const catSpecs = parseCatSpecs(raw.catSpecs), rowCats = parseRowCats(raw.rowCats);
  return {
    columns, ...(compose.length ? { compose } : {}), ...(Object.keys(catSpecs).length ? { catSpecs } : {}), ...(Object.keys(rowCats).length ? { rowCats } : {}),
    brandMap: parseMap(raw.brandMap), categoryMap: parseMap(raw.categoryMap), unitMap: parseMap(raw.unitMap), markMap: parseMap(raw.markMap),
    sheetBrandId: idOrNull(raw.sheetBrandId), sheetCategoryId: idOrNull(raw.sheetCategoryId), sheetUnitId: idOrNull(raw.sheetUnitId), sheetMarkId: idOrNull(raw.sheetMarkId),
  };
}

/** Χαρακτηριστικά ανά κατηγορία: έως 200 κατηγορίες, στήλη 0..MAX_COLS → όνομα έως 80 χαρακτήρες· κενά πετιούνται. */
function parseCatSpecs(raw: unknown): CatSpecs {
  if (raw == null) return {};
  if (!isObj(raw) || Object.keys(raw).length > 200) throw new UserError("Μη έγκυρα χαρακτηριστικά ανά κατηγορία.");
  const out: CatSpecs = {};
  for (const [cat, m] of Object.entries(raw)) {
    const id = idOrNull(cat);
    if (!id || !isObj(m)) throw new UserError("Μη έγκυρα χαρακτηριστικά ανά κατηγορία.");
    const cols: Record<number, string> = {};
    for (const [k, v] of Object.entries(m)) {
      const i = Number(k);
      if (!Number.isInteger(i) || i < 0 || i >= MAX_COLS || typeof v !== "string" || v.length > 80) throw new UserError("Μη έγκυρα χαρακτηριστικά ανά κατηγορία.");
      if (v.trim()) cols[i] = v.trim();
    }
    if (Object.keys(cols).length) out[id] = cols;
  }
  return out;
}

/** Κατηγορία ανά γραμμή (από τις προτάσεις AI): αριθμός γραμμής → id, έως 20.000 γραμμές. */
function parseRowCats(raw: unknown): Record<number, string> {
  if (raw == null) return {};
  if (!isObj(raw) || Object.keys(raw).length > 20_000) throw new UserError("Μη έγκυρες κατηγορίες ανά γραμμή.");
  const out: Record<number, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const r = Number(k), id = idOrNull(v);
    if (!Number.isInteger(r) || r < 1 || !id) throw new UserError("Μη έγκυρες κατηγορίες ανά γραμμή.");
    out[r] = id;
  }
  return out;
}

/** Όλα τα id μάρκας / κατηγορίας / μονάδας / σήμανσης που αναφέρει η αντιστοίχιση (για έλεγχο ότι υπάρχουν). */
export function configIds(c: MappingConfig): { brands: string[]; categories: string[]; units: string[]; marks: string[] } {
  const ids = (m: Record<string, string | null> | undefined, one: string | null | undefined) =>
    [...new Set([...Object.values(m ?? {}), one ?? null].filter((x): x is string => !!x))];
  return { brands: ids(c.brandMap, c.sheetBrandId), categories: [...new Set([...ids(c.categoryMap, c.sheetCategoryId), ...Object.values(c.rowCats ?? {})])], units: ids(c.unitMap, c.sheetUnitId), marks: ids(c.markMap, c.sheetMarkId) };
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
