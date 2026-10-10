import Link from "next/link";
import { ArrowRight, BookOpen, Sparkles } from "lucide-react";
import { HELP_TOPICS } from "@/lib/help/content";
import { GEN } from "@/lib/help/server";
import { wikiData } from "@/lib/help/wiki";
import { TOPIC_ICON, WikiFrame } from "@/components/admin/help/WikiFrame";
import { WikiSearch } from "@/components/admin/help/WikiSearch";

export const metadata = { title: "Wiki & οδηγοί" };
export const dynamic = "force-dynamic";

const day = (iso: string) => new Date(iso).toLocaleDateString("el-GR", { day: "numeric", month: "short" });

/**
 * Το wiki της διαχείρισης: αναζήτηση, «Ξεκινώντας», όλες οι σελίδες που βλέπει ο χρήστης ανά περιοχή και τι άλλαξε
 * πρόσφατα. Παράγεται από την ίδια την εφαρμογή (npm run help:gen) — ενημερώνεται σε κάθε αλλαγή.
 */
export default async function WikiHome() {
  const { groups, index, visible } = await wikiData();
  const slugOf = new Map(visible.map((r) => [r.route, r.slug]));
  const recent = GEN.recent.filter((c) => c.routes.some((r) => slugOf.has(r))).slice(0, 12);
  return (
    <WikiFrame groups={groups}>
      <header className="grid gap-3">
        <div>
          <h1 className="m-0 inline-flex items-center gap-2 font-heading font-bold text-eu-ink text-[length:var(--fs-26)]"><BookOpen className="size-6 text-eu-blue" aria-hidden /> Wiki & οδηγοί</h1>
          <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[70ch]">Πώς δουλεύει κάθε σελίδα της διαχείρισης, με βήματα, εικόνες και συνδέσμους που σε πάνε κατευθείαν εκεί. Σε κάθε σελίδα, το κουμπί «Βοήθεια» (F1) ανοίγει τον οδηγό της.</p>
        </div>
        <WikiSearch index={index} autoFocus />
      </header>

      <section aria-labelledby="h-start" className="grid gap-2">
        <h2 id="h-start" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Ξεκινώντας</h2>
        <div className="grid gap-2 grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-3">
          {HELP_TOPICS.map((t) => { const I = TOPIC_ICON[t.icon] ?? BookOpen; return (
            <Link key={t.slug} href={`/admin/help/t/${t.slug}`} className="group flex items-start gap-3 rounded-xl border border-eu-line bg-white p-3 hover:border-eu-blue">
              <span className="size-9 shrink-0 grid place-items-center rounded-lg bg-eu-chip text-eu-blue"><I className="size-5" aria-hidden /></span>
              <span className="grid gap-0.5 min-w-0"><span className="font-bold text-eu-ink text-[length:var(--fs-15)] group-hover:text-eu-blue">{t.title}</span><span className="text-eu-muted text-[length:var(--fs-13)] leading-snug">{t.summary}</span></span>
            </Link>
          ); })}
        </div>
      </section>

      <div className="grid gap-5 @5xl:grid-cols-[minmax(0,1fr)_20rem] items-start">
        <section aria-labelledby="h-pages" className="grid gap-4">
          <h2 id="h-pages" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Σελίδες</h2>
          {groups.map((g) => (
            <div key={g.group} className="grid gap-1.5">
              <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-12)] uppercase tracking-wide">{g.group}</h3>
              <ul className="m-0 p-0 list-none grid gap-1.5 grid-cols-1 @xl:grid-cols-2">
                {g.pages.map((p) => (
                  <li key={p.slug}>
                    <Link href={`/admin/help/p/${p.slug}`} className="group flex gap-3 rounded-xl border border-eu-line bg-white p-2.5 h-full hover:border-eu-blue">
                      {p.shot && /* eslint-disable-next-line @next/next/no-img-element -- screenshot του wiki */ <img src={p.shot} alt="" loading="lazy" className="hidden @lg:block w-24 h-16 shrink-0 rounded-md object-cover object-top border border-eu-line" />}
                      <span className="grid gap-0.5 min-w-0">
                        <span className="font-bold text-eu-ink text-[length:var(--fs-14)] group-hover:text-eu-blue">{p.title}{!p.curated && <span className="ml-1.5 rounded-full bg-eu-surface px-1.5 py-0.5 text-eu-muted text-[length:var(--fs-12)] font-semibold align-middle">αυτόματος</span>}</span>
                        <span className="text-eu-muted text-[length:var(--fs-13)] leading-snug line-clamp-2">{p.summary || "—"}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
        <aside aria-labelledby="h-new" className="grid gap-2 @5xl:sticky @5xl:top-4">
          <h2 id="h-new" className="m-0 inline-flex items-center gap-1.5 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]"><Sparkles className="size-5 text-eu-blue" aria-hidden /> Τι νέο</h2>
          <ol className="m-0 p-0 list-none grid gap-2 rounded-xl border border-eu-line bg-white p-3">
            {recent.map((c) => (
              <li key={c.hash} className="grid gap-0.5">
                <span className="text-eu-muted text-[length:var(--fs-12)] tabular-nums">{day(c.date)}</span>
                <span className="text-eu-ink-2 text-[length:var(--fs-13)] leading-snug">{c.text}</span>
                <span className="flex flex-wrap gap-1">{c.routes.filter((r) => slugOf.has(r)).slice(0, 3).map((r) => <Link key={r} href={`/admin/help/p/${slugOf.get(r)}`} className="inline-flex items-center gap-0.5 font-bold text-eu-blue text-[length:var(--fs-12)] hover:underline">{groups.flatMap((g) => g.pages).find((p) => p.route === r)?.title ?? r} <ArrowRight className="size-3" aria-hidden /></Link>)}</span>
              </li>
            ))}
            {!recent.length && <li className="text-eu-muted text-[length:var(--fs-13)]">Καμία πρόσφατη αλλαγή.</li>}
          </ol>
          <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">Ενημερώθηκε {new Date(GEN.generatedAt).toLocaleString("el-GR", { dateStyle: "medium", timeStyle: "short" })}.</p>
        </aside>
      </div>
    </WikiFrame>
  );
}
