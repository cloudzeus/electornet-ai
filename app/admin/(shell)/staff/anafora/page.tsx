import Link from "next/link";
import { requireSuperAdmin } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { BarChart, RankBars, StatTile, SERIES } from "@/components/admin/charts/Charts";
import { PrintButton } from "@/components/admin/PrintButton";
import { areaLabel } from "@/lib/staff-report/presence";
import { athensDay, daysBetween, describeAction, fmtDuration } from "@/lib/staff-report/core";

export const metadata = { title: "Αναφορά δραστηριότητας" };
export const dynamic = "force-dynamic";

/** Η ημέρα που άρχισε η μέτρηση ενεργού χρόνου· πριν από αυτήν υπάρχουν μόνο ενέργειες και συνδέσεις. */
const TRACKING_SINCE = "2026-11-13";
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = new Intl.DateTimeFormat("el-GR", { timeZone: "Europe/Athens", hour: "2-digit", minute: "2-digit", hour12: false });
const DAY_LABEL = new Intl.DateTimeFormat("el-GR", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" });
const dayLabel = (day: string) => DAY_LABEL.format(new Date(`${day}T12:00:00Z`));
const dayFull = (day: string) => day.split("-").reverse().join("/");
const shiftDay = (day: string, n: number) => new Date(new Date(`${day}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const MAX_ACTIONS = 300;

const card = "rounded-2xl bg-white border border-eu-line p-4 @md:p-5 break-inside-avoid";
const h3 = "m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]";
const field = "rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] bg-white";

/** Super admin: πόσο ενεργό χρόνο πέρασε κάθε διαχειριστής στη διαχείριση, σε ποιες περιοχές (και στο wiki) και τι άλλαξε. Εκτυπώσιμη. */
export default async function StaffReportPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; staff?: string }> }) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const today = athensDay(new Date());
  const to = DAY_RE.test(sp.to ?? "") ? sp.to! : today;
  const from = DAY_RE.test(sp.from ?? "") && sp.from! <= to ? sp.from! : shiftDay(to, -6);
  const days = daysBetween(from, to);
  const lastDay = days.at(-1)!;
  const inRange = new Set(days);
  // η ημέρα Ελλάδας ξεκινά 21:00–22:00 UTC της προηγούμενης: φέρνουμε λίγο παραπάνω και φιλτράρουμε με την ημέρα Ελλάδας
  const window = { gte: new Date(new Date(`${from}T00:00:00Z`).getTime() - 3 * 3_600_000), lte: new Date(`${lastDay}T23:59:59Z`) };

  const [staff, presenceRows, auditRows, loginRows] = await Promise.all([
    db.staff.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true, active: true, roles: { select: { role: { select: { name: true } } } } } }),
    db.staffPresence.findMany({ where: { day: { gte: from, lte: lastDay }, ...(sp.staff ? { staffId: sp.staff } : {}) } }),
    db.auditLog.findMany({ where: { createdAt: window, staffId: sp.staff ?? { not: null } }, orderBy: { createdAt: "desc" }, take: 5000, select: { id: true, staffId: true, action: true, entity: true, entityId: true, createdAt: true } }),
    db.loginEvent.findMany({ where: { at: window, staffId: sp.staff ?? { not: null } }, select: { staffId: true, success: true, at: true } }),
  ]);
  const audits = auditRows.filter((a) => inRange.has(athensDay(a.createdAt)));
  const logins = loginRows.filter((l) => inRange.has(athensDay(l.at)));
  const selected = sp.staff ? staff.find((s) => s.id === sp.staff) : undefined;

  const people = staff
    .filter((s) => !sp.staff || s.id === sp.staff)
    .map((s) => {
      const pres = presenceRows.filter((p) => p.staffId === s.id);
      const acts = audits.filter((a) => a.staffId === s.id);
      const logs = logins.filter((l) => l.staffId === s.id);
      const areas = new Map<string, number>();
      const perDay = new Map<string, { seconds: number; first: Date; last: Date }>();
      for (const p of pres) {
        areas.set(p.area, (areas.get(p.area) ?? 0) + p.seconds);
        const d = perDay.get(p.day);
        if (d) { d.seconds += p.seconds; if (p.firstAt < d.first) d.first = p.firstAt; if (p.lastAt > d.last) d.last = p.lastAt; } else perDay.set(p.day, { seconds: p.seconds, first: p.firstAt, last: p.lastAt });
      }
      const actsPerDay = new Map<string, number>();
      const kinds = new Map<string, number>();
      for (const a of acts) {
        const day = athensDay(a.createdAt);
        actsPerDay.set(day, (actsPerDay.get(day) ?? 0) + 1);
        const d = describeAction(a.action);
        const k = `${d.area}: ${d.text}`;
        kinds.set(k, (kinds.get(k) ?? 0) + 1);
      }
      return {
        ...s, acts, perDay, actsPerDay,
        seconds: pres.reduce((n, p) => n + p.seconds, 0),
        areas: [...areas].sort((a, b) => b[1] - a[1]),
        kinds: [...kinds].sort((a, b) => b[1] - a[1]),
        loginsOk: logs.filter((l) => l.success).length,
        loginsFailed: logs.filter((l) => !l.success).length,
      };
    })
    .sort((a, b) => b.seconds - a.seconds || b.acts.length - a.acts.length);
  const activePeople = people.filter((p) => p.seconds || p.acts.length || p.loginsOk || p.loginsFailed);
  const idlePeople = people.filter((p) => !activePeople.includes(p));

  const totalSeconds = people.reduce((n, p) => n + p.seconds, 0);
  const failed = people.reduce((n, p) => n + p.loginsFailed, 0);
  const timed = people.filter((p) => p.seconds);
  // γράφημα: μία σειρά ανά άτομο όσο χωρούν τα χρώματα, αλλιώς το σύνολο
  const hours = (s: number) => Math.round(s / 360) / 10;
  const chartSeries = timed.length && timed.length <= SERIES.length
    ? timed.map((p) => ({ key: p.id, label: p.name, values: days.map((d) => hours(p.perDay.get(d)?.seconds ?? 0)) }))
    : [{ key: "all", label: "Όλοι", values: days.map((d) => hours(timed.reduce((n, p) => n + (p.perDay.get(d)?.seconds ?? 0), 0))) }];
  const qs = (staffId?: string) => `?from=${from}&to=${to}${staffId ? `&staff=${staffId}` : ""}`;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Αναφορά δραστηριότητας{selected ? ` · ${selected.name}` : ""}</h2>
          <p className="m-0 mt-1 text-eu-ink-2 text-[length:var(--fs-15)]">Περίοδος {dayFull(from)} – {dayFull(lastDay)}. Ενεργός χρόνος = ανοιχτή και ορατή διαχείριση, με κίνηση τα τελευταία 5 λεπτά.</p>
          <p className="m-0 mt-1 text-eu-muted text-[length:var(--fs-13)] hidden print:block">Εκτυπώθηκε {new Date().toLocaleString("el-GR", { timeZone: "Europe/Athens" })}</p>
        </div>
        <PrintButton />
      </div>

      <form data-help="staffreport.filters" className="print:hidden rounded-2xl bg-white border border-eu-line p-4 flex flex-wrap items-end gap-3 text-[length:var(--fs-14)]">
        <label className="grid gap-1 font-bold text-eu-ink">Από<input type="date" name="from" defaultValue={from} max={today} className={field} /></label>
        <label className="grid gap-1 font-bold text-eu-ink">Έως<input type="date" name="to" defaultValue={to} max={today} className={field} /></label>
        <label className="grid gap-1 font-bold text-eu-ink min-w-0">Διαχειριστής
          <select name="staff" defaultValue={sp.staff ?? ""} className={`${field} max-w-full`}>
            <option value="">Όλοι</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <button type="submit" className="rounded-full border-2 border-eu-navy text-eu-navy font-extrabold px-4 min-h-11 hover:bg-eu-navy hover:text-white">Εμφάνιση</button>
        <div className="flex flex-wrap gap-x-3 gap-y-1 basis-full">
          {[["Σήμερα", today, today], ["7 ημέρες", shiftDay(today, -6), today], ["30 ημέρες", shiftDay(today, -29), today]].map(([label, f, t]) => (
            <Link key={label} href={`?from=${f}&to=${t}${sp.staff ? `&staff=${sp.staff}` : ""}`} className="font-bold text-eu-blue hover:underline min-h-11 inline-flex items-center">{label}</Link>
          ))}
        </div>
      </form>

      {from < TRACKING_SINCE && (
        <p className="m-0 rounded-xl border border-eu-line bg-white px-4 py-3 text-eu-ink-2 text-[length:var(--fs-14)]">Ο ενεργός χρόνος μετριέται από τις {dayFull(TRACKING_SINCE)}. Για παλαιότερες ημέρες φαίνονται μόνο οι ενέργειες και οι συνδέσεις.</p>
      )}

      <div data-help="staffreport.summary" className="grid grid-cols-2 @3xl:grid-cols-4 gap-3">
        <StatTile accent label="Ενεργός χρόνος συνολικά" value={fmtDuration(totalSeconds)} sub={timed.length ? `μέσος όρος ${fmtDuration(totalSeconds / timed.length)} ανά άτομο` : "κανείς δεν μπήκε στην περίοδο"} />
        <StatTile label="Διαχειριστές με δραστηριότητα" value={`${activePeople.length} / ${people.length}`} sub={idlePeople.length ? `${idlePeople.length} χωρίς καμία κίνηση` : "όλοι είχαν κίνηση"} />
        <StatTile label="Ενέργειες (αλλαγές που έγιναν)" value={audits.length.toLocaleString("el-GR")} sub="ό,τι γράφτηκε στο audit log" />
        <div className={`rounded-2xl border p-4 bg-white ${failed ? "border-red-300" : "border-eu-line"}`}>
          <div className="font-heading font-extrabold text-[length:var(--fs-28)] leading-none tabular-nums text-eu-navy">{people.reduce((n, p) => n + p.loginsOk, 0)}</div>
          <div className="mt-1 text-[length:var(--fs-14)] text-eu-muted">Συνδέσεις</div>
          <div className={`text-[length:var(--fs-13)] font-bold ${failed ? "text-red-700" : "text-green-700"}`}>{failed ? `${failed} ${failed === 1 ? "αποτυχημένη" : "αποτυχημένες"} — δες την Ασφάλεια` : "καμία αποτυχημένη"}</div>
        </div>
      </div>

      {days.length > 1 && totalSeconds >= 360 && (
        <section data-help="staffreport.chart" className={card}>
          <h3 className={h3}>Ώρες ανά ημέρα</h3>
          <div className="mt-3"><BarChart labels={days.map(dayLabel)} series={chartSeries} unit="ώ" /></div>
        </section>
      )}

      {activePeople.map((p) => (
        <section key={p.id} data-help="staffreport.person" className={`${card} grid gap-5`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div data-private className="min-w-0">
              <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)]">{p.name}{!p.active && <span className="ml-2 text-eu-muted font-normal text-[length:var(--fs-14)]">ανενεργός</span>}</h3>
              <div className="text-eu-muted text-[length:var(--fs-14)] break-all">{p.email} · {p.roles.map((r) => r.role.name).join(", ") || "χωρίς ρόλο"}</div>
            </div>
            <div className="text-right">
              <div className="font-heading font-extrabold text-eu-navy text-[length:var(--fs-28)] leading-none tabular-nums">{fmtDuration(p.seconds)}</div>
              <div className="mt-1 text-eu-muted text-[length:var(--fs-13)]">{p.perDay.size > 0 && <>{p.perDay.size} {p.perDay.size === 1 ? "ημέρα" : "ημέρες"} · </>}{p.acts.length} ενέργειες · {p.loginsOk} συνδέσεις{p.loginsFailed ? <span className="font-bold text-red-700"> · {p.loginsFailed} {p.loginsFailed === 1 ? "αποτυχημένη" : "αποτυχημένες"}</span> : null}</div>
            </div>
          </div>

          {p.seconds > 0 && (
            <div className="grid @3xl:grid-cols-2 gap-5">
              <div className="min-w-0">
                <h4 className="m-0 mb-2 font-bold text-eu-ink text-[length:var(--fs-14)]">Πού πέρασε τον χρόνο</h4>
                <RankBars unit="λ" rows={p.areas.slice(0, 8).map(([area, s]) => ({ label: areaLabel(area), value: Math.max(1, Math.round(s / 60)) }))} />
              </div>
              <div className="min-w-0">
                <h4 className="m-0 mb-2 font-bold text-eu-ink text-[length:var(--fs-14)]">Ανά ημέρα</h4>
                <table className="w-full border-collapse text-[length:var(--fs-13)] tabular-nums">
                  <thead><tr className="text-left text-eu-muted"><th className="py-1 pr-2 font-bold">Ημέρα</th><th className="py-1 pr-2 font-bold">Από – έως</th><th className="py-1 pr-2 font-bold text-right">Χρόνος</th><th className="py-1 font-bold text-right">Ενέργειες</th></tr></thead>
                  <tbody>
                    {[...p.perDay].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, d]) => (
                      <tr key={day} className="border-t border-eu-line-2">
                        <td className="py-1.5 pr-2 text-eu-ink">{dayLabel(day)}</td>
                        <td className="py-1.5 pr-2 text-eu-ink-2">{TIME.format(d.first)} – {TIME.format(d.last)}</td>
                        <td className="py-1.5 pr-2 text-right font-bold text-eu-ink">{fmtDuration(d.seconds)}</td>
                        <td className="py-1.5 text-right text-eu-ink-2">{p.actsPerDay.get(day) ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div data-help="staffreport.actions">
            <h4 className="m-0 mb-2 font-bold text-eu-ink text-[length:var(--fs-14)]">Τι έκανε</h4>
            {!p.acts.length && <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Καμία αλλαγή στην περίοδο{p.seconds ? " — μόνο ανάγνωση σελίδων" : ""}.</p>}
            {selected ? (
              <ul className="m-0 p-0 list-none text-[length:var(--fs-13)]">
                {p.acts.slice(0, MAX_ACTIONS).map((a) => {
                  const d = describeAction(a.action);
                  return (
                    <li key={a.id} className="border-t border-eu-line-2 py-1.5 flex flex-wrap gap-x-3">
                      <span className="tabular-nums text-eu-muted whitespace-nowrap">{dayLabel(athensDay(a.createdAt))} {TIME.format(a.createdAt)}</span>
                      <span className="font-bold text-eu-ink">{d.area}: {d.text}</span>
                      <span className="text-eu-muted break-all">{a.entity}{a.entityId ? ` · ${a.entityId.slice(0, 12)}` : ""}</span>
                    </li>
                  );
                })}
                {p.acts.length > MAX_ACTIONS && <li className="border-t border-eu-line-2 py-2 text-eu-muted">Εμφανίζονται οι {MAX_ACTIONS} πιο πρόσφατες από {p.acts.length}. Μίκρυνε την περίοδο ή δες το <Link href="/admin/audit" className="text-eu-blue font-bold print:hidden">Audit log</Link>.</li>}
              </ul>
            ) : (
              <>
                <ul className="m-0 p-0 list-none grid @2xl:grid-cols-2 gap-x-6 text-[length:var(--fs-13)]">
                  {p.kinds.slice(0, 12).map(([k, n]) => (
                    <li key={k} className="border-t border-eu-line-2 py-1.5 flex justify-between gap-3"><span className="text-eu-ink min-w-0 break-words">{k}</span><span className="tabular-nums font-bold text-eu-ink">{n}×</span></li>
                  ))}
                </ul>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 text-[length:var(--fs-13)] text-eu-muted">
                  {p.kinds.length > 12 && <span>και {p.kinds.length - 12} ακόμη είδη ενεργειών</span>}
                  {p.acts.length > 0 && <Link href={qs(p.id)} className="print:hidden font-bold text-eu-blue hover:underline min-h-11 inline-flex items-center">Αναλυτικά, ενέργεια προς ενέργεια</Link>}
                </div>
              </>
            )}
          </div>
        </section>
      ))}

      {!activePeople.length && <p className={`${card} m-0 text-center text-eu-muted`}>Καμία δραστηριότητα στην περίοδο. Δοκίμασε μεγαλύτερο διάστημα.</p>}
      {idlePeople.length > 0 && !selected && (
        <p data-private className="m-0 text-eu-ink-2 text-[length:var(--fs-14)]"><span className="font-bold text-eu-ink">Χωρίς καμία κίνηση στην περίοδο:</span> {idlePeople.map((p) => p.name).join(", ")}</p>
      )}
      {selected && <Link href={qs()} className="print:hidden font-bold text-eu-blue hover:underline min-h-11 inline-flex items-center">Πίσω σε όλους τους διαχειριστές</Link>}
    </>
  );
}
