"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CircleAlert, Loader2, Play, Search, Sparkles, Tags } from "lucide-react";
import { OptionPicker, type PickOpt } from "@/components/admin/catalog/OptionPicker";
import { MAX_VALUES, PRICE_MODES, TARGETS, TARGET_OF, TRANSFORMS, headerLabel, type ColDTO, type MappingDraft, type SuggestDTO } from "@/lib/catalog/xml-import/ui-core";
import { clampMinFetch } from "@/lib/catalog/xml-import/cache-core";
import { initBrandsOn, initLabels, initPicks, initSettings, initTargets, initTransforms } from "@/lib/catalog/xml-import/map-init";
import { SKIP, brandDecisions, brandOnByDefault } from "@/lib/catalog/xml-import/skip-core";
import type { PriceMode } from "@/lib/catalog/xml-import/transform-core";

const btn = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-14)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const primary = `${btn} bg-eu-navy text-white hover:bg-eu-blue`;
const select = "w-full min-w-0 rounded-lg border border-eu-line bg-white px-2 min-h-11 md:min-h-9 text-[length:var(--fs-14)] focus-visible:outline-2 focus-visible:outline-eu-blue";
const input = `${select} px-3`;
const card = "rounded-xl border border-eu-line bg-white p-3 md:p-4 grid gap-3 min-w-0";
const row = (warn: boolean) => `grid gap-1.5 rounded-lg border p-2 min-w-0 ${warn ? "border-eu-yellow bg-eu-yellow/5" : "border-eu-line"}`;

/** Οι τέσσερις ταξινομήσεις που αντιστοιχίζονται **τιμή-προς-τιμή** σε δική μας εγγραφή. Ίδιο σχήμα, ίδιο UI. */
export type ValueKind = "brand" | "category" | "unit" | "mark";
/** Τα βήματα της αντιστοίχισης. Εμφανίζονται **μόνο όσα έχουν δουλειά** σε αυτό το feed. */
export type MapStep = "cols" | "brands" | "cats" | "specs" | "finish";

/** Ό,τι διάλεξε ο χρήστης, όπως ταξιδεύει στον server — και ως πρόχειρο στα ενδιάμεσα βήματα. */
export type MappingValue = MappingDraft;

interface ValueRow { value: string; n: number; ex: string[] }
interface ValueSet { header: string | null; tooMany: boolean; rows: ValueRow[] }

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("el-GR").replace(/ς/g, "σ");
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Η κατάσταση της αντιστοίχισης, μία φορά για όλα τα βήματα.
 *
 * Ζει **έξω** από τα βήματα: ο χρήστης πηγαίνει μπρος-πίσω όσο θέλει και τίποτα δεν χάνεται. Η σειρά των γραμμών
 * υπολογίζεται **μία φορά** (όχι σε κάθε επιλογή) — αλλιώς η γραμμή που μόλις αντιστοίχισε θα πηδούσε αλλού.
 */
export function useMapping(suggestion: SuggestDTO, brands: PickOpt[], draft?: MappingDraft | null) {
  const { cols, cats, specs, duplicates } = suggestion;

  const [targets, setTargets] = useState<Record<string, string>>(() => initTargets(suggestion, draft));
  const [labels, setLabels] = useState<Record<string, string>>(() => initLabels(suggestion, draft));
  const [transforms, setTransforms] = useState<Record<string, string>>(() => initTransforms(suggestion, draft));
  const [picks, setPicks] = useState<Record<ValueKind, Record<string, string | null>>>(() => initPicks(suggestion, draft));
  const [unitId, setUnitId] = useState<string | null>(() => initSettings(suggestion, draft).unitId);
  const [markId, setMarkId] = useState<string | null>(() => initSettings(suggestion, draft).markId);
  const [priceMode, setPriceMode] = useState<PriceMode>(() => initSettings(suggestion, draft).priceMode);
  const [toSoftone, setToSoftone] = useState(() => initSettings(suggestion, draft).toSoftone);
  const [minFetchMin, setMinFetchMin] = useState(() => initSettings(suggestion, draft).minFetchMin);
  /** Οι αλλαγές του χρήστη στη συμμετοχή των μαρκών — τι σημαίνει το κενό, το λέει το `brandOn` πιο κάτω. */
  const [on, setOn] = useState<Record<string, boolean>>(() => initBrandsOn(draft));

  /**
   * Νέα πρόταση → νέες επιλογές.
   *
   * Ο οδηγός αποδίδεται πρώτα **χωρίς** πρόταση (ο χρήστης είναι ακόμη στον προμηθευτή), άρα οι αρχικές τιμές από πάνω
   * είναι άδειες. Χωρίς αυτό το σημείο έμεναν άδειες για πάντα: κάθε στήλη φαινόταν «Αγνόηση» και ο οδηγός δεν
   * μπορούσε να αποθηκεύσει καμία αντιστοίχιση. Η προσαρμογή κατάστασης μέσα στην απόδοση είναι ο τρόπος που ορίζει
   * το React γι' αυτό (η απόδοση ξαναγίνεται αμέσως, πριν φανεί οτιδήποτε).
   */
  const [shown, setShown] = useState(suggestion);
  if (shown !== suggestion) {
    setShown(suggestion);
    setTargets(initTargets(suggestion, draft));
    setLabels(initLabels(suggestion, draft));
    setTransforms(initTransforms(suggestion, draft));
    setPicks(initPicks(suggestion, draft));
    setOn(initBrandsOn(draft));
    const st = initSettings(suggestion, draft);
    setUnitId(st.unitId); setMarkId(st.markId); setPriceMode(st.priceMode); setToSoftone(st.toSoftone); setMinFetchMin(st.minFetchMin);
  }

  const byHeader = useMemo(() => new Map(cols.map((c) => [c.header, c])), [cols]);
  const of = (h: string) => targets[h] ?? "ignore";
  const isSpec = (h: string) => of(h) === "spec";
  const unsure = (c: ColDTO) => c.confidence === "unsure";

  // Τα αβέβαια πρώτα, μετά με τη σειρά του feed (οι στήλες είναι η σειρά των tags — έχει νόημα για τον χρήστη).
  const order = (list: ColDTO[]) => list.map((c, i) => ({ c, i })).sort((a, b) => Number(!unsure(a.c)) - Number(!unsure(b.c)) || a.i - b.i).map((x) => x.c);
  const fieldCols = order(cols.filter((c) => !isSpec(c.header)));
  const specCols = order(cols.filter((c) => isSpec(c.header)));

  /** Η μάρκα του feed βρίσκει μόνη της τη δική μας όταν τα ονόματα ταυτίζονται (χωρίς τόνους/κεφαλαία). */
  const brandByName = useMemo(() => new Map(brands.map((b) => [plain(b.name), b.id])), [brands]);
  const catN = useMemo(() => new Map(cats.map((c) => [c.value, c.n])), [cats]);

  const pickOf = (k: ValueKind, v: string): string | null => {
    // Object.hasOwn: τιμή «constructor» / «toString» δεν είναι επιλογή του χρήστη
    if (Object.hasOwn(picks[k], v)) return picks[k][v];
    return k === "brand" ? brandByName.get(plain(v)) ?? null : null;
  };
  const setPick = (k: ValueKind, v: string, id: string | null) => setPicks((p) => ({ ...p, [k]: { ...p[k], [v]: id } }));

  /**
   * Ποιες μάρκες συμμετέχουν. Εξ ορισμού όσες βρέθηκαν στα δικά μας· ο χρήστης βάζει μέσα ή βγάζει όποια θέλει.
   * Το `on` κρατά **μόνο τις αλλαγές** του χρήστη — έτσι μια μάρκα που μόλις αντιστοιχίστηκε μπαίνει μόνη της.
   */
  const brandOn = (v: string) => (Object.hasOwn(on, v) ? on[v] : brandOnByDefault(pickOf("brand", v)));
  /** Μάρκα που ξαναμπαίνει ξεχνά την παλιά παράλειψη, ώστε να ισχύσει πάλι η εύρεση με το όνομα. */
  const unskip = (vs: string[]) => setPicks((p) => {
    const brand = { ...p.brand };
    let hit = false;
    for (const v of vs) if (brand[v] === SKIP) { delete brand[v]; hit = true; }
    return hit ? { ...p, brand } : p;
  });
  const setBrandOn = (v: string, yes: boolean) => { setOn((p) => ({ ...p, [v]: yes })); if (yes) unskip([v]); };
  const setBrandsOn = (vs: string[], yes: boolean) => {
    setOn((p) => ({ ...p, ...Object.fromEntries(vs.map((v) => [v, yes])) }));
    if (yes) unskip(vs);
  };

  const headerOf = (k: ValueKind) => cols.find((c) => of(c.header) === k)?.header ?? null;

  /**
   * Οι τιμές μιας ταξινόμησης, ταξινομημένες μία φορά: πρώτα όσες δεν είχαν πρόταση, μετά οι πολυπληθέστερες.
   * Η εξάρτηση είναι η **στήλη**, όχι οι επιλογές — η σειρά δεν αλλάζει ενώ ο χρήστης διαλέγει.
   */
  const sets = useMemo(() => {
    const out = {} as Record<ValueKind, ValueSet>;
    for (const k of ["brand", "category", "unit", "mark"] as ValueKind[]) {
      const header = cols.find((c) => c.header === headerOf(k))?.header ?? null;
      const col = header ? byHeader.get(header) : undefined;
      const values = col?.values ?? null;
      const info = col?.valueInfo ?? {};
      const rows = (values ?? []).map((value) => ({ value, n: info[value]?.n ?? catN.get(value) ?? 0, ex: info[value]?.ex ?? [] }))
        .sort((a, b) => Number(!!pickOf(k, a.value)) - Number(!!pickOf(k, b.value)) || b.n - a.n || a.value.localeCompare(b.value, "el"));
      out[k] = { header, tooMany: !!header && values === null, rows };
    }
    return out;
    // Η σειρά παγώνει εδώ επίτηδες: οι επιλογές (`picks`) δεν είναι εξάρτηση.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, byHeader, catN, targets]);

  const missing = (k: ValueKind) => sets[k].rows.filter((r) => !pickOf(k, r.value)).length;

  /** Η απόφαση για κάθε μάρκα του feed, μαζί με όσες συμμετέχουν χωρίς δική μας μάρκα (`gaps`). */
  const brandsNow = brandDecisions(sets.brand.rows.map((r) => r.value), (v) => pickOf("brand", v), brandOn);
  const brandsIn = sets.brand.rows.filter((r) => brandOn(r.value));
  const brandsOut = sets.brand.rows.filter((r) => !brandOn(r.value));

  // ---- φράγματα, το καθένα στο βήμα του ----
  const dupNow = (() => {
    const by = new Map<string, string[]>();
    for (const c of cols) {
      const t = of(c.header);
      const key = t === "spec" ? `spec:${(labels[c.header] ?? "").trim().toLocaleLowerCase("el-GR")}` : ["field", "brand", "category", "unit", "mark", "cost", "rrp", "availability"].some((k) => t === k || t.startsWith(`${k}:`)) ? t : null;
      if (!key || (t === "spec" && !(labels[c.header] ?? "").trim())) continue;
      by.set(key, [...(by.get(key) ?? []), c.header]);
    }
    return [...by.entries()].filter(([, hs]) => hs.length > 1).map(([key, headers]) => ({ label: TARGET_OF.get(key)?.label ?? key.replace(/^spec:/, "Χαρακτηριστικό: "), headers }));
  })();
  const specNoLabel = specCols.filter((c) => !(labels[c.header] ?? "").trim()).map((c) => c.header);
  const noSku = !cols.some((c) => of(c.header) === "field:code");

  const blockers: { step: MapStep; text: string }[] = [
    noSku ? { step: "cols" as MapStep, text: "Καμία στήλη δεν είναι το SKU — χωρίς αυτό τα προϊόντα δεν έχουν κλειδί." } : null,
    dupNow.length ? { step: "cols" as MapStep, text: `Δύο ή περισσότερες στήλες δείχνουν στον ίδιο στόχο (${dupNow.map((d) => d.label).join(", ")}) — η μία θα έγραφε πάνω στην άλλη.` } : null,
    specNoLabel.length ? { step: "specs" as MapStep, text: `${specNoLabel.length} ${specNoLabel.length === 1 ? "χαρακτηριστικό" : "χαρακτηριστικά"} χωρίς ονομασία.` } : null,
    sets.brand.tooMany ? { step: "brands" as MapStep, text: `Η στήλη μάρκας «${sets.brand.header}» έχει πάνω από ${MAX_VALUES} διαφορετικές τιμές — δεν είναι μάρκα. Βάλ' την «Αγνόηση» ή «Χαρακτηριστικό».` } : null,
    brandsNow.gaps.length ? { step: "brands" as MapStep, text: `${brandsNow.gaps.length} ${brandsNow.gaps.length === 1 ? "μάρκα συμμετέχει" : "μάρκες συμμετέχουν"} χωρίς δική μας μάρκα (${brandsNow.gaps.slice(0, 3).join(", ")}${brandsNow.gaps.length > 3 ? "…" : ""}) — διάλεξε δική μας μάρκα ή ${brandsNow.gaps.length === 1 ? "βγάλ' την" : "βγάλ' τες"} από τη συμμετοχή.` } : null,
  ].filter((x): x is { step: MapStep; text: string } => !!x);

  // ---- ποια βήματα έχουν νόημα σε αυτό το feed ----
  const steps: MapStep[] = ["cols",
    ...(sets.brand.header ? ["brands" as MapStep] : []),
    ...(sets.category.header ? ["cats" as MapStep] : []),
    ...(specCols.length ? ["specs" as MapStep] : []),
    "finish"];

  const progress = (s: MapStep): { done: number; total: number } | null => {
    if (s === "cols") return { done: fieldCols.filter((c) => of(c.header) !== "ignore").length, total: fieldCols.length };
    if (s === "brands") return { done: brandsIn.length, total: sets.brand.rows.length };
    if (s === "cats") return { done: sets.category.rows.length - missing("category"), total: sets.category.rows.length };
    if (s === "specs") return { done: specCols.filter((c) => (labels[c.header] ?? "").trim()).length, total: specCols.length };
    return null;
  };

  const value = (): MappingValue => ({
    targets, labels, transforms,
    brandMap: brandsNow.map,
    // Ρητά, για το πρόχειρο: ο χάρτης δεν ξεχωρίζει το «μέσα χωρίς μάρκα» από το «έξω».
    brandsOn: brandsIn.map((r) => r.value),
    categoryMap: Object.fromEntries(sets.category.rows.map((r) => [r.value, pickOf("category", r.value)])),
    unitMap: Object.fromEntries(sets.unit.rows.map((r) => [r.value, pickOf("unit", r.value)])),
    markMap: Object.fromEntries(sets.mark.rows.map((r) => [r.value, pickOf("mark", r.value)])),
    unitId, markId, priceMode, toSoftone, minFetchMin,
  });

  return {
    cols, specs, duplicates, dupNow, fieldCols, specCols, sets, steps, blockers, progress, value,
    targets, labels, transforms, priceMode, toSoftone, unitId, markId, minFetchMin,
    of, isSpec, unsure, pickOf, setPick, missing,
    brandOn, setBrandOn, setBrandsOn, brandsIn, brandsOut, brandGaps: brandsNow.gaps,
    setTargets, setLabels, setTransforms, setPriceMode, setToSoftone, setUnitId, setMarkId, setMinFetchMin,
  };
}

export type Mapping = ReturnType<typeof useMapping>;

/** «Θέλει έλεγχο» (+ «AI» όταν την πρόταση την έδωσε το AI). Στα σίγουρα δεν μπαίνει τίποτα — αλλιώς γίνεται θόρυβος. */
function Flags({ unsure, why }: { unsure: boolean; why?: string }) {
  if (!unsure) return null;
  return (
    <span className="flex flex-wrap items-center gap-1">
      <span className="inline-flex items-center gap-1 rounded-full bg-eu-yellow/30 px-2 py-0.5 font-bold text-eu-ink text-[length:var(--fs-12)]"><AlertTriangle className="size-3" aria-hidden /> θέλει έλεγχο</span>
      {why && <span className="inline-flex items-center gap-1 rounded-full bg-eu-blue/10 px-2 py-0.5 font-bold text-eu-blue text-[length:var(--fs-12)]" title={why}><Sparkles className="size-3" aria-hidden /> AI</span>}
    </span>
  );
}

/** Τα δείγματα ως «τιμή — από ποιο προϊόν»: χωρίς το προϊόν, μια γυμνή τιμή δεν λέει τίποτα. */
function Samples({ c }: { c: ColDTO }) {
  if (!c.samples.length) return <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">— καμία τιμή σε όλο το feed</p>;
  return (
    <ul className="m-0 p-0 list-none grid gap-0.5 min-w-0">
      {c.samples.map((v, i) => (
        <li key={`${v}-${i}`} className="text-[length:var(--fs-12)] [overflow-wrap:anywhere]">
          <b className="text-eu-ink-2 font-bold">{cut(v, 60)}</b>
          {c.examples[i] && <span className="text-eu-muted"> — {cut(c.examples[i], 50)}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Κεφαλίδα βήματος: τίτλος, μία πρόταση εξήγηση και — όπου έχει νόημα — πόσα έγιναν από πόσα. */
function Head({ id, title, help, done, total, note }: { id: string; title: string; help: string; done?: number; total?: number; note?: string }) {
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={id} className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">{title}</h3>
        {total != null && total > 0 && (
          <span className="rounded-full bg-eu-chip px-2 py-0.5 font-bold text-eu-navy text-[length:var(--fs-12)] tabular-nums">{note ? `${note} ` : ""}{done} από {total}</span>
        )}
      </div>
      <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)] max-w-[80ch]">{help}</p>
    </div>
  );
}

/**
 * Το βήμα της αντιστοίχισης τιμών (μάρκες, κατηγορίες, μονάδες, σημάνσεις): **μία τιμή ανά γραμμή**, με πόσα προϊόντα
 * την έχουν και ονόματα προϊόντων για παράδειγμα — ο χρήστης δεν χρειάζεται να μαντέψει τι σημαίνει «ΛΕΥΚΕΣ ΣΥΣΚΕΥΕΣ».
 *
 * Σε 120 κατηγορίες δεν δουλεύει κανείς σε μία λίστα: εξ ορισμού φαίνονται **μόνο όσες λείπουν** και υπάρχει αναζήτηση.
 */
export function ValueRows({ kind, m, options, label, empty, busy }: { kind: ValueKind; m: Mapping; options: PickOpt[]; label: string; empty: string; busy: boolean }) {
  const set = m.sets[kind];
  // Στις μάρκες «λείπει» μόνο όποια **συμμετέχει** χωρίς δική μας μάρκα: όποια δεν συμμετέχει είναι απόφαση, όχι κενό.
  const isBrand = kind === "brand";
  const needs = (v: string) => (isBrand ? m.brandOn(v) && !m.pickOf("brand", v) : !m.pickOf(kind, v));
  const missing = set.rows.filter((r) => needs(r.value)).length;
  // «Μόνο όσες λείπουν» = φωτογραφία της στιγμής που άναψε, ΟΧΙ ζωντανό φίλτρο: αλλιώς η κάρτα που μόλις
  // αντιστοίχισες εξαφανίζεται και η επόμενη πηδά κάτω από τον κέρσορα — με 111 κατηγορίες αυτό είναι λάθος κλικ.
  const todoNow = () => new Set(set.rows.filter((r) => needs(r.value)).map((r) => r.value));
  const [only, setOnly] = useState(missing > 0);
  const [todo, setTodo] = useState(todoNow);
  const [q, setQ] = useState("");

  if (set.tooMany) return <p className="m-0 text-eu-ink text-[length:var(--fs-14)]">Η στήλη «{set.header}» έχει πάνω από {MAX_VALUES} διαφορετικές τιμές — δεν μπορεί να αντιστοιχιστεί τιμή-προς-τιμή. Γύρνα στις στήλες και βάλε την «Αγνόηση» ή «Χαρακτηριστικό».</p>;
  if (!set.rows.length) return <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Καμία τιμή σε αυτή τη στήλη.</p>;

  const t = plain(q.trim());
  const shown = set.rows.filter((r) => (!only || todo.has(r.value)) && (!t || plain(r.value).includes(t)));

  return (
    <div className="grid gap-2 min-w-0">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        {set.rows.length > 8 && (
          <label className="flex items-center gap-1.5 rounded-full border border-eu-line bg-white px-3 min-w-0 flex-1 sm:max-w-xs focus-within:outline-2 focus-within:outline-eu-blue">
            <Search className="size-4 text-eu-muted shrink-0" aria-hidden />
            <span className="sr-only">Αναζήτηση στις τιμές του feed</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ψάξε τιμή…" className="min-w-0 flex-1 bg-transparent min-h-11 md:min-h-9 text-[length:var(--fs-14)] outline-none" />
          </label>
        )}
        {missing > 0 && (
          <label className="flex items-center gap-2 cursor-pointer min-h-11 md:min-h-9 text-[length:var(--fs-13)]">
            <input type="checkbox" checked={only} onChange={(e) => { if (e.target.checked) setTodo(todoNow()); setOnly(e.target.checked); }} className="size-4 accent-eu-navy" />
            <span className="font-bold text-eu-ink-2">Μόνο όσες λείπουν ({missing})</span>
          </label>
        )}
      </div>

      {!shown.length ? (
        <p className="m-0 rounded-lg bg-eu-surface px-3 py-2 text-eu-ink-3 text-[length:var(--fs-14)]">{t ? "Καμία τιμή δεν ταιριάζει στην αναζήτηση." : "Όλες οι τιμές έχουν αντιστοίχιση."}</p>
      ) : (
        <ul className="m-0 p-0 list-none grid gap-2 lg:grid-cols-2 min-w-0">
          {shown.map((r) => {
            const pick = m.pickOf(kind, r.value);
            const on = !isBrand || m.brandOn(r.value);
            return (
              <li key={r.value} className={row(needs(r.value))}>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 min-w-0">
                  {isBrand ? (
                    <label className="flex items-center gap-2 cursor-pointer min-w-0 min-h-11 md:min-h-9">
                      <input type="checkbox" checked={on} disabled={busy} onChange={(e) => m.setBrandOn(r.value, e.target.checked)} className="size-4 accent-eu-navy shrink-0" />
                      <span className="font-bold text-eu-ink text-[length:var(--fs-14)] [overflow-wrap:anywhere]">{r.value}</span>
                    </label>
                  ) : (
                    <span className="font-bold text-eu-ink text-[length:var(--fs-14)] [overflow-wrap:anywhere]">{r.value}</span>
                  )}
                  {r.n > 0 && <span className="rounded-full bg-eu-chip px-2 py-0.5 font-bold text-eu-navy text-[length:var(--fs-12)] tabular-nums">{r.n.toLocaleString("el-GR")} προϊόντα</span>}
                </div>
                {r.ex.length > 0 && (
                  <ul className="m-0 p-0 list-none grid gap-0.5 min-w-0">
                    {r.ex.map((p) => <li key={p} className="text-eu-muted text-[length:var(--fs-12)] [overflow-wrap:anywhere]">π.χ. {cut(p, 60)}</li>)}
                  </ul>
                )}
                {on ? (
                  <OptionPicker options={options} value={pick === SKIP ? null : pick} onChange={(id) => m.setPick(kind, r.value, id)} label={`${label} για «${r.value}»`} empty={empty} disabled={busy} />
                ) : (
                  <p className="m-0 text-eu-ink-3 text-[length:var(--fs-12)]">Δεν συμμετέχει: τα {r.n > 0 ? `${r.n.toLocaleString("el-GR")} ` : ""}προϊόντα αυτής της μάρκας θα φορτωθούν στη λίστα αλλά <b>δεν θα εισαχθούν</b>.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Τα φράγματα του τρέχοντος βήματος, πάνω από τα κουμπιά: τι εμποδίζει και τι να κάνει ο χρήστης. */
export function Blockers({ list }: { list: string[] }) {
  if (!list.length) return null;
  return (
    <div role="alert" className="grid gap-1 rounded-xl border-2 border-eu-red/40 bg-eu-red/5 p-3 min-w-0">
      <p className="m-0 font-bold text-eu-ink text-[length:var(--fs-14)]">Πριν προχωρήσεις:</p>
      <ul className="m-0 pl-5 grid gap-0.5 text-eu-ink text-[length:var(--fs-13)]">{list.map((b) => <li key={b}>{b}</li>)}</ul>
    </div>
  );
}

// ---------- Τα βήματα ----------

/** Στήλες: τι είναι κάθε tag του feed. Οι ταξινομήσεις (μάρκα, κατηγορία…) αντιστοιχίζονται στα δικά τους βήματα. */
export function StepColumns({ m, busy }: { m: Mapping; busy: boolean }) {
  const p = m.progress("cols")!;
  return (
    <section data-help="xml.map.cols" className={card} aria-labelledby="xm-cols">
      <Head id="xm-cols" title="Οι στήλες του feed" done={p.done} total={p.total} help="Μία γραμμή ανά στήλη, με τρία αληθινά δείγματα και το προϊόν από το οποίο ήρθαν. Δίπλα στα μεγέθη διάλεξε μονάδα, αν ο προμηθευτής στέλνει γραμμάρια ή χιλιοστά. Μάρκα, κατηγορία, μονάδα και σήμανση διαλέγονται εδώ ως στήλες και αντιστοιχίζονται τιμή-προς-τιμή στα επόμενα βήματα." />

      {m.dupNow.length > 0 && (
        <div data-help="xml.map.duplicates" role="alert" className="grid gap-1.5 rounded-xl border-2 border-eu-red/40 bg-eu-red/5 p-3 min-w-0">
          <p className="m-0 flex gap-2 items-center font-bold text-eu-ink text-[length:var(--fs-14)]"><CircleAlert className="size-4 text-eu-red shrink-0" aria-hidden /> Σύγκρουση στηλών</p>
          <ul className="m-0 pl-5 grid gap-1 text-eu-ink text-[length:var(--fs-13)]">
            {m.dupNow.map((d) => <li key={d.label}><b>{d.label}</b>: {d.headers.map(headerLabel).join(" και ")} — κράτα μία, βάλε τις άλλες «Αγνόηση».</li>)}
          </ul>
        </div>
      )}

      <ul className="m-0 p-0 list-none grid gap-2 min-w-0">
        {m.fieldCols.map((c) => {
          const t = m.of(c.header);
          const showUnit = t.startsWith("field:") && ["widthCm", "heightCm", "lengthCm", "weightKg"].some((k) => t.endsWith(k));
          return (
            <li key={c.header} className={row(m.unsure(c))}>
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <span className="font-bold text-eu-ink text-[length:var(--fs-14)] [overflow-wrap:anywhere]">{headerLabel(c.header)}</span>
                <Flags unsure={m.unsure(c)} why={c.why} />
              </div>
              <Samples c={c} />
              <div className="grid gap-1.5 sm:grid-cols-[1fr_auto] min-w-0">
                <label className="grid gap-0.5 min-w-0">
                  <span className="sr-only">Στόχος για «{c.header}»</span>
                  <select value={t} disabled={busy} onChange={(e) => m.setTargets((x) => ({ ...x, [c.header]: e.target.value }))} className={select}>
                    {TARGETS.map((g) => <optgroup key={g.group} label={g.group}>{g.items.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}</optgroup>)}
                  </select>
                </label>
                {showUnit && (
                  <label className="grid gap-0.5 min-w-0 sm:w-56">
                    <span className="sr-only">Μονάδα για «{c.header}»</span>
                    <select value={m.transforms[c.header] ?? "none"} disabled={busy} onChange={(e) => m.setTransforms((x) => ({ ...x, [c.header]: e.target.value }))} className={select}>
                      {TRANSFORMS.map((tr) => <option key={tr.value} value={tr.value}>{tr.label}</option>)}
                    </select>
                  </label>
                )}
              </div>
              <p className="m-0 text-eu-ink-3 text-[length:var(--fs-12)]">{c.why && m.unsure(c) ? `Πρόταση: ${c.why} ` : ""}{TARGET_OF.get(t)?.help ?? ""}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Μάρκες: **ο χρήστης διαλέγει ποιες συμμετέχουν**.
 *
 * Το φράγμα «κάθε μάρκα θέλει απάντηση» έβαζε δουλειά για μάρκες που δεν πουλάμε: με τρεις άγνωστες μάρκες ο οδηγός
 * σταματούσε μέχρι να απαντηθεί η καθεμιά. Τώρα η ερώτηση είναι μία: ποιες μπαίνουν. Όσες βρέθηκαν στα δικά μας
 * ξεκινούν μέσα, οι υπόλοιπες έξω, και φράγμα μένει μόνο η μάρκα που συμμετέχει χωρίς δική μας μάρκα.
 */
export function StepBrands({ m, brands, busy }: { m: Mapping; brands: PickOpt[]; busy: boolean }) {
  const p = m.progress("brands")!;
  const all = m.sets.brand.rows.map((r) => r.value);
  const outN = m.brandsOut.reduce((s, r) => s + r.n, 0);
  const bulk = "inline-flex items-center justify-center rounded-full border-2 border-eu-line px-3 min-h-11 md:min-h-9 font-bold text-eu-ink-2 text-[length:var(--fs-13)] hover:border-eu-navy focus-visible:outline-2 focus-visible:outline-eu-blue disabled:opacity-50";
  return (
    <section data-help="xml.map.brands" className={card} aria-labelledby="xm-brands">
      <Head id="xm-brands" title="Ποιες μάρκες συμμετέχουν" note="συμμετέχουν" done={p.done} total={p.total} help="Βάλε την τσεκ δίπλα στη μάρκα για να μπουν τα προϊόντα της. Όσες μάρκες του προμηθευτή βρέθηκαν στα δικά μας συμμετέχουν από την αρχή· όσες δεν υπάρχουν στο SoftOne μένουν έξω και δεν θα σε απασχολήσουν ξανά. Μάρκες δεν δημιουργούνται από εδώ: αν θέλεις μια καινούργια, φτιάξ' τη πρώτα στις μάρκες." />
      <p className="m-0 flex gap-2 items-start text-eu-ink-3 text-[length:var(--fs-13)]"><Tags className="size-4 shrink-0 mt-0.5 text-eu-blue" aria-hidden /><span className="min-w-0">Η μάρκα ορίζει και τον κατασκευαστή (MTRMANFCTR) στο SoftOne για τα νέα είδη. {m.brandsOut.length > 0 ? <>Οι {m.brandsOut.length} μάρκες που δεν συμμετέχουν{outN > 0 ? ` (${outN.toLocaleString("el-GR")} προϊόντα)` : ""} φορτώνονται στη λίστα αλλά <b>δεν εισάγονται</b>.</> : "Όλες οι μάρκες του feed συμμετέχουν."}</span></p>
      <div data-help="xml.map.brands.pick" className="flex flex-wrap items-center gap-2 min-w-0">
        <span className="font-bold text-eu-ink-2 text-[length:var(--fs-13)]">Συμμετοχή:</span>
        <button type="button" className={bulk} disabled={busy} onClick={() => m.setBrandsOn(all, true)}>Όλες</button>
        <button type="button" className={bulk} disabled={busy} onClick={() => m.setBrandsOn(all, false)}>Καμία</button>
        <button type="button" className={bulk} disabled={busy} onClick={() => { m.setBrandsOn(all, false); m.setBrandsOn(all.filter((v) => !!m.pickOf("brand", v) && m.pickOf("brand", v) !== SKIP), true); }}>Μόνο όσες βρέθηκαν στα δικά μας</button>
      </div>
      <ValueRows kind="brand" m={m} options={brands} label="Μάρκα" empty="— διάλεξε δική μας μάρκα" busy={busy} />
    </section>
  );
}

/** Κατηγορίες: δικό τους βήμα, γιατί είναι το πιο πολυπληθές κομμάτι της αντιστοίχισης (120 τιμές στο δείγμα). */
export function StepCategories({ m, categories, busy }: { m: Mapping; categories: PickOpt[]; busy: boolean }) {
  const p = m.progress("cats")!;
  return (
    <section data-help="xml.map.cats" className={card} aria-labelledby="xm-cats">
      <Head id="xm-cats" title="Οι κατηγορίες του feed" done={p.done} total={p.total} help="Κάθε κατηγορία του feed σε δική μας κατηγορία: από εκεί βγαίνει η ομάδα χαρακτηριστικών των νέων ειδών και ο κανόνας τιμής. Δεν είναι φράγμα — χωρίς αντιστοίχιση το προϊόν μπαίνει κανονικά, αλλά η κατηγορία του θα οριστεί στην έγκριση. Ξεκίνα από τις πολυπληθέστερες." />
      <ValueRows kind="category" m={m} options={categories} label="Κατηγορία" empty="— χωρίς αντιστοίχιση" busy={busy} />
    </section>
  );
}

/** Χαρακτηριστικά: δικό τους βήμα — η δουλειά εδώ είναι ονοματολογία, όχι επιλογή από λίστα. */
export function StepSpecs({ m, busy }: { m: Mapping; busy: boolean }) {
  const p = m.progress("specs")!;
  return (
    <section data-help="xml.map.specs" className={card} aria-labelledby="xm-specs">
      <Head id="xm-specs" title="Τα χαρακτηριστικά του feed" done={p.done} total={p.total} help="Με ποια ονομασία θα μπει κάθε ετικέτα του προμηθευτή. Όπου λέγεται αλλιώς στα δικά μας, γράψε τη δική μας ονομασία — αλλιώς άφησέ τη ως είναι. Το χαρακτηριστικό μπαίνει μόνο αν υπάρχει στην ομάδα του είδους και δεν έχει ήδη τιμή." />
      <ul className="m-0 p-0 list-none grid gap-2 min-w-0">
        {m.specCols.map((c) => {
          const name = (m.labels[c.header] ?? "").trim();
          return (
            <li key={c.header} className={row(m.unsure(c) || !name)}>
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <span className="font-bold text-eu-ink text-[length:var(--fs-14)] [overflow-wrap:anywhere]">{c.label || headerLabel(c.header)}</span>
                <Flags unsure={m.unsure(c)} why={c.why} />
              </div>
              <Samples c={c} />
              <div className="grid gap-1.5 sm:grid-cols-[1fr_auto] min-w-0">
                <label className="grid gap-0.5 min-w-0">
                  <span className="sr-only">Δική μας ονομασία για «{c.label || c.header}»</span>
                  <input value={m.labels[c.header] ?? ""} disabled={busy} onChange={(e) => m.setLabels((x) => ({ ...x, [c.header]: e.target.value }))} placeholder="Ονομασία χαρακτηριστικού" className={input} />
                </label>
                <button type="button" disabled={busy} onClick={() => m.setTargets((x) => ({ ...x, [c.header]: "ignore" }))}
                  className="inline-flex items-center justify-center rounded-full border-2 border-eu-line px-3 min-h-11 md:min-h-9 font-bold text-eu-ink-3 text-[length:var(--fs-13)] hover:border-eu-navy focus-visible:outline-2 focus-visible:outline-eu-blue">Αγνόηση</button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Τελευταίο βήμα: οι αποφάσεις που δεν είναι «τι σημαίνει αυτή η στήλη» αλλά «τι γράφουμε» — τιμή, μονάδα μέτρησης,
 * εμπορική σήμανση, και αν περνάμε τα κενά στο ERP. Εδώ ζει και το κουμπί της φόρτωσης.
 */
export function StepFinish({ m, units, marks, writeOn, busy, error, onSubmit }: {
  m: Mapping;
  units: PickOpt[];
  marks: PickOpt[];
  writeOn: boolean;
  busy: boolean;
  error: string | null;
  onSubmit: () => void;
}) {
  const blocked = m.blockers.map((b) => b.text);
  return (
    <div className="grid gap-3 min-w-0">
      <section data-help="xml.map.price" className={card} aria-labelledby="xm-price">
        <Head id="xm-price" title="Από πού βγαίνει η τιμή" help="Ο συνηθισμένος τρόπος είναι κόστος × κανόνας τιμολόγησης, με πλαφόν τη λιανική του feed. Τιμή μπαίνει μόνο όπου το είδος δεν έχει." />
        <div className="grid gap-1.5 sm:grid-cols-2">
          {PRICE_MODES.map((o) => (
            <label key={o.value} className={`grid gap-0.5 rounded-lg border-2 p-2.5 cursor-pointer min-w-0 ${m.priceMode === o.value ? "border-eu-navy bg-eu-chip/40" : "border-eu-line hover:border-eu-blue"}`}>
              <span className="flex items-center gap-2 font-bold text-eu-ink text-[length:var(--fs-14)]">
                <input type="radio" name="xml-price-mode" value={o.value} checked={m.priceMode === o.value} disabled={busy} onChange={() => m.setPriceMode(o.value)} className="size-4 accent-eu-navy" />{o.label}
              </span>
              <span className="text-eu-muted text-[length:var(--fs-12)] pl-6">{o.help}</span>
            </label>
          ))}
        </div>
      </section>

      <section data-help="xml.map.erp" className={card} aria-labelledby="xm-erp">
        <Head id="xm-erp" title="Νέα είδη στο SoftOne" help="Μονάδα μέτρησης (MTRUNIT1) και εμπορική σήμανση (MTRMARK) για τα είδη που θα δημιουργηθούν. Χωρίς επιλογή αντιγράφονται από αδελφό είδος της ίδιας ομάδας χαρακτηριστικών — η σήμανση μόνο αν το αδελφό είδος είναι της ίδιας μάρκας, αλλιώς μένει κενή. Τα υπάρχοντα είδη δεν τα αγγίζει." />
        <div className="grid gap-2 sm:grid-cols-2 min-w-0">
          <div className="grid gap-1 min-w-0">
            <span className="font-bold text-eu-ink-2 text-[length:var(--fs-13)]">Μονάδα μέτρησης για όλο το feed</span>
            <OptionPicker options={units} value={m.unitId} onChange={m.setUnitId} label="Μονάδα μέτρησης για όλο το feed" empty="— από αδελφό είδος" disabled={busy} />
          </div>
          <div className="grid gap-1 min-w-0">
            <span className="font-bold text-eu-ink-2 text-[length:var(--fs-13)]">Εμπορική σήμανση για όλο το feed</span>
            <OptionPicker options={marks} value={m.markId} onChange={m.setMarkId} label="Εμπορική σήμανση για όλο το feed" empty="— από αδελφό είδος" disabled={busy} />
          </div>
        </div>
        {!units.length && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Δεν υπάρχουν μονάδες μέτρησης από το SoftOne — τρέξε τον συγχρονισμό στο «SoftOne ERP → Μονάδες μέτρησης».</p>}
        {!marks.length && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Δεν υπάρχουν εμπορικές σημάνσεις από το SoftOne — τρέξε τον συγχρονισμό στο «SoftOne ERP → Εμπορικές σημάνσεις».</p>}

        {m.sets.unit.header && (
          <div className="grid gap-2 border-t border-eu-line pt-3 min-w-0">
            <p className="m-0 font-bold text-eu-ink text-[length:var(--fs-14)]">Η στήλη «{m.sets.unit.header}» ανά τιμή</p>
            <ValueRows kind="unit" m={m} options={units} label="Μονάδα" empty="— η μονάδα του feed" busy={busy} />
          </div>
        )}
        {m.sets.mark.header && (
          <div className="grid gap-2 border-t border-eu-line pt-3 min-w-0">
            <p className="m-0 font-bold text-eu-ink text-[length:var(--fs-14)]">Η στήλη «{m.sets.mark.header}» ανά τιμή</p>
            <ValueRows kind="mark" m={m} options={marks} label="Σήμανση" empty="— η σήμανση του feed" busy={busy} />
          </div>
        )}
      </section>

      <section data-help="xml.map.limit" className={card} aria-labelledby="xm-limit">
        <Head id="xm-limit" title="Πόσο συχνά κατεβαίνει το feed" help="Οι προμηθευτές βάζουν όριο στις λήψεις — ο ένας που δοκιμάσαμε δέχεται δύο την ώρα και μετά απαντά «πάρα πολλά αιτήματα». Το XML της τελευταίας λήψης μένει αποθηκευμένο, άρα αλλαγή αντιστοίχισης και νέα φόρτωση γίνονται χωρίς να τον ξαναενοχλήσουμε." />
        <label className="grid gap-1 max-w-xs min-w-0">
          <span className="font-bold text-eu-ink-2 text-[length:var(--fs-13)]">Μία λήψη κάθε … λεπτά</span>
          <input type="number" min={0} max={1440} step={5} value={m.minFetchMin} disabled={busy} inputMode="numeric"
            onChange={(e) => m.setMinFetchMin(clampMinFetch(Number(e.target.value)))} className={input} />
          <span className="text-eu-muted text-[length:var(--fs-12)]">{m.minFetchMin === 0 ? "Χωρίς όριο: κάθε «Νέο τρέξιμο» κατεβάζει το feed." : `Μέσα στα ${m.minFetchMin} λεπτά, το «Νέο τρέξιμο» ξαναδιαβάζει το αποθηκευμένο XML αντί να κατεβάσει.`}</span>
        </label>
      </section>

      <section data-help="xml.map.softone" className={card} aria-labelledby="xm-s1">
        <h3 id="xm-s1" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Και στο SoftOne</h3>
        <label className="flex items-start gap-2 cursor-pointer min-h-11 md:min-h-9">
          <input type="checkbox" checked={m.toSoftone} disabled={busy} onChange={(e) => m.setToSoftone(e.target.checked)} className="size-4 mt-1 accent-eu-navy" />
          <span className="grid gap-0.5 min-w-0">
            <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Γράψε τα κενά στοιχεία και στο ERP</span>
            <span className="text-eu-muted text-[length:var(--fs-12)]">{writeOn ? "Οι αλλαγές προς το SoftOne είναι ανοιχτές: τα κενά πεδία των υπαρχόντων ειδών θα γραφτούν στο ERP. Χρειάζεται και το δικαίωμα «Εκτέλεση συγχρονισμού ERP»." : "Οι αλλαγές προς το SoftOne είναι κλειστές (Ρυθμίσεις → SoftOne): τα στοιχεία μένουν σε αναμονή και τα νέα είδη πάνε για έγκριση. Οι φωτογραφίες ανεβαίνουν κανονικά."}</span>
          </span>
        </label>
      </section>

      {error && <p role="alert" className="m-0 flex gap-2 items-start rounded-xl bg-eu-red/10 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]"><CircleAlert className="size-4 text-eu-red shrink-0 mt-0.5" aria-hidden /><span className="min-w-0 [overflow-wrap:anywhere]">{error}</span></p>}
      <Blockers list={blocked} />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={primary} disabled={busy || blocked.length > 0} onClick={onSubmit}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />} Φόρτωσε τα προϊόντα
        </button>
        <span className="text-eu-muted text-[length:var(--fs-13)] min-w-0">Η αντιστοίχιση αποθηκεύεται στον προμηθευτή — το επόμενο τρέξιμο δεν θα τη ξαναζητήσει. Τίποτα δεν γράφεται στα προϊόντα σε αυτό το βήμα.</span>
      </div>
    </div>
  );
}
