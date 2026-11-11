import "server-only";
import { db } from "@/lib/db";
import { getTable } from "@/lib/softone/lookups";
import { docKind, type DocKind } from "./doc-kind";

/**
 * Παραστατικά πωλήσεων ενός συνεργάτη από το SoftOne (FINDOC, SOSOURCE 1351), μόνο ανάγνωση.
 * Σύνοψη όλων των ετών (ελαφριά πεδία) + λεπτομέρειες ενός έτους (σχόλια, μεταφορέας από MTRDOC).
 * Κρατιούνται στη μνήμη του server 6 ώρες για να μη ρωτάμε το SoftOne σε κάθε άνοιγμα.
 */
export interface YearSum { year: number; n: number; orders: number; sales: number; credits: number; turnover: number }
export interface DocSummary { years: YearSum[]; total: number; lastDoc: { date: string; fincode: string; type: string } | null; lastOrder: { date: string; fincode: string; type: string } | null; ytd: { now: number; prev: number }; at: string }
export interface DocRow { findoc: number; fincode: string; date: string; type: string; kind: DocKind; amount: number; cancelled: boolean; comments: string; carrier: string | null }

const TTL = 6 * 3600_000;
const cache = new Map<string, { at: number; v: unknown }>();
async function cached<T>(key: string, force: boolean, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < TTL) return hit.v as T;
  const v = await fn();
  cache.set(key, { at: Date.now(), v });
  return v;
}

export const fprmsNames = () => cached("fprms", false, async () => new Map((await getTable("FPRMS", ["FPRMS", "NAME"], "SOSOURCE=1351")).map((r) => [r[0], r[1]])));

/** Τζίρος: τιμολόγια/αποδείξεις μείον πιστωτικά· όσα ακυρώθηκαν (ISCANCEL≠0) και τα ακυρωτικά δεν μετρούν. */
const signed = (kind: DocKind, amount: number, cancelled: boolean) => (cancelled ? 0 : kind === "sale" ? amount : kind === "credit" ? -amount : 0);

export async function partnerDocSummary(trdr: number, force = false): Promise<DocSummary> {
  return cached(`sum:${trdr}`, force, async () => {
    const [rows, names] = await Promise.all([getTable("FINDOC", ["FINDOC", "FINCODE", "TRNDATE", "FPRMS", "SUMAMNT", "ISCANCEL"], `TRDR=${trdr} AND SOSOURCE=1351`), fprmsNames()]);
    const by = new Map<number, YearSum>();
    const now = new Date(), md = now.toISOString().slice(5, 10), y0 = now.getFullYear();
    const ytd = { now: 0, prev: 0 };
    let lastDoc: DocSummary["lastDoc"] = null, lastOrder: DocSummary["lastOrder"] = null;
    for (const r of rows) {
      const date = r[2].slice(0, 10), year = Number(date.slice(0, 4));
      if (!year) continue;
      const type = names.get(r[3]) ?? `Τύπος ${r[3]}`, kind = docKind(type), amount = Number(r[4]) || 0, v = signed(kind, amount, r[5] !== "0" && r[5] !== "");
      const y = by.get(year) ?? { year, n: 0, orders: 0, sales: 0, credits: 0, turnover: 0 };
      y.n++; if (kind === "order") y.orders++;
      if (v > 0) y.sales += v; else y.credits -= v;
      y.turnover += v;
      by.set(year, y);
      if (year === y0) ytd.now += v;
      if (year === y0 - 1 && date.slice(5) <= md) ytd.prev += v;
      const d = { date, fincode: r[1], type };
      if (!lastDoc || date > lastDoc.date) lastDoc = d;
      if (kind === "order" && (!lastOrder || date > lastOrder.date)) lastOrder = d;
    }
    const round = (x: number) => Math.round(x * 100) / 100;
    const years = [...by.values()].sort((a, b) => b.year - a.year).map((y) => ({ ...y, sales: round(y.sales), credits: round(y.credits), turnover: round(y.turnover) }));
    return { years, total: rows.length, lastDoc, lastOrder, ytd: { now: round(ytd.now), prev: round(ytd.prev) }, at: new Date().toISOString() };
  });
}

export async function partnerDocYear(trdr: number, year: number, force = false): Promise<{ rows: DocRow[]; carriers: { name: string; n: number }[] }> {
  return cached(`year:${trdr}:${year}`, force, async () => {
    const F = ["FINDOC", "FINCODE", "TRNDATE", "FPRMS", "SUMAMNT", "ISCANCEL", "COMMENTS"];
    const [docs, names] = await Promise.all([getTable("FINDOC", F, `TRDR=${trdr} AND SOSOURCE=1351 AND TRNDATE>='${year}-01-01' AND TRNDATE<'${year + 1}-01-01'`), fprmsNames()]);
    const ids = docs.map((r) => Number(r[0])).filter(Boolean);
    const carrierOf = new Map<number, string>();
    for (let i = 0; i < ids.length; i += 400) {
      const rows = await getTable("MTRDOC", ["FINDOC", "SOCARRIER"], `FINDOC IN (${ids.slice(i, i + 400).join(",")})`);
      for (const r of rows) if (r[1]) carrierOf.set(Number(r[0]), r[1]);
    }
    const s1Ids = [...new Set(carrierOf.values())];
    const carriers = s1Ids.length ? new Map((await db.carrier.findMany({ where: { s1Id: { in: s1Ids } }, select: { s1Id: true, name: true } })).map((c) => [c.s1Id as string, c.name])) : new Map<string, string>();
    const rows: DocRow[] = docs.map((r) => {
      const type = names.get(r[3]) ?? `Τύπος ${r[3]}`, c = carrierOf.get(Number(r[0]));
      return { findoc: Number(r[0]), fincode: r[1], date: r[2].slice(0, 10), type, kind: docKind(type), amount: Number(r[4]) || 0, cancelled: r[5] !== "0" && r[5] !== "", comments: r[6] ?? "", carrier: c ? carriers.get(c) ?? `SOCARRIER ${c}` : null };
    }).sort((a, b) => b.date.localeCompare(a.date) || b.findoc - a.findoc);
    const count = new Map<string, number>();
    for (const r of rows) if (r.carrier) count.set(r.carrier, (count.get(r.carrier) ?? 0) + 1);
    return { rows, carriers: [...count].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n) };
  });
}
