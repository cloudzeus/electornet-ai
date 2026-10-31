import Link from "next/link";
import { ArrowRight, Check, ClipboardList, History, MapPin, PlugZap, Sparkles, Store } from "lucide-react";
import { requirePortalUser, portalBase } from "@/lib/partner-portal/session";
import { dashboardData, onboardingOf } from "@/lib/partner-portal/data";
import { connTypeInfo } from "@/lib/partner-portal/connection-types";
import { statusLabel } from "@/lib/orders/model";
import { BarChart, KpiTile, LineChart } from "@/components/admin/charts/Charts";
import { ago, Badge, ButtonLink, Callout, Card, CardHead, Empty, fmtDate, fmtEur, Meter, Ring } from "@/components/synergaton/ui";
import { CONN_STATUS as CONN_TONE, LOG_KIND, toneOfOrder } from "@/components/synergaton/log-kinds";

export const metadata = { title: "Αρχική" };


export default async function Dashboard() {
  const u = await requirePortalUser();
  const base = await portalBase();
  const d = await dashboardData(u.partner.id, onboardingOf(u.partner.onboarding));
  const j = d.journey;
  const visible = d.stores.filter((s) => s.active).length;
  const noPoint = d.stores.filter((s) => s.lat === 0 && s.lng === 0).length;
  const active = d.connections.find((c) => c.status === "active");
  const lastSync = d.sync.last;
  const syncTotal = d.sync.days.reduce((a, x) => a + x.accepted, 0);
  const short = (iso: string) => new Date(iso).toLocaleDateString("el-GR", { day: "numeric", month: "numeric" });

  return (
    <div className="grid gap-5 sm:gap-6 min-w-0">
      {/* Hero: πορεία αρχικοποίησης */}
      <section data-help="portal.journey" className="relative overflow-hidden rounded-3xl bg-eu-navy text-white p-5 sm:p-7">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-28 size-[24rem] rounded-full bg-eu-blue/70 blur-3xl" />
        <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0 grid gap-3">
            <p className="m-0 text-eu-yellow font-bold uppercase tracking-[0.08em] text-[length:var(--fs-12)]">{u.partner.name}</p>
            <h1 className="m-0 font-heading font-extrabold text-[length:var(--fs-34)] leading-[1.08] text-balance">
              {j.next ? <>Επόμενο βήμα: <span className="text-eu-yellow">{j.next.title.toLowerCase()}</span></> : <>Όλα έτοιμα — η διαθεσιμότητά σας είναι <span className="text-eu-yellow">ζωντανή</span></>}
            </h1>
            <p className="m-0 text-eu-on-dark text-[length:var(--fs-16)] max-w-[60ch]">{j.next ? j.next.desc + "." : `Τελευταίος συγχρονισμός ${lastSync ? ago(lastSync.receivedAt) : "—"}.`}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {j.next && <ButtonLink href={`${base}${j.next.href}`} variant="brand" size="lg">Συνέχεια <ArrowRight className="size-5" aria-hidden /></ButtonLink>}
              <ButtonLink href={`${base}/odigos`} variant="ghost" className="!text-white hover:!bg-white/10">Πώς λειτουργεί</ButtonLink>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Ring value={j.done} max={j.total} size={112} label={`${j.done} από ${j.total} βήματα`}><span><span className="block font-heading font-extrabold text-[length:var(--fs-28)] leading-none tabular-nums">{j.done}/{j.total}</span><span className="block text-eu-on-dark text-[length:var(--fs-12)]">βήματα</span></span></Ring>
          </div>
        </div>
        <ol className="relative m-0 mt-6 p-0 list-none grid grid-cols-2 sm:grid-cols-4 2xl:grid-cols-7 gap-2" aria-label="Βήματα αρχικοποίησης">
          {j.steps.map((s, i) => (
            <li key={s.key}>
              <Link href={`${base}${s.href}`} className={`h-full flex items-start gap-2 rounded-xl p-2.5 min-h-11 transition-colors ${s.done ? "bg-white/10 hover:bg-white/15" : s.key === j.next?.key ? "bg-eu-yellow text-eu-navy" : "bg-white/5 hover:bg-white/10"} outline-none focus-visible:ring-[3px] focus-visible:ring-eu-yellow/60`}>
                <span className={`grid place-items-center size-6 rounded-full shrink-0 text-[length:var(--fs-12)] font-extrabold ${s.done ? "bg-eu-green text-white" : s.key === j.next?.key ? "bg-eu-navy text-white" : "bg-white/15"}`}>{s.done ? <Check className="size-3.5" aria-hidden /> : i + 1}</span>
                <span className="min-w-0"><span className="block font-bold text-[length:var(--fs-13)] leading-tight">{s.title}</span><span className={`block text-[length:var(--fs-12)] leading-snug ${s.key === j.next?.key ? "text-eu-navy/80" : "text-eu-on-dark-2"}`}>{s.done ? "Έγινε" : s.key === j.next?.key ? "Τώρα" : "Εκκρεμεί"}</span></span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {d.sync.error && <Callout tone="warn" title="Η μηχανή διαθεσιμότητας δεν απαντά αυτή τη στιγμή">Τα δεδομένα συγχρονισμών θα εμφανιστούν μόλις αποκατασταθεί η επικοινωνία. Οι υπόλοιπες λειτουργίες δουλεύουν κανονικά.</Callout>}

      {/* KPIs */}
      <div data-help="portal.kpis" className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiTile label="Παραγγελίες παραλαβής · 30 ημ." value={String(d.orders.count)} sub={`${fmtEur(d.orders.value)} συνολικά`} trend={d.orders.perDay} href={`${base}/paraggelies`} />
        <KpiTile label="Προς παραλαβή τώρα" value={String(d.openPickups)} sub={d.openPickups ? "Περιμένουν ετοιμασία ή τον πελάτη" : "Καμία εκκρεμότητα"} tone={d.openPickups ? "warn" : undefined} href={`${base}/paraggelies?status=open`} />
        <KpiTile label="Καταστήματα στο eshop" value={`${visible} / ${d.stores.length}`} sub={noPoint ? `${noPoint} χωρίς σημείο στον χάρτη` : "Όλα στον χάρτη"} href={`${base}/katastimata`} />
        <KpiTile label="Γραμμές αποθέματος · 30 ημ." value={syncTotal.toLocaleString("el-GR")} sub={lastSync ? `Τελευταίο: ${ago(lastSync.receivedAt)}` : active ? "Δεν έχει έρθει ακόμη" : "Χωρίς ενεργή σύνδεση"} trend={d.sync.days.map((x) => x.accepted)} href={`${base}/istoriko`} />
      </div>

      {/* Γραφήματα */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card data-help="portal.chart-orders">
          <CardHead icon={ClipboardList} title="Παραγγελίες παραλαβής" sub="Ανά ημέρα, τελευταίες 30 ημέρες (χωρίς ακυρωμένες)" />
          <div className="p-4 sm:p-5">{d.orders.count ? <LineChart labels={d.orders.days.map(short)} series={[{ key: "n", label: "Παραγγελίες", values: d.orders.perDay }]} height={200} /> : <Empty icon={ClipboardList} title="Καμία παραγγελία ακόμη">Όταν πελάτης διαλέξει κατάστημά σας για παραλαβή, θα εμφανιστεί εδώ.</Empty>}</div>
        </Card>
        <Card data-help="portal.chart-sync">
          <CardHead icon={History} title="Συγχρονισμοί αποθέματος" sub="Γραμμές που έγιναν δεκτές / απορρίφθηκαν ανά ημέρα" />
          <div className="p-4 sm:p-5">{d.sync.days.some((x) => x.batches) ? <BarChart labels={d.sync.days.map((x) => short(x.day))} series={[{ key: "a", label: "Δεκτές", values: d.sync.days.map((x) => x.accepted) }, { key: "r", label: "Απορρίφθηκαν", values: d.sync.days.map((x) => x.rejected), color: "#E63422" }]} height={200} /> : <Empty icon={PlugZap} title="Δεν υπάρχουν ακόμη συγχρονισμοί" action={<ButtonLink href={`${base}/syndesi`} variant="secondary">Ρύθμιση σύνδεσης</ButtonLink>}>Μόλις ενεργοποιηθεί η σύνδεση, κάθε ενημέρωση αποθέματος φαίνεται εδώ.</Empty>}</div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* Πρόσφατες παραγγελίες */}
        <Card data-help="portal.recent-orders">
          <CardHead icon={ClipboardList} title="Πρόσφατες παραγγελίες" action={<Link href={`${base}/paraggelies`} className="text-eu-blue font-bold text-[length:var(--fs-14)] hover:underline min-h-11 inline-flex items-center">Όλες</Link>} />
          {d.orders.recent.length ? (
            <ul className="m-0 p-0 list-none divide-y divide-eu-line-2 mt-3">
              {d.orders.recent.map((o) => (
                <li key={o.id}>
                  <Link href={`${base}/paraggelies?q=${encodeURIComponent(o.number)}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-4 sm:px-5 py-3 hover:bg-eu-surface outline-none focus-visible:bg-eu-chip">
                    <span className="min-w-0"><b className="text-eu-ink text-[length:var(--fs-14)] tabular-nums">{o.number}</b><span className="block text-eu-ink-3 text-[length:var(--fs-13)] truncate">{o.customer || "—"} · {o.pickupStore?.city} · {o._count.lines} είδ{o._count.lines === 1 ? "ος" : "η"}</span></span>
                    <span className="text-right"><b className="block text-eu-ink tabular-nums text-[length:var(--fs-14)]">{fmtEur(o.total)}</b><span className="text-eu-muted text-[length:var(--fs-12)]">{fmtDate(o.createdAt)}</span></span>
                    <span className="col-span-2"><Badge tone={toneOfOrder(o.status)}>{statusLabel(o.status)}</Badge></span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <Empty icon={ClipboardList} title="Καμία παραγγελία ακόμη" />}
        </Card>

        <div className="grid gap-4 content-start">
          {/* Σύνδεση */}
          <Card data-help="portal.connection">
            <CardHead icon={PlugZap} title="Σύνδεση διαθεσιμότητας" action={<ButtonLink href={`${base}/syndesi`} variant="ghost" size="sm">Διαχείριση</ButtonLink>} />
            <div className="p-4 sm:p-5 grid gap-3">
              {d.connections.length ? d.connections.map((c) => {
                const [tone, label] = CONN_TONE[c.status] ?? ["neutral", c.status];
                return (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-eu-surface px-3 py-2.5">
                    <span className="min-w-0"><b className="block text-[length:var(--fs-14)]">{connTypeInfo(c.type)?.title ?? c.type}</b><span className="text-eu-ink-3 text-[length:var(--fs-12)]">{c.storeIds.length} καταστ. · έλεγχος {c.lastTestAt ? ago(c.lastTestAt) : "—"}</span></span>
                    <Badge tone={tone}>{label}</Badge>
                  </div>
                );
              }) : <Empty icon={Sparkles} title="Δεν έχετε σύνδεση ακόμη" action={<ButtonLink href={`${base}/ksekinima`} variant="brand">Ξεκινήστε με τον βοηθό</ButtonLink>}>Ο βοηθός σάς προτείνει τον πιο εύκολο τρόπο σε 2 λεπτά.</Empty>}
            </div>
          </Card>
          {/* Καταστήματα */}
          <Card data-help="portal.stores">
            <CardHead icon={Store} title="Καταστήματα" sub={`${visible} εμφανίζονται στο eshop`} action={<ButtonLink href={`${base}/katastimata`} variant="ghost" size="sm">Όλα</ButtonLink>} />
            <div className="p-4 sm:p-5 grid gap-3">
              <Meter value={visible} max={Math.max(1, d.stores.length)} tone="good" label="Καταστήματα που εμφανίζονται" />
              <ul className="m-0 p-0 list-none grid gap-1.5">
                {d.stores.slice(0, 4).map((s) => (
                  <li key={s.id}><Link href={`${base}/katastimata/${s.id}`} className="flex items-center gap-2 rounded-lg px-2 min-h-11 hover:bg-eu-surface outline-none focus-visible:bg-eu-chip"><MapPin className={`size-4 shrink-0 ${s.lat || s.lng ? "text-eu-blue" : "text-eu-muted-3"}`} aria-hidden /><span className="flex-1 min-w-0 truncate text-[length:var(--fs-14)]">{s.city} · {s.name}</span><Badge tone={s.active ? "good" : "neutral"}>{s.active ? "Ορατό" : "Κρυφό"}</Badge></Link></li>
                ))}
              </ul>
            </div>
          </Card>
        </div>
      </div>

      {/* Δραστηριότητα */}
      <Card data-help="portal.activity">
        <CardHead icon={History} title="Πρόσφατη δραστηριότητα" sub="Συνδέσεις, έλεγχοι, ανεβάσματα, αλλαγές" action={<Link href={`${base}/istoriko`} className="text-eu-blue font-bold text-[length:var(--fs-14)] hover:underline min-h-11 inline-flex items-center">Όλο το ιστορικό</Link>} />
        <ol className="m-0 p-0 list-none px-4 sm:px-5 py-4 grid gap-3">
          {d.logs.map((l) => {
            const k = LOG_KIND[l.kind] ?? LOG_KIND.connection;
            return (
              <li key={l.id} className="flex gap-3 items-start min-w-0">
                <span className={`grid place-items-center size-8 rounded-lg shrink-0 ${l.ok ? "bg-eu-chip text-eu-blue" : "bg-[#fdecea] text-[#b3261e]"}`}><k.icon className="size-4" aria-hidden /></span>
                <span className="min-w-0 flex-1"><span className="block text-[length:var(--fs-14)] text-eu-ink break-words">{l.message}</span><span className="text-eu-muted text-[length:var(--fs-12)]">{k.label} · {ago(l.createdAt)}{l.ok ? "" : " · αποτυχία"}</span></span>
              </li>
            );
          })}
          {!d.logs.length && <li className="text-eu-ink-3 text-[length:var(--fs-14)]">Τίποτα ακόμη.</li>}
        </ol>
      </Card>
    </div>
  );
}
