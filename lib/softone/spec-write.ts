import "server-only";
import { db } from "@/lib/db";
import { s1 } from "@/lib/softone";
import { getSetting } from "@/lib/settings/store";

/**
 * Αλλαγές στα χαρακτηριστικά web του SoftOne (EditMaster CCCWEBGRSPECS: ομάδα → χαρακτηριστικά → προκαθορισμένες τιμές).
 * Ισχύουν στο SoftOne, στο παλιό site (διαβάζει τους ίδιους πίνακες) και στο νέο e-shop μετά την προβολή των φίλτρων.
 *
 * Οι γραμμές λεπτομέρειας δεν έχουν LINENUM: ό,τι λείπει από το setData κινδυνεύει να σβηστεί. Γι' αυτό κάθε αλλαγή:
 *   1. διαβάζει ΟΛΗ την ομάδα (getData), 2. αλλάζει μόνο τη μία γραμμή, 3. στέλνει πίσω ΟΛΕΣ τις γραμμές,
 *   4. ξαναδιαβάζει και επαληθεύει ότι η αλλαγή έγινε και ότι καμία άλλη γραμμή δεν άλλαξε ή χάθηκε.
 * Αφαίρεση = ανενεργό (ISACTIVE=0), ποτέ διαγραφή: οι κωδικοί μένουν, πάνω τους κρέμονται φίλτρα και σύνδεσμοι.
 * Επαληθευμένο με δοκιμαστική εγγραφή στην ομάδα 814 (2026-10-11).
 */
const OBJECT = "CCCWEBGRSPECS";
type Row = Record<string, string>;
type Group = { CCCWEBGRSPECS: Row[]; CCCWEBSPECS: Row[]; CCCWEBSPECSLNS?: Row[] };

export async function specWriteEnabled() {
  const s = await getSetting("softone").catch(() => null);
  return String(((s?.data ?? {}) as Record<string, unknown>).specsWrite ?? "off") === "on";
}

/** Για αποστολή: χωρίς UPDDATE (το βάζει το ERP) και «60|Όνομα» → «60». */
const clean = (r: Row): Row => Object.fromEntries(Object.entries(r).filter(([k]) => k !== "UPDDATE").map(([k, v]) => [k, typeof v === "string" && /^-?\d+\|/.test(v) ? v.split("|")[0] : String(v ?? "")]));
const sig = (r: Row) => JSON.stringify(Object.entries(clean(r)).sort(([a], [b]) => a.localeCompare(b)));

async function readGroup(groupS1Id: number): Promise<Group> {
  const r = await s1("getData", { OBJECT, KEY: groupS1Id });
  if (!r?.success) throw new Error(`SoftOne getData: ${r?.error ?? "χωρίς απάντηση"}`);
  if (r.readOnly) throw new Error("Ο λογαριασμός web έχει μόνο ανάγνωση στις ομάδες χαρακτηριστικών.");
  const d = r.data as Group;
  if (!d?.CCCWEBGRSPECS?.[0]) throw new Error("Η ομάδα δεν βρέθηκε στο SoftOne.");
  return { CCCWEBGRSPECS: d.CCCWEBGRSPECS, CCCWEBSPECS: d.CCCWEBSPECS ?? [], CCCWEBSPECSLNS: d.CCCWEBSPECSLNS ?? [] };
}

export type SpecChange =
  | { kind: "add-spec"; name: string; isFilter: boolean; isView: boolean }
  | { kind: "set-spec"; code: number; patch: { name?: string; isFilter?: boolean; isView?: boolean; active?: boolean } }
  | { kind: "add-option"; code: number; name: string }
  | { kind: "set-option"; code: number; option: number; patch: { name?: string; active?: boolean } };

const yn = (b: boolean) => (b ? "1" : "0");
const tidy = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 100);

/** Τι θα σταλεί: η ομάδα όπως είναι + η μία αλλαγή. Επιστρέφει και ποια γραμμή αλλάζει (για επαλήθευση). */
function apply(g: Group, groupS1Id: number, c: SpecChange) {
  const company = g.CCCWEBGRSPECS[0].COMPANY;
  const specs = g.CCCWEBSPECS.map(clean), lns = (g.CCCWEBSPECSLNS ?? []).map(clean);
  let target: { table: "CCCWEBSPECS" | "CCCWEBSPECSLNS"; match: (r: Row) => boolean; expect: Row };
  if (c.kind === "add-spec") {
    const name = tidy(c.name);
    if (!name) throw new Error("Γράψε όνομα χαρακτηριστικού.");
    if (specs.some((r) => tidy(r.NAME).toLocaleLowerCase("el") === name.toLocaleLowerCase("el"))) throw new Error(`Υπάρχει ήδη χαρακτηριστικό «${name}» στην ομάδα.`);
    const code = Math.max(0, ...specs.map((r) => Number(r.WEBSPECS) || 0)) + 1;
    if (code > 32000) throw new Error("Δεν υπάρχει ελεύθερος κωδικός χαρακτηριστικού.");
    const row = { COMPANY: company, CCCWEBGRSPECS: String(groupS1Id), WEBSPECS: String(code), NAME: name, ISVIEW: yn(c.isView), ISACTIVE: "1", isFilter: yn(c.isFilter) };
    specs.push(row);
    target = { table: "CCCWEBSPECS", match: (r) => r.WEBSPECS === String(code), expect: row };
  } else if (c.kind === "set-spec") {
    const row = specs.find((r) => r.WEBSPECS === String(c.code));
    if (!row) throw new Error("Το χαρακτηριστικό δεν βρέθηκε στο SoftOne.");
    if (c.patch.name != null) { const n = tidy(c.patch.name); if (!n) throw new Error("Το όνομα δεν μπορεί να είναι κενό."); row.NAME = n; }
    if (c.patch.isFilter != null) row.isFilter = yn(c.patch.isFilter);
    if (c.patch.isView != null) row.ISVIEW = yn(c.patch.isView);
    if (c.patch.active != null) row.ISACTIVE = yn(c.patch.active);
    target = { table: "CCCWEBSPECS", match: (r) => r.WEBSPECS === String(c.code), expect: { ...row } };
  } else if (c.kind === "add-option") {
    const name = tidy(c.name);
    if (!name) throw new Error("Γράψε την τιμή.");
    if (!specs.some((r) => r.WEBSPECS === String(c.code))) throw new Error("Το χαρακτηριστικό δεν βρέθηκε στο SoftOne.");
    const mine = lns.filter((r) => r.WEBSPECS === String(c.code));
    if (mine.some((r) => tidy(r.NAME ?? "").toLocaleLowerCase("el") === name.toLocaleLowerCase("el"))) throw new Error(`Υπάρχει ήδη η τιμή «${name}».`);
    const opt = Math.max(0, ...mine.map((r) => Number(r.WEBSPECSLNS) || 0)) + 1;
    const row = { COMPANY: company, CCCWEBGRSPECS: String(groupS1Id), WEBSPECS: String(c.code), WEBSPECSLNS: String(opt), NAME: name, ISACTIVE: "1" };
    lns.push(row);
    target = { table: "CCCWEBSPECSLNS", match: (r) => r.WEBSPECS === String(c.code) && r.WEBSPECSLNS === String(opt), expect: row };
  } else {
    const row = lns.find((r) => r.WEBSPECS === String(c.code) && r.WEBSPECSLNS === String(c.option));
    if (!row) throw new Error("Η τιμή δεν βρέθηκε στο SoftOne.");
    if (c.patch.name != null) { const n = tidy(c.patch.name); if (!n) throw new Error("Η τιμή δεν μπορεί να είναι κενή."); row.NAME = n; }
    if (c.patch.active != null) row.ISACTIVE = yn(c.patch.active);
    target = { table: "CCCWEBSPECSLNS", match: (r) => r.WEBSPECS === String(c.code) && r.WEBSPECSLNS === String(c.option), expect: { ...row } };
  }
  const data: Group = { CCCWEBGRSPECS: g.CCCWEBGRSPECS.map(clean), CCCWEBSPECS: specs, ...(lns.length ? { CCCWEBSPECSLNS: lns } : {}) };
  return { data, target };
}

export type SpecWriteResult = { ok: true; code?: number; option?: number } | { ok: false; error: string; details?: string[] };

/** Μία αλλαγή στο SoftOne με επαλήθευση, και ενημέρωση του καθρέφτη (S1SpecDef / S1SpecOption) της ομάδας. */
export async function changeSpecGroup(groupS1Id: number, c: SpecChange): Promise<SpecWriteResult> {
  if (!(await specWriteEnabled())) return { ok: false, error: "Οι αλλαγές χαρακτηριστικών προς SoftOne είναι κλειστές (Ρυθμίσεις → SoftOne)." };
  try {
    const before = await readGroup(groupS1Id);
    const { data, target } = apply(before, groupS1Id, c);
    const w = await s1("setData", { OBJECT, KEY: groupS1Id, data });
    if (!w?.success) return { ok: false, error: `SoftOne: ${w?.error ?? "η αποθήκευση απέτυχε"}` };
    // επαλήθευση: η αλλαγή υπάρχει, οι υπόλοιπες γραμμές ίδιες, καμία δεν χάθηκε
    const after = await readGroup(groupS1Id);
    const issues: string[] = [];
    const got = (after[target.table] ?? []).find(target.match);
    if (!got) issues.push("Η αλλαγή δεν βρέθηκε στη νέα ανάγνωση.");
    else for (const [k, v] of Object.entries(target.expect)) if (clean(got)[k] !== v) issues.push(`${k}: γράφτηκε «${clean(got)[k]}» αντί για «${v}».`);
    if (sig(after.CCCWEBGRSPECS[0]) !== sig(before.CCCWEBGRSPECS[0])) issues.push("Άλλαξε η κεφαλίδα της ομάδας.");
    for (const t of ["CCCWEBSPECS", "CCCWEBSPECSLNS"] as const) {
      const now = new Set((after[t] ?? []).map(sig));
      const lost = (before[t] ?? []).filter((r) => !target.match(clean(r)) && !now.has(sig(r)));
      if (lost.length) issues.push(`${lost.length} γραμμές ${t === "CCCWEBSPECS" ? "χαρακτηριστικών" : "τιμών"} άλλαξαν ή χάθηκαν.`);
    }
    await mirrorGroup(groupS1Id, after);
    if (issues.length) return { ok: false, error: "Η αποθήκευση στο SoftOne δεν επαληθεύτηκε πλήρως.", details: issues };
    return { ok: true, code: target.expect.WEBSPECS ? Number(target.expect.WEBSPECS) : undefined, option: target.expect.WEBSPECSLNS ? Number(target.expect.WEBSPECSLNS) : undefined };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Ο καθρέφτης της ομάδας από ό,τι μόλις διαβάστηκε (ίδια λογική με τον συγχρονισμό: δεν σβήνει, σημαδεύει missing). */
async function mirrorGroup(groupS1Id: number, g: Group) {
  const yes = (v: string) => v === "1";
  const seen = new Set<number>();
  for (const r of g.CCCWEBSPECS) {
    const code = Number(r.WEBSPECS); seen.add(code);
    const data = { name: r.NAME, isView: yes(r.ISVIEW), isFilter: yes(r.isFilter), active: yes(r.ISACTIVE), missing: false };
    await db.s1SpecDef.upsert({ where: { groupS1Id_code: { groupS1Id, code } }, create: { groupS1Id, code, ...data }, update: data });
  }
  await db.s1SpecDef.updateMany({ where: { groupS1Id, code: { notIn: [...seen] } }, data: { missing: true } });
  for (const r of g.CCCWEBSPECSLNS ?? []) {
    const spec = await db.s1SpecDef.findUnique({ where: { groupS1Id_code: { groupS1Id, code: Number(r.WEBSPECS) } }, select: { id: true } });
    if (!spec) continue;
    const data = { name: r.NAME ?? "", color: r.SOCOLOR || null, active: yes(r.ISACTIVE), missing: false };
    await db.s1SpecOption.upsert({ where: { specId_code: { specId: spec.id, code: Number(r.WEBSPECSLNS) } }, create: { specId: spec.id, code: Number(r.WEBSPECSLNS), ...data }, update: data });
  }
}
