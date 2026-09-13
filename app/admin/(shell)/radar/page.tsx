import type { Metadata } from "next";
import { Radar, TrendingDown, DoorOpen, Mail } from "lucide-react";
import { radar } from "@/lib/data/fixtures/radar";
import { CountUp } from "@/components/motion/CountUp";
import { Reveal } from "@/components/motion/Reveal";

export const metadata: Metadata = { title: "Ραντάρ ζήτησης · Διοίκηση", robots: { index: false } };

/**
 * @dynamic Admin «Ραντάρ ζήτησης» (demo, no auth): what the market asked
 * for and the shop could not serve — missing / out-of-stock models with
 * a purchasing suggestion, the questions that worry buyers, price
 * ceilings customers state, and products that fail door widths. One hue
 * for magnitude (navy), status as icon + text, every list is also a table.
 */
export default function RadarPage() {
  const r = radar;
  const tile = "rounded-2xl bg-white border border-eu-line p-5";
  const maxAsk = Math.max(...r.missing.map((m) => m.asks));
  return (
    <div className="eu-container bg-eu-surface">
      <div className="eu-canvas eu-gutter py-8 @lg:py-10 grid gap-6">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4" data-reveal>
            <div>
              <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5">
                <Radar className="size-3.5" aria-hidden /> Διοίκηση · AI Business Intelligence
              </div>
              <h1 className="m-0 mt-1 font-heading font-bold text-eu-ink text-[length:var(--fs-34)] leading-tight">Ραντάρ ζήτησης</h1>
              <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)]">Τι ζήτησαν οι πελάτες από τον σύμβουλο και δεν μπορέσαμε να δώσουμε · {r.period}</p>
            </div>
            <button type="button" className="inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-blue">
              <Mail className="size-4" aria-hidden /> Εβδομαδιαίο email στον CEO
            </button>
          </div>
          <dl className="m-0 mt-6 grid grid-cols-2 @lg:grid-cols-4 gap-3">
            {[
              { l: "συνομιλίες", v: r.sessions },
              { l: "κατέληξαν στο καλάθι", v: r.toCart, s: ` (${Math.round((r.toCart / r.sessions) * 100)}%)` },
              { l: "παραδόθηκαν σε κατάστημα", v: r.handoffs },
              { l: "μοντέλα που ζητήθηκαν και λείπουν", v: r.missing.length },
            ].map((t) => (
              <div key={t.l} data-reveal className={tile}>
                <dt className="m-0 text-eu-muted text-[length:var(--fs-14)]">{t.l}</dt>
                <dd className="m-0 mt-1 font-heading font-extrabold text-eu-navy text-[length:var(--fs-36)] leading-none tracking-[-0.03em]">
                  <CountUp value={t.v} />
                  {t.s && <span className="text-eu-muted text-[length:var(--fs-16)] font-bold">{t.s}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>

        <Reveal className="grid grid-cols-1 @5xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4">
          <section data-reveal className={tile} aria-labelledby="missing-title">
            <h2 id="missing-title" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)]">
              Ζητήθηκαν και λείπουν
            </h2>
            <p className="m-0 mt-1 mb-4 text-eu-muted text-[length:var(--fs-14)]">Κάθε γραμμή έχει πρόταση για τις αγορές.</p>
            <div className="overflow-x-auto [&>*]:min-w-0">
              <table className="w-full border-collapse text-[length:var(--fs-14)]">
                <thead>
                  <tr className="text-left text-eu-muted">
                    <th className="font-semibold py-2 pr-3">Μοντέλο</th>
                    <th className="font-semibold py-2 pr-3">Ζητήσεις</th>
                    <th className="font-semibold py-2 pr-3 hidden @md:table-cell">Περιοχή</th>
                    <th className="font-semibold py-2 pr-3">Κατάσταση</th>
                    <th className="font-semibold py-2 hidden @lg:table-cell">Πρόταση</th>
                  </tr>
                </thead>
                <tbody>
                  {r.missing.map((m) => (
                    <tr key={m.model} className="border-t border-eu-line-2 align-middle">
                      <td className="py-2.5 pr-3">
                        <div className="font-bold text-eu-ink">{m.brand} {m.model}</div>
                      </td>
                      <td className="py-2.5 pr-3 min-w-[140px]">
                        <div className="flex items-center gap-2">
                          <span className="h-2 rounded-full bg-eu-navy" style={{ width: `${Math.max(8, (m.asks / maxAsk) * 100)}px` }} aria-hidden />
                          <span className="font-extrabold text-eu-ink tabular-nums">{m.asks}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-eu-ink-3 hidden @md:table-cell">{m.region}</td>
                      <td className="py-2.5 pr-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-13)] ${m.status === "out-of-stock" ? "bg-eu-amber/15 text-eu-amber" : "bg-eu-chip text-eu-blue"}`}>
                          {m.status === "out-of-stock" ? "Εξαντλημένο" : "Εκτός καταλόγου"}
                        </span>
                      </td>
                      <td className="py-2.5 text-eu-ink-2 hidden @lg:table-cell">{m.suggestion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section data-reveal className={tile} aria-labelledby="intent-title">
            <h2 id="intent-title" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)]">
              Τι προβληματίζει τους αγοραστές
            </h2>
            <p className="m-0 mt-1 mb-4 text-eu-muted text-[length:var(--fs-14)]">Μερίδιο ερωτήσεων ανά θέμα.</p>
            <ol className="m-0 p-0 list-none grid gap-3">
              {r.intents.map((it) => (
                <li key={it.theme} className="grid gap-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-bold text-eu-ink text-[length:var(--fs-15)]">{it.theme}</span>
                    <span className="font-extrabold text-eu-navy tabular-nums">{it.share}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-eu-surface-2 overflow-hidden">
                    <div className="h-full rounded-full bg-eu-navy" style={{ width: `${it.share}%` }} />
                  </div>
                  <div className="text-eu-muted text-[length:var(--fs-14)]">{it.example}</div>
                </li>
              ))}
            </ol>
          </section>
        </Reveal>

        <Reveal className="grid grid-cols-1 @5xl:grid-cols-2 gap-4">
          <section data-reveal className={tile} aria-labelledby="price-title">
            <h2 id="price-title" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)] inline-flex items-center gap-2">
              <TrendingDown className="size-5 text-eu-blue" aria-hidden /> Όρια τιμής που ακούγονται
            </h2>
            <p className="m-0 mt-1 mb-4 text-eu-muted text-[length:var(--fs-14)]">«Υπάρχει κάτι αντίστοιχο κάτω από …;» και πού ξεκινά ο κατάλογος.</p>
            <table className="w-full border-collapse text-[length:var(--fs-14)]">
              <thead>
                <tr className="text-left text-eu-muted">
                  <th className="font-semibold py-2 pr-3">Κατηγορία</th>
                  <th className="font-semibold py-2 pr-3">Όριο</th>
                  <th className="font-semibold py-2 pr-3">Ζητήσεις</th>
                  <th className="font-semibold py-2">Φθηνότερο</th>
                </tr>
              </thead>
              <tbody>
                {r.priceCeilings.map((p) => (
                  <tr key={p.category} className="border-t border-eu-line-2">
                    <td className="py-2.5 pr-3 font-bold text-eu-ink">{p.category}</td>
                    <td className="py-2.5 pr-3 tabular-nums">έως {p.ceiling} €</td>
                    <td className="py-2.5 pr-3 tabular-nums font-extrabold text-eu-navy">{p.asks}</td>
                    <td className={`py-2.5 tabular-nums font-bold ${p.cheapest > p.ceiling ? "text-eu-amber" : "text-eu-green"}`}>
                      {p.cheapest} € {p.cheapest > p.ceiling ? "· κενό" : "· καλύπτεται"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section data-reveal className={tile} aria-labelledby="fit-title">
            <h2 id="fit-title" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)] inline-flex items-center gap-2">
              <DoorOpen className="size-5 text-eu-blue" aria-hidden /> Κόβονται στην πόρτα
            </h2>
            <p className="m-0 mt-1 mb-4 text-eu-muted text-[length:var(--fs-14)]">Προϊόντα που «δεν χωρούν» στους χώρους των πελατών. Εύρημα για τη συλλογή.</p>
            <ul className="m-0 p-0 list-none grid gap-2">
              {r.fitFailures.map((f) => (
                <li key={f.product} className="flex items-center justify-between gap-3 rounded-xl bg-eu-surface p-3">
                  <span>
                    <span className="block font-bold text-eu-ink text-[length:var(--fs-15)]">{f.product}</span>
                    <span className="block text-eu-muted text-[length:var(--fs-14)]">{f.category} · πόρτες ≤ {f.door} εκ.</span>
                  </span>
                  <span className="font-extrabold text-eu-navy tabular-nums text-[length:var(--fs-20)]">{f.fails}</span>
                </li>
              ))}
            </ul>
          </section>
        </Reveal>
      </div>
    </div>
  );
}
