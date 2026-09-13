"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, Images, Plus, Trash2, Copy } from "lucide-react";
import { BRAND_COLORS, STICKER_PRESETS, stickerKeyFromName, type StickerParams, type StickerShape, type StickerIcon, type StickerLine } from "@/lib/stickers/model";
import { StickerSvg, stickerAnimationClass, stickerPositionClass } from "@/components/stickers/StickerSvg";
import { saveSticker, exportStickerToMedia } from "@/app/admin/(shell)/stickers/actions";

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
      <div className="grid gap-4 @4xl:sticky @4xl:top-4">
        <div className="rounded-2xl bg-white border border-eu-line p-4 grid gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 flex-1 min-w-[180px] font-bold text-eu-ink text-[length:var(--fs-14)]">Όνομα<input value={name} onChange={(e) => { setName(e.target.value); if (!id && !key) setKey(stickerKeyFromName(e.target.value)); }} placeholder="π.χ. 1+1 Black Friday" className={field} /></label>
            <label className="grid gap-1 w-48 font-bold text-eu-ink text-[length:var(--fs-14)]">Κλειδί<input value={key} onChange={(e) => setKey(stickerKeyFromName(e.target.value))} placeholder="bogo-bf" className={`${field} font-mono`} /></label>
            <label className="inline-flex items-center gap-2 min-h-11 font-bold text-eu-ink text-[length:var(--fs-14)]"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-5 accent-eu-navy" /> Ενεργό</label>
            <button type="button" disabled={pending} onClick={save} className="inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-blue disabled:opacity-50"><Check className="size-4" aria-hidden /> Αποθήκευση</button>
          </div>
          {msg && <p role="status" className="m-0 rounded-xl bg-eu-yellow/30 text-eu-navy font-bold text-[length:var(--fs-14)] px-3 py-2">{msg}</p>}
        </div>
        <div className="grid grid-cols-1 @2xl:grid-cols-[minmax(0,1fr)_280px] gap-4">
          <div className="rounded-2xl border border-eu-line bg-[repeating-conic-gradient(#eef0f4_0_25%,#fff_0_50%)] bg-[length:20px_20px] min-h-[360px] grid place-items-center p-6" ref={svgRef}>
            <StickerSvg p={{ ...p, size: Math.max(p.size, 200) }} id="d" className={anim} />
          </div>
          <div className="grid gap-2">
            <div className="text-eu-muted text-[length:var(--fs-13)] font-bold uppercase tracking-wide">Στην κάρτα προϊόντος</div>
            <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} className="group/card rounded-2xl bg-white border border-eu-line overflow-hidden shadow-[var(--shadow-raised)]">
              <div className="relative aspect-square eu-cutout-field">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={SAMPLE.img} alt="" className={`absolute inset-0 size-full object-contain p-[8%] eu-cutout-shadow transition-transform duration-500 ${hover ? "scale-[1.06]" : ""}`} />
                <span className={`absolute ${stickerPositionClass[p.position]} pointer-events-none`}><StickerSvg p={p} id="c" className={anim} /></span>
              </div>
              <div className="p-3"><div className="text-eu-muted text-[length:var(--fs-13)] font-bold">{SAMPLE.brand}</div><div className="font-bold text-eu-ink text-[length:var(--fs-14)] leading-snug">{SAMPLE.title}</div><div className="mt-1 flex items-baseline gap-2"><span className="font-extrabold text-eu-ink text-[length:var(--fs-18)]">{SAMPLE.price}</span><span className="text-eu-muted line-through text-[length:var(--fs-13)]">{SAMPLE.was}</span></div></div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => download(svgString(), `${fileBase()}.svg`, "image/svg+xml")} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-4 min-h-11 font-bold text-eu-ink text-[length:var(--fs-14)] hover:border-eu-navy"><Download className="size-4" aria-hidden /> SVG</button>
          <button type="button" onClick={() => pngBase64(4).then((b) => download(`data:image/png;base64,${b}`, `${fileBase()}@4x.png`, "image/png"))} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-4 min-h-11 font-bold text-eu-ink text-[length:var(--fs-14)] hover:border-eu-navy"><Download className="size-4" aria-hidden /> PNG @4x</button>
          {canExport && <button type="button" disabled={pending} onClick={toMedia} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-navy hover:text-white disabled:opacity-50"><Images className="size-4" aria-hidden /> Στη βιβλιοθήκη media</button>}
          <button type="button" onClick={() => navigator.clipboard.writeText(JSON.stringify(p, null, 2)).then(() => setMsg("Τα params αντιγράφηκαν (JSON)."))} className="inline-flex items-center gap-1.5 rounded-full px-4 min-h-11 font-bold text-eu-blue text-[length:var(--fs-14)] hover:bg-eu-blue/10"><Copy className="size-4" aria-hidden /> JSON</button>
        </div>
      </div>

      {/* controls column */}
      <div className="grid gap-3">
        <Section title="Πρότυπο">
          <div className="flex flex-wrap gap-1.5">{STICKER_PRESETS.map((t) => <button key={t.key} type="button" onClick={() => setP(t.params)} className={chip(false)}>{t.name}</button>)}</div>
        </Section>
        <Section title="Σχήμα">
          <div className="flex flex-wrap gap-1.5">{SHAPES.map((s) => <button key={s.v} type="button" onClick={() => set("shape", s.v)} className={chip(p.shape === s.v)}>{s.l}</button>)}</div>
          {(p.shape === "burst" || p.shape === "seal") && (
            <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]"><span className="flex justify-between"><span>{p.shape === "burst" ? "Ακτίνες" : "Δόντια"}</span><span className="tabular-nums text-eu-muted">{p.points}</span></span><input type="range" min={8} max={28} value={p.points} onChange={(e) => set("points", Number(e.target.value))} className="accent-eu-navy min-h-11" /></label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]"><span className="flex justify-between"><span>Μέγεθος</span><span className="tabular-nums text-eu-muted">{p.size}px</span></span><input type="range" min={48} max={220} value={p.size} onChange={(e) => set("size", Number(e.target.value))} className="accent-eu-navy min-h-11" /></label>
            <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]"><span className="flex justify-between"><span>Περιστροφή</span><span className="tabular-nums text-eu-muted">{p.rotate}°</span></span><input type="range" min={-30} max={30} value={p.rotate} onChange={(e) => set("rotate", Number(e.target.value))} className="accent-eu-navy min-h-11" /></label>
          </div>
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
                <label className="inline-flex items-center gap-1 min-h-9">Μέγεθος <input type="number" min={0} max={120} value={l.size} onChange={(e) => setLine(i, { size: Number(e.target.value) })} className="w-16 rounded-full border border-eu-line px-2 min-h-9" title="0 = αυτόματο" /></label>
                <label className="inline-flex items-center gap-1 min-h-9">Αραίωση <input type="number" min={-2} max={8} step={0.5} value={l.spacing} onChange={(e) => setLine(i, { spacing: Number(e.target.value) })} className="w-16 rounded-full border border-eu-line px-2 min-h-9" /></label>
              </div>
            </div>
          ))}
          {p.lines.length < 3 && <button type="button" onClick={() => setP((s) => ({ ...s, lines: [...s.lines, { text: "", size: 0, weight: 700, upper: false, spacing: 0 }] }))} className="justify-self-start inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-eu-line px-3 min-h-10 font-bold text-eu-blue text-[length:var(--fs-14)] hover:border-eu-blue"><Plus className="size-4" aria-hidden /> Γραμμή</button>}
          <div className="grid gap-1"><span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Εικονίδιο</span><div className="flex flex-wrap gap-1.5">{ICONS.map((ic) => <button key={ic.v} type="button" onClick={() => set("icon", ic.v)} className={chip(p.icon === ic.v)}>{ic.l}</button>)}</div></div>
        </Section>
        <Section title="Χρώματα">
          <ColorRow label="Γέμισμα" value={p.fill} onChange={(v) => set("fill", v ?? "#F1C400")} />
          <ColorRow label="Διαβάθμιση προς" value={p.fill2} onChange={(v) => set("fill2", v)} allowNone />
          <ColorRow label="Κείμενο & εικονίδιο" value={p.color} onChange={(v) => set("color", v ?? "#122A58")} />
          <ColorRow label="Περίγραμμα" value={p.border} onChange={(v) => set("border", v)} allowNone />
          {p.border && <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]"><span className="flex justify-between"><span>Πάχος περιγράμματος</span><span className="tabular-nums text-eu-muted">{p.borderWidth}</span></span><input type="range" min={1} max={12} value={p.borderWidth || 4} onChange={(e) => set("borderWidth", Number(e.target.value))} className="accent-eu-navy min-h-11" /></label>}
          <label className="inline-flex items-center gap-2 min-h-11 font-bold text-eu-ink text-[length:var(--fs-14)]"><input type="checkbox" checked={p.shadow} onChange={(e) => set("shadow", e.target.checked)} className="size-5 accent-eu-navy" /> Σκιά</label>
          <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Κόκκινο μόνο για εκπτώσεις (κανόνας brand).</p>
        </Section>
        <Section title="Στην κάρτα">
          <div className="grid gap-1"><span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Θέση</span><div className="flex flex-wrap gap-1.5">{([["tl", "Πάνω αριστερά"], ["tr", "Πάνω δεξιά"], ["bl", "Κάτω αριστερά"], ["br", "Κάτω δεξιά"], ["center", "Κέντρο"]] as const).map(([v, l]) => <button key={v} type="button" onClick={() => set("position", v)} className={chip(p.position === v)}>{l}</button>)}</div></div>
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
