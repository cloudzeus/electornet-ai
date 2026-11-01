import Link from "next/link";
import { ChevronLeft, Mail, Phone } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { INTEREST_STATUS, interestLabel } from "@/lib/partner-portal/interest-options";
import { InterestStatus } from "@/components/admin/partners/InterestStatus";

export const metadata = { title: "Ενδιαφέρον συνεργατών" };
export const dynamic = "force-dynamic";

const VIEWS = [
  { key: "new", label: "Νέες", statuses: ["new"] },
  { key: "contacted", label: "Σε επικοινωνία", statuses: ["contacted"] },
  { key: "done", label: "Ολοκληρώθηκαν", statuses: ["done"] },
  { key: "rejected", label: "Δεν προχωρούν", statuses: ["rejected"] },
  { key: "all", label: "Όλες", statuses: [] as string[] },
] as const;

const TONE = { warn: "bg-eu-yellow text-eu-navy", info: "bg-eu-chip text-eu-navy", good: "bg-emerald-100 text-emerald-900", neutral: "bg-eu-surface-2 text-eu-ink-3" } as const;
const when = (d: Date) => d.toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" });

/** Εκδηλώσεις ενδιαφέροντος από τη δημόσια σελίδα της πύλης συνεργατών (κουμπί στην είσοδο και στο τέλος του video). */
export default async function InterestAdmin({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requirePermission("stores.partners.read");
  const canWrite = can(user.permissions, "stores.partners.write");
  const { view = "new" } = await searchParams;
  const v = VIEWS.find((x) => x.key === view) ?? VIEWS[0];

  const [rows, counts] = await Promise.all([
    db.partnerInterest.findMany({ where: v.statuses.length ? { status: { in: [...v.statuses] } } : {}, orderBy: { createdAt: "desc" }, take: 200, include: { partner: { select: { id: true, name: true, code: true } } } }),
    db.partnerInterest.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const n = (x: (typeof VIEWS)[number]) => counts.filter((c) => !x.statuses.length || (x.statuses as readonly string[]).includes(c.status)).reduce((a, c) => a + c._count._all, 0);

  return (
    <div className="grid gap-3 min-w-0">
      <Link href="/admin/synergates" className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)] hover:underline"><ChevronLeft className="size-4" aria-hidden /> Συνεργάτες</Link>
      <div className="min-w-0">
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)] leading-tight">Ενδιαφέρον συνεργατών</h2>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)] max-w-[75ch]">Αιτήσεις από το κουμπί «Εκδήλωση ενδιαφέροντος» της πύλης συνεργατών: ΑΦΜ (και αν είναι μέλος), επαφή, τι θέλει να συνδέσει, τράπεζες, ERP, eshop και τρόπος διασύνδεσης. Ο ενδιαφερόμενος δεν έχει ακόμη λογαριασμό· όταν προχωρήσει, φτιάξτε επαφή και πρόσκληση από την καρτέλα του μέλους.</p>
      </div>
      <nav data-help="interest.views" aria-label="Κατάσταση" className="flex flex-wrap gap-2">
        {VIEWS.map((x) => {
          const on = x.key === v.key, c = n(x);
          return <Link key={x.key} href={`?view=${x.key}`} aria-current={on ? "page" : undefined} className={`inline-flex items-center gap-2 rounded-full px-3 min-h-11 text-[length:var(--fs-13)] font-bold border ${on ? "bg-eu-navy text-white border-eu-navy" : "border-eu-line text-eu-ink hover:border-eu-navy"}`}>{x.label}<span className={`rounded-full px-2 tabular-nums ${on ? "bg-white/20" : x.key === "new" && c ? "bg-eu-yellow text-eu-navy" : "bg-eu-surface-2"}`}>{c}</span></Link>;
        })}
      </nav>
      {!rows.length ? <p className="m-0 rounded-xl border border-eu-line bg-white p-4 text-eu-ink-3 text-[length:var(--fs-14)]">{v.key === "new" ? "Καμία νέα αίτηση." : "Καμία αίτηση εδώ."}</p> : (
        <ul data-help="interest.list" className="m-0 p-0 list-none grid gap-3">
          {rows.map((r) => {
            const st = INTEREST_STATUS[r.status] ?? INTEREST_STATUS.new;
            return (
              <li key={r.id} className="rounded-2xl border border-eu-line bg-white p-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(16rem,20rem)] min-w-0">
                <div className="grid gap-1.5 min-w-0 content-start">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[length:var(--fs-12)] font-bold ${TONE[st.tone]}`}>{st.label}</span>
                    {r.partner ? <Link href={`/admin/synergates/${r.partner.id}`} className="rounded-full px-2.5 py-0.5 text-[length:var(--fs-12)] font-bold bg-emerald-50 text-emerald-900 border border-emerald-300 hover:underline">Μέλος{r.partner.code ? ` · ${r.partner.code}` : ""}</Link> : <span className="rounded-full px-2.5 py-0.5 text-[length:var(--fs-12)] font-bold bg-eu-surface-2 text-eu-ink-3">Δεν είναι μέλος</span>}
                    <span className="text-eu-ink-3 text-[length:var(--fs-12)]">{when(r.createdAt)}</span>
                  </div>
                  <p className="m-0 font-bold text-eu-ink text-[length:var(--fs-16)] break-words">{r.partner?.name ?? r.businessName ?? "—"}</p>
                  <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)] tabular-nums">ΑΦΜ {r.afm}</p>
                  <p className="m-0 mt-1 font-bold text-eu-ink text-[length:var(--fs-14)]">{r.contactName}</p>
                  <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1.5 text-eu-blue text-[length:var(--fs-14)] break-all hover:underline min-h-8"><Mail className="size-4 shrink-0" aria-hidden />{r.email}</a>
                  <a href={`tel:${r.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 text-eu-blue text-[length:var(--fs-14)] hover:underline min-h-8"><Phone className="size-4 shrink-0" aria-hidden />{r.phone}</a>
                </div>
                <dl className="m-0 grid gap-2 content-start text-[length:var(--fs-13)] min-w-0">
                  {[
                    ["Είδος διασύνδεσης", r.kinds.map(interestLabel.kind).join(", ") || "—"],
                    ["Τράπεζες", r.banks.map(interestLabel.bank).join(", ") || "—"],
                    ["ERP", interestLabel.erp(r.erp)],
                    ["Eshop", interestLabel.eshop(r.eshop)],
                    ["Τρόπος διασύνδεσης", interestLabel.method(r.method)],
                  ].map(([k, val]) => <div key={k} className="min-w-0"><dt className="text-eu-ink-3">{k}</dt><dd className="m-0 font-bold text-eu-ink break-words">{val}</dd></div>)}
                  {r.notes && <div className="min-w-0"><dt className="text-eu-ink-3">Σχόλιο</dt><dd className="m-0 text-eu-ink whitespace-pre-line break-words">{r.notes}</dd></div>}
                </dl>
                <div data-help="interest.status" className="min-w-0">
                  {canWrite ? <InterestStatus id={r.id} status={r.status} adminNote={r.adminNote} /> : r.adminNote && <p className="m-0 text-eu-ink-2 text-[length:var(--fs-13)] whitespace-pre-line">{r.adminNote}</p>}
                  {r.handledAt && <p className="m-0 mt-2 text-eu-ink-3 text-[length:var(--fs-12)]">Τελευταία αλλαγή {when(r.handledAt)}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
