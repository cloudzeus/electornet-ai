import Link from "next/link";
import { ChevronRight, ExternalLink, Info, LayoutTemplate } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { INFO_PAGES, INFO_ZONES, type InfoZone } from "@/lib/cms/info-pages";
import { listZonesDocs } from "@/lib/cms/page-zones";
import { StatusPill } from "@/components/admin/settings/ui";

export const metadata = { title: "Ζώνες σελίδων" };
export const dynamic = "force-dynamic";

const stable = (v: unknown): string => (Array.isArray(v) ? `[${v.map(stable).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v));
const ZONES: InfoZone[] = ["top", "after", "aside", "bottom"];
const SHORT: Record<InfoZone, string> = { top: "Πάνω", after: "Μετά", aside: "Πλάι", bottom: "Τέλος" };

/**
 * Οι πληροφοριακές σελίδες με ζώνες (ui-ux-pro-max: πυκνός πίνακας αντί για κάρτες): κατάσταση, components ανά ζώνη
 * (μόνο όσα έχουν περιεχόμενο τονίζονται), τελευταία αλλαγή / δημοσίευση και άνοιγμα του editor.
 */
export default async function ZonePagesList() {
  await requirePermission("cms.pages.write");
  const docs = new Map((await listZonesDocs()).map((d) => [d.key, d]));
  const date = (d: Date | null | undefined) => d?.toLocaleDateString("el-GR", { day: "numeric", month: "short" }) ?? null;
  const rows = INFO_PAGES.map((p) => {
    const d = docs.get(p.key);
    const live = d?.published ?? [];
    const draft = d?.draft ?? [];
    const changed = !!d && (d.published ? stable(d.published) !== stable(d.draft) : draft.length > 0);
    const status = !d?.published ? (draft.length ? (["off", "Πρόχειρο"] as const) : (["off", "Κενή"] as const)) : changed ? (["incomplete", "Αλλαγές στο πρόχειρο"] as const) : (["live", "Δημοσιευμένη"] as const);
    const per = Object.fromEntries(ZONES.map((z) => [z, (changed ? draft : live).filter((b) => (b.zone ?? "top") === z).length])) as Record<InfoZone, number>;
    return { p, d, status, changed, per, total: (changed ? draft : live).length };
  });
  const withContent = rows.filter((r) => r.total > 0).length, pending = rows.filter((r) => r.changed).length;

  return (
    <div className="@container grid gap-3 min-w-0">
      <header className="grid gap-1">
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)] inline-flex items-center gap-2"><LayoutTemplate className="size-5 text-eu-blue" aria-hidden /> Ζώνες σελίδων</h2>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)] max-w-[80ch]">Σημεία στις πληροφοριακές σελίδες (επικοινωνία, αποστολή, επιστροφές…) όπου βάζεις components: διαφημίσεις και προϊόντα από τις Προσφορές, κουπόνια, καταστήματα, banners, συχνές ερωτήσεις.</p>
      </header>

      <dl className="m-0 grid grid-cols-3 rounded-xl border border-eu-line bg-white overflow-hidden [&>div]:px-3 [&>div]:py-2 [&>div:not(:last-child)]:border-r [&>div]:border-eu-line-2">
        <div><dt className="text-eu-muted text-[length:var(--fs-12)]">Σελίδες</dt><dd className="m-0 font-heading font-extrabold text-eu-ink text-[length:var(--fs-18)] tabular-nums">{rows.length}</dd></div>
        <div><dt className="text-eu-muted text-[length:var(--fs-12)]">Με components</dt><dd className="m-0 font-heading font-extrabold text-eu-ink text-[length:var(--fs-18)] tabular-nums">{withContent}</dd></div>
        <div><dt className="text-eu-muted text-[length:var(--fs-12)]">Πρόχειρα για δημοσίευση</dt><dd className={`m-0 font-heading font-extrabold text-[length:var(--fs-18)] tabular-nums ${pending ? "text-eu-amber" : "text-eu-ink"}`}>{pending}</dd></div>
      </dl>

      <div data-help="zones.list" className="rounded-xl border border-eu-line bg-white overflow-hidden">
        <div className="hidden @3xl:grid grid-cols-[minmax(0,1.3fr)_10rem_minmax(0,1fr)_6rem_auto] gap-x-3 px-3 py-1.5 bg-eu-surface/70 border-b border-eu-line text-eu-ink-3 font-bold text-[length:var(--fs-12)]">
          <span>Σελίδα</span><span>Κατάσταση</span><span title="Components ανά ζώνη: πάνω (κάτω από την εισαγωγή), μετά το κείμενο, πλαϊνή στήλη, τέλος σελίδας">Components ανά ζώνη</span><span>Αλλαγή</span><span className="sr-only">Ενέργειες</span>
        </div>
        <ul className="m-0 p-0 list-none divide-y divide-eu-line-2">
          {rows.map(({ p, d, status, per, total }) => (
            <li key={p.key} className="grid grid-cols-[minmax(0,1fr)_auto] @3xl:grid-cols-[minmax(0,1.3fr)_10rem_minmax(0,1fr)_6rem_auto] items-center gap-x-3 gap-y-1.5 px-3 py-2">
              <span className="grid min-w-0">
                <Link href={`/admin/cms/pages/${p.key}`} className="font-bold text-eu-ink text-[length:var(--fs-14)] hover:text-eu-blue hover:underline truncate">{p.title}</Link>
                <span className="font-mono text-eu-muted text-[length:var(--fs-12)] truncate">{p.path}</span>
              </span>
              <span className="row-start-2 @3xl:row-start-auto"><StatusPill status={status[0]} text={status[1]} /></span>
              <span className="row-start-3 col-span-2 @3xl:row-start-auto @3xl:col-span-1 flex flex-wrap gap-1" aria-label={total ? `${total} components` : "Χωρίς components"}>
                {ZONES.filter((z) => p.zones.includes(z)).map((z) => (
                  <span key={z} title={INFO_ZONES[z].label} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[length:var(--fs-12)] ${per[z] ? "bg-eu-chip text-eu-navy font-bold" : "bg-eu-surface/70 text-eu-muted"}`}>{SHORT[z]}<span className="tabular-nums">{per[z]}</span></span>
                ))}
              </span>
              <span className="hidden @3xl:block text-eu-ink-3 text-[length:var(--fs-12)] tabular-nums" title={d?.publishedAt ? `δημοσίευση ${date(d.publishedAt)}` : undefined}>{date(d?.updatedAt) ?? "-"}</span>
              <span className="row-start-1 col-start-2 @3xl:row-start-auto @3xl:col-start-auto flex items-center gap-1 justify-end">
                <a href={p.path} target="_blank" rel="noopener noreferrer" aria-label={`${p.title} στο site`} title="Στο site" className="size-11 md:size-8 grid place-items-center rounded-full text-eu-ink-3 hover:bg-eu-surface hover:text-eu-navy"><ExternalLink className="size-4" aria-hidden /></a>
                <Link href={`/admin/cms/pages/${p.key}`} className="inline-flex items-center gap-0.5 rounded-full bg-eu-navy text-white font-bold text-[length:var(--fs-13)] pl-3 pr-2 min-h-11 md:min-h-8 hover:bg-eu-blue">Ζώνες <ChevronRight className="size-4" aria-hidden /></Link>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="m-0 inline-flex items-start gap-1.5 text-eu-ink-3 text-[length:var(--fs-12)] max-w-[80ch]"><Info className="size-3.5 mt-px shrink-0 text-eu-blue" aria-hidden /><span>Η αρχική, οι λίστες προϊόντων, η σελίδα προϊόντος και το καλάθι έχουν τις <Link href="/admin/prosfores/theseis" className="text-eu-blue font-bold underline">Διαφημιστικές θέσεις</Link> των Προσφορών και τις <Link href="/admin/cms/home" className="text-eu-blue font-bold underline">Ζώνες αρχικής</Link>.</span></p>
    </div>
  );
}
