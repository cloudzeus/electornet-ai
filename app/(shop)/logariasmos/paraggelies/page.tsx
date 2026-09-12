import type { Metadata } from "next";
import Link from "next/link";
import { getOrders } from "@/lib/data/repo";
import { StatusChip } from "@/components/account/OrderTimeline";
import { priceLong } from "@/lib/format";
import { ProductImage } from "@/components/commerce/ProductImage";
import { Reveal } from "@/components/motion/Reveal";

export const metadata: Metadata = { title: "Οι παραγγελίες μου" };

export default async function OrdersPage() {
  const orders = await getOrders();
  return (
    <div className="grid grid-cols-1 gap-4">
      <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)]">Παραγγελίες</h1>
      <Reveal as="ul" className="m-0 p-0 list-none grid gap-3" stagger={0.07}>
        {orders.map((o) => (
          <li key={o.number} data-reveal className="bg-white rounded-2xl border border-eu-line p-4 grid grid-cols-1 @md:grid-cols-[auto_minmax(0,1fr)_auto] gap-4 items-center hover:border-eu-blue hover:shadow-[var(--shadow-raised)] transition-all">
            <div className="flex -space-x-3">
              {o.lines.slice(0, 3).map((l, i) => (
                <ProductImage key={`${l.productId}-${i}`} src={l.image} sizes="56px" className="size-14 ring-2 ring-white" rounded="rounded-full" />
              ))}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-extrabold text-eu-ink text-[length:var(--fs-16)]">{o.number}</span>
                <StatusChip status={o.status} />
                <span className="text-eu-muted text-[length:var(--fs-14)]">{new Date(o.date).toLocaleDateString("el-GR")}</span>
              </div>
              <div className="text-eu-ink-2 text-[length:var(--fs-15)]">{o.lines.map((l) => `${l.qty} × ${l.brand} ${l.title}`).join(" · ")}</div>
              <div className="text-eu-muted text-[length:var(--fs-14)] mt-0.5">
                {o.fulfilment === "click-collect" ? "Παραλαβή από κατάστημα" : o.fulfilment === "appointment" ? "Παράδοση με ραντεβού" : "Courier"} · {o.payment.method}
              </div>
            </div>
            <div className="flex items-center gap-3 @md:flex-col @md:items-end">
              <span className="font-extrabold text-eu-ink text-[length:var(--fs-16)]">{priceLong(o.total)}</span>
              <Link href={`/logariasmos/paraggelies/${o.number}`} className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-10 inline-flex items-center hover:bg-eu-blue">
                Λεπτομέρειες
              </Link>
            </div>
          </li>
        ))}
      </Reveal>
    </div>
  );
}
