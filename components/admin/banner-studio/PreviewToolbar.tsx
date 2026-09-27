"use client";

import { ArrowDown, ArrowUp, EyeOff, ImageOff, MousePointerClick, PencilLine, Star, Trash2, Undo2 } from "lucide-react";
import { IMAGE_SIZES, LAYOUTS, type ImageSize, type SectionLayout, type StudioFeature, type StudioImage, type StudioSection } from "@/lib/catalog/banner-doc";

/**
 * Γραμμή επεξεργασίας της προεπισκόπησης: ό,τι επιλέχθηκε με κλικ (ενότητα, φωτογραφία, κάρτα) και οι κινήσεις του.
 * Όλες οι αλλαγές γράφονται στο πρόχειρο — δεν δημοσιεύεται τίποτα μέχρι το «Δημοσίευση».
 */
export type PreviewTarget =
  | { kind: "section"; section: StudioSection; index: number; count: number }
  | { kind: "image"; section: StudioSection; image: StudioImage; main: boolean; natural: number }
  | { kind: "feature"; section: StudioSection; feature: StudioFeature };

export interface PreviewActions {
  move: (sectionId: string, dir: -1 | 1) => void;
  layout: (sectionId: string, l: SectionLayout | undefined) => void;
  hideSection: (sectionId: string) => void;
  editText: (sectionId: string) => void;
  selectSection: (sectionId: string) => void;
  imageSize: (imageId: string, size: ImageSize | undefined) => void;
  imageMain: (imageId: string) => void;
  imageDelete: (imageId: string) => void;
  featureDelete: (sectionId: string, featureId: string) => void;
  featureIcon: (sectionId: string, featureId: string) => void;
  undo: () => void;
  deselect: () => void;
}

const btn = "inline-flex items-center gap-1.5 rounded-full border border-eu-line bg-white px-3 min-h-11 font-bold text-eu-ink text-[length:var(--fs-14)] hover:border-eu-blue hover:text-eu-blue disabled:opacity-40 disabled:pointer-events-none";
const danger = `${btn} hover:!border-eu-red hover:!text-eu-red`;
const seg = (on: boolean) => `px-3 min-h-11 font-bold text-[length:var(--fs-14)] ${on ? "bg-eu-navy text-white" : "text-eu-ink hover:text-eu-blue"}`;
const nameOf = (s: StudioSection) => s.title?.text.trim() || s.heading || s.subtitle?.text.trim() || "Ενότητα χωρίς τίτλο";

export function PreviewToolbar({ target, canUndo, a }: { target: PreviewTarget | null; canUndo: boolean; a: PreviewActions }) {
  return (
    <div className="sticky top-2 z-20 rounded-2xl border border-eu-line bg-white/95 backdrop-blur shadow-[0_6px_24px_rgba(18,42,88,.10)] px-3 py-2 flex flex-wrap items-center gap-2" role="toolbar" aria-label="Επεξεργασία προεπισκόπησης">
      {!target ? (
        <span className="inline-flex items-center gap-2 text-eu-ink-3 text-[length:var(--fs-15)] px-1 min-h-11"><MousePointerClick className="size-5 text-eu-blue" aria-hidden /> Κάνε κλικ σε ενότητα, φωτογραφία ή κάρτα για να την αλλάξεις.</span>
      ) : target.kind === "section" ? (
        <>
          <span className="font-extrabold text-eu-ink text-[length:var(--fs-15)] px-1 max-w-[22rem] truncate" title={nameOf(target.section)}>Ενότητα: {nameOf(target.section)}</span>
          <button type="button" className={btn} disabled={target.index === 0} onClick={() => a.move(target.section.id, -1)} aria-label="Μετακίνηση πάνω"><ArrowUp className="size-4" aria-hidden /> Πάνω</button>
          <button type="button" className={btn} disabled={target.index === target.count - 1} onClick={() => a.move(target.section.id, 1)} aria-label="Μετακίνηση κάτω"><ArrowDown className="size-4" aria-hidden /> Κάτω</button>
          <label className="inline-flex items-center gap-2 text-eu-ink-3 font-semibold text-[length:var(--fs-14)]">Διάταξη
            <select value={target.section.layout ?? ""} onChange={(e) => a.layout(target.section.id, (e.target.value || undefined) as SectionLayout | undefined)} className="rounded-full border border-eu-line bg-white px-3 min-h-11 text-eu-ink text-[length:var(--fs-15)]">
              <option value="">Αυτόματη</option>
              {LAYOUTS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
            </select>
          </label>
          <button type="button" className={btn} onClick={() => a.editText(target.section.id)}><PencilLine className="size-4" aria-hidden /> Κείμενο</button>
          <button type="button" className={danger} onClick={() => a.hideSection(target.section.id)}><Trash2 className="size-4" aria-hidden /> Αφαίρεση</button>
        </>
      ) : target.kind === "image" ? (
        <>
          <span className="font-extrabold text-eu-ink text-[length:var(--fs-15)] px-1">Φωτογραφία</span>
          <div role="radiogroup" aria-label="Μέγεθος" className="inline-flex rounded-full border border-eu-line overflow-hidden">
            <button type="button" role="radio" aria-checked={!target.image.size} className={seg(!target.image.size)} onClick={() => a.imageSize(target.image.id, undefined)}>Αυτόματο</button>
            {IMAGE_SIZES.map((z) => <button key={z.key} type="button" role="radio" aria-checked={target.image.size === z.key} className={seg(target.image.size === z.key)} onClick={() => a.imageSize(target.image.id, z.key)}>{z.label}</button>)}
          </div>
          {!target.main && <button type="button" className={btn} onClick={() => a.imageMain(target.image.id)}><Star className="size-4" aria-hidden /> Κύρια</button>}
          <button type="button" className={btn} onClick={() => a.selectSection(target.section.id)}>Όλη η ενότητα</button>
          <button type="button" className={danger} onClick={() => a.imageDelete(target.image.id)}><ImageOff className="size-4" aria-hidden /> Αφαίρεση</button>
          <span className="text-eu-muted text-[length:var(--fs-13)] basis-full px-1">Πραγματικό πλάτος {target.natural}px — δεν μεγαλώνει πέρα από αυτό, για να μη θολώσει.</span>
        </>
      ) : (
        <>
          <span className="font-extrabold text-eu-ink text-[length:var(--fs-15)] px-1 max-w-[22rem] truncate" title={target.feature.label}>Κάρτα: {target.feature.label}</span>
          {target.feature.icon && <button type="button" className={btn} onClick={() => a.featureIcon(target.section.id, target.feature.id)}><EyeOff className="size-4" aria-hidden /> {target.feature.includeIcon ? "Χωρίς εικονίδιο" : "Με εικονίδιο"}</button>}
          <button type="button" className={btn} onClick={() => a.selectSection(target.section.id)}>Όλη η ενότητα</button>
          <button type="button" className={danger} onClick={() => a.featureDelete(target.section.id, target.feature.id)}><Trash2 className="size-4" aria-hidden /> Αφαίρεση</button>
        </>
      )}
      <span className="ml-auto flex items-center gap-2">
        {target && <button type="button" className={btn} onClick={a.deselect}>Τέλος</button>}
        <button type="button" className={btn} disabled={!canUndo} onClick={a.undo} title="Αναίρεση (⌘Z)"><Undo2 className="size-4" aria-hidden /> Αναίρεση</button>
      </span>
    </div>
  );
}
