import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { GdprAdmin } from "@/components/admin/customers/GdprAdmin";
import { StatTile } from "@/components/admin/charts/Charts";

export const metadata = { title: "GDPR" };
export const dynamic = "force-dynamic";
const isOverdue = (due: Date) => due.getTime() < Date.now();

export default async function GdprPage() {
  await requirePermission("customers.read");
  const rows = await db.gdprRequest.findMany({ orderBy: [{ status: "asc" }, { dueAt: "asc" }], include: { customer: { select: { id: true, firstName: true, lastName: true } } } });
  const open = rows.filter((r) => !["done", "rejected"].includes(r.status));
  const overdue = open.filter((r) => isOverdue(r.dueAt)).length;
  const [consents, logins, texts] = await Promise.all([db.consent.count(), db.loginEvent.count(), db.consentText.findMany({ where: { active: true }, orderBy: [{ key: "asc" }, { effectiveFrom: "desc" }] })]);
  return (
    <>
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Προσωπικά δεδομένα</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">GDPR — αιτήματα & αποδεικτικά</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">Αιτήματα υποκειμένων (πρόσβαση, φορητότητα, διόρθωση, διαγραφή, περιορισμός, εναντίωση, ανάκληση) με προθεσμία 30 ημερών, ταυτοποίηση και χρονολόγιο ενεργειών. Το ledger συναινέσεων και τα logins είναι τα αποδεικτικά προς την Αρχή.</p>
      </div>
      <div className="grid grid-cols-2 @lg:grid-cols-4 gap-3">
        <StatTile label="Ανοιχτά αιτήματα" value={String(open.length)} sub={overdue ? `${overdue} εκπρόθεσμα` : "κανένα εκπρόθεσμο"} accent />
        <StatTile label="Εγγραφές ledger συναινέσεων" value={consents.toLocaleString("el-GR")} />
        <StatTile label="Καταγεγραμμένες συνδέσεις" value={logins.toLocaleString("el-GR")} />
        <StatTile label="Ενεργά κείμενα συναίνεσης" value={String(texts.length)} sub={texts[0] ? `έκδοση ${texts[0].version}` : undefined} />
      </div>
      <GdprAdmin rows={rows.map((r) => ({ id: r.id, number: r.number, email: r.email, type: r.type, status: r.status, channel: r.channel, description: r.description, identityMethod: r.identityMethod, identityVerifiedAt: r.identityVerifiedAt?.toISOString() ?? null, requestedAt: r.requestedAt.toISOString(), dueAt: r.dueAt.toISOString(), completedAt: r.completedAt?.toISOString() ?? null, outcome: r.outcome, timeline: (r.timeline as { at: string; status: string; note?: string; by?: string }[] | null) ?? [], customer: r.customer ? { id: r.customer.id, name: `${r.customer.lastName} ${r.customer.firstName}` } : null }))} />
      <section className="rounded-2xl bg-white border border-eu-line p-4 grid gap-2">
        <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Κείμενα συναίνεσης σε ισχύ</h3>
        <ul className="m-0 p-0 list-none grid gap-2 text-[length:var(--fs-14)]">{texts.map((t) => <li key={t.id} className="border-t border-eu-line-2 pt-2"><div className="font-bold">{t.title} <span className="text-eu-muted font-normal">· {t.key} · v{t.version} · από {t.effectiveFrom.toLocaleDateString("el-GR")}</span></div><div className="text-eu-ink-2">{t.text}</div><div className="text-eu-muted font-mono text-[length:var(--fs-13)] break-all">sha256 {t.hash}</div></li>)}</ul>
        <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Αλλαγή κειμένου = νέα έκδοση (prisma/seed-gdpr.ts ή CMS αργότερα). Οι παλιές συναινέσεις κρατούν την έκδοση και το hash που είδε ο χρήστης.</p>
      </section>
    </>
  );
}
