"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, ListPlus, Loader2, Pencil, Plus, RefreshCw, RotateCcw, Search, Trash2, Undo2 } from "lucide-react";
import { addCategory, removeCategory, resumeJob, runNow, setBrandMap, setCategoryMap, suggestAll } from "@/app/admin/(shell)/catalog/competitors/actions";

export type CatRow = {
  id: string; name: string; path: string; products: number; extPath: string | null; suggestion: string | null;
  status: "mapped" | "suggested" | "needed"; pairs: number; sugg: number; seen: boolean;
};
/** Κατηγορία μας για τον επιλογέα· `missing` = τελικές κατηγορίες της που δεν είναι ακόμη στη σύγκριση. */
export type PickOption = { id: string; name: string; path: string; products: number; root: boolean; leaves: number; missing: number };
export type BrandCard = { id: string; name: string; products: number; pairs: number; alias: string | null; notCarried: boolean; needsLook: boolean };
type Opt = { path: string; label: string };

const num = (n: number) => n.toLocaleString("el-GR");
const btn = "inline-flex items-center justify-center gap-1.5 rounded-xl border border-eu-line bg-white text-eu-navy font-bold text-[length:var(--fs-13)] px-3 min-h-11 hover:border-eu-navy transition-colors disabled:opacity-50";
const pill = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-bold text-[length:var(--fs-12)] whitespace-nowrap";
const STATUS: Record<CatRow["status"], { text: string; cls: string }> = {
  mapped: { text: "Αντιστοιχίστηκε", cls: "bg-eu-green/10 text-eu-green" },
  suggested: { text: "Πρόταση · έλεγξέ τη", cls: "bg-eu-blue-light text-eu-blue" },
  needed: { text: "Χρειάζεται επιλογή", cls: "bg-eu-amber/15 text-eu-ink" },
};
/** household-appliances/fridges/fridge-freezers → fridges › fridge-freezers */
const pretty = (p: string) => p.split("/").slice(1).join(" › ") || p;

/** «Τρέξε τώρα» ή «Ξαναενεργοποίηση»· όσο τρέχει η εργασία, η σελίδα ανανεώνεται κάθε 20″ για να φαίνεται η πρόοδος. */
export function StatusActions({ mode, running, disabled }: { mode: "run" | "resume"; running: boolean; disabled: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(t);
  }, [running, router]);
  const go = () => start(async () => {
    if (mode === "resume") { await resumeJob(); setMsg({ ok: true, text: "Ξαναενεργοποιήθηκε· τρέχει απόψε από τις 01:00" }); }
    else { const r = await runNow(); setMsg({ ok: r.ok, text: r.message }); }
    router.refresh();
  });
  return (
    <div className="grid gap-1 justify-items-start">
      <button type="button" onClick={go} disabled={busy || disabled || (mode === "run" && running)} className={mode === "resume" ? `${btn} border-eu-red text-eu-red hover:border-eu-red` : btn}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : mode === "resume" ? <RotateCcw className="size-4" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
        {mode === "resume" ? "Ξαναενεργοποίηση" : running ? "Τρέχει…" : "Τρέξε τώρα"}
      </button>
      {msg && <p role="status" className={`m-0 max-w-[40ch] text-[length:var(--fs-13)] ${msg.ok ? "text-eu-ink-3" : "text-eu-red"}`}>{msg.text}</p>}
    </div>
  );
}

function CategorySelect({ row, options, canWrite }: { row: CatRow; options: Opt[] | null; canWrite: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const current = row.extPath ?? row.suggestion ?? "";
  const save = (v: string | null) => start(async () => {
    setErr(null);
    const r = await setCategoryMap(row.id, v);
    if (!r.ok) setErr(r.error);
    router.refresh();
  });
  const remove = () => start(async () => { await removeCategory(row.id); router.refresh(); });
  if (!options) return <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">{row.extPath ? pretty(row.extPath) : "—"} · οι κατηγορίες του Κωτσόβολου δεν φορτώνουν τώρα</p>;
  const extra = [row.extPath, row.suggestion].filter((p): p is string => !!p && !options.some((o) => o.path === p));
  const groups = new Map<string, Opt[]>();
  for (const o of [...options, ...extra.map((p) => ({ path: p, label: p }))]) { const g = o.path.split("/")[0]; groups.set(g, [...(groups.get(g) ?? []), o]); }
  return (
    <div className="grid gap-1.5 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <select value={current} disabled={!canWrite || busy} aria-label={`Κατηγορία Κωτσόβολου για ${row.name}`}
          onChange={(e) => save(e.target.value)}
          className={`min-h-11 w-full min-w-0 rounded-xl border bg-white px-3 text-[length:var(--fs-14)] text-eu-ink disabled:opacity-60 ${row.status === "needed" ? "border-eu-amber" : "border-eu-line"}`}>
          <option value="" disabled>Επίλεξε κατηγορία…</option>
          {[...groups].sort(([a], [b]) => a.localeCompare(b)).map(([g, os]) => (
            <optgroup key={g} label={g}>{os.sort((a, b) => a.path.localeCompare(b.path)).map((o) => <option key={o.path} value={o.path}>{o.path === g ? `${g} (όλη)` : pretty(o.path)}</option>)}</optgroup>
          ))}
        </select>
        {busy && <Loader2 className="size-4 animate-spin text-eu-blue shrink-0" aria-label="Αποθήκευση" />}
      </div>
      {canWrite && (
        <div className="flex flex-wrap gap-2">
          {row.status === "suggested" && <button type="button" onClick={() => save(row.suggestion)} disabled={busy} className={btn}><Check className="size-4" aria-hidden /> Σωστή, κράτα την</button>}
          <button type="button" onClick={remove} disabled={busy} className={`${btn} text-eu-ink-3`} aria-label={`Αφαίρεση της κατηγορίας ${row.name} από τη σύγκριση`}><Trash2 className="size-4" aria-hidden /> Αφαίρεση</button>
        </div>
      )}
      {err && <p role="alert" className="m-0 text-eu-red text-[length:var(--fs-13)]">{err}</p>}
    </div>
  );
}

function Matched({ row }: { row: CatRow }) {
  if (row.status !== "mapped") return <span className="text-eu-ink-3 text-[length:var(--fs-13)]">{row.status === "suggested" ? "μετά την επιβεβαίωση" : "—"}</span>;
  if (!row.seen) return <span className="text-eu-ink-3 text-[length:var(--fs-13)]">μετά το 1ο τρέξιμο</span>;
  const pct = row.products ? Math.round((row.pairs / row.products) * 100) : 0;
  return (
    <div className="grid gap-1 min-w-0">
      <div className="flex items-center gap-2">
        <div className="h-2 w-full max-w-28 rounded-full bg-eu-surface-2 overflow-hidden" role="img" aria-label={`${pct}% ταίριαξαν`}>
          <div className="h-full rounded-full bg-eu-blue" style={{ width: `${pct}%` }} />
        </div>
        <b className="tabular-nums text-eu-ink text-[length:var(--fs-14)]">{pct}%</b>
      </div>
      <span className="text-eu-ink-3 text-[length:var(--fs-13)] tabular-nums">{num(row.pairs)} από {num(row.products)}{row.sugg ? ` · +${num(row.sugg)} προτάσεις` : ""}</span>
    </div>
  );
}

/** Οι κατηγορίες που συγκρίνονται, μία καρτέλα ανά ριζική κατηγορία μας (χωρίς καρτέλες όταν είναι μόνο μία). */
export function MappingTabs({ tabs, options, canWrite }: { tabs: { key: string; label: string; rows: CatRow[] }[]; options: Opt[] | null; canWrite: boolean }) {
  const [on, setOn] = useState(tabs[0]?.key);
  const tab = tabs.find((t) => t.key === on) ?? tabs[0];
  const cols = "md:grid-cols-[minmax(0,1.3fr)_5rem_minmax(0,2fr)_minmax(0,9rem)_10rem]";
  return (
    <section className="rounded-2xl border border-eu-line bg-white min-w-0" aria-label="Κατηγορίες">
      {tabs.length > 1 && <div role="tablist" aria-label="Ομάδες κατηγοριών" className="flex flex-wrap gap-1 px-3 border-b border-eu-line" data-help="competitors-tabs">
        {tabs.map((t) => {
          const open = t.rows.filter((r) => r.status === "needed" || r.status === "suggested").length;
          return (
            <button key={t.key} type="button" role="tab" aria-selected={t.key === tab?.key} onClick={() => setOn(t.key)}
              className={`min-h-11 px-3 border-b-[3px] font-bold text-[length:var(--fs-15)] transition-colors ${t.key === tab?.key ? "border-eu-yellow text-eu-navy" : "border-transparent text-eu-ink-3 hover:text-eu-navy"}`}>
              {t.label}{open > 0 && <span className="ml-1.5 tabular-nums text-eu-ink-3 font-normal text-[length:var(--fs-13)]">· {num(open)} για απόφαση</span>}
            </button>
          );
        })}
      </div>}
      <div className="p-4 grid gap-3 min-w-0" data-help="competitors-categories">
        <div className="grid gap-1">
          <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Κατηγορίες</h3>
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Αριστερά οι δικές μας (υποκατηγορίες SoftOne), δεξιά η αντίστοιχη ενότητα του kotsovolos.gr. Ψάχνουμε τιμές μόνο στις πράσινες· οι προτάσεις θέλουν πρώτα επιβεβαίωση.</p>
        </div>
        {!tab?.rows.length ? (
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Δεν συγκρίνεται ακόμη καμία κατηγορία. Πρόσθεσε από τον επιλογέα «Πρόσθεσε κατηγορία» από πάνω.</p>
        ) : (
          <ul className="m-0 p-0 list-none grid min-w-0">
            <li className={`hidden md:grid ${cols} gap-3 px-2 pb-2 border-b border-eu-line text-eu-ink-3 font-bold text-[length:var(--fs-12)]`} aria-hidden>
              <span>Δική μας κατηγορία</span><span>Προϊόντα</span><span>Κατηγορία Κωτσόβολου</span><span>Ταίριαξαν</span><span>Κατάσταση</span>
            </li>
            {tab.rows.map((r) => (
              <li key={r.id} className={`grid ${cols} gap-x-3 gap-y-2 items-center px-2 py-3 border-b border-eu-line-2 last:border-b-0 min-w-0`}>
                <div className="flex items-baseline justify-between gap-2 md:block min-w-0">
                  <span className="grid min-w-0">
                    <b className="text-eu-ink text-[length:var(--fs-14)] break-words">{r.name}</b>
                    {r.path && <span className="text-eu-ink-3 text-[length:var(--fs-12)] break-words">{r.path}</span>}
                  </span>
                  <span className={`${pill} md:hidden ${STATUS[r.status].cls}`}>{STATUS[r.status].text}</span>
                </div>
                <span className="tabular-nums text-eu-ink-2 text-[length:var(--fs-14)]"><span className="md:hidden text-eu-ink-3">Προϊόντα: </span>{num(r.products)}</span>
                <CategorySelect row={r} options={options} canWrite={canWrite} />
                <Matched row={r} />
                <span className={`${pill} hidden md:inline-flex justify-self-start ${STATUS[r.status].cls}`}>{STATUS[r.status].text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Αναζήτηση σε όλες τις κατηγορίες μας· η προσθήκη φέρνει αμέσως πρόταση Κωτσόβολου. «Πρότεινε όλες» ανά ριζική. */
export function CategoryPicker({ options }: { options: PickOption[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const hits = useMemo(() => {
    const n = q.trim().toLocaleLowerCase("el").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (n.length < 2) return [];
    return options.filter((o) => `${o.path} ${o.name}`.toLocaleLowerCase("el").normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(n)).slice(0, 12);
  }, [q, options]);
  const roots = options.filter((o) => o.root && o.missing > 0);
  const add = (o: PickOption, all: boolean) => { setBusyId(o.id); start(async () => {
    const r = all ? await suggestAll(o.id) : await addCategory(o.id);
    setMsg(r.ok ? { ok: true, text: `Προστέθηκαν ${num(r.added)} · ${num(r.suggested)} με πρόταση Κωτσόβολου — έλεγξέ τες παρακάτω` } : { ok: false, text: r.error });
    setBusyId(null);
    router.refresh();
  }); };
  return (
    <section className="rounded-2xl border border-eu-line bg-white p-4 grid gap-3 min-w-0" aria-label="Πρόσθεσε κατηγορία" data-help="competitors-add">
      <div className="grid gap-1">
        <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Πρόσθεσε κατηγορία</h3>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Ψάξε μια κατηγορία μας (π.χ. ψυγεία, πλυντήρια πιάτων, κλιματιστικά, laptop). Μια κατηγορία με υποκατηγορίες τις προσθέτει όλες. Παίρνει αμέσως πρόταση από τον Κωτσόβολο, που την επιβεβαιώνεις παρακάτω.</p>
      </div>
      <label className="relative block min-w-0">
        <span className="sr-only">Αναζήτηση κατηγορίας</span>
        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-eu-ink-3" aria-hidden />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση κατηγορίας"
          className="min-h-11 w-full rounded-xl border border-eu-line pl-9 pr-3 text-[length:var(--fs-14)]" />
      </label>
      {q.trim().length >= 2 && (hits.length ? (
        <ul className="m-0 p-0 list-none grid gap-1.5">
          {hits.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-eu-line-2 px-3 py-2 min-w-0">
              <span className="grid min-w-0">
                <b className="text-eu-ink text-[length:var(--fs-14)] break-words">{o.name}</b>
                <span className="text-eu-ink-3 text-[length:var(--fs-12)] break-words tabular-nums">{[o.path, `${num(o.products)} προϊόντα`, o.leaves > 1 ? `${num(o.leaves)} υποκατηγορίες` : ""].filter(Boolean).join(" · ")}</span>
              </span>
              {o.missing ? (
                <button type="button" disabled={busy} onClick={() => add(o, false)} className={btn}>{busyId === o.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />} Προσθήκη{o.leaves > 1 ? ` (${num(o.missing)})` : ""}</button>
              ) : <span className={`${pill} bg-eu-green/10 text-eu-green`}><Check className="size-3.5" aria-hidden /> Ήδη στη σύγκριση</span>}
            </li>
          ))}
        </ul>
      ) : <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Καμία κατηγορία με προϊόντα δεν ταιριάζει.</p>)}
      {roots.length > 0 && (
        <div className="grid gap-1.5" data-help="competitors-suggest-all">
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Ή πρόσθεσε μονομιάς όλη μια ομάδα, με προτάσεις προς έλεγχο:</p>
          <div className="flex flex-wrap gap-2">
            {roots.map((o) => (
              <button key={o.id} type="button" disabled={busy} onClick={() => add(o, true)} className={btn}>
                {busyId === o.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ListPlus className="size-4" aria-hidden />} Πρότεινε όλες: {o.name} <span className="tabular-nums font-normal text-eu-ink-3">({num(o.missing)})</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {msg && <p role="status" className={`m-0 text-[length:var(--fs-13)] ${msg.ok ? "text-eu-green" : "text-eu-red"}`}>{msg.text}</p>}
    </section>
  );
}

function Brand({ b, canWrite }: { b: BrandCard; canWrite: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [edit, setEdit] = useState(false);
  const [alias, setAlias] = useState(b.alias ?? "");
  const [err, setErr] = useState<string | null>(null);
  const save = (patch: { alias?: string | null; notCarried?: boolean }) => start(async () => {
    setErr(null);
    const r = await setBrandMap(b.id, patch);
    if (!r.ok) setErr(r.error); else setEdit(false);
    router.refresh();
  });
  const tone = b.notCarried ? "border-eu-line bg-eu-surface" : b.needsLook ? "border-eu-amber bg-eu-amber/5" : "border-eu-line bg-white";
  const sub = b.notCarried ? "Σημειώθηκε: δεν τη φέρνουν"
    : b.needsLook ? `0 ζευγάρια από ${num(b.products)} προϊόντα · τη φέρνουν ή όχι;`
    : `= ${b.alias ?? b.name} · ${num(b.pairs)} ζευγάρια από ${num(b.products)}`;
  return (
    <li className={`rounded-xl border p-3 grid gap-2 min-w-0 ${tone}`}>
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="grid min-w-0">
          <b className={`text-[length:var(--fs-15)] break-words ${b.notCarried ? "text-eu-ink-3" : "text-eu-ink"}`}>{b.name}</b>
          <span className="text-eu-ink-3 text-[length:var(--fs-13)] tabular-nums">{sub}</span>
        </div>
        {b.notCarried ? <span className={`${pill} bg-eu-surface-2 text-eu-ink-3`}>Εκτός</span>
          : !b.needsLook && <span className={`${pill} bg-eu-green/10 text-eu-green`}>{b.alias ? "Άλλο όνομα" : "Αυτόματα"}</span>}
      </div>
      {canWrite && (edit ? (
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); save({ alias: alias.trim() || null }); }}>
          <label className="sr-only" htmlFor={`alias-${b.id}`}>Πώς γράφεται στον Κωτσόβολο</label>
          <input id={`alias-${b.id}`} value={alias} onChange={(e) => setAlias(e.target.value)} placeholder={b.name} maxLength={60}
            className="min-h-11 flex-1 min-w-0 rounded-xl border border-eu-line px-3 text-[length:var(--fs-14)]" />
          <button type="submit" disabled={busy} className={btn}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Αποθήκευση</button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          {b.notCarried ? (
            <button type="button" disabled={busy} onClick={() => save({ notCarried: false })} className={btn}><Undo2 className="size-4" aria-hidden /> Τη φέρνουν</button>
          ) : (
            <>
              {b.needsLook && <button type="button" disabled={busy} onClick={() => save({ notCarried: true })} className={btn}><Ban className="size-4" aria-hidden /> Δεν τη φέρνουν</button>}
              <button type="button" disabled={busy} onClick={() => setEdit(true)} className={btn}><Pencil className="size-4" aria-hidden /> Γράφεται αλλιώς</button>
            </>
          )}
        </div>
      ))}
      {err && <p role="alert" className="m-0 text-eu-red text-[length:var(--fs-13)]">{err}</p>}
    </li>
  );
}

/** Μάρκες των κατηγοριών που συγκρίνονται: όσες έχουν 0 ζευγάρια μπαίνουν πρώτες, σε πορτοκαλί πλαίσιο. */
export function BrandCards({ brands, canWrite }: { brands: BrandCard[]; canWrite: boolean }) {
  const look = brands.filter((b) => b.needsLook).length;
  return (
    <section className="rounded-2xl border border-eu-line bg-white p-4 grid gap-3 min-w-0" aria-label="Μάρκες" data-help="competitors-brands">
      <div className="grid gap-1">
        <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Μάρκες{look > 0 && <span className="ml-2 text-eu-amber text-[length:var(--fs-14)] tabular-nums">{num(look)} θέλουν ματιά</span>}</h3>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Οι περισσότερες ταιριάζουν μόνες τους από το όνομα. Διόρθωσε όσες γράφονται αλλιώς, ή σημείωσε όσες ο Κωτσόβολος δεν φέρνει για να μη μετράνε ως αποτυχίες.</p>
      </div>
      {brands.length ? (
        <ul className="m-0 p-0 list-none grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))]">
          {brands.map((b) => <Brand key={b.id} b={b} canWrite={canWrite} />)}
        </ul>
      ) : (
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Οι μάρκες φαίνονται μόλις αντιστοιχίσεις μια κατηγορία.</p>
      )}
    </section>
  );
}
