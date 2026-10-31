import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ChevronLeft, Clock, Lightbulb } from "lucide-react";
import { requirePortalUser, portalBase } from "@/lib/partner-portal/session";
import { GUIDE, guideArticle } from "@/lib/partner-portal/guide";
import { Badge, Card, PageHead } from "@/components/synergaton/ui";

export function generateStaticParams() {
  return GUIDE.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const a = guideArticle((await params).slug);
  return { title: a?.title ?? "Οδηγός" };
}

export default async function GuideArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  await requirePortalUser();
  const base = await portalBase();
  const a = guideArticle((await params).slug);
  if (!a) notFound();
  const i = GUIDE.indexOf(a), next = GUIDE[i + 1];
  return (
    <article className="grid gap-5 min-w-0 max-w-[52rem]">
      <Link href={`${base}/odigos`} className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)] hover:underline min-h-11 w-fit"><ChevronLeft className="size-4" aria-hidden /> Όλος ο οδηγός</Link>
      <PageHead eyebrow={<span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden /> {a.minutes}′ ανάγνωση</span>} title={a.title} sub={a.summary} />
      {a.video ? (
        <video controls preload="metadata" poster={a.video.poster} className="w-full aspect-video rounded-3xl bg-eu-navy shadow-lg" data-help="portal.guide-video">
          {a.video.webm && <source src={a.video.webm} type="video/webm" />}
          <source src={a.video.src} type="video/mp4" />
        </video>
      ) : null}
      {a.sections.map((s) => (
        <section key={s.title} className="grid gap-2">
          <h2 className="m-0 font-heading font-extrabold text-[length:var(--fs-20)]">{s.title}</h2>
          {s.body?.map((p) => <p key={p} className="m-0 text-[length:var(--fs-16)] leading-relaxed text-eu-ink-2">{p}</p>)}
          {s.steps && (
            <ol className="m-0 p-0 list-none grid gap-2">
              {s.steps.map((st, n) => <li key={st} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 items-start rounded-xl bg-eu-surface px-3 py-2.5 text-[length:var(--fs-15)]"><span className="grid place-items-center size-7 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-13)]">{n + 1}</span><span className="pt-0.5">{st}</span></li>)}
            </ol>
          )}
          {s.tips?.map((t) => <p key={t} className="m-0 flex gap-2 rounded-xl bg-[#fffbea] px-3 py-2.5 text-[length:var(--fs-14)]"><Lightbulb className="size-4 shrink-0 mt-0.5 text-[#8a6500]" aria-hidden />{t}</p>)}
        </section>
      ))}
      {a.faq && (
        <Card className="p-4 sm:p-5 grid gap-2">
          <h2 className="m-0 font-heading font-extrabold text-[length:var(--fs-18)]">Συνηθισμένα προβλήματα</h2>
          {a.faq.map((f) => (
            <details key={f.q} className="group rounded-xl border border-eu-line px-3.5">
              <summary className="cursor-pointer list-none min-h-12 flex items-center justify-between gap-3 font-bold text-[length:var(--fs-15)] [&::-webkit-details-marker]:hidden">{f.q}<span className="text-eu-muted group-open:rotate-45 transition-transform motion-reduce:transition-none" aria-hidden>+</span></summary>
              <p className="m-0 pb-3 text-eu-ink-2 text-[length:var(--fs-14)] flex gap-2"><Check className="size-4 shrink-0 mt-0.5 text-eu-green" aria-hidden />{f.a}</p>
            </details>
          ))}
        </Card>
      )}
      {next && <Link href={`${base}/odigos/${next.slug}`} className="rounded-2xl border-2 border-eu-line hover:border-eu-navy p-4 grid gap-0.5 min-h-11"><span className="text-eu-ink-3 text-[length:var(--fs-13)]">Επόμενο</span><b className="font-heading text-[length:var(--fs-16)]">{next.title}</b>{next.video && <Badge tone="brand" icon={false}>Βίντεο</Badge>}</Link>}
    </article>
  );
}
