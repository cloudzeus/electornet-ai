import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { accountOrder, requireCustomer } from "@/lib/account/data";
import { OrderTimeline } from "@/components/account/OrderTimeline";

export const metadata: Metadata = { title: "Λεπτομέρειες παραγγελίας" };

export default async function OrderDetail({ params }: { params: Promise<{ no: string }> }) {
  const { no } = await params;
  const me = await requireCustomer("/logariasmos/paraggelies");
  const o = await accountOrder(me.id, decodeURIComponent(no));
  if (!o) notFound();
  const returnable = o.channel === "eshop" && ["paid", "processing", "shipped", "ready-for-pickup", "delivered"].includes(o.status);
  return (
    <div className="grid grid-cols-1 gap-4">
      <Link href="/logariasmos/paraggelies" className="font-bold text-eu-blue text-[length:var(--fs-15)] hover:underline">
        ← Όλες οι παραγγελίες
      </Link>
      <div className="bg-white rounded-xl border border-eu-line p-5">
        <OrderTimeline order={o} />
      </div>
      <div className="grid grid-cols-1 @md:grid-cols-2 gap-3">
        <div className="bg-eu-surface rounded-xl p-4 text-[length:var(--fs-15)]">
          <div className="font-extrabold text-eu-ink text-[length:var(--fs-13-5)] tracking-wide mb-1">Παράδοση</div>
          {o.address ? (
            <p className="m-0 text-eu-ink-2">
              {o.address.firstName} {o.address.lastName}
              <br />
              {o.address.street} {o.address.number}
              {o.address.floor ? `, ${o.address.floor}` : ""}, {o.address.zip} {o.address.city}
            </p>
          ) : (
            <p className="m-0 text-eu-ink-2">{o.pickupStore}</p>
          )}
          {o.invoice && (
            <p className="m-0 mt-2 text-eu-ink-2">
              Τιμολόγιο: {o.invoice.company} · ΑΦΜ {o.invoice.vat} · ΔΟΥ {o.invoice.doy}
            </p>
          )}
        </div>
        <div className="bg-eu-surface rounded-xl p-4 grid gap-2">
          <div className="font-extrabold text-eu-ink text-[length:var(--fs-13-5)] tracking-wide">Ενέργειες</div>
          <div className="flex flex-wrap gap-2">
            {returnable ? (
              <Link href={`/logariasmos/epistrofes?order=${encodeURIComponent(o.number)}`} className="rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 inline-flex items-center hover:bg-white">
                Αίτημα επιστροφής
              </Link>
            ) : (
              <span className="text-eu-ink-3 text-[length:var(--fs-14)]">{o.channel === "store" ? "Για επιστροφή ή αλλαγή, πήγαινε στο κατάστημα με την απόδειξη." : o.channel === "legacy" ? "Παραγγελία του παλιού e-shop — για επιστροφή ή ερώτηση, επικοινώνησε μαζί μας." : "Δεν υπάρχουν διαθέσιμες ενέργειες για αυτή την παραγγελία."}</span>
            )}
            <Link href="/epikoinonia" className="rounded-full border-2 border-eu-line text-eu-ink-2 font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 inline-flex items-center hover:border-eu-blue">
              Επικοινωνία για την παραγγελία
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
