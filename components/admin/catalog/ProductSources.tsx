import { SOURCES, SourceBadge, sourceOf, type SourceKey } from "./sources";
import { FixButton } from "./ProductActions";

export type SourcesData = {
  specs: { source: string | null; n: number }[];
  energy: { cls: string; source: string | null; eprel: string | null } | null;
  energyNeeded: boolean;
  dims: { source: string; w: number; h: number; d: number; kind: string; warning: string | null }[];
  warranty: { months: number; from: "specs" | "softone" | "default"; text: string | null; source: string | null };
  canFix: { texts: boolean; dims: boolean; warranty: boolean; energy: boolean };
};
const row = "grid grid-cols-[8rem_minmax(0,1fr)_auto] gap-x-2 items-center px-2.5 py-1.5 text-[length:var(--fs-13)]";

/**
 * «Πηγές πληροφοριών»: από πού έρχεται κάθε πληροφορία του προϊόντος, με το ίδιο χρώμα παντού (EPREL πράσινο, SoftOne
 * μπλε σκούρο, Icecat μπλε, Web πορτοκαλί, χειροκίνητα μωβ) και «Διόρθωση» που ανοίγει το σωστό παράθυρο.
 */
export function ProductSources({ d }: { d: SourcesData }) {
  const total = d.specs.reduce((a, s) => a + s.n, 0);
  const W = { specs: "Χαρακτηριστικά προϊόντος", softone: "SoftOne (GUARTIME)", default: "Νόμιμη 2ετής (καμία δήλωση)" } as const;
  return (
    <section data-help="product.sources" aria-labelledby="ps-h" className="rounded-xl bg-white border border-eu-line p-3 grid gap-2 min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="ps-h" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-14)]">Πηγές πληροφοριών</h3>
        <ul className="m-0 p-0 list-none flex flex-wrap gap-x-3 gap-y-1 text-eu-muted text-[length:var(--fs-12)]" aria-label="Υπόμνημα πηγών">
          {(Object.keys(SOURCES) as SourceKey[]).filter((k) => k !== "other").map((k) => <li key={k} className="inline-flex items-center gap-1"><span className={`size-2.5 rounded-full ${SOURCES[k].dot}`} aria-hidden />{SOURCES[k].label}</li>)}
        </ul>
      </div>
      <ul className="m-0 p-0 list-none rounded-xl border border-eu-line divide-y divide-eu-line">
        <li className={row}>
          <b className="text-eu-ink">Χαρακτηριστικά</b>
          <span className="flex flex-wrap gap-1 min-w-0">{total ? d.specs.sort((a, b) => b.n - a.n).map((s) => <SourceBadge key={s.source ?? "other"} source={s.source} count={s.n} size="xs" />) : <span className="text-eu-red font-bold">κανένα</span>}</span>
          {d.canFix.texts ? <FixButton modal="texts" /> : <span />}
        </li>
        <li className={row}>
          <b className="text-eu-ink">Ενεργειακή ετικέτα</b>
          <span className="flex flex-wrap items-center gap-1.5 min-w-0">
            {d.energy ? <><span className="rounded-md bg-eu-green text-white font-extrabold px-2 py-0.5">{d.energy.cls}</span><SourceBadge source={d.energy.source} size="xs" />{d.energy.source !== "eprel" && <span className="text-eu-amber font-bold">όχι από EPREL — καλύτερα επίσημη</span>}</> : d.energyNeeded ? <span className="text-eu-red font-bold">λείπει — υποχρεωτική για την κατηγορία</span> : <span className="text-eu-muted">δεν απαιτείται</span>}
          </span>
          {d.canFix.energy && (d.energyNeeded || d.energy) ? <FixButton modal="energy">{d.energy ? "Έλεγχος" : "Αναζήτηση"}</FixButton> : <span />}
        </li>
        <li className={row}>
          <b className="text-eu-ink">Διαστάσεις</b>
          <span className="grid gap-0.5 min-w-0">{d.dims.length ? d.dims.map((x, i) => <span key={i} className="flex flex-wrap items-center gap-1.5"><SourceBadge source={x.source} size="xs" /><span className="tabular-nums">{x.w} × {x.h} × {x.d} cm{x.kind !== "product" ? ` (${x.kind})` : ""}</span>{x.warning && <span className="text-eu-amber">· {x.warning}</span>}</span>) : <span className="text-eu-muted">καμία καταγεγραμμένη</span>}{d.dims.length > 1 && new Set(d.dims.map((x) => `${x.w}|${x.h}|${x.d}`)).size > 1 && <span className="text-eu-amber font-bold">οι πηγές διαφέρουν — έλεγξε ποια ισχύει</span>}</span>
          {d.canFix.dims ? <FixButton modal="dims" /> : <span />}
        </li>
        <li className={row}>
          <b className="text-eu-ink">Εγγύηση</b>
          <span className="flex flex-wrap items-center gap-1.5 min-w-0"><b className="tabular-nums">{d.warranty.months} μήνες</b>{d.warranty.from === "specs" ? <SourceBadge source={d.warranty.source} size="xs" /> : <span className={`rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-12)] ${d.warranty.from === "softone" ? sourceOf("s1-desc").cls : "bg-eu-surface text-eu-ink-3"}`}>{W[d.warranty.from]}</span>}{d.warranty.text && <span className="text-eu-ink-3 truncate">«{d.warranty.text}»</span>}</span>
          {d.canFix.warranty ? <FixButton modal="warranty" /> : <span />}
        </li>
      </ul>
    </section>
  );
}
