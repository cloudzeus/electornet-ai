"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, CircleAlert, Images, Loader2, Plus, Save, Tags, Tag, X } from "lucide-react";
import { mergeEdits } from "@/lib/catalog/xml-import/diff-core";
import { priceWarning } from "@/lib/catalog/xml-import/transform-core";
import { DIFF, STATUS, headerLabel, isDecimal, sectionOf, type ItemDTO, type Section } from "@/lib/catalog/xml-import/ui-core";
import type { PriceMode } from "@/lib/catalog/xml-import/transform-core";
import { ImageOrder } from "./ImageOrder";

const btn = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-14)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const primary = `${btn} bg-eu-navy text-white hover:bg-eu-blue`;
const secondary = `${btn} border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`;
const quiet = `${btn} text-eu-ink-3 hover:bg-eu-surface`;
const field = "w-full min-w-0 rounded-lg border border-eu-line bg-white px-3 py-2 min-h-11 md:min-h-9 text-[length:var(--fs-14)] focus-visible:outline-2 focus-visible:outline-eu-blue";

export interface ModalNav { hasPrev: boolean; hasNext: boolean; onPrev: () => void; onNext: () => void }

/**
 * Ένα προϊόν του feed, προς έλεγχο και διόρθωση. Τέσσερις ενότητες (στοιχεία / χαρακτηριστικά / τιμή / φωτογραφίες),
 * πλοήγηση ‹ προηγούμενο / επόμενο › χωρίς κλείσιμο, και δύο κανόνες που κρατούν τη δουλειά του χρήστη ορατή:
 *
 * - **«ήρθε ως»** σε γκρι δίπλα σε κάθε πεδίο που διόρθωσε — ποτέ δεν χάνεται η τιμή του προμηθευτή.
 * - **Σύγκρουση** (ο προμηθευτής άλλαξε κάτι που ο χρήστης είχε πειράξει): φαίνονται **και οι δύο** τιμές, με κουμπί
 *   για να πάρει τη νέα. Η δική του κερδίζει εξ ορισμού, αλλά το μαθαίνει.
 *
 * Το κλείσιμο με αλλαγές ζητά επιβεβαίωση — η διόρθωση 20 πεδίων δεν χάνεται με ένα λάθος Esc.
 */
export function ProductModal({ item, targets, priceMode, writeOn, feedToSoftone, saving, nav, onSave, onClose }: {
  item: ItemDTO;
  targets: Record<string, string>;
  priceMode: PriceMode;
  writeOn: boolean;
  feedToSoftone: boolean;
  saving: boolean;
  nav: ModalNav;
  onSave: (v: { edits: Record<string, string>; images: string[]; softone: boolean | null }) => void;
  onClose: () => void;
}) {
  const { merged, conflicts } = mergeEdits(item.payload, item.edits);
  const [edits, setEdits] = useState<Record<string, string>>(item.edits ?? {});
  const [images, setImages] = useState<string[]>(item.images);
  const [softone, setSoftone] = useState<boolean | null>(item.softone);
  const [showEmpty, setShowEmpty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Άλλο προϊόν (‹ › ή ανανέωση της λίστας): η φόρμα ακολουθεί — ίδιο πρότυπο με το ProductImages
  const [shown, setShown] = useState(item.id);
  if (item.id !== shown) { setShown(item.id); setEdits(item.edits ?? {}); setImages(item.images); setSoftone(item.softone); setConfirming(false); }

  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => { panel.current?.focus(); }, [shown]);

  const dirty = images.join("\u0000") !== item.images.join("\u0000")
    || softone !== item.softone
    || JSON.stringify(edits) !== JSON.stringify(item.edits ?? {});

  const tryClose = () => (dirty ? setConfirming(true) : onClose());
  const go = (fn: () => void) => { if (dirty) { setConfirming(true); return; } fn(); };

  const valueOf = (h: string) => edits[h] ?? merged[h] ?? "";
  const set = (h: string, v: string) => setEdits((e) => {
    const next = { ...e };
    if (v.trim() && v.trim() !== (item.payload[h] ?? "")) next[h] = v; else delete next[h];
    return next;
  });

  /** Οι επικεφαλίδες μιας ενότητας: εξ ορισμού μόνο όσες έχουν τιμή (74 στήλες με 50 κενές δεν διαβάζονται). */
  const headersOf = (s: Section) => Object.keys(targets)
    .filter((h) => sectionOf(targets[h]) === s)
    .filter((h) => showEmpty || valueOf(h) || h in (item.edits ?? {}));

  const feedImages = Object.keys(targets).filter((h) => sectionOf(targets[h]) === "images").map((h) => merged[h]).filter(Boolean);
  const dropped = feedImages.filter((u) => !images.includes(u));
  const costHeader = Object.keys(targets).find((h) => targets[h] === "cost");
  const rrpHeader = Object.keys(targets).find((h) => targets[h] === "rrp");
  const warn = priceWarning(costHeader ? valueOf(costHeader) || null : null, rrpHeader ? valueOf(rrpHeader) || null : null);

  const conflictOf = (h: string) => conflicts.find((c) => c.key === h);

  /** Τα πεδία μιας ενότητας. Η ίδια γραμμή σε τρεις ενότητες — μία φορά γραμμένη. */
  const rows = (s: Section, empty: string) => {
    const hs = headersOf(s);
    if (!hs.length) return <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">{empty}</p>;
    return (
      <ul className="m-0 p-0 list-none grid gap-2 sm:grid-cols-2 min-w-0">
        {hs.map((h) => {
          const feedValue = item.payload[h] ?? "";
          const mine = valueOf(h);
          const conflict = conflictOf(h);
          const changed = h in edits;
          return (
            <li key={h} className="grid gap-1 min-w-0">
              <label className="grid gap-1 min-w-0">
                <span className="font-bold text-eu-ink-2 text-[length:var(--fs-13)] [overflow-wrap:anywhere]">{headerLabel(h)}</span>
                <textarea value={mine} rows={mine.length > 90 ? 3 : 1} disabled={saving}
                  inputMode={isDecimal(targets[h]) ? "decimal" : undefined}
                  onChange={(e) => set(h, e.target.value)} className={`${field} resize-y`} />
              </label>
              {changed && !conflict && feedValue && (
                <span className="text-eu-muted text-[length:var(--fs-12)] [overflow-wrap:anywhere]">ήρθε ως: {feedValue}</span>
              )}
              {conflict && (
                <div className="grid gap-1 rounded-lg bg-eu-yellow/15 px-2 py-1.5 min-w-0">
                  <span className="text-eu-ink text-[length:var(--fs-12)] [overflow-wrap:anywhere]"><b>Η δική σου:</b> {conflict.mine}</span>
                  <span className="text-eu-ink text-[length:var(--fs-12)] [overflow-wrap:anywhere]"><b>Από το feed:</b> {conflict.feed}</span>
                  <button type="button" disabled={saving} onClick={() => set(h, conflict.feed)} className="justify-self-start inline-flex items-center gap-1 rounded-full border border-eu-navy px-2.5 min-h-11 md:min-h-8 font-bold text-eu-navy text-[length:var(--fs-12)] hover:bg-eu-chip focus-visible:outline-2 focus-visible:outline-eu-blue">Πάρε την τιμή του feed</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="fixed inset-0 z-[75]" role="dialog" aria-modal="true" aria-label={`Προϊόν ${item.sku}`}>
      <button type="button" className="absolute inset-0 bg-eu-navy/60 backdrop-blur-sm" aria-label="Κλείσιμο" onClick={tryClose} />
      <div ref={panel} tabIndex={-1} onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); tryClose(); } }}
        className="absolute inset-2 sm:inset-4 md:inset-8 bg-white rounded-2xl shadow-[var(--shadow-overlay)] overflow-hidden grid [grid-template-rows:auto_1fr_auto] focus-visible:outline-2 focus-visible:outline-eu-blue">

        {/* κεφαλίδα */}
        <div data-help="xml.modal.head" className="flex flex-wrap items-center gap-2 border-b border-eu-line px-3 py-2 min-w-0">
          <div className="min-w-0 flex-1 grid">
            <span className="font-heading font-bold text-eu-ink text-[length:var(--fs-16)] [overflow-wrap:anywhere]">{item.sku}</span>
            <span className="text-eu-muted text-[length:var(--fs-12)]">{DIFF[item.diff].label} · {STATUS[item.status] ?? item.status}{item.mtrl ? ` · υπάρχει στο SoftOne (MTRL ${item.mtrl})` : ""}</span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button type="button" disabled={!nav.hasPrev} onClick={() => go(nav.onPrev)} aria-label="Προηγούμενο προϊόν" title="Προηγούμενο"
              className="size-11 md:size-9 grid place-items-center rounded-full text-eu-ink-3 hover:bg-eu-chip hover:text-eu-navy disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-eu-blue"><ChevronLeft className="size-5" aria-hidden /></button>
            <button type="button" disabled={!nav.hasNext} onClick={() => go(nav.onNext)} aria-label="Επόμενο προϊόν" title="Επόμενο"
              className="size-11 md:size-9 grid place-items-center rounded-full text-eu-ink-3 hover:bg-eu-chip hover:text-eu-navy disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-eu-blue"><ChevronRight className="size-5" aria-hidden /></button>
            <button type="button" onClick={tryClose} aria-label="Κλείσιμο" className="size-11 md:size-9 grid place-items-center rounded-full text-eu-ink-3 hover:bg-eu-surface focus-visible:outline-2 focus-visible:outline-eu-blue"><X className="size-5" aria-hidden /></button>
          </div>
        </div>

        {/* περιεχόμενο */}
        <div className="overflow-y-auto overscroll-contain p-3 grid gap-4 content-start min-w-0">
          {item.problem && (
            <p role="alert" className="m-0 flex gap-2 items-start rounded-xl bg-eu-red/10 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]">
              <CircleAlert className="size-4 text-eu-red shrink-0 mt-0.5" aria-hidden /><span className="min-w-0 [overflow-wrap:anywhere]"><b>Πρόβλημα:</b> {item.problem} Η γραμμή δεν μπαίνει στην ουρά.</span>
            </p>
          )}
          {item.error && (
            <p role="alert" className="m-0 flex gap-2 items-start rounded-xl bg-eu-red/10 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]">
              <CircleAlert className="size-4 text-eu-red shrink-0 mt-0.5" aria-hidden /><span className="min-w-0 [overflow-wrap:anywhere]"><b>Σφάλμα εισαγωγής:</b> {item.error}</span>
            </p>
          )}
          {conflicts.length > 0 && (
            <div data-help="xml.modal.conflicts" className="grid gap-1.5 rounded-xl border border-eu-yellow bg-eu-yellow/15 p-3 min-w-0">
              <p className="m-0 flex gap-2 items-center font-bold text-eu-ink text-[length:var(--fs-14)]"><AlertTriangle className="size-4 shrink-0" aria-hidden /> Ο προμηθευτής άλλαξε {conflicts.length} {conflicts.length === 1 ? "πεδίο που είχες διορθώσει" : "πεδία που είχες διορθώσει"}</p>
              <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Κρατιέται η δική σου τιμή. Πιο κάτω φαίνονται και οι δύο — πάρε τη νέα αν σου κάνει.</p>
            </div>
          )}

          {/* Οι τρεις ενότητες γράφονται ξεχωριστά, ώστε το `data-help` να είναι κυριολεκτικό: το `npm run help:gen`
              σαρώνει τον κώδικα για `data-help="…"` και δεν βλέπει template literal. */}
          <section data-help="xml.modal.fields" className="grid gap-2 min-w-0" aria-labelledby="xm-fields">
            <h3 id="xm-fields" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-15)]">Στοιχεία</h3>
            {rows("fields", "Το feed δεν έδωσε στοιχεία για αυτό το προϊόν.")}
          </section>

          <section data-help="xml.modal.specs" className="grid gap-2 min-w-0" aria-labelledby="xm-specs">
            <h3 id="xm-specs" className="m-0 flex items-center gap-1.5 font-heading font-bold text-eu-ink text-[length:var(--fs-15)]"><Tags className="size-4 text-eu-blue" aria-hidden /> Χαρακτηριστικά</h3>
            {rows("specs", "Κανένα χαρακτηριστικό από το feed.")}
          </section>

          <section data-help="xml.modal.price" className="grid gap-2 min-w-0" aria-labelledby="xm-price">
            <h3 id="xm-price" className="m-0 flex items-center gap-1.5 font-heading font-bold text-eu-ink text-[length:var(--fs-15)]"><Tag className="size-4 text-eu-blue" aria-hidden /> Τιμή</h3>
            <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">
              {priceMode === "cost" ? "Τιμή από το κόστος + κανόνα markup, με πλαφόν τη λιανική του feed." : "Τιμή η λιανική του feed, χωρίς κανόνα markup."} Η τελική τιμή web υπολογίζεται στην εισαγωγή και μπαίνει μόνο όπου το είδος δεν έχει τιμή.
            </p>
            {warn && <p role="status" className="m-0 flex gap-2 items-start rounded-lg bg-eu-yellow/20 px-2.5 py-1.5 text-eu-ink text-[length:var(--fs-13)]"><AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden /><span className="min-w-0">{warn}</span></p>}
            {rows("price", "Το feed δεν έδωσε τιμές.")}
          </section>

          <section data-help="xml.modal.images" className="grid gap-2 min-w-0" aria-labelledby="xm-images">
            <h3 id="xm-images" className="m-0 flex items-center gap-1.5 font-heading font-bold text-eu-ink text-[length:var(--fs-15)]"><Images className="size-4 text-eu-blue" aria-hidden /> Φωτογραφίες{item.assets ? <span className="font-normal text-eu-muted text-[length:var(--fs-12)]">· {item.assets} έχουν ήδη ανέβει</span> : null}</h3>
            <ImageOrder urls={images} onChange={setImages} disabled={saving} />
            {dropped.length > 0 && (
              <div className="grid gap-1 min-w-0">
                <span className="font-bold text-eu-ink-2 text-[length:var(--fs-13)]">Αφαιρεμένες ({dropped.length})</span>
                <ul className="m-0 p-0 list-none grid gap-1 min-w-0">
                  {dropped.map((u) => (
                    <li key={u} className="flex items-center gap-2 min-w-0">
                      <button type="button" disabled={saving} onClick={() => setImages((xs) => [...xs, u])} aria-label={`Επαναφορά της φωτογραφίας ${u}`}
                        className="size-11 md:size-9 shrink-0 grid place-items-center rounded-full border border-eu-line text-eu-navy hover:bg-eu-chip focus-visible:outline-2 focus-visible:outline-eu-blue"><Plus className="size-4" aria-hidden /></button>
                      <span className="min-w-0 truncate text-eu-muted text-[length:var(--fs-12)]">{u}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section data-help="xml.modal.softone" className="grid gap-2 rounded-xl border border-eu-line bg-eu-surface/40 p-3 min-w-0">
            <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Αυτό το προϊόν και στο SoftOne</span>
            <div className="flex flex-wrap gap-1.5">
              {([[null, `Όπως η παρτίδα (${feedToSoftone ? "ναι" : "όχι"})`], [true, "Ναι, εξαίρεση"], [false, "Όχι, εξαίρεση"]] as [boolean | null, string][]).map(([v, label]) => (
                <button key={String(v)} type="button" disabled={saving} onClick={() => setSoftone(v)} aria-pressed={softone === v}
                  className={`${btn} ${softone === v ? "bg-eu-navy text-white" : "border-2 border-eu-line text-eu-ink-2 hover:border-eu-navy"}`}>{label}</button>
              ))}
            </div>
            <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">{writeOn ? "Οι αλλαγές προς το SoftOne είναι ανοιχτές." : "Οι αλλαγές προς το SoftOne είναι κλειστές (Ρυθμίσεις → SoftOne): ό,τι κι αν διαλέξεις εδώ, τα νέα είδη μένουν σε αναμονή έγκρισης και οι φωτογραφίες ανεβαίνουν κανονικά."}</p>
          </section>
        </div>

        {/* υποσέλιδο */}
        <div className="border-t border-eu-line px-3 py-2 grid gap-2 min-w-0">
          {/* Μετά από επιτυχή αποθήκευση δεν υπάρχουν πια αλλαγές: η ερώτηση φεύγει μόνη της, δεν μένει να λέει ψέματα. */}
          {confirming && dirty && (
            <p role="alert" className="m-0 flex flex-wrap items-center gap-2 rounded-xl bg-eu-yellow/20 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]">
              <AlertTriangle className="size-4 shrink-0" aria-hidden /><span className="min-w-0 flex-1">Έχεις αλλαγές που δεν αποθηκεύτηκαν.</span>
              <button type="button" onClick={() => setConfirming(false)} className={secondary}>Μείνε εδώ</button>
              <button type="button" onClick={onClose} className={quiet}>Κλείσε χωρίς αποθήκευση</button>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={`${primary} ${dirty ? "" : "opacity-50"}`} disabled={saving || !dirty} onClick={() => onSave({ edits, images, softone })}>
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />} Αποθήκευση
            </button>
            <button type="button" className={secondary} disabled={saving} onClick={tryClose}>Κλείσιμο</button>
            <label className="ml-auto inline-flex items-center gap-2 min-h-11 md:min-h-9 text-eu-ink-3 text-[length:var(--fs-13)] cursor-pointer">
              <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} className="size-4 accent-eu-navy" /> Δείξε και τα κενά πεδία
            </label>
          </div>
          <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">Η διόρθωσή σου υπερισχύει του feed σε κάθε επόμενο τρέξιμο. Το πεδίο που αδειάζεις παύει να είναι διόρθωση και ξαναπαίρνει την τιμή του προμηθευτή.</p>
        </div>
      </div>
    </div>
  );
}
