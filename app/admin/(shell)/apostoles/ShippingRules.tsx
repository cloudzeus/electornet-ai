"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Box, Check, CircleAlert, Info, Loader2, PackageSearch, Plus, Save, Search, Store, Truck, Undo2, X } from "lucide-react";
import { checkShippingAction, previewShippingAction, saveBulkyRulesAction } from "./actions";

export interface ShipCat { id: string; slug: string; name: string; path: string; depth: number; count: number; parent: string | null; def: "courier" | "store" | null }
type Rules = { categories: Record<string, "courier" | "store">; maxKg: number; maxSideCm: number; lockerMaxKg: number; lockerBox: [number, number, number] };
type Tally = { courier: number; store: number; locker: number; unknown: number; storeByCat: Record<string, number> };
type Check = Awaited<ReturnType<typeof checkShippingAction>>[number];

const COURIER: Record<string, string> = { geniki: "Γενική Ταχυδρομική", acs: "ACS", boxnow: "BOX NOW", elta: "ΕΛΤΑ Courier", asap: "ASAP" };
const norm = (s: string) => s.toLocaleLowerCase("el-GR").normalize("NFD").replace(/[̀-ͯ]/g, "");
const num = (n: number) => n.toLocaleString("el-GR");

/**
 * Αποστολές σε τρία βήματα αντί για εκατοντάδες γραμμές: 1) ποιες κατηγορίες πάνε μόνο από κατάστημα, 2) όρια βάρους /
 * μεγέθους για όλα τα υπόλοιπα, 3) εξαιρέσεις «πάντα με courier». Δίπλα: η επίπτωση σε όλο τον κατάλογο πριν την
 * αποθήκευση και «Γιατί πάει έτσι;» για ένα προϊόν.
 */
export function ShippingRules({ cats, initial, tally: initialTally, couriers, clickCollect, appointment, canWrite, canSettings }: {
  cats: ShipCat[]; initial: Rules; tally: Tally; couriers: string[]; clickCollect: boolean; appointment: boolean; canWrite: boolean; canSettings: boolean;
}) {
  const router = useRouter();
  const [map, setMap] = useState(initial.categories);
  const [lim, setLim] = useState({ maxKg: String(initial.maxKg), maxSideCm: String(initial.maxSideCm), lockerMaxKg: String(initial.lockerMaxKg) });
  const [tally, setTally] = useState<Tally>(initialTally);
  const [calc, startCalc] = useTransition();
  const [saving, startSave] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const rules = useMemo(() => ({ categories: map, maxKg: lim.maxKg, maxSideCm: lim.maxSideCm, lockerMaxKg: lim.lockerMaxKg, lockerBox: initial.lockerBox }), [map, lim, initial.lockerBox]);
  const snap = (m: Record<string, string>, l: Record<string, string>) => JSON.stringify([Object.entries(m).sort(), l]);
  const initLim = { maxKg: String(initial.maxKg), maxSideCm: String(initial.maxSideCm), lockerMaxKg: String(initial.lockerMaxKg) };
  const dirty = snap(map, lim) !== snap(initial.categories, initLim);

  // επίπτωση σε πραγματικό χρόνο (μετά από κάθε αλλαγή)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => startCalc(async () => setTally(await previewShippingAction(rules))), 500);
    return () => clearTimeout(t);
  }, [rules]);

  const bySlug = useMemo(() => new Map(cats.map((c) => [c.slug, c])), [cats]);
  // «μόνο κατάστημα» ανά κατηγορία μαζί με τις υποκατηγορίες της
  const storeIn = useMemo(() => {
    const kids = new Map<string, ShipCat[]>();
    for (const c of cats) if (c.parent) kids.set(c.parent, [...(kids.get(c.parent) ?? []), c]);
    const memo = new Map<string, number>();
    const sum = (c: ShipCat): number => { if (memo.has(c.slug)) return memo.get(c.slug)!; const v = (tally.storeByCat[c.id] ?? 0) + (kids.get(c.slug) ?? []).reduce((a, k) => a + sum(k), 0); memo.set(c.slug, v); return v; };
    return (slug: string) => { const c = bySlug.get(slug); return c ? sum(c) : 0; };
  }, [cats, tally.storeByCat, bySlug]);

  // οι δύο λίστες: «μόνο από κατάστημα» (δικές σου + προεπιλογές) και «πάντα με courier» (εξαιρέσεις)
  const storeList = cats.filter((c) => map[c.slug] === "store" || (c.def === "store" && map[c.slug] !== "courier"));
  const courierList = cats.filter((c) => map[c.slug] === "courier" || (c.def === "courier" && map[c.slug] !== "store"));
  /** η κατηγορία καλύπτεται ήδη από γονική της στη λίστα → το όνομα της γονικής */
  const coveredBy = (c: ShipCat, list: ShipCat[]) => { const inList = new Set(list.map((x) => x.slug)); for (let p = c.parent; p; p = bySlug.get(p)?.parent ?? null) if (inList.has(p)) return bySlug.get(p)!.name; return null; };
  const setChoice = (slug: string, v: "courier" | "store" | null) => setMap((m) => { const n = { ...m }; const def = bySlug.get(slug)?.def ?? null; if (v === null || v === def) delete n[slug]; else n[slug] = v; return n; });
  /** αφαίρεση από λίστα: δική σου → καμία επιλογή· προεπιλογή → ρητά το αντίθετο */
  const removeFrom = (slug: string, list: "store" | "courier") => { const c = bySlug.get(slug)!; if (map[slug] === list) setChoice(slug, null); else if (c.def === list) setMap((m) => ({ ...m, [slug]: list === "store" ? "courier" : "store" })); };

  const save = () => startSave(async () => {
    const r = await saveBulkyRulesAction(rules);
    setMsg(r.ok ? { ok: true, text: "Αποθηκεύτηκε — ισχύει σε 1 λεπτό στο καλάθι και στο checkout." } : { ok: false, text: "Δεν αποθηκεύτηκε." });
    router.refresh();
  });
  const undo = () => { setMap(initial.categories); setLim(initLim); setMsg(null); };
  const d = (k: keyof Omit<Tally, "storeByCat">) => tally[k] - initialTally[k];

  return (
    <div className="grid gap-4 min-w-0 @container">
      {/* ---- κεφαλίδα ---- */}
      <header className="grid gap-2">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
          <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)] leading-tight">Αποστολές</h1>
          <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Τι φεύγει με courier, τι μόνο από κατάστημα και τι χωράει σε θυρίδα — ίδιος κανόνας σε καλάθι, checkout και παραγγελία.</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[length:var(--fs-13)]">
          <span className="font-bold text-eu-ink-2">Ενεργά στο checkout:</span>
          {couriers.length ? couriers.map((c) => <span key={c} className="inline-flex items-center gap-1 rounded-full bg-eu-green/10 text-eu-green font-bold px-2.5 h-8"><Truck className="size-3.5" aria-hidden />{COURIER[c] ?? c}</span>) : <span className="inline-flex items-center gap-1 rounded-full bg-eu-amber/20 text-eu-ink font-bold px-2.5 h-8"><CircleAlert className="size-3.5" aria-hidden />Κανένας courier</span>}
          <span className={`inline-flex items-center gap-1 rounded-full font-bold px-2.5 h-8 ${clickCollect ? "bg-eu-green/10 text-eu-green" : "bg-eu-surface text-eu-muted"}`}><Store className="size-3.5" aria-hidden />Παραλαβή από κατάστημα{clickCollect ? "" : ": όχι"}</span>
          <span className={`inline-flex items-center gap-1 rounded-full font-bold px-2.5 h-8 ${appointment ? "bg-eu-green/10 text-eu-green" : "bg-eu-surface text-eu-muted"}`}>Ραντεβού{appointment ? "" : ": όχι"}</span>
          {canSettings && <Link href="/admin/settings/shipping" className="inline-flex items-center gap-1 rounded-full px-2.5 h-8 font-bold text-eu-blue hover:bg-white">Αλλαγή στις Ρυθμίσεις <ArrowRight className="size-3.5" aria-hidden /></Link>}
          {couriers.includes("geniki") && <Link href="/admin/apostoles/vouchers" className="inline-flex items-center gap-1 rounded-full px-2.5 h-8 font-bold text-eu-blue hover:bg-white">Vouchers Γενικής <ArrowRight className="size-3.5" aria-hidden /></Link>}
        </div>
      </header>

      <div className="grid gap-4 @4xl:grid-cols-[minmax(0,1fr)_minmax(17rem,22rem)] items-start">
        {/* ---- οι κανόνες, σε τρία βήματα ---- */}
        <div className="grid gap-3 min-w-0">
          <Step n={1} title="Μεγάλες συσκευές: μόνο από κατάστημα" help="Αυτές οι κατηγορίες (και οι υποκατηγορίες τους) δεν φεύγουν με courier· ο πελάτης βλέπει «Με ραντεβού» ή «Παραλαβή από κατάστημα».">
            <CatList items={storeList} kind="store" map={map} count={storeIn} canWrite={canWrite} onRemove={(s) => removeFrom(s, "store")} />
            {canWrite && <CatSearch cats={cats} exclude={new Set(storeList.map((c) => c.slug))} covered={(c) => coveredBy(c, storeList)} placeholder="Πρόσθεσε κατηγορία, π.χ. «καταψύκτες»" onPick={(s) => setChoice(s, "store")} />}
          </Step>

          <Step n={2} title="Όρια για όλα τα υπόλοιπα" help="Ό,τι ξεπερνά αυτά τα όρια πάει μόνο από κατάστημα. Βάρος συσκευασίας από τα χαρακτηριστικά ή το ERP· διαστάσεις από το ERP.">
            <div className="grid grid-cols-1 @md:grid-cols-3 gap-2">
              <Num label="Μέγιστο βάρος για courier" unit="κιλά" value={lim.maxKg} disabled={!canWrite} onChange={(v) => setLim((x) => ({ ...x, maxKg: v }))} />
              <Num label="Μεγαλύτερη πλευρά για courier" unit="εκ." value={lim.maxSideCm} disabled={!canWrite} onChange={(v) => setLim((x) => ({ ...x, maxSideCm: v }))} />
              <Num label="Μέγιστο βάρος για θυρίδα" unit="κιλά" value={lim.lockerMaxKg} disabled={!canWrite} onChange={(v) => setLim((x) => ({ ...x, lockerMaxKg: v }))} hint={`Θυρίδα: χωράει σε ${initial.lockerBox.join(" × ")} εκ.`} />
            </div>
          </Step>

          <Step n={3} title="Εξαιρέσεις: πάντα με courier" help="Υποκατηγορίες που φεύγουν με courier ακόμη κι αν η γονική τους είναι «μόνο από κατάστημα» ή ξεπερνούν τα όρια (π.χ. mini bar μέσα στα ψυγεία)." collapsedEmpty={!courierList.length}>
            <CatList items={courierList} kind="courier" map={map} count={storeIn} canWrite={canWrite} onRemove={(s) => removeFrom(s, "courier")} />
            {canWrite && <CatSearch cats={cats} exclude={new Set(courierList.map((c) => c.slug))} covered={(c) => coveredBy(c, courierList)} placeholder="Πρόσθεσε εξαίρεση, π.χ. «mini bar»" onPick={(s) => setChoice(s, "courier")} />}
          </Step>
        </div>

        {/* ---- επίπτωση + έλεγχος προϊόντος ---- */}
        <aside className="grid gap-3 @4xl:sticky @4xl:top-4 min-w-0">
          <section aria-labelledby="impact-h" className="rounded-xl border border-eu-line bg-white p-3 grid gap-2">
            <div className="flex items-center gap-2">
              <h2 id="impact-h" className="m-0 font-bold text-eu-ink text-[length:var(--fs-15)]">Τι σημαίνει για τον κατάλογο</h2>
              {calc && <Loader2 className="size-4 animate-spin text-eu-muted" aria-label="Υπολογισμός" />}
            </div>
            <dl className="m-0 grid grid-cols-2 gap-1.5" aria-live="polite">
              <Stat label="Με courier" value={tally.courier} delta={d("courier")} icon={<Truck className="size-4" aria-hidden />} />
              <Stat label="Μόνο από κατάστημα" value={tally.store} delta={d("store")} icon={<Store className="size-4" aria-hidden />} />
              <Stat label="Χωράνε σε θυρίδα" value={tally.locker} delta={d("locker")} icon={<Box className="size-4" aria-hidden />} />
              <Stat label="Χωρίς βάρος & διαστάσεις" value={tally.unknown} tone="warn" href="/admin/catalog/dimensions?f=none" icon={<CircleAlert className="size-4" aria-hidden />} />
            </dl>
            {dirty && <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Με τις αλλαγές σου (πριν την αποθήκευση) · σε σύνολο {num(tally.courier + tally.store)} ενεργών προϊόντων.</p>}
            {tally.unknown > 0 && <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Όσα δεν έχουν βάρος ή διαστάσεις κρίνονται μόνο από την κατηγορία τους και δεν μπαίνουν σε θυρίδα.</p>}
          </section>
          <ProductCheck rules={rules} />
        </aside>
      </div>

      {canWrite && (dirty || msg) && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-xl bg-white/95 backdrop-blur border border-eu-line p-2 shadow-[var(--shadow-overlay)]">
          {msg ? <p role="status" className={`m-0 inline-flex items-center gap-1.5 font-bold text-[length:var(--fs-14)] ${msg.ok ? "text-eu-green" : "text-eu-red"}`}>{msg.ok ? <Check className="size-4" aria-hidden /> : <CircleAlert className="size-4" aria-hidden />}{msg.text}</p> : <span className="text-eu-ink-2 font-bold text-[length:var(--fs-14)]">Έχεις αλλαγές που δεν αποθηκεύτηκαν.</span>}
          {dirty && <button type="button" onClick={undo} className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-eu-line text-eu-ink-2 font-bold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-surface"><Undo2 className="size-4" aria-hidden /> Αναίρεση</button>}
          {dirty && <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-blue disabled:opacity-50">{saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />} Αποθήκευση</button>}
        </div>
      )}
    </div>
  );
}

function Step({ n, title, help, children, collapsedEmpty }: { n: number; title: string; help: string; children: React.ReactNode; collapsedEmpty?: boolean }) {
  return (
    <section aria-labelledby={`step-${n}`} className="rounded-xl border border-eu-line bg-white p-3 grid gap-2.5">
      <div className="flex items-start gap-2.5">
        <span className="size-7 shrink-0 grid place-items-center rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-13)]" aria-hidden>{n}</span>
        <div className="grid min-w-0">
          <h2 id={`step-${n}`} className="m-0 font-bold text-eu-ink text-[length:var(--fs-15)] leading-snug">{title}</h2>
          <p className="m-0 text-eu-muted text-[length:var(--fs-13)] leading-snug">{help}</p>
        </div>
      </div>
      {collapsedEmpty ? <div className="grid gap-2"><p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Καμία εξαίρεση.</p>{(children as React.ReactNode[])[1]}</div> : children}
    </section>
  );
}

function CatList({ items, kind, map, count, canWrite, onRemove }: { items: ShipCat[]; kind: "store" | "courier"; map: Record<string, string>; count: (slug: string) => number; canWrite: boolean; onRemove: (slug: string) => void }) {
  if (!items.length) return kind === "store" ? <p className="m-0 rounded-lg bg-eu-amber/15 px-3 py-2 text-eu-ink-2 text-[length:var(--fs-13)]">Καμία κατηγορία — όλα κρίνονται μόνο από τα όρια βάρους/μεγέθους.</p> : null;
  return (
    <ul className="m-0 p-0 list-none grid gap-1">
      {items.map((c) => {
        const own = map[c.slug] === kind;
        const trail = c.path.split(" › ").slice(0, -1).join(" › ");
        return (
          <li key={c.slug} className="flex items-center gap-2 rounded-lg border border-eu-line pl-2.5 pr-1 min-h-11">
            {kind === "store" ? <Store className="size-4 shrink-0 text-eu-navy" aria-hidden /> : <Truck className="size-4 shrink-0 text-eu-green" aria-hidden />}
            <span className="grid min-w-0 flex-1 py-1">
              <span className="font-bold text-eu-ink text-[length:var(--fs-14)] leading-tight truncate">{c.name}{!own && <span className="ml-1.5 rounded-full bg-eu-surface px-1.5 py-0.5 text-eu-muted font-semibold text-[length:var(--fs-12)] align-middle">προεπιλογή</span>}</span>
              <span className="text-eu-muted text-[length:var(--fs-12)] leading-tight truncate" title={c.path}>{trail ? `${trail} · ` : ""}{num(c.count)} προϊόντα{kind === "store" ? ` · ${num(count(c.slug))} μόνο κατάστημα` : ""}</span>
            </span>
            {canWrite && <button type="button" onClick={() => onRemove(c.slug)} aria-label={`Αφαίρεση: ${c.name}`} title={own ? "Αφαίρεση" : "Αφαίρεση (αλλάζει την προεπιλογή)"} className="size-10 shrink-0 grid place-items-center rounded-lg text-eu-muted hover:bg-eu-red/10 hover:text-eu-red"><X className="size-4" aria-hidden /></button>}
          </li>
        );
      })}
    </ul>
  );
}

/** Αναζήτηση κατηγορίας με προτάσεις καθώς γράφεις (όνομα ή διαδρομή)· Enter = η πρώτη. */
function CatSearch({ cats, exclude, covered, placeholder, onPick }: { cats: ShipCat[]; exclude: Set<string>; covered: (c: ShipCat) => string | null; placeholder: string; onPick: (slug: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const hits = useMemo(() => { const t = norm(q.trim()); if (!t) return []; return cats.filter((c) => !exclude.has(c.slug) && norm(c.path).includes(t)).sort((a, b) => Number(!norm(a.name).includes(t)) - Number(!norm(b.name).includes(t)) || a.depth - b.depth).slice(0, 8).map((c) => ({ ...c, via: covered(c) })); }, [q, cats, exclude, covered]);
  const pick = (slug: string) => { onPick(slug); setQ(""); setOpen(false); };
  return (
    <div className="relative">
      <label className="relative block">
        <span className="sr-only">{placeholder}</span>
        <Plus className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-eu-muted" aria-hidden />
        <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => { const first = hits.find((h) => !h.via); if (e.key === "Enter" && first) { e.preventDefault(); pick(first.slug); } if (e.key === "Escape") setOpen(false); }}
          placeholder={placeholder} role="combobox" aria-expanded={open && hits.length > 0} aria-autocomplete="list"
          className="w-full rounded-lg border-2 border-dashed border-eu-line bg-white pl-9 pr-3 min-h-11 text-[length:var(--fs-15)] focus:border-solid focus:border-eu-blue outline-none" />
      </label>
      {open && q.trim() && (
        <ul role="listbox" className="absolute z-20 left-0 right-0 mt-1 m-0 p-1 list-none rounded-xl border border-eu-line bg-white shadow-[var(--shadow-overlay)] grid max-h-80 overflow-y-auto">
          {hits.length ? hits.map((c) => (
            <li key={c.slug} role="option" aria-selected={false}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c.slug)} disabled={!!c.via} className="w-full text-left grid rounded-lg px-2.5 py-1.5 min-h-11 hover:bg-eu-surface disabled:opacity-60 disabled:hover:bg-transparent disabled:cursor-not-allowed">
                <span className="font-bold text-eu-ink text-[length:var(--fs-14)] leading-tight">{c.name} <span className="font-normal text-eu-muted text-[length:var(--fs-13)]">· {num(c.count)} προϊόντα{c.via ? ` · ήδη μέσω «${c.via}»` : ""}</span></span>
                <span className="text-eu-muted text-[length:var(--fs-12)] leading-tight truncate">{c.path}</span>
              </button>
            </li>
          )) : <li className="px-2.5 py-2 text-eu-muted text-[length:var(--fs-13)]">Καμία κατηγορία με «{q}» — δοκίμασε μέρος της λέξης.</li>}
        </ul>
      )}
    </div>
  );
}

function Num({ label, unit, value, onChange, disabled, hint }: { label: string; unit: string; value: string; onChange: (v: string) => void; disabled: boolean; hint?: string }) {
  return (
    <label className="grid gap-1 min-w-0">
      <span className="font-bold text-eu-ink text-[length:var(--fs-13)] leading-tight">{label}</span>
      <span className="flex items-center rounded-lg border border-eu-line bg-white focus-within:border-eu-blue">
        <input inputMode="decimal" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value.replace(",", "."))} className="min-w-0 flex-1 bg-transparent px-3 min-h-11 text-[length:var(--fs-16)] tabular-nums outline-none" />
        <span className="pr-3 text-eu-muted text-[length:var(--fs-13)]">{unit}</span>
      </span>
      {hint && <span className="text-eu-muted text-[length:var(--fs-12)]">{hint}</span>}
    </label>
  );
}

function Stat({ label, value, delta, icon, tone, href }: { label: string; value: number; delta?: number; icon: React.ReactNode; tone?: "warn"; href?: string }) {
  const inner = (
    <>
      <dt className="flex items-center gap-1.5 text-eu-muted text-[length:var(--fs-12)] leading-tight">{icon}{label}</dt>
      <dd className="m-0 flex items-baseline gap-1.5"><span className={`font-heading font-extrabold text-[length:var(--fs-20)] leading-none tabular-nums ${tone === "warn" && value ? "text-eu-ink" : "text-eu-navy"}`}>{num(value)}</span>{delta ? <span className={`font-bold text-[length:var(--fs-12)] tabular-nums ${delta > 0 ? "text-eu-blue" : "text-eu-ink-2"}`}>{delta > 0 ? "+" : ""}{num(delta)}</span> : null}</dd>
    </>
  );
  return href ? <Link href={href} className="grid gap-1 rounded-lg bg-eu-surface/70 px-2.5 py-2 hover:bg-eu-chip">{inner}</Link> : <div className="grid gap-1 rounded-lg bg-eu-surface/70 px-2.5 py-2">{inner}</div>;
}

/** «Γιατί πάει έτσι;» — ένα προϊόν με τους τρέχοντες (και μη αποθηκευμένους) κανόνες. */
function ProductCheck({ rules }: { rules: unknown }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Check[] | null>(null);
  const [busy, start] = useTransition();
  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => start(async () => setRes(await checkShippingAction(q, rules))), 350);
    return () => clearTimeout(t);
  }, [q, rules]);
  const shown = q.trim().length < 2 ? null : res;
  return (
    <section aria-labelledby="check-h" className="rounded-xl border border-eu-line bg-white p-3 grid gap-2">
      <h2 id="check-h" className="m-0 inline-flex items-center gap-1.5 font-bold text-eu-ink text-[length:var(--fs-15)]"><PackageSearch className="size-4 text-eu-blue" aria-hidden /> Γιατί πάει έτσι;</h2>
      <label className="relative block">
        <span className="sr-only">Αναζήτηση προϊόντος</span>
        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-eu-muted" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Προϊόν, SKU, κωδικός ή barcode" className="w-full rounded-lg border border-eu-line bg-white pl-9 pr-9 min-h-11 text-[length:var(--fs-15)] focus:border-eu-blue outline-none" />
        {busy && <Loader2 className="size-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-eu-muted" aria-hidden />}
      </label>
      {shown && (shown.length ? (
        <ul className="m-0 p-0 list-none grid gap-1.5" aria-live="polite">
          {shown.map((p) => (
            <li key={p.id} className="grid gap-1 rounded-lg bg-eu-surface/70 px-2.5 py-2">
              <span className="font-bold text-eu-ink text-[length:var(--fs-13)] leading-snug line-clamp-2">{p.title}</span>
              <span className="flex flex-wrap gap-1">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 h-6 font-bold text-[length:var(--fs-12)] ${p.courier ? "bg-eu-green/10 text-eu-green" : "bg-eu-navy text-white"}`}>{p.courier ? <><Truck className="size-3" aria-hidden /> Courier</> : <><Store className="size-3" aria-hidden /> Μόνο κατάστημα</>}</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 h-6 font-bold text-[length:var(--fs-12)] ${p.locker ? "bg-eu-green/10 text-eu-green" : "bg-eu-surface text-eu-muted"}`}><Box className="size-3" aria-hidden />{p.locker ? "Θυρίδα" : "Όχι θυρίδα"}</span>
              </span>
              <span className="text-eu-muted text-[length:var(--fs-12)] leading-snug">{p.reason ?? (p.courier ? "Μέσα στα όρια." : "")}{` · ${p.weightKg != null ? `${num(p.weightKg)} κιλά` : "χωρίς βάρος"} · ${p.dimsCm ? `${p.dimsCm.map((x) => Math.round(x)).join("×")} εκ.` : "χωρίς διαστάσεις"}`}</span>
            </li>
          ))}
        </ul>
      ) : <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Κανένα ενεργό προϊόν με «{q}».</p>)}
      {!shown && <p className="m-0 inline-flex items-start gap-1.5 text-eu-muted text-[length:var(--fs-13)]"><Info className="size-4 mt-px shrink-0" aria-hidden />Δείχνει την απόφαση με τις ρυθμίσεις όπως είναι τώρα στη σελίδα, και τον λόγο.</p>}
    </section>
  );
}
