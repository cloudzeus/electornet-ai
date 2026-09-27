"use client";

import { useRef, useState } from "react";
import type { Box, StudioDoc, StudioSection } from "@/lib/catalog/banner-doc";

export type BoxSel = { sectionId: string; kind: "image" | "icon"; id: string };
type Drag = { mode: "move" | "nw" | "ne" | "sw" | "se" | "draw"; x0: number; y0: number; box: Box; sel: BoxSel | null; sectionId?: string };

const MIN = 0.012;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const pct = (b: Box) => ({ left: `${b[0] * 100}%`, top: `${b[1] * 100}%`, width: `${b[2] * 100}%`, height: `${b[3] * 100}%` });
const round = (b: Box): Box => b.map((v) => Math.round(v * 10000) / 10000) as Box;

function resize(b: Box, mode: Drag["mode"], dx: number, dy: number): Box {
  let [x, y, w, h] = b;
  if (mode === "move") return [clamp(x + dx, 0, 1 - w), clamp(y + dy, 0, 1 - h), w, h];
  if (mode.includes("w")) { const nx = clamp(x + dx, 0, x + w - MIN); w = w + (x - nx); x = nx; }
  if (mode.includes("e")) w = clamp(w + dx, MIN, 1 - x);
  if (mode.includes("n")) { const ny = clamp(y + dy, 0, y + h - MIN); h = h + (y - ny); y = ny; }
  if (mode.includes("s")) h = clamp(h + dy, MIN, 1 - y);
  return [x, y, w, h];
}

/** Όλα τα πλαίσια κειμένου μιας ενότητας (για επισήμανση). */
const textBoxes = (s: StudioSection) => [s.title?.box, s.subtitle?.box, ...s.paragraphs.map((p) => p.box), ...s.features.map((f) => f.box), s.footnote?.box].filter((b): b is Box => !!b);
const anchor = (s: StudioSection): Box | null => [...textBoxes(s), ...s.images.map((i) => i.box)].sort((a, b) => a[1] - b[1] || a[0] - b[0])[0] ?? null;

/**
 * Η αρχική εικόνα με τα πλαίσια της ανάλυσης. Μπλε = κείμενο (κλικ → επιλογή ενότητας), κίτρινο = φωτογραφία,
 * διακεκομμένο = εικονίδιο χαρακτηριστικού. Η επιλεγμένη φωτογραφία / εικονίδιο μετακινείται και αλλάζει μέγεθος με το
 * ποντίκι (γωνίες) ή με τα βελάκια (Shift = μεγαλύτερο βήμα, Alt = αλλαγή μεγέθους). Σε λειτουργία «σχεδίασης» ένα
 * σύρσιμο πάνω στην εικόνα φτιάχνει νέο πλαίσιο φωτογραφίας για την ενότητα.
 */
export function BoxCanvas({ doc, selectedSection, selectedBox, drawFor, onSelectSection, onSelectBox, onBoxChange, onDraw }: {
  doc: StudioDoc;
  selectedSection: string | null;
  selectedBox: BoxSel | null;
  drawFor: string | null;
  onSelectSection: (id: string) => void;
  onSelectBox: (sel: BoxSel | null) => void;
  onBoxChange: (sel: BoxSel, box: Box) => void;
  onDraw: (sectionId: string, box: Box) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [live, setLive] = useState<{ sel: BoxSel | null; box: Box } | null>(null);
  const frac = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) }; };

  const start = (e: React.PointerEvent, mode: Drag["mode"], box: Box, sel: BoxSel | null, sectionId?: string) => {
    e.stopPropagation(); e.preventDefault();
    const p = frac(e);
    ref.current!.setPointerCapture(e.pointerId);
    drag.current = { mode, x0: p.x, y0: p.y, box, sel, sectionId };
    if (sel) onSelectBox(sel);
    setLive({ sel, box });
  };
  /** Το πλαίσιο που προκύπτει από το σύρσιμο ως το σημείο p — ίδιος υπολογισμός στην κίνηση και στο άφημα. */
  const shape = (d: Drag, p: { x: number; y: number }): Box => d.mode === "draw" ? [Math.min(d.x0, p.x), Math.min(d.y0, p.y), Math.abs(p.x - d.x0), Math.abs(p.y - d.y0)] : resize(d.box, d.mode, p.x - d.x0, p.y - d.y0);
  const move = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    setLive({ sel: d.mode === "draw" ? null : d.sel, box: shape(d, frac(e)) });
  };
  const end = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null;
    if (d) {
      const box = shape(d, frac(e));
      if (d.mode === "draw") { if (d.sectionId && box[2] > MIN && box[3] > MIN) onDraw(d.sectionId, round(box)); }
      else if (d.sel && (Math.abs(box[0] - d.box[0]) + Math.abs(box[1] - d.box[1]) + Math.abs(box[2] - d.box[2]) + Math.abs(box[3] - d.box[3]) > 0.0005)) onBoxChange(d.sel, round(box));
    }
    setLive(null);
  };
  /** Ένας χειριστής για όλο το επίπεδο: τι πατήθηκε το λένε τα data-* του στοιχείου (κουτί, λαβή, κείμενο). */
  const down = (e: React.PointerEvent) => {
    if (drawFor) { const p = frac(e); start(e, "draw", [p.x, p.y, 0, 0], null, drawFor); return; }
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-mode],[data-text]");
    if (!el) { onSelectBox(null); return; }
    const sid = el.dataset.sid!, s = doc.sections.find((x) => x.id === sid);
    if (!s) return;
    onSelectSection(sid);
    if (el.dataset.text) { e.stopPropagation(); return; }
    const kind = el.dataset.kind as BoxSel["kind"], id = el.dataset.id!;
    const box = kind === "image" ? s.images.find((i) => i.id === id)?.box : s.features.find((f) => f.id === id)?.icon;
    if (box) start(e, el.dataset.mode as Drag["mode"], box, { sectionId: sid, kind, id });
  };
  const keys = (e: React.KeyboardEvent, sel: BoxSel, box: Box) => {
    const step = e.shiftKey ? 0.02 : 0.004;
    const k: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const v = k[e.key]; if (!v) return;
    e.preventDefault();
    onBoxChange(sel, round(e.altKey ? resize(box, "se", v[0], v[1]) : resize(box, "move", v[0], v[1])));
  };

  let n = 0; // σειρά εμφάνισης των πλαισίων (καθυστέρηση κίνησης)
  const boxOf = (sel: BoxSel, b: Box) => (live?.sel && live.sel.id === sel.id ? live.box : b);

  return (
    <div className="relative select-none">
      {/* eslint-disable-next-line @next/next/no-img-element -- η αρχική εικόνα σε φυσικό μέγεθος, χωρίς βελτιστοποίηση: τα πλαίσια αντιστοιχούν σε pixel */}
      <img src={doc.sourceUrl} alt="Το αρχικό banner" className="block w-full h-auto rounded-lg border border-eu-line" draggable={false} />
      <div
        ref={ref}
        className={`absolute inset-0 touch-none ${drawFor ? "cursor-crosshair" : ""}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        {/* τα πλαίσια εμφανίζονται ένα-ένα, με τη σειρά ανάγνωσης — ο χρήστης βλέπει τι «βρήκε» ο βοηθός */}
        {doc.sections.map((s, si) => {
          const on = s.id === selectedSection, dim = !s.include;
          const a = anchor(s);
          return (
            <div key={s.id} className={dim ? "opacity-30" : ""}>
              {textBoxes(s).map((b, k) => (
                <span key={k} aria-hidden data-text="1" data-sid={s.id} style={{ ...pct(b), animationDelay: `${Math.min(n++, 40) * 28}ms` }}
                  className={`absolute rounded-sm eu-box-in ${drawFor ? "" : "cursor-pointer"} ${on ? "border-2 border-eu-blue bg-eu-blue/10" : "border border-eu-blue/60 bg-eu-blue/5 hover:bg-eu-blue/10"}`} />
              ))}
              {s.images.map((im) => {
                const sel: BoxSel = { sectionId: s.id, kind: "image", id: im.id };
                const b = boxOf(sel, im.box), active = selectedBox?.id === im.id;
                return (
                  <div key={im.id} role="button" tabIndex={0} aria-label={`Φωτογραφία ενότητας ${si + 1}${im.include ? "" : " (εκτός)"} — βελάκια για μετακίνηση, Alt+βελάκια για μέγεθος`} aria-pressed={active}
                    onKeyDown={(e) => keys(e, sel, im.box)} onFocus={() => { onSelectSection(s.id); onSelectBox(sel); }}
                    data-mode="move" data-kind="image" data-sid={s.id} data-id={im.id}
                    style={{ ...pct(b), animationDelay: `${Math.min(n++, 40) * 28}ms` }}
                    className={`absolute outline-none eu-box-in ${im.include ? "" : "opacity-50"} ${active ? "border-[3px] border-eu-yellow shadow-[0_0_0_2px_#122A58] cursor-move" : "border-2 border-eu-yellow/90 hover:border-eu-yellow cursor-pointer"} focus-visible:shadow-[0_0_0_3px_#1D428A]`}>
                    {active && (["nw", "ne", "sw", "se"] as const).map((h) => (
                      <span key={h} data-mode={h} data-kind="image" data-sid={s.id} data-id={im.id}
                        className={`absolute size-5 -m-2.5 rounded-full bg-eu-yellow border-2 border-eu-navy ${h[0] === "n" ? "top-0" : "bottom-0"} ${h[1] === "w" ? "left-0" : "right-0"} ${h === "nw" || h === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize"}`} />
                    ))}
                  </div>
                );
              })}
              {s.features.filter((f) => f.icon).map((f) => {
                const sel: BoxSel = { sectionId: s.id, kind: "icon", id: f.id };
                const b = boxOf(sel, f.icon!), active = selectedBox?.id === f.id;
                return (
                  <div key={f.id} aria-hidden data-mode="move" data-kind="icon" data-sid={s.id} data-id={f.id} style={{ ...pct(b), animationDelay: `${Math.min(n++, 40) * 28}ms` }}
                    className={`absolute eu-box-in ${f.includeIcon ? "" : "opacity-40"} ${active ? "border-2 border-dashed border-eu-yellow shadow-[0_0_0_2px_#122A58] cursor-move" : "border border-dashed border-eu-yellow cursor-pointer"}`}>
                    {active && (["nw", "ne", "sw", "se"] as const).map((h) => (
                      <span key={h} data-mode={h} data-kind="icon" data-sid={s.id} data-id={f.id} className={`absolute size-4 -m-2 rounded-full bg-eu-yellow border-2 border-eu-navy ${h[0] === "n" ? "top-0" : "bottom-0"} ${h[1] === "w" ? "left-0" : "right-0"}`} />
                    ))}
                  </div>
                );
              })}
              {a && (
                <span style={{ left: `${a[0] * 100}%`, top: `${a[1] * 100}%` }} className={`absolute -translate-x-1/2 -translate-y-1/2 size-7 rounded-full eu-pop inline-flex items-center justify-center font-extrabold text-[length:var(--fs-14)] pointer-events-none ${on ? "bg-eu-navy text-white ring-2 ring-eu-yellow" : "bg-eu-blue text-white"}`}>{si + 1}</span>
              )}
            </div>
          );
        })}
        {live && !live.sel && <div style={pct(live.box)} className="absolute border-[3px] border-dashed border-eu-yellow bg-eu-yellow/15 pointer-events-none" />}
      </div>
    </div>
  );
}
