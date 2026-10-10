"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, Save, Undo2 } from "lucide-react";
import { saveArCategoriesAction } from "./actions";

/** Κόμβος του δέντρου: `def` = προεπιλογή του τύπου (μόνο στους τύπους)· `on` = προϊόντα με AR τώρα. */
export interface ArCatNode { slug: string; name: string; count: number; on: number; def?: boolean; children: ArCatNode[] }
type Choice = "auto" | "yes" | "no";

const OPTS: { v: Choice; label: string }[] = [{ v: "auto", label: "Αυτόματο" }, { v: "yes", label: "Ναι" }, { v: "no", label: "Όχι" }];

/**
 * Ποιες κατηγορίες συμμετέχουν στο AR. Ναι/Όχι σε μια κατηγορία ισχύει για όλους τους τύπους της, εκτός αν κάποιος
 * τύπος έχει δική του επιλογή· «Αυτόματο» = ακολουθεί τη γονική ή την προεπιλογή του τύπου (μεγάλες συσκευές ναι,
 * μικρές/προσωπικές και αξεσουάρ όχι). Σε κάθε περίπτωση, προϊόν χωρίς διαστάσεις δεν έχει AR.
 */
export function ArCategories({ tree, initial, canWrite }: { tree: ArCatNode[]; initial: Record<string, boolean>; canWrite: boolean }) {
  const router = useRouter();
  const [map, setMap] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const dirty = useMemo(() => JSON.stringify(Object.entries(map).sort()) !== JSON.stringify(Object.entries(initial).sort()), [map, initial]);
  const set = (slug: string, c: Choice) => setMap((m) => { const n = { ...m }; if (c === "auto") delete n[slug]; else n[slug] = c === "yes"; return n; });
  const save = () => start(async () => {
    const r = await saveArCategoriesAction(map);
    setMsg(r.ok ? `Αποθηκεύτηκε (${r.count} ρητές επιλογές). Ισχύει ήδη στο site.` : "Δεν αποθηκεύτηκε.");
    router.refresh();
  });

  const row = (n: ArCatNode, inherited: boolean | undefined, depth: number) => {
    const own = map[n.slug];
    const eff = own ?? inherited ?? n.def;
    const choice: Choice = own === undefined ? "auto" : own ? "yes" : "no";
    const autoText = inherited !== undefined ? `όπως η γονική: ${inherited ? "ναι" : "όχι"}` : n.def !== undefined ? `προεπιλογή: ${n.def ? "ναι" : "όχι"}` : "ανά τύπο";
    const head = (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 min-w-0 flex-1">
        <div className="min-w-0 flex-1 basis-48">
          <div className="font-bold text-eu-ink break-words">{n.name}</div>
          <div className="text-eu-muted text-[length:var(--fs-13)] tabular-nums">{n.count.toLocaleString("el-GR")} προϊόντα · {n.on.toLocaleString("el-GR")} με AR τώρα{eff !== undefined && <> · <b className={eff ? "text-eu-green" : "text-eu-ink-3"}>{eff ? "συμμετέχει" : "δεν συμμετέχει"}</b></>}</div>
        </div>
        <div role="radiogroup" aria-label={`AR για ${n.name}`} className="inline-flex rounded-full bg-eu-surface p-0.5" onClick={(e) => e.stopPropagation()}>
          {OPTS.map((o) => (
            <button key={o.v} type="button" role="radio" aria-checked={choice === o.v} disabled={!canWrite || pending} onClick={(e) => { e.preventDefault(); set(n.slug, o.v); }}
              title={o.v === "auto" ? autoText : undefined}
              className={`rounded-full px-3 min-h-11 font-bold text-[length:var(--fs-13)] disabled:opacity-60 ${choice === o.v ? (o.v === "no" ? "bg-eu-ink-3 text-white" : o.v === "yes" ? "bg-eu-green text-white" : "bg-white text-eu-navy shadow-sm") : "text-eu-ink-3 hover:text-eu-navy"}`}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    );
    const pad = { paddingInlineStart: `${depth * 0.75}rem` };
    if (!n.children.length) return <li key={n.slug} className="border-t border-eu-line py-2 pr-1" style={pad}>{head}</li>;
    return (
      <li key={n.slug} className="border-t border-eu-line" style={pad}>
        <details className="group/c">
          <summary className="flex items-start gap-1.5 py-2 pr-1 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 mt-3 shrink-0 text-eu-muted transition-transform group-open/c:rotate-90" aria-hidden />
            {head}
          </summary>
          <ul className="m-0 p-0 list-none">{n.children.map((c) => row(c, eff ?? undefined, depth + 1))}</ul>
        </details>
      </li>
    );
  };

  return (
    <div className="grid gap-3 min-w-0">
      <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">
        «Ναι» ή «Όχι» σε μια κατηγορία ισχύει για όλους τους τύπους της, εκτός αν δώσεις σε κάποιον τύπο δική του επιλογή. «Αυτόματο» ακολουθεί τη γονική κατηγορία ή την προεπιλογή του τύπου (μεγάλες συσκευές ναι · μικρές, προσωπικές και αξεσουάρ όχι).
        Σε κάθε περίπτωση, <b className="text-eu-ink">προϊόν χωρίς διαστάσεις δεν συμμετέχει στο AR</b>.
      </p>
      <ul className="m-0 p-0 list-none border-b border-eu-line">{tree.map((n) => row(n, undefined, 0))}</ul>
      {canWrite && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={save} disabled={!dirty || pending} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-bold px-5 min-h-11 text-[length:var(--fs-14)] hover:bg-eu-blue disabled:opacity-50">
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />} Αποθήκευση
          </button>
          <button type="button" onClick={() => { setMap(initial); setMsg(null); }} disabled={!dirty || pending} className="inline-flex items-center gap-1.5 rounded-full border border-eu-line font-bold px-4 min-h-11 text-[length:var(--fs-14)] text-eu-ink-2 disabled:opacity-50">
            <Undo2 className="size-4" aria-hidden /> Ακύρωση αλλαγών
          </button>
          {dirty && !pending && <span className="text-eu-amber font-bold text-[length:var(--fs-13)]">Υπάρχουν αλλαγές που δεν αποθηκεύτηκαν</span>}
          {msg && !dirty && <span role="status" className="text-eu-green font-bold text-[length:var(--fs-13)]">{msg}</span>}
        </div>
      )}
    </div>
  );
}
