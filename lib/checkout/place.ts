import "server-only";
import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCustomerSession } from "@/lib/account/session";
import { currentCart, publicQuote, quoteCart } from "@/lib/cart/server";
import { invalidatePromos } from "@/lib/promo/server";
import { getServiceList } from "@/lib/services/catalog";
import { buildSaldoc } from "@/lib/softone/order-doc";
import { getSetting } from "@/lib/settings/store";
import { renderTemplate } from "@/lib/email/templates";
import { sendMail } from "@/lib/email/send";
import { carrierDef } from "@/lib/shipping/carriers";
import { isVivaPay } from "@/lib/payments/viva-core";
import { vivaConfig } from "@/lib/payments/viva";
import { paymentPagePath, startVivaPayment } from "@/lib/payments/order-payment";

/**
 * Ολοκλήρωση παραγγελίας. Ο server ξαναϋπολογίζει ΤΑ ΠΑΝΤΑ από την αρχή (τιμές, προσφορές, κουπόνι, μεταφορικά) — ο
 * browser στέλνει μόνο στοιχεία πελάτη και επιλογές. Σε μία συναλλαγή: παραγγελία + γραμμές με εκπτώσεις ανά είδος,
 * πληρωμή, χρήσεις προσφορών με ΑΤΟΜΙΚΟΥΣ μετρητές (δεν ξεπερνιέται όριο χρήσεων / budget σε ταυτόχρονες παραγγελίες),
 * κουπόνι, παραστατικό SoftOne σε «προεπισκόπηση», άδειασμα καλαθιού.
 * dryRun: όλα εκτελούνται και στο τέλος αναιρούνται — για δοκιμή χωρίς να μείνει παραγγελία στη βάση.
 */

export interface PlaceInput {
  contact: { firstName: string; lastName: string; email: string; phone: string };
  address?: { street?: string; number?: string; floor?: string; city?: string; zip?: string; region?: string; notes?: string };
  invoice?: { vatNumber: string; company?: string; doy?: string; activity?: string } | null;
  fulfilment: "courier" | "click-collect" | "appointment";
  storeId?: string | null;
  /** ο courier (lib/shipping/carriers) και, για BOX NOW, η θυρίδα που διάλεξε ο πελάτης στον χάρτη */
  carrier?: string | null;
  locker?: { id: string; name?: string; address?: string; zip?: string } | null;
  payment: string; instalments?: number;
  coupon?: string | null;
  terms: boolean; newsletter?: boolean;
  /** το σύνολο που είδε ο πελάτης (λεπτά): αν άλλαξε στο μεταξύ, δεν χρεώνουμε σιωπηλά διαφορετικό ποσό */
  expectedTotal?: number;
  dryRun?: boolean;
}

class Abort extends Error { constructor(public reason: string) { super(reason); } }
const eur = (c: number) => new Prisma.Decimal((c / 100).toFixed(2));

function validate(i: PlaceInput): string | null {
  if (!i.terms) return "Χρειάζεται η αποδοχή των όρων.";
  if (!i.contact?.firstName?.trim() || !i.contact?.lastName?.trim()) return "Συμπλήρωσε όνομα και επώνυμο.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.contact.email ?? "")) return "Το email δεν φαίνεται σωστό.";
  if (!/^\d{10}$/.test((i.contact.phone ?? "").replace(/\s/g, ""))) return "Το τηλέφωνο θέλει 10 ψηφία.";
  if (!["courier", "click-collect", "appointment"].includes(i.fulfilment)) return "Διάλεξε τρόπο παράδοσης.";
  const toLocker = i.fulfilment === "courier" && carrierDef(i.carrier)?.kind === "locker";
  if (toLocker && !i.locker?.id) return "Διάλεξε θυρίδα BOX NOW στον χάρτη.";
  if (i.fulfilment !== "click-collect" && !toLocker && !/^\d{5}$/.test(i.address?.zip ?? "")) return "Ο ΤΚ θέλει 5 ψηφία.";
  if (i.fulfilment === "click-collect" && !i.storeId) return "Διάλεξε κατάστημα παραλαβής.";
  if (i.invoice && !/^\d{9}$/.test(i.invoice.vatNumber ?? "")) return "Ο ΑΦΜ θέλει 9 ψηφία.";
  return null;
}

export async function placeOrder(input: PlaceInput) {
  const bad = validate(input);
  if (bad) return { ok: false as const, error: bad };
  const me = await getCustomerSession();
  const email = (me?.email ?? input.contact.email).trim().toLowerCase();
  const cart = await currentCart(false);
  if (!cart?.lines.length) return { ok: false as const, error: "Το καλάθι είναι άδειο." };
  const zip = carrierDef(input.carrier)?.kind === "locker" ? input.locker?.zip ?? input.address?.zip ?? null : input.address?.zip ?? null;
  const q = await quoteCart({ coupon: input.coupon, payment: input.payment, delivery: input.fulfilment, storeId: input.storeId ?? null, zip, email, carrier: input.carrier ?? null }, cart);
  // ο courier που χρεώθηκε· αν ο πελάτης διάλεξε κάποιον που δεν ισχύει (π.χ. ASAP εκτός Αττικής), δεν αλλάζουμε σιωπηλά
  if (input.fulfilment === "courier" && !q.bulky.courier) return { ok: false as const, error: `${q.bulky.titles[0] ?? "Μια συσκευή"} δεν αποστέλλεται με courier. Διάλεξε «Με ραντεβού» ή «Παραλαβή από κατάστημα».`, quote: publicQuote(q) };
  if (input.fulfilment === "courier" && q.carriers.length && input.carrier && q.carrier !== input.carrier) return { ok: false as const, error: `Ο courier «${carrierDef(input.carrier)?.name ?? input.carrier}» δεν είναι διαθέσιμος για αυτή τη διεύθυνση. Διάλεξε άλλον.`, quote: publicQuote(q) };
  const lockerAt = input.fulfilment === "courier" && carrierDef(q.carrier)?.kind === "locker" ? input.locker ?? null : null;
  const carrier = input.fulfilment === "courier" && q.carrier ? { carrier: q.carrier, carrierName: carrierDef(q.carrier)!.name, ...(carrierDef(q.carrier)!.kind === "locker" && input.locker ? { locker: input.locker } : {}) } : {};
  if (!q.lines.length) return { ok: false as const, error: "Τα προϊόντα του καλαθιού δεν είναι πια διαθέσιμα." };
  if (input.expectedTotal != null && input.expectedTotal !== q.total) return { ok: false as const, changed: true, error: "Το σύνολο άλλαξε (τιμή ή προσφορά). Δες το νέο ποσό πριν συνεχίσεις.", quote: publicQuote(q) };
  if (input.coupon && !q.coupon.applied) return { ok: false as const, error: q.coupon.message ?? "Το κουπόνι δεν ισχύει.", quote: publicQuote(q) };

  // όροι και έκδοση κάθε προσφοράς που εφαρμόστηκε (για το παραστατικό και το reporting)
  const appliedIds = [...new Set([...q.engine.lines.flatMap((l) => l.adjustments.map((a) => a.promotionId)), ...q.gifts.map((g) => g.promotionId), ...q.lines.flatMap((l) => l.addons.flatMap((a) => (a.free ? [a.free.promotionId] : []))), ...(q.freeShipping ? [q.freeShipping.promotionId] : [])])];
  const promoRows = appliedIds.length ? await db.promotion.findMany({ where: { id: { in: appliedIds } }, select: { id: true, termsText: true, code: true, version: true } }) : [];
  const termsOf = new Map(promoRows.map((p) => [p.id, p.termsText]));
  const services = await getServiceList();
  const svcBySlug = new Map(services.map((s) => [s.slug, s]));
  const usedSlugs = [...new Set(q.lines.flatMap((l) => l.addons.map((a) => a.slug)))];

  // online πληρωμή μέσω Viva: η παραγγελία περιμένει την πληρωμή (χωρίς email, χωρίς ERP μέχρι να πληρωθεί)
  const viva = isVivaPay(input.payment) && !input.dryRun ? await vivaConfig() : null;
  let number = "";
  try {
    const result = await db.$transaction(async (tx) => {
      // οι υπηρεσίες ζουν στον κατάλογο υπηρεσιών· γράφονται στη βάση την πρώτη φορά που χρειάζονται σε παραγγελία
      const svcIds = new Map<string, string>();
      for (const slug of usedSlugs) {
        const s = svcBySlug.get(slug)!;
        const row = await tx.service.upsert({ where: { slug }, update: {}, create: { slug, no: services.indexOf(s) + 1, title: s.title, blurb: s.blurb ?? s.title, priceFrom: s.priceFrom != null ? new Prisma.Decimal(s.priceFrom) : null, addonAt: (s.addonAt ?? []) as Prisma.InputJsonValue } });
        svcIds.set(slug, row.id);
      }
      for (let i = 0; i < 5 && !number; i++) {
        const n = `EUR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(randomInt(1000, 9999))}`;
        if (!(await tx.order.findUnique({ where: { number: n }, select: { id: true } }))) number = n;
      }
      if (!number) throw new Abort("Δεν δημιουργήθηκε αριθμός παραγγελίας. Δοκίμασε ξανά.");
      const discountTotal = q.discPrice + q.discCoupon + q.discPayment;
      const order = await tx.order.create({
        data: {
          number, customerId: me?.id ?? null, guestEmail: me ? null : email, status: "pending", fulfilment: input.fulfilment, pickupStoreId: input.fulfilment === "click-collect" ? input.storeId : null,
          shipping: { ...input.contact, ...input.address, ...carrier } as Prisma.InputJsonValue, invoice: input.invoice ? (input.invoice as Prisma.InputJsonValue) : undefined,
          subtotal: eur(q.goods + q.addons), shippingFee: eur(q.shipping + q.codFee), vat: eur(q.vat), total: eur(q.total), discountTotal: eur(discountTotal),
          couponCode: q.coupon.applied, paymentMethod: input.payment,
          promoTrace: q.trace.map((t) => ({ code: t.code, name: t.name, applied: t.applied, amount: t.amount, reason: t.reason })) as Prisma.InputJsonValue,
          payment: { create: { method: input.payment, instalments: Math.max(1, input.instalments ?? 1), ...(viva ? { psp: "viva" } : {}) } },
        },
      });
      for (const l of q.engine.lines) {
        const info = q.lines.find((x) => x.key === l.key)!;
        const ol = await tx.orderLine.create({
          data: {
            orderId: order.id, variantId: l.variantId, title: `${info.brand} ${info.title}`, qty: l.qty, unitPrice: eur(l.unitFinal), listPrice: eur(l.unit),
            discPrice: eur(l.discPrice), discCoupon: eur(l.discCoupon), discPayment: eur(l.discPayment), lineTotal: eur(l.total), erpCode: info.erpCode,
            promotions: l.adjustments.map((a) => ({ promotionId: a.promotionId, code: a.code, version: a.version, kind: a.kind, amount: a.amount, label: a.label })) as Prisma.InputJsonValue,
            addons: info.addons.length ? { create: info.addons.map((a) => ({ serviceId: svcIds.get(a.slug)!, price: eur(a.price * l.qty) })) } : undefined,
          },
        });
        for (const a of l.adjustments) await tx.promotionUsage.create({ data: { promotionId: a.promotionId, version: a.version, orderId: order.id, orderLineId: ol.id, customerId: me?.id ?? null, email, couponCode: a.kind === "coupon" ? q.coupon.applied : null, amount: eur(a.amount) } });
      }
      // ατομικοί μετρητές: μία χρήση ανά παραγγελία, ποσό = όλη η έκπτωση / αξία που δόθηκε· αν τελείωσε στο μεταξύ, αναίρεση όλων
      const perPromo = new Map<string, number>();
      for (const l of q.engine.lines) for (const a of l.adjustments) perPromo.set(a.promotionId, (perPromo.get(a.promotionId) ?? 0) + a.amount);
      // δώρα: γραμμή με την αξία τους και έκπτωση 100 %
      for (const g of q.gifts) {
        const gl = await tx.orderLine.create({ data: { orderId: order.id, variantId: g.variantId, title: `${g.brand} ${g.title}`, qty: g.qty, unitPrice: eur(0), listPrice: eur(g.value / g.qty), discPrice: eur(g.value), lineTotal: eur(0), erpCode: g.erpCode, isGift: true, promotions: [{ promotionId: g.promotionId, code: g.code, version: g.version, kind: "gift", amount: g.value, label: g.label }] as Prisma.InputJsonValue } });
        await tx.promotionUsage.create({ data: { promotionId: g.promotionId, version: g.version, orderId: order.id, orderLineId: gl.id, customerId: me?.id ?? null, email, amount: eur(g.value) } });
        perPromo.set(g.promotionId, (perPromo.get(g.promotionId) ?? 0) + g.value);
      }
      // δωρεάν υπηρεσίες: η αξία τους μετρά στο budget της προσφοράς
      for (const l of q.lines) for (const a of l.addons) if (a.free) {
        const v = a.value * l.qty;
        await tx.promotionUsage.create({ data: { promotionId: a.free.promotionId, version: a.free.version, orderId: order.id, customerId: me?.id ?? null, email, amount: eur(v) } });
        perPromo.set(a.free.promotionId, (perPromo.get(a.free.promotionId) ?? 0) + v);
      }
      if (q.freeShipping) {
        await tx.promotionUsage.create({ data: { promotionId: q.freeShipping.promotionId, version: q.freeShipping.version, orderId: order.id, customerId: me?.id ?? null, email, amount: eur(q.freeShipping.saved) } });
        perPromo.set(q.freeShipping.promotionId, (perPromo.get(q.freeShipping.promotionId) ?? 0) + q.freeShipping.saved);
      }
      for (const [id, amt] of perPromo) {
        const n = await tx.$executeRaw`UPDATE "Promotion" SET "usedCount" = "usedCount" + 1, "spentEur" = "spentEur" + ${amt / 100} WHERE id = ${id} AND ("maxUses" IS NULL OR "usedCount" < "maxUses") AND ("budgetEur" IS NULL OR "spentEur" + ${amt / 100} <= "budgetEur")`;
        if (n !== 1) { const p = promoRows.find((x) => x.id === id); throw new Abort(`Η προσφορά ${p?.code ?? ""} μόλις εξαντλήθηκε. Δες το νέο σύνολο.`); }
      }
      if (q.coupon.applied) {
        const n = await tx.$executeRaw`UPDATE "Coupon" SET "usedCount" = "usedCount" + 1 WHERE code = ${q.coupon.applied} AND ("maxUses" IS NULL OR "usedCount" < "maxUses")`;
        if (n !== 1) throw new Abort("Το κουπόνι μόλις χρησιμοποιήθηκε. Δοκίμασε χωρίς αυτό.");
      }
      // παραστατικό SoftOne: χτίζεται πάντα, αποθηκεύεται σε «προεπισκόπηση» — καμία κλήση στο ERP από εδώ
      const doc = await buildSaldoc({
        number, customerTrdr: me ? ((await tx.customer.findUnique({ where: { id: me.id }, select: { erpTrdr: true } }))?.erpTrdr ?? null) : null, email, fulfilment: input.fulfilment, payment: input.payment,
        lines: q.engine.lines.map((l) => { const info = q.lines.find((x) => x.key === l.key)!; return { erpCode: info.erpCode, title: info.title, qty: l.qty, listPrice: l.unit / 100, discPrice: l.discPrice / 100, discCoupon: l.discCoupon / 100, discPayment: l.discPayment / 100, isGift: false, promotions: l.adjustments.map((a) => ({ code: a.code, version: a.version, kind: a.kind, label: a.label })), terms: l.adjustments.map((a) => termsOf.get(a.promotionId)).filter(Boolean).join(" · ") || null }; }),
        services: q.lines.flatMap((l) => l.addons.map((a) => ({ slug: a.slug, title: a.title, price: (a.value * l.qty) / 100, discount: a.free ? (a.value * l.qty) / 100 : 0, promo: a.free ? `${a.free.code} v${a.free.version}` : null, erpCode: null }))),
        gifts: q.gifts.map((g) => ({ erpCode: g.erpCode, title: g.title, qty: g.qty, value: g.value / 100, promo: `${g.code} v${g.version}`, terms: termsOf.get(g.promotionId) ?? null })),
      });
      const mode = String((await getSetting("softone").catch(() => ({ data: {} as Record<string, unknown> }))).data.orderPush ?? "preview");
      if (mode !== "off") await tx.erpSync.create({ data: { orderId: order.id, status: viva ? "awaiting-payment" : "preview", payload: doc as unknown as Prisma.InputJsonValue } });
      await tx.cartLine.deleteMany({ where: { cartId: cart.id } });
      if (input.dryRun) throw Object.assign(new Abort("dry-run"), { preview: { number, quote: publicQuote(q), erp: doc } });
      return { orderId: order.id };
    }, { timeout: 20000 });
    invalidatePromos(); // οι μετρητές άλλαξαν
    // Viva: ο πελάτης πάει στη σελίδα πληρωμής· το email φεύγει όταν επιβεβαιωθεί η πληρωμή (lib/payments/order-payment)
    if (viva && isVivaPay(input.payment)) {
      const redirect = await startVivaPayment(result.orderId, input.payment).catch(() => paymentPagePath(number, "&e=start"));
      return { ok: true as const, number, total: q.total, nextCoupon: null, redirect };
    }
    // «Οι συσκευές μου»: εγγύηση (και δωρεάν επέκταση όπου ισχύει) στο προφίλ του πελάτη
    void import("@/lib/warranty/server").then((m) => m.devicesFromOrder(result.orderId)).catch(() => null);
    // email επιβεβαίωσης — εκτός συναλλαγής· αποτυχία αποστολής δεν ακυρώνει την παραγγελία
    void (async () => {
      const store = input.fulfilment === "click-collect" && input.storeId ? await db.store.findUnique({ where: { id: input.storeId } }).catch(() => null) : null;
      const tpl = await renderTemplate("order-confirmation", {
        firstName: input.contact.firstName, number,
        lines: q.lines.map((l) => ({ title: l.title, brand: l.brand, image: l.image, qty: l.qty, unitPrice: l.unitFinal / 100, addons: l.addons.map((a) => ({ title: a.title, price: a.price / 100 })) })),
        subtotal: (q.goods + q.addons - q.discPrice - q.discCoupon - q.discPayment) / 100, shippingFee: (q.shipping + q.codFee) / 100, total: q.total / 100,
        payment: input.payment, fulfilment: input.fulfilment,
        address: lockerAt ? `Θυρίδα BOX NOW: ${[lockerAt.name, lockerAt.address, lockerAt.zip].filter(Boolean).join(", ")}` : [input.address?.street, input.address?.number, input.address?.zip, input.address?.city].filter(Boolean).join(" "),
        ...(store ? { store } : {}), eta: input.fulfilment === "click-collect" ? "σε 2 ώρες" : (() => { const o = q.carriers.find((x) => x.id === q.carrier); return o ? `${o.name} · ${o.eta}` : "1–3 εργάσιμες"; })(),
      }).catch(() => null);
      if (tpl) await sendMail({ to: email, subject: tpl.subject, html: tpl.html, text: tpl.text, template: "order-confirmation", meta: { orderId: result.orderId } }).catch(() => null);
    })();
    // κουπόνι επόμενης αγοράς (αν το έχει ορίσει ο υπεύθυνος προσφορών): φαίνεται στη σελίδα επιτυχίας·
    // email μόνο σε πελάτη με λογαριασμό που έχει δώσει συναίνεση για προωθητικά
    let nextCoupon: { code: string; value: string; until: string | null } | null = null;
    try {
      const { issueTriggerCoupon, marketingAllowed, couponValueLabel } = await import("@/lib/promo/issue");
      const send = me ? (await marketingAllowed([me.id])).has(me.id) : false;
      const r = await issueTriggerCoupon("next-order", { email, customerId: me?.id ?? null, firstName: input.contact.firstName }, { send });
      if (r?.ok) {
        const promo = await db.promotion.findUnique({ where: { id: r.coupon.promotionId }, select: { mechanism: true, reward: true } });
        nextCoupon = { code: r.coupon.code, value: promo ? couponValueLabel(promo) : "", until: r.coupon.expiresAt ? r.coupon.expiresAt.toLocaleDateString("el-GR", { day: "numeric", month: "long" }) : null };
      }
    } catch { /* ποτέ δεν μπλοκάρει την παραγγελία */ }
    return { ok: true as const, number, total: q.total, nextCoupon };
  } catch (e) {
    if (e instanceof Abort && e.reason === "dry-run") return { ok: true as const, dryRun: true, ...(e as Abort & { preview: object }).preview };
    if (e instanceof Abort) { invalidatePromos(); return { ok: false as const, error: e.reason, quote: publicQuote(await quoteCart({ coupon: input.coupon, payment: input.payment, delivery: input.fulfilment, storeId: input.storeId ?? null, zip: input.address?.zip ?? null, email })) }; }
    throw e;
  }
}
