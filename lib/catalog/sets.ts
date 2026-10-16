import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { suggestSetLabel } from "./set-labels";
import { setKind, validSet } from "./set-core";
import { swr } from "@/lib/cache/swr";

/**
 * Τα «Set ειδών» του SoftOne όπως τα βλέπει η διαχείριση και το site: κύριο προϊόν, μέλη, απόθεμα (= πόσα πλήρη sets
 * βγαίνουν από τα μέλη) και προβλήματα. Πηγή: ο καθρέφτης S1Set / S1SetLine (lib/softone/sets.ts).
 */
export interface SetMember { lineNum: number; mtrl: number; code: string | null; name: string; label: string | null; /** αυτόματη πρόταση (κλιματιστικά: εσωτερική / εξωτερική μονάδα) */ suggested: string | null; qty: number; stock: number; isMain: boolean; productId: string | null; productActive: boolean; /** τιμή web του είδους στο site (με ΦΠΑ) */ price: number | null }
/** parts = εξαρτήματα (π.χ. εξωτερική μονάδα, δεν πωλείται χωριστά) · gift = με δώρο (κανονικό προϊόν ή «+ ΔΩΡΟ» στο όνομα) */
export type SetKind = "parts" | "gift";
export interface SetRow {
  spcs: number; kind: SetKind; code: string; name: string; active: boolean; finalDate: Date | null; syncedAt: Date;
  main: { mtrl: number; productId: string | null; title: string | null; slug: string | null; active: boolean; image: string | null; price: number | null };
  members: SetMember[]; available: number; problems: SetProblem[];
}
export type SetProblem = "no-product" | "inactive" | "member-out" | "gift-out" | "expired";
export const PROBLEM_LABEL: Record<SetProblem, string> = { "no-product": "Το κύριο είδος δεν είναι στο site", inactive: "Ανενεργό στο site", "member-out": "Μέλος χωρίς απόθεμα", "gift-out": "Το δώρο δεν έχει απόθεμα", expired: "Έληξε στο SoftOne" };

export const listSets = () => buildRows({});

async function buildRows(where: Prisma.S1SetWhereInput): Promise<SetRow[]> {
  const sets = await db.s1Set.findMany({ where, orderBy: { name: "asc" }, include: { lines: { orderBy: { lineNum: "asc" } } } });
  const mtrls = [...new Set(sets.flatMap((s) => [s.mtrl, ...s.lines.map((l) => l.mtrl)]).map(String))];
  const prods = await db.product.findMany({ where: { erpCode: { in: mtrls } }, select: { id: true, erpCode: true, title: true, slug: true, active: true, price: true, media: { where: { kind: "image", hidden: false }, orderBy: { sortNo: "asc" }, take: 1, select: { thumbUrl: true, url: true } } } });
  const pm = new Map(prods.map((p) => [p.erpCode, p]));
  const now = Date.now();
  return sets.map((s) => {
    const mp = pm.get(String(s.mtrl));
    const members: SetMember[] = s.lines.map((l) => { const p = pm.get(String(l.mtrl)); return { lineNum: l.lineNum, mtrl: l.mtrl, code: l.code, name: l.name, label: l.label, suggested: suggestSetLabel(l.name, s.name, { isMain: l.mtrl === s.mtrl, members: s.lines.length }), qty: l.qty, stock: l.stockCentral, isMain: l.mtrl === s.mtrl, productId: p?.id ?? null, productActive: !!p?.active, price: p?.price ?? null }; });
    const kind: SetKind = setKind(s.name, members, s.mtrl, (m) => members.some((x) => x.mtrl === m && x.productActive));
    const avail = (ms: SetMember[]) => (ms.length ? Math.max(0, Math.min(...ms.map((m) => Math.floor(m.stock / (m.qty || 1))))) : 0);
    // με δώρο: το κύριο προϊόν πουλιέται και μόνο του — διαθεσιμότητα από το κύριο είδος
    const available = kind === "parts" ? avail(members) : avail(members.filter((m) => m.isMain));
    const expired = !!s.finalDate && s.finalDate.getTime() < now;
    const out = members.some((m) => !m.isMain && m.stock < (m.qty || 1));
    const problems: SetProblem[] = [
      ...(!mp ? ["no-product" as const] : !mp.active ? ["inactive" as const] : []),
      ...(kind === "parts" && (out || members.some((m) => m.isMain && m.stock < (m.qty || 1))) ? ["member-out" as const] : kind === "gift" && out ? ["gift-out" as const] : []),
      ...(expired ? ["expired" as const] : []),
    ];
    return { spcs: s.spcs, kind, code: s.code, name: s.name, active: s.active, finalDate: s.finalDate, syncedAt: s.syncedAt,
      main: { mtrl: s.mtrl, productId: mp?.id ?? null, title: mp?.title ?? null, slug: mp?.slug ?? null, active: !!mp?.active, image: mp?.media[0]?.thumbUrl ?? mp?.media[0]?.url ?? null, price: mp?.price ?? null },
      members, available, problems };
  });
}

/** Τα σετ ενός είδους ως κύριο (erpCode = MTRL), για τον χώρο εργασίας: πρώτα τα ενεργά. */
export async function setsForMain(erpCode: string | null): Promise<SetRow[]> {
  const m = Number(erpCode);
  if (!Number.isInteger(m)) return [];
  return (await buildRows({ mtrl: m }).catch(() => [])).sort((a, b) => Number(b.active) - Number(a.active));
}
/** Το σετ ενός προϊόντος-σετ (Product.setSpcs). */
export async function setOfSetProduct(spcs: number | null): Promise<SetRow | null> {
  return spcs == null ? null : (await buildRows({ spcs }).catch(() => []))[0] ?? null;
}

export interface SetIndex {
  /** ανά σετ: είδος, πλήθος (διαφορετικών) μελών, αν το κύριο είδος είναι ενεργό στο site */
  bySpcs: Map<number, { kind: SetKind; members: number; mainOnSite: boolean }>;
  /** MTRL (ως erpCode) των κύριων ειδών σε ενεργό σετ εξαρτημάτων — αυτά με «Αυτόματα» δεν πωλούνται μόνα τους */
  mainOfParts: Set<string>;
  /** MTRL (ως erpCode) → πόσα σετ έχουν αυτό το είδος ως κύριο */
  mainSets: Map<string, number>;
}
/**
 * Συνοπτική εικόνα όλων των σετ για τα φίλτρα και τις ετικέτες του καταλόγου και τη μαζική αλλαγή «Πωλείται και μόνο
 * του». Ο ίδιος κανόνας με την προβολή (lib/softone/sets.ts projectSetProducts). 1′ στη μνήμη.
 */
const indexCache = swr(async (): Promise<SetIndex> => {
  const sets = await db.s1Set.findMany({ select: { spcs: true, mtrl: true, name: true, active: true, finalDate: true, lines: { select: { mtrl: true } } } });
  const mtrls = [...new Set(sets.flatMap((s) => [s.mtrl, ...s.lines.map((l) => l.mtrl)]))].map(String);
  const live = new Set((mtrls.length ? await db.product.findMany({ where: { erpCode: { in: mtrls }, active: true }, select: { erpCode: true } }) : []).map((p) => Number(p.erpCode)));
  const now = new Date();
  const ix: SetIndex = { bySpcs: new Map(), mainOfParts: new Set(), mainSets: new Map() };
  for (const s of sets) {
    const kind = setKind(s.name, s.lines, s.mtrl, (m) => live.has(m));
    const mainOnSite = live.has(s.mtrl);
    ix.bySpcs.set(s.spcs, { kind, members: new Set(s.lines.map((l) => l.mtrl)).size, mainOnSite });
    ix.mainSets.set(String(s.mtrl), (ix.mainSets.get(String(s.mtrl)) ?? 0) + 1);
    if (s.active && (!s.finalDate || s.finalDate >= now) && mainOnSite && kind === "parts" && validSet(s.lines, s.mtrl)) ix.mainOfParts.add(String(s.mtrl));
  }
  return ix;
}, 60_000, { maxStaleMs: 10 * 60_000 });
export const setIndex = () => indexCache();

/**
 * «Περιλαμβάνει» για τη σελίδα ενός προϊόντος-σετ: όλα τα μέλη (και το κύριο), με την ετικέτα της διαχείρισης ή την
 * αυτόματη πρόταση ή το όνομα του ERP· στα σετ με δώρο τα υπόλοιπα μέλη σημειώνονται «Δώρο».
 */
export async function setPartsForSite(productId: string): Promise<{ name: string; qty: number; gift: boolean }[] | null> {
  const p = await db.product.findUnique({ where: { id: productId }, select: { kind: true, setSpcs: true } }).catch(() => null);
  if (p?.kind !== "set" || p.setSpcs == null) return null;
  const s = await db.s1Set.findUnique({ where: { spcs: p.setSpcs }, select: { name: true, mtrl: true, lines: { orderBy: { lineNum: "asc" }, select: { name: true, label: true, qty: true, mtrl: true } } } });
  if (!s || s.lines.length < 2) return null;
  const others = s.lines.filter((l) => l.mtrl !== s.mtrl).map((l) => String(l.mtrl));
  const sold = new Set((others.length ? await db.product.findMany({ where: { erpCode: { in: others }, active: true }, select: { erpCode: true } }) : []).map((x) => x.erpCode));
  const gift = setKind(s.name, s.lines, s.mtrl, (m) => sold.has(String(m))) === "gift";
  const seen = new Set<number>();
  return s.lines.filter((l) => (seen.has(l.mtrl) ? false : (seen.add(l.mtrl), true))).map((l) => ({
    name: l.label?.trim() || suggestSetLabel(l.name, s.name, { isMain: l.mtrl === s.mtrl, members: s.lines.length }) || l.name,
    qty: l.qty, gift: gift && l.mtrl !== s.mtrl,
  }));
}

/** Τα ενεργά προϊόντα-σετ που περιέχουν αυτό το είδος ως κύριο (για «Διαθέσιμο και σε σετ» / ανακατεύθυνση). */
export async function setsOfMain(productId: string): Promise<{ id: string; slug: string; title: string; price: number | null }[]> {
  const p = await db.product.findUnique({ where: { id: productId }, select: { kind: true, erpCode: true } }).catch(() => null);
  const m = Number(p?.erpCode);
  if (p?.kind !== "item" || !Number.isInteger(m)) return [];
  const spcs = (await db.s1Set.findMany({ where: { mtrl: m }, select: { spcs: true } })).map((x) => x.spcs);
  if (!spcs.length) return [];
  return db.product.findMany({ where: { setSpcs: { in: spcs }, active: true }, orderBy: [{ price: "asc" }], select: { id: true, slug: true, title: true, price: true } });
}
