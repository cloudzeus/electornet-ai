import "server-only";
import { db } from "@/lib/db";
import { getTable } from "./lookups";
import { orderChain, type OrderChain } from "./order-chain";
import { NEXT_SERIES } from "./transform-core";

export interface TransformLine { mtrlines: number; mtrl: number; code: string; name: string; qty: number; done: number; left: number; price: number }
export type TransformPreview =
  | { ok: true; findoc: number; fincode: string; targets: { series: string; name: string }[]; lines: TransformLine[]; check: { ok: boolean; message: string } | null; canRun: false; why: string }
  | { ok: false; error: string };

const num = (v: string | undefined) => { const x = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(x) ? x : 0; };
const eur = (n: number) => n.toLocaleString("el-GR", { style: "currency", currency: "EUR" });

/**
 * Τι θα γινόταν αν μετασχηματιζόταν το παραστατικό: υπόλοιπες ποσότητες ανά γραμμή, σειρά προορισμού και υπολογισμός του
 * SoftOne (calculate, χωρίς αποθήκευση). Μόνο αναγνώσεις — η εκτέλεση (setData) μένει κλειστή όσο οι εγγραφές είναι σε παύση.
 */
export async function transformPreview(orderId: string, findoc: number): Promise<TransformPreview> {
  // μόνο παραστατικά της πορείας αυτής της παραγγελίας, όχι ό,τι στείλει ο browser
  return transformPreviewIn(await orderChain(orderId), findoc);
}

/** Ίδιο, πάνω σε μια ήδη διαβασμένη πορεία (ο έλεγχος «ανήκει στην παραγγελία» γίνεται από τον καλούντα). */
export async function transformPreviewIn(chain: OrderChain, findoc: number): Promise<TransformPreview> {
  if (!chain.ok) return { ok: false, error: chain.reason === "not-sent" ? "Η παραγγελία δεν έχει σταλεί στο SoftOne." : "Δεν διαβάστηκε η πορεία στο SoftOne." };
  const node = chain.nodes.find((n) => n.findoc === findoc);
  if (!node) return { ok: false, error: "Το παραστατικό δεν ανήκει σε αυτή την παραγγελία." };
  const next = NEXT_SERIES[String(node.series)] ?? [];
  if (!next.length) return { ok: false, error: `Δεν υπάρχει συνηθισμένος μετασχηματισμός μετά από ${node.seriesName ?? `σειρά ${node.series}`}.` };
  const series = await db.docSeries.findMany({ where: { s1Id: { in: next } }, select: { s1Id: true, name: true } });
  const targets = next.map((s) => ({ series: s, name: series.find((x) => x.s1Id === s)?.name ?? `Σειρά ${s}` }));

  const [rows, head] = await Promise.all([
    getTable("MTRLINES", ["MTRLINES", "MTRL", "QTY1", "QTY1COV", "PRICE"], `FINDOC=${findoc}`),
    getTable("FINDOC", ["TRDR"], `FINDOC=${findoc}`),
  ]);
  const mtrls = [...new Set(rows.map((r) => Number(r[1])).filter(Boolean))];
  const items = mtrls.length ? await getTable("MTRL", ["MTRL", "CODE", "NAME"], `MTRL IN (${mtrls.join(",")})`) : [];
  const byMtrl = new Map(items.map((r) => [Number(r[0]), r]));
  const lines: TransformLine[] = rows.map((r) => {
    const qty = num(r[2]), done = num(r[3]);
    return { mtrlines: Number(r[0]), mtrl: Number(r[1]), code: byMtrl.get(Number(r[1]))?.[1] ?? "", name: byMtrl.get(Number(r[1]))?.[2] ?? `Είδος ${r[1]}`, qty, done, left: Math.max(0, qty - done), price: num(r[4]) };
  });
  const open = lines.filter((l) => l.left > 0);
  let check: { ok: boolean; message: string } | null = null;
  if (open.length && head[0]?.[0]) {
    try {
      const { s1 } = await import("@/lib/softone");
      const r = await s1("calculate", {
        OBJECT: "SALDOC", KEY: "", LOCATEINFO: "SALDOC:SUMAMNT,NETAMNT,VATAMNT;ITELINES:MTRL,QTY1",
        data: { SALDOC: [{ SERIES: Number(targets[0].series), TRDR: Number(head[0][0]) }], ITELINES: open.map((l) => ({ MTRL: l.mtrl, QTY1: l.left, FINDOCS: findoc, MTRLINESS: l.mtrlines })) },
      });
      const h = (r?.data?.SALDOC?.[0] ?? {}) as Record<string, unknown>;
      const n = Array.isArray(r?.data?.ITELINES) ? r.data.ITELINES.length : 0, sum = Number(h.SUMAMNT);
      check = r?.success && Number.isFinite(sum)
        ? { ok: n === open.length, message: `Το SoftOne δέχτηκε ${n} από ${open.length} γραμμές${sum ? `, σύνολο ${eur(sum)} (ΦΠΑ ${eur(Number(h.VATAMNT))})` : ", χωρίς αξίες (π.χ. PKP αποθήκης)"}. Τίποτα δεν αποθηκεύτηκε.` }
        : { ok: false, message: `Το SoftOne δεν δέχτηκε τη δοκιμή: ${r?.error ?? r?.errorcode ?? "άγνωστο σφάλμα"}` };
    } catch (e) {
      console.error("[transform-preview]", e); // λεπτομέρειες μόνο στα logs
      check = { ok: false, message: "Δεν έγινε ο υπολογισμός στο SoftOne. Δοκίμασε ξανά σε λίγο." };
    }
  }
  return { ok: true, findoc, fincode: node.fincode, targets, lines, check, canRun: false, why: open.length ? "Οι εγγραφές στο SoftOne είναι σε παύση. Ο μετασχηματισμός γίνεται προς το παρόν από το SoftOne." : "Όλες οι γραμμές έχουν ήδη μετασχηματιστεί." };
}
