import "server-only";
import { db } from "@/lib/db";
import { emailCtx, money } from "@/lib/email/layout";
import { renderStaffOrder, type StaffEvent, type StaffOrderData } from "@/lib/email/staff-order";
import { sendMail } from "@/lib/email/send";
import { payLabel } from "@/lib/account/labels";
import { carrierDef } from "@/lib/shipping/carriers";
import { S1_SERVICE_MTRL } from "@/lib/softone/order-doc-core";
import { trackUrl } from "@/lib/couriers/timeline-model";
import { MODE_LABEL } from "@/lib/delivery/routing";
import { ERP_STATUS, FULFILMENT, PAYMENT_STATUS, statusLabel } from "./model";

/**
 * Πλήρης ανάλυση κάθε παραγγελίας στο προσωπικό, χτισμένη από ό,τι ισχύει στη βάση τη στιγμή της αποστολής. Φεύγει:
 * νέα παραγγελία (ή μόλις πληρωθεί, για κάρτα/Klarna) · έκδοση voucher · καταχώρηση στο SoftOne · νέο παραστατικό στην
 * πορεία της. Κάθε μήνυμα είναι ολόκληρο (όχι «τι άλλαξε»), ώστε το τελευταίο να αρκεί για τη διαχείριση.
 * Παραλήπτης: info@euronics.gr· `ORDER_STAFF_EMAIL` στο περιβάλλον τον αλλάζει, κενό = καμία αποστολή (π.χ. τοπικές δοκιμές).
 */
const staffTo = () => (process.env.ORDER_STAFF_EMAIL ?? "info@euronics.gr").trim();

const SHIP_STATUS: Record<string, string> = { created: "Εκδόθηκε", closed: "Παραδόθηκε στον courier", "in-transit": "Σε μεταφορά", "out-for-delivery": "Σε διανομή", attempted: "Απόπειρα παράδοσης", "on-hold": "Σε αναμονή", returning: "Επιστρέφει", returned: "Επιστράφηκε", delivered: "Παραδόθηκε", cancelled: "Ακυρώθηκε" };
const dmy = (d: string) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "");
const n = (d: unknown) => Number(d ?? 0);

// κωδικός και επωνυμία πελάτη στο SoftOne ανά TRDR: αλλάζουν σπάνια, μία ανάγνωση ανά διεργασία
const trdrMem = new Map<string, string>();
async function trdrLabel(trdr: string, known?: string | null): Promise<string> {
  if (known) return `Κωδικός ${known} (TRDR ${trdr})`;
  if (!/^\d+$/.test(trdr)) return `TRDR ${trdr}`;
  const hit = trdrMem.get(trdr);
  if (hit) return hit;
  const row = await import("@/lib/softone/lookups").then((m) => m.getTable("TRDR", ["CODE", "NAME"], `TRDR=${trdr}`)).then((r) => r[0]).catch(() => null);
  if (!row?.[0]) return `TRDR ${trdr} (ο κωδικός δεν διαβάστηκε από το SoftOne)`;
  const label = `Κωδικός ${row[0]} · ${row[1]} (TRDR ${trdr})`;
  trdrMem.set(trdr, label);
  return label;
}

export async function staffOrderData(orderId: string, event: StaffEvent): Promise<StaffOrderData | null> {
  const o = await db.order.findUnique({
    where: { id: orderId },
    select: {
      number: true, createdAt: true, status: true, fulfilment: true, shipping: true, invoice: true, subtotal: true, shippingFee: true, vat: true, total: true, discountTotal: true, couponCode: true, promoTrace: true, paymentMethod: true, guestEmail: true,
      customer: { select: { email: true, firstName: true, lastName: true, phone: true, erpTrdr: true, erpCode: true } },
      pickupStore: { select: { name: true, address: true, zip: true, city: true, phone: true } },
      payment: { select: { method: true, instalments: true, status: true, psp: true, pspRef: true } },
      lines: { orderBy: { id: "asc" }, select: { title: true, qty: true, unitPrice: true, listPrice: true, discPrice: true, discCoupon: true, discPayment: true, lineTotal: true, erpCode: true, isGift: true, promotions: true, setParts: true, addons: { select: { price: true, service: { select: { title: true, slug: true } } } } } },
      shipments: { orderBy: { createdAt: "asc" }, select: { id: true, carrier: true, env: true, voucher: true, subVouchers: true, pieces: true, weightKg: true, codAmount: true, status: true, liveUrl: true } },
      erpSync: { select: { status: true, erpDocId: true, lastError: true } },
      erpStages: { orderBy: { seenAt: "asc" }, select: { docNo: true, docDate: true, fprms: true } },
      route: { select: { mode: true, reason: true, cost: true, partner: { select: { name: true } }, agency: { select: { name: true } }, carrier: { select: { name: true } } } },
    },
  });
  if (!o) return null;
  const ctx = await emailCtx();
  const s = (o.shipping ?? {}) as { firstName?: string; lastName?: string; email?: string; phone?: string; street?: string; number?: string; floor?: string; zip?: string; city?: string; region?: string; notes?: string; carrierName?: string; slots?: string[]; calc?: string[]; locker?: { name?: string; address?: string; zip?: string } };
  const inv = (o.invoice ?? null) as { vatNumber?: string; doy?: string; company?: string } | null;
  const total = n(o.total), pay = o.payment?.method ?? o.paymentMethod ?? "", payStatus = o.payment?.status ?? "pending";
  const name = [s.firstName ?? o.customer?.firstName, s.lastName ?? o.customer?.lastName].filter(Boolean).join(" ");
  const phone = s.phone ?? o.customer?.phone ?? null, email = s.email ?? o.customer?.email ?? o.guestEmail ?? null;
  const how = [FULFILMENT[o.fulfilment as keyof typeof FULFILMENT] ?? o.fulfilment, o.fulfilment === "click-collect" ? o.pickupStore?.name : s.carrierName].filter(Boolean).join(" — ");
  const collect = pay === "cod" ? "Εισπράττεται στην παράδοση" : pay === "store" ? "Εισπράττεται στο κατάστημα" : null;

  // το παραστατικό όπως θα πάει (ή πήγε) στο SoftOne: πελάτης, ό,τι λείπει, παρατηρήσεις — και η πορεία του αν έχει σταλεί
  const doc = await import("@/lib/softone/order-doc").then((m) => m.saldocForOrder(orderId)).catch(() => null);
  const head = (doc?.data.SALDOC[0] ?? {}) as { TRDR?: number | null; SERIES?: number; REMARKS?: string };
  const erpCustomer = head.TRDR ? await trdrLabel(String(head.TRDR), o.customer?.erpTrdr === String(head.TRDR) ? o.customer.erpCode : null) : "Δεν έχει καρτέλα στο SoftOne ακόμη (τιμολόγιο σε νέο ΑΦΜ)";
  const chain = o.erpSync?.erpDocId ? await import("@/lib/softone/order-chain").then((m) => m.orderChain(orderId)).catch(() => null) : null;
  const docs = chain?.ok
    ? chain.nodes.map((x) => ({ no: x.fincode || `FINDOC ${x.findoc}`, type: x.typeName ?? x.seriesName ?? `σειρά ${x.series}`, date: dmy(x.date), total: x.total }))
    : o.erpStages.map((x) => ({ no: x.docNo ?? "—", type: x.fprms ? `τύπος ${x.fprms}` : "—", date: dmy(x.docDate ?? ""), total: null }));

  const active = o.shipments.filter((x) => x.status !== "cancelled" && x.voucher);
  // τι κάνει το προσωπικό τώρα: ένα βήμα, σε απλά ελληνικά
  const next: StaffOrderData["next"] =
    o.status === "cancelled" ? { tone: "danger", text: "Η παραγγελία έχει ακυρωθεί. Μην την εκτελέσεις." }
    : pay === "later" ? { tone: "warning", text: "Περιοχή χωρίς τιμή αποστολής: κάλεσε τον πελάτη για τα μεταφορικά και τον τρόπο πληρωμής πριν από οτιδήποτε άλλο." }
    : pay === "bank" && payStatus !== "paid" ? { tone: "warning", text: `Περίμενε την κατάθεση ${money(total)} (αιτιολογία ${o.number}). Μην στείλεις πριν επιβεβαιωθεί.` }
    : !collect && payStatus !== "paid" ? { tone: "danger", text: `Η πληρωμή δεν έχει ολοκληρωθεί (${PAYMENT_STATUS[payStatus]?.label ?? payStatus}). Μην στείλεις πριν πληρωθεί.` }
    : active.length ? { tone: "success", text: `Το voucher ${active[active.length - 1].voucher} εκδόθηκε: τύπωσε την ετικέτα και παράδωσε το δέμα στον courier.${collect ? ` Ο courier εισπράττει ${money(total)}.` : ""}` }
    : o.fulfilment === "click-collect" ? { tone: "info", text: `Ετοίμασε την παραγγελία για παραλαβή από ${o.pickupStore?.name ?? "το κατάστημα"}.${collect ? ` Ο πελάτης πληρώνει ${money(total)} στο κατάστημα.` : " Είναι ήδη πληρωμένη."}` }
    : o.fulfilment === "courier" ? { tone: "info", text: `Ετοίμασε το δέμα και βγάλε voucher (${s.carrierName ?? "courier"}).${collect ? ` Ο courier εισπράττει ${money(total)} από τον πελάτη.` : " Είναι ήδη πληρωμένη."}` }
    : { tone: "info", text: `Κανόνισε την παράδοση (${how}): κάλεσε τον πελάτη για ημέρα και ώρα.${collect ? ` Εισπράττονται ${money(total)} στην παράδοση.` : " Είναι ήδη πληρωμένη."}` };

  const lines: StaffOrderData["lines"] = o.lines.flatMap((l) => {
    const disc = n(l.discPrice) + n(l.discCoupon) + n(l.discPayment), list = n(l.listPrice ?? l.unitPrice);
    const promos = ((l.promotions ?? []) as { code?: string; label?: string; amount?: number }[]).map((p) => `Προσφορά ${[p.code, p.label].filter(Boolean).join(" · ")}`);
    const parts = ((l.setParts ?? []) as { mtrl: number; qty: number; name: string }[]).map((p) => `Μέλος σετ: ${p.qty}× ${p.name} (είδος ${p.mtrl})`);
    return [
      { code: l.erpCode, title: l.title, qty: l.qty, list, discount: disc, total: n(l.lineTotal ?? n(l.unitPrice) * l.qty), notes: [l.isGift ? "ΔΩΡΟ προσφοράς (έκπτωση 100 %)" : null, n(l.discCoupon) ? `Κουπόνι: −${money(n(l.discCoupon))}` : null, n(l.discPayment) ? `Έκπτωση τρόπου πληρωμής: −${money(n(l.discPayment))}` : null, ...promos, ...parts].filter(Boolean) as string[] },
      ...l.addons.map((a) => ({ code: S1_SERVICE_MTRL[a.service.slug] ?? null, title: a.service.title, qty: 1, list: n(a.price), discount: 0, total: n(a.price), notes: [`Υπηρεσία της γραμμής «${l.title}»`] })),
    ];
  });

  const base = ctx.assetUrl, enc = encodeURIComponent;
  return {
    event, number: o.number, adminUrl: `${base}/admin/orders/${enc(o.number)}`, summary: [money(total), how, payLabel(pay)].join(" · "), next,
    order: [["Αριθμός", o.number], ["Ημερομηνία", o.createdAt.toLocaleString("el-GR", { timeZone: "Europe/Athens", dateStyle: "short", timeStyle: "short" })], ["Κατάσταση", statusLabel(o.status)]],
    customer: [
      ["Ονοματεπώνυμο", name || "—"], ["Τηλέφωνο", phone ?? "—"], ["Email", email ?? "—"], ["Λογαριασμός", o.customer ? "Εγγεγραμμένος πελάτης" : "Αγορά ως επισκέπτης"],
      ["Παραστατικό", inv?.vatNumber ? `Τιμολόγιο: ${[inv.company, `ΑΦΜ ${inv.vatNumber}`, inv.doy ? `ΔΟΥ ${inv.doy}` : null].filter(Boolean).join(" · ")}` : "Απόδειξη λιανικής"],
      ["Πελάτης στο SoftOne", erpCustomer],
    ],
    lines,
    totals: [
      ["Αξία προϊόντων και υπηρεσιών", n(o.subtotal)],
      ...(n(o.discountTotal) ? [[`Εκπτώσεις${o.couponCode ? ` (κουπόνι ${o.couponCode})` : ""}`, `−${money(n(o.discountTotal))}`] as [string, string]] : []),
      [pay === "later" ? "Μεταφορικά (κατόπιν συνεννόησης, δεν έχουν μπει)" : `Μεταφορικά${pay === "cod" ? " και αντικαταβολή" : ""}`, n(o.shippingFee)],
      ["Από το σύνολο, ΦΠΑ", n(o.vat)],
    ],
    total,
    promos: ((o.promoTrace ?? []) as { code?: string; name?: string; applied?: boolean; amount?: number; reason?: string | null }[]).map((t) => `${t.applied ? "Εφαρμόστηκε" : "Δεν εφαρμόστηκε"}: ${[t.code, t.name ? `«${t.name}»` : null].filter(Boolean).join(" ")}${t.applied && t.amount ? ` −${money(t.amount / 100)}` : ""}${!t.applied && t.reason ? ` (${t.reason})` : ""}`),
    payment: [
      ["Τρόπος", `${payLabel(pay)}${(o.payment?.instalments ?? 1) > 1 ? ` σε ${o.payment!.instalments} δόσεις` : ""}`],
      ["Κατάσταση", PAYMENT_STATUS[payStatus]?.label ?? payStatus],
      ...(collect && payStatus !== "paid" ? [[collect, money(total)] as [string, string]] : []),
      ...(o.payment?.pspRef ? [["Συναλλαγή", [o.payment.psp, o.payment.pspRef].filter(Boolean).join(" ")] as [string, string]] : []),
    ],
    shipping: [
      ["Τρόπος", how],
      [o.fulfilment === "click-collect" ? "Παραλαμβάνει" : "Παραλήπτης", [name, phone ? `τηλ. ${phone}` : null].filter(Boolean).join(", ") || "—"],
      o.fulfilment === "click-collect" && o.pickupStore ? ["Κατάστημα παραλαβής", [o.pickupStore.name, o.pickupStore.address, [o.pickupStore.zip, o.pickupStore.city].filter(Boolean).join(" "), o.pickupStore.phone ? `τηλ. ${o.pickupStore.phone}` : null].filter(Boolean).join(", ")]
        : s.locker ? ["Θυρίδα BOX NOW", [s.locker.name, s.locker.address, s.locker.zip].filter(Boolean).join(", ")]
        : ["Διεύθυνση", [[s.street, s.number].filter(Boolean).join(" "), s.floor ? `${s.floor}ος όροφος` : null, [s.zip, s.city].filter(Boolean).join(" "), s.region].filter(Boolean).join(", ") || "—"],
      ...(s.slots?.length ? [["Ώρες που βολεύουν τον πελάτη για τηλέφωνο", s.slots.join(", ")] as [string, string]] : []),
      ...(s.notes ? [["Σημειώσεις πελάτη", s.notes] as [string, string]] : []),
      ...(o.route ? [["Δρομολόγηση", [MODE_LABEL[o.route.mode as keyof typeof MODE_LABEL] ?? o.route.mode, o.route.partner?.name ?? o.route.agency?.name ?? o.route.carrier?.name, o.route.reason, o.route.cost != null ? `κόστος για εμάς ${money(n(o.route.cost))}` : null].filter(Boolean).join(" · ")] as [string, string]] : []),
    ],
    calc: s.calc ?? [],
    vouchers: o.shipments.filter((x) => x.voucher).map((x) => {
      const courierUrl = x.liveUrl ?? trackUrl(x.carrier, x.voucher!);
      return {
        title: `${carrierDef(x.carrier)?.name ?? x.carrier} · voucher ${x.voucher}${x.env === "test" ? " (ΔΟΚΙΜΑΣΤΙΚΟ περιβάλλον courier)" : ""}`,
        rows: [["Κατάσταση", SHIP_STATUS[x.status] ?? x.status], ["Τεμάχια / βάρος", `${x.pieces} τεμ. · ${String(n(x.weightKg)).replace(".", ",")} κιλά${x.subVouchers.length ? ` · επιπλέον vouchers: ${x.subVouchers.join(", ")}` : ""}`], ["Αντικαταβολή στο voucher", n(x.codAmount) ? money(n(x.codAmount)) : "όχι"]] as [string, string][],
        links: [
          ...(x.status === "cancelled" ? [] : [["Εκτύπωση ετικέτας (PDF, θέλει σύνδεση στη διαχείριση)", `${base}/api/admin/shipments/label?ids=${enc(x.id)}`] as [string, string]]),
          ...(courierUrl ? [["Παρακολούθηση στον courier", courierUrl] as [string, string]] : []),
          ["Σελίδα παρακολούθησης του πελάτη", `${ctx.baseUrl}/entopismos?no=${enc(o.number)}`],
        ],
      };
    }),
    erp: {
      rows: [
        ["Κατάσταση", o.erpSync ? `${ERP_STATUS[o.erpSync.status]?.label ?? o.erpSync.status}${o.erpSync.lastError ? ` — ${o.erpSync.lastError}` : ""}` : "Δεν στέλνεται στο SoftOne (ανενεργό στις ρυθμίσεις)"],
        ["Παραστατικό παραγγελίας", `${o.erpSync?.erpDocId ? `FINDOC ${o.erpSync.erpDocId}` : "δεν έχει καταχωρηθεί ακόμη"} · σειρά ${head.SERIES ?? "—"}, αριθμός ${o.number}`],
        ["Πελάτης", erpCustomer],
      ],
      docs, needs: doc?.needs ?? [], remarks: head.REMARKS ?? null,
    },
  };
}

export async function sendStaffOrderMail(orderId: string, event: StaffEvent) {
  const to = staffTo();
  if (!to) return;
  const d = await staffOrderData(orderId, event);
  if (!d) return;
  await sendMail({ to, template: "staff-order", meta: { orderId, event }, ...renderStaffOrder(d, await emailCtx()) });
}
