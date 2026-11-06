"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, FileUp, Loader2, Save, Search, Trash2, Undo2, Zap } from "lucide-react";
import { importAsapSkusAction, previewAsapAction, saveAsapRulesAction } from "./actions";
import type { ShipCat } from "./ShippingRules";

type Rules = { on: boolean; atticaZips: string; zones: string[]; maxItems: number; categories: Record<string, boolean>; skus: Record<string, boolean> };
const norm = (s: string) => s.toLocaleLowerCase("el-GR").normalize("NFD").replace(/[̀-ͯ]/g, "");
const num = (n: number) => n.toLocaleString("el-GR");

/**
 * ASAP Express στην Αττική: ποιες κατηγορίες / SKU φεύγουν με ASAP, σε ποιους ΤΚ και ζώνες ισχύει, έως πόσα τεμάχια.
 * Η πιο ειδική κατηγορία κερδίζει· οι εξαιρέσεις SKU κερδίζουν τις κατηγορίες. Τίποτα δεν ισχύει πριν την «Αποθήκευση».
 */
export function AsapExpress({ cats, initial, asapReady, canWrite }: { cats: ShipCat[]; initial: Rules; asapReady: boolean; canWrite: boolean }) {
  const router = useRouter();
  const [r, setR] = useState<Rules>(initial);
  const [zonesText, setZonesText] = useState(initial.zones.join(", "));
  const [q, setQ] = useState("");
  const [newSku, setNewSku] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [stats, setStats] = useState<{ eligible: number; noDims: number; total: number } | null>(null);
  const [saving, startSave] = useTransition();
  const [importing, startImport] = useTransition();
  const [calc, startCalc] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const rules = useMemo(() => ({ ...r, zones: zonesText.split(",").map((z) => z.trim()).filter(Boolean) }), [r, zonesText]);
  const dirty = JSON.stringify(rules) !== JSON.stringify(initial);

  useEffect(() => {
    const t = setTimeout(() => startCalc(async () => setStats(await previewAsapAction({ categories: rules.categories, skus: rules.skus }))), 400);
    return () => clearTimeout(t);
  }, [rules.categories, rules.skus]);

  const bySlug = useMemo(() => new Map(cats.map((c) => [c.slug, c])), [cats]);
  /** η απόφαση για μια κατηγορία και από πού έρχεται (η ίδια ή γονική) */
  const effective = (c: ShipCat): { on: boolean; from: string | null } => {
    for (let x: ShipCat | undefined = c; x; x = x.parent ? bySlug.get(x.parent) : undefined) if (x.slug in r.categories) return { on: r.categories[x.slug], from: x.slug === c.slug ? null : x.name };
    return { on: false, from: null };
  };
  const setCat = (slug: string, v: boolean | null) => setR((x) => { const categories = { ...x.categories }; if (v === null) delete categories[slug]; else categories[slug] = v; return { ...x, categories }; });
  const shown = useMemo(() => { const t = norm(q.trim()); return t ? cats.filter((c) => norm(c.path).includes(t)) : cats; }, [cats, q]);
  const skuList = Object.entries(r.skus).sort(([a], [b]) => a.localeCompare(b));

  const save = () => startSave(async () => {
    const res = await saveAsapRulesAction(rules);
    setMsg(res.ok ? { ok: true, text: "Αποθηκεύτηκε — ισχύει σε 1 λεπτό στο checkout." } : { ok: false, text: "Δεν αποθηκεύτηκε." });
    router.refresh();
  });
  const importFile = (file: File) => startImport(async () => {
    const fd = new FormData(); fd.set("file", file);
    const res = await importAsapSkusAction(fd);
    if (!res.ok) { setMsg({ ok: false, text: res.error }); return; }
    setR((x) => ({ ...x, skus: { ...x.skus, ...res.skus } }));
    const n = Object.keys(res.skus).length;
    setMsg({ ok: true, text: `Διαβάστηκαν ${num(n)} SKU${res.unknownCount ? ` · ${num(res.unknownCount)} άγνωστα (π.χ. ${res.unknown.slice(0, 5).join(", ")})` : ""}${res.skipped ? ` · ${num(res.skipped)} γραμμές χωρίς ☑/☐` : ""}. Πάτα «Αποθήκευση» για να ισχύσουν.` });
    if (fileRef.current) fileRef.current.value = "";
  });

  const field = "rounded-lg border-2 border-eu-line bg-white px-3 min-h-11 text-[length:var(--fs-14)] w-full outline-none focus-visible:border-eu-blue disabled:bg-eu-surface";
  return (
    <section data-help="ship.asap" aria-labelledby="asap-h" className="rounded-xl border border-eu-line bg-white p-3 @md:p-4 grid gap-3 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-0.5 min-w-0">
          <h2 id="asap-h" className="m-0 inline-flex items-center gap-2 font-bold text-eu-ink text-[length:var(--fs-17)]"><Zap className="size-5 text-eu-blue" aria-hidden /> ASAP Express στην Αττική</h2>
          <p className="m-0 text-eu-muted text-[length:var(--fs-13)] leading-snug">Στην Αττική ο πελάτης βλέπει «Κανονική παράδοση euronics» (δωρεάν) και, όταν το επιτρέπει το καλάθι, «ASAP Express» με τιμή από το συμβόλαιο ASAP (Next Day). Εκτός Αττικής: οι couriers όπως πριν, χωρίς ASAP.</p>
        </div>
        <label data-help="ship.asap.on" className={`inline-flex items-center gap-2 rounded-full px-3 min-h-11 font-bold text-[length:var(--fs-14)] ${r.on ? "bg-eu-green/10 text-eu-green" : "bg-eu-surface text-eu-ink-2"} ${canWrite ? "cursor-pointer" : ""}`}>
          <input type="checkbox" checked={r.on} disabled={!canWrite} onChange={(e) => setR((x) => ({ ...x, on: e.target.checked }))} className="size-[18px] accent-eu-green" />
          {r.on ? "Ενεργό στο checkout" : "Κλειστό (checkout όπως πριν)"}
        </label>
      </div>
      {r.on && !asapReady && <p role="alert" className="m-0 inline-flex items-start gap-1.5 rounded-lg bg-eu-amber/15 px-3 py-2 text-eu-ink-2 text-[length:var(--fs-13)]"><CircleAlert className="size-4 mt-px shrink-0" aria-hidden />Λείπουν τα στοιχεία ASAP στις Ρυθμίσεις: η κανονική παράδοση δουλεύει, το Express δεν θα εμφανίζεται.</p>}

      <div className="grid grid-cols-1 @2xl:grid-cols-3 gap-3">
        <label data-help="ship.asap.zips" className="grid gap-1 text-[length:var(--fs-13)] font-bold text-eu-ink-2">
          ΤΚ Αττικής
          <textarea rows={2} value={r.atticaZips} disabled={!canWrite} onChange={(e) => setR((x) => ({ ...x, atticaZips: e.target.value }))} className={`${field} py-2 font-mono`} />
          <span className="font-normal text-eu-muted">Εύρη ή ΤΚ, ένα ανά γραμμή ή με κόμμα (π.χ. 10000-19999).</span>
        </label>
        <label data-help="ship.asap.zones" className="grid gap-1 text-[length:var(--fs-13)] font-bold text-eu-ink-2">
          Ζώνες ASAP με Express
          <input value={zonesText} disabled={!canWrite} onChange={(e) => setZonesText(e.target.value)} className={field} />
          <span className="font-normal text-eu-muted">Όπως τις ονομάζει ο τιμοκατάλογος της ASAP, με κόμμα. Εκτός αυτών (π.χ. «Χερσαίο») δεν προσφέρεται Express.</span>
        </label>
        <label className="grid gap-1 text-[length:var(--fs-13)] font-bold text-eu-ink-2">
          Έως τεμάχια στο καλάθι
          <input type="number" min={1} max={20} value={r.maxItems} disabled={!canWrite} onChange={(e) => setR((x) => ({ ...x, maxItems: Math.max(1, Math.min(20, Number(e.target.value) || 1)) }))} className={field} />
          <span className="font-normal text-eu-muted">Επίσης: όλα διαθέσιμα, με γνωστό βάρος και διαστάσεις. Τιμή για το προϊόν με τον μεγαλύτερο όγκο.</span>
        </label>
      </div>

      <div data-help="ship.asap.stats" aria-live="polite" className="flex flex-wrap items-center gap-2 text-[length:var(--fs-13)]">
        {calc && <Loader2 className="size-4 animate-spin text-eu-muted" aria-hidden />}
        {stats && <>
          <span className="rounded-full bg-eu-green/10 text-eu-green font-bold px-2.5 h-8 inline-flex items-center">{num(stats.eligible)} από {num(stats.total)} ενεργά προϊόντα επιλέξιμα</span>
          {stats.noDims > 0 && <span className="rounded-full bg-eu-amber/20 text-eu-ink font-bold px-2.5 h-8 inline-flex items-center" title="Χωρίς βάρος ή διαστάσεις στο ERP δεν προσφέρεται Express">{num(stats.noDims)} από αυτά χωρίς βάρος ή διαστάσεις</span>}
        </>}
      </div>

      <div data-help="ship.asap.categories" className="grid gap-2 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="m-0 font-bold text-eu-ink text-[length:var(--fs-15)]">Κατηγορίες</h3>
          <label className="relative flex-1 min-w-[12rem] max-w-sm">
            <span className="sr-only">Αναζήτηση κατηγορίας</span>
            <Search className="size-4 text-eu-muted absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση, π.χ. «ηχεία»" className={`${field} pl-9`} />
          </label>
        </div>
        <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Η πιο ειδική κατηγορία κερδίζει. «—» = ακολουθεί τη γονική (χωρίς τιμή πουθενά = όχι).</p>
        <ul className="m-0 p-0 list-none grid max-h-[28rem] overflow-y-auto rounded-lg border border-eu-line divide-y divide-eu-line">
          {shown.map((c) => {
            const e = effective(c), own = c.slug in r.categories ? r.categories[c.slug] : null;
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5" style={{ paddingLeft: q ? undefined : `${0.75 + c.depth * 1.1}rem` }}>
                <span className="min-w-0 flex-1 basis-48">
                  <span className={`block text-[length:var(--fs-14)] ${c.depth === 0 ? "font-bold text-eu-ink" : "text-eu-ink-2"}`}>{q ? c.path : c.name} <span className="text-eu-muted">· {num(c.count)}</span></span>
                  {own === null && e.from && <span className="block text-eu-muted text-[length:var(--fs-12)]">{e.on ? "Ναι" : "Όχι"} από «{e.from}»</span>}
                </span>
                <span role="radiogroup" aria-label={`ASAP για ${c.name}`} className="inline-flex rounded-full border border-eu-line overflow-hidden">
                  {([[true, "Ναι"], [false, "Όχι"], [null, "—"]] as const).map(([v, t]) => (
                    <button key={t} type="button" role="radio" aria-checked={own === v} disabled={!canWrite} onClick={() => setCat(c.slug, v)}
                      className={`px-3 min-h-9 min-w-11 text-[length:var(--fs-13)] font-bold ${own === v ? (v === true ? "bg-eu-green text-white" : v === false ? "bg-eu-ink-2 text-white" : "bg-eu-surface text-eu-ink") : "bg-white text-eu-muted hover:text-eu-ink"}`}>{t}</button>
                  ))}
                </span>
              </li>
            );
          })}
          {!shown.length && <li className="px-3 py-3 text-eu-muted text-[length:var(--fs-14)]">Καμία κατηγορία.</li>}
        </ul>
      </div>

      <div data-help="ship.asap.skus" className="grid gap-2 min-w-0">
        <h3 className="m-0 font-bold text-eu-ink text-[length:var(--fs-15)]">Εξαιρέσεις ανά SKU <span className="font-normal text-eu-muted">· κερδίζουν την κατηγορία</span></h3>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <input value={newSku} onChange={(e) => setNewSku(e.target.value)} placeholder="SKU" aria-label="SKU" className={`${field} max-w-48 font-mono`} />
            <button type="button" disabled={!newSku.trim()} onClick={() => { setR((x) => ({ ...x, skus: { ...x.skus, [newSku.trim()]: true } })); setNewSku(""); }} className="rounded-lg border-2 border-eu-line bg-white px-3 min-h-11 font-bold text-[length:var(--fs-14)] hover:border-eu-blue disabled:opacity-50">Προσθήκη</button>
            <label className={`inline-flex items-center gap-1.5 rounded-lg bg-eu-navy text-white px-3 min-h-11 font-bold text-[length:var(--fs-14)] ${importing ? "opacity-60" : "cursor-pointer hover:bg-eu-blue"}`}>
              {importing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileUp className="size-4" aria-hidden />} Εισαγωγή από Excel / CSV
              <input ref={fileRef} type="file" accept=".xlsx,.csv" className="sr-only" disabled={importing} onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
            </label>
            <span className="self-center text-eu-muted text-[length:var(--fs-13)]">Στήλες «SKU» και «ASAP» (☑ / ☐, Ναι / Όχι, 1 / 0).</span>
          </div>
        )}
        {skuList.length ? (
          <ul className="m-0 p-0 list-none grid max-h-64 overflow-y-auto rounded-lg border border-eu-line divide-y divide-eu-line">
            {skuList.map(([sku, on]) => (
              <li key={sku} className="flex items-center gap-3 px-3 py-1.5">
                <span className="flex-1 min-w-0 font-mono text-[length:var(--fs-14)] break-all">{sku}</span>
                <button type="button" disabled={!canWrite} onClick={() => setR((x) => ({ ...x, skus: { ...x.skus, [sku]: !on } }))} className={`rounded-full px-3 min-h-9 font-bold text-[length:var(--fs-13)] ${on ? "bg-eu-green text-white" : "bg-eu-ink-2 text-white"}`}>{on ? "Ναι" : "Όχι"}</button>
                {canWrite && <button type="button" aria-label={`Αφαίρεση ${sku}`} onClick={() => setR((x) => { const skus = { ...x.skus }; delete skus[sku]; return { ...x, skus }; })} className="size-9 grid place-items-center rounded-full text-eu-muted hover:text-eu-red hover:bg-eu-surface"><Trash2 className="size-4" aria-hidden /></button>}
              </li>
            ))}
          </ul>
        ) : <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Καμία εξαίρεση.</p>}
      </div>

      {canWrite && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={save} disabled={!dirty || saving} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-bold px-4 min-h-11 text-[length:var(--fs-14)] hover:bg-eu-blue disabled:opacity-50">{saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />} Αποθήκευση</button>
          {dirty && <button type="button" onClick={() => { setR(initial); setZonesText(initial.zones.join(", ")); setMsg(null); }} className="inline-flex items-center gap-1.5 rounded-full px-3 min-h-11 font-bold text-eu-ink-2 text-[length:var(--fs-14)] hover:bg-eu-surface"><Undo2 className="size-4" aria-hidden /> Αναίρεση</button>}
          {msg && <span role="status" className={`inline-flex items-center gap-1.5 text-[length:var(--fs-13)] font-semibold ${msg.ok ? "text-eu-green" : "text-eu-red"}`}>{msg.ok ? <Check className="size-4" aria-hidden /> : <CircleAlert className="size-4" aria-hidden />}{msg.text}</span>}
        </div>
      )}
    </section>
  );
}
