import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FileText, ScrollText } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";

export const metadata = { title: "Παραστατικό · προσφορές" };
export const dynamic = "force-dynamic";

const eur = (v: unknown) => `${Number(v ?? 0).toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
type LinePromo = { promotionId: string; code: string; version: number; kind: string; amount: number; label: string };

/**
 * Ένα παραστατικό: κάθε γραμμή με τιμή καταλόγου, εκπτώσεις ανά είδος (DISC1/DISC2), τις προσφορές με κωδικό και
 * έκδοση, τους όρους όπως ίσχυαν τη στιγμή της παραγγελίας και το SALDOC όπως θα σταλεί στο SoftOne (προεπισκόπηση).
 */
export default async function OrderPromoPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("reports.read");
  const { id } = await params;
  const o = await db.order.findUnique({ where: { id }, include: { lines: { include: { addons: { include: { service: { select: { title: true } } } } } }, promoUsages: true, erpSync: true } });
  if (!o) notFound();
  const keys = [...new Map(o.promoUsages.map((u) => [`${u.promotionId}:${u.version}`, { promotionId: u.promotionId, version: u.version }])).values()];
  const versions = keys.length ? await db.promotionVersion.findMany({ where: { OR: keys } }) : [];
  const promos = keys.length ? await db.promotion.findMany({ where: { id: { in: keys.map((k) => k.promotionId) } }, select: { id: true, name: true, code: true } }) : [];
  const nameOf = new Map(promos.map((p) => [p.id, p]));
  const trace = (o.promoTrace as { name: string; applied: boolean; amount: number; reason: string }[] | null) ?? [];

  return (
    <div className="grid gap-5 min-w-0">
      <div>
        <Link href="/admin/prosfores/anafores" className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)] min-h-11 hover:underline"><ChevronLeft className="size-4" aria-hidden /> Αναφορές</Link>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)]">Παραγγελία {o.number}</h2>
        <div className="text-eu-ink-3 text-[length:var(--fs-14)]">{o.createdAt.toLocaleString("el-GR")} · {o.status} · {o.paymentMethod ?? "—"} · σύνολο <strong>{eur(o.total)}</strong> · έκπτωση <strong>{eur(o.discountTotal)}</strong>{o.couponCode && <> · κουπόνι <span className="font-mono font-bold">{o.couponCode}</span></>}</div>
      </div>

      <section className="rounded-2xl bg-white border border-eu-line overflow-x-auto">
        <table className="w-full text-[length:var(--fs-14)]">
          <thead className="text-left text-eu-muted text-[length:var(--fs-13)]"><tr><th className="py-2 px-3">Γραμμή</th><th className="py-2 px-3 text-right">Τιμή καταλόγου<br />PRICE</th><th className="py-2 px-3 text-right">Προσφορά<br />DISC1VAL</th><th className="py-2 px-3 text-right">Κουπόνι<br />DISC2VAL</th><th className="py-2 px-3 text-right">Τελικό</th><th className="py-2 px-3">Προσφορές (COMMENTS)</th></tr></thead>
          <tbody>
            {o.lines.map((l) => { const ps = (l.promotions as LinePromo[] | null) ?? []; return (
              <tr key={l.id} className="border-t border-eu-line align-top">
                <td className="py-2 px-3"><div className="font-semibold">{l.qty} × {l.title}</div><div className="text-eu-muted font-mono text-[length:var(--fs-13)]">{l.erpCode ?? "—"}{l.isGift ? " · δώρο / δωρεάν" : ""}</div>{l.addons.map((a) => <div key={a.id} className="text-eu-ink-3 text-[length:var(--fs-13)]">+ {a.service.title} {eur(a.price)}</div>)}</td>
                <td className="py-2 px-3 text-right tabular-nums">{eur(Number(l.listPrice ?? l.unitPrice) * l.qty)}</td>
                <td className="py-2 px-3 text-right tabular-nums">{Number(l.discPrice) ? `−${eur(l.discPrice)}` : "—"}</td>
                <td className="py-2 px-3 text-right tabular-nums">{Number(l.discCoupon) ? `−${eur(l.discCoupon)}` : "—"}</td>
                <td className="py-2 px-3 text-right tabular-nums font-bold">{eur(l.lineTotal ?? Number(l.unitPrice) * l.qty)}</td>
                <td className="py-2 px-3">{ps.length ? ps.map((p, i) => <div key={i}><span className="font-mono">{p.code} v{p.version}</span> · {p.label}</div>) : <span className="text-eu-muted">—</span>}</td>
              </tr>
            ); })}
          </tbody>
        </table>
      </section>

      <div className="grid grid-cols-1 @4xl:grid-cols-2 gap-4 items-start">
        <section className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid gap-3">
          <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-15)] inline-flex items-center gap-1.5"><ScrollText className="size-4" aria-hidden /> Όροι όπως ίσχυαν (COMMENTS1)</h3>
          {keys.length ? keys.map((k) => { const v = versions.find((x) => x.promotionId === k.promotionId && x.version === k.version); const s = v?.snapshot as { termsText?: string | null; name?: string } | undefined; const p = nameOf.get(k.promotionId); return (
            <div key={`${k.promotionId}:${k.version}`} className="rounded-xl border border-eu-line p-3 text-[length:var(--fs-14)]">
              <Link href={`/admin/prosfores/${k.promotionId}`} className="font-bold hover:underline">{s?.name ?? p?.name}</Link> <span className="font-mono text-eu-muted">{p?.code} v{k.version}</span>
              <p className="m-0 mt-1 text-eu-ink-3">{s?.termsText ?? "Χωρίς όρους."}</p>
            </div>
          ); }) : <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Καμία προσφορά σε αυτή την παραγγελία.</p>}
          {trace.length > 0 && (
            <details className="rounded-xl border border-eu-line p-3"><summary className="cursor-pointer font-bold text-eu-ink-2 text-[length:var(--fs-14)] min-h-8">Ίχνος της μηχανής ({trace.length})</summary>
              <ol className="m-0 mt-2 p-0 list-none grid gap-1 text-[length:var(--fs-14)]">{trace.map((t, i) => <li key={i}><strong className={t.applied ? "text-eu-green" : ""}>{t.applied ? "✓" : "✗"} {t.name}</strong> — {t.reason}</li>)}</ol>
            </details>
          )}
        </section>
        <section className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid gap-3 min-w-0">
          <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-15)] inline-flex items-center gap-1.5"><FileText className="size-4" aria-hidden /> Παραστατικό SoftOne · {o.erpSync?.status === "preview" ? "προεπισκόπηση (δεν στάλθηκε)" : o.erpSync?.status ?? "—"}</h3>
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Το SALDOC με τις γραμμές ITELINES όπως θα σταλεί. Η αποστολή στο SoftOne είναι απενεργοποιημένη μέχρι ρητή εντολή.</p>
          {o.erpSync?.payload ? <pre className="m-0 max-h-[480px] overflow-auto rounded-xl bg-eu-surface p-3 text-[length:var(--fs-13)] leading-snug">{JSON.stringify(o.erpSync.payload, null, 2)}</pre> : <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Δεν υπάρχει.</p>}
        </section>
      </div>
    </div>
  );
}
