"use client";

import { ArrowDown, ArrowUp, Combine, ImagePlus, Languages, Plus, Sparkles, Trash2, X } from "lucide-react";
import { CropView } from "./CropView";
import type { BoxSel } from "./BoxCanvas";
import { uid, LAYOUTS, type SectionLayout, type StudioDoc, type StudioSection, type StudioText } from "@/lib/catalog/banner-doc";

const field = "w-full rounded-lg border border-eu-line bg-white px-3 py-2 text-eu-ink text-[length:var(--fs-16)] min-h-11 focus-visible:outline-2 focus-visible:outline-eu-blue";
const label = "grid gap-1 text-eu-ink-3 font-semibold text-[length:var(--fs-14)]";
const iconBtn = "inline-flex items-center justify-center size-11 rounded-full text-eu-ink-3 hover:bg-eu-surface hover:text-eu-ink disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-eu-blue";
const smallBtn = "inline-flex items-center gap-1.5 rounded-full border border-eu-line bg-white px-3 min-h-10 font-bold text-eu-blue text-[length:var(--fs-14)] hover:border-eu-blue focus-visible:outline-2 focus-visible:outline-eu-blue";

/** Πεδίο κειμένου με το πρωτότυπο από κάτω, όταν αυτό που εμφανίζεται είναι μετάφραση. */
function TextField({ name, value, multiline, placeholder, onChange, onRemove }: { name: string; value: StudioText; multiline?: boolean; placeholder?: string; onChange: (t: StudioText) => void; onRemove?: () => void }) {
  return (
    <div className="grid gap-1">
      <div className="flex items-end gap-1">
        <label className={`${label} flex-1 min-w-0`}>
          {name}
          {multiline ? (
            <textarea value={value.text} placeholder={placeholder} onChange={(e) => onChange({ ...value, text: e.target.value })} rows={3} className={`${field} [field-sizing:content] min-h-24 leading-relaxed resize-y`} />
          ) : (
            <input value={value.text} placeholder={placeholder} onChange={(e) => onChange({ ...value, text: e.target.value })} className={field} />
          )}
        </label>
        {onRemove && <button type="button" onClick={onRemove} className={iconBtn} aria-label={`Αφαίρεση: ${name}`} title="Αφαίρεση"><X className="size-4" aria-hidden /></button>}
      </div>
      {value.original && value.original !== value.text && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-eu-muted text-[length:var(--fs-14)]">
          <Languages className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0">Πρωτότυπο: <span className="text-eu-ink-3">{value.original}</span></span>
          <button type="button" onClick={() => onChange({ ...value, text: value.original!, original: value.text })} className="font-bold text-eu-blue underline-offset-2 hover:underline min-h-8">αντί για τη μετάφραση</button>
        </div>
      )}
    </div>
  );
}

/**
 * Μία ενότητα όπως θα δημοσιευτεί: τίτλος, υπότιτλος, παράγραφοι, χαρακτηριστικά (με ή χωρίς εικονίδιο), υποσημείωση,
 * φωτογραφίες. Όλα προαιρετικά — ό,τι μείνει κενό δεν εμφανίζεται. Η επιλογή μιας φωτογραφίας την επισημαίνει στην
 * εικόνα αριστερά για διόρθωση πλαισίου.
 */
export function SectionEditor({ doc, s, index, total, selected, selectedBox, onSelect, onChange, onMove, onRemove, onMergeUp, onSelectBox, onDraw, drawing }: {
  doc: StudioDoc; s: StudioSection; index: number; total: number; selected: boolean; selectedBox: BoxSel | null; drawing: boolean;
  onSelect: () => void; onChange: (s: StudioSection) => void; onMove: (dir: -1 | 1) => void; onRemove: () => void; onMergeUp: () => void; onSelectBox: (sel: BoxSel) => void; onDraw: () => void;
}) {
  const set = <K extends keyof StudioSection>(k: K, v: StudioSection[K]) => onChange({ ...s, [k]: v });
  const n = index + 1;
  return (
    <section aria-label={`Ενότητα ${n}`} onFocusCapture={onSelect} onClick={onSelect}
      className={`rounded-2xl border-2 bg-white p-4 grid gap-4 scroll-mt-28 ${selected ? "border-eu-navy shadow-[0_8px_24px_rgba(18,42,88,.12)]" : "border-eu-line"} ${s.include ? "" : "bg-eu-surface"}`} id={`sec-${s.id}`}>
      <header className="flex flex-wrap items-center gap-2">
        <span className={`size-8 rounded-full inline-flex items-center justify-center font-extrabold text-[length:var(--fs-15)] ${selected ? "bg-eu-navy text-white" : "bg-eu-blue text-white"}`}>{n}</span>
        <label className="inline-flex items-center gap-2 min-h-11 cursor-pointer font-bold text-eu-ink text-[length:var(--fs-15)]">
          <input type="checkbox" checked={s.include} onChange={(e) => set("include", e.target.checked)} className="size-5 accent-eu-blue" />
          {s.include ? "Θα δημοσιευτεί" : "Εκτός δημοσίευσης"}
        </label>
        <div className="ml-auto flex items-center">
          <button type="button" className={iconBtn} disabled={index === 0} onClick={() => onMove(-1)} aria-label="Μετακίνηση πάνω" title="Πάνω"><ArrowUp className="size-4" aria-hidden /></button>
          <button type="button" className={iconBtn} disabled={index === total - 1} onClick={() => onMove(1)} aria-label="Μετακίνηση κάτω" title="Κάτω"><ArrowDown className="size-4" aria-hidden /></button>
          <button type="button" className={iconBtn} disabled={index === 0} onClick={onMergeUp} aria-label="Ένωση με την προηγούμενη ενότητα" title="Ένωση με την προηγούμενη"><Combine className="size-4" aria-hidden /></button>
          <button type="button" className={`${iconBtn} hover:text-eu-red`} onClick={onRemove} aria-label="Διαγραφή ενότητας" title="Διαγραφή"><Trash2 className="size-4" aria-hidden /></button>
        </div>
      </header>

      {!s.include && s.mergedInto && (
        <p className="m-0 flex gap-2 items-start rounded-xl bg-eu-surface px-3 py-2 text-eu-ink-3 text-[length:var(--fs-14)]"><Sparkles className="size-4 text-eu-blue shrink-0 mt-0.5" aria-hidden /> Μπήκε ως κάρτα σε πλέγμα λειτουργιών μαζί με άλλες μονές λειτουργίες — δεν χάθηκε.</p>
      )}
      {!s.include && s.dropReason && (
        <p className="m-0 flex gap-2 items-start rounded-xl bg-eu-surface px-3 py-2 text-eu-ink-3 text-[length:var(--fs-14)]"><Sparkles className="size-4 text-eu-blue shrink-0 mt-0.5" aria-hidden /> Ο σχεδιαστής την έβγαλε εκτός: {s.dropReason} — τσέκαρε «Θα δημοσιευτεί» αν τη θέλεις.</p>
      )}
      {s.include && (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <label className={`${label} flex-1 min-w-[14rem]`}>
              <span className="inline-flex items-center gap-1.5">Εμφάνιση στη σελίδα {s.designedBy === "ai" && <span className="inline-flex items-center gap-1 rounded-full bg-eu-chip text-eu-blue px-2 py-0.5 text-[length:var(--fs-13)] font-bold"><Sparkles className="size-3.5" aria-hidden /> επιλογή AI</span>}</span>
              <select value={s.layout ?? ""} onChange={(e) => onChange({ ...s, layout: (e.target.value || undefined) as SectionLayout | undefined, designedBy: undefined })} className={field}>
                <option value="">Αυτόματα</option>
                {LAYOUTS.map((l) => <option key={l.key} value={l.key}>{l.label} — {l.hint}</option>)}
              </select>
            </label>
          </div>
          {(s.layout === "stats" || (s.stats?.length ?? 0) > 0) && (
            <fieldset className="m-0 p-0 border-0 grid gap-2">
              <legend className="font-semibold text-eu-ink-3 text-[length:var(--fs-14)] mb-1">Μεγάλα νούμερα <span className="font-normal text-eu-muted">— μόνο όσα γράφει το κείμενο</span></legend>
              {(s.stats ?? []).map((st, k) => (
                <div key={k} className="grid grid-cols-[8rem_minmax(0,1fr)_auto] gap-2 items-center">
                  <input value={st.value} aria-label="Νούμερο" placeholder="512" onChange={(e) => set("stats", (s.stats ?? []).map((x, j) => (j === k ? { ...x, value: e.target.value } : x)))} className={`${field} font-extrabold text-eu-navy`} />
                  <input value={st.label} aria-label="Τι μετράει" placeholder="ζώνες τοπικής ρύθμισης" onChange={(e) => set("stats", (s.stats ?? []).map((x, j) => (j === k ? { ...x, label: e.target.value } : x)))} className={field} />
                  <button type="button" className={iconBtn} onClick={() => set("stats", (s.stats ?? []).filter((_, j) => j !== k))} aria-label="Αφαίρεση νούμερου"><X className="size-4" aria-hidden /></button>
                </div>
              ))}
              {(s.stats?.length ?? 0) < 4 && <button type="button" className={`${smallBtn} justify-self-start`} onClick={() => set("stats", [...(s.stats ?? []), { value: "", label: "" }])}><Plus className="size-4" aria-hidden /> Νούμερο</button>}
            </fieldset>
          )}
          <TextField name="Τίτλος" value={s.title ?? { id: uid("t"), text: "", box: null }} placeholder="π.χ. Άνεση" onChange={(t) => set("title", t)} />
          {s.subtitle ? <TextField name="Υπότιτλος" value={s.subtitle} onChange={(t) => set("subtitle", t)} onRemove={() => set("subtitle", null)} /> : null}

          <div className="grid gap-3">
            {s.paragraphs.map((p, k) => (
              <TextField key={p.id} name={s.paragraphs.length > 1 ? `Παράγραφος ${k + 1}` : "Κείμενο"} value={p} multiline
                onChange={(t) => set("paragraphs", s.paragraphs.map((x) => (x.id === p.id ? t : x)))}
                onRemove={() => set("paragraphs", s.paragraphs.filter((x) => x.id !== p.id))} />
            ))}
          </div>

          {s.features.length > 0 && (
            <fieldset className="m-0 p-0 border-0 grid gap-2">
              <legend className="font-semibold text-eu-ink-3 text-[length:var(--fs-14)] mb-1">Χαρακτηριστικά με εικονίδιο</legend>
              {s.features.map((f) => (
                <div key={f.id} className={`flex items-center gap-2 rounded-xl p-1.5 ${selectedBox?.id === f.id ? "bg-eu-chip" : ""}`}>
                  {f.icon ? (
                    <button type="button" onClick={() => onSelectBox({ sectionId: s.id, kind: "icon", id: f.id })} aria-label={`Εικονίδιο «${f.label}»: επιλογή για διόρθωση πλαισίου`} title="Διόρθωση πλαισίου εικονιδίου"
                      className={`shrink-0 size-12 rounded-lg border-2 overflow-hidden ${f.includeIcon ? "border-eu-line" : "border-dashed border-eu-line opacity-40"} ${selectedBox?.id === f.id ? "border-eu-yellow" : ""}`}>
                      <CropView src={doc.sourceUrl} box={f.icon} width={doc.width} height={doc.height} className="w-full h-full [aspect-ratio:auto]" />
                    </button>
                  ) : <span className="shrink-0 size-12 rounded-lg bg-eu-surface inline-flex items-center justify-center text-eu-muted text-[length:var(--fs-13)]">—</span>}
                  <input value={f.label} aria-label="Χαρακτηριστικό" onChange={(e) => set("features", s.features.map((x) => (x.id === f.id ? { ...x, label: e.target.value } : x)))} className={`${field} flex-1 min-w-0 ${f.include ? "" : "opacity-50"}`} />
                  {f.icon && (
                    <label className="inline-flex items-center gap-1.5 min-h-11 px-1 text-eu-ink-3 text-[length:var(--fs-14)] cursor-pointer whitespace-nowrap">
                      <input type="checkbox" checked={f.includeIcon} onChange={(e) => set("features", s.features.map((x) => (x.id === f.id ? { ...x, includeIcon: e.target.checked } : x)))} className="size-5 accent-eu-blue" /> εικονίδιο
                    </label>
                  )}
                  <button type="button" className={iconBtn} onClick={() => set("features", s.features.filter((x) => x.id !== f.id))} aria-label={`Αφαίρεση χαρακτηριστικού «${f.label}»`}><X className="size-4" aria-hidden /></button>
                </div>
              ))}
            </fieldset>
          )}

          {s.images.length > 0 && (
            <fieldset className="m-0 p-0 border-0 grid gap-2">
              <legend className="font-semibold text-eu-ink-3 text-[length:var(--fs-14)] mb-1">Φωτογραφίες</legend>
              {s.images.map((im, k) => {
                const active = selectedBox?.id === im.id;
                return (
                  <div key={im.id} className={`grid grid-cols-[7rem_minmax(0,1fr)] gap-3 items-start rounded-xl p-2 border-2 ${active ? "border-eu-yellow bg-eu-yellow/10" : "border-transparent"}`}>
                    <button type="button" onClick={() => onSelectBox({ sectionId: s.id, kind: "image", id: im.id })} aria-label={`Φωτογραφία ${k + 1}: επιλογή για διόρθωση πλαισίου`} className={`rounded-lg overflow-hidden border border-eu-line ${im.include ? "" : "opacity-40"}`}>
                      <CropView src={doc.sourceUrl} box={im.box} width={doc.width} height={doc.height} className="w-full max-h-28" alt={im.alt} />
                    </button>
                    <div className="grid gap-2 min-w-0">
                      <input value={im.alt} onChange={(e) => set("images", s.images.map((x) => (x.id === im.id ? { ...x, alt: e.target.value } : x)))} aria-label="Περιγραφή φωτογραφίας (alt)" placeholder="Τι δείχνει η φωτογραφία" className={field} />
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <label className="inline-flex items-center gap-2 min-h-10 cursor-pointer text-eu-ink-3 text-[length:var(--fs-14)]">
                          <input type="checkbox" checked={im.include} onChange={(e) => set("images", s.images.map((x) => (x.id === im.id ? { ...x, include: e.target.checked } : x)))} className="size-5 accent-eu-blue" /> Θα δημοσιευτεί
                        </label>
                        {im.overlayText && <span className="text-eu-amber font-semibold text-[length:var(--fs-14)]">Έχει γράμματα πάνω — μίκρυνε το πλαίσιο αν γίνεται</span>}
                        <button type="button" onClick={() => set("images", s.images.filter((x) => x.id !== im.id))} className="ml-auto font-bold text-eu-muted hover:text-eu-red text-[length:var(--fs-14)] min-h-10 px-1">Αφαίρεση</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </fieldset>
          )}

          {s.footnote && <TextField name="Υποσημείωση (μικρά γράμματα)" value={s.footnote} multiline onChange={(t) => set("footnote", t)} onRemove={() => set("footnote", null)} />}

          <div className="flex flex-wrap gap-2">
            {!s.subtitle && <button type="button" className={smallBtn} onClick={() => set("subtitle", { id: uid("t"), text: "", box: null })}><Plus className="size-4" aria-hidden /> Υπότιτλος</button>}
            <button type="button" className={smallBtn} onClick={() => set("paragraphs", [...s.paragraphs, { id: uid("t"), text: "", box: null }])}><Plus className="size-4" aria-hidden /> Παράγραφος</button>
            <button type="button" className={smallBtn} onClick={() => set("features", [...s.features, { id: uid("f"), label: "", box: null, icon: null, include: true, includeIcon: false }])}><Plus className="size-4" aria-hidden /> Χαρακτηριστικό</button>
            {!s.footnote && <button type="button" className={smallBtn} onClick={() => set("footnote", { id: uid("t"), text: "", box: null })}><Plus className="size-4" aria-hidden /> Υποσημείωση</button>}
            <button type="button" className={`${smallBtn} ${drawing ? "bg-eu-yellow border-eu-yellow text-eu-navy" : ""}`} onClick={onDraw} aria-pressed={drawing}>
              <ImagePlus className="size-4" aria-hidden /> {drawing ? "Σύρε πάνω στο banner…" : "Φωτογραφία από το banner"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
