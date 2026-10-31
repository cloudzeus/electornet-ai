import "server-only";
import { db } from "@/lib/db";
import { s1 } from "@/lib/softone";
import { getSetting } from "@/lib/settings/store";

/**
 * Στοιχεία επικοινωνίας καταστήματος → υποκατάστημα μέλους στο SoftOne (EditMaster CUSBRANCH, KEY = TRDBRANCH).
 * Ανάγνωση → εγγραφή μόνο των πεδίων που άλλαξαν → νέα ανάγνωση: επαλήθευση ότι γράφτηκαν ΚΑΙ ότι κανένα άλλο πεδίο
 * δεν πειράχτηκε. Αν κάτι άλλο άλλαξε, ξαναστέλνει την αρχική εικόνα και το αναφέρει.
 * Πίσω από τον διακόπτη `softone.branchesWrite` (Ρυθμίσεις → SoftOne), κλειστό από προεπιλογή.
 */
export const BRANCH_WRITE_OFF = "Η εγγραφή στο SoftOne είναι κλειστή (Ρυθμίσεις → SoftOne → «Στοιχεία επικοινωνίας καταστημάτων προς SoftOne»).";

export async function branchesWriteEnabled() {
  const s = await getSetting("softone").catch(() => null);
  return String(((s?.data ?? {}) as Record<string, unknown>).branchesWrite ?? "off") === "on";
}

export type BranchContact = { phone: string; mobile: string; email: string };
export type BranchWriteOutcome = { ok: true; written: string[]; branch: number } | { ok: false; skipped?: true; error: string; details?: string[] };

const FIELD = { phone: "PHONE1", mobile: "PHONE2", email: "EMAIL" } as const;
const MAX = { PHONE1: 20, PHONE2: 20, EMAIL: 128 } as const;
const norm = (k: string, v: unknown) => { const s = String(v ?? "").trim(); return k === "EMAIL" ? s.toLowerCase() : s; };
/** πεδία που φέρνει το getData αλλά δεν είναι του υποκαταστήματος (joins) */
const comparable = (k: string) => !k.includes("_");

async function readBranch(id: number) {
  const r = await s1("getData", { object: "CUSBRANCH", key: id });
  if (!r?.success) throw new Error(`Το SoftOne δεν έδωσε το υποκατάστημα ${id}: ${r?.error ?? "χωρίς απάντηση"}`);
  const row = r.data?.CUSBRANCH?.[0] as Record<string, unknown> | undefined;
  if (!row) throw new Error(`Το υποκατάστημα ${id} δεν βρέθηκε στο SoftOne.`);
  return row;
}

export async function pushBranchContact(storeId: string, next: BranchContact, opts: { force?: boolean } = {}): Promise<BranchWriteOutcome> {
  if (!opts.force && !(await branchesWriteEnabled())) return { ok: false, skipped: true, error: BRANCH_WRITE_OFF };
  const b = await db.partnerBranch.findUnique({ where: { storeId }, select: { id: true, s1BranchId: true } });
  if (!b?.s1BranchId) return { ok: false, skipped: true, error: "Το κατάστημα δεν είναι συνδεδεμένο με υποκατάστημα του SoftOne." };
  try {
    const before = await readBranch(b.s1BranchId);
    const row: Record<string, string> = {};
    for (const [k, f] of Object.entries(FIELD) as [keyof BranchContact, keyof typeof MAX][]) {
      const v = norm(f, next[k]);
      if (v.length > MAX[f]) return { ok: false, error: `Το ${f} χωράει έως ${MAX[f]} χαρακτήρες στο SoftOne.` };
      if (v !== norm(f, before[f])) row[f] = v;
    }
    if (!Object.keys(row).length) return { ok: true, written: [], branch: b.s1BranchId };
    const w = await s1("setData", { OBJECT: "CUSBRANCH", KEY: b.s1BranchId, data: { CUSBRANCH: [row] } }).catch((e: Error) => ({ success: false, error: e.message }));
    if (!w?.success) return { ok: false, error: `Το SoftOne αρνήθηκε την αποθήκευση: ${w?.error ?? "χωρίς απάντηση"}` };
    const after = await readBranch(b.s1BranchId);
    const notWritten = Object.entries(row).filter(([k, v]) => norm(k, after[k]) !== v).map(([k, v]) => `${k}: γράφτηκε «${after[k] ?? ""}» αντί για «${v}».`);
    const collateral = Object.keys(before).filter((k) => comparable(k) && !(k in row) && String(before[k] ?? "") !== String(after[k] ?? ""));
    if (collateral.length) {
      const restore = Object.fromEntries(collateral.map((k) => [k, before[k] ?? ""]));
      await s1("setData", { OBJECT: "CUSBRANCH", KEY: b.s1BranchId, data: { CUSBRANCH: [restore] } }).catch(() => null);
      return { ok: false, error: "Το SoftOne άλλαξε και άλλα πεδία του υποκαταστήματος· ξαναστάλθηκαν οι αρχικές τιμές.", details: collateral.map((k) => `${k}: «${before[k] ?? ""}» → «${after[k] ?? ""}»`) };
    }
    if (notWritten.length) return { ok: false, error: "Το SoftOne απάντησε «επιτυχία», αλλά η αλλαγή δεν επαληθεύτηκε.", details: notWritten };
    await db.partnerBranch.update({ where: { id: b.id }, data: { phone: norm("PHONE1", after.PHONE1) || null, phone2: norm("PHONE2", after.PHONE2) || null, email: norm("EMAIL", after.EMAIL) || null, s1SyncedAt: new Date() } });
    return { ok: true, written: Object.keys(row), branch: b.s1BranchId };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
