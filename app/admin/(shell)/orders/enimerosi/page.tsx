import Link from "next/link";
import { BellRing } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { DOC_CATEGORIES } from "@/lib/softone/lookups";
import { PLACEHOLDERS } from "@/lib/orders/erp-stages-core";
import { StageSettings, type StageRow } from "@/components/admin/orders/StageSettings";
import { saveStageSettingAction } from "../actions";

export const metadata = { title: "Ρυθμίσεις ενημέρωσης" };
export const dynamic = "force-dynamic";

// σειρά όπως προχωρά μια παραγγελία: παραγγελία → δελτίο → παραστατικό → πιστωτικά
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5);
const ORDER = ["201", "202", "500", "101", "103", "104", "154", "102", "131", "151", "181"];

/** Παραγγελίες → Ρυθμίσεις ενημέρωσης: ποια στάδια στο SoftOne στέλνουν email στον πελάτη και με ποιο κείμενο. */
export default async function StageSettingsPage() {
  await requirePermission("orders.write");
  const since = daysAgo(30);
  const [types, seen, sent] = await Promise.all([
    db.docType.findMany({ where: { eshop: true, OR: [{ active: true, s1Missing: false }, { notifyCustomer: true }] }, select: { id: true, code: true, name: true, category: true, notifyCustomer: true, customerTitle: true, customerMessage: true } }),
    db.orderErpStage.groupBy({ by: ["fprms"], where: { seenAt: { gte: since } }, _count: { _all: true } }),
    db.orderErpStage.groupBy({ by: ["fprms"], where: { notifiedAt: { gte: since } }, _count: { _all: true } }),
  ]);
  const count = (rows: typeof seen, code: string) => rows.find((r) => r.fprms === code)?._count._all ?? 0;
  const label = new Map(DOC_CATEGORIES.map((c) => [c.value, c.label]));
  const rank = (c: string | null) => { const i = ORDER.indexOf(c ?? ""); return i < 0 ? 99 : i; };
  const rows: StageRow[] = types
    .sort((a, b) => rank(a.category) - rank(b.category) || a.name.localeCompare(b.name, "el"))
    .map((t) => ({ id: t.id, code: t.code, name: t.name, category: t.category, categoryLabel: label.get(t.category ?? "") ?? null, notify: t.notifyCustomer, title: t.customerTitle ?? "", message: t.customerMessage ?? "", seen30: count(seen, t.code), sent30: count(sent, t.code) }));
  const on = rows.filter((r) => r.notify).length;

  return (
    <div className="@container grid gap-4 min-w-0 max-w-5xl">
      <div data-help="orders.stages.header" className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)] inline-flex items-center gap-2"><BellRing className="size-5 text-eu-blue" aria-hidden /> Ρυθμίσεις ενημέρωσης</h2>
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] max-w-[70ch]">Διάλεξε ποια στάδια της παραγγελίας στο SoftOne στέλνουν email στον πελάτη και γράψε το κείμενο που τα συνοδεύει.</p>
        </div>
        <span className="rounded-full bg-eu-chip text-eu-navy font-bold px-3 py-1 text-[length:var(--fs-13)]">{on ? `${on} από ${rows.length} στάδια ενημερώνουν` : "Κανένα στάδιο δεν ενημερώνει ακόμη"}</span>
      </div>

      <section data-help="orders.stages.how" className="rounded-2xl border border-eu-line bg-white p-4 grid gap-3 @3xl:grid-cols-2 text-[length:var(--fs-14)]">
        <div className="grid gap-1.5 min-w-0">
          <h3 className="m-0 font-bold text-eu-ink text-[length:var(--fs-15)]">Πώς δουλεύει</h3>
          <ul className="m-0 pl-5 list-disc grid gap-1 text-eu-ink-3">
            <li>Κάθε 15 λεπτά ελέγχεται στο SoftOne η πορεία των παραγγελιών των τελευταίων 30 ημερών (μόνο ανάγνωση).</li>
            <li>Όταν εμφανιστεί νέο παραστατικό ενός επιλεγμένου τύπου, ο πελάτης παίρνει email με τον τίτλο και το κείμενο που γράφεις εδώ.</li>
            <li>Μία φορά ανά τύπο σε κάθε παραγγελία. Παραστατικά παλαιότερα των 2 ημερών δεν στέλνουν email.</li>
            <li>Η ίδια η παραγγελία (το πρώτο παραστατικό) δεν στέλνει: ο πελάτης έχει ήδη την επιβεβαίωση του checkout.</li>
            <li>Τα email φαίνονται στη σελίδα κάθε παραγγελίας. <Link href="/admin/emails/order-erp-stage" className="text-eu-blue font-bold hover:underline">Δες την εμφάνιση του email →</Link></li>
          </ul>
        </div>
        <div className="grid gap-1.5 min-w-0 content-start">
          <h3 className="m-0 font-bold text-eu-ink text-[length:var(--fs-15)]">Μεταβλητές στο κείμενο</h3>
          <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">{PLACEHOLDERS.map((p) => <div key={p.key} className="contents"><dt className="font-mono text-eu-navy">{`{${p.key}}`}</dt><dd className="m-0 text-eu-ink-3">{p.help}</dd></div>)}</dl>
          <p className="m-0 mt-1 rounded-lg bg-eu-amber/10 text-eu-ink px-3 py-2 text-[length:var(--fs-13)]">Προσοχή στα διπλά: το «Στάλθηκε» με courier φεύγει ήδη αυτόματα από το voucher, και η ακύρωση όταν την κάνεις από τη σελίδα της παραγγελίας.</p>
        </div>
      </section>

      <StageSettings rows={rows} save={saveStageSettingAction} />
    </div>
  );
}
