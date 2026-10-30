import "server-only";
import { db } from "@/lib/db";
import { s1 } from "@/lib/softone";
import { getSetting } from "@/lib/settings/store";
import { getTable } from "@/lib/softone/lookups";
import { readGroup, type Group } from "@/lib/softone/spec-write";
import { applyL2, clean, l2Key, NAME_MAX, nextCode, sig, verifyList, type L2Change, type Row } from "./category-core";

/**
 * Εγγραφές στο δέντρο κατηγοριών web του SoftOne. Κάθε αλλαγή: ανάγνωση → εγγραφή → νέα ανάγνωση και επαλήθευση.
 * Αφαίρεση = ανενεργό, ποτέ διαγραφή (πάνω στους κωδικούς κρέμονται είδη, φίλτρα και σύνδεσμοι).
 * Όλα πίσω από τον διακόπτη `softone.categoriesWrite` (Ρυθμίσεις → SoftOne), κλειστό από προεπιλογή.
 *
 * ΠΡΟΣΟΧΗ: το `$CCCWEBCATEGORY2` είναι EditList: το getData φέρνει ΟΛΗ τη λίστα (όλους τους γονείς) και το setData
 * την αντικαθιστά ολόκληρη — γι' αυτό στέλνουμε πάντα όλες τις γραμμές. Η πρώτη πραγματική εγγραφή θέλει δοκιμή με έγκριση.
 */
export const WRITE_OFF = "Η εγγραφή κατηγοριών στο SoftOne είναι κλειστή (Ρυθμίσεις → SoftOne → «Αλλαγές κατηγοριών προς SoftOne»). Δεν άλλαξε τίποτα.";

export async function categoriesWriteEnabled() {
  const s = await getSetting("softone").catch(() => null);
  return String(((s?.data ?? {}) as Record<string, unknown>).categoriesWrite ?? "off") === "on";
}

export type WriteOutcome = { ok: true; message: string; key?: string } | { ok: false; error: string; details?: string[] };
const fail = (error: string, details?: string[]): WriteOutcome => ({ ok: false, error, ...(details?.length ? { details } : {}) });
const s1Err = (r: { error?: string } | null | undefined, what: string) => `Το SoftOne αρνήθηκε ${what}: ${r?.error ?? "χωρίς απάντηση"}`;
const checkName = (s: string) => { const v = s.trim(); if (!v) throw new Error("Το όνομα δεν μπορεί να είναι κενό."); if (v.length > NAME_MAX) throw new Error(`Το όνομα έχει έως ${NAME_MAX} χαρακτήρες.`); return v; };

// ---------- Επίπεδο 1: CCCWEBCATEGORY1 (EditMaster, μερική ενημέρωση) ----------

async function readL1(): Promise<Row[]> {
  const rows = await getTable("CCCWEBCATEGORY1", ["CCCWEBCATEGORY1", "NAME", "ISACTIVE"]);
  return rows.map(([c, n, a]) => ({ CCCWEBCATEGORY1: String(+c), NAME: n.trim(), ISACTIVE: String(+a) }));
}

export async function saveL1(input: { c1?: number; name?: string; active?: boolean }): Promise<WriteOutcome> {
  if (!(await categoriesWriteEnabled())) return fail(WRITE_OFF);
  try {
    const before = await readL1();
    const isNew = !input.c1;
    const c1 = input.c1 ?? nextCode(before.map((r) => +r.CCCWEBCATEGORY1));
    if (!isNew && !before.some((r) => +r.CCCWEBCATEGORY1 === c1)) return fail("Η κατηγορία δεν βρέθηκε στο SoftOne.");
    const row: Row = isNew ? { CCCWEBCATEGORY1: String(c1), NAME: checkName(input.name ?? ""), ISACTIVE: "1" } : {};
    if (!isNew && input.name !== undefined) row.NAME = checkName(input.name);
    if (!isNew && input.active !== undefined) row.ISACTIVE = input.active ? "1" : "0";
    const w = await s1("setData", { OBJECT: "CCCWEBCATEGORY1", ...(isNew ? {} : { KEY: c1 }), data: { CCCWEBCATEGORY1: [row] } }).catch((e: Error) => ({ success: false, error: e.message }));
    if (!w?.success) return fail(s1Err(w, "την αποθήκευση"));
    const after = (await readL1()).find((r) => +r.CCCWEBCATEGORY1 === c1);
    const issues = !after ? ["Η κατηγορία δεν βρέθηκε στη νέα ανάγνωση."] : Object.entries(row).filter(([k, v]) => k !== "CCCWEBCATEGORY1" && after[k] !== v).map(([k, v]) => `${k}: γράφτηκε «${after[k]}» αντί για «${v}».`);
    if (issues.length) return fail("Το SoftOne απάντησε «επιτυχία», αλλά η αλλαγή δεν επαληθεύτηκε.", issues);
    await db.s1WebCategory.upsert({ where: { key: `1:${c1}` }, create: { key: `1:${c1}`, level: 1, s1Id: c1, name: after!.NAME, active: after!.ISACTIVE === "1" }, update: { name: after!.NAME, active: after!.ISACTIVE === "1", missing: false, syncedAt: new Date() } });
    return { ok: true, key: `1:${c1}`, message: isNew ? `Η κεντρική κατηγορία «${after!.NAME}» δημιουργήθηκε στο SoftOne (κωδικός ${c1}).` : `Η κατηγορία «${after!.NAME}» ενημερώθηκε στο SoftOne.` };
  } catch (e) {
    return fail((e as Error).message);
  }
}

// ---------- Επίπεδο 2: $CCCWEBCATEGORY2 (EditList — όλη η λίστα κάθε φορά) ----------

async function readL2(): Promise<Row[]> {
  const r = await s1("getData", { OBJECT: "$CCCWEBCATEGORY2", KEY: 1 });
  if (!r?.success) throw new Error(s1Err(r, "την ανάγνωση των κατηγοριών"));
  if (r.readOnly) throw new Error("Ο λογαριασμός web έχει μόνο ανάγνωση στις κατηγορίες.");
  const rows = (r.data?.CCCWEBCATEGORY2 ?? []) as Row[];
  if (!rows.length) throw new Error("Το SoftOne επέστρεψε κενή λίστα κατηγοριών — δεν γράφουμε τίποτα.");
  return rows;
}

export async function changeL2(c: L2Change): Promise<WriteOutcome & { target?: Row }> {
  if (!(await categoriesWriteEnabled())) return fail(WRITE_OFF);
  try {
    const before = await readL2();
    const { rows, target } = applyL2(before, c);
    const w = await s1("setData", { OBJECT: "$CCCWEBCATEGORY2", KEY: 1, data: { CCCWEBCATEGORY2: rows } }).catch((e: Error) => ({ success: false, error: e.message }));
    if (!w?.success) return fail(s1Err(w, "την αποθήκευση"));
    const after = await readL2();
    const issues = verifyList(rows, target, after, l2Key);
    if (issues.length) return fail("Το SoftOne απάντησε «επιτυχία», αλλά η λίστα κατηγοριών δεν επαληθεύτηκε. Έλεγξε τις κατηγορίες στο SoftOne.", issues);
    const c1 = +target.CCCWEBCATEGORY1, c2 = +target.CCCWEBCATEGORY2, key = `2:${c1}:${c2}`;
    await db.s1WebCategory.upsert({ where: { key }, create: { key, level: 2, s1Id: c2, parentS1Id: c1, name: target.NAME, active: target.ISACTIVE === "1" }, update: { name: target.NAME, active: target.ISACTIVE === "1", missing: false, syncedAt: new Date() } });
    const message = c.kind === "add" ? `Η κατηγορία «${target.NAME}» δημιουργήθηκε στο SoftOne (κωδικός ${c2}).` : c.kind === "copy" ? `Η κατηγορία «${target.NAME}» μπήκε στον νέο γονέα (κωδικός ${c2}).` : `Η κατηγορία «${target.NAME}» ενημερώθηκε στο SoftOne.`;
    return { ok: true, key, message, target };
  } catch (e) {
    return fail((e as Error).message);
  }
}

// ---------- Επίπεδο 3: CCCWEBGRSPECS (κεφαλίδα ομάδας· στέλνουμε όλη την ομάδα, όπως στα χαρακτηριστικά) ----------

export async function changeGroupHead(g: number, patch: { name?: string; active?: boolean; c1?: number; c2?: number }): Promise<WriteOutcome> {
  if (!(await categoriesWriteEnabled())) return fail(WRITE_OFF);
  try {
    const before = await readGroup(g);
    const head = clean(before.CCCWEBGRSPECS[0]);
    if (patch.name !== undefined) head.NAME = checkName(patch.name);
    if (patch.active !== undefined) head.ISACTIVE = patch.active ? "1" : "0";
    if (patch.c1 !== undefined) head.CCCWEBCATEGORY1 = String(patch.c1);
    if (patch.c2 !== undefined) head.CCCWEBCATEGORY2 = String(patch.c2);
    const data: Group = { CCCWEBGRSPECS: [head], CCCWEBSPECS: before.CCCWEBSPECS.map(clean), ...(before.CCCWEBSPECSLNS?.length ? { CCCWEBSPECSLNS: before.CCCWEBSPECSLNS.map(clean) } : {}) };
    const w = await s1("setData", { OBJECT: "CCCWEBGRSPECS", KEY: g, data }).catch((e: Error) => ({ success: false, error: e.message }));
    if (!w?.success) return fail(s1Err(w, "την αποθήκευση"));
    const after = await readGroup(g);
    const got = clean(after.CCCWEBGRSPECS[0]);
    const issues = Object.entries(head).filter(([k, v]) => got[k] !== v).map(([k, v]) => `${k}: γράφτηκε «${got[k]}» αντί για «${v}».`);
    for (const t of ["CCCWEBSPECS", "CCCWEBSPECSLNS"] as const) {
      const now = new Set((after[t] ?? []).map(sig));
      const lost = (before[t] ?? []).filter((r) => !now.has(sig(r)));
      if (lost.length) issues.push(`${lost.length} γραμμές ${t === "CCCWEBSPECS" ? "χαρακτηριστικών" : "τιμών"} άλλαξαν ή χάθηκαν.`);
    }
    if (issues.length) return fail("Το SoftOne απάντησε «επιτυχία», αλλά ο τύπος προϊόντος δεν επαληθεύτηκε.", issues);
    await db.s1SpecGroup.update({ where: { s1Id: g }, data: { name: got.NAME, active: got.ISACTIVE === "1", cat1: +got.CCCWEBCATEGORY1 || null, cat2: +got.CCCWEBCATEGORY2 || null, missing: false, syncedAt: new Date() } });
    return { ok: true, key: `g:${g}`, message: `Ο τύπος προϊόντος «${got.NAME}» ενημερώθηκε στο SoftOne.` };
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function createGroup(input: { c1: number; c2: number; name: string }): Promise<WriteOutcome> {
  if (!(await categoriesWriteEnabled())) return fail(WRITE_OFF);
  try {
    const name = checkName(input.name);
    // WEBGRSPECS = «01», «02»… μέσα στην ίδια κατηγορία
    const siblings = await getTable("CCCWEBGRSPECS", ["CCCWEBGRSPECS", "WEBGRSPECS"], `CCCWEBCATEGORY1=${input.c1} AND CCCWEBCATEGORY2=${input.c2}`);
    const code = String(Math.max(0, ...siblings.map((r) => parseInt(r[1], 10)).filter(Number.isFinite)) + 1).padStart(2, "0");
    const head = { WEBGRSPECS: code, CCCWEBCATEGORY1: String(input.c1), CCCWEBCATEGORY2: String(input.c2), NAME: name, ISACTIVE: "1" };
    const w = await s1("setData", { OBJECT: "CCCWEBGRSPECS", data: { CCCWEBGRSPECS: [head] } }).catch((e: Error) => ({ success: false, error: e.message }));
    if (!w?.success) return fail(s1Err(w, "τη δημιουργία"));
    const id = Number(w.id);
    if (!id) return fail("Το SoftOne δεν επέστρεψε κωδικό για τον νέο τύπο προϊόντος — έλεγξε στο SoftOne αν δημιουργήθηκε.");
    const got = clean((await readGroup(id)).CCCWEBGRSPECS[0]);
    if (got.NAME !== name || +got.CCCWEBCATEGORY2 !== input.c2) return fail("Ο νέος τύπος προϊόντος δημιουργήθηκε, αλλά δεν επαληθεύτηκε.", [`NAME: «${got.NAME}»`, `CCCWEBCATEGORY2: «${got.CCCWEBCATEGORY2}»`]);
    await db.s1SpecGroup.upsert({ where: { s1Id: id }, create: { s1Id: id, code, name, cat1: input.c1, cat2: input.c2 }, update: { code, name, cat1: input.c1, cat2: input.c2, active: true, missing: false } });
    return { ok: true, key: `g:${id}`, message: `Ο τύπος προϊόντος «${name}» δημιουργήθηκε στο SoftOne (id ${id}).` };
  } catch (e) {
    return fail((e as Error).message);
  }
}

// ---------- Είδη: CCCWEBCATEGORY1/2 ----------

/** Αλλάζει την κατηγορία web ενός είδους. `skipped` = ήταν ήδη εκεί (π.χ. επανάληψη μετά από διακοπή). */
export async function setItemWebCats(mtrl: number, c1: number, c2: number): Promise<{ ok: true; skipped: boolean } | { ok: false; error: string }> {
  const read = async () => (await getTable("MTRL", ["MTRL", "CCCWEBCATEGORY1", "CCCWEBCATEGORY2"], `MTRL=${mtrl}`)).find((r) => +r[0] === mtrl);
  const now = await read();
  if (!now) return { ok: false, error: "Το είδος δεν βρέθηκε στο SoftOne." };
  if (+now[1] === c1 && +now[2] === c2) return { ok: true, skipped: true };
  const w = await s1("setData", { OBJECT: "ITEM", KEY: String(mtrl), data: { ITEM: [{ CCCWEBCATEGORY1: c1, CCCWEBCATEGORY2: c2 }] } }).catch((e: Error) => ({ success: false, error: e.message }));
  if (!w?.success) return { ok: false, error: s1Err(w, "την εγγραφή") };
  const after = await read();
  if (!after || +after[1] !== c1 || +after[2] !== c2) return { ok: false, error: `Δεν επαληθεύτηκε (διαβάστηκε ${after?.[1] ?? "—"}/${after?.[2] ?? "—"}).` };
  await db.s1Item.update({ where: { mtrl }, data: { webCat1: c1, webCat2: c2 } }).catch(() => {});
  return { ok: true, skipped: false };
}
