import Link from "next/link";
import { Download, Search, ShieldHalf, Wrench } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { Pagination } from "@/components/admin/Pagination";
import { daysLeft, deviceBrands, deviceKpis, filterQuery, listDevices, nowMs, parseFilter, PER_PAGE, SORT_LABEL, SOURCE_LABEL, STATUS_LABEL, type DeviceFilter, type DeviceRow, type DeviceStatus } from "./devices";
import { EditDeviceButton, NewDeviceButton, type DeviceForm } from "./DeviceDialogs";

export const metadata = { title: "Εγγυήσεις συσκευών" };
export const dynamic = "force-dynamic";

const day = (d: Date | null) => (d ? d.toLocaleDateString("el-GR", { timeZone: "Europe/Athens" }) : "—");
/** ΕΕΕΕ-ΜΜ-ΗΗ σε ώρα Ελλάδας (το SoftOne γράφει μεσάνυχτα Ελλάδας = 21:00/22:00 UTC της προηγούμενης) */
const ymd = (d: Date | null) => (d ? d.toLocaleDateString("sv-SE", { timeZone: "Europe/Athens" }) : "");
const n = (x: number) => x.toLocaleString("el-GR");
const customerName = (r: DeviceRow) => (r.company ? `${r.company} (${r.lastName} ${r.firstName})` : `${r.lastName} ${r.firstName}`.trim() || `Πελάτης #${r.customerNumber}`);

/** Χρωματιστό σήμα «ημέρες που απομένουν» με βάση τη μεγαλύτερη από εγγύηση και επέκταση. */
function DaysChip({ r, now }: { r: DeviceRow; now: number }) {
  const left = daysLeft(r, now);
  if (!left) return <span className="inline-flex rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-12)] bg-eu-surface text-eu-muted whitespace-nowrap">χωρίς ημ/νία</span>;
  const { days } = left;
  const [t, tone] = days < 0 ? [`έληξε πριν ${n(-days)} ημ.`, "bg-eu-surface text-eu-muted"] : days <= 30 ? [`${n(days)} ημ.`, "bg-eu-red/10 text-eu-red"] : days <= 60 ? [`${n(days)} ημ.`, "bg-eu-amber/15 text-eu-ink-2"] : [`${n(days)} ημ.`, "bg-eu-green/10 text-eu-green"];
  return <span className={`inline-flex rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-12)] tabular-nums whitespace-nowrap ${tone}`}>{t}</span>;
}

function TicketsLink({ r }: { r: DeviceRow }) {
  if (!r.openTickets) return <span className="text-eu-muted">0</span>;
  const q = r.serial || r.email || r.mobile || r.phone || `${r.lastName} ${r.firstName}`;
  return <Link href={`/admin/service?q=${encodeURIComponent(q)}`} className="inline-flex items-center gap-1 font-bold text-eu-blue hover:underline min-h-11 @5xl:min-h-0"><Wrench className="size-3.5" aria-hidden />{r.openTickets}<span className="sr-only"> ανοιχτά αιτήματα service</span></Link>;
}

const toForm = (r: DeviceRow): DeviceForm => ({ id: r.id, customerName: customerName(r), brand: r.brand, title: r.title, model: r.model ?? "", serial: r.serial ?? "", purchasedAt: ymd(r.purchasedAt), warrantyMonths: r.warrantyMonths, warrantyUntil: ymd(r.warrantyUntil), extendedUntil: ymd(r.extendedUntil), extendedPlan: r.extendedPlan ?? "", invoiceNo: r.invoiceNo ?? "", notes: r.notes ?? "" });

/**
 * Εγγυήσεις συσκευών: όλες οι συσκευές πελατών (CustomerDevice) σε μία λίστα — KPIs, φίλτρα στο URL (μοιράζονται),
 * πίνακας σε υπολογιστή / κάρτες σε κινητό, διόρθωση στοιχείων, νέα καταχώριση και εξαγωγή CSV με τα ίδια φίλτρα.
 */
export default async function WarrantiesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("service.tickets.read");
  const sp = await searchParams;
  const f = parseFilter(sp);
  const page = Math.max(1, Math.trunc(Number(Array.isArray(sp.p) ? sp.p[0] : sp.p) || 1));
  const now = nowMs();
  const [{ rows, total }, k, brands] = await Promise.all([listDevices(f, { skip: (page - 1) * PER_PAGE, take: PER_PAGE }, new Date(now)), deviceKpis(new Date(now)), deviceBrands()]);
  const canWrite = can(user.permissions, "service.tickets.write");
  const filtered = !!(f.q || f.status !== "all" || f.source || f.brand);
  const link = (o: Partial<DeviceFilter> & { p?: string }) => { const { p, ...rest } = o; return `/admin/eggyiseis${filterQuery({ ...f, ...rest }, p ? { p } : {})}`; };
  const KPIS: [DeviceStatus, string, number, string][] = [
    ["all", "Συσκευές", k.total, `${n(k.nodate)} χωρίς ημερομηνία`],
    ["active", "Σε εγγύηση", k.active, k.total ? `${Math.round((k.active / k.total) * 100)} % του συνόλου` : "—"],
    ["exp30", "Λήγουν σε 30 ημ.", k.exp30, "με ή χωρίς επέκταση"],
    ["exp60", "Λήγουν σε 60 ημ.", k.exp60, "χωρίς επέκταση — υποψήφιες"],
    ["expired", "Έληξαν", k.expired, "εγγύηση και επέκταση"],
    ["extended", "Με επέκταση", k.extended, "ενεργή επέκταση"],
    ["open", "Με ανοιχτό service", k.open, "αίτημα σε εξέλιξη"],
  ];
  const sel = "rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9 text-[length:var(--fs-14)] outline-none focus:border-eu-blue w-full";
  const lbl = "grid gap-1 font-bold text-eu-ink-2 text-[length:var(--fs-12)] min-w-0";
  return (
    <div className="grid gap-3 min-w-0">
      <div data-help="eggyiseis.header" className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)] inline-flex items-center gap-2"><ShieldHalf className="size-5 text-eu-blue" aria-hidden /> Εγγυήσεις συσκευών</h1>
        <span className="text-eu-ink-3 text-[length:var(--fs-13)] tabular-nums">{n(total)} {filtered ? "με αυτά τα κριτήρια" : "συνολικά"}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <a href={`/api/admin/eggyiseis/export${filterQuery(f)}`} data-help="eggyiseis.export" className="inline-flex items-center gap-1.5 rounded-full border border-eu-line bg-white px-3 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] hover:border-eu-navy" title="CSV για Excel με τα τρέχοντα φίλτρα (έως 20.000 γραμμές)"><Download className="size-4" aria-hidden /> Εξαγωγή CSV</a>
          {canWrite && <NewDeviceButton />}
        </div>
      </div>
      <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] max-w-[80ch]">Όλες οι συσκευές των πελατών: από παραγγελίες e-shop, αγορές καταστήματος (SoftOne), καταχώριση του πελάτη ή του προσωπικού. Η λήξη που μετράει είναι η μεγαλύτερη από την εγγύηση κατασκευαστή και την επέκταση.</p>

      <dl data-help="eggyiseis.kpis" className="m-0 grid grid-cols-2 @3xl:grid-cols-4 @6xl:grid-cols-7 gap-px rounded-2xl bg-eu-line border border-eu-line overflow-hidden">
        {KPIS.map(([key, l, v, sub]) => { const on = f.status === key; return (
          <div key={key} className={`min-w-0 ${on ? "bg-eu-chip" : "bg-white"}`}>
            <Link href={link({ status: key, p: "" })} aria-current={on ? "true" : undefined} className="grid px-3 py-2 min-h-11 hover:text-eu-blue">
              <dt className="text-eu-muted text-[length:var(--fs-12)] font-bold">{l}</dt>
              <dd className="m-0 grid min-w-0"><span className={`font-heading font-extrabold text-[length:var(--fs-20)] tabular-nums ${key === "exp30" && v ? "text-eu-red" : key === "exp60" && v ? "text-eu-amber" : "text-eu-ink"}`}>{n(v)}</span><span className="text-eu-ink-3 text-[length:var(--fs-12)] leading-snug">{sub}</span></dd>
            </Link>
          </div>
        ); })}
      </dl>

      <form data-help="eggyiseis.filters" action="/admin/eggyiseis" className="grid grid-cols-1 @xl:grid-cols-2 @5xl:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto] gap-2 items-end rounded-2xl bg-white border border-eu-line p-3">
        <label className={`${lbl} @xl:col-span-2 @5xl:col-span-1`}>Αναζήτηση
          <span className="relative"><Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-eu-muted pointer-events-none" aria-hidden /><input name="q" type="search" defaultValue={f.q} enterKeyHint="search" placeholder="S/N, μοντέλο, μάρκα, παραστατικό, πελάτης, email, κινητό…" className={`${sel} pl-8`} /></span>
        </label>
        <label className={lbl}>Κατάσταση εγγύησης
          <select name="status" defaultValue={f.status} className={sel}>{Object.entries(STATUS_LABEL).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
        </label>
        <label className={lbl}>Πηγή καταχώρισης
          <select name="source" defaultValue={f.source} className={sel}><option value="">Όλες οι πηγές</option>{Object.entries(SOURCE_LABEL).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
        </label>
        <label className={lbl}>Μάρκα
          <select name="brand" defaultValue={f.brand} className={sel}><option value="">Όλες οι μάρκες</option>{f.brand && !brands.some((b) => b.brand.toLowerCase() === f.brand.toLowerCase()) && <option value={f.brand}>{f.brand}</option>}{brands.map((b) => <option key={b.brand} value={b.brand}>{b.brand} ({n(b.n)})</option>)}</select>
        </label>
        <label className={lbl}>Ταξινόμηση
          <select name="sort" defaultValue={f.sort} className={sel}>{Object.entries(SORT_LABEL).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
        </label>
        <div className="flex gap-1.5 @xl:col-span-2 @5xl:col-span-1">
          <button type="submit" className="flex-1 @5xl:flex-none rounded-full bg-eu-navy text-white font-bold px-4 min-h-11 md:min-h-9 text-[length:var(--fs-13)] hover:bg-eu-blue">Εφαρμογή</button>
          {filtered && <Link href="/admin/eggyiseis" className="inline-flex items-center rounded-full border border-eu-line px-3 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] text-eu-ink-2 hover:border-eu-navy">Καθαρισμός</Link>}
        </div>
      </form>

      {rows.length === 0 ? (
        <p className="m-0 rounded-xl bg-white border border-eu-line p-6 text-center text-eu-muted text-[length:var(--fs-14)]">Καμία συσκευή με αυτά τα κριτήρια.{filtered && <> <Link href="/admin/eggyiseis" className="font-bold text-eu-blue hover:underline">Καθαρισμός φίλτρων</Link></>}</p>
      ) : (
        <div data-help="eggyiseis.table" className="min-w-0">
          {/* υπολογιστής: πυκνός πίνακας */}
          <div className="hidden @5xl:block rounded-2xl bg-white border border-eu-line overflow-hidden">
            <table className="w-full table-fixed border-collapse text-[length:var(--fs-13)]">
              <colgroup><col className="w-[22%]" /><col className="w-[11%]" /><col className="w-[15%]" /><col className="w-[7.5%]" /><col className="w-[7.5%]" /><col className="w-[8%]" /><col className="w-[9%]" /><col className="w-[8%]" /><col className="w-[4%]" /><col className={canWrite ? "w-[8%]" : "w-0"} /></colgroup>
              <thead className="bg-eu-surface text-eu-ink-3 text-left text-[length:var(--fs-12)]">
                <tr>{["Συσκευή", "S/N", "Πελάτης", "Αγορά", "Εγγύηση έως", "Επέκταση έως", "Απομένουν", "Πηγή", "Service", ""].map((h, i) => <th key={i} scope="col" className="px-2.5 py-2 font-bold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-eu-line align-top hover:bg-eu-surface/50">
                    <td className="px-2.5 py-2 min-w-0"><div className="font-bold text-eu-ink break-words">{r.brand} {r.title}</div>{r.model && <div className="text-eu-ink-3 break-words">{r.model}</div>}</td>
                    <td className="px-2.5 py-2 font-mono break-all text-eu-ink-2">{r.serial ?? <span className="text-eu-muted font-sans">—</span>}</td>
                    <td className="px-2.5 py-2"><Link href={`/admin/customers/${r.customerId}?tab=devices`} className="font-bold text-eu-blue hover:underline break-words">{customerName(r)}</Link><div className="text-eu-muted break-all">{r.mobile ?? r.phone ?? r.email ?? ""}</div></td>
                    <td className="px-2.5 py-2 tabular-nums">{day(r.purchasedAt)}</td>
                    <td className="px-2.5 py-2 tabular-nums">{day(r.warrantyUntil)}<div className="text-eu-muted">{r.warrantyMonths} μήνες</div></td>
                    <td className="px-2.5 py-2 tabular-nums">{day(r.extendedUntil)}{r.extendedPlan && <div className="text-eu-muted break-words">{r.extendedPlan}</div>}</td>
                    <td className="px-2.5 py-2"><DaysChip r={r} now={now} /></td>
                    <td className="px-2.5 py-2 text-eu-ink-2">{SOURCE_LABEL[r.registeredBy] ?? r.registeredBy}</td>
                    <td className="px-2.5 py-2 tabular-nums"><TicketsLink r={r} /></td>
                    <td className="px-2.5 py-2 text-right">{canWrite && <EditDeviceButton device={toForm(r)} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* κινητό / στενό: κάρτες */}
          <ul className="@5xl:hidden m-0 p-0 list-none grid grid-cols-1 @3xl:grid-cols-2 gap-2">
            {rows.map((r) => (
              <li key={r.id} className="rounded-xl bg-white border border-eu-line p-3 grid gap-1.5 text-[length:var(--fs-14)] min-w-0">
                <div className="flex items-start gap-2 min-w-0">
                  <div className="min-w-0 flex-1"><div className="font-bold text-eu-ink break-words">{r.brand} {r.title}</div><div className="text-eu-ink-3 text-[length:var(--fs-13)] break-all">{[r.model, r.serial ? `S/N ${r.serial}` : null].filter(Boolean).join(" · ") || "χωρίς μοντέλο / S/N"}</div></div>
                  <DaysChip r={r} now={now} />
                </div>
                <Link href={`/admin/customers/${r.customerId}?tab=devices`} className="font-bold text-eu-blue hover:underline break-words min-h-11 inline-flex items-center">{customerName(r)}</Link>
                <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-1 text-[length:var(--fs-13)]">
                  <div><dt className="text-eu-muted">Αγορά</dt><dd className="m-0 tabular-nums">{day(r.purchasedAt)}</dd></div>
                  <div><dt className="text-eu-muted">Εγγύηση έως</dt><dd className="m-0 tabular-nums">{day(r.warrantyUntil)} <span className="text-eu-muted">({r.warrantyMonths} μ.)</span></dd></div>
                  <div><dt className="text-eu-muted">Επέκταση έως</dt><dd className="m-0 tabular-nums break-words">{day(r.extendedUntil)}{r.extendedPlan ? ` · ${r.extendedPlan}` : ""}</dd></div>
                  <div><dt className="text-eu-muted">Πηγή</dt><dd className="m-0">{SOURCE_LABEL[r.registeredBy] ?? r.registeredBy}</dd></div>
                  <div><dt className="text-eu-muted">Ανοιχτά service</dt><dd className="m-0"><TicketsLink r={r} /></dd></div>
                  {r.invoiceNo && <div><dt className="text-eu-muted">Παραστατικό</dt><dd className="m-0 break-all">{r.invoiceNo}</dd></div>}
                </dl>
                {canWrite && <div><EditDeviceButton device={toForm(r)} /></div>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {total > PER_PAGE && <div className="flex justify-center"><Pagination page={page} pages={Math.max(1, Math.ceil(total / PER_PAGE))} total={total} label="συσκευές" href={(p) => link({ p: String(p) })} /></div>}
    </div>
  );
}
