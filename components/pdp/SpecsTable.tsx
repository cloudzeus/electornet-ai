import type { Product, Spec } from "@/lib/data/types";
import { EnergyChip } from "@/components/commerce/EnergyChip";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("specs");

/** Characteristics as a grid of grouped cards — one table, readable sizes (the current site prints a flat 7px list twice). */
export function SpecsTable({ specs, energy }: { specs: Spec[]; energy?: Product["energy"] }) {
  const groups = new Map<string, Spec[]>();
  for (const s of specs) groups.set(s.group, [...(groups.get(s.group) ?? []), s]);
  return (
    <section id="specs" className="scroll-mt-24" aria-labelledby="specs-title">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <div className="font-extrabold text-eu-blue text-[length:var(--fs-14)] tracking-wide mb-1">{c.technikos_fakelos}</div>
          <h2 id="specs-title" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)] leading-tight">
            {c.charaktiristika}
          </h2>
        </div>
        {energy && (
          <div className="flex items-center gap-2 text-[length:var(--fs-16)] text-eu-ink-2 rounded-lg bg-eu-surface px-3 py-2">
            {c.energeiaki_etiketa} <EnergyChip cls={energy.cls} fiche={energy.fiche} />
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 @md:grid-cols-2 gap-4">
        {[...groups.entries()].map(([g, rows]) => (
          <div key={g} className="rounded-xl border border-eu-line overflow-hidden">
            <div className="bg-eu-surface px-4 py-2.5 font-extrabold text-eu-ink text-[length:var(--fs-16)]">{g}</div>
            <dl className="m-0 divide-y divide-eu-line-2">
              {rows.map((r) => (
                <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3 px-4 py-2.5 text-[length:var(--fs-16)]">
                  <dt className="text-eu-muted">{r.key}</dt>
                  <dd className="m-0 text-eu-ink font-semibold">{r.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}
