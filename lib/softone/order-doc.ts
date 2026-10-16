import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings/store";
import { composeSaldoc, type SaldocDoc, type SaldocLine, type SaldocSettings } from "./order-doc-core";

/**
 * Το παραστατικό SoftOne μιας παραγγελίας, από τα στοιχεία της όπως αποθηκεύτηκαν (γραμμές, εκπτώσεις, ΦΠΑ είδους,
 * διεύθυνση, τιμολόγιο, κατάστημα). Μόνο σύνθεση: εδώ ΔΕΝ γίνεται καμία κλήση στο ERP. Η αντιστοίχιση στα πεδία του
 * SoftOne είναι στο order-doc-core.ts.
 */
type Client = PrismaClient | Prisma.TransactionClient;

export async function saldocSettings(): Promise<SaldocSettings> {
  const { data } = await getSetting("softone").catch(() => ({ data: {} as Record<string, unknown> }));
  const s = (k: string) => String(data[k] ?? "").trim() || null;
  const payment: Record<string, string> = {};
  for (const k of ["card", "no-card", "iris", "paypal", "klarna", "tbi", "bank", "cod", "store", "revolut"]) {
    const v = s(`orderPay_${k}`);
    if (v) payment[k] = v;
  }
  // Apple / Google Pay είναι πληρωμή με κάρτα
  if (payment.card) { payment.apple ??= payment.card; payment.google ??= payment.card; }
  return { series: s("orderSeries"), retailTrdr: s("orderRetailTrdr"), payment, shippingMtrl: s("orderShippingMtrl") };
}

export async function saldocForOrder(orderId: string, client: Client = db): Promise<SaldocDoc | null> {
  const o = await client.order.findUnique({
    where: { id: orderId },
    select: {
      number: true, fulfilment: true, paymentMethod: true, payment: { select: { method: true } }, guestEmail: true, shipping: true, invoice: true, shippingFee: true, total: true,
      customer: { select: { email: true, erpTrdr: true, vatNumber: true } },
      pickupStore: { select: { name: true, address: true, zip: true, city: true } },
      lines: {
        orderBy: { id: "asc" },
        select: {
          title: true, qty: true, listPrice: true, unitPrice: true, discPrice: true, discCoupon: true, discPayment: true, erpCode: true, isGift: true, promotions: true, setSpcs: true, setParts: true,
          variant: { select: { product: { select: { vatRate: true } } } },
          addons: { select: { price: true, service: { select: { title: true } } } },
        },
      },
    },
  });
  if (!o) return null;
  const sh = (o.shipping ?? {}) as { firstName?: string; lastName?: string; email?: string; phone?: string; street?: string; number?: string; floor?: string; zip?: string; city?: string; region?: string; notes?: string; carrierName?: string; locker?: { name?: string; address?: string; zip?: string } };
  const inv = (o.invoice ?? null) as { vatNumber?: string; doy?: string; company?: string } | null;

  // όροι κάθε προσφοράς όπως ίσχυαν (για το COMMENTS1 της γραμμής)
  type Promo = { promotionId?: string; code?: string; version?: number; kind?: string };
  const promoIds = [...new Set(o.lines.flatMap((l) => ((l.promotions ?? []) as Promo[]).map((p) => p.promotionId).filter(Boolean) as string[]))];
  const terms = new Map((promoIds.length ? await client.promotion.findMany({ where: { id: { in: promoIds } }, select: { id: true, termsText: true } }) : []).map((p) => [p.id, p.termsText]));

  const lines: SaldocLine[] = [];
  for (const l of o.lines) {
    const promos = (l.promotions ?? []) as Promo[];
    const n = (d: unknown) => Number(d ?? 0);
    lines.push({
      erpCode: l.erpCode, title: l.title, qty: l.qty, listPrice: n(l.listPrice ?? l.unitPrice),
      discPrice: n(l.discPrice), discCoupon: n(l.discCoupon), discPayment: n(l.discPayment), vatRate: n(l.variant.product.vatRate) || 24,
      promo: promos.map((p) => `${p.code} v${p.version}${l.isGift ? " · δώρο" : ""}`).join(" · ") || null,
      terms: promos.map((p) => (p.promotionId ? terms.get(p.promotionId) : null)).filter(Boolean).join(" · ") || null,
      // σετ: ανοίγει σε κύριο + μέλη από το στιγμιότυπο της αγοράς (όχι από τα σημερινά μέλη του SoftOne)
      setSpcs: l.setSpcs, setParts: (l.setParts ?? null) as SaldocLine["setParts"],
    });
    // υπηρεσίες της γραμμής (εγκατάσταση, επέκταση εγγύησης κ.λπ.): δική τους γραμμή — ο κωδικός είδους ορίζεται ανά υπηρεσία
    for (const a of l.addons) lines.push({ erpCode: null, title: a.service.title, qty: 1, listPrice: n(a.price), discPrice: 0, discCoupon: 0, discPayment: 0, vatRate: 24 });
  }

  // τιμολόγιο: η καρτέλα του πελάτη στο SoftOne με αυτόν τον ΑΦΜ (του λογαριασμού ή άλλου πελάτη με τον ίδιο ΑΦΜ)
  let invoiceTrdr: string | null = null;
  if (inv?.vatNumber) {
    const vat = inv.vatNumber.replace(/\D/g, "");
    invoiceTrdr = o.customer?.erpTrdr && o.customer.vatNumber?.replace(/\D/g, "") === vat ? o.customer.erpTrdr
      : (await client.customer.findFirst({ where: { vatNumber: vat, erpTrdr: { not: null } }, select: { erpTrdr: true } }))?.erpTrdr ?? null;
  }

  return composeSaldoc({
    number: o.number, fulfilment: o.fulfilment, payment: o.payment?.method ?? o.paymentMethod ?? "", email: sh.email ?? o.customer?.email ?? o.guestEmail ?? null,
    contact: { firstName: sh.firstName, lastName: sh.lastName, phone: sh.phone },
    address: { street: sh.street, number: sh.number, floor: sh.floor, zip: sh.zip, city: sh.city, region: sh.region, notes: sh.notes },
    carrierName: sh.carrierName ?? null, locker: sh.locker ?? null,
    store: o.fulfilment === "click-collect" && o.pickupStore ? o.pickupStore : null,
    invoice: inv, invoiceTrdr, lines, shippingFee: Number(o.shippingFee), total: Number(o.total),
  }, await saldocSettings());
}

/** Ξαναχτίζει το προσχέδιο όσο δεν έχει σταλεί (π.χ. μετά από αλλαγή ρυθμίσεων). Επιστρέφει το νέο. */
export async function refreshSaldocPreview(orderId: string): Promise<SaldocDoc | null> {
  const doc = await saldocForOrder(orderId);
  if (doc) await db.erpSync.updateMany({ where: { orderId, status: { in: ["preview", "awaiting-payment"] } }, data: { payload: doc as unknown as Prisma.InputJsonValue } });
  return doc;
}

/**
 * Έλεγχος στο ίδιο το SoftOne με την υπηρεσία `calculate`: υπολογίζει το παραστατικό ΧΩΡΙΣ να το αποθηκεύσει και
 * επιστρέφει τα σύνολά του. Σύγκριση με το ποσό της παραγγελίας. Δεν γράφει τίποτα στο ERP.
 */
export async function checkSaldocInSoftone(orderId: string): Promise<{ ok: boolean; message: string }> {
  const doc = await saldocForOrder(orderId);
  if (!doc) return { ok: false, message: "Η παραγγελία δεν βρέθηκε." };
  if (doc.needs.length) return { ok: false, message: `Πρώτα συμπληρώστε: ${doc.needs.join(" · ")}` };
  const { s1 } = await import("@/lib/softone");
  const r = await s1("calculate", { OBJECT: "SALDOC", KEY: "", LOCATEINFO: "SALDOC:SUMAMNT,NETAMNT,VATAMNT;ITELINES:MTRL,QTY1,PRICE,LINEVAL,VATAMNT", data: doc.data });
  if (!r?.success) return { ok: false, message: `Το SoftOne απέρριψε το παραστατικό: ${r?.error ?? r?.errorcode ?? "άγνωστο σφάλμα"}` };
  const h = (r.data?.SALDOC?.[0] ?? {}) as Record<string, unknown>;
  const sum = Math.round(Number(h.SUMAMNT ?? NaN) * 100) / 100;
  if (!Number.isFinite(sum)) return { ok: false, message: "Το SoftOne δεν επέστρεψε σύνολο." };
  const eurS = (n: number) => n.toLocaleString("el-GR", { style: "currency", currency: "EUR" });
  return sum === doc.totals.expected
    ? { ok: true, message: `Το SoftOne υπολογίζει ${eurS(sum)} (καθαρή αξία ${eurS(Number(h.NETAMNT))}, ΦΠΑ ${eurS(Number(h.VATAMNT))}) — ίδιο με την παραγγελία. Τίποτα δεν αποθηκεύτηκε.` }
    : { ok: false, message: `Το SoftOne υπολογίζει ${eurS(sum)} ενώ η παραγγελία είναι ${eurS(doc.totals.expected)}. Τίποτα δεν αποθηκεύτηκε.` };
}
