/**
 * Γραμμές «ετικέτα : τιμή» της περιγραφής → γραμμές του πίνακα CCCITEMWEBSPECSLNS (χαρακτηριστικά ανά είδος).
 * Η ετικέτα αντιστοιχίζεται με το όνομα χαρακτηριστικού της ομάδας (CCCWEBSPECS), χωρίς τόνους/κεφαλαία/κενά.
 * Καθαρή συνάρτηση: τρέχει και σε tests.
 */
import type { ParsedSpec } from "./describe";

/** STRSOVALUE: έως 128 χαρακτήρες */
export const SPEC_VALUE_MAX = 128;

const key = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

export function matchSpecTable(specs: ParsedSpec[], defs: { code: number; name: string }[]) {
  const byName = new Map(defs.map((d) => [key(d.name), d.code]));
  const rows: { ACODE: number; STRVAL: string }[] = [];
  const unmatched: string[] = [], tooLong: string[] = [];
  const used = new Set<number>();
  for (const s of specs) {
    const code = byName.get(key(s.key));
    const v = s.value.trim();
    if (code == null) { unmatched.push(s.key); continue; }
    if (used.has(code) || !v) continue; // η πρώτη γραμμή με την ίδια ετικέτα κερδίζει
    if (v.length > SPEC_VALUE_MAX) { tooLong.push(s.key); continue; }
    used.add(code);
    rows.push({ ACODE: code, STRVAL: v });
  }
  return { rows, unmatched, tooLong };
}
