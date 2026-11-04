import type { Product, Spec } from "@/lib/data/types";
import { EnergyChip } from "@/components/commerce/EnergyChip";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("specs");

/**
 * Οι κάρτες σε δύο στήλες με τη σειρά τους: η αριστερή παίρνει τις πρώτες μέχρι να φτάσει περίπου το μισό ύψος
 * (γραμμές + επικεφαλίδα), η δεξιά τις υπόλοιπες. Στο κινητό οι στήλες μπαίνουν η μία κάτω από την άλλη — ίδια σειρά.
 */
function balance<T extends [string, Spec[]]>(cards: T[]): T[][] {
  const h = (c: T) => c[1].length + 1.5;
  const total = cards.reduce((n, c) => n + h(c), 0);
  let left = 0, i = 0;
  // σταματά στο σημείο που αφήνει τη μικρότερη διαφορά ανάμεσα στις δύο στήλες
  while (i < cards.length - 1 && Math.abs(total - 2 * (left + h(cards[i]))) <= Math.abs(total - 2 * left)) left += h(cards[i++]);
  if (i === 0 && cards.length > 1) i = 1;
  return [cards.slice(0, i), cards.slice(i)].filter((c) => c.length);
}

/** Characteristics as a grid of grouped cards — one table, readable sizes (the current site prints a flat 7px list twice). */
export function SpecsTable({ specs, energy }: { specs: Spec[]; energy?: Product["energy"] }) {
  // Ομάδες από εξωτερικές πηγές («Επίσημα χαρακτηριστικά (Icecat) · Οθόνη»): η πηγή γίνεται επικεφαλίδα ενότητας, η υποομάδα κάρτα
  const groups = new Map<string, Spec[]>();
  for (const s of specs) groups.set(s.group, [...(groups.get(s.group) ?? []), s]);
  const sections = new Map<string, [string, Spec[]][]>();
  for (const [g, rows] of groups) { const [sec, sub] = g.includes(" · ") ? [g.split(" · ")[0], g.split(" · ").slice(1).join(" · ")] : ["", g]; sections.set(sec, [...(sections.get(sec) ?? []), [sub, rows]]); }
  return (
    <section id="specs" className="scroll-mt-24" aria-labelledby="specs-title">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
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
      {[...sections.entries()].map(([sec, cards]) => (
      <div key={sec || "_"} className="mb-6 last:mb-0">
        {sec && <h3 className="m-0 mb-3 font-bold text-eu-navy text-[length:var(--fs-16)]">{sec}</h3>}
      {/* δύο στήλες που ρέουν ανεξάρτητα (όχι πλέγμα): μια κάρτα με 2 γραμμές δίπλα σε μία με 12 άφηνε τρύπα από κάτω */}
      {/* μόνη κάρτα στην ενότητα: όλο το πλάτος, οι γραμμές σε δύο στήλες — όχι μισή σειρά με κενό δίπλα */}
      <div className={`grid grid-cols-1 gap-4 items-start ${cards.length > 1 ? "@md:grid-cols-2" : ""}`}>
        {balance(cards).map((col, k) => (
        <div key={k} className="grid gap-4 content-start">
        {col.map(([g, rows]) => (
          <div key={g} className="rounded-xl border border-eu-line overflow-hidden">
            <div className="bg-eu-surface px-4 py-2.5 font-extrabold text-eu-ink text-[length:var(--fs-16)]">{g}</div>
            <dl className={`m-0 grid grid-cols-1 ${cards.length === 1 && rows.length > 1 ? "@md:grid-cols-2 @md:gap-x-4" : ""} -mb-px`}>
              {rows.map((r, i) => (
                // το ίδιο όνομα μπορεί να έρθει δύο φορές με άλλη μονάδα (π.χ. θερμική απόδοση σε kW και σε BTU)
                <div key={`${r.key}-${i}`} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3 px-4 py-2.5 border-b border-eu-line-2 text-[length:var(--fs-16)]">
                  <dt className="text-eu-muted">{r.key}</dt>
                  <dd className="m-0 text-eu-ink font-semibold">{r.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
        </div>
        ))}
      </div>
      </div>
      ))}
    </section>
  );
}
