import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings/store";
import { composeSaldoc, fincodeFilter, type SaldocDoc, type SaldocLine, type SaldocSettings } from "./order-doc-core";

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

// το SoftOne φορτώνεται μόνο όταν χρειαστεί (οι ρυθμίσεις/σύνδεση δεν πρέπει να φορτώνουν σε κάθε σύνθεση παραστατικού)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const s1Call = async (service: string, params: Record<string, unknown>): Promise<any> => (await import("@/lib/softone")).s1(service, params);

/** Ρυθμίσεις → SoftOne → «Παραγγελίες προς SoftOne». `send` = πραγματική αποστολή, `preview` = μόνο προσχέδιο. */
export async function orderPushMode(): Promise<"off" | "preview" | "send"> {
  const { data } = await getSetting("softone").catch(() => ({ data: {} as Record<string, unknown> }));
  const m = String(data.orderPush ?? "preview");
  return m === "send" || m === "off" ? m : "preview";
}

/**
 * Δεύτερη δικλείδα, πέρα από τον διακόπτη των ρυθμίσεων: χωρίς `S1_ORDER_WRITE=1` στο περιβάλλον δεν γίνεται ΚΑΜΙΑ
 * εγγραφή παραστατικού, ούτε κλήση δικτύου. Ίδιο μοτίβο με την τιμή web (S1_WEB_PRICE_WRITE) — ο διακόπτης της διαχείρισης
 * ανοίγει μόνο εκεί όπου το περιβάλλον το επιτρέπει, ώστε μια ρύθμιση σε κοινή βάση να μην ανοίγει τις εγγραφές παντού.
 */
export const orderWriteEnabled = () => process.env.S1_ORDER_WRITE === "1";
export const ORDER_WRITE_OFF = "Η αποστολή παραγγελιών στο SoftOne δεν έχει ενεργοποιηθεί σε αυτόν τον διακομιστή (S1_ORDER_WRITE=1).";

/** Το FINDOC της παραγγελίας στο SoftOne από τον αριθμό μας. 0 = δεν υπάρχει, null = δεν μπόρεσε να ελεγχθεί. */
async function findocOf(number: string): Promise<number | null> {
  const filter = fincodeFilter(number);
  if (!filter) return null;
  const { getTable } = await import("./lookups");
  const rows = await getTable("FINDOC", ["FINDOC"], filter);
  return Number(rows[0]?.[0]) || 0;
}

/**
 * Αποστολή της παραγγελίας στο SoftOne: `setData SALDOC` και ανάγνωση πίσω του παραστατικού που δημιουργήθηκε.
 *
 * Δικλείδες, με αυτή τη σειρά — καμία κλήση δικτύου αν δεν περάσουν όλες:
 * 1. `S1_ORDER_WRITE=1` στο περιβάλλον ΚΑΙ ο διακόπτης των ρυθμίσεων σε «Αποστολή».
 * 2. Το παραστατικό είναι πλήρες (`needs` κενό) — αλλιώς τίποτα δεν φεύγει.
 * 3. Ατομική κατοχύρωση στο `ErpSync` (μόνο ένας αποστολέας ανά παραγγελία, χειροκίνητος ή αυτόματος).
 * 4. Έλεγχος διπλοεγγραφής: αν υπάρχει ήδη παραστατικό με FINCODE τον αριθμό μας, δεν ξαναστέλνεται.
 * Μετά την εγγραφή το παραστατικό διαβάζεται πίσω (`success:true` ≠ αποθηκεύτηκε) και συγκρίνεται το σύνολό του.
 */
export async function sendSaldoc(orderId: string, staffId?: string | null): Promise<{ ok: boolean; message: string; findoc?: number }> {
  if (!orderWriteEnabled()) return { ok: false, message: ORDER_WRITE_OFF };
  if ((await orderPushMode()) !== "send") return { ok: false, message: "Οι παραγγελίες προς SoftOne είναι σε «μόνο προεπισκόπηση» (Ρυθμίσεις → SoftOne)." };

  const o = await db.order.findUnique({ where: { id: orderId }, select: { number: true, erpSync: { select: { status: true, erpDocId: true } } } });
  if (!o) return { ok: false, message: "Η παραγγελία δεν βρέθηκε." };
  if (o.erpSync?.status === "sent") return { ok: true, message: `Είχε σταλεί ήδη — παραστατικό ${o.erpSync.erpDocId ?? "—"}.`, findoc: Number(o.erpSync.erpDocId) || undefined };

  const doc = await saldocForOrder(orderId);
  if (!doc) return { ok: false, message: "Η παραγγελία δεν βρέθηκε." };
  if (doc.needs.length) return { ok: false, message: `Πρώτα συμπληρώστε: ${doc.needs.join(" · ")}` };
  const payload = doc as unknown as Prisma.InputJsonValue;

  // κατοχύρωση: ό,τι δεν είναι «σε ουρά» ή «στάλθηκε» γίνεται «σε ουρά» — δεύτερη ταυτόχρονη αποστολή δεν βρίσκει γραμμή
  if (o.erpSync) {
    const claimed = await db.erpSync.updateMany({ where: { orderId, status: { in: ["preview", "awaiting-payment", "failed"] } }, data: { status: "queued", attempts: { increment: 1 }, payload, lastError: null } });
    if (!claimed.count) return { ok: false, message: "Η αποστολή είναι σε εξέλιξη — δοκιμάστε σε λίγο." };
  } else {
    const created = await db.erpSync.create({ data: { orderId, status: "queued", attempts: 1, payload } }).catch(() => null);
    if (!created) return { ok: false, message: "Η αποστολή είναι σε εξέλιξη — δοκιμάστε σε λίγο." };
  }
  const fail = async (message: string) => {
    await db.erpSync.update({ where: { orderId }, data: { status: "failed", lastError: message } }).catch(() => null);
    return { ok: false, message };
  };
  const succeed = async (findoc: number, message: string) => {
    await db.erpSync.update({ where: { orderId }, data: { status: "sent", erpDocId: String(findoc), lastError: null } }).catch(() => null);
    const { audit } = await import("@/lib/rbac/audit");
    await audit(staffId ?? null, "order.erp-send", "Order", orderId, null, { findoc, fincode: o.number, total: doc.totals.expected });
    return { ok: true, message, findoc };
  };

  // διπλοεγγραφή: αν δεν μπορεί να ελεγχθεί (σφάλμα δικτύου ή αριθμός που δεν μπαίνει σε φίλτρο) δεν στέλνουμε στα τυφλά
  const existing = await findocOf(o.number).catch(() => null);
  if (existing == null) return fail("Δεν ήταν δυνατός ο έλεγχος αν η παραγγελία υπάρχει ήδη στο SoftOne — δεν στάλθηκε. Δοκιμάστε ξανά.");
  if (existing) return succeed(existing, `Υπήρχε ήδη στο SoftOne ως παραστατικό ${existing} — δεν στάλθηκε δεύτερη φορά.`);

  const r = await s1Call("setData", { OBJECT: "SALDOC", KEY: "", data: doc.data }).catch((e: Error) => ({ success: false, error: e.message }));
  if (!r?.success) return fail(`Το SoftOne αρνήθηκε το παραστατικό: ${r?.error ?? r?.errorcode ?? "άγνωστο σφάλμα"}`);

  // «επιτυχία» ≠ αποθηκεύτηκε: το παραστατικό διαβάζεται πίσω και με τον αριθμό μας, αν το setData δεν επέστρεψε id
  const findoc = Number(r.id) || (await findocOf(o.number).catch(() => 0)) || 0;
  if (!findoc) return fail("Το SoftOne απάντησε «επιτυχία» αλλά το παραστατικό δεν βρίσκεται — έλεγξε στο ERP πριν ξαναστείλεις.");
  const back = await s1Call("getData", { object: "SALDOC", key: String(findoc), locateinfo: "SALDOC:FINCODE,SUMAMNT" }).catch(() => null);
  const h = (back?.data?.SALDOC?.[0] ?? {}) as Record<string, unknown>;
  const sum = Math.round(Number(h.SUMAMNT ?? NaN) * 100) / 100;
  const eurS = (n: number) => n.toLocaleString("el-GR", { style: "currency", currency: "EUR" });
  if (Number.isFinite(sum) && sum !== doc.totals.expected) return succeed(findoc, `Στάλθηκε ως παραστατικό ${findoc}, αλλά το σύνολό του είναι ${eurS(sum)} ενώ η παραγγελία ${eurS(doc.totals.expected)} — έλεγξέ το στο ERP.`);
  return succeed(findoc, `Στάλθηκε στο SoftOne ως παραστατικό ${findoc}${Number.isFinite(sum) ? ` (${eurS(sum)})` : ""}.`);
}

/** Αυτόματη αποστολή μόλις η παραγγελία είναι πληρωμένη/καταχωρημένη, όταν ο διακόπτης είναι σε «Αποστολή». Σιωπηλή: η αποτυχία μένει στο ErpSync. */
export async function maybeSendSaldoc(orderId: string) {
  if (!orderWriteEnabled() || (await orderPushMode()) !== "send") return;
  const r = await sendSaldoc(orderId).catch((e: Error) => ({ ok: false, message: e.message }));
  if (!r.ok) console.error("[erp-send]", orderId, r.message);
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
