import { ERP_STATUS, ORDER_STATUS, PAYMENT_STATUS, RETURN_STATUS, type Tone } from "@/lib/orders/model";

/** Κοινά μικρά στοιχεία των σελίδων παραγγελιών (λίστα, καρτέλα). */
export const TONE: Record<Tone, string> = {
  neutral: "bg-eu-surface text-eu-ink-3", info: "bg-eu-chip text-eu-blue", good: "bg-eu-green/12 text-eu-green",
  warn: "bg-eu-amber/15 text-eu-ink-2", bad: "bg-eu-red/10 text-eu-red",
};
export function Badge({ tone, children, title, className = "" }: { tone: Tone; children: React.ReactNode; title?: string; className?: string }) {
  return <span title={title} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-12)] whitespace-nowrap ${TONE[tone]} ${className}`}>{children}</span>;
}
export const OrderStatusBadge = ({ status }: { status: string }) => {
  const s = ORDER_STATUS[status as keyof typeof ORDER_STATUS];
  return <Badge tone={s?.tone ?? "neutral"} title={s?.help}>{s?.label ?? status}</Badge>;
};
export const PaymentBadge = ({ status }: { status: string | null }) => {
  if (!status) return null;
  const s = PAYMENT_STATUS[status];
  return <Badge tone={s?.tone ?? "neutral"}>{s?.label ?? status}</Badge>;
};
export const ErpBadge = ({ status }: { status: string | null }) => {
  if (!status) return <Badge tone="neutral">Χωρίς παραστατικό</Badge>;
  const s = ERP_STATUS[status];
  return <Badge tone={s?.tone ?? "neutral"} title={s?.help}>{s?.label ?? status}</Badge>;
};
export const ReturnBadge = ({ status }: { status: string }) => {
  const s = RETURN_STATUS[status];
  return <Badge tone={s?.tone ?? "neutral"}>{s?.label ?? status}</Badge>;
};

export const eur = (n: number) => n.toLocaleString("el-GR", { style: "currency", currency: "EUR" });
export const dateTime = (d: string | Date) => new Date(d).toLocaleString("el-GR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Athens" });
/** «πριν 5′» / «πριν 3 ώρες» / «χθες» / ημερομηνία */
export function ago(d: string | Date, now = Date.now()): string {
  const t = new Date(d).getTime(), m = Math.round((now - t) / 60000);
  if (m < 1) return "μόλις τώρα";
  if (m < 60) return `πριν ${m}′`;
  const h = Math.round(m / 60);
  if (h < 24) return `πριν ${h} ${h === 1 ? "ώρα" : "ώρες"}`;
  const days = Math.round(h / 24);
  if (days === 1) return "χθες";
  if (days < 7) return `πριν ${days} ημέρες`;
  return new Date(d).toLocaleDateString("el-GR", { day: "numeric", month: "short", year: new Date(d).getFullYear() === new Date().getFullYear() ? undefined : "numeric", timeZone: "Europe/Athens" });
}
