import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { usdEurRate } from "@/lib/fx";
import { LineChart, BarChart, RankBars, StatTile } from "@/components/admin/charts/Charts";

export const metadata = { title: "Κόστος AI" };
export const dynamic = "force-dynamic";

const FEATURES: Record<string, string> = { advisor: "Ερμής", "alt-text": "Alt text", copy: "Κείμενα", agent: "Agent", test: "Δοκιμές", snap: "Snap & Find", tts: "Φωνή: εκφώνηση", stt: "Φωνή: μικρόφωνο", "3d": "3D από φωτογραφία (Tripo3D)" };
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const label = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
const rangeStart = (days: number) => new Date(Date.now() - (days - 1) * 86400000);

/** Admin view: billed cost (markup included) in € per day / model / feature. Raw OpenRouter cost is shown only to super-admins. */
export default async function AiReport({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await requirePermission("reports.read");
  const superAdmin = user.roles.includes("super-admin");
  const { days: d = "30" } = await searchParams;
  const days = [7, 30, 90].includes(Number(d)) ? Number(d) : 30;
  const from = rangeStart(days);
  const fromKey = dayKey(from);
  const [rows, rateToday] = await Promise.all([db.aiUsage.findMany({ where: { day: { gte: fromKey } }, orderBy: { createdAt: "asc" } }), usdEurRate()]);
  const labels = Array.from({ length: days }, (_, i) => dayKey(new Date(from.getTime() + i * 86400000)));
  const byDay = (f: (r: (typeof rows)[number]) => number) => labels.map((k) => rows.filter((r) => r.day === k).reduce((a, r) => a + f(r), 0));
  const eur = (r: (typeof rows)[number]) => r.billedEur ?? r.billedUsd * rateToday;
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
  const totalEur = sum(eur), totalUsd = sum((r) => r.billedUsd), rawUsd = sum((r) => r.costUsd), calls = rows.length, tokens = sum((r) => r.tokensIn + r.tokensOut), errors = rows.filter((r) => !r.ok).length;
  const features = [...new Set(rows.map((r) => r.feature))];
  const models = [...new Set(rows.map((r) => r.model))].map((m) => ({ label: m, value: rows.filter((r) => r.model === m).reduce((a, r) => a + eur(r), 0), sub: `${rows.filter((r) => r.model === m).length} κλήσεις · ${rows.filter((r) => r.model === m).reduce((a, r) => a + r.tokensIn + r.tokensOut, 0).toLocaleString("el-GR")} tokens` })).sort((a, b) => b.value - a.value).slice(0, 8);
  const dailyRows = labels.map((k) => { const rs = rows.filter((r) => r.day === k); return { k, calls: rs.length, tokens: rs.reduce((a, r) => a + r.tokensIn + r.tokensOut, 0), raw: rs.reduce((a, r) => a + r.costUsd, 0), usd: rs.reduce((a, r) => a + r.billedUsd, 0), eur: rs.reduce((a, r) => a + eur(r), 0), fx: rs.find((r) => r.fxRate)?.fxRate ?? null }; }).filter((r) => r.calls).reverse();
  const money = (v: number) => `${v.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  const chip = (n: number) => `rounded-full px-3 min-h-9 inline-flex items-center font-bold text-[length:var(--fs-13)] ${days === n ? "bg-eu-navy text-white" : "bg-white border border-eu-line text-eu-ink hover:border-eu-navy"}`;
  return (
    <>
      <Link href="/admin/reports" className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)] hover:underline"><ChevronLeft className="size-4" aria-hidden /> Αναφορές</Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">AI</div>
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Κόστος AI</h2>
          <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">Χρεωμένο κόστος (markup συμπεριλαμβάνεται) μετατρεπόμενο σε € με την ισοτιμία USD→EUR της κάθε ημέρας (ΕΚΤ). Σήμερα 1 $ = {rateToday.toFixed(4)} €.</p>
        </div>
        <nav aria-label="Περίοδος" className="flex flex-wrap gap-1">{[7, 30, 90].map((n) => <Link key={n} href={`?days=${n}`} className={chip(n)}>{n} ημέρες</Link>)}<Link href="/admin/reports/ai/voice" className="inline-flex items-center rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-14)] px-3 min-h-9 hover:bg-eu-chip">Φωνή & audio cache</Link></nav>
      </div>
      <div className="grid grid-cols-2 @lg:grid-cols-3 @5xl:grid-cols-6 gap-3">
        <StatTile label={`Χρεωμένο κόστος (${days} ημ.)`} value={money(totalEur)} sub={`$${totalUsd.toFixed(2)}`} accent />
        <StatTile label="Μέσο ανά ημέρα" value={money(totalEur / days)} />
        <StatTile label="Κλήσεις" value={calls.toLocaleString("el-GR")} sub={errors ? `${errors} σφάλματα` : "χωρίς σφάλματα"} />
        <StatTile label="Tokens" value={tokens.toLocaleString("el-GR")} />
        <StatTile label="Μέσο ανά κλήση" value={calls ? money(totalEur / calls) : "—"} />
        {superAdmin ? <StatTile label="Κόστος παρόχων (χωρίς markup)" value={`$${rawUsd.toFixed(2)}`} sub={rawUsd ? `markup +${(((totalUsd - rawUsd) / rawUsd) * 100).toFixed(0)}%` : undefined} /> : <StatTile label="Λειτουργίες" value={String(features.length)} />}
      </div>
      <section className="rounded-2xl bg-white border border-eu-line p-4 grid gap-3">
        <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Κόστος ανά ημέρα (€)</h3>
        <LineChart labels={labels.map(label)} unit="€" series={superAdmin ? [{ key: "billed", label: "Χρεωμένο", values: byDay(eur) }, { key: "raw", label: "Πάροχοι (χωρίς markup)", values: byDay((r) => r.costUsd * (r.fxRate ?? rateToday)), color: "#1E7B3C" }] : [{ key: "billed", label: "Χρεωμένο", values: byDay(eur) }]} />
      </section>
      <div className="grid grid-cols-1 @4xl:grid-cols-2 gap-4">
        <section className="rounded-2xl bg-white border border-eu-line p-4 grid gap-3">
          <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Ανά λειτουργία (€ / ημέρα)</h3>
          <BarChart labels={labels.map(label)} unit="€" series={features.map((f) => ({ key: f, label: FEATURES[f] ?? f, values: byDay((r) => (r.feature === f ? eur(r) : 0)) }))} />
        </section>
        <section className="rounded-2xl bg-white border border-eu-line p-4 grid gap-3">
          <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Ανά μοντέλο (€)</h3>
          <RankBars rows={models} unit="€" />
        </section>
      </div>
      <section className="rounded-2xl bg-white border border-eu-line overflow-hidden">
        <h3 className="m-0 p-4 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Ημερήσια ανάλυση</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[length:var(--fs-14)]">
            <thead><tr className="text-left text-eu-muted border-t border-eu-line"><th className="p-3 font-bold">Ημέρα</th><th className="p-3 font-bold">Κλήσεις</th><th className="p-3 font-bold">Tokens</th>{superAdmin && <th className="p-3 font-bold">OpenRouter ($)</th>}<th className="p-3 font-bold">Χρεωμένο ($)</th><th className="p-3 font-bold">Ισοτιμία</th><th className="p-3 font-bold">Χρεωμένο (€)</th></tr></thead>
            <tbody>
              {dailyRows.map((r) => (
                <tr key={r.k} className="border-t border-eu-line-2 tabular-nums">
                  <td className="p-3 font-bold">{new Date(r.k).toLocaleDateString("el-GR")}</td><td className="p-3">{r.calls}</td><td className="p-3">{r.tokens.toLocaleString("el-GR")}</td>{superAdmin && <td className="p-3">{r.raw.toFixed(4)}</td>}<td className="p-3">{r.usd.toFixed(4)}</td><td className="p-3">{r.fx ? r.fx.toFixed(4) : "—"}</td><td className="p-3 font-bold text-eu-navy">{money(r.eur)}</td>
                </tr>
              ))}
              {!dailyRows.length && <tr><td colSpan={7} className="p-6 text-center text-eu-muted">Καμία κλήση AI στην περίοδο.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
