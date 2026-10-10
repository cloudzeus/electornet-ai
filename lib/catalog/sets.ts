import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Τα «Set ειδών» του SoftOne όπως τα βλέπει η διαχείριση και το site: κύριο προϊόν, μέλη, απόθεμα (= πόσα πλήρη sets
 * βγαίνουν από τα μέλη) και προβλήματα. Πηγή: ο καθρέφτης S1Set / S1SetLine (lib/softone/sets.ts).
 */
export interface SetMember { lineNum: number; mtrl: number; code: string | null; name: string; label: string | null; qty: number; stock: number; isMain: boolean; productId: string | null; productActive: boolean }
export interface SetRow {
  spcs: number; code: string; name: string; active: boolean; finalDate: Date | null; syncedAt: Date;
  main: { mtrl: number; productId: string | null; title: string | null; slug: string | null; active: boolean; image: string | null; price: number | null };
  members: SetMember[]; available: number; problems: SetProblem[];
}
export type SetProblem = "no-product" | "inactive" | "member-out" | "expired";
export const PROBLEM_LABEL: Record<SetProblem, string> = { "no-product": "Το κύριο είδος δεν είναι στο site", inactive: "Ανενεργό στο site", "member-out": "Μέλος χωρίς απόθεμα", expired: "Έληξε στο SoftOne" };

export const listSets = () => buildRows({});

async function buildRows(where: Prisma.S1SetWhereInput): Promise<SetRow[]> {
  const sets = await db.s1Set.findMany({ where, orderBy: { name: "asc" }, include: { lines: { orderBy: { lineNum: "asc" } } } });
  const mtrls = [...new Set(sets.flatMap((s) => [s.mtrl, ...s.lines.map((l) => l.mtrl)]).map(String))];
  const prods = await db.product.findMany({ where: { erpCode: { in: mtrls } }, select: { id: true, erpCode: true, title: true, slug: true, active: true, price: true, media: { where: { kind: "image", hidden: false }, orderBy: { sortNo: "asc" }, take: 1, select: { thumbUrl: true, url: true } } } });
  const pm = new Map(prods.map((p) => [p.erpCode, p]));
  const now = Date.now();
  return sets.map((s) => {
    const mp = pm.get(String(s.mtrl));
    const members: SetMember[] = s.lines.map((l) => { const p = pm.get(String(l.mtrl)); return { lineNum: l.lineNum, mtrl: l.mtrl, code: l.code, name: l.name, label: l.label, qty: l.qty, stock: l.stockCentral, isMain: l.mtrl === s.mtrl, productId: p?.id ?? null, productActive: !!p?.active }; });
    const available = members.length ? Math.max(0, Math.min(...members.map((m) => Math.floor(m.stock / (m.qty || 1))))) : 0;
    const expired = !!s.finalDate && s.finalDate.getTime() < now;
    const problems: SetProblem[] = [
      ...(!mp ? ["no-product" as const] : !mp.active ? ["inactive" as const] : []),
      ...(members.some((m) => m.stock < (m.qty || 1)) ? ["member-out" as const] : []),
      ...(expired ? ["expired" as const] : []),
    ];
    return { spcs: s.spcs, code: s.code, name: s.name, active: s.active, finalDate: s.finalDate, syncedAt: s.syncedAt,
      main: { mtrl: s.mtrl, productId: mp?.id ?? null, title: mp?.title ?? null, slug: mp?.slug ?? null, active: !!mp?.active, image: mp?.media[0]?.thumbUrl ?? mp?.media[0]?.url ?? null, price: mp?.price ?? null },
      members, available, problems };
  });
}

/** Το set ενός προϊόντος του site (κύριο είδος = erpCode), για τον χώρο εργασίας. */
export async function setForProduct(erpCode: string | null): Promise<SetRow | null> {
  const m = Number(erpCode);
  if (!Number.isInteger(m)) return null;
  return (await buildRows({ mtrl: m, active: true }).catch(() => []))[0] ?? null;
}

/** «Περιλαμβάνει» για τη σελίδα του προϊόντος: όλα τα μέλη (και το κύριο), με την ετικέτα της διαχείρισης ή το όνομα του ERP. */
export async function setPartsForSite(productId: string): Promise<{ name: string; qty: number }[] | null> {
  const erpCode = (await db.product.findUnique({ where: { id: productId }, select: { erpCode: true } }).catch(() => null))?.erpCode;
  const m = Number(erpCode);
  if (!Number.isInteger(m)) return null;
  const s = await db.s1Set.findFirst({ where: { mtrl: m, active: true, OR: [{ finalDate: null }, { finalDate: { gte: new Date() } }] }, select: { lines: { orderBy: { lineNum: "asc" }, select: { name: true, label: true, qty: true, mtrl: true } } } }).catch(() => null);
  if (!s || s.lines.length < 2) return null;
  return s.lines.map((l) => ({ name: l.label?.trim() || l.name, qty: l.qty }));
}
