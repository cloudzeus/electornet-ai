import Link from "next/link";
import { BookOpen, ChevronRight, Clock, PlayCircle } from "lucide-react";
import { requirePortalUser, portalBase } from "@/lib/partner-portal/session";
import { GUIDE, GUIDE_GROUPS } from "@/lib/partner-portal/guide";
import { Badge, Card, PageHead } from "@/components/synergaton/ui";

export const metadata = { title: "Οδηγός" };

export default async function GuideIndex() {
  await requirePortalUser();
  const base = await portalBase();
  return (
    <div className="grid gap-6 min-w-0">
      <PageHead eyebrow="Βοήθεια" title="Οδηγός & videos" sub="Σύντομα άρθρα με βήματα και βίντεο για κάθε μέρος της πύλης. Σε κάθε οθόνη θα βρείτε σύνδεσμο προς το σωστό άρθρο." />
      {(Object.keys(GUIDE_GROUPS) as (keyof typeof GUIDE_GROUPS)[]).map((g) => (
        <section key={g} className="grid gap-3" aria-labelledby={`g-${g}`} data-help={`portal.guide-${g}`}>
          <h2 id={`g-${g}`} className="m-0 font-heading font-extrabold text-[length:var(--fs-20)]">{GUIDE_GROUPS[g]}</h2>
          <ul className="m-0 p-0 list-none grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {GUIDE.filter((a) => a.group === g).map((a) => (
              <Card as="li" key={a.slug}>
                <Link href={`${base}/odigos/${a.slug}`} className="group grid gap-2 p-4 sm:p-5 h-full rounded-2xl outline-none focus-visible:ring-[3px] focus-visible:ring-eu-blue/40">
                  <span className="flex items-center gap-2">
                    <span className="grid place-items-center size-10 rounded-xl bg-eu-chip text-eu-navy">{a.video ? <PlayCircle className="size-5" aria-hidden /> : <BookOpen className="size-5" aria-hidden />}</span>
                    <Badge tone="neutral" icon={false}><Clock className="size-3.5" aria-hidden /> {a.minutes}′</Badge>
                    {a.video && <Badge tone="brand" icon={false}>Βίντεο {a.video.duration}</Badge>}
                  </span>
                  <b className="font-heading text-[length:var(--fs-17)] leading-snug">{a.title}</b>
                  <span className="text-eu-ink-3 text-[length:var(--fs-14)]">{a.summary}</span>
                  <span className="mt-auto inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)]">Άνοιγμα <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden /></span>
                </Link>
              </Card>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
