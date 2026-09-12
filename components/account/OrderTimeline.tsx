import type { Order } from "@/lib/data/types";
import { priceLong } from "@/lib/format";
import { ProductImage } from "@/components/commerce/ProductImage";

const STATUS: Record<Order["status"], { label: string; tone: string }> = {
  pending: { label: "Αναμονή πληρωμής", tone: "bg-eu-amber/15 text-eu-amber" },
  paid: { label: "Πληρωμένη", tone: "bg-eu-chip text-eu-blue" },
  processing: { label: "Σε επεξεργασία", tone: "bg-eu-chip text-eu-blue" },
  shipped: { label: "Σε διανομή", tone: "bg-eu-chip text-eu-blue" },
  "ready-for-pickup": { label: "Έτοιμη για παραλαβή", tone: "bg-eu-green/10 text-eu-green" },
  delivered: { label: "Παραδόθηκε", tone: "bg-eu-green/10 text-eu-green" },
  cancelled: { label: "Ακυρώθηκε", tone: "bg-eu-red/10 text-eu-red" },
  returned: { label: "Επιστράφηκε", tone: "bg-eu-surface text-eu-muted" },
};

export function StatusChip({ status }: { status: Order["status"] }) {
  const s = STATUS[status];
  return <span className={`inline-block rounded-full px-2.5 py-1 font-bold text-[length:var(--fs-13-5)] ${s.tone}`}>{s.label}</span>;
}

/** Order header + courier timeline + lines. Used by tracking and account order detail. */
export function OrderTimeline({ order: o }: { order: Order }) {
  const steps = ["Καταχωρήθηκε", "Πληρώθηκε", o.fulfilment === "click-collect" ? "Έτοιμη στο κατάστημα" : "Σε διανομή", o.fulfilment === "click-collect" ? "Παραλήφθηκε" : "Παραδόθηκε"];
  const idx = o.status === "pending" ? 0 : o.status === "paid" || o.status === "processing" ? 1 : o.status === "shipped" || o.status === "ready-for-pickup" ? 2 : 3;
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-19)]">Παραγγελία {o.number}</h2>
          <div className="text-eu-muted text-[length:var(--fs-14)]">{new Date(o.date).toLocaleDateString("el-GR", { day: "numeric", month: "long", year: "numeric" })}</div>
        </div>
        <StatusChip status={o.status} />
      </div>
      <ol className="m-0 p-0 list-none grid grid-cols-4 gap-1">
        {steps.map((s, i) => (
          <li key={s} className="grid gap-1.5">
            <span className="h-1.5 rounded-full bg-eu-line overflow-hidden" aria-hidden>
              {i <= idx && <span className="block h-full w-full rounded-full bg-eu-green origin-left animate-[eu-grow_.7s_var(--eu-ease-out)_both]" style={{ animationDelay: `${i * 0.15}s` }} />}
            </span>
            <span className={`text-[length:var(--fs-13)] font-semibold ${i <= idx ? "text-eu-ink" : "text-eu-muted-2"}`}>{s}</span>
          </li>
        ))}
      </ol>
      {o.tracking && (
        <div className="rounded-lg bg-eu-surface p-4">
          <div className="flex flex-wrap justify-between gap-2 text-[length:var(--fs-14)] mb-2">
            <span className="font-bold text-eu-ink">
              {o.tracking.courier} · {o.tracking.code}
            </span>
            <a href={o.tracking.url} target="_blank" rel="noreferrer" className="text-eu-blue font-bold underline">
              Άνοιγμα στον courier
            </a>
          </div>
          <ul className="m-0 p-0 list-none grid gap-1.5 text-[length:var(--fs-14)]">
            {[...o.tracking.events].reverse().map((e) => (
              <li key={e.date} className="grid grid-cols-[120px_1fr] gap-2">
                <span className="text-eu-muted-2 tabular-nums">{e.date}</span>
                <span className="text-eu-ink-2">{e.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {o.pickupStore && <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)]">Παραλαβή από: {o.pickupStore}</p>}
      <ul className="m-0 p-0 list-none divide-y divide-eu-line-2">
        {o.lines.map((l) => (
          <li key={l.productId} className="flex gap-3 py-2.5 items-center text-[length:var(--fs-15)]">
            <ProductImage src={l.image} sizes="48px" className="size-12" rounded="rounded-md" />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-eu-ink">
                {l.brand} {l.title}
              </div>
              {l.addons?.map((a) => (
                <div key={a.slug} className="text-eu-blue text-[length:var(--fs-13-5)]">
                  + {a.title} · {priceLong(a.price)}
                </div>
              ))}
            </div>
            <div className="text-eu-ink-2">
              {l.qty} × {priceLong(l.unitPrice)}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex justify-between font-extrabold text-eu-ink text-[length:var(--fs-17)] border-t border-eu-line pt-2">
        <span>Σύνολο ({o.payment.method}{o.payment.instalments ? `, ${o.payment.instalments} δόσεις` : ""})</span>
        <span>{priceLong(o.total)}</span>
      </div>
    </div>
  );
}
