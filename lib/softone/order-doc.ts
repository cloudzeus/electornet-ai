import "server-only";
import { getSetting } from "@/lib/settings/store";

/**
 * Παραγγελία e-shop → παραστατικό πώλησης SoftOne (SALDOC + ITELINES), με την αντιστοίχιση που επιβεβαιώθηκε στην
 * εγκατάσταση της Euronics (getTableFields, 2/10/2026):
 *   PRICE / NODSCLNVAL  = τιμή καταλόγου πριν την προσφορά
 *   DISC1VAL            = έκπτωση προσφοράς τιμής (ή 100 % της αξίας σε δώρο / δωρεάν υπηρεσία)
 *   DISC2VAL            = μερίδιο του κουπονιού καλαθιού (κατανεμημένο αναλογικά)
 *   DISC3VAL            = έκπτωση τρόπου πληρωμής (Φάση 2)
 *   COMMENTS (255)      = Campaign ID και έκδοση («CMP-2026-118 v2 · WELCOME10») — μέχρι να υπάρξουν CCCPROMO / CCCPROMOVER
 *   COMMENTS1 (2000)    = σύντομοι όροι της προσφοράς όπως ίσχυαν
 * Μόνο σύνθεση: εδώ ΔΕΝ γίνεται καμία κλήση στο ERP.
 */

export interface DocLineIn { erpCode: string | null; title: string; qty: number; listPrice: number; discPrice: number; discCoupon: number; discPayment: number; isGift: boolean; promotions: { code: string; version: number; kind: string; label: string }[]; terms?: string | null }
export interface DocIn {
  number: string; customerTrdr: string | null; email: string; fulfilment: string; payment: string; lines: DocLineIn[];
  /** price = αξία της υπηρεσίας, discount = ό,τι χάρισε προσφορά (100 % της αξίας για δωρεάν υπηρεσία) */
  services: { slug: string; title: string; price: number; discount?: number; promo?: string | null; erpCode: string | null }[];
  /** δώρα: αξία με έκπτωση 100 % */
  gifts?: { erpCode: string | null; title: string; qty: number; value: number; promo: string; terms?: string | null }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function buildSaldoc(o: DocIn) {
  const { data } = await getSetting("softone").catch(() => ({ data: {} as Record<string, unknown> }));
  const series = String(data.orderSeries ?? "").trim() || null;
  const trdr = o.customerTrdr ?? (String(data.orderRetailTrdr ?? "").trim() || null);
  const needs: string[] = [];
  if (!series) needs.push("Σειρά παραστατικού (Ρυθμίσεις → SoftOne → Σειρά παραστατικού παραγγελίας e-shop)");
  if (!trdr) needs.push("Πελάτης λιανικής για επισκέπτες (TRDR)");
  const itelines = o.lines.map((l) => {
    if (!l.erpCode) needs.push(`Κωδικός είδους για «${l.title}»`);
    const codes = l.promotions.map((p) => `${p.code} v${p.version}`).join(" · ");
    return {
      MTRL: l.erpCode ? Number(l.erpCode) : null, QTY1: l.qty,
      PRICE: r2(l.listPrice), NODSCLNVAL: r2(l.listPrice * l.qty),
      ...(l.discPrice ? { DISC1VAL: r2(l.discPrice) } : {}), ...(l.discCoupon ? { DISC2VAL: r2(l.discCoupon) } : {}), ...(l.discPayment ? { DISC3VAL: r2(l.discPayment) } : {}),
      ...(codes ? { COMMENTS: codes.slice(0, 255) } : {}), ...(l.terms ? { COMMENTS1: l.terms.slice(0, 2000) } : {}),
    };
  });
  for (const s of o.services) {
    if (!s.erpCode) needs.push(`Κωδικός είδους υπηρεσίας για «${s.title}» στο SoftOne`);
    itelines.push({ MTRL: s.erpCode ? Number(s.erpCode) : null, QTY1: 1, PRICE: r2(s.price), NODSCLNVAL: r2(s.price), ...(s.discount ? { DISC1VAL: r2(s.discount) } : {}), ...(s.promo ? { COMMENTS: s.promo.slice(0, 255) } : {}) });
  }
  for (const g of o.gifts ?? []) {
    if (!g.erpCode) needs.push(`Κωδικός είδους για το δώρο «${g.title}»`);
    itelines.push({ MTRL: g.erpCode ? Number(g.erpCode) : null, QTY1: g.qty, PRICE: r2(g.value / g.qty), NODSCLNVAL: r2(g.value), DISC1VAL: r2(g.value), COMMENTS: `${g.promo} · δώρο`.slice(0, 255), ...(g.terms ? { COMMENTS1: g.terms.slice(0, 2000) } : {}) });
  }
  return {
    OBJECT: "SALDOC",
    data: { SALDOC: [{ SERIES: series ? Number(series) : null, TRDR: trdr ? Number(trdr) : null, COMMENTS: `e-shop ${o.number}`.slice(0, 255), COMMENTS1: `${o.fulfilment} · ${o.payment} · ${o.email}`.slice(0, 255) }], ITELINES: itelines },
    needs: [...new Set(needs)],
  };
}
