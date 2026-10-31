import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { cityKey } from "@/lib/b2b/partners-core";
import { BranchStoreLink } from "@/components/admin/partners/BranchStoreLink";
import { CreateBranchStore, StoreVisibility } from "@/components/admin/partners/PartnerStoreTools";
import { PartnerContacts } from "@/components/admin/partners/PartnerContacts";

export const metadata = { title: "Συνεργάτης" };
export const dynamic = "force-dynamic";

const MATCHED: Record<string, string> = { "email-branch": "αυτόματα, email υποκαταστήματος", "email-partner": "αυτόματα, email μέλους", manual: "με το χέρι", created: "νέο κατάστημα από το υποκατάστημα" };

/** Ένα μέλος: στοιχεία από το SoftOne (μόνο ανάγνωση) και τα υποκαταστήματά του με τη σύνδεση στα καταστήματα του eshop. */
export default async function PartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("stores.partners.read");
  const canWrite = can(user.permissions, "stores.partners.write");
  const { id } = await params;
  const [p, stores] = await Promise.all([
    db.partner.findUnique({ where: { id }, include: { branches: { orderBy: [{ s1Missing: "asc" }, { isCenter: "desc" }, { name: "asc" }], include: { store: { select: { id: true, name: true, city: true, slug: true, active: true, lat: true, lng: true } } } } } }),
    db.store.findMany({ orderBy: [{ city: "asc" }, { name: "asc" }], select: { id: true, name: true, city: true, zip: true, branch: { select: { id: true } } } }),
  ]);
  if (!p) notFound();
  const contacts = await db.partnerContact.findMany({
    where: { partnerId: p.id }, orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    include: { account: { select: { id: true, active: true, passwordHash: true, lastLoginAt: true, lockedUntil: true, tokens: { where: { purpose: "set", usedAt: null, expiresAt: { gt: new Date() } }, select: { expiresAt: true }, take: 1 } } } },
  });

  const field = (label: string, v: string | null | undefined) => (
    <div className="min-w-0"><dt className="text-eu-ink-3 text-[length:var(--fs-12)]">{label}</dt><dd className="m-0 break-words text-[length:var(--fs-14)]">{v || "—"}</dd></div>
  );

  return (
    <div className="grid gap-3 min-w-0">
      <Link href="/admin/synergates" className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)] hover:underline"><ChevronLeft className="size-4" aria-hidden /> Όλοι οι συνεργάτες</Link>
      <div className="min-w-0">
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)] leading-tight break-words">{p.name}</h2>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">{[p.code, p.category, p.groupName, p.s1Trdr ? `TRDR ${p.s1Trdr}` : null].filter(Boolean).join(" · ")}{p.s1Missing ? " · δεν βρέθηκε στην τελευταία εισαγωγή από το SoftOne" : ""}</p>
      </div>

      <section data-help="partner.identity" className="rounded-xl border border-eu-line bg-white p-3 grid gap-2">
        <h3 className="m-0 font-heading font-bold text-[length:var(--fs-16)]">Στοιχεία από το SoftOne</h3>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-12)]">Τα εμπορικά και φορολογικά στοιχεία αλλάζουν μόνο στο SoftOne· εδώ ενημερώνονται με την επόμενη εισαγωγή.</p>
        <dl className="m-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
          {field("ΑΦΜ", p.afm)}{field("ΔΟΥ", p.taxOffice)}{field("Διεύθυνση", [p.address, p.zip, p.city].filter(Boolean).join(", "))}
          {field("Τηλέφωνο", [p.phone, p.phone2].filter(Boolean).join(" · "))}{field("Email", p.email)}{field("Website", p.website)}
        </dl>
      </section>

      <section data-help="partner.contacts" className="rounded-xl border border-eu-line bg-white p-3 grid gap-2">
        <h3 className="m-0 font-heading font-bold text-[length:var(--fs-16)]">Επαφές & πρόσβαση στην πύλη συνεργατών</h3>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-12)]">Τις επαφές τις δημιουργούμε εμείς. Για πρόσβαση: email με πρόσκληση ή link ορισμού κωδικού για αντιγραφή (72 ώρες, μία χρήση). Κάθε ενέργεια καταγράφεται.</p>
        <PartnerContacts partnerId={p.id} canWrite={canWrite} contacts={contacts.map((c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, role: c.role, isPrimary: c.isPrimary, account: c.account ? { id: c.account.id, active: c.account.active, hasPassword: !!c.account.passwordHash, lastLoginAt: c.account.lastLoginAt?.toISOString() ?? null, lockedUntil: c.account.lockedUntil?.toISOString() ?? null, pendingLink: c.account.tokens[0]?.expiresAt.toISOString() ?? null } : null }))} />
      </section>

      <section data-help="partner.branches" className="grid gap-2">
        <h3 className="m-0 font-heading font-bold text-[length:var(--fs-16)]">Υποκαταστήματα · {p.branches.filter((b) => !b.s1Missing).length}</h3>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Η διαθεσιμότητα αναφέρεται σε υποκατάστημα: κάθε υποκατάστημα πρέπει να δείχνει στο κατάστημα του eshop που του αντιστοιχεί. Αν δεν υπάρχει, φτιάξε νέο (κρυφό)· ο διακόπτης ορίζει αν φαίνεται στο eshop (χάρτης, σελίδες καταστημάτων, παραλαβή).</p>
        <ul className="m-0 p-0 list-none grid gap-2">
          {p.branches.map((b) => {
            const options = stores.map((s) => ({ id: s.id, label: `${s.city} · ${s.name}`, taken: !!s.branch && s.branch.id !== b.id, near: (!!b.zip && s.zip.replace(/\D/g, "") === b.zip.replace(/\D/g, "")) || (!!b.city && cityKey(s.city) === cityKey(b.city)) }));
            return (
              <li key={b.id} className={`rounded-xl border bg-white p-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:items-start min-w-0 ${b.s1Missing ? "border-dashed border-eu-line opacity-70" : "border-eu-line"}`}>
                <div className="min-w-0">
                  <b className="break-words">{b.name}</b>
                  <span className="block text-eu-ink-3 text-[length:var(--fs-13)] break-words">
                    {[b.isCenter ? "Έδρα" : null, b.s1BranchId ? `TRDBRANCH ${b.s1BranchId}` : "από τη διεύθυνση του μέλους (χωρίς υποκατάστημα στο SoftOne)", [b.address, b.zip, b.city].filter(Boolean).join(", "), b.email].filter(Boolean).join(" · ")}
                  </span>
                  {b.s1Missing && <span className="block text-eu-red text-[length:var(--fs-12)] font-bold">Δεν υπάρχει πια στο SoftOne</span>}
                  {b.store && <span className="block text-[length:var(--fs-12)] text-eu-ink-3">Σύνδεση: {MATCHED[b.matchedBy ?? ""] ?? "—"} · <Link className="text-eu-blue hover:underline" href={`/admin/stores/${b.store.id}`}>άνοιγμα καταστήματος</Link></span>}
                </div>
                <div data-help="partner.store" className="grid gap-2 min-w-0">
                  {canWrite ? <BranchStoreLink key={b.storeId ?? "none"} branchId={b.id} storeId={b.storeId} options={options} /> : <span className="text-[length:var(--fs-14)]">{b.store ? `${b.store.city} · ${b.store.name}` : "Χωρίς κατάστημα"}</span>}
                  {b.store && (canWrite
                    ? <StoreVisibility key={b.store.id} storeId={b.store.id} active={b.store.active} hasPoint={b.store.lat !== 0 || b.store.lng !== 0} />
                    : <span className="text-[length:var(--fs-13)]">{b.store.active ? "Εμφανίζεται στο eshop" : "Κρυφό στο eshop"}</span>)}
                  {!b.store && !b.s1Missing && canWrite && <CreateBranchStore branchId={b.id} />}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
