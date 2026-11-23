import Link from "next/link";
import { Search } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { GdprAdmin } from "@/components/admin/customers/GdprAdmin";
import { ConsentLedger, type LedgerRow } from "@/components/admin/customers/ConsentLedger";
import { ConsentTexts, type TextGroup } from "@/components/admin/customers/ConsentTexts";
import { StatTile } from "@/components/admin/charts/Charts";
import { sx } from "@/components/ui/sx";
import { currentConsents, listLedger, parseLedgerFilter } from "@/lib/gdpr/ledger";
import { CHANNEL_LABEL, TEXT_SHOWN, TEXT_TOPICS, TOPIC_LABEL, inForce, label } from "@/lib/gdpr/topics";

export const metadata = { title: "GDPR" };
export const dynamic = "force-dynamic";
const isOverdue = (due: Date) => due.getTime() < Date.now();
const isFuture = (d: Date) => d.getTime() > Date.now();
const TABS = [["requests", "Αιτήματα"], ["consents", "Συναινέσεις"], ["texts", "Κείμενα συναίνεσης"]] as const;
type Tab = (typeof TABS)[number][0];
type Search = { tab?: string; q?: string; topic?: string; decision?: string; period?: string; p?: string };
const field = "rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] outline-none focus:border-eu-blue bg-white w-full";
const nf = (v: number) => v.toLocaleString("el-GR");

export default async function GdprPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("customers.read");
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t[0] === sp.tab) ? (sp.tab as Tab) : "requests";
  const [openCount, textRows] = await Promise.all([db.gdprRequest.count({ where: { status: { notIn: ["done", "rejected"] } } }), db.consentText.findMany({ where: { locale: "el" }, orderBy: [{ key: "asc" }, { effectiveFrom: "desc" }] })]);
  const keys = [...new Set(textRows.map((t) => t.key))];
  const badge: Record<Tab, string | null> = { requests: openCount ? `${openCount} ανοιχτ${openCount === 1 ? "ό" : "ά"}` : null, consents: null, texts: String(keys.length) };
  const canWrite = can(user.permissions, "customers.write");
  return (
    <div className="@container grid gap-4 min-w-0">
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Προσωπικά δεδομένα</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">GDPR: αιτήματα και συναινέσεις</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">Τα αιτήματα των πελατών για τα δεδομένα τους, ποιος έχει συναινέσει σε τι, και τα κείμενα που είδε όταν συναίνεσε. Αυτά είναι τα αποδεικτικά προς την Αρχή Προστασίας Δεδομένων.</p>
      </div>
      <nav aria-label="Ενότητες GDPR" data-help="gdpr.tabs" className="flex flex-wrap gap-x-1 border-b border-eu-line">
        {TABS.map(([k, t]) => <Link key={k} href={k === "requests" ? "/admin/gdpr" : `/admin/gdpr?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={`inline-flex items-center gap-2 px-3 min-h-11 -mb-px border-b-2 text-[length:var(--fs-15)] ${tab === k ? "border-eu-blue text-eu-ink font-bold" : "border-transparent text-eu-ink-3 hover:text-eu-ink"}`}>{t}{badge[k] && <span className={`rounded-full px-2 font-bold text-[length:var(--fs-13)] ${k === "requests" ? "bg-eu-red/10 text-eu-red" : "bg-eu-surface text-eu-muted"}`}>{badge[k]}</span>}</Link>)}
      </nav>
      {tab === "requests" && <Requests />}
      {tab === "consents" && <Consents sp={sp} canWrite={canWrite} canExport={can(user.permissions, "customers.export")} texts={textRows} />}
      {tab === "texts" && <Texts rows={textRows} keys={keys} canWrite={canWrite} />}
    </div>
  );
}

async function Requests() {
  const [rows, logins] = await Promise.all([db.gdprRequest.findMany({ orderBy: [{ status: "asc" }, { dueAt: "asc" }], include: { customer: { select: { id: true, firstName: true, lastName: true } } } }), db.loginEvent.count()]);
  const open = rows.filter((r) => !["done", "rejected"].includes(r.status));
  const overdue = open.filter((r) => isOverdue(r.dueAt)).length;
  return (
    <>
      <div className="grid grid-cols-2 @lg:grid-cols-3 gap-3">
        <StatTile label="Ανοιχτά αιτήματα" value={String(open.length)} sub={overdue ? `${overdue} εκπρόθεσμα, απάντησε σήμερα` : "κανένα εκπρόθεσμο"} accent />
        <StatTile label="Αιτήματα συνολικά" value={nf(rows.length)} sub="προθεσμία απάντησης 30 ημέρες" />
        <StatTile label="Καταγεγραμμένες συνδέσεις" value={nf(logins)} sub="αποδεικτικό πρόσβασης" />
      </div>
      <GdprAdmin rows={rows.map((r) => ({ id: r.id, number: r.number, email: r.email, type: r.type, status: r.status, channel: r.channel, description: r.description, identityMethod: r.identityMethod, identityVerifiedAt: r.identityVerifiedAt?.toISOString() ?? null, requestedAt: r.requestedAt.toISOString(), dueAt: r.dueAt.toISOString(), completedAt: r.completedAt?.toISOString() ?? null, outcome: r.outcome, timeline: (r.timeline as { at: string; status: string; note?: string; by?: string }[] | null) ?? [], customer: r.customer ? { id: r.customer.id, name: `${r.customer.lastName} ${r.customer.firstName}` } : null }))} />
    </>
  );
}

type TextRow = Awaited<ReturnType<typeof db.consentText.findMany>>[number];

async function Consents({ sp, canWrite, canExport, texts }: { sp: Search; canWrite: boolean; canExport: boolean; texts: TextRow[] }) {
  const f = parseLedgerFilter(sp);
  const page = Math.max(1, Number(sp.p) || 1);
  const [ledger, current, noText, lastNoText, cookies, lastCookie, topics] = await Promise.all([
    listLedger(f, page), currentConsents(),
    db.consent.count({ where: { textHash: null, topic: { in: TEXT_TOPICS } } }), db.consent.findFirst({ where: { textHash: null, topic: { in: TEXT_TOPICS } }, orderBy: { at: "desc" }, select: { at: true } }),
    db.consent.count({ where: { topic: { startsWith: "cookies-" } } }), db.consent.findFirst({ where: { topic: { startsWith: "cookies-" } }, orderBy: { at: "desc" }, select: { at: true } }),
    db.consent.groupBy({ by: ["topic"], _count: true }),
  ]);
  const yes = current.reduce((a, r) => a + r.yes, 0), no = current.reduce((a, r) => a + r.no, 0);
  const title = new Map(texts.map((t) => [`${t.key}|${t.version}`, t.title]));
  const textInForce = Object.fromEntries([...new Set(texts.map((t) => t.key))].flatMap((k) => { const v = inForce(texts.filter((t) => t.key === k)); return v ? [[k, { title: v.title, version: v.version }]] : []; }));
  const rows: LedgerRow[] = ledger.rows.map((r) => { const ev = (r.evidence ?? {}) as { note?: string; by?: string; shown?: string }; return { id: r.id, at: r.at.toISOString(), email: r.email ?? r.customer?.email ?? null, customer: r.customer ? { id: r.customer.id, name: `${r.customer.lastName} ${r.customer.firstName}`.trim() } : null, topic: r.topic, channel: r.channel, granted: r.granted, method: r.method, source: r.source, staff: !!r.staffId, by: ev.by ?? null, note: ev.note ?? null, shown: ev.shown ?? null, textTitle: title.get(`${r.textKey}|${r.textVersion}`) ?? null, textVersion: r.textVersion, textHash: r.textHash, ip: r.ip, device: [r.os, r.browser, r.device === "mobile" ? "κινητό" : r.device === "tablet" ? "tablet" : r.device === "desktop" ? "υπολογιστής" : null].filter(Boolean).join(" · "), url: r.url, confirmedAt: r.confirmedAt?.toISOString() ?? null }; });
  const qs = (over: Record<string, string>) => { const u = new URLSearchParams({ tab: "consents", ...(f.q && { q: f.q }), ...(f.topic && { topic: f.topic }), ...(f.decision && { decision: f.decision }), ...(f.period && { period: f.period }), ...over }); return u.toString(); };
  const filtered = !!(f.q || f.topic || f.decision || f.period);
  const day = (x: Date) => x.toLocaleDateString("el-GR");
  return (
    <>
      <div data-help="gdpr.kpis" className="grid grid-cols-2 @3xl:grid-cols-4 gap-3">
        <StatTile label="Ενεργές συναινέσεις τώρα" value={nf(yes)} sub="η τελευταία απόφαση κάθε ανθρώπου" accent />
        <StatTile label="Ανακλήσεις σε ισχύ" value={nf(no)} sub="δεν τους στέλνουμε γι' αυτό το θέμα" />
        <StatTile label="Εγγραφές χωρίς δεμένο κείμενο" value={nf(noText)} sub={lastNoText ? `η τελευταία στις ${day(lastNoText.at)} · οι νέες δένονται μόνες τους` : "όλες δεμένες με κείμενο"} />
        <StatTile label="Επιλογές cookies στο μητρώο" value={nf(cookies)} sub={lastCookie ? `η τελευταία στις ${day(lastCookie.at)}` : "καμία ακόμη από το banner"} />
      </div>
      <section data-help="gdpr.now" className="rounded-2xl bg-white border border-eu-line p-4 grid gap-2 min-w-0">
        <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Τι ισχύει τώρα, ανά θέμα και κανάλι</h3>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] flex flex-wrap gap-x-4 gap-y-1"><span>Μετράει η τελευταία απόφαση κάθε ανθρώπου.</span><span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-sm bg-eu-green" aria-hidden /> έχει συναινέσει</span><span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-sm bg-eu-red" aria-hidden /> την ανακάλεσε</span></p>
        <ul className="m-0 p-0 list-none grid gap-2.5 @3xl:gap-1.5">
          {current.map((r) => { const w = sx({ width: `${(r.yes / Math.max(1, r.yes + r.no)) * 100}%` }); return (
            <li key={`${r.topic}|${r.channel}`} className="grid grid-cols-[minmax(0,1fr)_auto] @3xl:grid-cols-[220px_minmax(0,1fr)_130px] gap-x-3 gap-y-1 items-center text-[length:var(--fs-14)]">
              <span className="truncate text-eu-ink font-bold">{label(TOPIC_LABEL, r.topic)} · {label(CHANNEL_LABEL, r.channel)}</span>
              <span className="tabular-nums text-eu-ink-2 @3xl:order-3 @3xl:text-right">{nf(r.yes)} ναι · {nf(r.no)} όχι</span>
              <span className="col-span-2 @3xl:col-span-1 flex h-3 rounded-full overflow-hidden bg-eu-red" role="img" aria-label={`${nf(r.yes)} έχουν συναινέσει, ${nf(r.no)} την ανακάλεσαν`}>{w.node}<i className={`h-full bg-eu-green ${w.className}`} /></span>
            </li>
          ); })}
          {!current.length && <li className="text-eu-muted text-[length:var(--fs-14)]">Το μητρώο είναι άδειο. Η πρώτη συναίνεση από το site ή από το κουμπί «Καταγραφή συναίνεσης» θα φανεί εδώ.</li>}
        </ul>
      </section>
      <form method="get" action="/admin/gdpr" data-help="gdpr.filters" className="rounded-2xl bg-white border border-eu-line p-4 grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 items-end">
        <input type="hidden" name="tab" value="consents" />
        <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">Email ή όνομα πελάτη<input name="q" type="search" defaultValue={f.q} placeholder="onoma@example.gr" className={field} /></label>
        <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">Θέμα<select name="topic" defaultValue={f.topic} className={field}><option value="">Όλα τα θέματα</option>{topics.map((t) => <option key={t.topic} value={t.topic}>{label(TOPIC_LABEL, t.topic)} ({nf(t._count)})</option>)}</select></label>
        <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">Απόφαση<select name="decision" defaultValue={f.decision} className={field}><option value="">Συναίνεση και ανάκληση</option><option value="granted">Μόνο συναίνεση</option><option value="withdrawn">Μόνο ανάκληση</option></select></label>
        <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">Περίοδος<select name="period" defaultValue={f.period} className={field}><option value="">Όλο το μητρώο</option><option value="90">Τελευταίες 90 ημέρες</option><option value="year">Φέτος</option></select></label>
        <div className="flex gap-2"><button type="submit" className="inline-flex items-center justify-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-blue"><Search className="size-4" aria-hidden /> Εμφάνιση</button>{filtered && <Link href="/admin/gdpr?tab=consents" className="inline-flex items-center rounded-full border-2 border-eu-line px-3.5 min-h-11 font-bold text-eu-ink text-[length:var(--fs-14)] hover:border-eu-navy">Καθάρισμα</Link>}</div>
      </form>
      <ConsentLedger rows={rows} total={ledger.total} textInForce={textInForce} canWrite={canWrite} canExport={canExport} exportHref={`/api/admin/gdpr/consents/export?${qs({})}`} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-eu-ink-3 text-[length:var(--fs-14)]">
        <span>{nf(ledger.total)} {ledger.total === 1 ? "εγγραφή" : "εγγραφές"}{filtered ? " με αυτά τα φίλτρα" : ""} · σελίδα {Math.min(page, ledger.pages)} από {ledger.pages} · καμία γραμμή δεν αλλάζει ούτε σβήνεται, η ανάκληση είναι νέα γραμμή</span>
        {ledger.pages > 1 && <span className="flex gap-2">{page > 1 && <Link href={`/admin/gdpr?${qs({ p: String(page - 1) })}`} className="inline-flex items-center rounded-full border-2 border-eu-line px-3.5 min-h-11 font-bold text-eu-ink">Προηγούμενη</Link>}{page < ledger.pages && <Link href={`/admin/gdpr?${qs({ p: String(page + 1) })}`} className="inline-flex items-center rounded-full border-2 border-eu-line px-3.5 min-h-11 font-bold text-eu-ink">Επόμενη</Link>}</span>}
      </div>
    </>
  );
}

async function Texts({ rows, keys, canWrite }: { rows: TextRow[]; keys: string[]; canWrite: boolean }) {
  const counts = await db.consent.groupBy({ by: ["textKey", "textVersion"], where: { granted: true, textKey: { in: keys } }, _count: true });
  const count = new Map(counts.map((c) => [`${c.textKey}|${c.textVersion}`, c._count]));
  const groups: TextGroup[] = keys.map((key) => { const vs = rows.filter((r) => r.key === key); const cur = inForce(vs); return { key, where: TEXT_SHOWN[key]?.where ?? "Δεν έχει δηλωθεί", auto: TEXT_SHOWN[key]?.auto ?? false, versions: vs.map((v) => ({ id: v.id, version: v.version, title: v.title, text: v.text, hash: v.hash, effectiveFrom: v.effectiveFrom.toISOString(), count: count.get(`${v.key}|${v.version}`) ?? 0, state: v.id === cur?.id ? "inforce" as const : v.active && isFuture(v.effectiveFrom) ? "scheduled" as const : "old" as const })) }; });
  const auto = groups.filter((g) => g.auto).length;
  return (
    <>
      <p className="m-0 rounded-2xl bg-white border border-eu-line p-4 text-eu-ink-2 text-[length:var(--fs-15)] max-w-none">Κάθε συναίνεση κρατά την έκδοση του κειμένου που ίσχυε όταν δόθηκε. Άρα ένα κείμενο δεν διορθώνεται: βγάζεις <b>νέα έκδοση</b> και η παλιά μένει στο ιστορικό. {auto} από τα {groups.length} κείμενα εμφανίζονται μόνα τους στο site· στα υπόλοιπα η οθόνη έχει δικό της κείμενο, που αλλάζεις χωριστά.</p>
      <ConsentTexts groups={groups} canWrite={canWrite} today={new Date().toISOString().slice(0, 10)} />
    </>
  );
}
