"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, CircleAlert, EyeOff, Loader2, Plus, Save, Search, Trash2, X } from "lucide-react";
import { AVAIL_STATES, parseConds, type AvailCond, type AvailState, type StockOp } from "@/lib/catalog/availability-core";
import type { AvailTally } from "@/lib/catalog/availability";
import { previewAvailabilityAction, saveAvailabilityAction, testAvailabilityAction, type RuleInput } from "./actions";

export interface Opt { id: string; name: string }
type Rule = { key: string; id?: string; name: string; active: boolean; conditions: AvailCond[]; label: string; state: string; publish: boolean };
type Tested = Awaited<ReturnType<typeof testAvailabilityAction>>[number];

const num = (n: number) => n.toLocaleString("el-GR");
const STATE = Object.fromEntries(AVAIL_STATES.map((s) => [s.key, s.label])) as Record<AvailState, string>;
const DOT: Record<string, string> = { "in-stock": "bg-eu-green", low: "bg-eu-amber", order: "bg-eu-muted", unavailable: "bg-eu-red" };
const SOURCE = { override: "φράση SoftOne", rule: "κανόνας", default: "προεπιλογή" } as const;
const OPS: StockOp[] = [">", ">=", "=", "<=", "<"];
const KINDS: { k: AvailCond["k"]; label: string }[] = [
  { k: "stock", label: "Απόθεμα κεντρικής" }, { k: "supplier", label: "Διαθεσιμότητα προμηθευτή (XML)" },
  { k: "brand", label: "Μάρκα" }, { k: "category", label: "Κατηγορία (και υποκατηγορίες)" }, { k: "price", label: "Τιμή" },
];
const blank = (k: AvailCond["k"]): AvailCond => (k === "stock" ? { k, op: "<=", n: 0 } : k === "price" ? { k, has: true } : k === "supplier" ? { k, in: ["unavailable"] } : { k, in: [] });
const ruleIndex = (rules: Rule[], id?: string) => rules.findIndex((r, i) => (r.id ?? `new-${i}`) === id);
let seq = 0;
const keyed = (r: Omit<Rule, "key">): Rule => ({ ...r, key: `r${++seq}` });
const toInput = (rules: Rule[]): RuleInput[] => rules.map(({ key, ...r }) => (void key, r));
const field = "rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9 text-[length:var(--fs-14)] min-w-0";
const btn = "inline-flex items-center justify-center gap-1.5 rounded-full border border-eu-line bg-white text-eu-navy font-bold text-[length:var(--fs-13)] px-3 min-h-11 md:min-h-9 hover:border-eu-navy disabled:opacity-50";

/**
 * Κανόνες διαθεσιμότητας: λίστα με σειρά (πάνω/κάτω), φράση + κατάσταση + «δημοσιεύεται», συνθήκες που ισχύουν όλες μαζί.
 * Δίπλα: τι θα δείχνει η βιτρίνα (πλήθη ανά φράση) με τους κανόνες της φόρμας και «Δοκιμή για προϊόν».
 */
export function AvailabilityRules({ initial, tally: initialTally, cats, brands, canWrite }: {
  initial: { id: string; name: string; active: boolean; conditions: unknown; label: string; state: string; publish: boolean }[];
  tally: AvailTally; cats: Opt[]; brands: Opt[]; canWrite: boolean;
}) {
  const router = useRouter();
  const start = useMemo(() => initial.map((r) => keyed({ ...r, conditions: parseConds(r.conditions) })), [initial]);
  const [rules, setRules] = useState<Rule[]>(start);
  const [tally, setTally] = useState(initialTally);
  const [calc, startCalc] = useTransition();
  const [saving, startSave] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const snap = (l: Rule[]) => JSON.stringify(toInput(l).map(({ id, ...r }) => (void id, r)));
  const dirty = snap(rules) !== snap(start);
  const catName = useMemo(() => new Map(cats.map((c) => [c.id, c.name])), [cats]);
  const brandName = useMemo(() => new Map(brands.map((b) => [b.id, b.name])), [brands]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => startCalc(async () => { const r = await previewAvailabilityAction(toInput(rules)); if (r.ok) setTally(r.tally); }), 600);
    return () => clearTimeout(t);
  }, [rules]);

  const put = (key: string, patch: Partial<Rule>) => { setRules((l) => l.map((r) => (r.key === key ? { ...r, ...patch } : r))); setMsg(null); };
  const move = (i: number, d: -1 | 1) => setRules((l) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const setCond = (r: Rule, i: number, c: AvailCond | null) => put(r.key, { conditions: c ? r.conditions.map((x, j) => (j === i ? c : x)) : r.conditions.filter((_, j) => j !== i) });
  const save = () => startSave(async () => {
    const r = await saveAvailabilityAction(toInput(rules));
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setMsg({ ok: true, text: `Αποθηκεύτηκε · ${num(r.changed)} προϊόντα άλλαξαν φράση στη βιτρίνα.` });
    router.refresh();
  });

  // ο server ονομάζει τους μη αποθηκευμένους κανόνες new-<θέση> (βλ. clean στο actions.ts)
  const ruleName = (id?: string) => { const i = ruleIndex(rules, id); return i >= 0 ? `κανόνας #${i + 1}` : "κανόνας"; };

  return (
    <div className="grid gap-5 @5xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] items-start min-w-0">
      <section className="grid gap-3 min-w-0" aria-label="Κανόνες" data-help="availability.rules">
        {rules.length === 0 && <p className="m-0 rounded-2xl border border-dashed border-eu-line bg-white p-4 text-eu-ink-3 text-[length:var(--fs-14)]">Κανένας κανόνας — ισχύουν η φράση του SoftOne και η προεπιλογή. Πρόσθεσε κανόνα, π.χ. «απόθεμα ≤ 0 και προμηθευτής: Μη διαθέσιμο → Εξαντλήθηκε, δεν δημοσιεύεται».</p>}
        {rules.map((r, i) => (
          <article key={r.key} className={`rounded-2xl border bg-white p-3 @xl:p-4 grid gap-3 min-w-0 ${r.active ? "border-eu-line" : "border-dashed border-eu-line opacity-75"}`}>
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="font-extrabold text-eu-blue text-[length:var(--fs-13)]">#{i + 1}</span>
              <input aria-label="Όνομα κανόνα (προαιρετικό)" placeholder="Όνομα (προαιρετικό)" value={r.name} disabled={!canWrite} onChange={(e) => put(r.key, { name: e.target.value })} className={`${field} flex-1 min-w-[10rem]`} />
              <label className="inline-flex items-center gap-1.5 min-h-11 md:min-h-9 text-[length:var(--fs-13)] font-bold text-eu-ink"><input type="checkbox" checked={r.active} disabled={!canWrite} onChange={(e) => put(r.key, { active: e.target.checked })} className="size-4" /> Ενεργός</label>
              <span className="inline-flex gap-1">
                <button type="button" aria-label="Πιο πάνω" disabled={!canWrite || i === 0} onClick={() => move(i, -1)} className={btn}><ArrowUp className="size-4" aria-hidden /></button>
                <button type="button" aria-label="Πιο κάτω" disabled={!canWrite || i === rules.length - 1} onClick={() => move(i, 1)} className={btn}><ArrowDown className="size-4" aria-hidden /></button>
                <button type="button" aria-label="Διαγραφή κανόνα" disabled={!canWrite} onClick={() => setRules((l) => l.filter((x) => x.key !== r.key))} className={`${btn} text-eu-red`}><Trash2 className="size-4" aria-hidden /></button>
              </span>
            </div>

            <div className="grid gap-2 min-w-0" data-help="availability.conditions">
              <div className="text-eu-ink-3 font-bold text-[length:var(--fs-13)]">Όταν {r.conditions.length ? "ισχύουν όλα:" : "— χωρίς συνθήκες ο κανόνας πιάνει όλα τα προϊόντα που έφτασαν ως εδώ"}</div>
              {r.conditions.map((c, j) => (
                <div key={j} className="flex flex-wrap items-center gap-2 min-w-0">
                  <select aria-label="Συνθήκη" value={c.k} disabled={!canWrite} onChange={(e) => setCond(r, j, blank(e.target.value as AvailCond["k"]))} className={`${field} max-w-full`}>
                    {KINDS.map((k) => <option key={k.k} value={k.k}>{k.label}</option>)}
                  </select>
                  {c.k === "stock" && <>
                    <select aria-label="Σύγκριση" value={c.op} disabled={!canWrite} onChange={(e) => setCond(r, j, { ...c, op: e.target.value as StockOp })} className={field}>{OPS.map((o) => <option key={o} value={o}>{o === ">=" ? "≥" : o === "<=" ? "≤" : o}</option>)}</select>
                    <input aria-label="Τεμάχια" type="number" inputMode="numeric" value={c.n} disabled={!canWrite} onChange={(e) => setCond(r, j, { ...c, n: Number(e.target.value) || 0 })} className={`${field} w-24`} />
                    <span className="text-eu-ink-3 text-[length:var(--fs-13)]">τεμ.</span>
                  </>}
                  {c.k === "price" && <select aria-label="Τιμή" value={c.has ? "1" : "0"} disabled={!canWrite} onChange={(e) => setCond(r, j, { k: "price", has: e.target.value === "1" })} className={field}><option value="1">έχει τιμή eshop</option><option value="0">χωρίς τιμή</option></select>}
                  {c.k === "supplier" && <div className="flex flex-wrap gap-1.5">{AVAIL_STATES.map((s) => {
                    const on = c.in.includes(s.key);
                    return <button key={s.key} type="button" aria-pressed={on} disabled={!canWrite} onClick={() => setCond(r, j, { k: "supplier", in: on ? c.in.filter((x) => x !== s.key) : [...c.in, s.key] })} className={`${btn} ${on ? "bg-eu-navy text-white border-eu-navy" : ""}`}>{s.label}</button>;
                  })}</div>}
                  {(c.k === "brand" || c.k === "category") && <Picker opts={c.k === "brand" ? brands : cats} names={c.k === "brand" ? brandName : catName} value={c.in} disabled={!canWrite} onChange={(v) => setCond(r, j, { k: c.k, in: v })} />}
                  <button type="button" aria-label="Αφαίρεση συνθήκης" disabled={!canWrite} onClick={() => setCond(r, j, null)} className={btn}><X className="size-4" aria-hidden /></button>
                </div>
              ))}
              {canWrite && <button type="button" onClick={() => put(r.key, { conditions: [...r.conditions, blank("stock")] })} className={`${btn} justify-self-start`}><Plus className="size-4" aria-hidden /> Συνθήκη</button>}
            </div>

            <div className="grid gap-2 @xl:grid-cols-[minmax(0,1fr)_auto_auto] items-center min-w-0" data-help="availability.phrase">
              <label className="grid gap-1 min-w-0"><span className="text-eu-ink-3 font-bold text-[length:var(--fs-13)]">Τότε η βιτρίνα γράφει</span>
                <input value={r.label} disabled={!canWrite} maxLength={120} placeholder="π.χ. Μετά από παραγγελία · 7–10 εργάσιμες" onChange={(e) => put(r.key, { label: e.target.value })} className={field} /></label>
              <label className="grid gap-1"><span className="text-eu-ink-3 font-bold text-[length:var(--fs-13)]">Κατάσταση</span>
                <select value={r.state} disabled={!canWrite} onChange={(e) => put(r.key, { state: e.target.value })} className={field}>{AVAIL_STATES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></label>
              <label className="inline-flex items-center gap-1.5 min-h-11 md:min-h-9 self-end text-[length:var(--fs-13)] font-bold text-eu-ink" title="Όχι = το προϊόν δεν περνά τον έλεγχο πληρότητας και κρύβεται από τη βιτρίνα (όταν ο έλεγχος είναι ενεργός)">
                <input type="checkbox" checked={r.publish} disabled={!canWrite} onChange={(e) => put(r.key, { publish: e.target.checked })} className="size-4" /> Δημοσιεύεται</label>
            </div>
          </article>
        ))}
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setRules((l) => [...l, keyed({ name: "", active: true, conditions: [blank("stock")], label: "", state: "order", publish: true })])} className={btn}><Plus className="size-4" aria-hidden /> Νέος κανόνας</button>
            <button type="button" disabled={!dirty || saving} onClick={save} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-bold text-[length:var(--fs-14)] px-4 min-h-11 disabled:opacity-50" data-help="availability.save">
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />} Αποθήκευση & εφαρμογή
            </button>
            {dirty && !saving && <button type="button" onClick={() => { setRules(start); setMsg(null); }} className={btn}>Αναίρεση</button>}
            {msg && <span role="status" className={`inline-flex items-center gap-1.5 text-[length:var(--fs-14)] font-bold ${msg.ok ? "text-eu-green" : "text-eu-red"}`}>{msg.ok ? <Check className="size-4" aria-hidden /> : <CircleAlert className="size-4" aria-hidden />}{msg.text}</span>}
          </div>
        )}
      </section>

      <aside className="grid gap-3 min-w-0">
        <section className="rounded-2xl border border-eu-line bg-white p-4 grid gap-2 min-w-0" aria-label="Τι θα δείχνει η βιτρίνα" data-help="availability.tally">
          <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-17)] inline-flex items-center gap-2">Τι θα δείχνει η βιτρίνα {calc && <Loader2 className="size-4 animate-spin text-eu-blue" aria-label="Υπολογισμός" />}</h3>
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">{num(tally.total)} ενεργά προϊόντα{dirty ? " · με τους κανόνες της φόρμας (δεν έχουν αποθηκευτεί)" : ""}.</p>
          {tally.hidden > 0 && <p className="m-0 inline-flex items-center gap-1.5 text-eu-red font-bold text-[length:var(--fs-13)]"><EyeOff className="size-4" aria-hidden /> {num(tally.hidden)} με «δεν δημοσιεύεται»</p>}
          <ul className="m-0 p-0 list-none grid gap-1 max-h-[28rem] overflow-y-auto">
            {tally.phrases.slice(0, 40).map((p) => (
              <li key={`${p.source}|${p.ruleId}|${p.state}|${p.label}`} className="flex items-start gap-2 text-[length:var(--fs-13)] min-w-0">
                <span className={`mt-1.5 size-2 rounded-full shrink-0 ${DOT[p.state] ?? "bg-eu-muted"}`} aria-hidden />
                <span className="min-w-0 flex-1 break-words"><b className="text-eu-ink">{p.label}</b> <span className="text-eu-ink-3">· {p.source === "rule" ? ruleName(p.ruleId) : SOURCE[p.source]}</span></span>
                <span className="tabular-nums font-bold text-eu-ink">{num(p.count)}</span>
              </li>
            ))}
          </ul>
        </section>
        <Tester rules={rules} />
      </aside>
    </div>
  );
}

/** Πολλαπλή επιλογή με αναζήτηση (μάρκες / κατηγορίες): chips + λίστα που φιλτράρεται. */
function Picker({ opts, names, value, onChange, disabled }: { opts: Opt[]; names: Map<string, string>; value: string[]; onChange: (v: string[]) => void; disabled: boolean }) {
  const [q, setQ] = useState("");
  const norm = (s: string) => s.toLocaleLowerCase("el-GR").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const hits = q.trim().length >= 2 ? opts.filter((o) => !value.includes(o.id) && norm(o.name).includes(norm(q.trim()))).slice(0, 8) : [];
  return (
    <div className="grid gap-1.5 min-w-0 flex-1 basis-[16rem]">
      <div className="flex flex-wrap gap-1.5">
        {value.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-full bg-eu-chip text-eu-ink text-[length:var(--fs-13)] font-bold pl-2.5 pr-1 min-h-9 max-w-full">
            <span className="truncate">{names.get(id) ?? "(δεν υπάρχει πια)"}</span>
            {!disabled && <button type="button" aria-label="Αφαίρεση" onClick={() => onChange(value.filter((x) => x !== id))} className="inline-grid place-items-center size-7 rounded-full hover:bg-white"><X className="size-3.5" aria-hidden /></button>}
          </span>
        ))}
      </div>
      {!disabled && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση για προσθήκη…" aria-label="Αναζήτηση" className={field} />}
      {hits.length > 0 && <ul className="m-0 p-1 list-none rounded-lg border border-eu-line bg-white grid">{hits.map((o) => (
        <li key={o.id}><button type="button" onClick={() => { onChange([...value, o.id]); setQ(""); }} className="w-full text-left rounded-md px-2 min-h-11 md:min-h-9 text-[length:var(--fs-13)] hover:bg-eu-surface break-words">{o.name}</button></li>
      ))}</ul>}
    </div>
  );
}

/** «Δοκιμή για προϊόν»: ποια φράση βγαίνει και από πού, με τους κανόνες της φόρμας. */
function Tester({ rules }: { rules: Rule[] }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Tested[] | null>(null);
  const [busy, start] = useTransition();
  const run = () => start(async () => setRes(await testAvailabilityAction(q, toInput(rules))));
  return (
    <section className="rounded-2xl border border-eu-line bg-white p-4 grid gap-2 min-w-0" aria-label="Δοκιμή για προϊόν" data-help="availability.test">
      <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-17)]">Δοκιμή για προϊόν</h3>
      <form onSubmit={(e) => { e.preventDefault(); run(); }} className="flex gap-2 min-w-0">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Τίτλος, SKU, κωδικός ERP, barcode" aria-label="Προϊόν" className={`${field} flex-1`} />
        <button type="submit" disabled={busy || q.trim().length < 2} className={btn} aria-label="Δοκιμή">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}</button>
      </form>
      {res && res.length === 0 && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Δεν βρέθηκε προϊόν.</p>}
      {res?.map((p) => (
        <div key={p.id} className="rounded-lg bg-eu-surface p-2.5 grid gap-0.5 text-[length:var(--fs-13)] min-w-0">
          <b className="text-eu-ink break-words">{p.title}</b>
          <span className="text-eu-ink-3">SKU {p.sku} · απόθεμα {p.stock}{p.supplierAvail ? ` · προμηθευτής: ${STATE[p.supplierAvail as AvailState] ?? p.supplierAvail}` : ""}</span>
          <span className="inline-flex items-center gap-1.5 font-bold text-eu-ink"><span className={`size-2 rounded-full ${DOT[p.result.state]}`} aria-hidden />{p.result.label}</span>
          <span className="text-eu-ink-3">από: {p.result.source === "rule" ? `κανόνα #${ruleIndex(rules, p.result.ruleId) + 1}` : p.result.source === "override" ? "φράση του είδους στο SoftOne (υπερισχύει)" : "προεπιλογή (απόθεμα)"}{p.result.publish ? "" : " · δεν δημοσιεύεται"}</span>
        </div>
      ))}
    </section>
  );
}
