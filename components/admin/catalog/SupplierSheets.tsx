"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, Check, CircleAlert, Download, FileArchive, FileSpreadsheet, FileUp, Loader2, Plus, Search, Upload, X } from "lucide-react";
import { loadBrandOverview } from "@/app/admin/(shell)/catalog/templates/actions";
import type { BrandOverview } from "@/lib/catalog/supplier-sheet";
import type { Plan, PlanRow, ApplyResult } from "@/lib/catalog/supplier-import";

type BrandOpt = { id: string; name: string; products: number; s1: boolean };
type GroupOpt = { id: number; name: string };

const btn = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 min-h-11 font-bold text-[length:var(--fs-14)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const primary = `${btn} bg-eu-navy text-white hover:bg-eu-blue`;
const secondary = `${btn} border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`;
const input = "w-full rounded-lg border border-eu-line bg-white px-3 min-h-11 text-[length:var(--fs-14)] focus-visible:outline-2 focus-visible:outline-eu-blue";
const chip = "rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-12)] tabular-nums";

/** Templates προμηθευτών (λήψη) και εισαγωγή excel, σε δύο καρτέλες. */
export function SupplierSheets({ brands, groups, canWrite, canErp, writeOn }: { brands: BrandOpt[]; groups: GroupOpt[]; canWrite: boolean; canErp: boolean; writeOn: boolean }) {
  const [tab, setTab] = useState<"templates" | "import">("templates");
  return (
    <div className="grid gap-4 min-w-0 @container">
      <div role="tablist" aria-label="Ενότητες" className="flex flex-wrap gap-1 rounded-full bg-eu-surface p-1 w-fit max-w-full">
        {([["templates", "1. Templates", FileSpreadsheet], ["import", "2. Εισαγωγή", FileUp]] as const).map(([k, l, Icon]) => (
          <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)} disabled={k === "import" && !canWrite}
            className={`${btn} ${tab === k ? "bg-white text-eu-navy shadow-sm" : "text-eu-ink-3 hover:text-eu-navy"}`}><Icon className="size-4" aria-hidden /> {l}</button>
        ))}
      </div>
      {tab === "templates" ? <Templates brands={brands} groups={groups} /> : <Import brands={brands} canErp={canErp} writeOn={writeOn} />}
    </div>
  );
}

// ======================= 1. Templates =======================

function Templates({ brands, groups }: { brands: BrandOpt[]; groups: GroupOpt[] }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [overview, setOverview] = useState<BrandOverview[]>([]);
  const [sel, setSel] = useState<Record<string, number[]>>({}); // μάρκα → επιλεγμένες ομάδες
  const [extra, setExtra] = useState<Record<string, GroupOpt[]>>({}); // κατηγορίες χωρίς προϊόντα, για νέα
  const [loading, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const matches = useMemo(() => {
    const t = q.trim().toLocaleLowerCase("el-GR");
    if (!t) return [];
    return brands.filter((b) => !picked.includes(b.id) && b.name.toLocaleLowerCase("el-GR").includes(t)).sort((a, b) => Number(!a.name.toLocaleLowerCase("el-GR").startsWith(t)) - Number(!b.name.toLocaleLowerCase("el-GR").startsWith(t)) || b.products - a.products).slice(0, 8);
  }, [q, brands, picked]);

  const load = (next: string[]) => {
    setPicked(next);
    if (!next.length) { setOverview([]); return; }
    start(async () => {
      const ov = await loadBrandOverview(next);
      setOverview(ov);
      setSel((s) => Object.fromEntries(ov.map((o) => [o.brandId, s[o.brandId] ?? o.groups.map((g) => g.groupS1Id)])));
    });
  };
  const add = (id: string) => { load([...picked, id]); setQ(""); };
  const remove = (id: string) => load(picked.filter((x) => x !== id));
  const toggle = (b: string, g: number) => setSel((s) => ({ ...s, [b]: s[b]?.includes(g) ? s[b].filter((x) => x !== g) : [...(s[b] ?? []), g] }));

  const download = async (url: string, label: string) => {
    setBusy(label); setErr(null);
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Το αρχείο δεν δημιουργήθηκε.");
      const name = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? "template.xlsx";
      const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob()); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const selection = overview.map((o) => ({ b: o.brandId, g: [...(sel[o.brandId] ?? [])] })).filter((x) => x.g.length);

  return (
    <div className="grid gap-4">
      <section className="rounded-xl border border-eu-line bg-white p-3 @md:p-4 grid gap-3" aria-labelledby="t-brands">
        <div>
          <h3 id="t-brands" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Μάρκες</h3>
          <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Μία ή περισσότερες. Κάθε μάρκα παίρνει δικό της αρχείο.</p>
        </div>
        <div className="relative">
          <Search className="size-4 text-eu-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) { e.preventDefault(); add(matches[0].id); } }} placeholder="Γράψε μάρκα, π.χ. Samsung" aria-label="Αναζήτηση μάρκας" className={`${input} pl-9`} />
          {matches.length > 0 && (
            <ul className="absolute z-10 left-0 right-0 mt-1 m-0 p-1 list-none rounded-xl border border-eu-line bg-white shadow-lg max-h-80 overflow-auto">
              {matches.map((b) => (
                <li key={b.id}><button type="button" onClick={() => add(b.id)} className="w-full flex items-center justify-between gap-2 rounded-lg px-3 min-h-11 text-left hover:bg-eu-surface text-[length:var(--fs-14)]">
                  <span className="font-bold text-eu-ink truncate">{b.name}</span><span className="text-eu-muted text-[length:var(--fs-12)] shrink-0">{b.products} προϊόντα{b.s1 ? "" : " · χωρίς SoftOne"}</span>
                </button></li>
              ))}
            </ul>
          )}
        </div>
        {picked.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {picked.map((id) => { const b = brands.find((x) => x.id === id)!; return (
              <span key={id} className="inline-flex items-center gap-1 rounded-full bg-eu-chip text-eu-navy font-bold pl-3 text-[length:var(--fs-14)]">{b.name}
                <button type="button" onClick={() => remove(id)} aria-label={`Αφαίρεση ${b.name}`} className="size-11 grid place-items-center rounded-full hover:bg-eu-navy/10"><X className="size-4" aria-hidden /></button>
              </span>
            ); })}
          </div>
        )}
      </section>

      {loading && <p className="m-0 inline-flex items-center gap-2 text-eu-ink-3 text-[length:var(--fs-14)]"><Loader2 className="size-4 animate-spin" aria-hidden /> Φορτώνω τα προϊόντα…</p>}
      {err && <p role="alert" className="m-0 flex gap-2 items-start rounded-xl bg-eu-red/10 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]"><CircleAlert className="size-4 text-eu-red shrink-0 mt-0.5" aria-hidden />{err}</p>}

      {overview.map((o) => {
        const chosen = sel[o.brandId] ?? [];
        const extras = extra[o.brandId] ?? [];
        const url = (k: string) => `/api/admin/catalog/templates?b=${o.brandId}&g=${chosen.join(",")}&k=${k}`;
        const existingGroups = chosen.filter((g) => o.groups.some((x) => x.groupS1Id === g));
        return (
          <section key={o.brandId} className="rounded-xl border border-eu-line bg-white p-3 @md:p-4 grid gap-3" aria-labelledby={`b-${o.brandId}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id={`b-${o.brandId}`} className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">{o.name}</h3>
              <span className="text-eu-muted text-[length:var(--fs-13)]">{o.products} προϊόντα σε {o.groups.length} {o.groups.length === 1 ? "κατηγορία" : "κατηγορίες"}{o.s1Id ? "" : " · η μάρκα δεν είναι συνδεδεμένη με κατασκευαστή του SoftOne"}</span>
            </div>
            <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Διάλεξε τις κατηγορίες που θα γίνουν φύλλα στο excel. «Χαρακτηριστικά» = στήλες του φύλλου· «με χαρακτηριστικά» = πόσα προϊόντα έχουν ήδη συμπληρωμένα.</p>
            <ul className="m-0 p-0 list-none grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,17rem),1fr))]">
              {[...o.groups.map((g) => ({ id: g.groupS1Id, name: g.name, sub: g.path, stats: g })), ...extras.map((g) => ({ id: g.id, name: g.name, sub: "χωρίς προϊόντα — για νέα", stats: null }))].map((g) => {
                const on = chosen.includes(g.id);
                return (
                  <li key={g.id}>
                    <label className={`flex gap-3 items-start rounded-xl border-2 p-3 cursor-pointer min-h-11 ${on ? "border-eu-blue bg-eu-chip/40" : "border-eu-line hover:border-eu-line-2"}`}>
                      <input type="checkbox" checked={on} onChange={() => toggle(o.brandId, g.id)} className="size-5 mt-0.5 accent-eu-navy shrink-0" />
                      <span className="min-w-0 grid gap-0.5">
                        <span className="font-bold text-eu-ink text-[length:var(--fs-14)] leading-tight">{g.name}</span>
                        <span className="text-eu-muted text-[length:var(--fs-12)] leading-snug">{g.sub}</span>
                        {g.stats && <span className="flex flex-wrap gap-1 mt-1">
                          <span className={`${chip} bg-eu-surface text-eu-ink-3`}>{g.stats.products} προϊόντα</span>
                          <span className={`${chip} bg-eu-surface text-eu-ink-3`}>{g.stats.specCount} χαρακτηριστικά</span>
                          <span className={`${chip} ${g.stats.withSpecs < g.stats.products ? "bg-eu-yellow/30 text-eu-ink" : "bg-eu-green/12 text-eu-ink"}`}>{g.stats.withSpecs}/{g.stats.products} με χαρακτηριστικά</span>
                        </span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <AddGroup groups={groups.filter((g) => !o.groups.some((x) => x.groupS1Id === g.id) && !extras.some((x) => x.id === g.id))} onAdd={(g) => { setExtra((e) => ({ ...e, [o.brandId]: [...(e[o.brandId] ?? []), g] })); setSel((s) => ({ ...s, [o.brandId]: [...(s[o.brandId] ?? []), g.id] })); }} />
            <div className="flex flex-wrap gap-2 border-t border-eu-line pt-3">
              <button type="button" className={primary} disabled={!existingGroups.length || !!busy} onClick={() => download(`/api/admin/catalog/templates?b=${o.brandId}&g=${existingGroups.join(",")}&k=existing`, `${o.brandId}e`)}>
                {busy === `${o.brandId}e` ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />} Υπάρχοντα προϊόντα
              </button>
              <button type="button" className={secondary} disabled={!chosen.length || !!busy} onClick={() => download(url("new"), `${o.brandId}n`)}>
                {busy === `${o.brandId}n` ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />} Κενό για νέα προϊόντα
              </button>
            </div>
          </section>
        );
      })}

      {selection.length > 1 && (
        <div className="sticky bottom-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-eu-navy text-white px-4 py-3 shadow-lg">
          <span className="text-[length:var(--fs-14)]">{selection.length} μάρκες · ένα zip με δύο αρχεία ανά μάρκα (υπάρχοντα + νέα)</span>
          <button type="button" disabled={!!busy} onClick={() => download(`/api/admin/catalog/templates?s=${selection.map((x) => `${x.b}~${x.g.join(".")}`).join("|")}&k=both`, "zip")} className={`${btn} bg-eu-yellow text-eu-navy hover:bg-white`}>
            {busy === "zip" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileArchive className="size-4" aria-hidden />} Όλα σε zip
          </button>
        </div>
      )}
      {busy && <p role="status" className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Το αρχείο φτιάχνεται τώρα με τις τρέχουσες κατηγορίες του SoftOne — λίγα δευτερόλεπτα ανά μάρκα.</p>}
    </div>
  );
}

function AddGroup({ groups, onAdd }: { groups: GroupOpt[]; onAdd: (g: GroupOpt) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = useMemo(() => { const t = q.trim().toLocaleLowerCase("el-GR"); return (t ? groups.filter((g) => g.name.toLocaleLowerCase("el-GR").includes(t)) : groups).slice(0, 10); }, [q, groups]);
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 min-h-11 font-bold text-eu-blue text-[length:var(--fs-14)] hover:underline w-fit"><Plus className="size-4" aria-hidden /> Κατηγορία όπου η μάρκα δεν έχει ακόμη προϊόντα</button>;
  return (
    <div className="grid gap-2 rounded-xl bg-eu-surface p-3">
      <div className="flex gap-2">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση κατηγορίας" aria-label="Αναζήτηση κατηγορίας" className={input} />
        <button type="button" onClick={() => setOpen(false)} aria-label="Κλείσιμο" className="size-11 shrink-0 grid place-items-center rounded-full hover:bg-white"><X className="size-4" aria-hidden /></button>
      </div>
      <ul className="m-0 p-0 list-none flex flex-wrap gap-2">
        {list.map((g) => <li key={g.id}><button type="button" onClick={() => { onAdd(g); setQ(""); }} className="inline-flex items-center gap-1 rounded-full bg-white border border-eu-line px-3 min-h-11 font-bold text-eu-ink text-[length:var(--fs-13)] hover:border-eu-blue"><Plus className="size-3.5" aria-hidden /> {g.name}</button></li>)}
        {!list.length && <li className="text-eu-muted text-[length:var(--fs-13)]">Καμία κατηγορία.</li>}
      </ul>
    </div>
  );
}

// ======================= 2. Εισαγωγή =======================

const ACTION: Record<PlanRow["action"], { label: string; cls: string }> = {
  create: { label: "Νέο", cls: "bg-eu-green/12 text-eu-ink" }, update: { label: "Αλλαγές", cls: "bg-eu-chip text-eu-navy" },
  unchanged: { label: "Χωρίς αλλαγή", cls: "bg-eu-surface text-eu-ink-3" }, error: { label: "Σφάλμα", cls: "bg-eu-red/10 text-eu-red" },
};
const BATCH = 10;

function Import({ brands, canErp, writeOn }: { brands: BrandOpt[]; canErp: boolean; writeOn: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [brandId, setBrandId] = useState("");
  const [toSoftone, setToSoftone] = useState(false);
  const [activate, setActivate] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [filter, setFilter] = useState<PlanRow["action"] | "all">("all");
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ApplyResult>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const erpReason = !canErp ? "Χρειάζονται τα δικαιώματα «Επεξεργασία προϊόντων» και «Εκτέλεση συγχρονισμού ERP»." : !writeOn ? "Η εγγραφή στο SoftOne είναι κλειστή (Ρυθμίσεις → SoftOne)." : null;

  const reset = () => { setPlan(null); setResults({}); setProgress(null); setErr(null); };
  const form = (extra?: Record<string, string>) => {
    const f = new FormData(); f.set("file", file!); f.set("brandId", brandId); f.set("toSoftone", toSoftone ? "1" : "0"); f.set("activate", activate ? "1" : "0");
    for (const [k, v] of Object.entries(extra ?? {})) f.set(k, v);
    return f;
  };
  const check = async () => {
    if (!file) return;
    setChecking(true); reset();
    try {
      const r = await fetch("/api/admin/catalog/import", { method: "POST", body: form() });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Ο έλεγχος απέτυχε.");
      setPlan(j); setFilter(j.counts.error ? "error" : "all");
    } catch (e) { setErr((e as Error).message); } finally { setChecking(false); }
  };
  const todo = plan?.rows.filter((r) => (r.action === "create" || r.action === "update") && !results[r.key]?.ok) ?? [];
  const apply = async () => {
    if (!plan || !todo.length) return;
    const where = toSoftone ? "στο SoftOne ΚΑΙ στο κατάστημα" : "μόνο στο κατάστημα";
    if (!confirm(`Θα γραφτούν ${todo.length} ${todo.length === 1 ? "γραμμή" : "γραμμές"} ${where}${activate ? " — τα νέα θα είναι ενεργά" : ""}. Συνέχεια;`)) return;
    setErr(null); setProgress({ done: 0, total: todo.length });
    const keys = todo.map((r) => r.key);
    for (let i = 0; i < keys.length; i += BATCH) {
      try {
        const r = await fetch("/api/admin/catalog/import", { method: "POST", body: form({ keys: JSON.stringify(keys.slice(i, i + BATCH)) }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Η εισαγωγή σταμάτησε.");
        setResults((prev) => ({ ...prev, ...Object.fromEntries((j.results as ApplyResult[]).map((x) => [x.key, x])) }));
      } catch (e) { setErr(`${(e as Error).message} — όσα έγιναν μέχρι εδώ έμειναν· πάτα ξανά «Εφαρμογή» για τα υπόλοιπα.`); break; }
      setProgress({ done: Math.min(i + BATCH, keys.length), total: keys.length });
    }
  };
  const shown = plan?.rows.filter((r) => filter === "all" || r.action === filter) ?? [];
  const okCount = Object.values(results).filter((r) => r.ok).length, failCount = Object.values(results).filter((r) => !r.ok).length;

  return (
    <div className="grid gap-4">
      <section className="rounded-xl border border-eu-line bg-white p-3 @md:p-4 grid gap-3" aria-labelledby="i-file">
        <div>
          <h3 id="i-file" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Αρχείο</h3>
          <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Ένα template από την καρτέλα «Templates», συμπληρωμένο. Πρώτα γίνεται έλεγχος — τίποτα δεν γράφεται πριν πατήσεις «Εφαρμογή».</p>
        </div>
        <label onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setFile(f); reset(); } }}
          className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed border-eu-line-2 bg-eu-surface/50 p-4 cursor-pointer hover:border-eu-blue">
          <Upload className="size-6 text-eu-blue shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 grid">
            <span className="font-bold text-eu-ink text-[length:var(--fs-15)] break-all">{file ? file.name : "Διάλεξε ή σύρε εδώ ένα .xlsx"}</span>
            <span className="text-eu-muted text-[length:var(--fs-12)]">{file ? `${Math.round(file.size / 1024)} KB` : "Έως 20 MB"}</span>
          </span>
          <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); reset(); } e.target.value = ""; }} />
        </label>
        <div className="grid gap-3 @lg:grid-cols-2">
          <label className="grid gap-1 content-start">
            <span className="text-eu-ink-2 font-bold text-[length:var(--fs-13)]">Μάρκα (μόνο αν το αρχείο δεν είναι δικό μας template)</span>
            <select value={brandId} onChange={(e) => { setBrandId(e.target.value); reset(); }} className={input}>
              <option value="">Από το αρχείο</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <div className="grid gap-2">
            <label className={`flex gap-3 items-start rounded-xl border p-3 ${erpReason ? "border-eu-line bg-eu-surface" : "border-eu-line cursor-pointer"}`}>
              <input type="checkbox" checked={toSoftone} disabled={!!erpReason} onChange={(e) => { setToSoftone(e.target.checked); reset(); }} className="size-5 mt-0.5 accent-eu-navy shrink-0" />
              <span className="grid gap-0.5">
                <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Και στο SoftOne</span>
                <span className="text-eu-muted text-[length:var(--fs-12)] leading-snug">{erpReason ?? "Αλλαγές και νέα είδη γράφονται στο ERP (με έλεγχο ότι δεν άλλαξαν στο μεταξύ και επαλήθευση) και το κατάστημα ενημερώνεται από εκεί. Χωρίς αυτό, αλλάζει μόνο το κατάστημα — και σε προϊόν του SoftOne η αλλαγή χάνεται μόλις αλλάξει το είδος στο ERP."}</span>
              </span>
            </label>
            <label className="flex gap-3 items-start rounded-xl border border-eu-line p-3 cursor-pointer">
              <input type="checkbox" checked={activate} onChange={(e) => { setActivate(e.target.checked); reset(); }} className="size-5 mt-0.5 accent-eu-navy shrink-0" />
              <span className="grid gap-0.5">
                <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Τα νέα προϊόντα ενεργά</span>
                <span className="text-eu-muted text-[length:var(--fs-12)] leading-snug">Αλλιώς μπαίνουν ανενεργά, για να τους προσθέσεις τιμή και φωτογραφίες πριν φανούν στο κατάστημα.</span>
              </span>
            </label>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primary} disabled={!file || checking || !!progress && progress.done < progress.total} onClick={check}>{checking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />} Έλεγχος αρχείου</button>
        </div>
      </section>

      {err && <p role="alert" className="m-0 flex gap-2 items-start rounded-xl bg-eu-red/10 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]"><CircleAlert className="size-4 text-eu-red shrink-0 mt-0.5" aria-hidden />{err}</p>}

      {plan && (
        <section className="rounded-xl border border-eu-line bg-white p-3 @md:p-4 grid gap-3" aria-labelledby="i-plan">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="i-plan" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Τι θα γίνει{plan.brand ? ` · ${plan.brand.name}` : ""}</h3>
            <span className="text-eu-muted text-[length:var(--fs-13)]">{plan.rows.length} γραμμές · {toSoftone ? "SoftOne + κατάστημα" : "μόνο κατάστημα"}</span>
          </div>
          {plan.warnings.length > 0 && <ul className="m-0 p-0 list-none grid gap-1">{plan.warnings.map((w, i) => <li key={i} className="flex gap-2 items-start rounded-lg bg-eu-yellow/20 px-3 py-2 text-eu-ink text-[length:var(--fs-13)]"><AlertTriangle className="size-4 text-eu-navy shrink-0 mt-0.5" aria-hidden />{w}</li>)}</ul>}
          <div role="tablist" aria-label="Φίλτρο γραμμών" className="flex flex-wrap gap-2">
            {(["all", "create", "update", "error", "unchanged"] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`${btn} px-3 ${filter === k ? "bg-eu-navy text-white" : "bg-eu-surface text-eu-ink-2 hover:bg-eu-chip"}`}>
                {k === "all" ? "Όλες" : ACTION[k].label} <span className="tabular-nums opacity-80">{k === "all" ? plan.rows.length : plan.counts[k]}</span>
              </button>
            ))}
          </div>
          <ul className="m-0 p-0 list-none grid gap-2">
            {shown.slice(0, 300).map((r) => { const res = results[r.key]; return (
              <li key={r.key} className={`rounded-xl border p-3 grid gap-1.5 min-w-0 ${res ? (res.ok ? "border-eu-green/50" : "border-eu-red/50") : "border-eu-line"}`}>
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span className={`${chip} ${ACTION[r.action].cls}`}>{ACTION[r.action].label}</span>
                  <span className="font-bold text-eu-ink text-[length:var(--fs-14)] min-w-0 break-words">{r.title || "—"}</span>
                  <span className="text-eu-muted text-[length:var(--fs-12)]">{r.group} · γραμμή {r.rowNo}{r.mtrl ? ` · MTRL ${r.mtrl}` : ""}{r.code ? ` · ${r.code}` : ""}</span>
                </div>
                {r.changes.length > 0 && r.action !== "error" && (
                  <ul className="m-0 p-0 list-none grid gap-0.5 text-[length:var(--fs-13)]">
                    {r.changes.slice(0, 12).map((c, i) => <li key={i} className="break-words"><span className="text-eu-ink-3">{c.label}:</span> {r.action === "update" && <><s className="text-eu-muted">{c.from}</s> → </>}<strong className="text-eu-ink">{c.to}</strong></li>)}
                    {r.changes.length > 12 && <li className="text-eu-muted">+{r.changes.length - 12} ακόμη</li>}
                  </ul>
                )}
                {r.errors.map((e, i) => <p key={i} className="m-0 flex gap-1.5 items-start text-eu-red text-[length:var(--fs-13)]"><CircleAlert className="size-3.5 shrink-0 mt-0.5" aria-hidden />{e}</p>)}
                {r.warnings.map((w, i) => <p key={i} className="m-0 flex gap-1.5 items-start text-eu-ink-3 text-[length:var(--fs-13)]"><AlertTriangle className="size-3.5 shrink-0 mt-0.5" aria-hidden />{w}</p>)}
                {res && <p className={`m-0 flex gap-1.5 items-start text-[length:var(--fs-13)] ${res.ok ? "text-eu-ink" : "text-eu-red"}`}>{res.ok ? <Check className="size-3.5 text-eu-green shrink-0 mt-0.5" aria-hidden /> : <CircleAlert className="size-3.5 shrink-0 mt-0.5" aria-hidden />}{res.message}</p>}
              </li>
            ); })}
            {shown.length > 300 && <li className="text-eu-muted text-[length:var(--fs-13)]">Εμφανίζονται οι πρώτες 300 από {shown.length}.</li>}
            {!shown.length && <li className="text-eu-muted text-[length:var(--fs-14)]">Καμία γραμμή σε αυτό το φίλτρο.</li>}
          </ul>
          <div className="sticky bottom-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-eu-navy text-white px-4 py-3 shadow-lg">
            <span className="text-[length:var(--fs-14)]">
              {progress ? `${progress.done}/${progress.total} · ${okCount} έγιναν${failCount ? ` · ${failCount} απέτυχαν` : ""}` : `${plan.counts.create} νέα · ${plan.counts.update} με αλλαγές${plan.counts.error ? ` · ${plan.counts.error} με σφάλμα (δεν περνούν)` : ""}`}
            </span>
            <button type="button" onClick={apply} disabled={!todo.length || (!!progress && progress.done < progress.total)} className={`${btn} bg-eu-yellow text-eu-navy hover:bg-white`}>
              {progress && progress.done < progress.total ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Εφαρμογή {todo.length || ""}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
