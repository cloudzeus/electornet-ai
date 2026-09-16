"use client";
import { useRef, useState, useTransition } from "react";
import { Loader2, Upload, Trash2, ExternalLink, AlertTriangle, Check } from "lucide-react";
import { setArEnabled, setArFit, attachArModel, detachArModel } from "./actions";
import type { MediaAssetDTO } from "@/lib/media/types";

export interface ArRowData {
  id: string; slug: string; brand: string; title: string; image: string | null; cutout: string | null;
  dims: { w: number; h: number; d: number; source: "eprel" | "specs" | "category" } | null;
  enabled: boolean; glbUrl: string | null; usdzUrl: string | null; fitToDims: boolean; modelBox: { w: number; h: number; d: number } | null;
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
        {r.dims ? <><span className="tabular-nums">{r.dims.w} × {r.dims.h} × {r.dims.d} εκ.</span><div className={`text-[length:var(--fs-13)] ${r.dims.source === "category" ? "text-eu-amber font-bold" : "text-eu-muted"}`}>{SOURCE[r.dims.source]}</div></> : <span className="text-eu-red font-bold">Χωρίς διαστάσεις</span>}
      </td>
      <td className="py-2 px-3 text-[length:var(--fs-13)]">{r.cutout ? <span className="text-eu-green font-bold">Cutout</span> : r.image ? <span className="text-eu-ink-3">Φωτογραφία, χωρίς cutout</span> : <span className="text-eu-red font-bold">Καμία</span>}</td>
      <td className="py-2 px-3">
        <div className="grid gap-1.5 min-w-[260px]">
          {r.glbUrl ? (
            <>
              <div className="inline-flex flex-wrap items-center gap-2 text-[length:var(--fs-13)]">
                <span className="rounded-full bg-eu-navy text-white font-bold px-2 py-0.5">Δικό μας GLB</span>
                {r.modelBox && <span className="tabular-nums text-eu-ink-3">μετρήθηκε {r.modelBox.w} × {r.modelBox.h} × {r.modelBox.d} εκ.</span>}
                {mismatch != null && mismatch > 10 && !r.fitToDims && <span className="inline-flex items-center gap-1 text-eu-amber font-bold"><AlertTriangle className="size-3.5" aria-hidden /> {mismatch}% από το δηλωμένο ύψος</span>}
                {mismatch != null && (mismatch <= 10 || r.fitToDims) && <span className="inline-flex items-center gap-1 text-eu-green font-bold"><Check className="size-3.5" aria-hidden /> σε κλίμακα</span>}
              </div>
              <label className="inline-flex items-center gap-2 text-[length:var(--fs-13)] text-eu-ink-3"><input type="checkbox" checked={r.fitToDims} onChange={(e) => { const v = e.target.checked; setR({ ...r, fitToDims: v }); start(async () => { await setArFit(r.id, v); }); }} className="size-4 accent-eu-navy" /> Προσαρμογή στο δηλωμένο ύψος</label>
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
      <td className="py-2 px-3 text-right whitespace-nowrap">
        {r.enabled && <a href={`/proion/${r.slug}?ar=1`} target="_blank" rel="noreferrer" className={`${small} no-underline`}><ExternalLink className="size-3.5" aria-hidden /> Προεπισκόπηση</a>}
      </td>
    </tr>
  );
}
