import { Zap } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { hasEprelKey } from "@/lib/eprel/client";
import { eprelStats, groupsWithCounts } from "@/lib/eprel/sync";
import { GROUP_NAMES_EL } from "@/lib/eprel/fields";
import { Pagination } from "@/components/admin/Pagination";
import { EprelTools, GroupToggle, StoredRow } from "./EprelTools";

export const metadata = { title: "EPREL · ενεργειακές ετικέτες" };
export const dynamic = "force-dynamic";

const PAGE = 25;
const fmt = (d: Date) => d.toLocaleString("el-GR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * EPREL: το ευρωπαϊκό μητρώο ενεργειακής σήμανσης. Από εδώ φέρνουμε για κάθε
 * μοντέλο που πουλάμε την επίσημη ετικέτα, το δελτίο πληροφοριών και όλα τα
 * τεχνικά που δήλωσε ο κατασκευαστής — και τα κρατάμε στη δική μας βάση και CDN.
 */
export default async function EprelPage({ searchParams }: { searchParams: Promise<{ q?: string; group?: string; page?: string }> }) {
  await requirePermission("catalog.products.read");
  const { q = "", group = "", page: p = "1" } = await searchParams;
  const page = Math.max(1, Number(p) || 1);
  const where = {
    ...(group ? { groupUrlCode: group } : {}),
    ...(q ? { OR: [{ modelIdentifier: { contains: q, mode: "insensitive" as const } }, { supplierOrTrademark: { contains: q, mode: "insensitive" as const } }, { registrationNumber: { contains: q } }] } : {}),
  };
  const [stats, groups, rows, total, runs] = await Promise.all([
    eprelStats(),
    groupsWithCounts(),
    db.eprelProduct.findMany({ where, orderBy: [{ updatedAt: "desc" }], skip: (page - 1) * PAGE, take: PAGE, include: { labels: { select: { productId: true } }, group: { select: { code: true } } } }),
    db.eprelProduct.count({ where }),
    db.eprelSyncRun.findMany({ orderBy: { at: "desc" }, take: 6 }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (n: number) => `?${new URLSearchParams({ q, group, page: String(n) })}`;
  const activeGroups = groups.filter((g) => g.active).map((g) => ({ urlCode: g.urlCode, name: g.nameEl }));

  return (
    <div className="grid gap-5 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><Zap className="size-3.5" aria-hidden /> Ευρωπαϊκό μητρώο ενεργειακής σήμανσης</div>
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">EPREL</h2>
          <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">Για κάθε μοντέλο που πουλάμε φέρνουμε την επίσημη ετικέτα, το δελτίο πληροφοριών στα ελληνικά και όλα τα τεχνικά που δήλωσε ο κατασκευαστής. Μένουν στη δική μας βάση, τα αρχεία στο Bunny CDN, και τροφοδοτούν τη σελίδα προϊόντος και τη σύγκριση κατανάλωσης.{hasEprelKey() ? "" : " Λείπει το EPREL_API_KEY στο .env."}</p>
        </div>
        <EprelTools mode="header" groups={activeGroups} />
      </div>

      <p className="m-0 rounded-xl bg-eu-surface p-3 text-[length:var(--fs-13)] text-eu-ink-3">
        <b className="text-eu-ink">{stats.products.toLocaleString("el-GR")}</b> καταχωρίσεις στη βάση · <b className="text-eu-ink">{stats.mirrored.toLocaleString("el-GR")}</b> με αρχεία στο CDN μας · <b className="text-eu-ink">{stats.linked.toLocaleString("el-GR")}</b> δεμένες με προϊόντα · <b className="text-eu-ink">{stats.active}</b>/{stats.groups} ομάδες ενεργές{stats.lastRun ? ` · τελευταία ενέργεια ${fmt(stats.lastRun.at)} (${stats.lastRun.kind}${stats.lastRun.ok ? "" : ", απέτυχε"})` : ""}.
      </p>

      <section className="grid gap-3">
        <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Αναζήτηση & εισαγωγή</h3>
        <EprelTools mode="search" groups={activeGroups} />
      </section>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Αποθηκευμένες καταχωρίσεις</h3>
          <form className="flex flex-wrap gap-2">
            <select name="group" defaultValue={group} aria-label="Ομάδα" className="rounded-full border border-eu-line px-3 min-h-10 text-[length:var(--fs-14)] bg-white">
              <option value="">Όλες οι ομάδες</option>
              {groups.filter((g) => g.count).map((g) => <option key={g.urlCode} value={g.urlCode}>{g.nameEl} ({g.count})</option>)}
            </select>
            <input name="q" defaultValue={q} placeholder="Μοντέλο, μάρκα ή αριθμός EPREL…" aria-label="Αναζήτηση" className="rounded-full border border-eu-line px-4 min-h-10 text-[length:var(--fs-14)] min-w-[240px]" />
            <button className="rounded-full bg-eu-navy text-white px-4 min-h-10 font-bold text-[length:var(--fs-14)]">Φίλτρο</button>
          </form>
        </div>
        <div className="rounded-2xl border border-eu-line bg-white overflow-x-auto">
          <table className="w-full text-[length:var(--fs-14)]">
            <thead className="text-left text-eu-muted text-[length:var(--fs-13)]">
              <tr><th className="py-2 px-3">Ετικέτα</th><th className="py-2 px-3">Μοντέλο</th><th className="py-2 px-3">Ομάδα</th><th className="py-2 px-3">Κλάση</th><th className="py-2 px-3">kWh/έτος</th><th className="py-2 px-3">Αρχεία</th><th className="py-2 px-3">Ενημέρωση</th><th className="py-2 px-3"></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => <StoredRow key={r.registrationNumber} row={{ registrationNumber: r.registrationNumber, modelIdentifier: r.modelIdentifier, supplierOrTrademark: r.supplierOrTrademark, groupName: GROUP_NAMES_EL[r.group.code] ?? r.groupUrlCode, energyClass: r.energyClass, energyClassRange: r.energyClassRange, annualKwh: r.annualKwh, annualKwhBasis: r.annualKwhBasis, nestedLabelSvg: r.nestedLabelSvg, labelSvgUrl: r.labelSvgUrl, ficheUrl: r.ficheUrl, labelAssetUrl: r.labelAssetUrl, ficheAssetUrl: r.ficheAssetUrl, fetchedAt: r.fetchedAt.toISOString(), linked: r.labels.length, status: r.status, onMarketEnd: r.onMarketEnd?.toISOString() ?? null }} />)}
              {!rows.length && <tr><td colSpan={8} className="p-8 text-center text-eu-muted">Καμία καταχώριση ακόμη — ψάξε παραπάνω με κωδικό μοντέλου.</td></tr>}
            </tbody>
          </table>
          <div className="flex justify-center px-3 py-3 border-t border-eu-line"><Pagination page={page} pages={pages} total={total} label="καταχωρίσεις" href={href} /></div>
        </div>
      </section>

      <section className="grid gap-3">
        <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Ομάδες προϊόντων</h3>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Οι ενεργές ομάδες είναι αυτές που ψάχνει η αυτόματη αντιστοίχιση. Οι «παλιάς κλίμακας» ομάδες αφορούν μοντέλα πριν το 2021.</p>
        <ul className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] list-none p-0 m-0">
          {groups.map((g) => (
            <li key={g.code} className={`flex items-center gap-3 rounded-xl border bg-white px-3 py-2 ${g.active ? "border-eu-line" : "border-eu-line/60 opacity-70"}`}>
              <GroupToggle code={g.code} active={g.active} />
              <div className="min-w-0 flex-1">
                <div className="font-bold text-eu-ink text-[length:var(--fs-14)] truncate">{g.nameEl}</div>
                <div className="text-eu-muted text-[length:var(--fs-13)] truncate">{g.urlCode}{g.regulation ? ` · ${g.regulation.replace("Regulation ", "")}` : ""}</div>
              </div>
              <span className="tabular-nums text-eu-ink-3 text-[length:var(--fs-13)]">{g.count}</span>
            </li>
          ))}
          {!groups.length && <li className="text-eu-muted text-[length:var(--fs-14)]">Δεν έχουν φορτωθεί ομάδες — πάτησε «Ομάδες από το EPREL».</li>}
        </ul>
      </section>

      {runs.length > 0 && (
        <div className="flex flex-wrap gap-2 text-[length:var(--fs-13)] text-eu-muted">
          {runs.map((r) => <span key={r.id} className={`rounded-full px-2.5 py-1 ${r.ok ? "bg-eu-surface" : "bg-eu-red/10 text-eu-red"}`}>{fmt(r.at)} · {r.kind}: {r.ok ? `${r.fetched} ελήφθησαν, +${r.created}, ~${r.updated}, ${(r.ms / 1000).toFixed(1)} s` : r.error}</span>)}
        </div>
      )}
    </div>
  );
}
