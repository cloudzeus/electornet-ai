import Link from "next/link";
import Image from "@/components/ui/Image";
import { AlertTriangle, ArrowLeft, Building2, Check, CreditCard, ExternalLink, FileText, Gift, History, Mail, MapPin, MessageSquare, Package, Phone, RotateCcw, Store, Tag, Truck, User } from "lucide-react";
import type { OrderDetail } from "@/lib/orders/admin";
import { pickupCode, rmaOf } from "@/lib/orders/ops";
import { ERP_STATUS, FULFILMENT, NOTIFY_ON, addressOf, nameOf, nextAction, nextStatuses, orderSteps, statusLabel, type Fulfilment, type ShipTo } from "@/lib/orders/model";
import type { shipmentDraft } from "@/lib/couriers/shipments";
import { payLabel } from "@/lib/account/labels";
import { ShipmentTracker } from "@/components/shipping/ShipmentTracker";
import { Badge, ErpBadge, OrderStatusBadge, PaymentBadge, ReturnBadge, dateTime, eur } from "@/components/admin/orders/ui";
import { CreateVoucher } from "../../apostoles/vouchers/VoucherControls";
import { ErpCheck, NotesPanel, OrderHeaderActions, RefundForm, ReturnControls } from "./OrderControls";


const ACTION: Record<string, string> = {
  "order.status": "Αλλαγή κατάστασης", "order.note": "Σημείωση", "order.note.delete": "Διαγραφή σημείωσης", "order.email": "Email στον πελάτη", "order.refund": "Επιστροφή χρημάτων",
  "shipment.create": "Έκδοση voucher", "shipment.cancel": "Ακύρωση voucher", "return.status": "Επιστροφή προϊόντων",
};
const EMAIL: Record<string, string> = { "order-confirmation": "Επιβεβαίωση παραγγελίας", "order-shipped": "Στάλθηκε", "order-ready-for-pickup": "Έτοιμη για παραλαβή", "order-delivered": "Παραδόθηκε", "order-cancelled": "Ακύρωση", "order-return": "Επιστροφή" };

function Card({ title, icon: Icon, right, children, id, "data-help": help }: { title: string; icon: typeof Package; right?: React.ReactNode; children: React.ReactNode; id?: string; "data-help"?: string }) {
  return (
    <section id={id} data-help={help} aria-label={title} className="rounded-xl border border-eu-line bg-white p-3 grid gap-2.5 min-w-0 break-inside-avoid scroll-mt-28">
      <div className="flex items-center gap-2"><h3 className="m-0 inline-flex items-center gap-1.5 font-bold text-eu-ink text-[length:var(--fs-14)] grow"><Icon className="size-4 text-eu-blue" aria-hidden />{title}</h3>{right}</div>
      {children}
    </section>
  );
}
const Row = ({ k, children }: { k: string; children: React.ReactNode }) => <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 text-[length:var(--fs-13)]"><dt className="text-eu-muted">{k}</dt><dd className="m-0 text-eu-ink-2 min-w-0 break-words">{children}</dd></div>;

/**
 * Καρτέλα παραγγελίας (ui-ux-pro-max): κεφαλίδα με κατάσταση, πορεία και τη ΜΙΑ επόμενη ενέργεια· κύρια στήλη με
 * προϊόντα / σύνολα / πληρωμή / παράδοση / επιστροφές, πλαϊνή με πελάτη, διεύθυνση, τιμολόγιο, SoftOne, σημειώσεις
 * και ιστορικό. Εκτυπώνεται καθαρά (χωρίς το πλαίσιο της διαχείρισης).
 */
export type Draft = Awaited<ReturnType<typeof shipmentDraft>>;
/** Η παρουσίαση της καρτέλας (χωριστά από τη φόρτωση — δοκιμάζεται και με ψεύτικα δεδομένα). */
export function OrderView({ o, draft, erp, canWrite, canRefund }: { o: OrderDetail; draft: Draft; erp: { needs: string[]; warnings: string[]; gross: number; expected: number } | null; canWrite: boolean; canRefund: boolean }) {
  const s = (o.shipping ?? {}) as ShipTo;
  const inv = (o.invoice ?? null) as { vatNumber?: string; company?: string; doy?: string; activity?: string } | null;
  const activeShip = o.shipments.find((x) => x.status !== "cancelled") ?? null;
  const na = nextAction({ status: o.status, fulfilment: o.fulfilment, paymentMethod: o.paymentMethod, hasShipment: !!activeShip });
  const steps = orderSteps(o.status, o.fulfilment);
  const name = nameOf(s) || (o.customer ? `${o.customer.firstName} ${o.customer.lastName}` : "Επισκέπτης");
  const email = s.email ?? o.customer?.email ?? o.guestEmail;
  const phone = s.phone ?? o.customer?.mobile ?? o.customer?.phone;
  const n = (d: unknown) => Number(d ?? 0);
  const lines = o.lines;
  const listTotal = lines.reduce((a, l) => a + n(l.listPrice ?? l.unitPrice) * l.qty, 0);
  const discPrice = lines.reduce((a, l) => a + n(l.discPrice), 0), discCoupon = lines.reduce((a, l) => a + n(l.discCoupon), 0), discPay = lines.reduce((a, l) => a + n(l.discPayment), 0);
  const addonsTotal = lines.reduce((a, l) => a + l.addons.reduce((x, ad) => x + n(ad.price), 0), 0);
  const paid = o.payment?.status === "paid" || o.payment?.status === "partially-refunded";
  const openReturns = o.returns.filter((r) => ["requested", "approved", "received"].includes(r.status)).length;
  const timeline = [
    { at: o.createdAt, title: "Η παραγγελία καταχωρήθηκε", by: "e-shop", icon: Package },
    ...o.history.map((h) => {
      const a = (h.after ?? {}) as { status?: string; reason?: string; notify?: boolean; text?: string; template?: string; amount?: number; voucher?: string; mailError?: string };
      const detail = h.action === "order.status" ? `→ ${statusLabel(a.status ?? "")}${a.reason ? ` · ${a.reason}` : ""}${a.notify ? " · email στον πελάτη" : ""}${a.mailError ? ` · email απέτυχε (${a.mailError})` : ""}` : h.action === "return.status" ? `→ ${a.status}` : h.action === "order.note" ? a.text ?? "" : h.action === "order.refund" ? eur(n(a.amount)) : h.action === "shipment.create" ? a.voucher ?? "" : "";
      return { at: h.createdAt, title: `${ACTION[h.action] ?? h.action}${detail ? ` ${detail}` : ""}`, by: h.staff?.name ?? "Σύστημα", icon: History };
    }),
    ...o.emails.map((e) => ({ at: e.at, title: `Email: ${EMAIL[e.template] ?? e.template}${e.status === "failed" ? " — απέτυχε" : e.status === "skipped" ? " — παραλείφθηκε" : ""}`, by: "Αυτόματο", icon: Mail })),
  ].sort((a, b) => +new Date(b.at) - +new Date(a.at));

  return (
    <div className="@container grid gap-3 min-w-0">
      {/* κεφαλίδα: πίσω, αριθμός, κατάσταση, επόμενη ενέργεια */}
      <div data-help="order.header" className="@md:sticky top-0 z-30 -mx-4 @md:-mx-6 -mt-4 @md:-mt-6 px-4 @md:px-6 py-2 bg-eu-surface/95 backdrop-blur border-b border-eu-line grid gap-2 print:static print:bg-white">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Link href="/admin/orders" className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-13)] min-h-11 md:min-h-8 hover:underline print:hidden"><ArrowLeft className="size-4" aria-hidden /> Παραγγελίες</Link>
          <h2 className="m-0 font-mono font-bold text-eu-ink text-[length:var(--fs-20)]">{o.number}</h2>
          <OrderStatusBadge status={o.status} />
          <span className="text-eu-ink-3 text-[length:var(--fs-13)]">{dateTime(o.createdAt)} · {FULFILMENT[o.fulfilment as Fulfilment] ?? o.fulfilment} · {payLabel(o.paymentMethod)}</span>
          <div className="ml-auto"><OrderHeaderActions orderId={o.id} number={o.number} canWrite={canWrite} next={nextStatuses(o.status, o.fulfilment)} primary={na.kind === "status" ? { to: na.to, label: na.label, hint: na.hint } : na.kind === "voucher" ? { voucher: true, label: na.label, hint: na.hint } : null} /></div>
        </div>
      </div>

      {/* πορεία + τι ακολουθεί */}
      <div data-help="order.progress" className="rounded-xl border border-eu-line bg-white px-3 py-2.5 grid gap-2 @3xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] @3xl:items-center">
        <ol className="m-0 p-0 list-none grid grid-cols-4 gap-x-2 gap-y-1" aria-label="Πορεία">
          {steps.map((st, i) => (
            <li key={i} aria-current={st.state === "current" ? "step" : undefined} className="grid gap-1">
              <span aria-hidden className={`h-1.5 rounded-full ${st.state === "done" ? "bg-eu-green" : st.state === "current" ? "bg-eu-navy" : st.state === "bad" ? "bg-eu-red" : "bg-eu-line"}`} />
              <span title={st.label} className={`text-[length:var(--fs-12)] font-semibold leading-tight truncate ${st.state === "todo" ? "text-eu-muted" : st.state === "bad" ? "text-eu-red" : "text-eu-ink"}`}>{st.label}</span>
            </li>
          ))}
        </ol>
        <p className="m-0 text-[length:var(--fs-13)] text-eu-ink-3 @3xl:border-l @3xl:border-eu-line-2 @3xl:pl-3"><b className="text-eu-ink">Επόμενο: </b>{na.kind === "none" && !na.hint ? "—" : `${na.label}${na.hint ? ` — ${na.hint}` : ""}`}</p>
      </div>

      {/* προειδοποιήσεις */}
      {(o.payment?.status === "failed" || o.erpSync?.status === "failed" || openReturns > 0 || (activeShip && ["attempted", "returning"].includes(activeShip.status))) && (
        <ul className="m-0 p-0 list-none grid gap-1">
          {o.payment?.status === "failed" && <li className="flex items-start gap-2 rounded-lg bg-eu-red/5 border border-eu-red/20 px-3 py-2 text-[length:var(--fs-13)]"><AlertTriangle className="size-4 mt-0.5 shrink-0 text-eu-red" aria-hidden />Η πληρωμή απέτυχε — μην προχωρήσεις χωρίς επικοινωνία με τον πελάτη.</li>}
          {o.erpSync?.status === "failed" && <li className="flex items-start gap-2 rounded-lg bg-eu-red/5 border border-eu-red/20 px-3 py-2 text-[length:var(--fs-13)]"><AlertTriangle className="size-4 mt-0.5 shrink-0 text-eu-red" aria-hidden /><span>Η αποστολή στο SoftOne απέτυχε{o.erpSync.lastError ? `: ${o.erpSync.lastError.slice(0, 200)}` : "."}</span></li>}
          {activeShip && ["attempted", "returning"].includes(activeShip.status) && <li className="flex items-start gap-2 rounded-lg bg-eu-amber/10 border border-eu-amber/30 px-3 py-2 text-[length:var(--fs-13)]"><AlertTriangle className="size-4 mt-0.5 shrink-0 text-eu-amber" aria-hidden />Πρόβλημα στην αποστολή — δες την παρακολούθηση παρακάτω.</li>}
          {openReturns > 0 && <li className="flex items-start gap-2 rounded-lg bg-eu-amber/10 border border-eu-amber/30 px-3 py-2 text-[length:var(--fs-13)]"><RotateCcw className="size-4 mt-0.5 shrink-0 text-eu-amber" aria-hidden /><a href="#returns" className="hover:underline">{openReturns === 1 ? "Ένα αίτημα επιστροφής" : `${openReturns} αιτήματα επιστροφής`} σε εξέλιξη</a></li>}
        </ul>
      )}

      <div className="grid gap-3 @5xl:grid-cols-[minmax(0,1.75fr)_minmax(18rem,1fr)] items-start print:block">
        <div className="grid gap-3 min-w-0">
          {/* προϊόντα + σύνολα */}
          <Card title={`Προϊόντα (${lines.reduce((a, l) => a + l.qty, 0)})`} icon={Package} data-help="order.lines" right={o.promoUsages.length > 0 ? <Link href={`/admin/prosfores/anafores/paraggelia/${o.id}`} className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-12)] hover:underline print:hidden">Ανάλυση προσφορών <ExternalLink className="size-3.5" aria-hidden /></Link> : null}>
            <ul className="m-0 p-0 list-none divide-y divide-eu-line-2">
              {lines.map((l) => {
                const p = l.variant.product, img = p.media[0], list = n(l.listPrice), unit = n(l.unitPrice);
                return (
                  <li key={l.id} className="grid grid-cols-[3rem_minmax(0,1fr)] @md:grid-cols-[3rem_minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 py-2 first:pt-0 last:pb-0 items-start">
                    <span className="relative size-12 rounded-lg bg-eu-surface overflow-hidden row-span-3 @md:row-span-2">{img && <Image src={img.thumbUrl ?? img.url} alt="" fill sizes="48px" className="object-contain" unoptimized={(img.thumbUrl ?? img.url).startsWith("http")} />}</span>
                    <span className="grid min-w-0 leading-snug">
                      <Link href={`/admin/catalog/${p.id}`} className="font-bold text-eu-ink text-[length:var(--fs-13)] hover:text-eu-blue hover:underline">{l.title.toLowerCase().startsWith(p.brand.name.toLowerCase()) ? l.title : `${p.brand.name} ${l.title}`}</Link>
                      <span className="text-eu-muted text-[length:var(--fs-12)] tabular-nums">{[p.sku && `SKU ${p.sku}`, (l.erpCode ?? p.erpCode) && `ERP ${l.erpCode ?? p.erpCode}`].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="col-start-2 @md:col-start-auto @md:text-right flex @md:grid items-baseline gap-x-2 leading-snug tabular-nums">
                      <span className="font-bold text-eu-ink text-[length:var(--fs-13)]">{l.isGift ? "Δώρο" : eur(n(l.lineTotal ?? unit * l.qty))}</span>
                      <span className="text-eu-muted text-[length:var(--fs-12)]">{l.qty} × {eur(unit)}{list > unit ? <> <s className="ml-1">{eur(list)}</s></> : null}</span>
                    </span>
                    <span className="col-start-2 @md:col-span-2 flex flex-wrap gap-1">
                      {l.isGift && <Badge tone="good"><Gift className="size-3" aria-hidden />Δώρο προσφοράς</Badge>}
                      {n(l.discPrice) > 0 && <Badge tone="info">Προσφορά −{eur(n(l.discPrice))}</Badge>}
                      {n(l.discCoupon) > 0 && <Badge tone="info">Κουπόνι −{eur(n(l.discCoupon))}</Badge>}
                      {n(l.discPayment) > 0 && <Badge tone="info">Πληρωμή −{eur(n(l.discPayment))}</Badge>}
                      {l.addons.map((a) => <Badge key={a.id} tone="neutral" className="!whitespace-normal">+ {a.service.title} · {eur(n(a.price))}</Badge>)}
                    </span>
                  </li>
                );
              })}
            </ul>
            <dl className="m-0 grid gap-1 border-t border-eu-line pt-2 text-[length:var(--fs-13)] tabular-nums">
              <div className="flex justify-between"><dt className="text-eu-ink-3">Αξία καταλόγου</dt><dd className="m-0">{eur(listTotal)}</dd></div>
              {discPrice > 0 && <div className="flex justify-between text-eu-green"><dt>Προσφορές</dt><dd className="m-0">−{eur(discPrice)}</dd></div>}
              {discCoupon > 0 && <div className="flex justify-between text-eu-green"><dt>Κουπόνι{o.couponCode ? <> <span className="font-mono">{o.couponCode}</span></> : null}</dt><dd className="m-0">−{eur(discCoupon)}</dd></div>}
              {discPay > 0 && <div className="flex justify-between text-eu-green"><dt>Έκπτωση πληρωμής</dt><dd className="m-0">−{eur(discPay)}</dd></div>}
              {addonsTotal > 0 && <div className="flex justify-between"><dt className="text-eu-ink-3">Υπηρεσίες</dt><dd className="m-0">{eur(addonsTotal)}</dd></div>}
              <div className="flex justify-between"><dt className="text-eu-ink-3">Μεταφορικά</dt><dd className="m-0">{n(o.shippingFee) ? eur(n(o.shippingFee)) : "Δωρεάν"}</dd></div>
              <div className="flex justify-between font-heading font-extrabold text-eu-ink text-[length:var(--fs-16)] border-t border-eu-line-2 pt-1"><dt>Σύνολο</dt><dd className="m-0">{eur(n(o.total))}</dd></div>
              <div className="flex justify-between text-eu-muted text-[length:var(--fs-12)]"><dt>από τα οποία ΦΠΑ</dt><dd className="m-0">{eur(n(o.vat))}</dd></div>
            </dl>
          </Card>

          {/* πληρωμή */}
          <Card title="Πληρωμή" icon={CreditCard} data-help="order.payment" right={<PaymentBadge status={o.payment?.status ?? null} />}>
            <dl className="m-0 grid gap-1">
              <Row k="Τρόπος">{payLabel(o.payment?.method ?? o.paymentMethod)}{(o.payment?.instalments ?? 1) > 1 ? ` · ${o.payment!.instalments} δόσεις` : ""}</Row>
              {o.payment?.psp && <Row k="Πάροχος">{o.payment.psp}{o.payment.pspRef ? <> · <span className="font-mono text-[length:var(--fs-12)] select-all">{o.payment.pspRef}</span></> : null}</Row>}
              {o.payment && <Row k="Ενημέρωση">{dateTime(o.payment.updatedAt)}{o.payment.scaDone ? " · 3-D Secure" : ""}</Row>}
            </dl>
            {canRefund && paid && <RefundForm orderId={o.id} number={o.number} total={n(o.total)} />}
          </Card>

          {/* παράδοση */}
          <Card title={o.fulfilment === "click-collect" ? "Παραλαβή από κατάστημα" : o.fulfilment === "appointment" ? "Παράδοση με ραντεβού" : o.fulfilment === "freight" ? "Αποστολή με μεταφορική" : "Αποστολή"} icon={o.fulfilment === "click-collect" ? Store : Truck} id="voucher" data-help="order.delivery">
            {o.fulfilment === "click-collect" ? (
              o.pickupStore ? (
                <dl className="m-0 grid gap-1">
                  <Row k="Κατάστημα"><b className="text-eu-ink">{o.pickupStore.name}</b><br />{o.pickupStore.address}, {o.pickupStore.zip} {o.pickupStore.city}{o.pickupStore.phone ? <> · <a href={`tel:${o.pickupStore.phone}`} className="text-eu-blue hover:underline">{o.pickupStore.phone}</a></> : null}</Row>
                  <Row k="Κωδικός παραλαβής"><span className="font-mono font-bold text-eu-ink tracking-wider">{pickupCode(o.number)}</span> <span className="text-eu-muted text-[length:var(--fs-12)]">(στέλνεται στον πελάτη με το «Έτοιμη για παραλαβή»)</span></Row>
                </dl>
              ) : <p className="m-0 text-eu-red text-[length:var(--fs-13)]">Δεν έχει οριστεί κατάστημα παραλαβής.</p>
            ) : o.timeline ? (
              <ShipmentTracker t={o.timeline} audience="staff" />
            ) : draft ? (
              <div className="grid gap-2">
                <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">{s.carrierName ?? "Courier"} · {draft.pieces} τεμ. · {draft.weightKg.toLocaleString("el-GR")} κιλά{draft.weightKnown ? "" : " (εκτίμηση)"}{draft.cod > 0 ? ` · αντικαταβολή ${eur(draft.cod)}` : ""}</p>
                {draft.blockers.length > 0 && <p role="alert" className="m-0 inline-flex items-start gap-1.5 text-eu-red font-bold text-[length:var(--fs-12)]"><AlertTriangle className="size-3.5 mt-px shrink-0" aria-hidden />{draft.blockers.join(" ")}</p>}
                <CreateVoucher orderId={o.id} weightKg={draft.weightKg} weightKnown={draft.weightKnown} pieces={draft.pieces} disabled={draft.blockers.length > 0} />
              </div>
            ) : (
              <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">{o.fulfilment === "appointment" ? "Η παράδοση γίνεται από το κατάστημα με ραντεβού." : o.fulfilment === "freight" ? "Εσωτερική διαδικασία, χωρίς voucher: κανόνισε τη μεταφορική, τηλεφώνησε στον πελάτη και άλλαξε την κατάσταση σε «Στάλθηκε» και μετά «Παραδόθηκε»." : `${s.carrierName ?? "Courier"} · χωρίς voucher ακόμη.`}</p>
            )}
            {o.shipments.filter((x) => x.status === "cancelled").length > 0 && <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">Ακυρωμένα vouchers: {o.shipments.filter((x) => x.status === "cancelled").map((x) => x.voucher).filter(Boolean).join(", ")}</p>}
          </Card>

          {/* επιστροφές */}
          {o.returns.length > 0 && (
            <Card title="Επιστροφές προϊόντων" icon={RotateCcw} id="returns" data-help="order.returns">
              <ul className="m-0 p-0 list-none grid gap-2">
                {o.returns.map((r) => {
                  const items = Array.isArray(r.lines) ? (r.lines as { title?: string; qty?: number }[]) : [];
                  return (
                    <li key={r.id} className="rounded-lg border border-eu-line-2 p-2.5 grid gap-1.5">
                      <div className="flex flex-wrap items-center gap-2"><span className="font-mono font-bold text-[length:var(--fs-13)]">{rmaOf(r.id)}</span><ReturnBadge status={r.status} /><span className="text-eu-muted text-[length:var(--fs-12)] ml-auto">{dateTime(r.createdAt)}</span></div>
                      <p className="m-0 text-[length:var(--fs-13)] text-eu-ink-2"><b>Λόγος:</b> {r.reason}</p>
                      {items.length > 0 && <p className="m-0 text-[length:var(--fs-12)] text-eu-ink-3">{items.map((i) => `${i.title ?? "Προϊόν"}${i.qty && i.qty > 1 ? ` ×${i.qty}` : ""}`).join(" · ")}</p>}
                      {canWrite && <ReturnControls id={r.id} number={o.number} status={r.status} maxRefund={n(o.total)} />}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>

        {/* πλαϊνή στήλη */}
        <div className="grid gap-3 min-w-0 print:mt-3">
          <Card title="Πελάτης" icon={User} data-help="order.customer" right={o.customer ? <Link href={`/admin/customers/${o.customer.id}`} className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-12)] hover:underline print:hidden">Καρτέλα πελάτη <ExternalLink className="size-3.5" aria-hidden /></Link> : <Badge tone="neutral">Επισκέπτης</Badge>}>
            <dl data-private className="m-0 grid gap-1">
              <Row k="Όνομα"><b className="text-eu-ink">{name}</b>{o.customer?.company ? <> · {o.customer.company}</> : null}</Row>
              {email && <Row k="Email"><a href={`mailto:${email}`} className="text-eu-blue hover:underline break-all">{email}</a></Row>}
              {phone && <Row k="Τηλέφωνο"><a href={`tel:${phone}`} className="inline-flex items-center gap-1 text-eu-blue hover:underline"><Phone className="size-3.5" aria-hidden />{phone}</a></Row>}
              {o.customerTotals && <Row k="Ιστορικό">{o.customerTotals.count} {o.customerTotals.count === 1 ? "παραγγελία" : "παραγγελίες"} · {eur(o.customerTotals.total)}</Row>}
            </dl>
          </Card>

          {o.fulfilment !== "click-collect" && (
            <Card title="Διεύθυνση παράδοσης" icon={MapPin} data-help="order.address">
              <p data-private className="m-0 text-[length:var(--fs-13)] text-eu-ink-2 leading-relaxed">{name}<br />{addressOf(s) || "—"}{s.region ? <><br />{s.region}</> : null}</p>
              {s.notes && <p data-private className="m-0 rounded-lg bg-eu-yellow/20 px-2.5 py-1.5 text-[length:var(--fs-13)]"><b>Σχόλιο πελάτη:</b> {s.notes}</p>}
              {(s.street || s.city) && <a href={`https://maps.google.com/?q=${encodeURIComponent(addressOf(s))}`} target="_blank" rel="noopener noreferrer" className="justify-self-start inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-12)] hover:underline print:hidden">Στον χάρτη <ExternalLink className="size-3.5" aria-hidden /></a>}
            </Card>
          )}

          {inv?.vatNumber && (
            <Card title="Τιμολόγιο" icon={Building2} data-help="order.invoice">
              <dl className="m-0 grid gap-1">
                <Row k="Επωνυμία">{inv.company ?? "—"}</Row>
                <Row k="ΑΦΜ"><span className="font-mono select-all">{inv.vatNumber}</span></Row>
                {inv.doy && <Row k="ΔΟΥ">{inv.doy}</Row>}
                {inv.activity && <Row k="Δραστηριότητα">{inv.activity}</Row>}
              </dl>
            </Card>
          )}

          <Card title="SoftOne" icon={FileText} data-help="order.erp" right={<ErpBadge status={o.erpSync?.status ?? null} />}>
            <p className="m-0 text-eu-ink-3 text-[length:var(--fs-12)]">{o.erpSync ? ERP_STATUS[o.erpSync.status]?.help ?? "" : "Δεν δημιουργήθηκε παραστατικό για αυτή την παραγγελία."}</p>
            {o.erpSync && <dl className="m-0 grid gap-1">
              {o.erpSync.erpDocId && <Row k="Παραστατικό"><span className="font-mono">{o.erpSync.erpDocId}</span></Row>}
              <Row k="Προσπάθειες">{o.erpSync.attempts}</Row>
              {erp && <Row k="Σύνολο στο SoftOne"><span className={`tabular-nums font-bold ${erp.gross === erp.expected ? "text-eu-green" : "text-eu-amber"}`}>{eur(erp.gross)}{erp.gross === erp.expected ? " ✓" : ` (παραγγελία ${eur(erp.expected)})`}</span></Row>}
              {erp && erp.needs.length > 0 && <div className="grid gap-1 rounded-lg bg-eu-amber/10 border border-eu-amber/30 px-3 py-2 text-[length:var(--fs-12)]"><span className="font-bold text-eu-ink">Λείπουν για να σταλεί ({erp.needs.length})</span><ul className="m-0 pl-4 grid gap-0.5 text-eu-ink-2">{erp.needs.map((x) => <li key={x}>{x}</li>)}</ul></div>}
              {erp && erp.needs.length === 0 && <p className="m-0 inline-flex items-center gap-1 text-eu-green font-bold text-[length:var(--fs-12)]"><Check className="size-3.5" aria-hidden /> Το παραστατικό είναι πλήρες</p>}
              {erp?.warnings.map((x) => <p key={x} className="m-0 text-eu-ink-3 text-[length:var(--fs-12)]">{x}</p>)}
              {erp && erp.needs.length === 0 && canWrite && ["preview", "awaiting-payment"].includes(o.erpSync.status) && <ErpCheck orderId={o.id} />}
              {o.erpSync.payload ? <Link href={`/admin/prosfores/anafores/paraggelia/${o.id}`} className="text-eu-blue font-bold text-[length:var(--fs-12)] hover:underline print:hidden">Προσχέδιο παραστατικού →</Link> : null}
            </dl>}
          </Card>

          <Card title={`Σημειώσεις${o.notes.length ? ` (${o.notes.length})` : ""}`} icon={MessageSquare} data-help="order.notes">
            <NotesPanel orderId={o.id} number={o.number} canWrite={canWrite} notes={o.notes.map((x) => ({ id: x.id, text: x.text, staffName: x.staffName, pinned: x.pinned, createdAt: x.createdAt.toISOString() }))} />
          </Card>

          <Card title="Ιστορικό" icon={History} data-help="order.history">
            <ol className="m-0 p-0 list-none grid border-l-2 border-eu-line ml-1.5">
              {timeline.map((t, i) => (
                <li key={i} className="relative pl-4 pb-2.5 last:pb-0 text-[length:var(--fs-13)]">
                  <span aria-hidden className={`absolute -left-[5px] top-1.5 size-2 rounded-full ${i === 0 ? "bg-eu-navy" : "bg-eu-line-2"}`} />
                  <span className="block text-eu-ink-2 break-words">{t.title}</span>
                  <span className="block text-eu-muted text-[length:var(--fs-12)]">{dateTime(t.at)} · {t.by}</span>
                </li>
              ))}
            </ol>
            {Object.keys(NOTIFY_ON).length > 0 && o.emails.some((e) => e.status === "failed") && <p className="m-0 inline-flex items-center gap-1 text-eu-red text-[length:var(--fs-12)]"><AlertTriangle className="size-3.5" aria-hidden />Κάποιο email απέτυχε — δες τα Email στις Ρυθμίσεις.</p>}
          </Card>

          {o.promoUsages.length > 0 && (
            <Card title="Προσφορές & κουπόνια" icon={Tag} data-help="order.promos">
              <ul className="m-0 p-0 list-none grid gap-1 text-[length:var(--fs-13)]">
                {o.promoUsages.map((u, i) => <li key={i} className="flex justify-between gap-2"><Link href={`/admin/prosfores/${u.promotion.id}`} className="text-eu-blue hover:underline truncate">{u.promotion.name}{u.couponCode ? ` · ${u.couponCode}` : ""}</Link><span className="tabular-nums text-eu-green">−{eur(n(u.amount))}</span></li>)}
              </ul>
            </Card>
          )}
        </div>
      </div>
      <p className="hidden print:block m-0 text-[length:var(--fs-12)] text-eu-muted"><Check className="inline size-3" aria-hidden /> Εκτυπώθηκε {new Date().toLocaleString("el-GR")}</p>
    </div>
  );
}
