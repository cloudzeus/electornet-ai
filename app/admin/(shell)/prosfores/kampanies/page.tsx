import Link from "next/link";
import { Plus, Search, FolderKanban, LayoutTemplate, Megaphone, TicketPercent, Hourglass } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { PromoTabs } from "@/components/admin/promos/PromoTabs";
import { Badge } from "@/components/admin/orders/ui";
import { listCampaigns, type CampaignRow } from "@/lib/promo/campaigns";
import { sx } from "@/components/ui/sx";
import { CAMPAIGN_GOALS, CAMPAIGN_STATUS } from "@/lib/promo/campaign-core";

export const metadata = { title: "Καμπάνιες" };
export const dynamic = "force-dynamic";

const FILTERS: { key: string; label: string }[] = [
  { key: "live", label: "Σε εξέλιξη" }, { key: "scheduled", label: "Προγραμματισμένες" }, { key: "draft", label: "Πρόχειρες" },
  { key: "paused", label: "Σε παύση" }, { key: "ended", label: "Έληξαν" }, { key: "all", label: "Όλες" },
];
const eur = (v: number) => v.toLocaleString("el-GR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const day = (d: Date) => d.toLocaleDateString("el-GR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Athens" });

/** Μπάρα budget: πόσο από το budget δόθηκε σε εκπτώσεις (κόκκινη σε υπέρβαση). */
function BudgetBar({ r }: { r: CampaignRow }) {
  if (r.budget.pct == null) return <span className="text-eu-muted text-[length:var(--fs-12)] tabular-nums">{r.spent ? `${eur(r.spent)} εκπτώσεις · χωρίς budget` : "χωρίς budget"}</span>;
  const bar = sx({ width: `${Math.min(100, r.budget.pct)}%` });
  return (
    <span className="grid gap-0.5 min-w-0">
      <span className="h-1.5 rounded-full bg-eu-surface overflow-hidden" role="img" aria-label={`${r.budget.pct}% του budget`}>{bar.node}<span className={`block h-full rounded-full ${r.budget.over ? "bg-eu-red" : "bg-eu-blue"} ${bar.className}`} /></span>
      <span className={`text-[length:var(--fs-12)] tabular-nums ${r.budget.over ? "text-eu-red font-bold" : "text-eu-ink-3"}`}>{eur(r.spent)} / {eur(r.budgetEur!)}{r.budget.over ? " · υπέρβαση" : ` · ${r.budget.pct}%`}</span>
    </span>
  );
}

function Contents({ r }: { r: CampaignRow }) {
  const c = r.counts;
  return (
    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-eu-ink-3 text-[length:var(--fs-12)] tabular-nums">
      <span className="inline-flex items-center gap-1" title="Προσφορές"><FolderKanban className="size-3.5" aria-hidden />{c.promos} προσφορές</span>
      {c.coupons > 0 && <span className="inline-flex items-center gap-1" title="Κουπόνια"><TicketPercent className="size-3.5" aria-hidden />{c.coupons}</span>}
      {c.landings > 0 && <span className="inline-flex items-center gap-1" title="Landing pages"><LayoutTemplate className="size-3.5" aria-hidden />{c.landings}</span>}
      {c.ads > 0 && <span className="inline-flex items-center gap-1" title="Banners"><Megaphone className="size-3.5" aria-hidden />{c.ads}</span>}
      {c.pending > 0 && <span className="inline-flex items-center gap-1 text-eu-amber font-bold"><Hourglass className="size-3.5" aria-hidden />{c.pending} για έγκριση</span>}
    </span>
  );
}

/**
 * Καμπάνιες: φάκελοι που ομαδοποιούν προσφορές, landing pages και banners με κοινές ημερομηνίες και budget.
 * Φίλτρα κατάστασης με πλήθη, αναζήτηση, πίνακας στον υπολογιστή και κάρτες στο κινητό.
 */
export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ s?: string; q?: string }> }) {
  await requirePermission("catalog.promos.write");
  const { s = "all", q = "" } = await searchParams;
  const { rows, counts } = await listCampaigns({ status: s, q });
  const href = (o: { s?: string; q?: string }) => { const u = new URLSearchParams(Object.entries({ s, q, ...o }).filter(([k, v]) => v && !(k === "s" && v === "all")) as [string, string][]); return `/admin/prosfores/kampanies${u.size ? `?${u}` : ""}`; };
  return (
    <div className="@container grid gap-4 min-w-0">
      <PromoTabs active="campaigns" title="Καμπάνιες" lead="Φάκελοι προσφορών: κοινές ημερομηνίες, budget και δημοσίευση για προσφορές, landing pages και banners." actions={
        <Link href="/admin/prosfores/kampanies/new" data-help="campaigns.new" className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-bold text-[length:var(--fs-13)] px-3.5 min-h-11 md:min-h-9 hover:bg-eu-blue"><Plus className="size-4" aria-hidden /> Νέα καμπάνια</Link>
      } />

      <div data-help="campaigns.filters" className="flex flex-wrap items-center gap-1.5">
        <nav aria-label="Κατάσταση" className="flex flex-wrap gap-1">
          {FILTERS.map((f) => {
            const on = s === f.key;
            return (
              <Link key={f.key} href={href({ s: f.key })} aria-current={on ? "page" : undefined} className={`inline-flex items-center gap-1.5 rounded-full px-3 min-h-11 md:min-h-8 font-bold text-[length:var(--fs-13)] ${on ? "bg-eu-navy text-white" : "bg-white border border-eu-line text-eu-ink-3 hover:text-eu-navy hover:border-eu-navy"}`}>
                {f.label}<span className={`tabular-nums text-[length:var(--fs-12)] ${on ? "text-white/75" : "text-eu-muted"}`}>{counts[f.key] ?? 0}</span>
              </Link>
            );
          })}
        </nav>
        <form className="relative grow basis-56 @3xl:grow-0 @3xl:basis-72 @3xl:ml-auto" action="/admin/prosfores/kampanies">
          {s !== "all" && <input type="hidden" name="s" value={s} />}
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-eu-muted" aria-hidden />
          <input type="search" name="q" defaultValue={q} placeholder="Όνομα ή κωδικός (KAM-…)" aria-label="Αναζήτηση καμπάνιας" className="w-full rounded-lg border border-eu-line bg-white pl-8 pr-3 min-h-11 md:min-h-9 text-[length:var(--fs-14)] outline-none focus:border-eu-blue" />
        </form>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-eu-line bg-white p-6 grid gap-2 justify-items-start">
          <p className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">{q || s !== "all" ? "Καμία καμπάνια με αυτά τα κριτήρια." : "Δεν υπάρχει ακόμη καμπάνια."}</p>
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] max-w-[70ch]">Μια καμπάνια μαζεύει τις προσφορές μιας περιόδου (π.χ. «Black Friday 2026»): κοινές ημερομηνίες, budget, landing pages και banners, και μία δημοσίευση για όλα.</p>
          <Link href="/admin/prosfores/kampanies/new" className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-bold text-[length:var(--fs-13)] px-3.5 min-h-11 md:min-h-9 hover:bg-eu-blue"><Plus className="size-4" aria-hidden /> Νέα καμπάνια</Link>
        </div>
      ) : (
        <>
          <table data-help="campaigns.table" className="hidden @3xl:table w-full border-collapse rounded-xl overflow-hidden bg-white border border-eu-line text-[length:var(--fs-13)]">
            <thead><tr className="text-left text-eu-muted text-[length:var(--fs-12)] [&>th]:px-3 [&>th]:py-2 [&>th]:font-bold border-b border-eu-line"><th>Καμπάνια</th><th>Ημερομηνίες</th><th>Κατάσταση</th><th>Περιεχόμενα</th><th className="w-56">Budget</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-eu-line last:border-0 hover:bg-eu-surface/60 [&>td]:px-3 [&>td]:py-2 align-top">
                  <td className="min-w-0"><Link href={`/admin/prosfores/kampanies/${r.id}`} className="font-bold text-eu-ink hover:text-eu-blue hover:underline">{r.title}</Link><div className="text-eu-muted text-[length:var(--fs-12)]"><span className="font-mono">{r.code}</span> · {CAMPAIGN_GOALS[r.goal]?.label}</div></td>
                  <td className="tabular-nums text-eu-ink-3 whitespace-nowrap">{day(r.startsAt)} – {day(r.endsAt)}</td>
                  <td><Badge tone={CAMPAIGN_STATUS[r.status].tone}>{CAMPAIGN_STATUS[r.status].label}</Badge></td>
                  <td><Contents r={r} /></td>
                  <td><BudgetBar r={r} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="@3xl:hidden m-0 p-0 list-none grid gap-2">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/prosfores/kampanies/${r.id}`} className="grid gap-1.5 rounded-xl border border-eu-line bg-white p-3 hover:border-eu-navy">
                  <span className="flex items-start justify-between gap-2"><span className="font-bold text-eu-ink text-[length:var(--fs-14)] min-w-0">{r.title}</span><Badge tone={CAMPAIGN_STATUS[r.status].tone}>{CAMPAIGN_STATUS[r.status].label}</Badge></span>
                  <span className="text-eu-muted text-[length:var(--fs-12)]"><span className="font-mono">{r.code}</span> · {day(r.startsAt)} – {day(r.endsAt)}</span>
                  <Contents r={r} />
                  <BudgetBar r={r} />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
