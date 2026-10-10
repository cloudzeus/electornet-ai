import Link from "next/link";
import type { ReactNode } from "react";
import { BookOpen, Compass, Keyboard, LayoutTemplate, RefreshCw, Rocket, ShieldCheck, ToggleRight, type LucideIcon } from "lucide-react";
import { HELP_TOPICS } from "@/lib/help/content";

export const TOPIC_ICON: Record<string, LucideIcon> = { compass: Compass, rocket: Rocket, layout: LayoutTemplate, shield: ShieldCheck, toggle: ToggleRight, keyboard: Keyboard, refresh: RefreshCw };

/** Πλαίσιο του wiki: πλαϊνά τα γενικά άρθρα και οι ομάδες σελίδων, στο κέντρο το περιεχόμενο. */
export function WikiFrame({ groups, current, children }: { groups: { group: string; pages: { slug: string; title: string }[] }[]; current?: string; children: ReactNode }) {
  return (
    <div className="grid gap-5 @5xl:grid-cols-[15rem_minmax(0,1fr)] items-start min-w-0">
      <nav aria-label="Περιεχόμενα wiki" className="hidden @5xl:grid gap-3 sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto pr-1 text-[length:var(--fs-14)]">
        <Link href="/admin/help" className={`inline-flex items-center gap-2 rounded-lg px-2 min-h-9 font-extrabold ${!current ? "bg-eu-navy text-white" : "text-eu-navy hover:bg-white"}`}><BookOpen className="size-4" aria-hidden /> Wiki</Link>
        <div className="grid gap-0.5">
          <span className="px-2 text-eu-muted font-bold text-[length:var(--fs-12)] uppercase tracking-wide">Γενικά</span>
          {HELP_TOPICS.map((t) => <Link key={t.slug} href={`/admin/help/t/${t.slug}`} aria-current={current === `t:${t.slug}` ? "page" : undefined} className={`rounded-lg px-2 py-1 min-h-9 flex items-center ${current === `t:${t.slug}` ? "bg-white font-bold text-eu-navy" : "text-eu-ink-2 hover:bg-white"}`}>{t.title}</Link>)}
        </div>
        {groups.map((g) => (
          <div key={g.group} className="grid gap-0.5">
            <span className="px-2 text-eu-muted font-bold text-[length:var(--fs-12)] uppercase tracking-wide">{g.group}</span>
            {g.pages.map((p) => <Link key={p.slug} href={`/admin/help/p/${p.slug}`} aria-current={current === `p:${p.slug}` ? "page" : undefined} className={`rounded-lg px-2 py-1 min-h-9 flex items-center leading-tight ${current === `p:${p.slug}` ? "bg-white font-bold text-eu-navy" : "text-eu-ink-2 hover:bg-white"}`}>{p.title}</Link>)}
          </div>
        ))}
      </nav>
      <div className="min-w-0 grid gap-5 @container">{children}</div>
    </div>
  );
}
