import Link from "next/link";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { SECTIONS, SECTION_GROUPS } from "@/lib/settings/schema";
import type { SectionState } from "@/lib/settings/status";

const EXTRA = [
  { key: "ai-markup", title: "AI markup ανά μοντέλο", group: "systems" },
  { key: "api-keys", title: "API keys", group: "systems" },
];
const DOT: Record<string, [string, string]> = {
  live: ["bg-eu-green", "ρυθμισμένο"],
  incomplete: ["bg-eu-amber", "λείπει κάτι"],
  disabled: ["bg-eu-muted-3 ring-2 ring-eu-muted-3/30", "ανενεργό"],
  off: ["border-2 border-eu-line-3", "δεν ρυθμίστηκε"],
};

/**
 * Όλες οι ενότητες ρυθμίσεων δίπλα στη φόρμα (σε στενή οθόνη: αναδιπλούμενη λίστα επάνω), ανά σκοπό, με κουκκίδα κατάστασης
 * — αλλάζεις ενότητα χωρίς να γυρίσεις στην αρχική.
 */
export function SettingsRail({ current, states }: { current: string; states: SectionState[] }) {
  const all = [...SECTIONS.map((s) => ({ key: s.key, title: s.title, group: s.group as string })), ...EXTRA];
  const cur = all.find((s) => s.key === current);
  const list = (
    <div className="grid gap-3">
      {SECTION_GROUPS.map((g) => (
        <div key={g.key} className="grid gap-0.5">
          <div className="px-2.5 font-extrabold text-eu-muted text-[length:var(--fs-12)] uppercase tracking-wide">{g.label}</div>
          <ul className="m-0 p-0 list-none grid">
            {all.filter((s) => s.group === g.key).map((s) => {
              const st = states.find((x) => x.key === s.key);
              const [dot, label] = DOT[st?.status ?? "live"];
              const on = s.key === current;
              return (
                <li key={s.key}>
                  <Link href={`/admin/settings/${s.key}`} aria-current={on ? "page" : undefined} className={`flex items-center gap-2.5 rounded-lg px-2.5 min-h-10 text-[length:var(--fs-14)] ${on ? "bg-eu-navy text-white font-bold" : "text-eu-ink-2 hover:bg-eu-surface hover:text-eu-blue"}`}>
                    {st ? <span className={`size-2.5 shrink-0 rounded-full ${dot}`} title={label} aria-hidden /> : <span className="size-2.5 shrink-0" aria-hidden />}
                    <span className="min-w-0 flex-1 leading-tight">{s.title}</span>
                    {st && <span className="sr-only">({label})</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
  return (
    <nav data-help="settings.rail" aria-label="Ενότητες ρυθμίσεων" className="min-w-0 @5xl:self-start @5xl:[@media(min-height:760px)]:sticky @5xl:top-4">
      <div className="hidden @5xl:grid gap-3">
        <Link href="/admin/settings" className="inline-flex items-center gap-1 px-2.5 text-eu-blue font-bold text-[length:var(--fs-14)] hover:underline"><ChevronLeft className="size-4" aria-hidden /> Επισκόπηση</Link>
        {list}
      </div>
      <div className="@5xl:hidden flex flex-wrap items-center gap-2">
        <Link href="/admin/settings" className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)] min-h-11 hover:underline"><ChevronLeft className="size-4" aria-hidden /> Επισκόπηση</Link>
        <details className="group relative flex-1 min-w-[14rem]">
          <summary className="list-none cursor-pointer flex items-center gap-2 rounded-xl border-2 border-eu-line bg-white px-3 min-h-11 font-bold text-eu-ink text-[length:var(--fs-14)]">
            <span className="text-eu-muted font-normal">Ενότητα:</span> <span className="flex-1 min-w-0 truncate">{cur?.title ?? "—"}</span>
            <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="mt-2 rounded-xl border border-eu-line bg-white p-2 shadow-[var(--shadow-raised)]">{list}</div>
        </details>
      </div>
    </nav>
  );
}
