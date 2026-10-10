import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { getPublicSettings } from "@/lib/settings/store";
import { enabledVivaPays } from "@/lib/payments/viva-core";
import { paymentPagePath, validPaymentKey } from "@/lib/payments/order-payment";
import { priceLong } from "@/lib/format";
import { RetryPayment } from "@/components/checkout/RetryPayment";

export const metadata: Metadata = { title: "Πληρωμή παραγγελίας", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Η σελίδα μιας online πληρωμής που δεν ολοκληρώθηκε (ή επιβεβαιώνεται ακόμη). Ανοίγει μόνο με τον υπογεγραμμένο
 * σύνδεσμο (k). Εκκρεμής παραγγελία → «Δοκίμασε ξανά» με όποιον τρόπο Viva· μετά από 24 ώρες ακυρώνεται αυτόματα.
 */
export default async function PaymentPage({ searchParams }: { searchParams: Promise<{ no?: string; k?: string; e?: string; s?: string }> }) {
  const { no = "", k, e, s } = await searchParams;
  if (!no || !validPaymentKey(no, k)) notFound();
  const [o, pub] = await Promise.all([
    db.order.findUnique({ where: { number: no }, select: { number: true, total: true, status: true, createdAt: true, payment: { select: { status: true, method: true } } } }),
    getPublicSettings(),
  ]);
  if (!o) notFound();
  const paid = o.payment?.status === "paid";
  const checking = !paid && (o.payment?.status === "processing" || s === "pending");
  const cancelled = o.status === "cancelled";
  const until = new Date(o.createdAt.getTime() + 24 * 3600_000).toLocaleString("el-GR", { weekday: "long", hour: "2-digit", minute: "2-digit" });
  const box = "rounded-2xl border border-eu-line bg-white p-6 @md:p-8 grid gap-4";
  return (
    <div className="eu-container eu-canvas eu-gutter py-8 @md:py-12 max-w-2xl mx-auto">
      {paid ? (
        <section className={box}>
          <h1 className="m-0 inline-flex items-center gap-2 font-heading font-bold text-eu-ink text-[length:var(--fs-26)]"><CheckCircle2 className="size-7 text-eu-green" aria-hidden /> Η πληρωμή ολοκληρώθηκε</h1>
          <p className="m-0 text-eu-ink-2 text-[length:var(--fs-16)]">Η παραγγελία <b>{o.number}</b> πληρώθηκε. Θα λάβεις email επιβεβαίωσης.</p>
          <Link href={`/checkout/epityxia?no=${encodeURIComponent(o.number)}`} className="justify-self-start rounded-full bg-eu-navy text-white font-extrabold px-6 min-h-12 inline-flex items-center">Συνέχεια</Link>
        </section>
      ) : cancelled ? (
        <section className={box}>
          <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)]">Η παραγγελία ακυρώθηκε</h1>
          <p className="m-0 text-eu-ink-2 text-[length:var(--fs-16)]">Η παραγγελία <b>{o.number}</b> δεν πληρώθηκε μέσα σε 24 ώρες και ακυρώθηκε. Δεν χρεώθηκες τίποτα.</p>
          <Link href="/proionta" className="justify-self-start rounded-full bg-eu-navy text-white font-extrabold px-6 min-h-12 inline-flex items-center">Στα προϊόντα</Link>
        </section>
      ) : (
        <section className={box}>
          {checking ? (
            <>
              <h1 className="m-0 inline-flex items-center gap-2 font-heading font-bold text-eu-ink text-[length:var(--fs-26)]"><Clock className="size-7 text-eu-blue" aria-hidden /> Η πληρωμή επιβεβαιώνεται</h1>
              <p className="m-0 text-eu-ink-2 text-[length:var(--fs-16)]">Με IRIS και άλλους τρόπους η τράπεζα μπορεί να χρειαστεί λίγα λεπτά. Μόλις επιβεβαιωθεί, θα λάβεις email — δεν χρειάζεται να πληρώσεις ξανά.</p>
              <Link href={paymentPagePath(o.number, "&s=pending")} className="justify-self-start rounded-full border-2 border-eu-line font-extrabold px-6 min-h-12 inline-flex items-center hover:border-eu-blue">Έλεγχος ξανά</Link>
            </>
          ) : (
            <>
              <h1 className="m-0 inline-flex items-center gap-2 font-heading font-bold text-eu-ink text-[length:var(--fs-26)]"><AlertTriangle className="size-7 text-eu-amber" aria-hidden /> Η πληρωμή δεν ολοκληρώθηκε</h1>
              <p className="m-0 text-eu-ink-2 text-[length:var(--fs-16)]">
                {e === "start" ? "Η σελίδα πληρωμής δεν άνοιξε. " : "Η πληρωμή ακυρώθηκε ή δεν εγκρίθηκε — δεν χρεώθηκες. "}
                Η παραγγελία <b>{o.number}</b> ({priceLong(Number(o.total))}) σε περιμένει μέχρι {until}.
              </p>
              <RetryPayment number={o.number} k={k!} methods={enabledVivaPays(pub.payments ?? {})} current={o.payment?.method ?? "card"} />
            </>
          )}
          <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Χρειάζεσαι βοήθεια; Κάλεσε στο 210 483 5143 με τον αριθμό παραγγελίας.</p>
        </section>
      )}
    </div>
  );
}
