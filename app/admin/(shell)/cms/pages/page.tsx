import Link from "next/link";
import { ChevronRight, ExternalLink, Info } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { INFO_PAGES, INFO_ZONES } from "@/lib/cms/info-pages";
import { listZonesDocs } from "@/lib/cms/page-zones";
import { StatusPill } from "@/components/admin/settings/ui";

export const metadata = { title: "Ζώνες σελίδων" };
export const dynamic = "force-dynamic";

const stable = (v: unknown): string => (Array.isArray(v) ? `[${v.map(stable).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v));

export default async function ZonePagesList() {
  await requirePermission("cms.pages.write");
  const docs = new Map((await listZonesDocs()).map((d) => [d.key, d]));
  const date = (d: Date | null | undefined) => d?.toLocaleDateString("el-GR", { day: "numeric", month: "short" }) ?? null;
  return (
    <div className="grid gap-5 min-w-0">
      <header className="grid gap-2">
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Περιεχόμενο</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Ζώνες σελίδων</h2>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[75ch]">Στις πληροφοριακές σελίδες (επικοινωνία, τρόποι αποστολής, επιστροφές…) υπάρχουν ζώνες όπου βάζεις components συνδεδεμένα με δυναμικό περιεχόμενο: διαφημίσεις και προϊόντα από τις Προσφορές, κουπόνια, καταστήματα, banners, συχνές ερωτήσεις.</p>
        <p className="m-0 inline-flex items-start gap-2 text-eu-ink-2 text-[length:var(--fs-14)] max-w-[75ch]"><Info className="size-4 mt-0.5 shrink-0 text-eu-blue" aria-hidden /><span>Η αρχική, οι λίστες προϊόντων, η σελίδα προϊόντος και το καλάθι δεν έχουν ακόμη ζώνες εδώ — εκεί ισχύουν οι <Link href="/admin/prosfores/theseis" className="text-eu-blue font-bold underline">Διαφημιστικές θέσεις</Link> των Προσφορών.</span></p>
      </header>
      <ul className="m-0 p-0 list-none grid grid-cols-1 @2xl:grid-cols-2 @6xl:grid-cols-3 gap-3">
        {INFO_PAGES.map((p) => {
          const d = docs.get(p.key);
          const live = d?.published ?? [];
          const changed = !!d && (d.published ? stable(d.published) !== stable(d.draft) : d.draft.length > 0);
          const [s, t] = !d?.published ? (d?.draft.length ? (["off", "Πρόχειρο — δεν φαίνεται"] as const) : (["off", "Χωρίς components"] as const)) : changed ? (["incomplete", "Δημοσιευμένη · αλλαγές στο πρόχειρο"] as const) : (["live", "Δημοσιευμένη"] as const);
          return (
            <li key={p.key} className="rounded-2xl bg-white border border-eu-line p-4 grid gap-3 min-w-0">
              <div className="grid gap-1">
                <div className="font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">{p.title}</div>
                <div className="flex flex-wrap items-center gap-2"><StatusPill status={s} text={t} /><span className="font-mono text-eu-muted text-[length:var(--fs-13)]">{p.path}</span></div>
              </div>
              <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">
                {p.zones.map((z) => { const n = live.filter((b) => (b.zone ?? "top") === z).length; return <li key={z} className={`rounded-full px-2.5 py-1 text-[length:var(--fs-13)] font-bold ${n ? "bg-eu-chip text-eu-navy" : "bg-eu-surface text-eu-muted"}`}>{INFO_ZONES[z].label} · {n}</li>; })}
              </ul>
              {d?.updatedAt && <div className="text-eu-muted text-[length:var(--fs-13)]">αλλαγή {date(d.updatedAt)}{d.publishedAt ? ` · δημοσίευση ${date(d.publishedAt)}` : ""}</div>}
              <div className="flex flex-wrap gap-2">
                <Link href={`/admin/cms/pages/${p.key}`} className="inline-flex items-center justify-center gap-1 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-blue grow @md:grow-0">Επεξεργασία ζωνών <ChevronRight className="size-4" aria-hidden /></Link>
                <a href={p.path} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-1 rounded-full border-2 border-eu-line font-bold text-[length:var(--fs-14)] px-4 min-h-11 hover:border-eu-navy grow @md:grow-0">Στο site <ExternalLink className="size-4" aria-hidden /></a>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
