/**
 * Το έγγραφο της απόδελτίωσης όπως το διορθώνει ο διαχειριστής στο εργαλείο — κοινό για server και browser (καθαρό module).
 * Κάθε ενότητα γίνεται μία `ProductSection`. Τα πλαίσια είναι κλάσματα 0…1 της αρχικής εικόνας (x, y, πλάτος, ύψος).
 */
export type Box = [number, number, number, number];

export interface StudioText { id: string; text: string; /** το πρωτότυπο, όταν το `text` είναι μετάφραση */ original?: string; box: Box | null }
export interface StudioFeature { id: string; label: string; original?: string; box: Box | null; icon: Box | null; include: boolean; includeIcon: boolean }
export interface StudioImage { id: string; box: Box; alt: string; kind: string; overlayText: boolean; include: boolean }
export interface StudioSection {
  id: string;
  include: boolean;
  title: StudioText | null;
  subtitle: StudioText | null;
  paragraphs: StudioText[];
  features: StudioFeature[];
  footnote: StudioText | null;
  images: StudioImage[];
}
export interface StudioDoc { sourceUrl: string; width: number; height: number; lang: string; sections: StudioSection[] }

/** Ό,τι γράφεται στη βάση ως ProductSection (και ό,τι αποδίδει η σελίδα προϊόντος). */
export interface SectionImage { url: string; width: number; height: number; alt: string }
export interface SectionFeature { label: string; iconUrl?: string; iconW?: number; iconH?: number }
export interface PublishedSection { id: string; title: string | null; subtitle: string | null; body: string | null; features: SectionFeature[]; footnote: string | null; images: SectionImage[] }

let seq = 0;
export const uid = (p = "x") => `${p}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Μια ενότητα έχει κάτι να δημοσιεύσει; */
export const sectionHasContent = (s: StudioSection) => !!(s.title?.text.trim() || s.subtitle?.text.trim() || s.paragraphs.some((p) => p.text.trim()) || s.features.some((f) => f.include && f.label.trim()) || s.images.some((i) => i.include));

export const emptySection = (): StudioSection => ({ id: uid("s"), include: true, title: { id: uid("t"), text: "", box: null }, subtitle: null, paragraphs: [], features: [], footnote: null, images: [] });
