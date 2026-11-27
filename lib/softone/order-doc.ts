import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings/store";
import { mailS1Error, setS1Source, withS1Scope } from "./log";
import { composeSaldoc, erpDocNo, orderDocFilter, pesCode, pickOrderDoc, ORDER_DOC_FIELDS, ORDER_OBJECT, DEFAULT_RETAIL_TRDR, S1_SERVICE_MTRL, type ErpLogEntry, type SaldocDoc, type SaldocLine, type SaldocSettings } from "./order-doc-core";

/**
 * Το παραστατικό SoftOne μιας παραγγελίας, από τα στοιχεία της όπως αποθηκεύτηκαν (γραμμές, εκπτώσεις, ΦΠΑ είδους,
 * διεύθυνση, τιμολόγιο, κατάστημα). Μόνο σύνθεση: εδώ ΔΕΝ γίνεται καμία κλήση στο ERP. Η αντιστοίχιση στα πεδία του
 * SoftOne είναι στο order-doc-core.ts.
 */
type Client = PrismaClient | Prisma.TransactionClient;

export async function saldocSettings(): Promise<SaldocSettings> {
  const { data } = await getSetting("softone").catch(() => ({ data: {} as Record<string, unknown> }));
  const s = (k: string) => String(data[k] ?? "").trim() || null;
  return { series: s("orderSeries"), retailTrdr: s("orderRetailTrdr") };
}

export async function saldocForOrder(orderId: string, client: Client = db): Promise<SaldocDoc | null> {
  const o = await client.order.findUnique({
    where: { id: orderId },
    select: {
      number: true, fulfilment: true, paymentMethod: true, payment: { select: { method: true, instalments: true, status: true, psp: true, pspRef: true } }, guestEmail: true, shipping: true, invoice: true, shippingFee: true, total: true,
      customer: { select: { email: true, erpTrdr: true, vatNumber: true } },
      pickupStore: { select: { name: true, address: true, zip: true, city: true } },
      lines: {
        orderBy: { id: "asc" },
        select: {
          title: true, qty: true, listPrice: true, unitPrice: true, discPrice: true, discCoupon: true, discPayment: true, erpCode: true, isGift: true, promotions: true, setSpcs: true, setParts: true,
          variant: { select: { product: { select: { vatRate: true } } } },
          addons: { select: { price: true, service: { select: { title: true, slug: true } } } },
        },
      },
    },
  });
  if (!o) return null;
  const sh = (o.shipping ?? {}) as { firstName?: string; lastName?: string; email?: string; phone?: string; street?: string; number?: string; floor?: string; zip?: string; city?: string; region?: string; notes?: string; carrier?: string; carrierName?: string; slots?: string[]; locker?: { name?: string; address?: string; zip?: string } };
  const inv = (o.invoice ?? null) as { vatNumber?: string; doy?: string; company?: string; activity?: string; /** η καρτέλα που βρήκε ή άνοιξε η αποστολή στο SoftOne */ erpTrdr?: string } | null;

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
    for (const a of l.addons) lines.push({ erpCode: S1_SERVICE_MTRL[a.service.slug] ?? null, title: a.service.title, qty: 1, listPrice: n(a.price), discPrice: 0, discCoupon: 0, discPayment: 0, vatRate: 24 });
  }

  // τιμολόγιο: η καρτέλα του πελάτη στο SoftOne με αυτόν τον ΑΦΜ — όποια κράτησε η παραγγελία από προηγούμενη αποστολή,
  // αλλιώς του λογαριασμού ή άλλου πελάτη με τον ίδιο ΑΦΜ. Αν δεν υπάρχει καμία, τη βρίσκει ή την ανοίγει η αποστολή (sendSaldoc)
  let invoiceTrdr: string | null = null;
  if (inv?.vatNumber) {
    const vat = inv.vatNumber.replace(/\D/g, "");
    invoiceTrdr = inv.erpTrdr ? inv.erpTrdr : o.customer?.erpTrdr && o.customer.vatNumber?.replace(/\D/g, "") === vat ? o.customer.erpTrdr
      : (await client.customer.findFirst({ where: { vatNumber: vat, erpTrdr: { not: null } }, select: { erpTrdr: true } }))?.erpTrdr ?? null;
  }

  return composeSaldoc({
    number: o.number, fulfilment: o.fulfilment, payment: o.payment?.method ?? o.paymentMethod ?? "", email: sh.email ?? o.customer?.email ?? o.guestEmail ?? null,
    contact: { firstName: sh.firstName, lastName: sh.lastName, phone: sh.phone },
    address: { street: sh.street, number: sh.number, floor: sh.floor, zip: sh.zip, city: sh.city, region: sh.region, notes: sh.notes },
    carrier: sh.carrier ?? null, carrierName: sh.carrierName ?? null, locker: sh.locker ?? null, slots: sh.slots ?? null,
    pay: o.payment ? { instalments: o.payment.instalments, status: o.payment.status, psp: o.payment.psp, ref: o.payment.pspRef } : null,
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
/** Γιατί δεν γίνεται αποστολή από εδώ (null = γίνεται): κλειστός διακομιστής ή διακόπτης ρυθμίσεων όχι σε «Αποστολή». Η καρτέλα το δείχνει δίπλα στο κουμπί. */
export async function orderSendBlock(): Promise<string | null> {
  if (!orderWriteEnabled()) return ORDER_WRITE_OFF;
  return (await orderPushMode()) === "send" ? null : "Οι παραγγελίες προς SoftOne είναι σε «μόνο προεπισκόπηση» (Ρυθμίσεις → SoftOne).";
}

/**
 * Το FINDOC της παραγγελίας στο SoftOne από τον αριθμό μας — δική μας εγγραφή (NUM01) ή χειροκίνητη του προσωπικού
 * («PES dddd»), σε Παραστατικά λιανικής ή πωλήσεων. 0 = δεν υπάρχει, null = δεν μπόρεσε να ελεγχθεί.
 */
export async function findocOf(number: string, placedAt?: Date | null, total?: number | null): Promise<number | null> {
  const filter = orderDocFilter(number, (await saldocSettings()).series, placedAt);
  if (!filter) return null;
  const { getTable } = await import("./lookups");
  return pickOrderDoc(await getTable("FINDOC", ORDER_DOC_FIELDS, filter), { number, total: total ?? null });
}

/**
 * Αποστολή της παραγγελίας στο SoftOne: `setData RETAILDOC` (Παραστατικά λιανικής) και ανάγνωση πίσω του παραστατικού.
 *
 * Δικλείδες, με αυτή τη σειρά — καμία κλήση δικτύου αν δεν περάσουν όλες:
 * 1. `S1_ORDER_WRITE=1` στο περιβάλλον ΚΑΙ ο διακόπτης των ρυθμίσεων σε «Αποστολή».
 * 2. Το παραστατικό είναι πλήρες (`needs` κενό) — αλλιώς τίποτα δεν φεύγει.
 * 3. Ατομική κατοχύρωση στο `ErpSync` (μόνο ένας αποστολέας ανά παραγγελία, χειροκίνητος ή αυτόματος).
 * 4. Έλεγχος διπλοεγγραφής: αν υπάρχει ήδη παραστατικό της σειράς με NUM01 τον αριθμό μας ή με FINCODE «PES dddd» (το πέρασε
 *    το προσωπικό με το χέρι), δεν ξαναστέλνεται — στέλνονται μόνο όσες δεν έχουν καταχωρηθεί.
 * 5. Υπολογισμός στο SoftOne χωρίς αποθήκευση (`calculate`): το σύνολό του πρέπει να είναι το σύνολο της παραγγελίας.
 * Τιμολόγιο σε ΑΦΜ χωρίς γνωστή καρτέλα: ο ΑΦΜ ψάχνεται στο SoftOne· αν δεν υπάρχει, η καρτέλα πελάτη ανοίγει ΜΕΤΑ τον
 * υπολογισμό (που γίνεται με τον πελάτη λιανικής) και ΠΡΙΝ το παραστατικό — ώστε λάθος παραστατικό να μην αφήνει καρτέλα.
 * Μετά την εγγραφή το παραστατικό διαβάζεται πίσω (`success:true` ≠ αποθηκεύτηκε) και συγκρίνεται το σύνολό του.
 * Κρατιούνται ο αριθμός του όπως φαίνεται στο ERP (`docNo`, «PES 83») και η απάντηση του SoftOne σε κάθε βήμα (`log`).
 */
export function sendSaldoc(orderId: string, staffId?: string | null): Promise<{ ok: boolean; message: string; findoc?: number; docNo?: string | null }> {
  // οι κλήσεις SoftOne της αποστολής γράφονται στην καταγραφή με τον αριθμό της παραγγελίας· το email σφάλματος το στέλνει το fail(), με όλα τα βήματα
  return withS1Scope({ source: "Αποστολή παραγγελίας", mail: false }, () => sendSaldocRun(orderId, staffId));
}

async function sendSaldocRun(orderId: string, staffId?: string | null): Promise<{ ok: boolean; message: string; findoc?: number; docNo?: string | null }> {
  const block = await orderSendBlock();
  if (block) return { ok: false, message: block };

  const o = await db.order.findUnique({ where: { id: orderId }, select: { number: true, invoice: true, createdAt: true, total: true, erpSync: { select: { status: true, erpDocId: true, docNo: true, log: true } } } });
  if (!o) return { ok: false, message: "Η παραγγελία δεν βρέθηκε." };
  setS1Source(`Αποστολή παραγγελίας ${o.number}`);
  if (o.erpSync?.status === "sent") return { ok: true, message: `Είχε σταλεί ήδη — παραστατικό ${o.erpSync.docNo ?? o.erpSync.erpDocId ?? "—"}.`, findoc: Number(o.erpSync.erpDocId) || undefined, docNo: o.erpSync.docNo };

  let doc = await saldocForOrder(orderId);
  if (!doc) return { ok: false, message: "Η παραγγελία δεν βρέθηκε." };
  if (doc.needs.length) return { ok: false, message: `Πρώτα συμπληρώστε: ${doc.needs.join(" · ")}` };
  const payload = doc as unknown as Prisma.InputJsonValue, expected = doc.totals.expected;

  // κατοχύρωση: ό,τι δεν είναι «σε ουρά» ή «στάλθηκε» γίνεται «σε ουρά» — δεύτερη ταυτόχρονη αποστολή δεν βρίσκει γραμμή
  if (o.erpSync) {
    const claimed = await db.erpSync.updateMany({ where: { orderId, status: { in: ["preview", "awaiting-payment", "failed"] } }, data: { status: "queued", attempts: { increment: 1 }, payload, lastError: null } });
    if (!claimed.count) return { ok: false, message: "Η αποστολή είναι σε εξέλιξη — δοκιμάστε σε λίγο." };
  } else {
    const created = await db.erpSync.create({ data: { orderId, status: "queued", attempts: 1, payload } }).catch(() => null);
    if (!created) return { ok: false, message: "Η αποστολή είναι σε εξέλιξη — δοκιμάστε σε λίγο." };
  }
  // ό,τι απάντησε το SoftOne σε κάθε βήμα — μένει στην παραγγελία (κάρτα «SoftOne»), για να βρίσκεται η αιτία χωρίς logs διακομιστή
  const log: ErpLogEntry[] = [];
  const note = (step: string, ok: boolean, res: unknown) => { log.push({ at: new Date().toISOString(), step, ok, text: (typeof res === "string" ? res : JSON.stringify(res ?? null)).slice(0, 2000) }); };
  const keepLog = () => [...(Array.isArray(o.erpSync?.log) ? (o.erpSync.log as unknown as ErpLogEntry[]) : []), ...log].slice(-40) as unknown as Prisma.InputJsonValue;
  const fail = async (message: string) => {
    await db.erpSync.update({ where: { orderId }, data: { status: "failed", lastError: message, log: keepLog() } }).catch(() => null);
    // email στον τεχνικό υπεύθυνο με ό,τι χρειάζεται για να βρεθεί η αιτία: το μήνυμα, κάθε βήμα με την απάντησή του, το παραστατικό που πήγαινε να γραφτεί
    const bad = [...log].reverse().find((x) => !x.ok);
    void mailS1Error(
      { at: new Date().toISOString(), service: "Αποστολή παραγγελίας", object: o.number, key: null, write: true, full: true, ok: false, errorCode: null, error: message, http: null, ms: 0, source: `Αποστολή παραγγελίας ${o.number}`, request: doc?.data ?? null, response: bad?.text ?? "", bytes: bad?.text.length ?? 0 },
      { extra: [["Παραγγελία", o.number], ["Βήμα που απέτυχε", bad?.step ?? "πριν από την πρώτη κλήση"], ["Από", staffId ? "χειροκίνητη αποστολή από τη διαχείριση" : "αυτόματη αποστολή"]], blocks: [["Όλα τα βήματα αυτής της προσπάθειας", log.map((x) => `${x.ok ? "OK    " : "ΣΦΑΛΜΑ"} ${x.at}  ${x.step}\n       ${x.text}`).join("\n") || "(κανένα)"]] },
    );
    return { ok: false, message };
  };
  const succeed = async (findoc: number, docNo: string | null, message: string) => {
    await db.erpSync.update({ where: { orderId }, data: { status: "sent", erpDocId: String(findoc), docNo, lastError: null, log: keepLog() } }).catch(() => null);
    const { audit } = await import("@/lib/rbac/audit");
    await audit(staffId ?? null, "order.erp-send", "Order", orderId, null, { findoc, docNo, fincode: o.number, total: expected });
    // μόνο σε χειροκίνητη αποστολή (staffId) — η αυτόματη ήδη έστειλε το email «new» μόλις μπήκε η παραγγελία/πληρώθηκε (TKT-2026-0005: μία φορά ανά παραγγελία)
    if (staffId) void import("@/lib/orders/staff-mail").then((m) => m.sendStaffOrderMail(orderId, "erp")).catch(() => null);
    return { ok: true, message, findoc, docNo };
  };
  // το παραστατικό όπως αποθηκεύτηκε: ο αριθμός του μέσα στο ERP (κωδικός + αύξων της σειράς) και το σύνολό του
  const readBack = async (findoc: number) => {
    // RETAILDOC: η κεφαλίδα λέγεται κι εδώ SALDOC (ίδιοι πίνακες). Παλιές δικές μας εγγραφές (SALDOC, 22–27/11) διαβάζονται κι από εδώ
    const back = await s1Call("getData", { object: ORDER_OBJECT, key: String(findoc), locateinfo: "SALDOC:FINCODE,SERIESNUM,SERIES,TRNDATE,NUM01,SUMAMNT" }).catch((e: Error) => ({ success: false, error: e.message }));
    const h = (back?.data?.SALDOC?.[0] ?? {}) as Record<string, unknown>;
    note(`Ανάγνωση του παραστατικού (getData ${ORDER_OBJECT})`, !!back?.success, back?.success ? { FINDOC: findoc, ...h } : back);
    return { fincode: String(h.FINCODE ?? ""), docNo: erpDocNo(h.FINCODE, h.SERIESNUM), sum: Math.round(Number(h.SUMAMNT ?? NaN) * 100) / 100 };
  };

  // διπλοεγγραφή: αν δεν μπορεί να ελεγχθεί (σφάλμα δικτύου ή αριθμός που δεν μπαίνει σε φίλτρο) δεν στέλνουμε στα τυφλά
  const existing = await findocOf(o.number, o.createdAt, Number(o.total)).catch(() => null);
  note("Έλεγχος διπλοεγγραφής (GetTable FINDOC)", existing != null, existing == null ? "Το SoftOne δεν απάντησε." : existing ? `Υπάρχει ήδη: FINDOC ${existing}.` : "Δεν υπάρχει παραστατικό με αυτόν τον αριθμό παραγγελίας.");
  if (existing == null) return fail("Δεν ήταν δυνατός ο έλεγχος αν η παραγγελία υπάρχει ήδη στο SoftOne — δεν στάλθηκε. Δοκιμάστε ξανά.");
  if (existing) { const b = await readBack(existing); return succeed(existing, b.docNo, `Υπήρχε ήδη στο SoftOne ως παραστατικό ${b.docNo ?? `FINDOC ${existing}`} — δεν στάλθηκε δεύτερη φορά.`); }

  // τιμολόγιο σε ΑΦΜ χωρίς γνωστή καρτέλα: η καρτέλα που βρέθηκε ή άνοιξε μένει στην παραγγελία, ώστε να μην ξαναψαχτεί
  const keepCard = async (trdr: string): Promise<SaldocDoc> => {
    await db.order.update({ where: { id: orderId }, data: { invoice: { ...((o.invoice ?? {}) as Prisma.JsonObject), erpTrdr: trdr } } });
    const d = (await saldocForOrder(orderId))!;
    await db.erpSync.update({ where: { orderId }, data: { payload: d as unknown as Prisma.InputJsonValue } }).catch(() => null);
    return d;
  };
  let card = doc.newCustomer ?? null, cardNote = "";
  if (card) {
    const { findErpCustomerByAfm } = await import("./customers");
    const found = await findErpCustomerByAfm(card.afm).catch(() => undefined);
    note(`Αναζήτηση καρτέλας πελάτη για ΑΦΜ ${card.afm} (GetTable TRDR)`, found !== undefined, found === undefined ? "Το SoftOne δεν απάντησε." : found ? `Βρέθηκε καρτέλα TRDR ${found}.` : "Δεν υπάρχει καρτέλα.");
    if (found === undefined) return fail(`Δεν ήταν δυνατός ο έλεγχος αν ο ΑΦΜ ${card.afm} έχει ήδη καρτέλα πελάτη στο SoftOne — δεν στάλθηκε. Δοκιμάστε ξανά.`);
    if (found) { doc = await keepCard(found); card = null; }
  }

  // πρώτα υπολογισμός χωρίς αποθήκευση: παραστατικό που το SoftOne το βγάζει με άλλο σύνολο (π.χ. 0 €) δεν γράφεται ποτέ στο ERP
  const pre = await checkDoc(card ? await withRetailTrdr(doc) : doc).catch((e: Error) => ({ ok: false, message: `Δεν ήταν δυνατός ο έλεγχος του συνόλου στο SoftOne (${e.message}).` }));
  note(`Υπολογισμός χωρίς αποθήκευση (calculate ${ORDER_OBJECT})`, pre.ok, pre.message);
  if (!pre.ok) return fail(`Δεν στάλθηκε. ${pre.message}`);

  if (card) {
    const made = await (await import("./customers")).createInvoiceCustomer(card);
    note(`Νέα καρτέλα πελάτη για ΑΦΜ ${card.afm} (setData CUSTOMER)`, made.ok, made);
    if (!made.ok) return fail(`Δεν στάλθηκε: η καρτέλα πελάτη για ΑΦΜ ${card.afm} δεν άνοιξε στο SoftOne (${made.error}).`);
    const { audit } = await import("@/lib/rbac/audit");
    await audit(staffId ?? null, "order.erp-customer", "Order", orderId, null, { trdr: made.trdr, code: made.code, afm: card.afm });
    doc = await keepCard(made.trdr);
    cardNote = ` Άνοιξε νέα καρτέλα πελάτη ${made.code} για ΑΦΜ ${card.afm}.`;
  }
  if (!doc.data.SALDOC[0].TRDR) return fail("Δεν στάλθηκε: το παραστατικό έμεινε χωρίς πελάτη.");

  const r = await s1Call("setData", { OBJECT: ORDER_OBJECT, KEY: "", data: doc.data }).catch((e: Error) => ({ success: false, error: e.message }));
  note(`Εγγραφή του παραστατικού (setData ${ORDER_OBJECT})`, !!r?.success, r);
  if (!r?.success) return fail(`Το SoftOne αρνήθηκε το παραστατικό: ${r?.error ?? r?.errorcode ?? "άγνωστο σφάλμα"}`);

  // «επιτυχία» ≠ αποθηκεύτηκε: το παραστατικό διαβάζεται πίσω και με τον αριθμό μας, αν το setData δεν επέστρεψε id
  const findoc = Number(r.id) || (await findocOf(o.number, o.createdAt, Number(o.total)).catch(() => 0)) || 0;
  if (!findoc) return fail("Το SoftOne απάντησε «επιτυχία» αλλά το παραστατικό δεν βρίσκεται — έλεγξε στο ERP πριν ξαναστείλεις.");
  let { docNo, sum, fincode } = await readBack(findoc);
  // το SoftOne μπορεί να βάλει σκέτο τον κωδικό της σειράς («PES», δοκιμή SALDOC 23/11/2026): ξαναγράφεται μόνο η κεφαλίδα,
  // χωρίς γραμμές (γραμμές που λείπουν από ενημέρωση θα σβήνονταν). Αποτυχία εδώ δεν ακυρώνει το παραστατικό που γράφτηκε
  const want = pesCode(o.number);
  if (want && fincode !== want) {
    const u = await s1Call("setData", { OBJECT: ORDER_OBJECT, KEY: String(findoc), data: { SALDOC: [{ FINCODE: want }] } }).catch((e: Error) => ({ success: false, error: e.message }));
    note(`Διόρθωση FINCODE σε «${want}» (setData ${ORDER_OBJECT})`, !!u?.success, u);
    if (u?.success) ({ docNo, sum, fincode } = await readBack(findoc));
  }
  const name = docNo ?? `FINDOC ${findoc}`;
  const eurS = (n: number) => n.toLocaleString("el-GR", { style: "currency", currency: "EUR" });
  if (Number.isFinite(sum) && sum !== doc.totals.expected) return succeed(findoc, docNo, `Στάλθηκε ως παραστατικό ${name}, αλλά το σύνολό του είναι ${eurS(sum)} ενώ η παραγγελία ${eurS(doc.totals.expected)} — έλεγξέ το στο ERP.${cardNote}`);
  return succeed(findoc, docNo, `Στάλθηκε στο SoftOne ως παραστατικό ${name}${Number.isFinite(sum) ? ` (${eurS(sum)})` : ""}.${cardNote}`);
}

/** Αυτόματη αποστολή μόλις η παραγγελία είναι πληρωμένη/καταχωρημένη, όταν ο διακόπτης είναι σε «Αποστολή». Σιωπηλή: η αποτυχία μένει στο ErpSync. */
export async function maybeSendSaldoc(orderId: string) {
  if (await orderSendBlock()) return;
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
  if (!doc.newCustomer) return checkDoc(doc);
  const r = await checkDoc(await withRetailTrdr(doc));
  return { ok: r.ok, message: `${r.message} Ο υπολογισμός έγινε με τον πελάτη λιανικής: η καρτέλα του ΑΦΜ ${doc.newCustomer.afm} ανοίγει με την αποστολή.` };
}

/** Το ίδιο παραστατικό με τον πελάτη λιανικής στη θέση της καρτέλας που δεν υπάρχει ακόμη — ΜΟΝΟ για υπολογισμό (ίδιο καθεστώς ΦΠΑ). */
async function withRetailTrdr(doc: SaldocDoc): Promise<SaldocDoc> {
  const trdr = Number((await saldocSettings()).retailTrdr?.trim() || DEFAULT_RETAIL_TRDR);
  return { ...doc, data: { ...doc.data, SALDOC: [{ ...doc.data.SALDOC[0], TRDR: trdr }] } };
}

async function checkDoc(doc: SaldocDoc): Promise<{ ok: boolean; message: string }> {
  const { s1 } = await import("@/lib/softone");
  const r = await s1("calculate", { OBJECT: ORDER_OBJECT, KEY: "", LOCATEINFO: "SALDOC:SUMAMNT,NETAMNT,VATAMNT;ITELINES:MTRL,QTY1,PRICE,LINEVAL,VATAMNT", data: doc.data });
  if (!r?.success) return { ok: false, message: `Το SoftOne απέρριψε το παραστατικό: ${r?.error ?? r?.errorcode ?? "άγνωστο σφάλμα"}` };
  const h = (r.data?.SALDOC?.[0] ?? {}) as Record<string, unknown>;
  const sum = Math.round(Number(h.SUMAMNT ?? NaN) * 100) / 100;
  if (!Number.isFinite(sum)) return { ok: false, message: "Το SoftOne δεν επέστρεψε σύνολο." };
  const eurS = (n: number) => n.toLocaleString("el-GR", { style: "currency", currency: "EUR" });
  return sum === doc.totals.expected
    ? { ok: true, message: `Το SoftOne υπολογίζει ${eurS(sum)} (καθαρή αξία ${eurS(Number(h.NETAMNT))}, ΦΠΑ ${eurS(Number(h.VATAMNT))}) — ίδιο με την παραγγελία. Τίποτα δεν αποθηκεύτηκε.` }
    : { ok: false, message: `Το SoftOne υπολογίζει ${eurS(sum)} ενώ η παραγγελία είναι ${eurS(doc.totals.expected)}. Τίποτα δεν αποθηκεύτηκε.` };
}
