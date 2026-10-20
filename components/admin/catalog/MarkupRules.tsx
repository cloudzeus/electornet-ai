"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Calculator, Check, CircleAlert, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { priceFrom, type Rounding } from "@/lib/catalog/pricing/markup";
import { saveRule, setRuleActive, deleteRule } from "@/app/admin/(shell)/catalog/templates/kanones-timon/actions";
import { OptionPicker, type PickOpt } from "@/components/admin/catalog/OptionPicker";

type Rule = { id: string; brandId: string | null; categoryId: string | null; percent: number; rounding: string; active: boolean };
type Scope = "general" | "brand" | "category" | "both";

const btn = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-14)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const primary = `${btn} bg-eu-navy text-white hover:bg-eu-blue`;
const secondary = `${btn} border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`;
const danger = `${btn} border-2 border-eu-red/60 text-eu-red hover:bg-eu-red/10`;
const input = "w-full min-w-0 rounded-lg border border-eu-line bg-white px-3 min-h-11 md:min-h-9 text-[length:var(--fs-14)] focus-visible:outline-2 focus-visible:outline-eu-blue";
const chip = "rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-12)]";
const eur = new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" });
const pct = (n: number) => `${String(n).replace(".", ",")}%`;
const VAT = 24, COST = 100;

const ROUNDINGS: { value: Rounding; label: string; help: string }[] = [
  { value: "none", label: "Χωρίς", help: "Η τιμή μένει όπως βγαίνει, με λεπτά (π.χ. 161,20 €)." },
  { value: "int", label: "Ακέραιο", help: "Προς τα πάνω στο επόμενο ακέραιο ευρώ (161,20 → 162,00 €)." },
  { value: "90", label: ",90", help: "Στο επόμενο ,90 (161,20 → 161,90 €)." },
  { value: "99", label: ",99", help: "Στο επόμενο ,99 (161,20 → 161,99 €)." },
];
const SCOPES: { value: Scope; label: string }[] = [
  { value: "general", label: "Γενικός (όλα)" }, { value: "brand", label: "Μάρκα" }, { value: "category", label: "Κατηγορία" }, { value: "both", label: "Μάρκα + Κατηγορία" },
];
const scopeOf = (r: Pick<Rule, "brandId" | "categoryId">): Scope => (r.brandId && r.categoryId ? "both" : r.brandId ? "brand" : r.categoryId ? "category" : "general");
const RANK: Record<Scope, number> = { general: 0, brand: 1, category: 2, both: 3 };
const roundingOf = (s: string): Rounding => (ROUNDINGS.some((r) => r.value === s) ? (s as Rounding) : "none");

/** Παράδειγμα υπολογισμού για κόστος 100 € (ΦΠΑ 24%). */
function Example({ percent, rounding }: { percent: number; rounding: Rounding }) {
  if (!Number.isFinite(percent) || percent < 0 || percent > 500) return <span className="text-eu-muted">—</span>;
  const p = priceFrom({ cost: COST, percent, vat: VAT, rounding });
  return <span className="tabular-nums">Κόστος {eur.format(COST)} → τιμή <strong className="text-eu-ink">{eur.format(p.price)}</strong> <span className="text-eu-muted">(με ΦΠΑ {VAT}% · περιθώριο {eur.format(p.margin)})</span></span>;
}

/** Κανόνες markup: λίστα με παράδειγμα δίπλα σε κάθε κανόνα, φόρμα νέου/αλλαγής, ενεργοποίηση, διαγραφή. */
export function MarkupRules({ rules, brands, categories, canWrite }: { rules: Rule[]; brands: PickOpt[]; categories: PickOpt[]; canWrite: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const scopeLabel = (r: Rule) => {
    const b = r.brandId ? brandName.get(r.brandId) ?? "(μάρκα που δεν υπάρχει)" : "", c = r.categoryId ? catName.get(r.categoryId) ?? "(κατηγορία που δεν υπάρχει)" : "";
    return r.brandId && r.categoryId ? `${b} · ${c}` : b || c || "Γενικός κανόνας";
  };
  const sorted = [...rules].sort((a, b) => RANK[scopeOf(a)] - RANK[scopeOf(b)] || scopeLabel(a).localeCompare(scopeLabel(b), "el"));
  const hasGeneral = rules.some((r) => r.active && scopeOf(r) === "general");

  const act = async (id: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(id); setErr(null);
    try { const r = await fn(); if (!r.ok) setErr(r.error ?? "Δεν έγινε."); else router.refresh(); } catch (e) { setErr((e as Error).message || "Δεν έγινε."); } finally { setBusy(null); }
  };

  return (
    <div className="grid gap-4 min-w-0">
      <section className="rounded-xl border border-eu-line bg-white p-3 md:p-4 grid gap-2 min-w-0 text-[length:var(--fs-13)] text-eu-ink-2">
        <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Ποιος κανόνας εφαρμόζεται</h3>
        <p className="m-0">Για κάθε είδος ισχύει ο <strong>πιο ειδικός</strong> ενεργός κανόνας: μάρκα + κατηγορία → κατηγορία → μάρκα → γενικός. Το ΦΠΑ είναι του είδους (στο παράδειγμα 24%). Αν η τιμή ξεπερνά την προτεινόμενη λιανική του αρχείου, μπαίνει η λιανική και η γραμμή σημειώνεται «πλαφόν». Περιθώριο = τιμή χωρίς ΦΠΑ − κόστος.</p>
      </section>

      {!hasGeneral && <p className="m-0 flex gap-2 items-start rounded-lg bg-eu-yellow/20 px-3 py-2 text-eu-ink text-[length:var(--fs-13)]"><AlertTriangle className="size-4 text-eu-navy shrink-0 mt-0.5" aria-hidden />Δεν υπάρχει ενεργός γενικός κανόνας: είδη που δεν πιάνει καμία εξαίρεση δεν παίρνουν τιμή από το κόστος (η προεπισκόπηση το δείχνει ως προειδοποίηση).</p>}
      {err && <p role="alert" className="m-0 flex gap-2 items-start rounded-xl bg-eu-red/10 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]"><CircleAlert className="size-4 text-eu-red shrink-0 mt-0.5" aria-hidden />{err}</p>}

      {canWrite && editing !== "new" && <button type="button" className={`${primary} w-fit`} onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> Νέος κανόνας</button>}
      {editing === "new" && <RuleForm brands={brands} categories={categories} onDone={() => { setEditing(null); router.refresh(); }} onCancel={() => setEditing(null)} />}

      <ul data-help="markup.list" className="m-0 p-0 list-none grid gap-2">
        {sorted.map((r) => editing === r.id ? (
          <li key={r.id}><RuleForm rule={r} brands={brands} categories={categories} onDone={() => { setEditing(null); router.refresh(); }} onCancel={() => setEditing(null)} /></li>
        ) : (
          <li key={r.id} className={`rounded-xl border p-3 grid gap-2 min-w-0 ${r.active ? "border-eu-line bg-white" : "border-eu-line bg-eu-surface/60"}`}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
              <span className={`${chip} ${scopeOf(r) === "general" ? "bg-eu-navy text-white" : "bg-eu-chip text-eu-navy"}`}>{SCOPES.find((s) => s.value === scopeOf(r))!.label}</span>
              <span className="font-bold text-eu-ink text-[length:var(--fs-15)] min-w-0 [overflow-wrap:anywhere]">{scopeLabel(r)}</span>
              <span className="font-extrabold text-eu-navy text-[length:var(--fs-16)] tabular-nums">+{pct(r.percent)}</span>
              <span className={`${chip} bg-eu-surface text-eu-ink-2`}>Στρογγύλεμα: {ROUNDINGS.find((x) => x.value === roundingOf(r.rounding))!.label}</span>
              {!r.active && <span className={`${chip} bg-eu-surface text-eu-muted`}>Ανενεργός</span>}
            </div>
            <p data-help="markup.example" className="m-0 flex gap-1.5 items-start text-eu-ink-2 text-[length:var(--fs-13)]"><Calculator className="size-4 text-eu-blue shrink-0" aria-hidden /><Example percent={r.percent} rounding={roundingOf(r.rounding)} /></p>
            {canWrite && (
              <div className="flex flex-wrap items-center gap-2 border-t border-eu-line pt-2">
                <label className="inline-flex items-center gap-2 min-h-11 md:min-h-9 cursor-pointer text-eu-ink-2 font-bold text-[length:var(--fs-14)] mr-2">
                  <input type="checkbox" checked={r.active} disabled={!!busy} onChange={(e) => act(r.id, () => setRuleActive(r.id, e.target.checked))} className="size-5 accent-eu-navy" /> Ενεργός
                </label>
                <button type="button" className={secondary} disabled={!!busy} onClick={() => setEditing(r.id)}><Pencil className="size-4" aria-hidden /> Αλλαγή</button>
                <button type="button" className={danger} disabled={!!busy} onClick={() => { if (confirm(`Διαγραφή του κανόνα «${scopeLabel(r)} +${pct(r.percent)}»; Δεν αναιρείται.`)) void act(r.id, () => deleteRule(r.id)); }}>
                  {busy === r.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />} Διαγραφή
                </button>
              </div>
            )}
          </li>
        ))}
        {!rules.length && <li className="rounded-xl border border-dashed border-eu-line-2 p-6 text-center text-eu-muted text-[length:var(--fs-14)]">Κανένας κανόνας ακόμη. Ξεκίνα με έναν γενικό (π.χ. 30%) και πρόσθεσε εξαιρέσεις για μάρκες ή κατηγορίες.</li>}
      </ul>
    </div>
  );
}

function RuleForm({ rule, brands, categories, onDone, onCancel }: { rule?: Rule; brands: PickOpt[]; categories: PickOpt[]; onDone: () => void; onCancel: () => void }) {
  const [scope, setScope] = useState<Scope>(rule ? scopeOf(rule) : "general");
  const [brandId, setBrandId] = useState<string | null>(rule?.brandId ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(rule?.categoryId ?? null);
  const [percent, setPercent] = useState(rule ? String(rule.percent).replace(".", ",") : "30");
  const [rounding, setRounding] = useState<Rounding>(rule ? roundingOf(rule.rounding) : "90");
  const [active, setActive] = useState(rule?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const n = Number(percent.trim().replace(",", "."));
  const pctErr = percent.trim() === "" || !Number.isFinite(n) || n < 0 || n > 500 ? "Από 0 έως 500." : null;
  const needBrand = scope === "brand" || scope === "both", needCat = scope === "category" || scope === "both";
  const missing = (needBrand && !brandId) || (needCat && !categoryId);

  const save = async () => {
    if (pctErr || missing) return;
    setSaving(true); setErr(null);
    try {
      const r = await saveRule({ id: rule?.id ?? null, brandId: needBrand ? brandId : null, categoryId: needCat ? categoryId : null, percent: n, rounding, active });
      if (r.ok) onDone(); else setErr(r.error ?? "Δεν αποθηκεύτηκε.");
    } catch (e) { setErr((e as Error).message || "Δεν αποθηκεύτηκε."); } finally { setSaving(false); }
  };
  return (
    <form data-help="markup.form" onSubmit={(e) => { e.preventDefault(); void save(); }} className="grid gap-3 rounded-xl border-2 border-eu-blue/40 bg-white p-3 md:p-4 min-w-0">
      <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">{rule ? "Αλλαγή κανόνα" : "Νέος κανόνας"}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 content-start min-w-0"><span className="text-eu-ink-2 font-bold text-[length:var(--fs-13)]">Ισχύει για</span>
          <select value={scope} onChange={(e) => setScope(e.target.value as Scope)} className={input}>{SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
          <span className="text-eu-muted text-[length:var(--fs-12)]">Ο πιο ειδικός κανόνας κερδίζει· ο γενικός πιάνει ό,τι μένει.</span></label>
        <label className="grid gap-1 content-start min-w-0"><span className="text-eu-ink-2 font-bold text-[length:var(--fs-13)]">Markup (%)</span>
          <input value={percent} onChange={(e) => setPercent(e.target.value)} inputMode="decimal" aria-invalid={!!pctErr} className={`${input} ${pctErr ? "border-eu-red" : ""}`} />
          <span className={`text-[length:var(--fs-12)] ${pctErr ? "text-eu-red" : "text-eu-muted"}`}>{pctErr ?? "Πόσο πάνω από το κόστος (χωρίς ΦΠΑ), από 0 έως 500."}</span></label>
        {needBrand && <div className="grid gap-1 content-start min-w-0"><span className="text-eu-ink-2 font-bold text-[length:var(--fs-13)]">Μάρκα</span><OptionPicker label="Μάρκα κανόνα" options={brands} value={brandId} onChange={setBrandId} empty="Διάλεξε μάρκα" /></div>}
        {needCat && <div className="grid gap-1 content-start min-w-0"><span className="text-eu-ink-2 font-bold text-[length:var(--fs-13)]">Κατηγορία</span><OptionPicker label="Κατηγορία κανόνα" options={categories} value={categoryId} onChange={setCategoryId} empty="Διάλεξε κατηγορία" /></div>}
        <label className="grid gap-1 content-start min-w-0"><span className="text-eu-ink-2 font-bold text-[length:var(--fs-13)]">Στρογγύλεμα</span>
          <select value={rounding} onChange={(e) => setRounding(e.target.value as Rounding)} className={input}>{ROUNDINGS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
          <span className="text-eu-muted text-[length:var(--fs-12)]">{ROUNDINGS.find((r) => r.value === rounding)!.help}</span></label>
        <label className="inline-flex items-center gap-2 min-h-11 md:min-h-9 cursor-pointer self-end text-eu-ink-2 font-bold text-[length:var(--fs-14)]">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-5 accent-eu-navy" /> Ενεργός
        </label>
      </div>
      <p className="m-0 flex gap-1.5 items-start rounded-lg bg-eu-surface px-3 py-2 text-eu-ink-2 text-[length:var(--fs-13)]"><Calculator className="size-4 text-eu-blue shrink-0" aria-hidden /><Example percent={pctErr ? NaN : n} rounding={rounding} /></p>
      {err && <p role="alert" className="m-0 flex gap-1.5 items-start text-eu-red text-[length:var(--fs-13)]"><CircleAlert className="size-3.5 shrink-0 mt-0.5" aria-hidden />{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primary} disabled={saving || !!pctErr || missing}>{saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Αποθήκευση</button>
        <button type="button" className={secondary} onClick={onCancel} disabled={saving}><X className="size-4" aria-hidden /> Ακύρωση</button>
        {missing && <span className="self-center text-eu-ink-3 text-[length:var(--fs-12)]">Διάλεξε {needBrand && !brandId ? "μάρκα" : "κατηγορία"}.</span>}
      </div>
    </form>
  );
}
