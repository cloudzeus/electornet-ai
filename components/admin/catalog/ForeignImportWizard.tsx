"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, BookmarkCheck, Check, CircleAlert, Clock, FileSpreadsheet, Images, Loader2, Play, Upload } from "lucide-react";
import { suggestTarget, configForHeaders, type MappingConfig, type Target } from "@/lib/catalog/foreign-import/core";
import { encodeTarget, decodeTarget, valuesAfter, autoMatch, PREVIEW_ROWS, type InspectSheet, type SavedMappingRef } from "@/lib/catalog/foreign-import/ui-core";
import type { ForeignPlanRow, RowStatus } from "@/lib/catalog/foreign-import/plan-core";
import { lookupMapping, runForeignBatch } from "@/app/admin/(shell)/catalog/templates/import/actions";
import { OptionPicker, type PickOpt } from "@/components/admin/catalog/OptionPicker";

type Brand = { id: string; name: string; s1: boolean };
type Category = { id: string; name: string; path: string };
type Plan = { jobId: string; rows: ForeignPlanRow[]; writeOn: boolean };
type Step = 1 | 2 | 3 | 4;

const btn = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-14)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const primary = `${btn} bg-eu-navy text-white hover:bg-eu-blue`;
const secondary = `${btn} border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`;
const input = "w-full min-w-0 rounded-lg border border-eu-line bg-white px-3 min-h-11 md:min-h-9 text-[length:var(--fs-14)] focus-visible:outline-2 focus-visible:outline-eu-blue";
const chip = "rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-12)] tabular-nums";
const card = "rounded-xl border border-eu-line bg-white p-3 md:p-4 grid gap-3 min-w-0";
const BATCH = 50;
const PAGE = 100;
const eur = new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" });
const colName = (i: number) => { let s = "", n = i + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

/** Οι στόχοι μιας στήλης, με μία γραμμή εξήγησης ο καθένας (φαίνεται κάτω από την επιλογή). */
const TARGETS: { group: string; items: { value: string; label: string; help: string }[] }[] = [
  { group: "Πεδία είδους", items: [
    { value: "field:code", label: "Κωδικός είδους", help: "Ο δικός μας κωδικός στο SoftOne — βρίσκει το είδος. Στα νέα είδη γίνεται ο κωδικός τους." },
    { value: "field:mtrl", label: "MTRL (αριθμός SoftOne)", help: "Μόνο σε αρχεία που βγήκαν από εμάς — βρίσκει το είδος με σιγουριά." },
    { value: "field:name", label: "Όνομα", help: "Μπαίνει μόνο αν το είδος δεν έχει όνομα· στα νέα είναι το όνομά τους." },
    { value: "field:barcode", label: "EAN / barcode", help: "Βρίσκει το είδος από το barcode· γράφεται μόνο αν λείπει." },
    { value: "field:factoryCode", label: "Κωδικός κατασκευαστή", help: "Μοντέλο / part number — μαζί με τη μάρκα βρίσκει το είδος." },
    { value: "field:shortDesc", label: "Σύντομη περιγραφή", help: "Μία–δύο προτάσεις για τη λίστα προϊόντων· μόνο αν λείπει." },
    { value: "field:descText", label: "Αναλυτική περιγραφή", help: "Κείμενο της σελίδας προϊόντος — μπαίνει μόνο αν το είδος δεν έχει ήδη κείμενο." },
    { value: "field:guaranteeMonths", label: "Εγγύηση (μήνες)", help: "Ακέραιος αριθμός μηνών· μόνο αν λείπει." },
    { value: "field:widthCm", label: "Πλάτος (εκ.)", help: "Διάσταση σε εκατοστά· μόνο αν λείπει." },
    { value: "field:heightCm", label: "Ύψος (εκ.)", help: "Διάσταση σε εκατοστά· μόνο αν λείπει." },
    { value: "field:lengthCm", label: "Βάθος (εκ.)", help: "Διάσταση σε εκατοστά· μόνο αν λείπει." },
    { value: "field:weightKg", label: "Βάρος (kg)", help: "Καθαρό βάρος σε κιλά· μόνο αν λείπει." },
  ] },
  { group: "Χαρακτηριστικά & πολυμέσα", items: [
    { value: "spec", label: "Χαρακτηριστικό", help: "Γίνεται χαρακτηριστικό με την ετικέτα που γράφεις — μόνο αν υπάρχει στην ομάδα του είδους και δεν έχει ήδη τιμή." },
    { value: "media:image", label: "Φωτογραφίες (διευθύνσεις)", help: "URL φωτογραφιών: κατεβαίνουν και προστίθενται στο προϊόν (δεν αντικαθιστούν τις υπάρχουσες)." },
    { value: "media:banner", label: "Banners (διευθύνσεις)", help: "URL banners: προστίθενται στο προϊόν." },
    { value: "media:video", label: "Βίντεο (διευθύνσεις)", help: "URL βίντεο: προστίθενται στο προϊόν." },
  ] },
  { group: "Ταξινόμηση", items: [
    { value: "brand", label: "Μάρκα", help: "Κάθε τιμή της στήλης αντιστοιχίζεται σε δική μας μάρκα στο βήμα 3." },
    { value: "category", label: "Κατηγορία", help: "Κάθε τιμή αντιστοιχίζεται σε κατηγορία μας στο βήμα 3 — δίνει ομάδα χαρακτηριστικών στα νέα και κανόνα τιμής." },
  ] },
  { group: "Τιμές", items: [
    { value: "cost", label: "Κόστος (χωρίς ΦΠΑ)", help: "Με τον κανόνα τιμολόγησης βγάζει την τιμή web — μόνο όπου το είδος δεν έχει τιμή." },
    { value: "rrp", label: "Προτεινόμενη λιανική", help: "Πλαφόν: η τιμή από τον κανόνα δεν την ξεπερνά." },
  ] },
  { group: "Άλλο", items: [{ value: "ignore", label: "Αγνόηση", help: "Η στήλη δεν χρησιμοποιείται." }] },
];
const TARGET_OF = new Map(TARGETS.flatMap((g) => g.items).map((t) => [t.value, t]));
const KEY_TARGETS = new Set(["field:code", "field:mtrl", "field:barcode", "field:factoryCode"]);

const STATUS: Record<RowStatus, { label: string; cls: string }> = {
  update: { label: "Ενημέρωση", cls: "bg-eu-chip text-eu-navy" },
  unchanged: { label: "Χωρίς αλλαγή", cls: "bg-eu-surface text-eu-ink-3" },
  new: { label: "Νέο είδος", cls: "bg-eu-green/12 text-eu-ink" },
  waiting: { label: "Σε αναμονή", cls: "bg-eu-yellow/30 text-eu-ink" },
  problem: { label: "Πρόβλημα", cls: "bg-eu-red/10 text-eu-red" },
};
const STATUS_ORDER: RowStatus[] = ["update", "new", "waiting", "unchanged", "problem"];
// Τι σημαίνει μια γραμμή που εκτελέστηκε χωρίς σφάλμα, ανά κατάσταση (ίδια λογική με το applyForeign)
const DONE_TEXT: Record<RowStatus, string> = {
  update: "Έγινε.", new: "Μπήκε στη λίστα «Νέα είδη» για έγκριση.", waiting: "Σε αναμονή: τα στοιχεία θα γραφτούν όταν ανοίξουν οι αλλαγές προς το SoftOne (οι φωτογραφίες πέρασαν).",
  unchanged: "Τίποτα να γίνει.", problem: "",
};

/** Οδηγός εισαγωγής από ξένο Excel: 1 αρχείο · 2 στήλες · 3 τιμές μάρκας/κατηγορίας · 4 προεπισκόπηση & εκτέλεση. */
export function ForeignImportWizard({ brands, categories, writeOn, canSync }: { brands: Brand[]; categories: Category[]; writeOn: boolean; canSync: boolean }) {
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<InspectSheet[] | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [saved, setSaved] = useState<SavedMappingRef | null>(null);
  const [usedMapping, setUsedMapping] = useState<SavedMappingRef | null>(null);
  const [cols, setCols] = useState<Record<number, string>>({});
  const [labels, setLabels] = useState<Record<number, string>>({});
  const [sheetBrandId, setSheetBrandId] = useState<string | null>(null);
  const [sheetCategoryId, setSheetCategoryId] = useState<string | null>(null);
  const [saveAs, setSaveAs] = useState("");
  const [brandMap, setBrandMap] = useState<Record<string, string | null>>({});
  const [categoryMap, setCategoryMap] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState<"inspect" | "plan" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const lookupSeq = useRef(0);

  const sheet = sheets?.[sheetIdx] ?? null;
  const headers = useMemo(() => sheet?.preview[headerRow] ?? [], [sheet, headerRow]);
  const brandOpts: PickOpt[] = useMemo(() => brands.map((b) => ({ id: b.id, name: b.name, hint: b.s1 ? undefined : "χωρίς σύνδεση με SoftOne" })), [brands]);
  const catOpts: PickOpt[] = useMemo(() => categories.map((c) => ({ id: c.id, name: c.path })), [categories]);

  /** Κάθε αλλαγή σε βήματα 1–3 ακυρώνει την προεπισκόπηση (θέλει νέο έλεγχο). */
  const touch = () => { if (plan) setPlan(null); };

  /** Στόχοι στηλών: από αποθηκευμένη αντιστοίχιση ή πρόταση ανά επικεφαλίδα. */
  const initColumns = (sh: InspectSheet, hr: number, m: SavedMappingRef | null) => {
    const hs = sh.preview[hr] ?? [];
    const cfg = m ? configForHeaders(m.config, hs) : null;
    const next: Record<number, string> = {}, lbl: Record<number, string> = {};
    for (let i = 0; i < sh.cols.length; i++) {
      const t: Target = cfg ? cfg.columns[i] ?? { kind: "ignore" } : suggestTarget(hs[i] ?? "");
      next[i] = encodeTarget(t);
      lbl[i] = t.kind === "spec" ? t.label : (hs[i] ?? "").trim();
    }
    setCols(next); setLabels(lbl);
    setBrandMap(cfg?.brandMap ?? {}); setCategoryMap(cfg?.categoryMap ?? {});
    setSheetBrandId(cfg?.sheetBrandId ?? null); setSheetCategoryId(cfg?.sheetCategoryId ?? null);
    setUsedMapping(m);
    touch();
  };
  /** Νέο φύλλο / νέα γραμμή επικεφαλίδας: προτάσεις από την αρχή και αναζήτηση αποθηκευμένης αντιστοίχισης. */
  const choose = (sh: InspectSheet, idx: number, hr: number, known?: SavedMappingRef | null) => {
    setSheetIdx(idx); setHeaderRow(hr); setSaved(known ?? null); initColumns(sh, hr, null);
    if (known !== undefined) return;
    const seq = ++lookupSeq.current;
    lookupMapping(sh.preview[hr] ?? []).then((m) => { if (seq === lookupSeq.current) setSaved(m); }).catch(() => {});
  };

  const inspect = async (f: File) => {
    setFile(f); setSheets(null); setPlan(null); setErr(null); setBusy("inspect"); setStep(1); setSaveAs("");
    try {
      const body = new FormData(); body.set("file", f);
      const r = await fetch("/api/admin/catalog/foreign-import/inspect", { method: "POST", body });
      const j = await r.json().catch(() => ({ error: "Ο έλεγχος του αρχείου απέτυχε." }));
      if (!r.ok) throw new Error(j.error ?? "Ο έλεγχος του αρχείου απέτυχε.");
      const list = j.sheets as InspectSheet[];
      setSheets(list);
      const first = list.reduce((best, s, i) => (s.rowCount > list[best].rowCount ? i : best), 0); // το φύλλο με τις περισσότερες γραμμές
      choose(list[first], first, list[first].headerRow, list[first].mapping);
    } catch (e) { setErr((e as Error).message); setFile(null); } finally { setBusy(null); }
  };

  // ---- βήμα 3: τιμές μάρκας / κατηγορίας ----
  const colsOf = (v: string) => Object.entries(cols).filter(([, t]) => t === v).map(([i]) => Number(i));
  const valuesOf = (v: string) => {
    let many = false;
    const set = new Set<string>();
    for (const i of colsOf(v)) { const l = valuesAfter(sheet?.cols[i], headerRow); if (l == null) many = true; else l.forEach((x) => set.add(x)); }
    return { values: [...set].sort((a, b) => a.localeCompare(b, "el")), many };
  };
  const brandVals = valuesOf("brand"), catVals = valuesOf("category");
  const goValues = () => {
    // Αυτόματη αντιστοίχιση μόνο για τιμές που δεν έχουν ήδη επιλογή (π.χ. από αποθηκευμένη αντιστοίχιση)
    const bm = autoMatch(brandVals.values.filter((v) => !(v in brandMap)), brands);
    const cm = autoMatch(catVals.values.filter((v) => !(v in categoryMap)), categories);
    if (Object.keys(bm).length) setBrandMap((m) => ({ ...bm, ...m }));
    if (Object.keys(cm).length) setCategoryMap((m) => ({ ...cm, ...m }));
    setStep(3);
  };

  const specMissing = Object.entries(cols).some(([i, t]) => t === "spec" && !(labels[Number(i)] ?? "").trim());
  const mapped = Object.values(cols).filter((t) => t !== "ignore").length;
  const hasKey = Object.values(cols).some((t) => KEY_TARGETS.has(t));
  const config = (): MappingConfig => {
    const columns: Record<number, Target> = {};
    for (const [i, t] of Object.entries(cols)) if (t !== "ignore") columns[Number(i)] = decodeTarget(t, (labels[Number(i)] ?? "").trim());
    const pick = (m: Record<string, string | null>, vals: string[]) => Object.fromEntries(vals.map((v) => [v, m[v] ?? null]));
    return { columns, brandMap: pick(brandMap, brandVals.values), categoryMap: pick(categoryMap, catVals.values), sheetBrandId, sheetCategoryId };
  };

  const preview = async () => {
    if (!file || !sheet) return;
    setBusy("plan"); setErr(null); setPlan(null);
    try {
      const body = new FormData();
      body.set("file", file); body.set("sheet", sheet.name); body.set("headerRow", String(headerRow)); body.set("config", JSON.stringify(config()));
      if (saveAs.trim()) body.set("saveAs", saveAs.trim());
      if (usedMapping) body.set("mappingId", usedMapping.id);
      const r = await fetch("/api/admin/catalog/foreign-import/plan", { method: "POST", body });
      const j = await r.json().catch(() => ({ error: "Η προεπισκόπηση απέτυχε." }));
      if (!r.ok) throw new Error(j.error ?? "Η προεπισκόπηση απέτυχε.");
      setPlan({ jobId: j.jobId, rows: j.rows, writeOn: j.writeOn });
      // Μόλις αποθηκεύτηκε: ξαναδιαβάζεται, ώστε να φαίνεται ως η αντιστοίχιση σε χρήση
      if (saveAs.trim()) { setSaveAs(""); lookupMapping(headers).then((m) => { if (m) { setSaved(m); setUsedMapping(m); } }).catch(() => {}); }
      setStep(4);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };

  // Στο βήμα 3 μπαίνεις μόνο μέσω goValues (αυτόματη προεπιλογή) και μόνο με έγκυρες στήλες· το 4 θέλει προεπισκόπηση
  const colsOk = mapped > 0 && !specMissing;
  const can = (s: Step) => s === 1 || (!!sheet && (s === 2 || (colsOk && (s === 3 || !!plan))));
  const STEPS: [Step, string][] = [[1, "Αρχείο"], [2, "Στήλες"], [3, "Τιμές"], [4, "Προεπισκόπηση"]];

  return (
    <div className="grid gap-4 min-w-0">
      <ol data-help="foreign.steps" aria-label="Βήματα" className="m-0 p-0 list-none grid grid-cols-2 sm:grid-cols-4 gap-2">
        {STEPS.map(([n, l]) => (
          <li key={n}><button type="button" disabled={!can(n) || !!busy} onClick={() => (n === 3 ? goValues() : setStep(n))} aria-current={step === n ? "step" : undefined}
            className={`w-full flex items-center gap-2 rounded-xl border-2 px-3 min-h-11 md:min-h-9 text-left font-bold text-[length:var(--fs-14)] disabled:opacity-50 disabled:cursor-not-allowed ${step === n ? "border-eu-navy bg-eu-navy text-white" : n < step ? "border-eu-blue/40 bg-eu-chip/40 text-eu-navy" : "border-eu-line bg-white text-eu-ink-3"}`}>
            <span className={`grid place-items-center size-6 shrink-0 rounded-full text-[length:var(--fs-12)] ${step === n ? "bg-white text-eu-navy" : "bg-eu-surface text-eu-ink-2"}`}>{n < step ? <Check className="size-3.5" aria-hidden /> : n}</span>{l}
          </button></li>
        ))}
      </ol>

      {err && <p role="alert" className="m-0 flex gap-2 items-start rounded-xl bg-eu-red/10 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]"><CircleAlert className="size-4 text-eu-red shrink-0 mt-0.5" aria-hidden /><span className="min-w-0 [overflow-wrap:anywhere]">{err}</span></p>}

      {step === 1 && (
        <>
          <section data-help="foreign.upload" className={card} aria-labelledby="f-file">
            <div>
              <h3 id="f-file" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">1. Αρχείο</h3>
              <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">.xlsx ή .csv (με ; , ή tab), έως 15 MB και 10.000 γραμμές. Τίποτα δεν γράφεται πριν πατήσεις «Εκτέλεση» στο τελευταίο βήμα. {writeOn ? "Οι αλλαγές προς το SoftOne είναι ανοιχτές: τα κενά στοιχεία των υπαρχόντων ειδών θα γραφτούν στο ERP." : "Οι αλλαγές προς το SoftOne είναι κλειστές (Ρυθμίσεις → SoftOne): τα στοιχεία θα μείνουν σε αναμονή, οι φωτογραφίες θα ανέβουν κανονικά."}</p>
            </div>
            <label onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void inspect(f); }}
              className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed border-eu-line-2 bg-eu-surface/50 p-4 cursor-pointer hover:border-eu-blue focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-eu-blue min-w-0">
              {busy === "inspect" ? <Loader2 className="size-6 text-eu-blue shrink-0 animate-spin" aria-hidden /> : <Upload className="size-6 text-eu-blue shrink-0" aria-hidden />}
              <span className="min-w-0 flex-1 grid">
                <span className="font-bold text-eu-ink text-[length:var(--fs-15)] break-all">{busy === "inspect" ? "Διαβάζω το αρχείο…" : file ? file.name : "Διάλεξε ή σύρε εδώ ένα .xlsx / .csv"}</span>
                <span className="text-eu-muted text-[length:var(--fs-12)]">{file ? `${Math.round(file.size / 1024)} KB${sheets ? ` · ${sheets.length} ${sheets.length === 1 ? "φύλλο" : "φύλλα"}` : ""}` : "Τιμοκατάλογος προμηθευτή, λίστα προϊόντων κ.λπ."}</span>
              </span>
              <input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" disabled={!!busy}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void inspect(f); e.target.value = ""; }} />
            </label>
            {sheets && sheets.length > 1 && (
              <label className="grid gap-1 max-w-md">
                <span className="text-eu-ink-2 font-bold text-[length:var(--fs-13)]">Φύλλο</span>
                <select value={sheetIdx} onChange={(e) => { const i = Number(e.target.value); choose(sheets[i], i, sheets[i].headerRow, sheets[i].mapping); }} className={input}>
                  {sheets.map((s, i) => <option key={i} value={i}>{s.name} · {s.rowCount} γραμμές</option>)}
                </select>
              </label>
            )}
          </section>

          {sheet && (
            <section data-help="foreign.header-row" className={card} aria-labelledby="f-head">
              <div>
                <h3 id="f-head" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Γραμμή επικεφαλίδας</h3>
                <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Η γραμμή με τους τίτλους των στηλών. Προτείνεται αυτόματα· αν δεν είναι σωστή, διάλεξε άλλη από τις πρώτες {PREVIEW_ROWS}. Οι γραμμές από πάνω αγνοούνται.</p>
              </div>
              <fieldset className="m-0 p-0 border-0 grid gap-1 max-h-96 overflow-y-auto min-w-0">
                <legend className="sr-only">Γραμμή επικεφαλίδας</legend>
                {sheet.preview.map((r, i) => {
                  const cells = r.filter(Boolean);
                  if (!cells.length) return null;
                  const on = i === headerRow;
                  return (
                    <label key={i} className={`flex gap-2 items-start rounded-lg px-2 py-1.5 cursor-pointer min-w-0 ${on ? "bg-eu-navy text-white" : i < headerRow ? "text-eu-muted hover:bg-eu-surface" : "text-eu-ink hover:bg-eu-surface"}`}>
                      <input type="radio" name="headerRow" checked={on} onChange={() => choose(sheet, sheetIdx, i)} className="size-5 mt-0.5 accent-eu-yellow shrink-0" />
                      <span className={`shrink-0 tabular-nums font-bold text-[length:var(--fs-12)] mt-0.5 ${on ? "text-eu-yellow" : "text-eu-muted"}`}>{i + 1}</span>
                      <span className="min-w-0 [overflow-wrap:anywhere] line-clamp-2 text-[length:var(--fs-13)]">{cells.join(" · ")}</span>
                    </label>
                  );
                })}
              </fieldset>
            </section>
          )}

          {sheet && saved && (
            <section data-help="foreign.saved-mapping" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-eu-chip/50 border border-eu-blue/30 p-3 min-w-0">
              <span className="flex gap-2 items-start min-w-0 text-eu-ink text-[length:var(--fs-14)]"><BookmarkCheck className="size-5 text-eu-blue shrink-0" aria-hidden />
                <span className="min-w-0 [overflow-wrap:anywhere]">{usedMapping?.id === saved.id ? <>Εφαρμόστηκε η αποθηκευμένη αντιστοίχιση «<strong>{saved.name}</strong>».</> : <>Υπάρχει αποθηκευμένη αντιστοίχιση για αυτές τις επικεφαλίδες: «<strong>{saved.name}</strong>».</>}</span>
              </span>
              {usedMapping?.id !== saved.id && <button type="button" className={secondary} onClick={() => initColumns(sheet, headerRow, saved)}>Χρήση αποθηκευμένης αντιστοίχισης «{saved.name}»</button>}
            </section>
          )}

          {sheet && <div className="flex flex-wrap justify-end gap-2"><button type="button" className={primary} onClick={() => setStep(2)}>Στήλες <ArrowRight className="size-4" aria-hidden /></button></div>}
        </>
      )}

      {step === 2 && sheet && (
        <>
          <section data-help="foreign.columns" className={card} aria-labelledby="f-cols">
            <div>
              <h3 id="f-cols" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">2. Τι είναι κάθε στήλη</h3>
              <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Η πρόταση βγαίνει από τον τίτλο της στήλης — άλλαξέ τη όπου χρειάζεται. Τα παραδείγματα είναι από τις πρώτες γραμμές κάτω από την επικεφαλίδα. Στα υπάρχοντα είδη γράφονται <strong>μόνο τα κενά</strong> πεδία.</p>
            </div>
            {!hasKey && <p className="m-0 flex gap-2 items-start rounded-lg bg-eu-yellow/20 px-3 py-2 text-eu-ink text-[length:var(--fs-13)]"><AlertTriangle className="size-4 text-eu-navy shrink-0 mt-0.5" aria-hidden />Καμία στήλη-κλειδί (κωδικός, EAN, κωδικός κατασκευαστή ή MTRL): κανένα είδος δεν θα αναγνωριστεί — όλες οι γραμμές θα βγουν «νέα είδη».</p>}
            <ul className="m-0 p-0 list-none grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,19rem),1fr))]">
              {sheet.cols.map((_, i) => {
                const h = (headers[i] ?? "").trim();
                const ex = sheet.preview.slice(headerRow + 1).map((r) => (r[i] ?? "").trim()).filter(Boolean).slice(0, 3);
                if (!h && !ex.length) return null;
                const v = cols[i] ?? "ignore";
                const t = TARGET_OF.get(v);
                return (
                  <li key={i} className={`rounded-xl border-2 p-3 grid gap-2 content-start min-w-0 ${v === "ignore" ? "border-eu-line bg-eu-surface/40" : "border-eu-blue/40 bg-white"}`}>
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className={`${chip} bg-eu-surface text-eu-ink-3 shrink-0`}>{colName(i)}</span>
                      <span className="font-bold text-eu-ink text-[length:var(--fs-14)] min-w-0 [overflow-wrap:anywhere]">{h || <span className="text-eu-muted font-normal">(χωρίς τίτλο)</span>}</span>
                    </div>
                    <p className="m-0 text-eu-ink-3 text-[length:var(--fs-12)] min-w-0 [overflow-wrap:anywhere] line-clamp-3">{ex.length ? ex.join(" · ") : "— κενή στις πρώτες γραμμές —"}</p>
                    <select aria-label={`Στόχος της στήλης ${colName(i)} ${h}`} value={v} onChange={(e) => { const nv = e.target.value; setCols((c) => ({ ...c, [i]: nv })); if (nv === "spec" && !(labels[i] ?? "").trim()) setLabels((l) => ({ ...l, [i]: h })); touch(); }} className={input}>
                      {TARGETS.map((g) => <optgroup key={g.group} label={g.group}>{g.items.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>)}
                    </select>
                    {v === "spec" && (
                      <label className="grid gap-1">
                        <span className="text-eu-ink-2 font-bold text-[length:var(--fs-12)]">Ετικέτα χαρακτηριστικού</span>
                        <input value={labels[i] ?? ""} onChange={(e) => { const nv = e.target.value; setLabels((l) => ({ ...l, [i]: nv })); touch(); }} maxLength={80} placeholder="π.χ. Χρώμα" className={`${input} ${(labels[i] ?? "").trim() ? "" : "border-eu-red"}`} />
                      </label>
                    )}
                    {t && <p className="m-0 text-eu-muted text-[length:var(--fs-12)] leading-snug">{t.help}</p>}
                  </li>
                );
              })}
            </ul>
          </section>

          <section data-help="foreign.sheet-defaults" className={card} aria-labelledby="f-def">
            <div>
              <h3 id="f-def" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Για όλο το φύλλο</h3>
              <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Όταν το αρχείο δεν έχει στήλη μάρκας/κατηγορίας (π.χ. τιμοκατάλογος μίας μάρκας) ή το κελί είναι κενό. Η μάρκα βοηθά να βρεθεί το είδος από τον κωδικό κατασκευαστή και ορίζει τη μάρκα των νέων ειδών.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1 content-start min-w-0"><span className="text-eu-ink-2 font-bold text-[length:var(--fs-13)]">Μάρκα για όλο το φύλλο</span><OptionPicker label="Μάρκα για όλο το φύλλο" options={brandOpts} value={sheetBrandId} onChange={(v) => { setSheetBrandId(v); touch(); }} empty="Καμία (από τη στήλη)" /></div>
              <div className="grid gap-1 content-start min-w-0"><span className="text-eu-ink-2 font-bold text-[length:var(--fs-13)]">Κατηγορία για όλο το φύλλο</span><OptionPicker label="Κατηγορία για όλο το φύλλο" options={catOpts} value={sheetCategoryId} onChange={(v) => { setSheetCategoryId(v); touch(); }} empty="Καμία (από τη στήλη)" /></div>
            </div>
            <label className="grid gap-1 max-w-md">
              <span className="text-eu-ink-2 font-bold text-[length:var(--fs-13)]">Αποθήκευση αντιστοίχισης ως… (προαιρετικό)</span>
              <input value={saveAs} onChange={(e) => setSaveAs(e.target.value)} maxLength={80} placeholder={usedMapping ? usedMapping.name : "π.χ. Τιμοκατάλογος Allwan"} className={input} />
              <span className="text-eu-muted text-[length:var(--fs-12)]">Την επόμενη φορά που θα ανεβάσεις αρχείο με τις ίδιες επικεφαλίδες θα σου προταθεί αυτόματα. Αποθηκεύεται με την προεπισκόπηση.</span>
            </label>
          </section>

          <div className="flex flex-wrap justify-between gap-2">
            <button type="button" className={secondary} onClick={() => setStep(1)}><ArrowLeft className="size-4" aria-hidden /> Αρχείο</button>
            <span className="flex flex-wrap items-center gap-2">
              {specMissing && <span className="text-eu-red text-[length:var(--fs-13)]">Συμπλήρωσε τις ετικέτες χαρακτηριστικών.</span>}
              <button type="button" className={primary} disabled={!mapped || specMissing} onClick={goValues}>Τιμές <ArrowRight className="size-4" aria-hidden /></button>
            </span>
          </div>
        </>
      )}

      {step === 3 && sheet && (
        <>
          <section data-help="foreign.values" className={card} aria-labelledby="f-vals">
            <div>
              <h3 id="f-vals" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">3. Τιμές μάρκας και κατηγορίας</h3>
              <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Κάθε τιμή του αρχείου με δική μας μάρκα / κατηγορία. Όσα έχουν ίδιο όνομα προεπιλέγονται· ό,τι μείνει χωρίς επιλογή παίρνει την τιμή «για όλο το φύλλο» (αν έχεις ορίσει) ή μένει κενό.</p>
            </div>
            {!colsOf("brand").length && !colsOf("category").length && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Δεν αντιστοιχίστηκε στήλη μάρκας ή κατηγορίας — δεν χρειάζεται κάτι εδώ.</p>}
            {[{ kind: "brand" as const, title: "Μάρκες", vals: brandVals, map: brandMap, set: setBrandMap, opts: brandOpts }, { kind: "category" as const, title: "Κατηγορίες", vals: catVals, map: categoryMap, set: setCategoryMap, opts: catOpts }]
              .filter((g) => colsOf(g.kind).length).map((g) => (
                <div key={g.kind} className="grid gap-2 min-w-0">
                  <h4 className="m-0 font-bold text-eu-ink text-[length:var(--fs-14)]">{g.title} <span className="text-eu-muted font-normal">· {g.vals.values.length} τιμές{g.vals.values.length ? ` · ${g.vals.values.filter((v) => g.map[v]).length} αντιστοιχισμένες` : ""}</span></h4>
                  {g.vals.many && <p className="m-0 flex gap-2 items-start rounded-lg bg-eu-yellow/20 px-3 py-2 text-eu-ink text-[length:var(--fs-13)]"><AlertTriangle className="size-4 text-eu-navy shrink-0 mt-0.5" aria-hidden />Η στήλη έχει πάνω από 300 διαφορετικές τιμές — μάλλον δεν είναι {g.kind === "brand" ? "μάρκα" : "κατηγορία"}. Έλεγξε την αντιστοίχιση στο βήμα 2.</p>}
                  <ul className="m-0 p-0 list-none grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,22rem),1fr))]">
                    {g.vals.values.map((v) => (
                      <li key={v} className="grid gap-1 rounded-lg border border-eu-line p-2 min-w-0">
                        <span className="font-bold text-eu-ink text-[length:var(--fs-13)] min-w-0 [overflow-wrap:anywhere]">{v}</span>
                        <OptionPicker label={`${g.kind === "brand" ? "Μάρκα" : "Κατηγορία"} για «${v}»`} options={g.opts} value={g.map[v] ?? null} onChange={(id) => { g.set((m) => ({ ...m, [v]: id })); touch(); }} empty="Χωρίς αντιστοίχιση" />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </section>
          <div className="flex flex-wrap justify-between gap-2">
            <button type="button" className={secondary} onClick={() => setStep(2)}><ArrowLeft className="size-4" aria-hidden /> Στήλες</button>
            <button type="button" className={primary} disabled={!!busy} onClick={preview}>{busy === "plan" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileSpreadsheet className="size-4" aria-hidden />} Προεπισκόπηση</button>
          </div>
          {busy === "plan" && <p role="status" className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Βρίσκω τα είδη στο SoftOne και υπολογίζω τις αλλαγές — σε μεγάλα αρχεία μπορεί να πάρει λίγο.</p>}
        </>
      )}

      {step === 4 && plan && <Preview key={plan.jobId} plan={plan} canSync={canSync} onBack={() => setStep(3)} />}
    </div>
  );
}

// ======================= 4. Προεπισκόπηση & εκτέλεση =======================

type RowResult = { ok: boolean; text: string };

function Preview({ plan, canSync, onBack }: { plan: Plan; canSync: boolean; onBack: () => void }) {
  const writeOn = plan.writeOn;
  const counts = useMemo(() => {
    const c: Record<RowStatus, number> = { update: 0, unchanged: 0, new: 0, waiting: 0, problem: 0 };
    for (const r of plan.rows) c[r.status]++;
    return c;
  }, [plan.rows]);
  const [filter, setFilter] = useState<RowStatus | "all">("all");
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<Set<number>>(() => new Set(plan.rows.filter((r) => r.status === "update" || r.status === "new").map((r) => r.rowNo)));
  const [results, setResults] = useState<Record<number, RowResult>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const blocked = writeOn && !canSync ? "Η εγγραφή στο SoftOne είναι ανοιχτή: για εκτέλεση χρειάζεται και το δικαίωμα «Εκτέλεση συγχρονισμού ERP»." : null;

  const shown = useMemo(() => plan.rows.filter((r) => filter === "all" || r.status === filter), [plan.rows, filter]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const pageRows = shown.slice(cur * PAGE, cur * PAGE + PAGE);
  const statusOf = useMemo(() => new Map(plan.rows.map((r) => [r.rowNo, r.status])), [plan.rows]);
  const todo = plan.rows.filter((r) => sel.has(r.rowNo) && r.status !== "problem" && !results[r.rowNo]?.ok);
  const pendingDone = Object.entries(results).filter(([n, r]) => r.ok && statusOf.get(Number(n)) === "new").length;

  const toggle = (n: number) => setSel((s) => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; });
  const setMany = (rows: ForeignPlanRow[], on: boolean) => setSel((s) => { const x = new Set(s); for (const r of rows) if (r.status !== "problem") { if (on) x.add(r.rowNo); else x.delete(r.rowNo); } return x; });

  const run = async () => {
    if (!todo.length || blocked) return;
    const ex = todo.filter((r) => r.status !== "new").length, nw = todo.length - ex;
    const what = [ex ? `${ex} υπάρχοντα είδη ${writeOn ? "θα πάρουν τα κενά τους στοιχεία στο SoftOne και τις νέες φωτογραφίες" : "θα πάρουν τις νέες φωτογραφίες (τα στοιχεία μένουν σε αναμονή)"}` : "", nw ? `${nw} νέα είδη θα μπουν στη λίστα «Νέα είδη» για έγκριση` : ""].filter(Boolean).join(" και ");
    if (!confirm(`Εκτέλεση ${todo.length} ${todo.length === 1 ? "γραμμής" : "γραμμών"}: ${what}. Συνέχεια;`)) return;
    setErr(null);
    const rows = todo.map((r) => r.rowNo);
    setProgress({ done: 0, total: rows.length }); setRunning(true);
    for (let i = 0; i < rows.length; i += BATCH) {
      const part = rows.slice(i, i + BATCH);
      let res;
      try { res = await runForeignBatch(plan.jobId, part, plan.writeOn); } catch (e) { res = { error: (e as Error).message || "Η σύνδεση διακόπηκε." }; }
      if ("error" in res) { setErr(`${res.error} — όσα έγιναν μέχρι εδώ έμειναν· πάτα ξανά «Εκτέλεση» για τα υπόλοιπα.`); setRunning(false); return; }
      const errs = new Map(res.errors.map((e) => [e.rowNo, e.error]));
      setResults((prev) => {
        const next = { ...prev };
        for (const n of part) next[n] = errs.has(n) ? { ok: false, text: errs.get(n)! } : { ok: true, text: DONE_TEXT[statusOf.get(n) ?? "unchanged"] };
        return next;
      });
      setProgress({ done: Math.min(i + BATCH, rows.length), total: rows.length });
    }
    setRunning(false);
  };
  const okCount = Object.values(results).filter((r) => r.ok).length, failCount = Object.values(results).filter((r) => !r.ok).length;

  return (
    <section data-help="foreign.preview" className={card} aria-labelledby="f-plan">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="f-plan" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">4. Προεπισκόπηση</h3>
        <span className="text-eu-muted text-[length:var(--fs-13)]">{plan.rows.length} γραμμές</span>
      </div>
      <p className={`m-0 flex gap-2 items-start rounded-lg px-3 py-2 text-eu-ink text-[length:var(--fs-13)] ${writeOn ? "bg-eu-chip/60" : "bg-eu-yellow/20"}`}>
        {writeOn ? <Check className="size-4 text-eu-blue shrink-0 mt-0.5" aria-hidden /> : <Clock className="size-4 text-eu-navy shrink-0 mt-0.5" aria-hidden />}
        {writeOn ? "Οι αλλαγές θα γραφτούν στο SoftOne — μόνο κενά πεδία." : "Οι αλλαγές προς το SoftOne είναι κλειστές — τα στοιχεία θα μείνουν σε αναμονή, οι φωτογραφίες θα ανέβουν."}
      </p>
      <div role="tablist" aria-label="Φίλτρο γραμμών" className="flex flex-wrap gap-2">
        {(["all", ...STATUS_ORDER] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => { setFilter(k); setPage(0); }} disabled={k !== "all" && !counts[k]}
            className={`${btn} px-3 ${filter === k ? "bg-eu-navy text-white" : "bg-eu-surface text-eu-ink-2 hover:bg-eu-chip"}`}>
            {k === "all" ? "Όλες" : STATUS[k].label} <span className="tabular-nums opacity-80">{k === "all" ? plan.rows.length : counts[k]}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-13)]">
        <span className="text-eu-ink-3">Επιλεγμένες: <strong className="text-eu-ink tabular-nums">{sel.size}</strong></span>
        <button type="button" className="min-h-11 md:min-h-9 font-bold text-eu-blue hover:underline" onClick={() => setMany(shown, true)}>Όλες του φίλτρου</button>
        <button type="button" className="min-h-11 md:min-h-9 font-bold text-eu-blue hover:underline" onClick={() => setMany(shown, false)}>Καμία του φίλτρου</button>
      </div>

      <ul className="m-0 p-0 list-none grid gap-2">
        {pageRows.map((r) => <PlanItem key={r.rowNo} r={r} checked={sel.has(r.rowNo)} onToggle={() => toggle(r.rowNo)} res={results[r.rowNo]} disabled={running} />)}
        {!pageRows.length && <li className="text-eu-muted text-[length:var(--fs-14)]">Καμία γραμμή σε αυτό το φίλτρο.</li>}
      </ul>
      {pages > 1 && (
        <nav aria-label="Σελίδες" className="flex flex-wrap items-center justify-center gap-2">
          <button type="button" className={secondary} disabled={cur === 0} onClick={() => setPage(cur - 1)}><ArrowLeft className="size-4" aria-hidden /> Προηγούμενες</button>
          <span className="text-eu-ink-3 text-[length:var(--fs-13)] tabular-nums">{cur * PAGE + 1}–{Math.min(shown.length, cur * PAGE + PAGE)} από {shown.length}</span>
          <button type="button" className={secondary} disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Επόμενες <ArrowRight className="size-4" aria-hidden /></button>
        </nav>
      )}

      {pendingDone > 0 && !running && (
        <p className="m-0 flex flex-wrap gap-2 items-center rounded-lg bg-eu-green/12 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]">
          <Check className="size-4 text-eu-green shrink-0" aria-hidden /> {pendingDone} νέα είδη περιμένουν έγκριση.
          <Link href="/admin/catalog/templates/nea-eidi" className="font-bold text-eu-blue hover:underline min-h-11 md:min-h-9 inline-flex items-center">Άνοιγμα «Νέα είδη»</Link>
        </p>
      )}
      {err && <p role="alert" className="m-0 flex gap-2 items-start rounded-xl bg-eu-red/10 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]"><CircleAlert className="size-4 text-eu-red shrink-0 mt-0.5" aria-hidden /><span className="min-w-0 [overflow-wrap:anywhere]">{err}</span></p>}
      {blocked && <p className="m-0 flex gap-2 items-start rounded-lg bg-eu-yellow/20 px-3 py-2 text-eu-ink text-[length:var(--fs-13)]"><AlertTriangle className="size-4 text-eu-navy shrink-0 mt-0.5" aria-hidden />{blocked}</p>}

      <div data-help="foreign.run" className="sticky bottom-2 z-10 grid gap-2 rounded-2xl bg-eu-navy text-white px-4 py-3 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onBack} disabled={running} className={`${btn} border-2 border-white/60 text-white hover:bg-white/10`}><ArrowLeft className="size-4" aria-hidden /> Τιμές</button>
          <span className="text-[length:var(--fs-14)] min-w-0" aria-live="polite">
            {progress ? `${progress.done}/${progress.total} · ${okCount} έγιναν${failCount ? ` · ${failCount} με σφάλμα` : ""}` : `${todo.length} προς εκτέλεση`}
          </span>
          <button type="button" onClick={run} disabled={!todo.length || running || !!blocked} className={`${btn} bg-eu-yellow text-eu-navy hover:bg-white`}>
            {running ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />} Εκτέλεση {todo.length || ""}
          </button>
        </div>
        {progress && <progress value={progress.done} max={progress.total || 1} aria-label="Πρόοδος εκτέλεσης" className="w-full h-2 appearance-none rounded-full overflow-hidden bg-white/20 [&::-webkit-progress-bar]:bg-white/20 [&::-webkit-progress-value]:bg-eu-yellow [&::-moz-progress-bar]:bg-eu-yellow" />}
      </div>
    </section>
  );
}

function PlanItem({ r, checked, onToggle, res, disabled }: { r: ForeignPlanRow; checked: boolean; onToggle: () => void; res?: RowResult; disabled: boolean }) {
  const st = STATUS[r.status];
  const problem = r.status === "problem";
  return (
    <li className={`rounded-xl border p-3 grid gap-1.5 min-w-0 ${res ? (res.ok ? "border-eu-green/50" : "border-eu-red/50") : "border-eu-line"}`}>
      <div className="flex items-start gap-2 min-w-0">
        <input type="checkbox" checked={checked && !problem} disabled={problem || disabled} onChange={onToggle} aria-label={`Επιλογή γραμμής ${r.rowNo}`} className="size-5 mt-0.5 accent-eu-navy shrink-0 disabled:opacity-40" />
        <div className="grid gap-1 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
            <span className={`${chip} ${st.cls}`}>{st.label}</span>
            <span className="font-bold text-eu-ink text-[length:var(--fs-14)] min-w-0 [overflow-wrap:anywhere]">{r.title || "—"}</span>
            <span className="min-w-0 break-all text-eu-muted text-[length:var(--fs-12)]">γραμμή {r.rowNo}{r.mtrl ? ` · MTRL ${r.mtrl}` : ""}{r.code ? ` · ${r.code}` : ""}</span>
          </div>
          {r.problem && <p className="m-0 flex gap-1.5 items-start text-eu-red text-[length:var(--fs-13)] min-w-0 [overflow-wrap:anywhere]"><CircleAlert className="size-3.5 shrink-0 mt-0.5" aria-hidden /><span className="min-w-0">{r.problem}</span></p>}
          {r.changes.length > 0 && !problem && (
            <ul className="m-0 p-0 list-none grid gap-0.5 text-[length:var(--fs-13)]">
              {r.changes.slice(0, 8).map((c, i) => <li key={i} className="min-w-0 [overflow-wrap:anywhere]"><span className="text-eu-ink-3">{c.label}:</span> {r.status !== "new" && <><s className="text-eu-muted">{c.from || "—"}</s> → </>}<strong className="text-eu-ink">{c.to}</strong></li>)}
              {r.changes.length > 8 && <li className="text-eu-muted">+{r.changes.length - 8} ακόμη</li>}
            </ul>
          )}
          {(r.media > 0 || r.price) && !problem && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-13)]">
              {r.media > 0 && <span className="inline-flex items-center gap-1 text-eu-ink-2"><Images className="size-3.5" aria-hidden /> {r.media} {r.media === 1 ? "νέο πολυμέσο" : "νέα πολυμέσα"}</span>}
              {r.price && (
                <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-eu-ink-2">
                  Τιμή web: <span className="tabular-nums">{eur.format(r.price.cost)}</span> → <strong className="text-eu-ink tabular-nums">{eur.format(r.price.price)}</strong>
                  {r.price.capped && <span className={`${chip} bg-eu-yellow/30 text-eu-ink`}>πλαφόν</span>}
                  <span className="text-eu-muted">· {r.price.rule} · περιθώριο <span className="tabular-nums">{eur.format(r.price.margin)}</span></span>
                </span>
              )}
            </div>
          )}
          {r.warnings.slice(0, 4).map((w, i) => <p key={i} className="m-0 flex gap-1.5 items-start text-eu-ink-3 text-[length:var(--fs-12)] min-w-0 [overflow-wrap:anywhere]"><AlertTriangle className="size-3.5 shrink-0 mt-0.5" aria-hidden /><span className="min-w-0">{w}</span></p>)}
          {r.warnings.length > 4 && <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">+{r.warnings.length - 4} ακόμη προειδοποιήσεις</p>}
          {res && <p className={`m-0 flex gap-1.5 items-start text-[length:var(--fs-13)] min-w-0 [overflow-wrap:anywhere] ${res.ok ? "text-eu-ink" : "text-eu-red"}`}>{res.ok ? <Check className="size-3.5 text-eu-green shrink-0 mt-0.5" aria-hidden /> : <CircleAlert className="size-3.5 shrink-0 mt-0.5" aria-hidden />}<span className="min-w-0">{res.text}</span></p>}
        </div>
      </div>
    </li>
  );
}
