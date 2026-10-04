"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, Images, Plus, Trash2, Copy } from "lucide-react";
import { BRAND_COLORS, STICKER_PRESETS, stickerKeyFromName, stickerXY, presetXY, type StickerParams, type StickerShape, type StickerIcon, type StickerLine } from "@/lib/stickers/model";
import { StickerSvg, stickerAnimationClass, stickerPlacementStyle } from "@/components/stickers/StickerSvg";
import { saveSticker, exportStickerToMedia, sanitizeStickerSvg } from "@/app/admin/(shell)/stickers/actions";
import { ART, fitWidth } from "@/lib/stickers/art";
import { layoutStickers, zoneOf } from "@/lib/stickers/layout";

/**
 * Sticker designer: live preview on a real product card + controls driven by
 * StickerParams. Save to the Sticker collection, export SVG/PNG (download or
 * media library). Everything the storefront needs is in the params JSON.
 */
const SHAPES: { v: StickerShape; l: string }[] = [
  { v: "burst", l: "Έκρηξη" }, { v: "circle", l: "Κύκλος" }, { v: "seal", l: "Σφραγίδα" }, { v: "hex", l: "Εξάγωνο" }, { v: "badge", l: "Πλακίδιο" }, { v: "pill", l: "Pill" }, { v: "ribbon", l: "Κορδέλα" }, { v: "tag", l: "Ετικέτα" },
];
const ICONS: { v: StickerIcon; l: string }[] = [
  { v: "none", l: "—" }, { v: "gift", l: "Δώρο" }, { v: "percent", l: "%" }, { v: "star", l: "Αστέρι" }, { v: "zap", l: "Flash" }, { v: "trophy", l: "Τρόπαιο" }, { v: "tag", l: "Ετικέτα" }, { v: "heart", l: "Καρδιά" }, { v: "truck", l: "Courier" },
];
const SAMPLE = { img: "/img/cutouts/oled-tv.webp", brand: "LG", title: "OLED evo C4 55\" 4K Smart TV", price: "1.299 €", was: "1.599 €" };

export function StickerDesigner({ initial, canExport }: { initial: { id: string | null; key: string; name: string; params: StickerParams; active: boolean }; canExport: boolean }) {
  const router = useRouter();
  const [p, setP] = useState<StickerParams>(initial.params);
  const [name, setName] = useState(initial.name);
  const [key, setKey] = useState(initial.key);
  const [active, setActive] = useState(initial.active);
  const [id, setId] = useState(initial.id);
  const [msg, setMsg] = useState<string | null>(null);
  const [hover, setHover] = useState(false);
  const [pending, start] = useTransition();
  const svgRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [showAuto, setShowAuto] = useState(false);
  // με τα σταθερά στοιχεία ορατά: η θέση που θα πάρει πραγματικά στη βιτρίνα (lib/stickers/layout)
  const shown = (() => {
    if (!showAuto) return { params: p, moved: false };
    const l = layoutStickers([{ key: "x", params: p, priority: 1, source: "manual" }], { max: 2, reserved: { tl: true, tr: true, br: true } });
    const at = l.placed[0] ?? l.rotating[0];
    if (!at) return { params: p, moved: false };
    const [x0, y0] = stickerXY(p);
    return { params: { ...p, x: at.x, y: at.y }, moved: zoneOf(x0, y0) !== zoneOf(at.x, at.y) };
  })();
  // θέση από το σημείο του δείκτη: 0–100 % του πλαισίου (με το περιθώριο των 8 px)
  const dragTo = (cx: number, cy: number) => {
    const r = frameRef.current?.getBoundingClientRect(); if (!r) return;
    const pct = (v: number, a: number, len: number) => Math.round(Math.min(100, Math.max(0, ((v - a - 8) / Math.max(1, len - 16)) * 100)));
    setP((s) => ({ ...s, x: pct(cx, r.left, r.width), y: pct(cy, r.top, r.height) }));
  };
  const set = <K extends keyof StickerParams>(k: K, v: StickerParams[K]) => setP((s) => ({ ...s, [k]: v }));
  const setLine = (i: number, patch: Partial<StickerLine>) => setP((s) => ({ ...s, lines: s.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  const svgString = () => {
    const el = svgRef.current?.querySelector("svg");
    if (!el) return "";
    const clone = el.cloneNode(true) as SVGSVGElement;
    clone.removeAttribute("class");
    clone.style.transform = "";
    clone.setAttribute("width", String(p.size * 2));
    clone.setAttribute("height", String(Math.round(p.size * 2 * (el.viewBox.baseVal.height / 200))));
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
  };
  const pngBase64 = (scale = 4): Promise<string> =>
    new Promise((res, rej) => {
      const el = svgRef.current?.querySelector("svg");
      if (!el) return rej(new Error("no svg"));
      const vb = el.viewBox.baseVal;
      const c = document.createElement("canvas");
      c.width = p.size * scale; c.height = Math.round(p.size * scale * (vb.height / vb.width));
      const img = new Image();
      const blob = new Blob([svgString()], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      img.onload = () => { c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL("image/png").split(",")[1]); };
      img.onerror = () => rej(new Error("render failed"));
      img.src = url;
    });
  const download = (data: string, filename: string, mime: string) => { const a = document.createElement("a"); a.href = data.startsWith("data:") ? data : URL.createObjectURL(new Blob([data], { type: mime })); a.download = filename; a.click(); };
  const fileBase = () => key || stickerKeyFromName(name) || "sticker";

  const save = () => start(async () => {
    const r = await saveSticker({ id, key: key || stickerKeyFromName(name), name, params: p, svg: svgString(), active });
    if (!r.ok) return setMsg(r.error);
    setMsg("Αποθηκεύτηκε.");
    if (!id) { setId(r.id); router.replace(`/admin/stickers/${r.id}`); }
  });
  const toMedia = () => start(async () => {
    const png = await pngBase64(4).catch(() => undefined);
    const r = await exportStickerToMedia({ name: fileBase(), svg: svgString(), pngBase64: png });
    setMsg(r.ok ? `Στάλθηκαν στη βιβλιοθήκη (φάκελος Stickers): ${r.assets.map((a) => a.filename).join(", ")}` : r.error);
  });

  const field = "rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] font-normal outline-none focus:border-eu-blue bg-white w-full";
  const chip = (on: boolean) => `rounded-full px-3 min-h-10 font-bold text-[length:var(--fs-13)] border-2 transition-colors ${on ? "bg-eu-navy border-eu-navy text-white" : "bg-white border-eu-line text-eu-ink hover:border-eu-navy"}`;
  const anim = useMemo(() => stickerAnimationClass[p.animation], [p.animation]);

  return (
    <div className="eu-container">
    <div className="grid grid-cols-1 @4xl:grid-cols-[minmax(0,1fr)_400px] gap-4 items-start">
      {/* preview column */}
      <div className="grid gap-4 content-start self-stretch">
        <div className="rounded-2xl bg-white border border-eu-line p-4 grid gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 flex-1 min-w-[180px] font-bold text-eu-ink text-[length:var(--fs-14)]">Όνομα<input value={name} onChange={(e) => { setName(e.target.value); if (!id && !key) setKey(stickerKeyFromName(e.target.value)); }} placeholder="π.χ. 1+1 Black Friday" className={field} /></label>
            <label className="grid gap-1 w-48 font-bold text-eu-ink text-[length:var(--fs-14)]">Κλειδί<input value={key} onChange={(e) => setKey(stickerKeyFromName(e.target.value))} placeholder="bogo-bf" className={`${field} font-mono`} /></label>
            <label className="inline-flex items-center gap-2 min-h-11 font-bold text-eu-ink text-[length:var(--fs-14)]"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-5 accent-eu-navy" /> Ενεργό</label>
            <button type="button" disabled={pending} onClick={save} className="inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-blue disabled:opacity-50"><Check className="size-4" aria-hidden /> Αποθήκευση</button>
          </div>
          {msg && <p role="status" className="m-0 rounded-xl bg-eu-yellow/30 text-eu-navy font-bold text-[length:var(--fs-14)] px-3 py-2">{msg}</p>}
        </div>
        {/* πάνω: η εφαρμογή στην κάρτα (μεγάλο) και δεξιά θέση / μέγεθος και το sticker μόνο του· μένει ορατό όσο αλλάζεις κείμενα και χρώματα */}
        <div className="grid gap-3 @2xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)] items-start @4xl:sticky @4xl:top-2 z-10 bg-eu-surface-2/95 backdrop-blur rounded-2xl p-2 -m-2">
          <div className="grid gap-1.5">
            <div className="text-eu-muted text-[length:var(--fs-13)] font-bold uppercase tracking-wide">Εφαρμογή στην κάρτα προϊόντος</div>
            <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} className="group/card rounded-2xl bg-white border border-eu-line overflow-hidden shadow-[var(--shadow-raised)]">
              <div ref={frameRef} className="relative aspect-square eu-cutout-field touch-none cursor-grab active:cursor-grabbing" title="Σύρε το sticker για να το μετακινήσεις"
                onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); dragTo(e.clientX, e.clientY); setDragging(true); }}
                onPointerMove={(e) => { if (dragging) dragTo(e.clientX, e.clientY); }} onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={SAMPLE.img} alt="" className={`absolute inset-0 size-full object-contain p-[8%] eu-cutout-shadow transition-transform duration-500 ${hover ? "scale-[1.06]" : ""}`} />
                {showAuto && <span className="absolute top-0 left-0 pointer-events-none inline-flex flex-col items-start bg-eu-red text-white rounded-br-2xl rounded-tl-2xl px-3 py-1.5 leading-none"><span className="font-extrabold text-[length:var(--fs-19)]">−19%</span></span>}
                {showAuto && <span className="absolute top-2 right-2 size-11 rounded-full bg-white shadow-[var(--shadow-card)] grid place-items-center pointer-events-none text-eu-navy" aria-hidden>♡</span>}
                {showAuto && <span className="absolute bottom-3 right-3 h-10 px-3 rounded-full bg-white/95 shadow-[var(--shadow-card)] inline-flex items-center pointer-events-none text-eu-navy font-bold text-[length:var(--fs-13)]" aria-hidden>Γρήγορη προβολή</span>}
                {showAuto && <span className="absolute left-3 top-14 pointer-events-none inline-flex rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-13)] px-2.5 py-1 leading-tight">Δωρεάν τοποθέτηση</span>}
                <span className={`pointer-events-none ${dragging ? "outline-2 outline-dashed outline-eu-blue outline-offset-4 rounded" : ""}`} style={stickerPlacementStyle(dragging ? p : shown.params)}><StickerSvg p={p} id="c" className={dragging ? "" : anim} /></span>
              </div>
              <div className="p-3"><div className="text-eu-muted text-[length:var(--fs-13)] font-bold">{SAMPLE.brand}</div><div className="font-bold text-eu-ink text-[length:var(--fs-14)] leading-snug">{SAMPLE.title}</div><div className="mt-1 flex items-baseline gap-2"><span className="font-extrabold text-eu-ink text-[length:var(--fs-18)]">{SAMPLE.price}</span><span className="text-eu-muted line-through text-[length:var(--fs-13)]">{SAMPLE.was}</span></div></div>
            </div>
            <Section title="Χρώματα">
              <ColorRow label="Γέμισμα" value={p.fill} onChange={(v) => set("fill", v ?? "#F1C400")} />
              <ColorRow label="Διαβάθμιση προς" value={p.fill2} onChange={(v) => set("fill2", v)} allowNone />
              <ColorRow label="Κείμενο & εικονίδιο" value={p.color} onChange={(v) => set("color", v ?? "#122A58")} />
              <ColorRow label="Περίγραμμα" value={p.border} onChange={(v) => set("border", v)} allowNone />
              {p.border && <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]"><span className="flex justify-between"><span>Πάχος περιγράμματος</span><span className="tabular-nums text-eu-muted">{p.borderWidth}</span></span><input type="range" min={1} max={12} value={p.borderWidth || 4} onChange={(e) => set("borderWidth", Number(e.target.value))} className="accent-eu-navy min-h-11" /></label>}
              <label className="inline-flex items-center gap-2 min-h-11 font-bold text-eu-ink text-[length:var(--fs-14)]"><input type="checkbox" checked={p.shadow} onChange={(e) => set("shadow", e.target.checked)} className="size-5 accent-eu-navy" /> Σκιά</label>
              <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Κόκκινο μόνο για εκπτώσεις (κανόνας brand).</p>
            </Section>
          </div>
          <div className="grid gap-3 content-start">
            {/* δεξιά της κάρτας: θέση, μέγεθος, περιστροφή */}
            <div className="grid gap-2 rounded-2xl bg-white border border-eu-line p-3">
              <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Θέση και μέγεθος <span className="text-eu-muted font-normal text-[length:var(--fs-13)]">— ή σύρε το sticker πάνω στην κάρτα</span></span>
              <div className="flex flex-wrap gap-1.5">{([["tl", "Πάνω αριστερά"], ["tr", "Πάνω δεξιά"], ["center", "Κέντρο"], ["bl", "Κάτω αριστερά"], ["br", "Κάτω δεξιά"]] as const).map(([v, l]) => { const [px, py] = presetXY(v); const [cx, cy] = stickerXY(p); return <button key={v} type="button" onClick={() => setP((s) => ({ ...s, position: v, x: px, y: py }))} className={chip(cx === px && cy === py)}>{l}</button>; })}</div>
              {([["x", "Οριζόντια", "Αριστερά", "Δεξιά"], ["y", "Κάθετα", "Πάνω", "Κάτω"]] as const).map(([k, l, from, to]) => { const v = stickerXY(p)[k === "x" ? 0 : 1]; return (
                <label key={k} className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">
                  <span className="flex justify-between"><span>{l}</span><span className="tabular-nums text-eu-muted">{v}%</span></span>
                  <input type="range" min={0} max={100} value={v} onChange={(e) => { const n = Number(e.target.value); setP((s) => { const [cx, cy] = stickerXY(s); return { ...s, x: k === "x" ? n : cx, y: k === "y" ? n : cy }; }); }} className="w-full accent-eu-navy min-h-11" aria-label={`${l} θέση`} />
                  <span className="flex justify-between text-eu-muted text-[length:var(--fs-12)] font-normal"><span>{from}</span><span>{to}</span></span>
                </label>
              ); })}
              <div className="grid gap-2 border-t border-eu-line pt-2">
                <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">
                  <span className="flex justify-between"><span>Μέγεθος στην κάρτα</span><span className="tabular-nums text-eu-muted font-normal">{p.size}px · ≈{Math.round((p.size / 280) * 100)}% του πλάτους</span></span>
                  <input type="range" min={48} max={220} value={p.size} onChange={(e) => set("size", Number(e.target.value))} className="w-full accent-eu-navy min-h-11" aria-label="Μέγεθος στην κάρτα" />
                  <span className="flex justify-between text-eu-muted text-[length:var(--fs-12)] font-normal"><span>Διακριτικό</span><span>Κυρίαρχο</span></span>
                </label>
                <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">
                  <span className="flex justify-between"><span>Περιστροφή</span><span className="tabular-nums text-eu-muted font-normal">{p.rotate}°</span></span>
                  <input type="range" min={-30} max={30} value={p.rotate} onChange={(e) => set("rotate", Number(e.target.value))} className="w-full accent-eu-navy min-h-11" aria-label="Περιστροφή" />
                </label>
              </div>
              <label className="inline-flex items-center gap-2 min-h-11 font-bold text-eu-ink text-[length:var(--fs-14)]"><input type="checkbox" checked={showAuto} onChange={(e) => setShowAuto(e.target.checked)} className="size-5 accent-eu-navy" /> Δείξε τα σταθερά στοιχεία της κάρτας (έκπτωση, tag, καρδιά, γρήγορη προβολή) για να μη συγκρούονται</label>
              {showAuto && shown.moved && <p role="status" className="m-0 rounded-lg bg-eu-yellow/30 px-3 py-2 text-eu-ink text-[length:var(--fs-13)]">Η θέση αυτή πέφτει πάνω σε σταθερό στοιχείο της κάρτας· στη βιτρίνα το sticker μπαίνει αυτόματα στην πλησιέστερη ελεύθερη θέση (όπως φαίνεται).</p>}
            </div>
            <div className="text-eu-muted text-[length:var(--fs-13)] font-bold uppercase tracking-wide">Το sticker μόνο του</div>
          <div className="rounded-2xl border border-eu-line bg-[repeating-conic-gradient(#eef0f4_0_25%,#fff_0_50%)] bg-[length:20px_20px] h-32 grid place-items-center p-2" ref={svgRef}>
            <StickerSvg p={{ ...p, size: Math.min(110, Math.max(p.size, 80)) }} id="d" className={anim} />
          </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => download(svgString(), `${fileBase()}.svg`, "image/svg+xml")} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-4 min-h-11 font-bold text-eu-ink text-[length:var(--fs-14)] hover:border-eu-navy"><Download className="size-4" aria-hidden /> SVG</button>
          <button type="button" onClick={() => pngBase64(4).then((b) => download(`data:image/png;base64,${b}`, `${fileBase()}@4x.png`, "image/png"))} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-4 min-h-11 font-bold text-eu-ink text-[length:var(--fs-14)] hover:border-eu-navy"><Download className="size-4" aria-hidden /> PNG @4x</button>
          {canExport && <button type="button" disabled={pending} onClick={toMedia} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-navy hover:text-white disabled:opacity-50"><Images className="size-4" aria-hidden /> Στη βιβλιοθήκη media</button>}
          <button type="button" onClick={() => navigator.clipboard.writeText(JSON.stringify(p, null, 2)).then(() => setMsg("Τα params αντιγράφηκαν (JSON)."))} className="inline-flex items-center gap-1.5 rounded-full px-4 min-h-11 font-bold text-eu-blue text-[length:var(--fs-14)] hover:bg-eu-blue/10"><Copy className="size-4" aria-hidden /> JSON</button>
        </div>
          </div>
        </div>
      </div>

      {/* controls column */}
      <div className="grid gap-3">
        <Section title="Πρότυπο">
          <div className="flex flex-wrap gap-1.5">{STICKER_PRESETS.map((t) => <button key={t.key} type="button" onClick={() => setP(t.params)} className={chip(false)}>{t.name}</button>)}</div>
        </Section>
        <Section title="Σχήμα">
          <div className="flex flex-wrap gap-1.5">{SHAPES.map((s) => <button key={s.v} type="button" onClick={() => set("shape", s.v)} className={chip(p.shape === s.v)}>{s.l}</button>)}{p.art && <button type="button" onClick={() => set("shape", "art")} className={chip(p.shape === "art")}>{p.art.id === "upload" ? "Το SVG σου" : p.art.name}</button>}</div>
          <details className="rounded-xl border border-eu-line" open={p.shape === "art"}>
            <summary className="cursor-pointer px-3 min-h-11 flex items-center font-bold text-eu-ink text-[length:var(--fs-14)]">Βιβλιοθήκη σχημάτων ({ART.length}) · ανέβασμα SVG</summary>
            <div className="grid gap-2 p-2 pt-0">
              <ul className="m-0 p-0 list-none grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(4.5rem,1fr))]">
                {ART.map((a) => (
                  <li key={a.id}><button type="button" title={a.name} aria-label={a.name} onClick={() => setP((s) => ({ ...s, shape: "art", art: a }))} className={`w-full h-16 grid place-items-center rounded-lg border-2 bg-white ${p.shape === "art" && p.art?.id === a.id ? "border-eu-navy" : "border-eu-line hover:border-eu-blue"}`}>
                    <StickerSvg p={{ ...p, shape: "art", art: a, size: fitWidth(a, 46), rotate: 0, lines: [], icon: "none", shadow: false }} id={`lib-${a.id}`} />
                  </button></li>
                ))}
              </ul>
              <label className="inline-flex items-center gap-2 rounded-full border-2 border-dashed border-eu-line px-3 min-h-11 font-bold text-eu-ink text-[length:var(--fs-13)] cursor-pointer hover:border-eu-navy w-fit">
                Ανέβασμα δικού σου SVG
                <input type="file" accept=".svg,image/svg+xml" className="sr-only" onChange={async (e) => {
                  const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
                  if (!/\.svg$/i.test(file.name)) return setMsg("Δεκτά μόνο αρχεία SVG.");
                  const r = await sanitizeStickerSvg(file.name.replace(/\.svg$/i, ""), await file.text());
                  if (r.ok) setP((s) => ({ ...s, shape: "art", art: r.art })); else setMsg(r.error);
                }} />
              </label>
              {p.shape === "art" && p.art && !p.art.recolor && <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">Το SVG κρατά τα δικά του χρώματα· από τα «Χρώματα» αλλάζει μόνο το κείμενο.</p>}
            </div>
          </details>
          {(p.shape === "burst" || p.shape === "seal") && (
            <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]"><span className="flex justify-between"><span>{p.shape === "burst" ? "Ακτίνες" : "Δόντια"}</span><span className="tabular-nums text-eu-muted">{p.points}</span></span><input type="range" min={8} max={28} value={p.points} onChange={(e) => set("points", Number(e.target.value))} className="accent-eu-navy min-h-11" /></label>
          )}
        </Section>
        <Section title="Κείμενο">
          {p.lines.map((l, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-eu-line p-2">
              <div className="flex gap-2">
                <input value={l.text} onChange={(e) => setLine(i, { text: e.target.value })} placeholder={`Γραμμή ${i + 1}`} className={field} aria-label={`Γραμμή ${i + 1}`} />
                <button type="button" onClick={() => setP((s) => ({ ...s, lines: s.lines.filter((_, j) => j !== i) }))} aria-label="Αφαίρεση γραμμής" className="size-11 shrink-0 rounded-full text-eu-muted hover:bg-eu-red/10 hover:text-eu-red inline-flex items-center justify-center"><Trash2 className="size-4" aria-hidden /></button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[length:var(--fs-13)] font-bold">
                <select value={l.weight} onChange={(e) => setLine(i, { weight: Number(e.target.value) as StickerLine["weight"] })} className="rounded-full border border-eu-line px-2 min-h-9 bg-white" aria-label="Πάχος"><option value={700}>Bold</option><option value={800}>Extra bold</option><option value={900}>Black</option></select>
                <label className="inline-flex items-center gap-1 min-h-9"><input type="checkbox" checked={l.upper} onChange={(e) => setLine(i, { upper: e.target.checked })} className="size-4 accent-eu-navy" /> ΚΕΦΑΛΑΙΑ</label>
                <label className="grid gap-0.5 basis-full font-bold text-eu-ink">
                  <span className="flex justify-between"><span>Μέγεθος γραμμάτων</span><span className="tabular-nums text-eu-muted font-normal">{Math.round((l.scale ?? 1) * 100)}%{(l.scale ?? 1) === 1 ? " · όσο χωρά" : ""}</span></span>
                  <input type="range" min={30} max={100} step={5} value={Math.round((l.scale ?? 1) * 100)} onChange={(e) => setLine(i, { scale: Number(e.target.value) / 100, size: 0 })} className="w-full accent-eu-navy min-h-11" aria-label={`Μέγεθος γραμμάτων γραμμής ${i + 1}`} />
                  <span className="text-eu-muted font-normal text-[length:var(--fs-12)]">100% = το μεγαλύτερο που χωρά στο σχήμα· το κείμενο δεν βγαίνει ποτέ έξω.</span>
                </label>
                <label className="inline-flex items-center gap-1 min-h-9">Αραίωση <input type="number" min={-2} max={8} step={0.5} value={l.spacing} onChange={(e) => setLine(i, { spacing: Number(e.target.value) })} className="w-16 rounded-full border border-eu-line px-2 min-h-9" /></label>
              </div>
            </div>
          ))}
          {p.lines.length < 3 && <button type="button" onClick={() => setP((s) => ({ ...s, lines: [...s.lines, { text: "", size: 0, weight: 700, upper: false, spacing: 0 }] }))} className="justify-self-start inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-eu-line px-3 min-h-10 font-bold text-eu-blue text-[length:var(--fs-14)] hover:border-eu-blue"><Plus className="size-4" aria-hidden /> Γραμμή</button>}
          <div className="grid gap-1"><span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Εικονίδιο</span><div className="flex flex-wrap gap-1.5">{ICONS.map((ic) => <button key={ic.v} type="button" onClick={() => set("icon", ic.v)} className={chip(p.icon === ic.v)}>{ic.l}</button>)}</div></div>
        </Section>
        <Section title="Στην κάρτα">
          <div className="grid gap-1"><span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Κίνηση</span><div className="flex flex-wrap gap-1.5">{([["none", "Καμία"], ["shimmer", "Λάμψη"], ["breathe", "Αναπνοή"], ["wiggle", "Κούνημα"], ["bump", "Αναπήδηση"]] as const).map(([v, l]) => <button key={v} type="button" onClick={() => set("animation", v)} className={chip(p.animation === v)}>{l}</button>)}</div></div>
        </Section>
      </div>
    </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
return (
  <section className="grid gap-2 rounded-2xl bg-white border border-eu-line p-4"><h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-13)] uppercase tracking-wide">{title}</h3>{children}</section>
);
}
function ColorRow({ label, value, onChange, allowNone }: { label: string; value: string | null; onChange: (v: string | null) => void; allowNone?: boolean }) {
return (
  <div className="grid gap-1">
    <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{label}</span>
    <div className="flex flex-wrap items-center gap-1.5">
      {allowNone && <button type="button" onClick={() => onChange(null)} aria-label="Κανένα" className={`size-9 rounded-full border-2 grid place-items-center text-[length:var(--fs-13)] font-bold ${value === null ? "border-eu-navy" : "border-eu-line"}`}>—</button>}
      {BRAND_COLORS.map((c) => (
        <button key={c.value} type="button" title={c.label} aria-label={c.label} onClick={() => onChange(c.value)} className={`size-9 rounded-full border-2 ${value?.toUpperCase() === c.value ? "border-eu-navy ring-2 ring-eu-yellow" : "border-eu-line"}`} style={{ background: c.value }} />
      ))}
      <label className="inline-flex items-center gap-1 rounded-full border-2 border-eu-line px-2 min-h-9 text-[length:var(--fs-13)] font-bold cursor-pointer"><input type="color" value={value ?? "#ffffff"} onChange={(e) => onChange(e.target.value.toUpperCase())} className="size-6 border-0 bg-transparent p-0 cursor-pointer" aria-label={`${label}: προσαρμοσμένο`} /> custom</label>
    </div>
  </div>
);
}
