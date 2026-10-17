import Link from "next/link";
import { FolderKanban, ListChecks, MailOpen, MousePointerClick, Users } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { PromoTabs } from "@/components/admin/promos/PromoTabs";
import { Badge } from "@/components/admin/orders/ui";
import { NEWSLETTER_STATUS } from "@/lib/newsletter/edit";

export const metadata = { title: "Newsletter προσφορών" };
export const dynamic = "force-dynamic";

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "Όλα" }, { key: "draft", label: "Πρόχειρα" }, { key: "scheduled", label: "Προγραμματισμένα" }, { key: "sending", label: "Αποστέλλονται" },
  { key: "paused", label: "Σε παύση" }, { key: "sent", label: "Στάλθηκαν" }, { key: "cancelled", label: "Ακυρώθηκαν" },
];
const when = (d: Date) => d.toLocaleString("el-GR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Athens" });
const num = (n: number) => n.toLocaleString("el-GR");
const pct = (a: number, b: number) => (b > 0 ? ` · ${Math.round((a / b) * 100)} %` : "");

type Row = Awaited<ReturnType<typeof load>>["rows"][number];

async function load(status: string) {
  const [rows, groups] = await Promise.all([
    db.newsletter.findMany({
      where: status === "all" ? {} : { status },
      orderBy: { updatedAt: "desc" }, take: 200,
      select: { id: true, title: true, subject: true, status: true, promotionId: true, campaignId: true, scheduledAt: true, startedAt: true, finishedAt: true, updatedAt: true, recipientCount: true, sent: true, delivered: true, opened: true, clicked: true },
    }),
    db.newsletter.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const promoIds = [...new Set(rows.map((r) => r.promotionId).filter((x): x is string => !!x))];
  const campIds = [...new Set(rows.map((r) => r.campaignId).filter((x): x is string => !!x))];
  const [promos, camps] = await Promise.all([
    promoIds.length ? db.promotion.findMany({ where: { id: { in: promoIds } }, select: { id: true, name: true, code: true } }) : [],
    campIds.length ? db.campaign.findMany({ where: { id: { in: campIds } }, select: { id: true, title: true, code: true } }) : [],
  ]);
  const counts: Record<string, number> = Object.fromEntries(groups.map((g) => [g.status, g._count._all]));
  counts.all = groups.reduce((s, g) => s + g._count._all, 0);
  const pm = new Map(promos.map((p) => [p.id, p])), cm = new Map(camps.map((c) => [c.id, c]));
  return {
    counts,
    rows: rows.map((r) => {
      const p = r.promotionId ? pm.get(r.promotionId) : null, c = r.campaignId ? cm.get(r.campaignId) : null;
      const source = c ? { kind: "Καμπάνια", label: c.title, code: c.code, href: `/admin/prosfores/kampanies/${c.id}` } : p ? { kind: "Προσφορά", label: p.name, code: p.code, href: `/admin/prosfores/${p.id}` } : null;
      const time = r.status === "scheduled" && r.scheduledAt ? `Στις ${when(r.scheduledAt)}`
        : (r.status === "sent" || r.status === "cancelled") && r.finishedAt ? `${r.status === "sent" ? "Ολοκλ." : "Έκλεισε"} ${when(r.finishedAt)}`
        : r.startedAt ? `Ξεκίνησε ${when(r.startedAt)}` : `Αλλαγή ${when(r.updatedAt)}`;
      return { ...r, source, time };
    }),
  };
}

function Source({ r }: { r: Row }) {
  if (!r.source) return <span className="text-eu-muted">Γενικό</span>;
  return <span className="grid min-w-0"><span className="text-eu-muted text-[length:var(--fs-12)]">{r.source.kind} · <span className="font-mono">{r.source.code}</span></span><Link href={r.source.href} className="text-eu-ink-2 hover:text-eu-blue hover:underline break-words">{r.source.label}</Link></span>;
}

function Metrics({ r }: { r: Row }) {
  if (!r.recipientCount) return <span className="text-eu-muted text-[length:var(--fs-12)]">—</span>;
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1 text-eu-ink-3 text-[length:var(--fs-12)] tabular-nums">
      <span className="inline-flex items-center gap-1" title="Παραλήπτες"><Users className="size-3.5" aria-hidden />{num(r.recipientCount)}</span>
      <span className="inline-flex items-center gap-1" title="Ανοίγματα"><MailOpen className="size-3.5" aria-hidden />{num(r.opened)}{pct(r.opened, r.delivered || r.sent)}</span>
      <span className="inline-flex items-center gap-1" title="Κλικ"><MousePointerClick className="size-3.5" aria-hidden />{num(r.clicked)}{pct(r.clicked, r.delivered || r.sent)}</span>
    </span>
  );
}

/**
 * Newsletter προσφορών: λίστα με κατάσταση σε λέξεις, προσφορά/καμπάνια, ώρα, παραλήπτες, ανοίγματα και κλικ, με φίλτρο κατάστασης.
 * Νέο newsletter φτιάχνεται από την καρτέλα μιας προσφοράς ή καμπάνιας (κουμπί «Newsletter»).
 */
export default async function NewsletterListPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  await requirePermission("marketing.newsletter.write");
  const { s: raw = "all" } = await searchParams;
  const s = FILTERS.some((f) => f.key === raw) ? raw : "all";
  const { rows, counts } = await load(s);
  return (
    <div className="@container grid gap-4 min-w-0">
      <PromoTabs active="newsletter" title="Newsletter προσφορών" lead="Εικαστικά emails από προσφορές και καμπάνιες: δοκιμή, αποστολή τώρα ή σε ώρα που ορίζετε, και αποτελέσματα." actions={
        <Link href="/admin/newsletter" className="inline-flex items-center gap-1.5 rounded-full border border-eu-line bg-white text-eu-ink-2 font-bold text-[length:var(--fs-13)] px-3.5 min-h-11 md:min-h-9 hover:border-eu-navy"><Users className="size-4" aria-hidden /> Συνδρομητές</Link>
      } />

      <nav data-help="newsletters.filters" aria-label="Κατάσταση" className="flex flex-wrap gap-1">
        {FILTERS.map((f) => {
          const on = s === f.key;
          return (
            <Link key={f.key} href={f.key === "all" ? "/admin/prosfores/newsletter" : `/admin/prosfores/newsletter?s=${f.key}`} aria-current={on ? "page" : undefined} className={`inline-flex items-center gap-1.5 rounded-full px-3 min-h-11 md:min-h-8 font-bold text-[length:var(--fs-13)] ${on ? "bg-eu-navy text-white" : "bg-white border border-eu-line text-eu-ink-3 hover:text-eu-navy hover:border-eu-navy"}`}>
              {f.label}<span className={`tabular-nums text-[length:var(--fs-12)] ${on ? "text-white/75" : "text-eu-muted"}`}>{counts[f.key] ?? 0}</span>
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <div data-help="newsletters.empty" className="rounded-xl border border-eu-line bg-white p-6 grid gap-2 justify-items-start">
          <p className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">{s !== "all" ? "Κανένα newsletter σε αυτή την κατάσταση." : "Δεν υπάρχει ακόμη newsletter."}</p>
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] max-w-[70ch]">Ανοίξτε μια προσφορά ή καμπάνια και πατήστε «Newsletter»: φτιάχνεται αυτόματα πρόχειρο με εικόνα, κείμενο, προϊόντα με τιμές και κουμπί προς τη σελίδα της προσφοράς.</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/prosfores" className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-bold text-[length:var(--fs-13)] px-3.5 min-h-11 md:min-h-9 hover:bg-eu-blue"><ListChecks className="size-4" aria-hidden /> Προσφορές</Link>
            <Link href="/admin/prosfores/kampanies" className="inline-flex items-center gap-1.5 rounded-full border border-eu-line bg-white font-bold text-[length:var(--fs-13)] px-3.5 min-h-11 md:min-h-9 hover:border-eu-navy"><FolderKanban className="size-4" aria-hidden /> Καμπάνιες</Link>
          </div>
        </div>
      ) : (
        <>
          <table data-help="newsletters.table" className="hidden @3xl:table w-full border-collapse rounded-xl overflow-hidden bg-white border border-eu-line text-[length:var(--fs-13)]">
            <thead><tr className="text-left text-eu-muted text-[length:var(--fs-12)] [&>th]:px-3 [&>th]:py-2 [&>th]:font-bold border-b border-eu-line"><th>Newsletter</th><th>Προέλευση</th><th>Κατάσταση</th><th>Ώρα</th><th>Αποτελέσματα</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const st = NEWSLETTER_STATUS[r.status] ?? { label: r.status, tone: "neutral" as const, help: "" };
                return (
                  <tr key={r.id} className="border-b border-eu-line last:border-0 hover:bg-eu-surface/60 [&>td]:px-3 [&>td]:py-2 align-top">
                    <td className="min-w-0 max-w-[36ch]"><Link href={`/admin/prosfores/newsletter/${r.id}`} className="font-bold text-eu-ink hover:text-eu-blue hover:underline break-words">{r.title}</Link><div className="text-eu-muted text-[length:var(--fs-12)] break-words">{r.subject}</div></td>
                    <td className="max-w-[28ch]"><Source r={r} /></td>
                    <td><Badge tone={st.tone} title={st.help}>{st.label}</Badge></td>
                    <td className="tabular-nums text-eu-ink-3 whitespace-nowrap">{r.time}</td>
                    <td><Metrics r={r} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <ul className="@3xl:hidden m-0 p-0 list-none grid gap-2">
            {rows.map((r) => {
              const st = NEWSLETTER_STATUS[r.status] ?? { label: r.status, tone: "neutral" as const, help: "" };
              return (
                <li key={r.id} className="grid gap-1.5 rounded-xl border border-eu-line bg-white p-3 min-w-0">
                  <span className="flex items-start justify-between gap-2"><Link href={`/admin/prosfores/newsletter/${r.id}`} className="font-bold text-eu-ink text-[length:var(--fs-14)] min-w-0 break-words hover:text-eu-blue min-h-11 md:min-h-0 inline-flex items-center">{r.title}</Link><Badge tone={st.tone}>{st.label}</Badge></span>
                  <span className="text-eu-ink-3 text-[length:var(--fs-13)] break-words">{r.subject}</span>
                  <span className="text-[length:var(--fs-13)]"><Source r={r} /></span>
                  <span className="text-eu-muted text-[length:var(--fs-12)] tabular-nums">{r.time}</span>
                  <Metrics r={r} />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
