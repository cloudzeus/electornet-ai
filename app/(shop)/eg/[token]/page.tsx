import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { verifyDeviceToken } from "@/lib/warranty/link";
import { extOffers } from "@/lib/warranty/server";
import { addMonths, LEGAL_WARRANTY_MONTHS } from "@/lib/warranty/policy";
import { ExtendWarrantyButton } from "@/components/account/ExtendWarrantyButton";
import { ReminderOptOut } from "@/components/account/ReminderOptOut";
import { ProductImage } from "@/components/commerce/ProductImage";

export const metadata: Metadata = { title: "Επέκταση εγγύησης", robots: { index: false } };
export const dynamic = "force-dynamic";

const EXT_MSG = {
  ok: { tone: "bg-eu-green/10 text-eu-green", text: "Η πληρωμή ολοκληρώθηκε — η εγγύηση επεκτάθηκε κατά 2 έτη." },
  pending: { tone: "bg-eu-amber/15 text-eu-ink-2", text: "Η πληρωμή είναι σε εξέλιξη. Μόλις την επιβεβαιώσει η Viva, η επέκταση θα φανεί εδώ." },
  failed: { tone: "bg-eu-red/10 text-eu-red", text: "Η πληρωμή δεν ολοκληρώθηκε και δεν έγινε χρέωση. Μπορείς να δοκιμάσεις ξανά." },
} as const;
const date = (d: Date) => d.toLocaleDateString("el-GR", { day: "numeric", month: "long", year: "numeric" });

/**
 * Η σελίδα του προσωπικού συνδέσμου μιας συσκευής (από SMS ή email υπενθύμισης): εγγύηση, επέκταση (δωρεάν ή με πληρωμή
 * Viva) και διακοπή υπενθυμίσεων — χωρίς σύνδεση, αφού οι πελάτες καταστημάτων δεν έχουν λογαριασμό στο site.
 */
export default async function DeviceLinkPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ ext?: string }> }) {
  const [{ token }, { ext }] = await Promise.all([params, searchParams]);
  const id = verifyDeviceToken(token);
  if (!id) notFound();
  const d = await db.customerDevice.findUnique({ where: { id }, select: { id: true, title: true, brand: true, productId: true, registeredBy: true, warrantyUntil: true, warrantyMonths: true, purchasedAt: true, createdAt: true, extendedUntil: true, orderLineId: true, purchaseLineId: true, customer: { select: { firstName: true, status: true } } } });
  if (!d || d.customer.status !== "active") notFound();
  const until = d.warrantyUntil ?? addMonths(d.purchasedAt ?? d.createdAt, d.warrantyMonths || LEGAL_WARRANTY_MONTHS);
  const [offer, img] = await Promise.all([
    extOffers([{ ...d, warrantyUntil: until }]).then((m) => m.get(d.id)),
    d.productId ? db.media.findFirst({ where: { productId: d.productId, kind: "image", hidden: false }, orderBy: { sortNo: "asc" }, select: { url: true } }) : null,
  ]);
  const msg = ext && ext in EXT_MSG ? EXT_MSG[ext as keyof typeof EXT_MSG] : null;
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 grid gap-5">
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><ShieldCheck className="size-4" aria-hidden /> Εγγύηση & επέκταση</div>
        <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)] leading-tight">Γεια σου {d.customer.firstName}</h1>
      </div>
      {msg && <p role="status" className={`m-0 rounded-xl px-3 py-2 font-bold text-[length:var(--fs-15)] ${msg.tone}`}>{msg.text}</p>}
      <article className="rounded-2xl border border-eu-line bg-white p-4 @md:p-5 grid gap-4">
        <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-4 items-center">
          <ProductImage src={img?.url ?? null} sizes="88px" className="size-[88px]" rounded="rounded-xl" />
          <div className="min-w-0">
            <div className="text-eu-muted-2 font-bold text-[length:var(--fs-13)] uppercase">{d.brand}</div>
            <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-17)] leading-tight">{d.title}</h2>
            <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-14)]">
              {d.purchasedAt ? `Αγορά ${date(d.purchasedAt)} · ` : ""}
              {d.extendedUntil ? <>Με επέκταση έως <b className="text-eu-ink">{date(d.extendedUntil)}</b></> : <>Εγγύηση έως <b className="text-eu-ink">{date(until)}</b></>}
            </p>
          </div>
        </div>
        {offer?.kind === "free" && (
          <div className="grid gap-2">
            <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)]">Η συσκευή σου δικαιούται <b>δωρεάν επέκταση εγγύησης +2 έτη</b> από τη Euronics, όσο η εγγύηση είναι σε ισχύ.</p>
            <ExtendWarrantyButton deviceId={d.id} token={token} />
          </div>
        )}
        {offer?.kind === "paid" && (
          <div className="grid gap-2">
            <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)]">Επέκταση εγγύησης <b>+2 έτη</b>: επισκευή ή αντικατάσταση χωρίς χρέωση. Πληρώνεις με ασφάλεια μέσω Viva (κάρτα, Apple Pay, Google Pay κ.ά.).</p>
            <ExtendWarrantyButton deviceId={d.id} token={token} price={offer.price} />
          </div>
        )}
        {!offer?.kind && !d.extendedUntil && offer?.reason && <p className="m-0 rounded-lg bg-eu-surface px-3 py-2 text-eu-ink-2 text-[length:var(--fs-14)]">{offer.reason}</p>}
      </article>
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <Link href="/logariasmos/eggyiseis" className="font-bold text-eu-blue underline text-[length:var(--fs-14)] min-h-11 inline-flex items-center">Όλες οι συσκευές μου (με σύνδεση)</Link>
        <ReminderOptOut token={token} />
      </div>
    </div>
  );
}
