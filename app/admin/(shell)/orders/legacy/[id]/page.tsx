import Link from "next/link";
import { notFound } from "next/navigation";
import Image from "@/components/ui/Image";
import { ArrowLeft, FileText, MapPin, Package, Phone, User } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { legacyOrder } from "@/lib/orders/legacy";
import { LegacyBadge, LegacyStatusBadge, eur } from "@/components/admin/orders/ui";
import { SoftonePanel } from "@/components/admin/orders/chain/OrderTabs";
import { legacyChainAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Παραγγελία παλιού eshop" };

const KIND: Record<string, string> = { receipt: "Απόδειξη", invoice: "Τιμολόγιο", credit: "Πιστωτικό", order: "Παραγγελία" };
const d = (x: Date) => x.toLocaleDateString("el-GR");

/** Παραγγελία του παλιού eshop (από το SoftOne): στοιχεία μόνο για ανάγνωση και η πορεία της σε διάγραμμα. */
export default async function LegacyOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("orders.read");
  const p = await legacyOrder((await params).id);
  if (!p) notFound();
  const r = (p.recipient ?? {}) as { name?: string; phone?: string; address?: string; afm?: string; company?: string };
  const number = p.docNo || String(p.s1Findoc);
  const name = r.name || [p.customer?.firstName, p.customer?.lastName].filter(Boolean).join(" ") || "Πελάτης λιανικής";
  return (
    <div className="@container grid gap-3 min-w-0">
      <div data-help="orders.legacy.header" className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Link href="/admin/orders?v=legacy" className="inline-flex items-center gap-1 text-eu-ink-3 hover:text-eu-navy font-bold text-[length:var(--fs-13)] min-h-11"><ArrowLeft className="size-4" aria-hidden /> Παραγγελίες</Link>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)] font-mono break-all">{number}</h2>
        <LegacyBadge />
        <LegacyStatusBadge status={p.status ?? "pending"} />
        <span className="text-eu-ink-3 text-[length:var(--fs-13)]">{d(p.date)} · {p.seriesName}</span>
        <span className="ml-auto font-heading font-extrabold text-eu-ink text-[length:var(--fs-20)] tabular-nums">{eur(Number(p.total ?? 0))}</span>
      </div>
      <p className="m-0 rounded-xl bg-eu-amber/10 text-eu-ink-2 px-3 py-2 text-[length:var(--fs-13)]">Έγινε στο παλιό eshop. Τα στοιχεία έρχονται από το SoftOne και εδώ μόνο διαβάζονται: οι αλλαγές γίνονται στο ERP.</p>

      <div className="grid gap-3 @3xl:grid-cols-[minmax(0,1fr)_18rem] items-start">
        <section data-help="orders.legacy.lines" aria-label="Προϊόντα" className="rounded-xl border border-eu-line bg-white p-3 grid gap-2 min-w-0">
          <h3 className="m-0 inline-flex items-center gap-1.5 font-bold text-eu-ink text-[length:var(--fs-14)]"><Package className="size-4 text-eu-blue" aria-hidden /> Προϊόντα</h3>
          <ul className="m-0 p-0 list-none divide-y divide-eu-line-2">
            {p.lines.map((l) => {
              const t = l.productId ? p.thumbs[l.productId] : null;
              return (
                <li key={l.id} className="flex items-center gap-2.5 py-2 min-w-0 text-[length:var(--fs-13)]">
                  <span className="relative size-10 shrink-0 rounded-md bg-eu-surface overflow-hidden">{t && <Image src={t} alt="" fill sizes="40px" className="object-contain" unoptimized={t.startsWith("http")} />}</span>
                  <span className="grid min-w-0 grow leading-tight">
                    {l.productId ? <Link href={`/admin/catalog/${l.productId}`} className="text-eu-blue hover:underline break-words">{l.title}</Link> : <span className="break-words">{l.title}</span>}
                    <span className="text-eu-muted text-[length:var(--fs-12)] tabular-nums">{l.code ?? ""} · {l.qty} τεμ.{l.unitPrice != null ? ` × ${eur(Number(l.unitPrice))}` : ""}</span>
                  </span>
                  <span className="tabular-nums font-bold shrink-0">{l.lineTotal != null ? eur(Number(l.lineTotal)) : "—"}</span>
                </li>
              );
            })}
          </ul>
          <dl className="m-0 grid gap-0.5 justify-self-end text-[length:var(--fs-13)] tabular-nums text-right">
            {p.net != null && <div className="flex gap-3 justify-end"><dt className="text-eu-muted">Καθαρή αξία</dt><dd className="m-0">{eur(Number(p.net))}</dd></div>}
            {p.vat != null && <div className="flex gap-3 justify-end"><dt className="text-eu-muted">ΦΠΑ</dt><dd className="m-0">{eur(Number(p.vat))}</dd></div>}
            <div className="flex gap-3 justify-end font-bold"><dt>Σύνολο</dt><dd className="m-0">{eur(Number(p.total ?? 0))}</dd></div>
          </dl>
        </section>

        <aside className="grid gap-3 min-w-0">
          <section data-help="orders.legacy.customer" aria-label="Πελάτης" data-private className="rounded-xl border border-eu-line bg-white p-3 grid gap-1.5 text-[length:var(--fs-13)] min-w-0">
            <h3 className="m-0 inline-flex items-center gap-1.5 font-bold text-eu-ink text-[length:var(--fs-14)]"><User className="size-4 text-eu-blue" aria-hidden /> Πελάτης</h3>
            <span className="font-bold text-eu-ink-2 break-words">{name}{r.company ? ` · ${r.company}` : ""}</span>
            {r.phone && <span className="inline-flex items-center gap-1.5"><Phone className="size-3.5 text-eu-muted" aria-hidden /><a href={`tel:${r.phone}`} className="text-eu-blue hover:underline">{r.phone}</a></span>}
            {r.address && <span className="inline-flex items-start gap-1.5 break-words"><MapPin className="size-3.5 mt-0.5 shrink-0 text-eu-muted" aria-hidden />{r.address}</span>}
            {r.afm && <span>ΑΦΜ {r.afm}</span>}
            {p.customer && <Link href={`/admin/customers/${p.customer.id}`} className="text-eu-blue font-bold hover:underline">Καρτέλα πελάτη →</Link>}
          </section>
          <section data-help="orders.legacy.docs" aria-label="Παραστατικά" className="rounded-xl border border-eu-line bg-white p-3 grid gap-1.5 text-[length:var(--fs-13)] min-w-0">
            <h3 className="m-0 inline-flex items-center gap-1.5 font-bold text-eu-ink text-[length:var(--fs-14)]"><FileText className="size-4 text-eu-blue" aria-hidden /> Παραστατικά</h3>
            {p.docs.length ? <ul className="m-0 p-0 list-none grid gap-1">{p.docs.map((x) => <li key={x.id} className="flex gap-2 justify-between min-w-0"><span className="min-w-0 break-words">{KIND[x.kind] ?? x.kind} {x.docNo} <span className="text-eu-muted">· {d(x.date)}</span></span><span className="tabular-nums shrink-0">{x.total != null ? eur(Number(x.total)) : ""}</span></li>)}</ul> : <p className="m-0 text-eu-muted">Δεν έχει συνδεθεί παραστατικό εδώ. Όλη η διαδρομή στο SoftOne φαίνεται παρακάτω.</p>}
          </section>
        </aside>
      </div>

      <SoftonePanel load={legacyChainAction.bind(null, p.id)} number={number} />
    </div>
  );
}
