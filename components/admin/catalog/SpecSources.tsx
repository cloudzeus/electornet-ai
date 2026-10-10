import { Database, ExternalLink, Globe, Zap, Package } from "lucide-react";

export interface SpecRow { id: string; groupName: string; key: string; value: string; source: string | null }

/** Από πού ήρθε κάθε χαρακτηριστικό και πού αλλάζει. */
const SRC: Record<string, { label: string; cls: string; Icon: typeof Zap; where: string }> = {
  eprel: { label: "EPREL", cls: "bg-eu-green/12 text-eu-green", Icon: Zap, where: "Από την ενεργειακή ετικέτα (EPREL) — ενημερώνονται με νέα αναζήτηση στο EPREL (καρτέλα Διαστάσεις · AR · EPREL)." },
  "s1-desc": { label: "ERP", cls: "bg-eu-navy/10 text-eu-navy", Icon: Database, where: "Από την αναλυτική περιγραφή του SoftOne — αλλάζουν στα «Χαρακτηριστικά» πιο πάνω." },
  icecat: { label: "Icecat", cls: "bg-eu-blue/10 text-eu-blue", Icon: Package, where: "Από τον κατάλογο Icecat του κατασκευαστή." },
  web: { label: "Web", cls: "bg-eu-amber/15 text-eu-ink-2", Icon: Globe, where: "Από το site του κατασκευαστή / το παλιό site." },
};
const other = { label: "Άλλη πηγή", cls: "bg-eu-surface text-eu-ink-3", Icon: Package, where: "Χωρίς καταγεγραμμένη πηγή." };
const srcOf = (s: string | null) => (s && SRC[s]) || other;

/**
 * Όλα τα χαρακτηριστικά που βλέπει ο πελάτης στη σελίδα του προϊόντος, με την πηγή τους σε κάθε γραμμή
 * (EPREL, ERP, Icecat, web) — για να ξέρει ο διαχειριστής τι είναι επίσημο και πού διορθώνεται.
 */
export function SpecSources({ specs, eprel }: { specs: SpecRow[]; eprel: string | null }) {
  const counts = specs.reduce<Record<string, number>>((a, s) => { const k = s.source ?? "other"; a[k] = (a[k] ?? 0) + 1; return a; }, {});
  const groups = [...new Set(specs.map((s) => s.groupName))];
  return (
    <div className="grid gap-3 min-w-0">
      {specs.length ? (
        <>
          <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5" aria-label="Πηγές">
            {Object.entries(counts).map(([k, n]) => { const s = k === "other" ? other : srcOf(k); return (
              <li key={k} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-bold text-[length:var(--fs-13)] ${s.cls}`}><s.Icon className="size-3.5" aria-hidden /> {s.label} · {n}</li>
            ); })}
            {eprel && <li><a href={`https://eprel.ec.europa.eu/screen/product/${eprel}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 min-h-8 px-1 font-bold text-eu-blue text-[length:var(--fs-13)] hover:underline"><ExternalLink className="size-3.5" aria-hidden /> Καταχώριση EPREL {eprel}</a></li>}
          </ul>
          {groups.map((g) => (
            <section key={g} className="grid gap-1 min-w-0">
              <h4 className="m-0 font-bold text-eu-ink-2 text-[length:var(--fs-13)] uppercase tracking-wide">{g}</h4>
              <dl className="m-0 grid rounded-xl border border-eu-line overflow-hidden">
                {specs.filter((s) => s.groupName === g).map((s, i) => { const src = srcOf(s.source); return (
                  <div key={s.id} className={`grid gap-x-3 gap-y-0.5 px-3 py-2 @xl:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] items-center ${i ? "border-t border-eu-line" : ""}`}>
                    <dt className="font-bold text-eu-ink text-[length:var(--fs-14)] break-words">{s.key}</dt>
                    <dd className="m-0 text-eu-ink-2 text-[length:var(--fs-14)] break-words">{s.value}</dd>
                    <dd className="m-0 @xl:justify-self-end"><span title={src.where} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-12)] ${src.cls}`}><src.Icon className="size-3" aria-hidden /> {src.label}</span></dd>
                  </div>
                ); })}
              </dl>
            </section>
          ))}
          <ul className="m-0 pl-4 grid gap-0.5 text-eu-ink-3 text-[length:var(--fs-13)]">
            {Object.keys(counts).map((k) => { const s = k === "other" ? other : srcOf(k); return <li key={k}><b className="text-eu-ink-2">{s.label}:</b> {s.where}</li>; })}
          </ul>
        </>
      ) : <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Το προϊόν δεν έχει ακόμη χαρακτηριστικά στο site.</p>}
    </div>
  );
}
