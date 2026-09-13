"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Crop, FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw, X, Undo2 } from "lucide-react";
import type { MediaAssetDTO } from "@/lib/media/types";

/**
 * Canvas image editor: crop (drag / handles / aspect presets), rotate 90°,
 * flip, brightness / contrast / saturation, resize, output format & quality.
 * Result is uploaded through the media upload route as a new asset or as a
 * replacement of the original. No external library — works for any storage.
 */
type Rect = { x: number; y: number; w: number; h: number };
const ASPECTS: { label: string; v: number | null }[] = [
  { label: "Ελεύθερο", v: null },
  { label: "1:1", v: 1 },
  { label: "4:3", v: 4 / 3 },
  { label: "3:2", v: 3 / 2 },
  { label: "16:9", v: 16 / 9 },
  { label: "3:4", v: 3 / 4 },
  { label: "Hero 21:9", v: 21 / 9 },
];
type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export function ImageEditor({ asset, onClose, onSaved }: { asset: MediaAssetDTO; onClose: () => void; onSaved: (a: MediaAssetDTO, replaced: boolean) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [rot, setRot] = useState(0); // 0..3 quarter turns
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [adj, setAdj] = useState({ brightness: 100, contrast: 100, saturate: 100 });
  const [aspect, setAspect] = useState<number | null>(null);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [out, setOut] = useState({ format: "webp" as "webp" | "png" | "jpeg", quality: 85, maxWidth: 0 });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 800, h: 600 });

  useEffect(() => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => setImg(i);
    i.onerror = () => setError("Η εικόνα δεν φορτώθηκε (CORS;). Δοκίμασε ξανά ή κατέβασέ την.");
    i.src = asset.url;
  }, [asset.url]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // source (rotated/flipped) dimensions
  const src = useMemo(() => {
    if (!img) return { w: 1, h: 1 };
    return rot % 2 ? { w: img.naturalHeight, h: img.naturalWidth } : { w: img.naturalWidth, h: img.naturalHeight };
  }, [img, rot]);
  const scale = Math.min((box.w - 16) / src.w, (box.h - 16) / src.h, 1);
  const view = { w: Math.round(src.w * scale), h: Math.round(src.h * scale) };

  /** draws the transformed image (with adjustments) into a canvas at full source size */
  const drawSource = useCallback((target: HTMLCanvasElement, w: number, h: number) => {
    if (!img) return;
    target.width = w;
    target.height = h;
    const ctx = target.getContext("2d")!;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((rot * Math.PI) / 2);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    const iw = rot % 2 ? h : w;
    const ih = rot % 2 ? w : h;
    ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
    ctx.restore();
    if (adj.brightness !== 100 || adj.contrast !== 100 || adj.saturate !== 100) applyAdjust(ctx, w, h, adj);
  }, [img, rot, flipH, flipV, adj]);

  // preview render
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !img) return;
    drawSource(c, view.w, view.h);
    const ctx = c.getContext("2d")!;
    if (crop) {
      const r = { x: crop.x * scale, y: crop.y * scale, w: crop.w * scale, h: crop.h * scale };
      ctx.fillStyle = "rgba(18,42,88,0.55)";
      ctx.beginPath();
      ctx.rect(0, 0, view.w, view.h);
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.fill("evenodd");
      ctx.strokeStyle = "#F1C400";
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(r.x + (r.w * i) / 3, r.y); ctx.lineTo(r.x + (r.w * i) / 3, r.y + r.h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(r.x, r.y + (r.h * i) / 3); ctx.lineTo(r.x + r.w, r.y + (r.h * i) / 3); ctx.stroke();
      }
    }
  }, [img, drawSource, view.w, view.h, crop, scale]);

  // pointer interaction on the crop
  const drag = useRef<{ mode: "move" | "new" | Handle; start: { x: number; y: number }; rect: Rect } | null>(null);
  const toImg = (e: React.PointerEvent) => {
    const b = canvasRef.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(src.w, (e.clientX - b.left) / scale)), y: Math.max(0, Math.min(src.h, (e.clientY - b.top) / scale)) };
  };
  const handleAt = (p: { x: number; y: number }): Handle | "move" | null => {
    if (!crop) return null;
    const t = 14 / scale;
    const near = (a: number, b: number) => Math.abs(a - b) < t;
    const inX = p.x > crop.x - t && p.x < crop.x + crop.w + t;
    const inY = p.y > crop.y - t && p.y < crop.y + crop.h + t;
    if (!inX || !inY) return null;
    const l = near(p.x, crop.x), r = near(p.x, crop.x + crop.w), tp = near(p.y, crop.y), bt = near(p.y, crop.y + crop.h);
    if (l && tp) return "nw"; if (r && tp) return "ne"; if (l && bt) return "sw"; if (r && bt) return "se";
    if (tp) return "n"; if (bt) return "s"; if (l) return "w"; if (r) return "e";
    return "move";
  };
  const onDown = (e: React.PointerEvent) => {
    if (!img) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = toImg(e);
    const h = handleAt(p);
    if (h && crop) drag.current = { mode: h, start: p, rect: crop };
    else { drag.current = { mode: "new", start: p, rect: { x: p.x, y: p.y, w: 0, h: 0 } }; setCrop({ x: p.x, y: p.y, w: 0, h: 0 }); }
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) {
      const h = img ? handleAt(toImg(e)) : null;
      const cur: Record<string, string> = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", move: "move" };
      (e.currentTarget as HTMLElement).style.cursor = h ? cur[h] : "crosshair";
      return;
    }
    const p = toImg(e);
    const dx = p.x - d.start.x, dy = p.y - d.start.y;
    let r: Rect = { ...d.rect };
    if (d.mode === "move") r = { ...r, x: clamp(r.x + dx, 0, src.w - r.w), y: clamp(r.y + dy, 0, src.h - r.h) };
    else if (d.mode === "new") r = norm({ x: d.start.x, y: d.start.y, w: dx, h: dy });
    else {
      if (d.mode.includes("e")) r.w = d.rect.w + dx;
      if (d.mode.includes("s")) r.h = d.rect.h + dy;
      if (d.mode.includes("w")) { r.x = d.rect.x + dx; r.w = d.rect.w - dx; }
      if (d.mode.includes("n")) { r.y = d.rect.y + dy; r.h = d.rect.h - dy; }
      r = norm(r);
    }
    if (aspect && d.mode !== "move") {
      const anchorRight = d.mode === "new" ? dx < 0 : d.mode.includes("w");
      const anchorBottom = d.mode === "new" ? dy < 0 : d.mode.includes("n");
      const w = d.mode === "n" || d.mode === "s" ? r.h * aspect : r.w;
      const h = w / aspect;
      const nr = { x: anchorRight ? r.x + r.w - w : r.x, y: anchorBottom ? r.y + r.h - h : r.y, w, h };
      r = nr;
    }
    r.x = clamp(r.x, 0, src.w); r.y = clamp(r.y, 0, src.h);
    r.w = clamp(r.w, 0, src.w - r.x); r.h = clamp(r.h, 0, src.h - r.y);
    setCrop(r);
  };
  const onUp = () => {
    if (crop && (crop.w < 8 || crop.h < 8)) setCrop(null);
    drag.current = null;
  };

  const applyAspect = (v: number | null) => {
    setAspect(v);
    if (!v) return;
    const w = Math.min(src.w, src.h * v), h = w / v;
    setCrop({ x: (src.w - w) / 2, y: (src.h - h) / 2, w, h });
  };

  const reset = () => { setRot(0); setFlipH(false); setFlipV(false); setAdj({ brightness: 100, contrast: 100, saturate: 100 }); setCrop(null); setAspect(null); };

  const exportBlob = async (): Promise<Blob> => {
    const full = document.createElement("canvas");
    drawSource(full, src.w, src.h);
    const r = crop && crop.w > 8 && crop.h > 8 ? crop : { x: 0, y: 0, w: src.w, h: src.h };
    const target = document.createElement("canvas");
    const sc = out.maxWidth && r.w > out.maxWidth ? out.maxWidth / r.w : 1;
    target.width = Math.round(r.w * sc);
    target.height = Math.round(r.h * sc);
    const ctx = target.getContext("2d")!;
    if (out.format === "jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, target.width, target.height); }
    ctx.drawImage(full, r.x, r.y, r.w, r.h, 0, 0, target.width, target.height);
    return new Promise((res, rej) => target.toBlob((b) => (b ? res(b) : rej(new Error("export failed"))), `image/${out.format}`, out.quality / 100));
  };

  const save = async (replace: boolean) => {
    setBusy(replace ? "Αντικατάσταση…" : "Αποθήκευση…");
    setError(null);
    try {
      const blob = await exportBlob();
      const base = asset.filename.replace(/\.[^.]+$/, "");
      const fd = new FormData();
      fd.append("file", new File([blob], `${base}${replace ? "" : "-edited"}.${out.format === "jpeg" ? "jpg" : out.format}`, { type: blob.type }));
      if (replace) fd.append("replaceId", asset.id);
      else if (asset.folderId) fd.append("folderId", asset.folderId);
      fd.append("keepFormat", "1");
      const res = await fetch("/api/admin/media/upload", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "upload failed");
      onSaved(j, replace);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Σφάλμα");
    } finally {
      setBusy(null);
    }
  };

  const outDims = (() => {
    const r = crop && crop.w > 8 ? crop : { w: src.w, h: src.h };
    const sc = out.maxWidth && r.w > out.maxWidth ? out.maxWidth / r.w : 1;
    return `${Math.round(r.w * sc)}×${Math.round(r.h * sc)}`;
  })();

  const btn = "inline-flex items-center gap-1.5 rounded-full px-3 min-h-10 font-bold text-[length:var(--fs-14)] transition-colors";
  return (
    <div className="fixed inset-0 z-[80] eu-container" role="dialog" aria-modal="true" aria-label="Επεξεργασία εικόνας">
    <div className="h-full bg-eu-navy/95 text-white grid grid-rows-[auto_minmax(0,1fr)_auto] @3xl:grid-cols-[minmax(0,1fr)_320px] @3xl:grid-rows-[auto_minmax(0,1fr)]">
      <header className="@3xl:col-span-2 flex items-center gap-3 px-4 py-2 border-b border-white/10">
        <Crop className="size-5 text-eu-yellow" aria-hidden />
        <h2 className="m-0 font-heading font-bold text-[length:var(--fs-18)] truncate">{asset.title ?? asset.filename}</h2>
        <span className="ml-auto text-eu-on-dark-2 text-[length:var(--fs-14)] tabular-nums hidden @md:inline">Έξοδος {outDims} · {out.format.toUpperCase()}</span>
        <button type="button" onClick={onClose} aria-label="Κλείσιμο" className="size-11 rounded-full hover:bg-white/10 inline-flex items-center justify-center"><X className="size-5" aria-hidden /></button>
      </header>
      <div ref={boxRef} className="relative min-h-[320px] grid place-items-center p-2 overflow-hidden bg-[radial-gradient(60%_60%_at_50%_50%,rgba(255,255,255,0.06),transparent)]">
        {img ? (
          <canvas ref={canvasRef} width={view.w} height={view.h} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} className="rounded-md shadow-[var(--shadow-overlay)] touch-none select-none max-w-full" style={{ width: view.w, height: view.h }} />
        ) : (
          <div className="text-eu-on-dark-2">{error ?? "Φόρτωση…"}</div>
        )}
      </div>
      <aside className="border-t @3xl:border-t-0 @3xl:border-l border-white/10 p-4 grid content-start gap-5 overflow-y-auto">
        <section className="grid gap-2">
          <h3 className="m-0 font-extrabold text-eu-yellow text-[length:var(--fs-13)] uppercase tracking-wide">Περικοπή</h3>
          <div className="flex flex-wrap gap-1.5">
            {ASPECTS.map((a) => (
              <button key={a.label} type="button" onClick={() => applyAspect(a.v)} className={`${btn} ${aspect === a.v ? "bg-eu-yellow text-eu-navy" : "bg-white/10 hover:bg-white/20"}`}>{a.label}</button>
            ))}
            {crop && <button type="button" onClick={() => { setCrop(null); setAspect(null); }} className={`${btn} bg-white/10 hover:bg-white/20`}><X className="size-3.5" aria-hidden /> Καθαρισμός</button>}
          </div>
          <p className="m-0 text-eu-on-dark-2 text-[length:var(--fs-13)]">Σύρε πάνω στην εικόνα για νέα περιοχή, τράβα τις άκρες για αλλαγή.</p>
        </section>
        <section className="grid gap-2">
          <h3 className="m-0 font-extrabold text-eu-yellow text-[length:var(--fs-13)] uppercase tracking-wide">Προσανατολισμός</h3>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => { setRot((r) => (r + 3) % 4); setCrop(null); }} className={`${btn} bg-white/10 hover:bg-white/20`}><RotateCcw className="size-4" aria-hidden /> 90° αριστερά</button>
            <button type="button" onClick={() => { setRot((r) => (r + 1) % 4); setCrop(null); }} className={`${btn} bg-white/10 hover:bg-white/20`}><RotateCw className="size-4" aria-hidden /> 90° δεξιά</button>
            <button type="button" onClick={() => setFlipH((f) => !f)} className={`${btn} ${flipH ? "bg-eu-yellow text-eu-navy" : "bg-white/10 hover:bg-white/20"}`}><FlipHorizontal2 className="size-4" aria-hidden /> Οριζόντια</button>
            <button type="button" onClick={() => setFlipV((f) => !f)} className={`${btn} ${flipV ? "bg-eu-yellow text-eu-navy" : "bg-white/10 hover:bg-white/20"}`}><FlipVertical2 className="size-4" aria-hidden /> Κάθετα</button>
          </div>
        </section>
        <section className="grid gap-3">
          <h3 className="m-0 font-extrabold text-eu-yellow text-[length:var(--fs-13)] uppercase tracking-wide">Ρυθμίσεις</h3>
          {([["brightness", "Φωτεινότητα"], ["contrast", "Αντίθεση"], ["saturate", "Κορεσμός"]] as const).map(([k, l]) => (
            <label key={k} className="grid gap-1 text-[length:var(--fs-14)] font-bold">
              <span className="flex justify-between"><span>{l}</span><span className="tabular-nums text-eu-on-dark-2">{adj[k]}%</span></span>
              <input type="range" min={40} max={160} value={adj[k]} onChange={(e) => setAdj((a) => ({ ...a, [k]: Number(e.target.value) }))} className="accent-eu-yellow min-h-11" />
            </label>
          ))}
        </section>
        <section className="grid gap-2">
          <h3 className="m-0 font-extrabold text-eu-yellow text-[length:var(--fs-13)] uppercase tracking-wide">Έξοδος</h3>
          <div className="grid grid-cols-2 gap-2 text-[length:var(--fs-14)] font-bold">
            <label className="grid gap-1">Μορφή
              <select value={out.format} onChange={(e) => setOut((o) => ({ ...o, format: e.target.value as typeof o.format }))} className="rounded-lg bg-white text-eu-ink px-2 min-h-11 font-normal text-[length:var(--fs-15)]">
                <option value="webp">WebP</option><option value="png">PNG (διαφάνεια)</option><option value="jpeg">JPEG</option>
              </select>
            </label>
            <label className="grid gap-1">Μέγ. πλάτος
              <select value={out.maxWidth} onChange={(e) => setOut((o) => ({ ...o, maxWidth: Number(e.target.value) }))} className="rounded-lg bg-white text-eu-ink px-2 min-h-11 font-normal text-[length:var(--fs-15)]">
                <option value={0}>Αρχικό</option><option value={2560}>2560</option><option value={1920}>1920</option><option value={1280}>1280</option><option value={800}>800</option>
              </select>
            </label>
          </div>
          {out.format !== "png" && (
            <label className="grid gap-1 text-[length:var(--fs-14)] font-bold">
              <span className="flex justify-between"><span>Ποιότητα</span><span className="tabular-nums text-eu-on-dark-2">{out.quality}</span></span>
              <input type="range" min={50} max={100} value={out.quality} onChange={(e) => setOut((o) => ({ ...o, quality: Number(e.target.value) }))} className="accent-eu-yellow min-h-11" />
            </label>
          )}
        </section>
        {error && <p role="alert" className="m-0 rounded-lg bg-eu-red/20 text-white font-bold text-[length:var(--fs-14)] px-3 py-2">{error}</p>}
        <div className="grid gap-2 mt-auto">
          <button type="button" disabled={!!busy || !img} onClick={() => save(false)} className="rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-15)] min-h-12 inline-flex items-center justify-center gap-2 hover:brightness-105 disabled:opacity-50"><Check className="size-4" aria-hidden /> {busy ?? "Αποθήκευση ως νέο"}</button>
          <button type="button" disabled={!!busy || !img} onClick={() => confirm("Να αντικατασταθεί το αρχικό αρχείο; Τα σημεία που το χρησιμοποιούν θα δείξουν τη νέα εκδοχή.") && save(true)} className="rounded-full border-2 border-white/40 font-extrabold text-[length:var(--fs-15)] min-h-12 hover:bg-white/10 disabled:opacity-50">Αντικατάσταση αρχικού</button>
          <button type="button" onClick={reset} className={`${btn} justify-center bg-transparent text-eu-on-dark-2 hover:text-white`}><Undo2 className="size-4" aria-hidden /> Επαναφορά</button>
        </div>
      </aside>
    </div>
    </div>
  );
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const norm = (r: Rect): Rect => ({ x: r.w < 0 ? r.x + r.w : r.x, y: r.h < 0 ? r.y + r.h : r.y, w: Math.abs(r.w), h: Math.abs(r.h) });

/** brightness / contrast / saturation on pixels (no ctx.filter → works in Safari too). */
function applyAdjust(ctx: CanvasRenderingContext2D, w: number, h: number, adj: { brightness: number; contrast: number; saturate: number }) {
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  const b = adj.brightness / 100, c = adj.contrast / 100, s = adj.saturate / 100;
  const ic = 128 * (1 - c);
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] * b, g = d[i + 1] * b, bl = d[i + 2] * b;
    r = r * c + ic; g = g * c + ic; bl = bl * c + ic;
    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    d[i] = clamp(gray + (r - gray) * s, 0, 255);
    d[i + 1] = clamp(gray + (g - gray) * s, 0, 255);
    d[i + 2] = clamp(gray + (bl - gray) * s, 0, 255);
  }
  ctx.putImageData(id, 0, 0);
}
