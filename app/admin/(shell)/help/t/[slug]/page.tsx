import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BookOpen, Lightbulb } from "lucide-react";
import { HELP_TOPICS } from "@/lib/help/content";
import { wikiData } from "@/lib/help/wiki";
import { TOPIC_ICON, WikiFrame } from "@/components/admin/help/WikiFrame";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = HELP_TOPICS.find((x) => x.slug === slug);
  return { title: t ? `Wiki · ${t.title}` : "Wiki" };
}

/** Γενικό άρθρο του wiki (π.χ. «Πρόχειρο, έλεγχος & δημοσίευση»). */
export default async function WikiTopic({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = HELP_TOPICS.find((x) => x.slug === slug);
  if (!t) notFound();
  const { groups } = await wikiData();
  const I = TOPIC_ICON[t.icon] ?? BookOpen;
  return (
    <WikiFrame groups={groups} current={`t:${slug}`}>
      <article className="grid gap-4 max-w-[75ch]">
        <header className="grid gap-1.5">
          <span className="text-eu-muted text-[length:var(--fs-13)] font-bold"><Link href="/admin/help" className="text-eu-blue hover:underline">Wiki</Link> › Γενικά</span>
          <h1 className="m-0 inline-flex items-center gap-2 font-heading font-bold text-eu-ink text-[length:var(--fs-26)]"><I className="size-6 text-eu-blue" aria-hidden />{t.title}</h1>
          <p className="m-0 text-eu-ink-2 text-[length:var(--fs-16)] leading-relaxed">{t.summary}</p>
        </header>
        {t.body.map((b, i) =>
          "p" in b ? <p key={i} className="m-0 text-eu-ink-2 text-[length:var(--fs-16)] leading-relaxed">{b.p}</p>
          : "h" in b ? <h2 key={i} className="m-0 mt-1 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">{b.h}</h2>
          : "steps" in b ? <ol key={i} className="m-0 p-0 list-none grid gap-1.5">{b.steps.map((s, k) => <li key={k} className="flex gap-2.5 text-eu-ink-2 text-[length:var(--fs-15)] leading-snug"><span className="size-6 shrink-0 rounded-full bg-eu-navy text-white grid place-items-center font-extrabold text-[length:var(--fs-12)]" aria-hidden>{k + 1}</span><span className="pt-0.5">{s}</span></li>)}</ol>
          : "list" in b ? <ul key={i} className="m-0 pl-5 grid gap-1.5 text-eu-ink-2 text-[length:var(--fs-15)] leading-snug">{b.list.map((s, k) => <li key={k}>{s}</li>)}</ul>
          : "tip" in b ? <p key={i} className="m-0 flex items-start gap-2 rounded-xl bg-eu-chip/60 px-3 py-2.5 text-eu-ink-2 text-[length:var(--fs-14)]"><Lightbulb className="size-4 mt-0.5 shrink-0 text-eu-blue" aria-hidden />{b.tip}</p>
          : <div key={i} className="flex flex-wrap gap-1.5">{b.links.map((l) => <Link key={l.href} href={l.href} className="inline-flex items-center gap-1 rounded-full bg-white border border-eu-line px-3 min-h-10 font-bold text-eu-navy text-[length:var(--fs-14)] hover:border-eu-blue">{l.label} <ArrowRight className="size-3.5" aria-hidden /></Link>)}</div>,
        )}
      </article>
    </WikiFrame>
  );
}
