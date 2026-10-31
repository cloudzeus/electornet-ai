"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FileText, ListChecks, Ruler, ShieldCheck, Tag, Plus, Trash2, Loader2, Save, Undo2, AlertTriangle, Lock, Check } from "lucide-react";
import { AccordionItem } from "@/components/admin/ui/Accordion";
import { SourceBadge } from "./sources";
import { parseDescription } from "@/lib/softone/describe";
import { saveProductFields } from "@/app/admin/(shell)/catalog/actions";
import type { EditorField as ItemField, ItemValue } from "@/lib/softone/item-write";

export type EditorValues = Record<ItemField, ItemValue>;

const LABEL: Record<ItemField, string> = {
  name: "Όνομα", barcode: "Barcode", factoryCode: "Κωδικός κατασκευαστή", active: "Ενεργό", shortDesc: "Σύντομη περιγραφή", longDesc: "Αναλυτική περιγραφή",
  availText: "Κείμενο διαθεσιμότητας", extWarranty: "Επέκταση εγγύησης", guaranteeMonths: "Εγγύηση (μήνες)", weightKg: "Βάρος", lengthCm: "Βάθος", widthCm: "Πλάτος", heightCm: "Ύψος",
};
const same = (a: ItemValue, b: ItemValue) => String(a ?? "").replace(/\r\n?/g, "\n").trim() === String(b ?? "").replace(/\r\n?/g, "\n").trim();
// πυκνή φόρμα διαχείρισης: 36px στον υπολογιστή, 44px στο κινητό (αφή)
const input = "w-full rounded-lg border border-eu-line bg-white px-2.5 min-h-11 md:min-h-9 text-[length:var(--fs-14)] focus-visible:outline-2 focus-visible:outline-eu-blue disabled:bg-eu-surface disabled:text-eu-ink-3";
const S1 = <span className="inline-flex items-center rounded-full bg-eu-navy/10 text-eu-navy font-bold px-1.5 py-0.5 text-[length:var(--fs-11)]">SoftOne + eshop</span>;

/** Γραμμές «Ετικέτα : τιμή» της αναλυτικής περιγραφής — αυτές γίνονται χαρακτηριστικά και φίλτρα στο e-shop. */
function specRows(raw: string) {
  return raw.replace(/\r\n?/g, "\n").split("\n").flatMap((l, line) => {
    if (/<[a-z/]/i.test(l)) return [];
    const p = parseDescription(l);
    return p.specs.length === 1 ? [{ line, key: p.specs[0].key, value: p.specs[0].value }] : [];
  });
}

function Field({ label, help, children, wide = false }: { label: string; help?: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`grid gap-0.5 min-w-0 content-start ${wide ? "@2xl:col-span-2" : ""}`}>
      <span className="text-eu-ink-2 font-semibold text-[length:var(--fs-12)]">{label}</span>
      {children}
      {help && <span className="text-eu-muted text-[length:var(--fs-12)] leading-snug">{help}</span>}
    </label>
  );
}

/**
 * Επεξεργασία των στοιχείων του είδους που ζουν στο SoftOne. Μία αποθήκευση γράφει στο SoftOne (με επαλήθευση) και
 * αμέσως ενημερώνει το e-shop. Τα χαρακτηριστικά είναι γραμμές της αναλυτικής περιγραφής: ο πίνακας τις αλλάζει επί τόπου,
 * χωρίς να πειράζει το υπόλοιπο κείμενο.
 */
export type EditorSection = "basics" | "texts" | "specs" | "dims" | "warranty";

export type DimCandidate = { source: string; w: number; h: number; d: number; line: string; note: string | null; kind?: string };

export function ProductEditor({ productId, initial, readonly, readonlyReason, meta, descDims, dimCandidates, only }: {
  productId: string; initial: EditorValues; readonly: boolean; readonlyReason?: string;
  /** διαστάσεις που βγήκαν από τη γραμμή «Διαστάσεις (ΥxΠxΒ)» της περιγραφής, σε εκ. (με διόρθωση μονάδας/αξόνων) */
  descDims?: { w: number; h: number; d: number; line: string; note: string | null } | null;
  /** διαστάσεις που βρέθηκαν στο περιεχόμενο (EPREL, περιγραφή SoftOne) — «Χρήση αυτών» γεμίζει τα πεδία */
  dimCandidates?: DimCandidate[];
  meta: { code: string; mtrl: string; brand: string; category: string };
  /** μόνο αυτές οι ενότητες (καρτέλες της σελίδας προϊόντος)· χωρίς = όλες */
  only?: EditorSection[];
}) {
  const show = (k: EditorSection) => !only || only.includes(k);
  // σε καρτέλα (only) οι ενότητες είναι το κύριο περιεχόμενο — ανοιχτές
  const open = !!only;
  const [base, setBase] = useState(initial);
  const [v, setV] = useState(initial);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string; details?: string[] } | null>(null);
  const router = useRouter();
  const set = (k: ItemField, val: ItemValue) => { setV((x) => ({ ...x, [k]: val })); setResult(null); };
  const dirty = (Object.keys(v) as ItemField[]).filter((k) => !same(v[k], base[k]));
  const raw = String(v.longDesc ?? "");
  const html = /<[a-z/][^>]*>/i.test(raw);
  const rows = useMemo(() => specRows(raw), [raw]);
  const parsed = useMemo(() => parseDescription(raw), [raw]);
  const lines = () => raw.replace(/\r\n?/g, "\n").split("\n");
  const setRow = (line: number, key: string, value: string) => { const l = lines(); l[line] = `${key} : ${value}`; set("longDesc", l.join("\n")); };
  const removeRow = (line: number) => { const l = lines(); l.splice(line, 1); set("longDesc", l.join("\n")); };
  const addRow = () => { const l = lines(); while (l.length && !l[l.length - 1].trim()) l.pop(); l.push("Νέο χαρακτηριστικό : τιμή"); set("longDesc", l.join("\n")); };

  const save = () => start(async () => {
    const changes = Object.fromEntries(dirty.map((k) => [k, { from: base[k], to: v[k] }]));
    const r = await saveProductFields(productId, changes);
    const details = [
      ...("conflicts" in r && r.conflicts ? r.conflicts.map((c) => `${c.label}: στο SoftOne είναι πλέον «${c.now.slice(0, 80)}»`) : []),
      ...("mismatches" in r && r.mismatches ? r.mismatches.map((m) => `${m.label}: γράφτηκε «${m.got.slice(0, 80)}» αντί για «${m.sent.slice(0, 80)}»`) : []),
    ];
    setResult({ ok: r.ok, text: r.message, details });
    setConfirm(false);
    if (r.written?.length) {
      const written = new Set(r.written);
      setBase((b) => Object.fromEntries((Object.keys(b) as ItemField[]).map((k) => [k, written.has(k) ? v[k] : b[k]])) as EditorValues);
      router.refresh();
    }
  });

  const dis = readonly || pending;

  const dimInput = (k: ItemField, label: string, unit: string) => (
    <Field label={label}>
      <span className="relative block">
        <input type="number" inputMode="decimal" step="0.1" min={0} disabled={dis} value={v[k] == null ? "" : String(v[k])} onChange={(e) => set(k, e.target.value === "" ? null : e.target.value)} className={`${input} pr-9 tabular-nums`} />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-eu-muted text-[length:var(--fs-12)]">{unit}</span>
      </span>
    </Field>
  );

  return (
    <>
      {readonly && readonlyReason && (
        <p className="m-0 inline-flex items-start gap-2 rounded-lg bg-eu-surface px-2.5 py-1.5 text-eu-ink-2 text-[length:var(--fs-12)]"><Lock className="size-4 mt-0.5 shrink-0 text-eu-blue" aria-hidden />{readonlyReason}</p>
      )}

      {show("basics") && (
      <AccordionItem id="basics" title="Βασικά στοιχεία" icon={<Tag className="size-4" aria-hidden />} summary={`${String(v.name ?? "")} · κωδικός ${meta.code}`} badge={S1} defaultOpen>
        <div className="grid gap-2 @2xl:grid-cols-2">
          <Field label="Όνομα στο SoftOne" help="Ο τίτλος στο e-shop είναι η μάρκα + αυτό το όνομα (η μάρκα μπαίνει μόνη της αν λείπει)." wide>
            <input disabled={dis} value={String(v.name ?? "")} maxLength={128} onChange={(e) => set("name", e.target.value)} className={input} />
          </Field>
          <Field label="Barcode (EAN)"><input disabled={dis} value={String(v.barcode ?? "")} inputMode="numeric" onChange={(e) => set("barcode", e.target.value)} className={input} /></Field>
          <Field label="Κωδικός κατασκευαστή"><input disabled={dis} value={String(v.factoryCode ?? "")} onChange={(e) => set("factoryCode", e.target.value)} className={input} /></Field>
          <label className="flex items-center gap-2 min-h-11 md:min-h-9 font-semibold text-eu-ink-2 text-[length:var(--fs-13)] @2xl:col-span-2">
            <input type="checkbox" disabled={dis} checked={String(v.active) === "1" || v.active === true} onChange={(e) => set("active", e.target.checked ? 1 : 0)} className="size-4 accent-eu-navy" />
            Ενεργό στο SoftOne <span className="font-normal text-eu-muted text-[length:var(--fs-12)]">(ανενεργό είδος κρύβεται από το e-shop)</span>
          </label>
          <dl className="m-0 @2xl:col-span-2 grid gap-x-4 gap-y-0.5 [grid-template-columns:repeat(auto-fill,minmax(10rem,1fr))] rounded-lg bg-eu-surface px-2.5 py-1.5 text-[length:var(--fs-12)]">
            {([["Κωδικός είδους", meta.code], ["SoftOne MTRL", meta.mtrl], ["Μάρκα", meta.brand], ["Κατηγορία", meta.category]] as const).map(([k, val]) => <div key={k} className="min-w-0"><dt className="text-eu-muted">{k}</dt><dd className="m-0 font-bold text-eu-ink break-words">{val}</dd></div>)}
          </dl>
        </div>
      </AccordionItem>
      )}

      {show("texts") && (
      <AccordionItem id="texts" title="Περιγραφές" icon={<FileText className="size-4" aria-hidden />} summary={String(v.shortDesc ?? "") || "Χωρίς σύντομη περιγραφή"} badge={S1} defaultOpen={open}>
        <div className="grid gap-2">
          <Field label="Σύντομη περιγραφή" help="Μία–δύο προτάσεις κάτω από τον τίτλο του προϊόντος.">
            <textarea disabled={dis} rows={2} maxLength={4000} value={String(v.shortDesc ?? "")} onChange={(e) => set("shortDesc", e.target.value)} className={`${input} py-1.5 min-h-14`} />
          </Field>
          <Field label="Αναλυτική περιγραφή" help={`Κείμενο και χαρακτηριστικά μαζί, όπως στο SoftOne. Κάθε γραμμή «Ετικέτα : τιμή» γίνεται χαρακτηριστικό (τώρα ${parsed.specs.length}) — ή άλλαξέ τα πιο εύκολα στην ενότητα «Χαρακτηριστικά».`}>
            <textarea disabled={dis} rows={10} value={raw} onChange={(e) => set("longDesc", e.target.value)} className={`${input} py-1.5 font-mono text-[length:var(--fs-12)] leading-relaxed`} />
          </Field>
        </div>
      </AccordionItem>
      )}

      {show("specs") && (
      <AccordionItem id="specs" title="Χαρακτηριστικά" icon={<ListChecks className="size-4" aria-hidden />} summary={`${rows.length} χαρακτηριστικά — τροφοδοτούν τα φίλτρα και τη σύγκριση`} badge={S1} defaultOpen={open}>
        {html ? (
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Η περιγραφή αυτού του είδους έχει μορφοποίηση HTML. Για να μη χαλάσει, άλλαξε τα χαρακτηριστικά απευθείας στην «Αναλυτική περιγραφή».</p>
        ) : (
          <div className="grid gap-1.5">
            <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">Χαρακτηριστικά του <b>ERP</b>: κάθε γραμμή αλλάζει επί τόπου στην αναλυτική περιγραφή του SoftOne. Όσα έρχονται από EPREL, Icecat ή web φαίνονται με την πηγή τους στα «Χαρακτηριστικά στο site».</p>
            <ul className="m-0 p-0 list-none grid gap-1 @4xl:grid-cols-2 @4xl:gap-x-3">
              {rows.map((r) => (
                <li key={r.line} className="grid gap-1 grid-cols-[minmax(0,1fr)_auto] @xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto] items-center">
                  <input aria-label="Ετικέτα" disabled={dis} value={r.key} onChange={(e) => setRow(r.line, e.target.value, r.value)} className={`${input} col-span-2 @xl:col-span-1 font-semibold text-eu-ink-2`} />
                  <input aria-label={`Τιμή: ${r.key}`} disabled={dis} value={r.value} onChange={(e) => setRow(r.line, r.key, e.target.value)} className={input} />
                  <button type="button" disabled={dis} onClick={() => removeRow(r.line)} aria-label={`Αφαίρεση: ${r.key}`} className="justify-self-end size-11 md:size-9 grid place-items-center rounded-full text-eu-muted hover:bg-eu-red/10 hover:text-eu-red disabled:opacity-40 cursor-pointer"><Trash2 className="size-4" aria-hidden /></button>
                </li>
              ))}
            </ul>
            {!readonly && <button type="button" disabled={dis} onClick={addRow} className="justify-self-start inline-flex items-center gap-1.5 rounded-full bg-eu-surface text-eu-navy font-bold px-3 min-h-11 md:min-h-8 text-[length:var(--fs-13)] hover:bg-eu-chip cursor-pointer"><Plus className="size-4" aria-hidden /> Νέο χαρακτηριστικό</button>}
          </div>
        )}
      </AccordionItem>
      )}

      {show("dims") && (
      <AccordionItem id="dims" title="Διαστάσεις & βάρος" icon={<Ruler className="size-4" aria-hidden />} summary={[v.widthCm, v.heightCm, v.lengthCm].some((x) => x) ? `${v.widthCm || "-"} × ${v.heightCm || "-"} × ${v.lengthCm || "-"} εκ.${v.weightKg ? ` · ${v.weightKg} kg` : ""}` : "Δεν έχουν συμπληρωθεί στο SoftOne"} badge={S1} defaultOpen={open}>
        <div className="grid gap-2 grid-cols-2 @lg:grid-cols-4">
          {dimInput("widthCm", "Πλάτος", "εκ.")}{dimInput("heightCm", "Ύψος", "εκ.")}{dimInput("lengthCm", "Βάθος", "εκ.")}{dimInput("weightKg", "Βάρος", "kg")}
        </div>
        {(() => {
          const list: DimCandidate[] = dimCandidates ?? (descDims ? [{ source: "s1-desc", ...descDims }] : []);
          if (!list.length) return <p className="m-0 mt-1.5 text-eu-muted text-[length:var(--fs-12)]">Καμία διάσταση στο περιεχόμενο (EPREL, περιγραφή). Για μεταφορικά, «Χωράει;» και AR.</p>;
          const sameAs = (c: DimCandidate) => same(v.widthCm, c.w) && same(v.heightCm, c.h) && same(v.lengthCm, c.d);
          const anyDiff = list.some((c) => !sameAs(c));
          return (
            <div className="mt-2 grid gap-1" data-help="product.dims-from-content">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="font-semibold text-eu-ink-2 text-[length:var(--fs-12)]">Από το περιεχόμενο</span>
                <span className="text-eu-muted text-[length:var(--fs-12)]">Π × Υ × Β, εκ. · το EPREL προηγείται για το «χωράει;»</span>
              </div>
              <ul className="m-0 p-0 list-none rounded-lg border border-eu-line divide-y divide-eu-line-2">
                {list.map((c, i) => { const ok = sameAs(c); return (
                  <li key={i} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 px-2 py-1">
                    <SourceBadge source={c.source} size="xs" />
                    <span className="min-w-0 flex flex-wrap items-baseline gap-x-2">
                      <b className="tabular-nums text-eu-ink text-[length:var(--fs-13)]">{c.w} × {c.h} × {c.d}{c.kind && c.kind !== "product" ? <span className="font-normal text-eu-muted"> ({c.kind})</span> : null}</b>
                      <span title={c.line} className="text-eu-muted text-[length:var(--fs-12)] truncate max-w-full">{c.line}</span>
                      {c.note && <span className="text-eu-amber font-semibold text-[length:var(--fs-12)]">{c.note}</span>}
                    </span>
                    {ok ? <span className="inline-flex items-center gap-1 text-eu-green font-bold text-[length:var(--fs-12)]"><Check className="size-3.5" aria-hidden />ίδιες</span>
                      : !readonly ? <button type="button" disabled={dis} onClick={() => { set("widthCm", c.w); set("heightCm", c.h); set("lengthCm", c.d); }} className="inline-flex items-center gap-1 rounded-full border border-eu-navy text-eu-navy font-bold px-2.5 min-h-11 md:min-h-8 text-[length:var(--fs-12)] hover:bg-eu-navy hover:text-white cursor-pointer">Χρήση αυτών</button>
                      : <span className="text-eu-amber font-bold text-[length:var(--fs-12)]">διαφέρουν</span>}
                  </li>
                ); })}
              </ul>
              {anyDiff && !readonly && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-12)]">Η «Αποθήκευση σε SoftOne + eshop» τις γράφει και στα δύο.</p>}
            </div>
          );
        })()}
      </AccordionItem>
      )}

      {show("warranty") && (
      <AccordionItem id="warranty" title="Εγγύηση & διαθεσιμότητα" icon={<ShieldCheck className="size-4" aria-hidden />} summary={`${v.guaranteeMonths ? `${v.guaranteeMonths} μήνες εγγύηση` : "Χωρίς εγγύηση στο SoftOne"}${String(v.availText ?? "") ? ` · «${String(v.availText).slice(0, 40)}»` : ""}`} badge={S1} defaultOpen={open}>
        <div className="grid gap-2 @2xl:grid-cols-2">
          <Field label="Εγγύηση (μήνες)"><input type="number" inputMode="numeric" min={0} step={1} disabled={dis} value={v.guaranteeMonths == null ? "" : String(v.guaranteeMonths)} onChange={(e) => set("guaranteeMonths", e.target.value === "" ? null : e.target.value)} className={input} /></Field>
          <label className="flex items-center gap-2 min-h-11 md:min-h-9 self-end font-semibold text-eu-ink-2 text-[length:var(--fs-13)]">
            <input type="checkbox" disabled={dis} checked={String(v.extWarranty) === "1" || v.extWarranty === true} onChange={(e) => set("extWarranty", e.target.checked ? 1 : 0)} className="size-4 accent-eu-navy" /> Διαθέσιμη επέκταση εγγύησης
          </label>
          <Field label="Κείμενο διαθεσιμότητας" help="Εμφανίζεται αντί για το «Άμεσα διαθέσιμο / κατόπιν παραγγελίας» όταν είναι συμπληρωμένο." wide>
            <input disabled={dis} maxLength={1000} value={String(v.availText ?? "")} onChange={(e) => set("availText", e.target.value)} className={input} />
          </Field>
        </div>
      </AccordionItem>
      )}

      {(dirty.length > 0 || result) && (
        <div className="sticky bottom-2 z-20 rounded-xl border border-eu-line bg-white/95 backdrop-blur shadow-[var(--shadow-overlay)] px-3 py-2 grid gap-1.5">
          {result && (
            <div role="status" className={`rounded-lg px-2.5 py-1.5 text-[length:var(--fs-13)] ${result.ok ? "bg-eu-green/12 text-eu-ink" : "bg-eu-red/10 text-eu-red"}`}>
              <span className="font-bold">{result.text}</span>
              {!!result.details?.length && <ul className="m-0 mt-1 pl-5 text-[length:var(--fs-13)]">{result.details.map((d) => <li key={d}>{d}</li>)}</ul>}
            </div>
          )}
          {dirty.length > 0 && (confirm ? (
            <div className="grid gap-2">
              <p className="m-0 inline-flex items-start gap-2 text-eu-ink-2 text-[length:var(--fs-13)]"><AlertTriangle className="size-4 mt-0.5 shrink-0 text-eu-amber" aria-hidden /> Θα γραφτούν στο SoftOne (παραγωγή) και αμέσως στο e-shop:</p>
              <ul className="m-0 pl-5 grid gap-0.5 text-[length:var(--fs-12)] text-eu-ink-2 max-h-40 overflow-y-auto">
                {dirty.map((k) => <li key={k} className="break-words"><b>{LABEL[k]}</b>{k === "longDesc" || k === "shortDesc" ? ": άλλαξε το κείμενο" : `: «${String(base[k] ?? "-")}» → «${String(v[k] ?? "-")}»`}</li>)}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={pending} onClick={save} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-bold px-4 min-h-11 md:min-h-9 text-[length:var(--fs-13)] hover:bg-eu-blue disabled:opacity-60 cursor-pointer">{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />} {pending ? "Γράφω στο SoftOne…" : "Ναι, αποθήκευση"}</button>
                <button type="button" disabled={pending} onClick={() => setConfirm(false)} className="rounded-full border border-eu-line px-3.5 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] hover:border-eu-navy cursor-pointer">Πίσω</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-eu-ink-2 font-bold text-[length:var(--fs-13)] mr-auto">{dirty.length} {dirty.length === 1 ? "αλλαγή" : "αλλαγές"}: {dirty.map((k) => LABEL[k]).join(", ")}</span>
              <button type="button" onClick={() => { setV(base); setResult(null); }} className="inline-flex items-center gap-1.5 rounded-full border border-eu-line px-3.5 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] hover:border-eu-navy cursor-pointer"><Undo2 className="size-4" aria-hidden /> Ακύρωση</button>
              <button type="button" disabled={readonly} onClick={() => setConfirm(true)} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-bold px-4 min-h-11 md:min-h-9 text-[length:var(--fs-13)] hover:bg-eu-blue disabled:opacity-50 cursor-pointer"><Save className="size-4" aria-hidden /> Αποθήκευση σε SoftOne + eshop</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
