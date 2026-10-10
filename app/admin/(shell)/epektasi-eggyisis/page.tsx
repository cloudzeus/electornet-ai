import { ShieldCheck, Mail, CreditCard } from "lucide-react";
import { can } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { catalogTree, type CatNode } from "@/lib/data/db-catalog";
import { getExtPricing } from "@/lib/warranty/pricing";
import { runWarrantyReminders } from "@/lib/warranty/remind";
import { ExtPricingForm } from "./ExtPricingForm";

export const metadata = { title: "Επέκταση εγγύησης" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; tone: string }> = {
  paid: { label: "Πληρώθηκε", tone: "bg-eu-green/10 text-eu-green" },
  pending: { label: "Αναμένει πληρωμή", tone: "bg-eu-amber/15 text-eu-ink-2" },
  processing: { label: "Σε εξέλιξη", tone: "bg-eu-amber/15 text-eu-ink-2" },
  review: { label: "Έλεγχος (επιστροφή χρημάτων;)", tone: "bg-eu-red/10 text-eu-red" },
  failed: { label: "Απέτυχε", tone: "bg-eu-surface text-eu-muted" },
  cancelled: { label: "Ακυρώθηκε", tone: "bg-eu-surface text-eu-muted" },
};
const eur = (n: number) => n.toLocaleString("el-GR", { style: "currency", currency: "EUR" });

/**
 * Επέκταση εγγύησης +2 έτη: δωρεάν στα είδη με CCCWARRANTY (SoftOne), επί πληρωμή στα υπόλοιπα με τις κλίμακες
 * αυτής της σελίδας. Οι πελάτες την αγοράζουν από «Οι συσκευές μου» όσο η εγγύηση είναι σε ισχύ, και λαμβάνουν
 * υπενθύμιση με email 60 ημέρες πριν τη λήξη.
 */
export default async function WarrantyExtensionAdmin() {
  const user = await requirePermission("catalog.products.read");
  const [pricing, tree, recent, totals, remind] = await Promise.all([
    getExtPricing(),
    catalogTree(),
    db.warrantyExtension.findMany({ orderBy: { createdAt: "desc" }, take: 30, select: { id: true, number: true, amount: true, status: true, createdAt: true, paidAt: true, device: { select: { brand: true, title: true } }, customer: { select: { number: true, firstName: true, lastName: true } } } }),
    db.warrantyExtension.groupBy({ by: ["status"], _count: { _all: true }, _sum: { amount: true } }),
    runWarrantyReminders({ dryRun: true }).catch(() => null),
  ]);
  const categories: { slug: string; label: string }[] = [];
  const walk = (n: CatNode, trail: string[]) => { const t = [...trail, n.name]; categories.push({ slug: n.slug, label: t.join(" › ") }); if (n.depth < 2) n.children.forEach((c) => walk(c, t)); };
  tree.roots.forEach((r) => walk(r, []));
  const paid = totals.find((t) => t.status === "paid");
  const tiles = [
    { Icon: CreditCard, label: "Πληρωμένες επεκτάσεις", value: String(paid?._count._all ?? 0), sub: eur(Number(paid?._sum.amount ?? 0)) },
    { Icon: Mail, label: "Υπενθυμίσεις (επόμενες 60 ημέρες)", value: remind ? String(remind.free + remind.paid) : "—", sub: remind ? `${remind.free} δωρεάν · ${remind.paid} επί πληρωμή · ${remind.alreadyReminded} έχουν σταλεί` : "δεν υπολογίστηκε" },
  ];
  return (
    <div className="grid gap-6 max-w-6xl">
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><ShieldCheck className="size-4" aria-hidden /> Εμπόριο</div>
        <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)]">Επέκταση εγγύησης</h1>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[75ch]">+2 έτη για αγορές Euronics (e-shop και καταστήματα) με ενεργή εγγύηση, μία φορά. Δωρεάν στα είδη με «Επέκταση Εγγύησης» (CCCWARRANTY) στο SoftOne· στα υπόλοιπα με πληρωμή μέσω Viva, με τιμή από τις κλίμακες παρακάτω. Οι πελάτες λαμβάνουν email 60 ημέρες πριν λήξει η εγγύηση, αν δεν έχουν αρνηθεί τις «Υπενθυμίσεις service & εγγύησης».</p>
      </div>
      <div className="grid grid-cols-1 @xl:grid-cols-2 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-eu-line bg-white p-4 flex items-start gap-3">
            <t.Icon className="size-5 text-eu-blue shrink-0 mt-0.5" aria-hidden />
            <div className="grid gap-0.5 min-w-0">
              <span className="text-eu-ink-3 font-bold text-[length:var(--fs-13)]">{t.label}</span>
              <span className="font-heading font-bold text-eu-ink text-[length:var(--fs-24)] tabular-nums leading-none">{t.value}</span>
              <span className="text-eu-ink-3 text-[length:var(--fs-13)]">{t.sub}</span>
            </div>
          </div>
        ))}
      </div>
      <section className="grid gap-3">
        <h2 className="m-0 font-bold text-eu-ink text-[length:var(--fs-19)]">Κλίμακες τιμών</h2>
        <ExtPricingForm initial={pricing} categories={categories} canWrite={can(user.permissions, "catalog.promos.write")} />
      </section>
      <section className="grid gap-3">
        <h2 className="m-0 font-bold text-eu-ink text-[length:var(--fs-19)]">Τελευταίες αγορές επέκτασης</h2>
        {recent.length === 0 ? (
          <p className="m-0 text-eu-muted text-[length:var(--fs-15)]">Δεν υπάρχουν ακόμη αγορές επέκτασης επί πληρωμή.</p>
        ) : (
          <ul className="m-0 p-0 list-none grid gap-2">
            {recent.map((r) => {
              const st = STATUS[r.status] ?? { label: r.status, tone: "bg-eu-surface text-eu-muted" };
              return (
                <li key={r.id} className="rounded-xl border border-eu-line bg-white px-4 py-3 grid grid-cols-1 @xl:grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 gap-y-1 items-center text-[length:var(--fs-14)]">
                  <div className="min-w-0">
                    <div className="font-bold text-eu-ink truncate">{r.device.brand} {r.device.title}</div>
                    <div className="text-eu-ink-3">{r.number} · Πελάτης #{r.customer.number} {r.customer.firstName} {r.customer.lastName} · {r.createdAt.toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short" })}</div>
                  </div>
                  <span className="font-bold text-eu-ink tabular-nums">{eur(Number(r.amount))}</span>
                  <span className={`justify-self-start rounded-full px-2.5 py-1 font-bold text-[length:var(--fs-13)] ${st.tone}`}>{st.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
