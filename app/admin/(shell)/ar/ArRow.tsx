"use client";
import { useRef, useState, useTransition } from "react";
import { Loader2, Upload, Trash2, ExternalLink, AlertTriangle, Check } from "lucide-react";
import { setArEnabled, setArFit, attachArModel, detachArModel, rotateArModel, setArPlacement, setArFrontImage } from "./actions";
import { MediaPickerDialog } from "@/components/admin/media/MediaPicker";
import type { MediaAssetDTO } from "@/lib/media/types";

export interface ArRowData {
  id: string; slug: string; brand: string; title: string; image: string | null; cutout: string | null;
  dims: { w: number; h: number; d: number; source: "eprel" | "specs" | "category" } | null;
  /** η απόφαση που βλέπει ο πελάτης (arPlan) */
  plan: { on: boolean; reason: string | null; fix: string | null; surface: "floor" | "furniture" | "counter" | "wall"; tv: boolean; dims: { w: number; h: number; d: number } | null };
  /** υπάρχει ρητή ρύθμιση από τη διαχείριση */
  explicit: boolean;
  enabled: boolean; glbUrl: string | null; usdzUrl: string | null; fitToDims: boolean; modelBox: { w: number; h: number; d: number } | null;
  glbLightUrl: string | null; source: string | null; images: string[]; rotationY: number; fitMode: string; placement: string | null; autoPlacement: "floor" | "furniture" | "counter" | "wall"; autoHint: string; frontImage: string | null;
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

const SURF: Record<string, string> = { floor: "πάτωμα", furniture: "έπιπλο", counter: "πάγκος", wall: "τοίχος" };

export function ArRow({ row: r0 }: { row: ArRowData }) {
  const [r, setR] = useState(r0);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const setFront = (v: string | null) => { setR((x) => ({ ...x, frontImage: v })); start(async () => { await setArFrontImage(r.id, v); }); };
  const mismatch = r.modelBox && r.dims ? Math.round((Math.abs(r.modelBox.h - r.dims.h) / r.dims.h) * 100) : null;
  const canGenerate = !!r.dims && !!r.image;
  return (
    <article className="rounded-2xl border border-eu-line bg-white p-3 @md:p-4 grid gap-3 min-w-0">
      <header className="flex flex-wrap items-start gap-3">
        {r.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.cutout ?? r.image} alt="" className="size-14 shrink-0 object-contain rounded-lg bg-eu-surface" />
        )}
        <div className="min-w-0 flex-1 basis-60">
          <div className="font-bold text-eu-ink break-words">{r.brand} {r.title}</div>
          <div className="text-eu-muted text-[length:var(--fs-13)] break-all">{r.slug}</div>
          <p className={`m-0 mt-1 text-[length:var(--fs-13)] font-semibold ${r.plan.on ? "text-eu-green" : "text-eu-amber"}`}>
            {r.plan.on ? `Ο πελάτης βλέπει AR · ${SURF[r.plan.surface]}${r.plan.tv ? " · μοντέλο τηλεόρασης" : ""}${r.plan.dims ? ` · ${r.plan.dims.w} × ${r.plan.dims.h} × ${r.plan.dims.d} εκ.` : ""}` : `Χωρίς AR: ${r.plan.reason ?? ""}`}
          </p>
          {r.plan.fix && <p className="m-0 text-[length:var(--fs-13)] text-eu-ink-3">Διορθώθηκε αυτόματα: {r.plan.fix}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 min-h-11 rounded-full border border-eu-line px-3 font-bold text-[length:var(--fs-13)]">
            <input type="checkbox" checked={r.enabled} disabled={pending || (!canGenerate && !r.glbUrl)} onChange={(e) => { const v = e.target.checked; setR({ ...r, enabled: v, explicit: true }); start(async () => { await setArEnabled(r.id, v); }); }} className="size-5 accent-eu-navy" />
            {r.enabled ? "AR ανοιχτό" : "AR κλειστό"}{r.explicit ? "" : " (αυτόματα)"}
          </label>
          {r.enabled && <a href={`/proion/${r.slug}?ar=1`} target="_blank" rel="noreferrer" className={`${small} min-h-11 no-underline`}><ExternalLink className="size-3.5" aria-hidden /> Προεπισκόπηση</a>}
        </div>
      </header>
      <div className="grid gap-3 @3xl:grid-cols-[repeat(3,minmax(0,1fr))] border-t border-eu-line pt-3">
      <section className="min-w-0 grid content-start gap-1" aria-label="Τοποθέτηση και διαστάσεις">
        <label className="mb-1.5 grid gap-1 text-[length:var(--fs-13)] text-eu-ink-3">Τοποθέτηση
          <select value={r.placement ?? ""} disabled={pending} title={r.autoHint} onChange={(e) => { const v = (e.target.value || null) as "floor" | "furniture" | "counter" | "wall" | null; setR({ ...r, placement: v }); start(async () => { await setArPlacement(r.id, v); }); }} className="rounded-lg border border-eu-line px-2 min-h-11 bg-white w-full">
            <option value="">Αυτόματα ({SURF[r.autoPlacement]})</option><option value="floor">Πάτωμα</option><option value="furniture">Έπιπλο (TV, γραφείο)</option><option value="counter">Πάγκος κουζίνας</option><option value="wall">Τοίχος</option>
          </select>
        </label>
        {r.dims ? <><span className="tabular-nums">Δηλωμένες: {r.dims.w} × {r.dims.h} × {r.dims.d} εκ.</span><div className={`text-[length:var(--fs-13)] ${r.dims.source === "category" ? "text-eu-amber font-bold" : "text-eu-muted"}`}>{SOURCE[r.dims.source]}</div></> : <span className="text-eu-red font-bold">Χωρίς διαστάσεις</span>}
      </section>
      <section className="min-w-0 text-[length:var(--fs-13)]" aria-label="Φωτογραφία">
        <div className="grid gap-1.5">
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
              <span className="text-eu-muted">{r.frontImage ? "Γεμίζει ολόκληρη την πρόσοψη Π×Υ." : "Αυτόματα: η πιο μετωπική φωτογραφία· αν είναι υπό γωνία, μπαίνει ολόκληρη στο κέντρο της πρόσοψης. Διάλεξε μετωπική για να γεμίσει την έδρα."}</span>
            </>
          )}
          {picker && <MediaPickerDialog accept={["image"]} multiple={false} canWrite onSelect={(a) => { if (a[0]) setFront(a[0].url); setPicker(false); }} onClose={() => setPicker(false)} />}
        </div>
      </section>
      <section className="min-w-0" aria-label="Μοντέλο">
        <div className="grid gap-1.5">
          {r.glbUrl ? (
            <>
              <div className="inline-flex flex-wrap items-center gap-2 text-[length:var(--fs-13)]">
                <span className="rounded-full bg-eu-navy text-white font-bold px-2 py-0.5">Δικό μας GLB</span>
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
      </section>
      </div>
    </article>
  );
}
