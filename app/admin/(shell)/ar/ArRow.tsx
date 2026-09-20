"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Upload, Trash2, ExternalLink, AlertTriangle, Check, Sparkles } from "lucide-react";
import { setArEnabled, setArFit, attachArModel, detachArModel, generateArModel, pollArGeneration, rotateArModel, setArPlacement, setArFrontImage } from "./actions";
import { MediaPickerDialog } from "@/components/admin/media/MediaPicker";
import type { MediaAssetDTO } from "@/lib/media/types";

export interface ArRowData {
  id: string; slug: string; brand: string; title: string; image: string | null; cutout: string | null;
  dims: { w: number; h: number; d: number; source: "eprel" | "specs" | "category" } | null;
  enabled: boolean; glbUrl: string | null; usdzUrl: string | null; fitToDims: boolean; modelBox: { w: number; h: number; d: number } | null;
  glbLightUrl: string | null; source: string | null; images: string[]; gen: GenData | null; rotationY: number; fitMode: string; placement: string | null; autoPlacement: "floor" | "wall"; frontImage: string | null;
}
export interface GenData { id: string; status: string; step: string | null; progress: number; error: string | null; fullUrl: string | null; lightUrl: string | null; fullBytes: number | null; lightBytes: number | null; renderUrl: string | null; imageUrl: string; createdAt: string | Date; creditsFull: number | null; creditsLight: number | null; views?: unknown }

const kb = (n: number | null) => (n == null ? "" : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

/**
 * 3D από φωτογραφία (Tripo3D). Επιλογή εικόνας, εκκίνηση, και παρακολούθηση
 * κάθε 5 s όσο τρέχει· όταν τελειώσει, το μοντέλο έχει ήδη δεθεί με το προϊόν.
 */
function Generate({ productId, images, gen: g0, onModel }: { productId: string; images: string[]; gen: GenData | null; onModel: (box?: { w: number; h: number; d: number }) => void }) {
  const [gen, setGen] = useState<GenData | null>(g0);
  const [img, setImg] = useState(images[0] ?? "");
  const [views, setViews] = useState<{ left?: string; back?: string; right?: string }>({});
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = !!gen && ["queued", "running", "converting"].includes(gen.status);
  useEffect(() => {
    if (!active || !gen) return;
    const t = setInterval(async () => { const n = await pollArGeneration(gen.id); if (n) { setGen(n); if (n.status === "done" || (n.status === "converting" && n.fullUrl)) onModel(); } }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, gen?.id]);
  const start = async () => { if (!img) return; setBusy(true); try { setGen(await generateArModel(productId, img, views)); } finally { setBusy(false); } };
  const name = (u: string) => `${u.includes("/cutouts/") ? "Cutout · " : ""}${u.split("/").pop()}`;
  return (
    <div className="grid gap-1.5 min-w-[220px] text-[length:var(--fs-13)]">
      {gen && (
        <div className={`rounded-lg px-2.5 py-1.5 ${gen.status === "failed" ? "bg-eu-red/10 text-eu-red" : gen.status === "done" ? "bg-eu-green/10 text-eu-green" : "bg-eu-surface text-eu-ink-3"}`}>
          {active && <span className="inline-flex items-center gap-1.5"><Loader2 className="size-3.5 animate-spin" aria-hidden /> {gen.step ?? "Σε εξέλιξη"} · {gen.progress}%</span>}
          {gen.status === "done" && <span className="font-bold">Έτοιμο{gen.views ? " (πολλαπλές όψεις)" : ""}: πλήρες {kb(gen.fullBytes)}{gen.lightUrl ? ` · ελαφρύ ${kb(gen.lightBytes)}` : ""}{gen.creditsFull != null ? ` · κόστος ${gen.creditsFull + (gen.creditsLight ?? 0)} credits` : ""}{gen.error ? ` · ${gen.error}` : ""}</span>}
          {gen.status === "failed" && <span className="font-bold">{gen.error ?? "Απέτυχε."}</span>}
        </div>
      )}
      {!active && (
        <div className="flex flex-wrap items-center gap-1.5">
          <select value={img} onChange={(e) => setImg(e.target.value)} aria-label="Φωτογραφία για 3D" className="rounded-lg border border-eu-line px-2 min-h-9 bg-white max-w-[180px] truncate">
            {images.map((u) => <option key={u} value={u}>{u.includes("/cutouts/") ? "Cutout · " : ""}{u.split("/").pop()}</option>)}
          </select>
          <button type="button" disabled={busy || !img} onClick={start} className={small}>{busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />} {gen ? "Ξανά" : "Δημιουργία 3D"}</button>
          {images.length > 1 && <button type="button" onClick={() => setMore((m) => !m)} className="text-eu-blue font-bold underline">{more ? "Λιγότερες όψεις" : "Περισσότερες όψεις"}</button>}
        </div>
      )}
      {!active && more && (
        <div className="grid gap-1 rounded-lg bg-eu-surface p-2">
          <div className="text-eu-muted">Η μπροστινή όψη είναι η παραπάνω· δώσε και πλαϊνές/πίσω για σωστό βάθος.</div>
          {(["left", "back", "right"] as const).map((k) => (
            <label key={k} className="grid grid-cols-[4.5rem_1fr] items-center gap-2">{k === "left" ? "Αριστερά" : k === "back" ? "Πίσω" : "Δεξιά"}
              <select value={views[k] ?? ""} onChange={(e) => setViews((v) => ({ ...v, [k]: e.target.value || undefined }))} className="rounded-lg border border-eu-line px-2 min-h-8 bg-white truncate"><option value="">—</option>{images.map((u) => <option key={u} value={u}>{name(u)}</option>)}</select>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const SOURCE: Record<string, string> = { eprel: "EPREL (χωρίς προεξοχές)", specs: "κατασκευαστής", category: "τυπικές κατηγορίας" };
const small = "inline-flex items-center gap-1 rounded-full border border-eu-line font-bold text-[length:var(--fs-13)] px-3 min-h-9 hover:border-eu-navy disabled:opacity-60 cursor-pointer";

/** Ανέβασμα στη βιβλιοθήκη πολυμέσων και σύνδεση με το προϊόν. */
function UploadButton({ productId, kind, onDone }: { productId: string; kind: "glb" | "usdz"; onDone: (r: { ok: boolean; error?: string; box?: { w: number; h: number; d: number } }) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("keepFormat", "1");
      const r = await fetch("/api/admin/media/upload", { method: "POST", body: fd });
      const asset = (await r.json()) as MediaAssetDTO & { error?: string };
      if (!r.ok || asset.error) { onDone({ ok: false, error: asset.error ?? "Το ανέβασμα απέτυχε." }); return; }
      const a = await attachArModel(productId, kind, { id: asset.id, url: asset.url, filename: asset.filename });
      onDone(a.ok ? { ok: true, box: "box" in a ? a.box : undefined } : { ok: false, error: a.error });
    } finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  };
  return (
    <label className={small}>
      {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Upload className="size-3.5" aria-hidden />} {kind === "glb" ? "Ανέβασε GLB" : "USDZ (iPhone)"}
      <input ref={ref} type="file" accept={kind === "glb" ? ".glb,model/gltf-binary" : ".usdz,model/vnd.usdz+zip"} className="sr-only" onChange={(e) => pick(e.target.files?.[0])} disabled={busy} />
    </label>
  );
}

export function ArRow({ row: r0 }: { row: ArRowData }) {
  const [r, setR] = useState(r0);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const setFront = (v: string | null) => { setR((x) => ({ ...x, frontImage: v })); start(async () => { await setArFrontImage(r.id, v); }); };
  const mismatch = r.modelBox && r.dims ? Math.round((Math.abs(r.modelBox.h - r.dims.h) / r.dims.h) * 100) : null;
  const canGenerate = !!r.dims && !!r.image;
  return (
    <tr className="border-t border-eu-line align-top">
      <td className="py-2 px-3">
        <label className="inline-flex items-center gap-2 min-h-9">
          <input type="checkbox" checked={r.enabled} disabled={pending || (!canGenerate && !r.glbUrl)} onChange={(e) => { const v = e.target.checked; setR({ ...r, enabled: v }); start(async () => { await setArEnabled(r.id, v); }); }} className="size-4 accent-eu-navy" />
          <span className="sr-only">AR ενεργό</span>
        </label>
      </td>
      <td className="py-2 px-3">
        <div className="flex items-center gap-2">
          {r.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.cutout ?? r.image} alt="" className="size-10 object-contain rounded bg-eu-surface" />
          )}
          <div><div className="font-bold text-eu-ink">{r.brand} {r.title}</div><div className="text-eu-muted text-[length:var(--fs-13)]">{r.id}</div></div>
        </div>
      </td>
      <td className="py-2 px-3 whitespace-nowrap">
        <label className="mb-1.5 flex items-center gap-1.5 text-[length:var(--fs-13)] text-eu-ink-3">Τοποθέτηση
          <select value={r.placement ?? ""} disabled={pending} onChange={(e) => { const v = (e.target.value || null) as "floor" | "wall" | null; setR({ ...r, placement: v }); start(async () => { await setArPlacement(r.id, v); }); }} className="rounded-lg border border-eu-line px-2 min-h-8 bg-white">
            <option value="">Αυτόματα ({r.autoPlacement === "wall" ? "τοίχος" : "πάτωμα"})</option><option value="floor">Πάτωμα</option><option value="wall">Τοίχος</option>
          </select>
        </label>
        {r.dims ? <><span className="tabular-nums">{r.dims.w} × {r.dims.h} × {r.dims.d} εκ.</span><div className={`text-[length:var(--fs-13)] ${r.dims.source === "category" ? "text-eu-amber font-bold" : "text-eu-muted"}`}>{SOURCE[r.dims.source]}</div></> : <span className="text-eu-red font-bold">Χωρίς διαστάσεις</span>}
      </td>
      <td className="py-2 px-3 text-[length:var(--fs-13)]">
        <div className="grid gap-1.5 min-w-[200px]">
          <div>{r.cutout ? <span className="text-eu-green font-bold">Cutout</span> : r.image ? <span className="text-eu-ink-3">Φωτογραφία, χωρίς cutout</span> : <span className="text-eu-red font-bold">Καμία</span>}</div>
          {/* Η όψη που γεμίζει την πρόσοψη του στερεού όταν δεν υπάρχει 3D μοντέλο */}
          {!r.glbUrl && (
            <>
              <label className="grid gap-1 text-eu-ink-3">Όψη στο στερεό
                <span className="flex items-center gap-2">
                  {(r.frontImage ?? r.cutout ?? r.image) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.frontImage ?? r.cutout ?? r.image ?? ""} alt="" className="size-10 shrink-0 object-contain rounded bg-[repeating-conic-gradient(#eef0f4_0_25%,#fff_0_50%)] bg-[length:10px_10px]" />
                  )}
                  <select value={r.frontImage && r.images.includes(r.frontImage) ? r.frontImage : r.frontImage ? "__custom" : ""} disabled={pending} onChange={(e) => { const v = e.target.value; if (v === "__pick") setPicker(true); else if (v !== "__custom") setFront(v || null); }} className="rounded-lg border border-eu-line px-2 min-h-8 bg-white max-w-[170px] truncate">
                    <option value="">Αυτόματα (η πιο μετωπική)</option>
                    {r.images.map((u) => <option key={u} value={u}>{u.includes("/cutouts/") ? "Cutout · " : ""}{u.split("/").pop()}</option>)}
                    {r.frontImage && !r.images.includes(r.frontImage) && <option value="__custom">Από βιβλιοθήκη · {r.frontImage.split("/").pop()}</option>}
                    <option value="__pick">Άλλη από τη βιβλιοθήκη…</option>
                  </select>
                </span>
              </label>
              {r.frontImage && <span className="text-eu-muted">Γεμίζει ολόκληρη την πρόσοψη Π×Υ.</span>}
            </>
          )}
          {picker && <MediaPickerDialog accept={["image"]} multiple={false} canWrite onSelect={(a) => { if (a[0]) setFront(a[0].url); setPicker(false); }} onClose={() => setPicker(false)} />}
        </div>
      </td>
      <td className="py-2 px-3">
        <div className="grid gap-1.5 min-w-[260px]">
          {r.glbUrl ? (
            <>
              <div className="inline-flex flex-wrap items-center gap-2 text-[length:var(--fs-13)]">
                <span className="rounded-full bg-eu-navy text-white font-bold px-2 py-0.5">{r.source === "tripo" ? "3D από φωτογραφία" : "Δικό μας GLB"}</span>
                {r.glbLightUrl && <span className="rounded-full bg-eu-green/12 text-eu-green font-bold px-2 py-0.5">+ ελαφριά έκδοση</span>}
                {r.modelBox && <span className="tabular-nums text-eu-ink-3">μετρήθηκε {r.modelBox.w} × {r.modelBox.h} × {r.modelBox.d} εκ.</span>}
                {mismatch != null && mismatch > 10 && !r.fitToDims && <span className="inline-flex items-center gap-1 text-eu-amber font-bold"><AlertTriangle className="size-3.5" aria-hidden /> {mismatch}% από το δηλωμένο ύψος</span>}
                {mismatch != null && (mismatch <= 10 || r.fitToDims) && <span className="inline-flex items-center gap-1 text-eu-green font-bold"><Check className="size-3.5" aria-hidden /> σε κλίμακα</span>}
              </div>
              <div className="inline-flex items-center gap-1.5 text-[length:var(--fs-13)] text-eu-ink-3">Πρόσοψη: <button type="button" disabled={pending} onClick={() => start(async () => { const x = await rotateArModel(r.id, -90); setR((v) => ({ ...v, rotationY: x.rotationY })); })} className={small} aria-label="Περιστροφή αριστερά">↺ 90°</button><span className="tabular-nums">{r.rotationY}°</span><button type="button" disabled={pending} onClick={() => start(async () => { const x = await rotateArModel(r.id, 90); setR((v) => ({ ...v, rotationY: x.rotationY })); })} className={small} aria-label="Περιστροφή δεξιά">↻ 90°</button></div>
              <label className="inline-flex items-center gap-2 text-[length:var(--fs-13)] text-eu-ink-3">Προσαρμογή:
                <select value={r.fitToDims ? r.fitMode : "none"} onChange={(e) => { const v = e.target.value; const on = v !== "none"; const mode = v === "height" ? "height" : "box"; setR({ ...r, fitToDims: on, fitMode: mode }); start(async () => { await setArFit(r.id, on, mode); }); }} className="rounded-lg border border-eu-line px-2 min-h-8 bg-white">
                  <option value="box">στις διαστάσεις Π×Υ×Β</option><option value="height">μόνο στο ύψος (κρατά αναλογίες)</option><option value="none">καμία</option>
                </select>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {r.usdzUrl ? <span className="inline-flex items-center gap-1 rounded-full bg-eu-surface px-2 py-0.5 text-[length:var(--fs-13)] font-bold text-eu-ink-3">USDZ ✓ <button type="button" onClick={() => start(async () => { await detachArModel(r.id, "usdz"); setR({ ...r, usdzUrl: null }); })} aria-label="Αφαίρεση USDZ" className="text-eu-muted hover:text-eu-red"><Trash2 className="size-3.5" aria-hidden /></button></span> : <UploadButton productId={r.id} kind="usdz" onDone={(x) => { setMsg(x.ok ? "Το USDZ συνδέθηκε." : x.error ?? null); if (x.ok) setR({ ...r, usdzUrl: "✓" }); }} />}
                <UploadButton productId={r.id} kind="glb" onDone={(x) => { setMsg(x.ok ? "Νέο GLB." : x.error ?? null); if (x.ok) setR({ ...r, modelBox: x.box ?? r.modelBox }); }} />
                <button type="button" disabled={pending} onClick={() => { if (confirm("Αφαίρεση του μοντέλου; Το προϊόν θα δείχνει τον όγκο από τη γεννήτρια.")) start(async () => { await detachArModel(r.id, "glb"); setR({ ...r, glbUrl: null, modelBox: null }); }); }} className={small}><Trash2 className="size-3.5" aria-hidden /> Αφαίρεση</button>
              </div>
            </>
          ) : (
            <>
              <div className="text-[length:var(--fs-13)] text-eu-ink-3">{canGenerate ? "Γεννήτρια: όγκος από διαστάσεις + φωτογραφία" : "Χρειάζεται διαστάσεις και φωτογραφία, ή δικό μας GLB"}</div>
              <div><UploadButton productId={r.id} kind="glb" onDone={(x) => { setMsg(x.ok ? `Το μοντέλο συνδέθηκε${x.box ? ` · ${x.box.w} × ${x.box.h} × ${x.box.d} εκ.` : ""}.` : x.error ?? null); if (x.ok) setR({ ...r, enabled: true, glbUrl: "✓", modelBox: x.box ?? null }); }} /></div>
            </>
          )}
          {msg && <div className="text-[length:var(--fs-13)] text-eu-ink-3">{msg}</div>}
        </div>
      </td>
      <td className="py-2 px-3">
        <Generate productId={r.id} images={r.images} gen={r.gen} onModel={() => setR((x) => ({ ...x, enabled: true, glbUrl: x.glbUrl ?? "✓", source: "tripo" }))} />
      </td>
      <td className="py-2 px-3 text-right whitespace-nowrap">
        {r.enabled && <a href={`/proion/${r.slug}?ar=1`} target="_blank" rel="noreferrer" className={`${small} no-underline`}><ExternalLink className="size-3.5" aria-hidden /> Προεπισκόπηση</a>}
      </td>
    </tr>
  );
}
