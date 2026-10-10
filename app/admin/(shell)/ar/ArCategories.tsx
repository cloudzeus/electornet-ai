"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, Save, Undo2 } from "lucide-react";
import { saveArCategoriesAction } from "./actions";

type Surface = "floor" | "furniture" | "counter" | "wall";
type Rule = { on?: boolean; surface?: Surface };
/** Κόμβος του δέντρου: `def`/`defSurface` = προεπιλογές του τύπου (μόνο στους τύπους)· `on` = προϊόντα με AR τώρα. */
export interface ArCatNode { slug: string; name: string; count: number; on: number; def?: boolean; defSurface?: Surface; children: ArCatNode[] }
type Choice = "auto" | "yes" | "no";

const OPTS: { v: Choice; label: string }[] = [{ v: "auto", label: "Αυτόματο" }, { v: "yes", label: "Ναι" }, { v: "no", label: "Όχι" }];
const SURF: Record<Surface, string> = { floor: "Πάτωμα", furniture: "Έπιπλο", counter: "Πάγκος", wall: "Τοίχος" };

/**
 * Ποιες κατηγορίες συμμετέχουν στο AR και πού μπαίνουν. Ναι/Όχι και θέση σε μια κατηγορία ισχύουν για όλους τους
 * τύπους της, εκτός αν κάποιος τύπος έχει δική του επιλογή· «Αυτόματο» = ακολουθεί τη γονική ή την προεπιλογή του
 * τύπου. Η θέση που ορίζεται σε ένα προϊόν υπερισχύει. Σε κάθε περίπτωση, προϊόν χωρίς διαστάσεις δεν έχει AR.
 */
export function ArCategories({ tree, initial, canWrite }: { tree: ArCatNode[]; initial: Record<string, Rule>; canWrite: boolean }) {
  const router = useRouter();
  const [map, setMap] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const key = (m: Record<string, Rule>) => JSON.stringify(Object.entries(m).map(([k, r]) => [k, r.on ?? null, r.surface ?? null]).sort());
  const dirty = useMemo(() => key(map) !== key(initial), [map, initial]);
  const patch = (slug: string, p: Rule) => setMap((m) => {
    const r: Rule = { ...m[slug], ...p };
    if (r.on === undefined) delete r.on;
    if (!r.surface) delete r.surface;
    const n = { ...m };
    if (r.on === undefined && !r.surface) delete n[slug]; else n[slug] = r;
    return n;
  });
  const save = () => start(async () => {
    const r = await saveArCategoriesAction(map);
    setMsg(r.ok ? `Αποθηκεύτηκε (${r.count} κατηγορίες με δική σου επιλογή). Ισχύει ήδη στο site.` : "Δεν αποθηκεύτηκε.");
    router.refresh();
  });

  const row = (n: ArCatNode, inh: { on?: boolean; surface?: Surface }, depth: number) => {
    const own = map[n.slug] ?? {};
    const eff = own.on ?? inh.on ?? n.def;
    const effSurf = own.surface ?? inh.surface ?? n.defSurface;
    const choice: Choice = own.on === undefined ? "auto" : own.on ? "yes" : "no";
    const autoSurf = inh.surface ? `Αυτόματα · γονική: ${SURF[inh.surface]}` : n.defSurface ? `Αυτόματα (${SURF[n.defSurface]})` : "Αυτόματα (ανά τύπο)";
    const head = (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 min-w-0 flex-1">
        <div className="min-w-0 flex-1 basis-48">
          <div className="font-bold text-eu-ink break-words">{n.name}</div>
          <div className="text-eu-muted text-[length:var(--fs-13)] tabular-nums">
            {n.count.toLocaleString("el-GR")} προϊόντα · {n.on.toLocaleString("el-GR")} με AR τώρα
            {eff !== undefined && <> · <b className={eff ? "text-eu-green" : "text-eu-ink-3"}>{eff ? "συμμετέχει" : "δεν συμμετέχει"}</b></>}
            {eff !== false && effSurf && <> · {SURF[effSurf].toLowerCase()}</>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <div role="radiogroup" aria-label={`Συμμετοχή στο AR: ${n.name}`} className="inline-flex rounded-full bg-eu-surface p-0.5">
            {OPTS.map((o) => (
              <button key={o.v} type="button" role="radio" aria-checked={choice === o.v} disabled={!canWrite || pending}
                onClick={(e) => { e.preventDefault(); patch(n.slug, { on: o.v === "auto" ? undefined : o.v === "yes" }); }}
                title={o.v === "auto" ? (inh.on !== undefined ? `όπως η γονική: ${inh.on ? "ναι" : "όχι"}` : n.def !== undefined ? `προεπιλογή: ${n.def ? "ναι" : "όχι"}` : "ανά τύπο") : undefined}
                className={`rounded-full px-3 min-h-11 font-bold text-[length:var(--fs-13)] disabled:opacity-60 cursor-pointer ${choice === o.v ? (o.v === "no" ? "bg-eu-ink-3 text-white" : o.v === "yes" ? "bg-eu-green text-white" : "bg-white text-eu-navy shadow-sm") : "text-eu-ink-3 hover:text-eu-navy"}`}>
                {o.label}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor={`surf-${n.slug}`}>Θέση στο AR: {n.name}</label>
          <select id={`surf-${n.slug}`} value={own.surface ?? ""} disabled={!canWrite || pending || eff === false}
            onClick={(e) => e.stopPropagation()} onChange={(e) => patch(n.slug, { surface: (e.target.value || undefined) as Surface | undefined })}
            className={`rounded-full border px-3 min-h-11 text-[length:var(--fs-13)] font-bold bg-white disabled:opacity-50 cursor-pointer ${own.surface ? "border-eu-navy text-eu-navy" : "border-eu-line text-eu-ink-3"}`}>
            <option value="">{autoSurf}</option>
            {(Object.keys(SURF) as Surface[]).map((s) => <option key={s} value={s}>{SURF[s]}</option>)}
          </select>
        </div>
      </div>
    );
    const pad = { paddingInlineStart: `${depth * 0.75}rem` };
    const next = { on: own.on ?? inh.on, surface: own.surface ?? inh.surface };
    if (!n.children.length) return <li key={n.slug} className="border-t border-eu-line py-2 pr-1" style={pad}>{head}</li>;
    return (
      <li key={n.slug} className="border-t border-eu-line" style={pad}>
        <details className="group/c">
          <summary className="flex items-start gap-1.5 py-2 pr-1 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 mt-3 shrink-0 text-eu-muted transition-transform group-open/c:rotate-90" aria-hidden />
            {head}
          </summary>
          <ul className="m-0 p-0 list-none">{n.children.map((c) => row(c, next, depth + 1))}</ul>
        </details>
      </li>
    );
  };

  return (
    <div className="grid gap-3 min-w-0">
      <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">
        Για κάθε κατηγορία ορίζεις <b className="text-eu-ink">αν συμμετέχει</b> στο AR και <b className="text-eu-ink">πού μπαίνει</b> (πάτωμα, έπιπλο, πάγκος, τοίχος). Η επιλογή ισχύει για όλους τους τύπους της, εκτός αν δώσεις σε κάποιον τύπο δική του· «Αυτόματο» ακολουθεί τη γονική κατηγορία ή την προεπιλογή του τύπου. Η θέση που ορίζεις σε ένα προϊόν υπερισχύει.
        Σε κάθε περίπτωση, <b className="text-eu-ink">προϊόν χωρίς διαστάσεις δεν συμμετέχει στο AR</b>.
      </p>
      <ul className="m-0 p-0 list-none border-b border-eu-line">{tree.map((n) => row(n, {}, 0))}</ul>
      {canWrite && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={save} disabled={!dirty || pending} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-bold px-5 min-h-11 text-[length:var(--fs-14)] hover:bg-eu-blue disabled:opacity-50 cursor-pointer">
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />} Αποθήκευση
          </button>
          <button type="button" onClick={() => { setMap(initial); setMsg(null); }} disabled={!dirty || pending} className="inline-flex items-center gap-1.5 rounded-full border border-eu-line font-bold px-4 min-h-11 text-[length:var(--fs-14)] text-eu-ink-2 disabled:opacity-50 cursor-pointer">
            <Undo2 className="size-4" aria-hidden /> Ακύρωση αλλαγών
          </button>
          {dirty && !pending && <span className="text-eu-amber font-bold text-[length:var(--fs-13)]">Υπάρχουν αλλαγές που δεν αποθηκεύτηκαν</span>}
          {msg && !dirty && <span role="status" className="text-eu-green font-bold text-[length:var(--fs-13)]">{msg}</span>}
        </div>
      )}
    </div>
  );
}
