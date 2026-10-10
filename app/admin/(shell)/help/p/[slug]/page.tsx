import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ExternalLink, Lightbulb, MapPin, ShieldCheck, Sparkles } from "lucide-react";
import { ROLES } from "@/prisma/roles";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { GEN, curatedFor, groupOf } from "@/lib/help/server";
import { wikiData } from "@/lib/help/wiki";
import { WikiFrame } from "@/components/admin/help/WikiFrame";
import { ShotTabs } from "@/components/admin/help/ShotTabs";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = GEN.routes.find((x) => x.slug === slug);
  return { title: r ? `Οδηγός · ${curatedFor(r.route)?.title ?? r.nav?.label ?? r.title}` : "Οδηγός" };
}
const day = (iso: string) => new Date(iso).toLocaleDateString("el-GR", { day: "numeric", month: "long", year: "numeric" });
const permLabel = (p: string) => (p === "*" ? "Κάθε συνδεδεμένος χρήστης" : p === "super-admin" ? "Μόνο Super Admin" : PERMISSIONS.find((x) => x.key === p)?.description ?? p);

/** Ο οδηγός μιας σελίδας: τι κάνει, εικόνες, τα σημεία της με «Δείξε μου στη σελίδα», βήματα, συμβουλές, ιστορικό. */
export default async function WikiPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { groups, visible } = await wikiData();
  const r = visible.find((x) => x.slug === slug);
  if (!r) notFound();
  const c = curatedFor(r.route);
  const title = c?.title ?? r.nav?.label ?? r.title;
  const roles = ROLES.filter((x) => x.key !== "customer" && (r.perm === "*" || (r.perm === "super-admin" ? x.key === "super-admin" : x.permissions.some((p) => p === "*" || p === r.perm || (p.endsWith(".*") && r.perm.startsWith(p.slice(0, -1))))))).map((x) => x.name);
  return (
    <WikiFrame groups={groups} current={`p:${slug}`}>
      <header className="grid gap-2">
        <span className="text-eu-muted text-[length:var(--fs-13)] font-bold"><Link href="/admin/help" className="text-eu-blue hover:underline">Wiki</Link> › {groupOf(r)}</span>
        <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)] leading-tight">{title}</h1>
        <p className="m-0 text-eu-ink-2 text-[length:var(--fs-16)] leading-relaxed max-w-[70ch]">{c?.summary ?? r.doc}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={r.route} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-blue">Άνοιγμα σελίδας <ArrowRight className="size-4" aria-hidden /></Link>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-eu-line px-3 min-h-9 text-eu-ink-2 text-[length:var(--fs-13)]"><ShieldCheck className="size-4 text-eu-blue" aria-hidden />{permLabel(r.perm)}{roles.length ? ` · ${roles.join(", ")}` : ""}</span>
          {r.updatedAt && <span className="text-eu-muted text-[length:var(--fs-13)]">Τελευταία αλλαγή: {day(r.updatedAt)}</span>}
          {!c && <span className="rounded-full bg-eu-surface px-2.5 py-1 text-eu-muted text-[length:var(--fs-12)] font-bold">Αυτόματος οδηγός (από τον κώδικα της σελίδας)</span>}
        </div>
      </header>

      {(r.shots.desktop || r.shots.mobile) && <ShotTabs desktop={r.shots.desktop} mobile={r.shots.mobile} title={title} />}

      {c?.parts?.length ? (
        <section aria-labelledby="h-parts" className="grid gap-2">
          <h2 id="h-parts" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Τα σημεία της σελίδας</h2>
          <ol className="m-0 p-0 list-none grid gap-2 grid-cols-1 @3xl:grid-cols-2">
            {c.parts.map((p, i) => (
              <li key={p.key} className="flex gap-3 rounded-xl border border-eu-line bg-white p-3">
                <span className="size-7 shrink-0 rounded-full bg-eu-yellow text-eu-navy grid place-items-center font-extrabold text-[length:var(--fs-13)]" aria-hidden>{i + 1}</span>
                <span className="grid gap-1 min-w-0">
                  <b className="text-eu-ink text-[length:var(--fs-15)]">{p.title}</b>
                  <span className="text-eu-ink-2 text-[length:var(--fs-14)] leading-relaxed">{p.text}</span>
                  {!r.dynamic && <Link href={`${r.route}?help=${p.key}`} className="justify-self-start inline-flex items-center gap-1 font-bold text-eu-blue text-[length:var(--fs-13)] hover:underline"><MapPin className="size-3.5" aria-hidden /> Δείξε μου στη σελίδα</Link>}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {c?.tasks?.length ? (
        <section aria-labelledby="h-tasks" className="grid gap-2">
          <h2 id="h-tasks" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Πώς κάνω…</h2>
          {c.tasks.map((t) => (
            <article key={t.title} id={`task-${encodeURIComponent(t.title)}`} className="rounded-xl border border-eu-line bg-white p-3 grid gap-2 scroll-mt-4">
              <h3 className="m-0 font-bold text-eu-ink text-[length:var(--fs-16)]">{t.title}</h3>
              <ol className="m-0 grid gap-1.5 pl-0 list-none [counter-reset:s]">
                {t.steps.map((s, k) => <li key={k} className="flex gap-2.5 text-eu-ink-2 text-[length:var(--fs-15)] leading-snug"><span className="size-6 shrink-0 rounded-full bg-eu-navy text-white grid place-items-center font-extrabold text-[length:var(--fs-12)]" aria-hidden>{k + 1}</span><span className="pt-0.5">{s}</span></li>)}
              </ol>
              {t.link && <Link href={t.link.href} className="justify-self-start inline-flex items-center gap-1 font-bold text-eu-blue text-[length:var(--fs-14)] hover:underline">{t.link.label} <ArrowRight className="size-4" aria-hidden /></Link>}
            </article>
          ))}
        </section>
      ) : null}

      {c?.tips?.length ? (
        <ul className="m-0 p-0 list-none grid gap-1.5">
          {c.tips.map((t) => <li key={t} className="flex items-start gap-2 rounded-xl bg-eu-chip/60 px-3 py-2.5 text-eu-ink-2 text-[length:var(--fs-14)] leading-snug"><Lightbulb className="size-4 mt-0.5 shrink-0 text-eu-blue" aria-hidden />{t}</li>)}
        </ul>
      ) : null}

      <div className="grid gap-4 @3xl:grid-cols-2 items-start">
        {c?.related?.length ? (
          <section aria-labelledby="h-rel" className="grid gap-1.5">
            <h2 id="h-rel" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Σχετικές σελίδες</h2>
            <div className="flex flex-wrap gap-1.5">{c.related.map((x) => <Link key={x.href} href={x.href} className="inline-flex items-center gap-1 rounded-full bg-white border border-eu-line px-3 min-h-10 font-bold text-eu-navy text-[length:var(--fs-14)] hover:border-eu-blue">{x.label} <ExternalLink className="size-3.5" aria-hidden /></Link>)}</div>
          </section>
        ) : null}
        {r.changes.length > 0 && (
          <section aria-labelledby="h-ch" className="grid gap-1.5">
            <h2 id="h-ch" className="m-0 inline-flex items-center gap-1.5 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]"><Sparkles className="size-4 text-eu-blue" aria-hidden /> Τι άλλαξε</h2>
            <ol className="m-0 p-0 list-none grid gap-1.5">{r.changes.map((x) => <li key={x.hash} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 text-[length:var(--fs-13)]"><span className="text-eu-muted tabular-nums">{new Date(x.date).toLocaleDateString("el-GR", { day: "numeric", month: "short", year: "2-digit" })}</span><span className="text-eu-ink-2 leading-snug">{x.text}</span></li>)}</ol>
          </section>
        )}
      </div>
    </WikiFrame>
  );
}
