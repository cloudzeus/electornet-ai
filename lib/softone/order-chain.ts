import "server-only";
import { db } from "@/lib/db";
import { getTable } from "./lookups";
import { docChain, docRoot } from "./doc-chain";

export interface OrderChainNode {
  findoc: number; parents: number[]; fincode: string; date: string; total: number | null; fullyTransf: number | null;
  series: number; seriesName: string | null; typeName: string | null; category: string | null; viaRoot: boolean; shared: boolean; ownNet: number | null;
}
export type OrderChain = { ok: true; root: number; /** το παραστατικό που ζητήθηκε (επιλέγεται στο διάγραμμα) */ focus: number; truncated: boolean; nodes: OrderChainNode[]; at: string } | { ok: false; reason: "not-sent" | "error" };

/** Η πορεία μιας παραγγελίας στο SoftOne: εύρεση του FINDOC της και όλων όσων προήλθαν από αυτό. Μόνο αναγνώσεις. */
export async function orderChain(orderId: string): Promise<OrderChain> {
  const o = await db.order.findUnique({ where: { id: orderId }, select: { number: true, erpSync: { select: { erpDocId: true } } } });
  if (!o) return { ok: false, reason: "not-sent" };
  try {
    let root = Number(o.erpSync?.erpDocId) || 0;
    // το FINCODE της παραγγελίας στο SoftOne είναι ο αριθμός μας (order-doc-core)· μόνο ασφαλείς χαρακτήρες στο φίλτρο
    if (!root && /^[\w-]+$/.test(o.number)) root = Number((await getTable("FINDOC", ["FINDOC"], `SOSOURCE=1351 AND FINCODE='${o.number}'`))[0]?.[0]) || 0;
    if (!root) return { ok: false, reason: "not-sent" };
    return await chainFor(root);
  } catch (e) {
    console.error("[order-chain]", e); // λεπτομέρειες μόνο στα logs
    return { ok: false, reason: "error" };
  }
}

/**
 * Η αλυσίδα ενός FINDOC με ονόματα σειράς/τύπου από τους δικούς μας πίνακες. Ξεκινά από την αρχική παραγγελία του
 * (μια απόδειξη δείχνει και την παραγγελία, το PKP, το δελτίο πριν από αυτήν)· αν το παραστατικό δεν ανήκει στη διαδρομή
 * εκείνης (π.χ. κοινό PES με γραμμές πολλών παραγγελιών), η διαδρομή ξεκινά από το ίδιο.
 */
export async function chainFor(findoc: number): Promise<OrderChain> {
  try {
    let root = await docRoot(findoc);
    let chain = await docChain(root);
    if (root !== findoc && !chain.docs.some((d) => d.findoc === findoc)) { root = findoc; chain = await docChain(root); }
    const series = await db.docSeries.findMany({ where: { s1Id: { in: [...new Set(chain.docs.map((d) => String(d.series)))] } }, select: { s1Id: true, name: true, s1Fprms: true } });
    const bySeries = new Map(series.map((s) => [s.s1Id, s]));
    const fprms = [...new Set(series.map((s) => s.s1Fprms).filter(Boolean) as string[])];
    const types = new Map((fprms.length ? await db.docType.findMany({ where: { s1Id: { in: fprms } }, select: { s1Id: true, name: true, category: true } }) : []).map((t) => [t.s1Id, t]));
    const ids = new Set(chain.docs.map((d) => d.findoc));
    const nodes = chain.docs.map((d) => {
      const s = bySeries.get(String(d.series)); const t = s?.s1Fprms ? types.get(s.s1Fprms) : undefined;
      const parents = d.parents.filter((p) => ids.has(p));
      return { ...d, parents, seriesName: s?.name ?? null, typeName: t?.name ?? null, category: t?.category ?? null };
    });
    return { ok: true, root, focus: findoc, truncated: chain.truncated, nodes, at: new Date().toISOString() };
  } catch (e) {
    console.error("[order-chain]", e); // λεπτομέρειες μόνο στα logs
    return { ok: false, reason: "error" };
  }
}
