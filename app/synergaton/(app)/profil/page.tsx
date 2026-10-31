import { History, KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { db } from "@/lib/db";
import { requirePortalUser } from "@/lib/partner-portal/session";
import { roleLabel } from "@/lib/partner-portal/contact-roles";
import { ChangePassword } from "@/components/synergaton/ChangePassword";
import { ago, Card, CardHead, fmtDateTime, PageHead } from "@/components/synergaton/ui";

export const metadata = { title: "Προφίλ & ασφάλεια" };
const ENTITY: Record<string, string> = { Store: "Κατάστημα", PartnerConnection: "Σύνδεση", PartnerContact: "Επαφή", Partner: "Μέλος" };
const FIELD: Record<string, string> = { phone: "σταθερό", mobile: "κινητό", email: "email", hours: "ωράριο", services: "υπηρεσίες", notes: "σημείωμα", "config.map": "αντιστοίχιση στηλών", locationMap: "αντιστοίχιση καταστημάτων" };

export default async function ProfilePage() {
  const u = await requirePortalUser();
  const [acc, contacts, changes, stores, conns] = await Promise.all([
    db.partnerAccount.findUnique({ where: { id: u.accountId }, select: { lastLoginAt: true, passwordAt: true, createdAt: true } }),
    db.partnerContact.findMany({ where: { partnerId: u.partner.id }, orderBy: [{ isPrimary: "desc" }, { name: "asc" }], select: { id: true, name: true, role: true, isPrimary: true, account: { select: { active: true } } } }),
    db.partnerChange.findMany({ where: { partnerId: u.partner.id }, orderBy: { createdAt: "desc" }, take: 40 }),
    db.store.findMany({ where: { partnerId: u.partner.id }, select: { id: true, name: true } }),
    db.partnerConnection.findMany({ where: { partnerId: u.partner.id }, select: { id: true, label: true } }),
  ]);
  const names = new Map([...stores.map((s) => [s.id, s.name] as const), ...conns.map((c) => [c.id, c.label ?? "Σύνδεση"] as const)]);
  const who = new Map((await db.partnerAccount.findMany({ where: { contact: { partnerId: u.partner.id } }, select: { id: true, contact: { select: { name: true } } } })).map((a) => [a.id, a.contact.name]));
  const dl = (k: string, v: string | null | undefined) => <div className="min-w-0"><dt className="text-eu-ink-3 text-[length:var(--fs-13)]">{k}</dt><dd className="m-0 font-bold text-[length:var(--fs-15)] break-words">{v || "—"}</dd></div>;
  return (
    <div className="grid gap-5 min-w-0">
      <PageHead eyebrow="Λογαριασμός" title="Προφίλ & ασφάλεια" sub="Τα στοιχεία σας, ο κωδικός και ποιος άλλαξε τι στον λογαριασμό του μέλους." />
      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <Card data-help="portal.profile-me">
          <CardHead icon={UserRound} title={u.name} sub={roleLabel(u.role) || "Επαφή μέλους"} />
          <dl className="m-0 grid gap-3 sm:grid-cols-2 px-4 sm:px-5 py-4">
            {dl("Email σύνδεσης", u.email)}{dl("Μέλος", `${u.partner.name}${u.partner.code ? ` · ${u.partner.code}` : ""}`)}
            {dl("Τελευταία είσοδος", acc?.lastLoginAt ? fmtDateTime(acc.lastLoginAt) : null)}{dl("Κωδικός από", acc?.passwordAt ? ago(acc.passwordAt) : null)}
          </dl>
          <p className="m-0 px-4 sm:px-5 pb-4 text-eu-ink-3 text-[length:var(--fs-13)]">Για αλλαγή ονόματος ή email σύνδεσης, ή για νέο χρήστη, μιλήστε με τον υπεύθυνο συνεργατών της Euronics.</p>
        </Card>
        <Card data-help="portal.profile-contacts">
          <CardHead icon={ShieldCheck} title="Χρήστες του μέλους" sub="Ποιοι έχουν πρόσβαση στην πύλη" />
          <ul className="m-0 p-0 list-none divide-y divide-eu-line">
            {contacts.map((c) => <li key={c.id} className="px-4 sm:px-5 py-3 flex items-center justify-between gap-2 text-[length:var(--fs-14)]"><span className="min-w-0"><b className="break-words">{c.name}</b>{c.role && <span className="text-eu-ink-3"> · {roleLabel(c.role)}</span>}{c.isPrimary && <span className="text-eu-ink-3"> · κύρια επαφή</span>}</span><span className="text-eu-ink-3 text-[length:var(--fs-13)] shrink-0">{c.account ? (c.account.active ? "με πρόσβαση" : "ανενεργός") : "χωρίς πρόσβαση"}</span></li>)}
          </ul>
        </Card>
      </div>
      <section data-help="portal.profile-password" className="grid gap-2">
        <h2 className="m-0 font-heading font-extrabold text-[length:var(--fs-20)] flex items-center gap-2"><KeyRound className="size-5" aria-hidden /> Αλλαγή κωδικού</h2>
        <ChangePassword email={u.email} />
      </section>
      <Card data-help="portal.profile-changes">
        <CardHead icon={History} title="Ιστορικό αλλαγών" sub="Αλλαγές σε καταστήματα και συνδέσεις — από εσάς ή από την Euronics" />
        <ol className="m-0 p-0 list-none divide-y divide-eu-line">
          {changes.map((c) => <li key={c.id} className="px-4 sm:px-5 py-3 text-[length:var(--fs-14)] flex flex-wrap gap-x-2"><b>{ENTITY[c.entity] ?? c.entity} «{names.get(c.entityId) ?? "—"}»</b><span>· {FIELD[c.field] ?? c.field}</span><span className="text-eu-ink-3">· {c.accountId ? who.get(c.accountId) ?? "Μέλος" : c.staffId ? "Euronics" : "—"} · {fmtDateTime(c.createdAt)}</span></li>)}
          {!changes.length && <li className="px-4 sm:px-5 py-4 text-eu-ink-3 text-[length:var(--fs-14)]">Καμία αλλαγή ακόμη.</li>}
        </ol>
      </Card>
    </div>
  );
}
