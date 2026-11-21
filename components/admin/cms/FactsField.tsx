"use client";

import { useContext } from "react";
import { Calculator, Plus, Trash2 } from "lucide-react";
import { DEFAULT_FACTS, MAX_FACTS, homeServiceSlugs, resolveFacts, type FactCount, type HomeFact } from "@/lib/cms/home-sections";
import { HomeServices } from "./ServiceCellsField";
import { Txt } from "./brand/fields";

/**
 * Οι αριθμοί πάνω από τις υπηρεσίες της αρχικής (έως 4): αριθμός, κατάληξη, κείμενο. Ένας αριθμός μπορεί να μετρά μόνος του
 * τις ενεργές υπηρεσίες ή όσες φαίνονται στην αρχική — έτσι η κρυφή/ανενεργή υπηρεσία αφαιρείται χωρίς να το θυμηθεί κανείς.
 */
export function FactsField({ props, set, label, help }: { props: Record<string, unknown> | undefined; set: (patch: Record<string, unknown>) => void; label: string; help?: string }) {
  const all = useContext(HomeServices);
  const counts: Record<FactCount, number> = { services: all.length, home: homeServiceSlugs(props, all.map((s) => s.slug)).length };
  const facts: HomeFact[] = Array.isArray(props?.facts) ? (props!.facts as HomeFact[]) : DEFAULT_FACTS;
  const shown = resolveFacts(facts, counts);
  const put = (l: HomeFact[]) => set({ facts: l });
  const edit = (i: number, patch: Partial<HomeFact>) => put(facts.map((f, k) => (k === i ? { ...f, ...patch } : f)));
  const modes: { value: FactCount | ""; label: string }[] = [
    { value: "", label: "Δικός μου αριθμός" },
    { value: "services", label: `Ενεργές υπηρεσίες (${counts.services})` },
    { value: "home", label: `Ορατές στην αρχική (${counts.home})` },
  ];
  return (
    <div className="grid gap-2" data-help="home-facts">
      <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{label}</span>
      {help && <span className="text-eu-muted text-[length:var(--fs-13)] leading-snug -mt-1">{help}</span>}
      {/* έτσι θα φαίνονται: ίδια χρώματα με τη σκούρα ζώνη της αρχικής */}
      {shown.length > 0 && (
        <dl className="m-0 grid grid-cols-2 gap-3 rounded-xl bg-eu-navy p-4 text-white" aria-label="Προεπισκόπηση αριθμών">
          {shown.map((f, i) => (
            <div key={i} className="min-w-0">
              <dt className="m-0 font-heading font-extrabold text-eu-yellow text-[length:var(--fs-26)] leading-none tabular-nums">{f.value.toLocaleString("el-GR")}{f.suffix}</dt>
              <dd className="m-0 mt-1 text-eu-on-dark-2 text-[length:var(--fs-13)] leading-snug">{f.label}</dd>
            </div>
          ))}
        </dl>
      )}
      <ol className="m-0 p-0 list-none grid gap-2">
        {facts.map((f, i) => {
          const counted = f.count && f.count in counts;
          return (
            <li key={i} className="grid gap-3 rounded-xl border-2 border-eu-line bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-extrabold text-eu-navy text-[length:var(--fs-13)] tabular-nums">Αριθμός {i + 1}</span>
                <button type="button" onClick={() => put(facts.filter((_, k) => k !== i))} aria-label={`Αφαίρεση αριθμού ${i + 1}`} title="Αφαίρεση" className="size-11 grid place-items-center rounded-full text-eu-ink-3 hover:bg-eu-surface hover:text-eu-red"><Trash2 className="size-4" aria-hidden /></button>
              </div>
              <fieldset className="m-0 p-0 border-0 grid gap-1.5 min-w-0">
                <legend className="font-bold text-eu-ink text-[length:var(--fs-14)] mb-1">Από πού έρχεται ο αριθμός</legend>
                <div className="flex flex-wrap gap-1.5">
                  {modes.map((m) => {
                    const on = (f.count ?? "") === m.value;
                    return <button key={m.value} type="button" aria-pressed={on} onClick={() => edit(i, { count: m.value || undefined, ...(m.value ? { value: counts[m.value] } : {}) })} className={`inline-flex items-center gap-1.5 rounded-xl border-2 px-3 min-h-11 font-bold text-[length:var(--fs-14)] ${on ? "border-eu-navy bg-eu-chip text-eu-navy" : "border-eu-line text-eu-ink-2 hover:border-eu-navy/50"}`}>{m.value && <Calculator className="size-4" aria-hidden />}{m.label}</button>;
                  })}
                </div>
                {counted && <span className="text-eu-green font-bold text-[length:var(--fs-13)] leading-snug">Μετρά μόνος του: σήμερα {counts[f.count!]}. Αλλάζει όταν ενεργοποιείς, απενεργοποιείς ή κρύβεις υπηρεσία.</span>}
              </fieldset>
              <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-3">
                <label className="grid gap-1 min-w-0">
                  <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Αριθμός</span>
                  <input type="number" inputMode="numeric" min={0} max={99999} disabled={!!counted} value={counted ? counts[f.count!] : f.value} onChange={(e) => edit(i, { value: Math.max(0, Math.min(99999, Number(e.target.value) || 0)) })} className="w-full rounded-xl border-2 border-eu-line px-3 min-h-12 text-[length:var(--fs-16)] bg-white tabular-nums disabled:bg-eu-surface disabled:text-eu-ink-3" />
                </label>
                <Txt label="Κατάληξη" value={f.suffix ?? ""} onChange={(v) => edit(i, { suffix: v })} max={12} placeholder="π.χ. « ώρες»" help="Κολλά στον αριθμό· βάλε κενό μπροστά για απόσταση." />
              </div>
              <Txt label="Κείμενο κάτω από τον αριθμό" value={f.label ?? ""} onChange={(v) => edit(i, { label: v })} max={50} help={String(f.label ?? "").trim() ? undefined : "Χωρίς κείμενο ο αριθμός δεν εμφανίζεται."} />
            </li>
          );
        })}
      </ol>
      {facts.length < MAX_FACTS && <button type="button" onClick={() => put([...facts, { value: 0, suffix: "", label: "" }])} className="justify-self-start inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-4 min-h-11 font-bold text-eu-ink-2 text-[length:var(--fs-14)] hover:border-eu-navy/50"><Plus className="size-4" aria-hidden /> Νέος αριθμός</button>}
      {facts.length > 0 && facts.length < MAX_FACTS && <span className="text-eu-muted text-[length:var(--fs-13)]">Στον υπολογιστή χωρούν 4 σε μία σειρά, στο κινητό 2 ανά σειρά — 2 ή 4 δίνουν γεμάτες σειρές.</span>}
    </div>
  );
}
