"use client";
import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, Trash2, ExternalLink, AlertTriangle, Check, CircleCheck, CircleSlash, ChevronDown, Footprints, Sofa, CookingPot, BrickWall, Wand2, RotateCcw, RotateCw, Box, Ruler, ImagePlus } from "lucide-react";
import { setArEnabled, setArFit, attachArModel, detachArModel, rotateArModel, setArPlacement, setArFrontImage } from "./actions";
import { MediaPickerDialog } from "@/components/admin/media/MediaPicker";
import type { MediaAssetDTO } from "@/lib/media/types";

type Surface = "floor" | "furniture" | "counter" | "wall";
export interface ArRowData {
  id: string; slug: string; brand: string; title: string; image: string | null; cutout: string | null;
  dims: { w: number; h: number; d: number; source: "eprel" | "specs" | "category" } | null;
  /** η απόφαση που βλέπει ο πελάτης (arPlan) */
  plan: { on: boolean; code?: string | null; reason: string | null; fix: string | null; surface: Surface; tv: boolean; dims: { w: number; h: number; d: number } | null };
  /** υπάρχει ρητή ρύθμιση από τη διαχείριση */
  explicit: boolean;
  enabled: boolean; glbUrl: string | null; usdzUrl: string | null; fitToDims: boolean; modelBox: { w: number; h: number; d: number } | null;
  glbLightUrl: string | null; source: string | null; images: string[]; rotationY: number; fitMode: string; placement: string | null; autoPlacement: Surface; autoHint: string; frontImage: string | null;
}

/** Σύντομος λόγος για το chip της γραμμής· η πλήρης εξήγηση φαίνεται στις ρυθμίσεις. */
const OFF: Record<string, string> = { "admin-off": "Κλειστό από εσένα", "cat-off": "Κατηγορία εκτός AR", none: "Μικρή συσκευή", "no-dims": "Χωρίς διαστάσεις", bounds: "Διαστάσεις εκτός ορίων", "no-image": "Χωρίς φωτογραφία" };
const SURF: { v: Surface; label: string; Icon: typeof Footprints }[] = [
  { v: "floor", label: "Πάτωμα", Icon: Footprints }, { v: "furniture", label: "Έπιπλο", Icon: Sofa },
  { v: "counter", label: "Πάγκος", Icon: CookingPot }, { v: "wall", label: "Τοίχος", Icon: BrickWall },
];
const surfOf = (s: Surface) => SURF.find((x) => x.v === s)!;
const SOURCE: Record<string, string> = { eprel: "από EPREL", specs: "από τον κατασκευαστή / ERP", category: "τυπικές κατηγορίας" };
const btn = "inline-flex items-center justify-center gap-1.5 rounded-full border border-eu-line bg-white font-bold text-[length:var(--fs-13)] px-3.5 min-h-11 text-eu-ink-2 hover:border-eu-navy hover:text-eu-navy disabled:opacity-50 cursor-pointer transition-colors";
const checker = "bg-[repeating-conic-gradient(#eef0f4_0_25%,#fff_0_50%)] bg-[length:10px_10px]";

/** Ανέβασμα στη βιβλιοθήκη πολυμέσων και σύνδεση με το προϊόν. */
function UploadButton({ productId, kind, label, onDone }: { productId: string; kind: "glb" | "usdz"; label: string; onDone: (r: { ok: boolean; error?: string; box?: { w: number; h: number; d: number } }) => void }) {
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
    <label className={`${btn} focus-within:outline-2 focus-within:outline-eu-blue`}>
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />} {busy ? "Ανεβαίνει…" : label}
      <input ref={ref} type="file" accept={kind === "glb" ? ".glb,model/gltf-binary" : ".usdz,model/vnd.usdz+zip"} className="sr-only" onChange={(e) => pick(e.target.files?.[0])} disabled={busy} />
    </label>
  );
}

function Block({ title, hint, children }: { title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <fieldset className="m-0 p-0 border-0 grid gap-2 min-w-0">
      <legend className="p-0 mb-1 font-bold text-eu-ink text-[length:var(--fs-14)]">{title}</legend>
      {children}
      {hint && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">{hint}</p>}
    </fieldset>
  );
}

/**
 * Ένα προϊόν στη λίστα AR: μια συμπαγής γραμμή (κατάσταση, πού μπαίνει, διαστάσεις, διακόπτης) και οι ρυθμίσεις
 * σε ανάπτυξη — επιφάνεια, πρόσοψη του στερεού (μικρογραφίες) και, προαιρετικά, δικό μας 3D μοντέλο.
 * `open`: ανοιχτό εξαρχής (π.χ. στην καρτέλα του προϊόντος).
 */
export function ArRow({ row: r0, open: open0 = false }: { row: ArRowData; open?: boolean }) {
  const router = useRouter();
  const panelId = useId();
  const [r, setR] = useState(r0);
  // νέα δεδομένα από τον server (router.refresh) → νέα κατάσταση, χωρίς να κλείνει η ανάπτυξη
  const [prev, setPrev] = useState(r0);
  if (r0 !== prev) { setPrev(r0); setR(r0); }
  const [open, setOpen] = useState(open0);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [picker, setPicker] = useState(false);
  const act = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); });

  const setFront = (v: string | null) => { setR((x) => ({ ...x, frontImage: v })); act(() => setArFrontImage(r.id, v)); };
  const setPlace = (v: Surface | null) => { setR((x) => ({ ...x, placement: v })); act(() => setArPlacement(r.id, v)); };
  const setOn = (v: boolean) => { setR((x) => ({ ...x, enabled: v, explicit: true })); act(() => setArEnabled(r.id, v)); };

  const mismatch = r.modelBox && r.dims ? Math.round((Math.abs(r.modelBox.h - r.dims.h) / r.dims.h) * 100) : null;
  const hasDims = !!r.dims && r.dims.source !== "category";
  const canSwitch = hasDims && (!!r.image || !!r.glbUrl);
  const surface = (r.placement as Surface | null) ?? r.autoPlacement;
  const S = surfOf(r.plan.on ? r.plan.surface : surface);
  const thumb = r.frontImage ?? r.cutout ?? r.image;
  const front = r.frontImage && r.images.includes(r.frontImage) ? r.frontImage : r.frontImage ? "__custom" : "";
  const status = r.plan.on
    ? { cls: "bg-eu-green/12 text-eu-green", Icon: CircleCheck, text: "Ο πελάτης βλέπει AR" }
    : { cls: r.plan.code === "no-dims" || r.plan.code === "bounds" ? "bg-eu-red/10 text-eu-red" : "bg-eu-surface text-eu-ink-3", Icon: CircleSlash, text: OFF[r.plan.code ?? ""] ?? "Χωρίς AR" };

  return (
    <article className={`rounded-2xl border bg-white min-w-0 transition-colors ${open ? "border-eu-line-2 shadow-sm" : "border-eu-line"}`}>
      {/* — Συμπαγής γραμμή — */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
        <div className={`size-14 shrink-0 rounded-xl overflow-hidden grid place-items-center ${thumb ? checker : "bg-eu-surface"}`}>
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" loading="lazy" className="size-full object-contain" />
          ) : <ImagePlus className="size-5 text-eu-muted" aria-hidden />}
        </div>
        <div className="min-w-0 flex-1 basis-56 grid gap-1">
          <a href={`/admin/catalog/${r.id}?tab=dims`} className="font-bold text-eu-ink break-words hover:text-eu-blue hover:underline leading-snug">
            <span className="text-eu-ink-3 font-semibold">{r.brand}</span> {r.title}
          </a>
          <div className="flex flex-wrap items-center gap-1.5 text-[length:var(--fs-13)]">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold ${status.cls}`}><status.Icon className="size-3.5" aria-hidden /> {status.text}</span>
            {r.plan.on && <span className="inline-flex items-center gap-1 rounded-full bg-eu-surface px-2 py-0.5 font-semibold text-eu-ink-2"><S.Icon className="size-3.5" aria-hidden /> {S.label}{r.plan.tv ? " · TV" : ""}</span>}
            {r.dims ? <span className="inline-flex items-center gap-1 tabular-nums text-eu-ink-3"><Ruler className="size-3.5" aria-hidden /> {(r.plan.dims ?? r.dims).w} × {(r.plan.dims ?? r.dims).h} × {(r.plan.dims ?? r.dims).d} εκ.</span> : null}
            {r.glbUrl && <span className="inline-flex items-center gap-1 rounded-full bg-eu-navy text-white px-2 py-0.5 font-bold"><Box className="size-3.5" aria-hidden /> 3D μοντέλο</span>}
            {r.plan.fix && <span className="inline-flex items-center gap-1 text-eu-amber font-bold"><Wand2 className="size-3.5" aria-hidden /> διορθώθηκε</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button type="button" role="switch" aria-checked={r.enabled && canSwitch} disabled={pending || !canSwitch} onClick={() => setOn(!r.enabled)}
            title={!canSwitch ? "Χρειάζονται διαστάσεις προϊόντος" : r.explicit ? "Ρύθμιση από εσένα" : "Αυτόματη απόφαση"}
            className="inline-flex items-center gap-2 min-h-11 rounded-full pl-1.5 pr-3 font-bold text-[length:var(--fs-13)] text-eu-ink-2 hover:bg-eu-surface disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed">
            <span className={`relative inline-block h-6 w-10 rounded-full transition-colors ${r.enabled && canSwitch ? "bg-eu-green" : "bg-eu-line-2"}`}>
              <span className={`absolute left-0 top-0.5 size-5 rounded-full bg-white shadow transition-transform ${r.enabled && canSwitch ? "translate-x-[1.125rem]" : "translate-x-0.5"}`} />
            </span>
            AR{pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          </button>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={panelId} className={btn}>
            Ρυθμίσεις <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
          </button>
        </div>
      </div>

      {/* — Ρυθμίσεις — */}
      {open && (
        <div id={panelId} className="border-t border-eu-line p-3 @md:p-4 grid gap-5">
          {!r.plan.on && r.plan.reason && (
            <p className="m-0 flex items-start gap-2 rounded-xl bg-eu-surface px-3 py-2 text-eu-ink-2 text-[length:var(--fs-14)]">
              <AlertTriangle className="size-4 mt-0.5 shrink-0 text-eu-amber" aria-hidden />
              <span>{r.plan.reason}{(r.plan.code === "no-dims" || r.plan.code === "bounds") && <> <a href={`/admin/catalog/${r.id}?tab=dims`} className="font-bold text-eu-blue hover:underline">Άνοιγμα διαστάσεων →</a></>}</span>
            </p>
          )}
          {r.plan.fix && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]"><Wand2 className="inline size-3.5 text-eu-amber" aria-hidden /> Διορθώθηκε αυτόματα: {r.plan.fix}</p>}

          <div className="grid gap-5 @4xl:grid-cols-2">
            <Block title="Πού μπαίνει" hint={r.autoHint}>
              <div role="radiogroup" aria-label="Επιφάνεια" className="grid grid-cols-2 @sm:grid-cols-5 gap-1.5">
                {[{ v: null as Surface | null, label: `Αυτόματα`, sub: surfOf(r.autoPlacement).label, Icon: Wand2 }, ...SURF.map((x) => ({ ...x, v: x.v as Surface | null, sub: "" }))].map((o) => {
                  const on = (r.placement ?? null) === o.v;
                  return (
                    <button key={o.v ?? "auto"} type="button" role="radio" aria-checked={on} disabled={pending} onClick={() => setPlace(o.v)}
                      className={`${o.v === null ? "col-span-2 @sm:col-span-1 " : ""}grid justify-items-center gap-0.5 rounded-xl border px-2 py-2 min-h-14 text-[length:var(--fs-13)] font-bold transition-colors cursor-pointer disabled:opacity-60 ${on ? "border-eu-navy bg-eu-navy text-white" : "border-eu-line text-eu-ink-2 hover:border-eu-navy"}`}>
                      <o.Icon className="size-4" aria-hidden />{o.label}
                      {o.sub && <span className={`font-semibold text-[length:var(--fs-12)] ${on ? "text-white/80" : "text-eu-muted"}`}>{o.sub}</span>}
                    </button>
                  );
                })}
              </div>
            </Block>

            <Block title="Διαστάσεις" hint={r.dims ? `Δηλωμένες ${SOURCE[r.dims.source]}. Αλλάζουν στην καρτέλα του προϊόντος.` : undefined}>
              {r.dims ? (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="tabular-nums font-bold text-eu-ink text-[length:var(--fs-16)]">{r.dims.w} × {r.dims.h} × {r.dims.d} <span className="font-semibold text-eu-ink-3 text-[length:var(--fs-13)]">εκ. (Π × Υ × Β)</span></span>
                  <a href={`/admin/catalog/${r.id}?tab=dims`} className={btn}><Ruler className="size-4" aria-hidden /> Αλλαγή</a>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-bold text-eu-red">Χωρίς διαστάσεις — δεν συμμετέχει στο AR</span>
                  <a href={`/admin/catalog/${r.id}?tab=dims`} className={btn}><Ruler className="size-4" aria-hidden /> Συμπλήρωση</a>
                </div>
              )}
            </Block>
          </div>

          {!r.glbUrl && (
            <Block title="Πρόσοψη του στερεού" hint={r.frontImage ? "Η επιλεγμένη φωτογραφία γεμίζει ολόκληρη την πρόσοψη (Π × Υ)." : "Αυτόματα μπαίνει η πιο μετωπική φωτογραφία· αν είναι υπό γωνία, μπαίνει ολόκληρη στο κέντρο. Διάλεξε μια μετωπική για να γεμίσει την πρόσοψη."}>
              <div role="radiogroup" aria-label="Φωτογραφία πρόσοψης" className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
                <button type="button" role="radio" aria-checked={front === ""} disabled={pending} onClick={() => setFront(null)}
                  className={`grid place-items-center gap-1 rounded-xl border-2 aspect-square p-1 text-[length:var(--fs-13)] font-bold cursor-pointer ${front === "" ? "border-eu-navy text-eu-navy" : "border-eu-line text-eu-ink-3 hover:border-eu-navy"}`}>
                  <Wand2 className="size-5" aria-hidden /> Αυτόματα
                </button>
                {[...r.images, ...(front === "__custom" && r.frontImage ? [r.frontImage] : [])].map((u) => {
                  const on = r.frontImage === u;
                  return (
                    <button key={u} type="button" role="radio" aria-checked={on} disabled={pending} onClick={() => setFront(u)} aria-label={u.includes("/cutouts/") ? "Cutout" : `Φωτογραφία ${u.split("/").pop()}`}
                      className={`relative rounded-xl border-2 aspect-square overflow-hidden cursor-pointer ${checker} ${on ? "border-eu-navy ring-2 ring-eu-navy/20" : "border-eu-line hover:border-eu-navy"}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="" loading="lazy" className="size-full object-contain" />
                      {u.includes("/cutouts/") && <span className="absolute left-1 top-1 rounded bg-white/90 px-1 text-[length:var(--fs-12)] font-bold text-eu-ink-2">cutout</span>}
                      {on && <span className="absolute right-1 top-1 grid place-items-center size-5 rounded-full bg-eu-navy text-white"><Check className="size-3.5" aria-hidden /></span>}
                    </button>
                  );
                })}
                <button type="button" onClick={() => setPicker(true)} disabled={pending} className="grid place-items-center gap-1 rounded-xl border-2 border-dashed border-eu-line aspect-square p-1 text-[length:var(--fs-13)] font-bold text-eu-ink-3 hover:border-eu-navy hover:text-eu-navy cursor-pointer">
                  <ImagePlus className="size-5" aria-hidden /> Βιβλιοθήκη
                </button>
              </div>
              {picker && <MediaPickerDialog accept={["image"]} multiple={false} canWrite onSelect={(a) => { if (a[0]) setFront(a[0].url); setPicker(false); }} onClose={() => setPicker(false)} />}
            </Block>
          )}

          <Block title="3D μοντέλο (προαιρετικό)" hint={r.glbUrl ? undefined : "Χωρίς μοντέλο, ο πελάτης βλέπει τον όγκο της συσκευής σε πραγματική κλίμακα με τη φωτογραφία της. Με GLB του κατασκευαστή βλέπει το ίδιο το προϊόν σε 3D."}>
            {r.glbUrl ? (
              <div className="grid gap-3">
                <div className="flex flex-wrap items-center gap-2 text-[length:var(--fs-13)]">
                  <span className="inline-flex items-center gap-1 rounded-full bg-eu-navy text-white font-bold px-2 py-0.5"><Box className="size-3.5" aria-hidden /> Δικό μας GLB</span>
                  {r.glbLightUrl && <span className="rounded-full bg-eu-green/12 text-eu-green font-bold px-2 py-0.5">+ ελαφριά έκδοση</span>}
                  {r.usdzUrl && <span className="rounded-full bg-eu-surface text-eu-ink-2 font-bold px-2 py-0.5">+ USDZ για iPhone</span>}
                  {r.modelBox && <span className="tabular-nums text-eu-ink-3">μετρήθηκε {r.modelBox.w} × {r.modelBox.h} × {r.modelBox.d} εκ.</span>}
                  {mismatch != null && mismatch > 10 && !r.fitToDims && <span className="inline-flex items-center gap-1 text-eu-amber font-bold"><AlertTriangle className="size-3.5" aria-hidden /> {mismatch}% από το δηλωμένο ύψος</span>}
                  {mismatch != null && (mismatch <= 10 || r.fitToDims) && <span className="inline-flex items-center gap-1 text-eu-green font-bold"><Check className="size-3.5" aria-hidden /> σε κλίμακα</span>}
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="grid gap-1 text-[length:var(--fs-13)] text-eu-ink-3">Πρόσοψη
                    <div className="inline-flex items-center gap-1.5">
                      <button type="button" disabled={pending} onClick={() => start(async () => { const x = await rotateArModel(r.id, -90); setR((v) => ({ ...v, rotationY: x.rotationY })); })} className={btn} aria-label="Περιστροφή 90° αριστερά"><RotateCcw className="size-4" aria-hidden /></button>
                      <span className="tabular-nums font-bold text-eu-ink w-10 text-center">{r.rotationY}°</span>
                      <button type="button" disabled={pending} onClick={() => start(async () => { const x = await rotateArModel(r.id, 90); setR((v) => ({ ...v, rotationY: x.rotationY })); })} className={btn} aria-label="Περιστροφή 90° δεξιά"><RotateCw className="size-4" aria-hidden /></button>
                    </div>
                  </div>
                  <label className="grid gap-1 text-[length:var(--fs-13)] text-eu-ink-3 min-w-0 flex-1 basis-52">Κλίμακα
                    <select value={r.fitToDims ? r.fitMode : "none"} disabled={pending} onChange={(e) => { const v = e.target.value; const on = v !== "none"; const mode = v === "height" ? "height" : "box"; setR({ ...r, fitToDims: on, fitMode: mode }); act(() => setArFit(r.id, on, mode)); }} className="rounded-xl border border-eu-line px-3 min-h-11 bg-white w-full text-eu-ink">
                      <option value="box">Στις διαστάσεις Π × Υ × Β</option><option value="height">Μόνο στο ύψος (κρατά αναλογίες)</option><option value="none">Όπως είναι το αρχείο</option>
                    </select>
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <UploadButton productId={r.id} kind="glb" label="Αντικατάσταση GLB" onDone={(x) => { setMsg({ ok: x.ok, text: x.ok ? "Νέο GLB συνδέθηκε." : x.error ?? "Απέτυχε." }); if (x.ok) router.refresh(); }} />
                  {r.usdzUrl
                    ? <button type="button" disabled={pending} onClick={() => act(async () => { await detachArModel(r.id, "usdz"); setR((v) => ({ ...v, usdzUrl: null })); })} className={btn}><Trash2 className="size-4" aria-hidden /> Αφαίρεση USDZ</button>
                    : <UploadButton productId={r.id} kind="usdz" label="USDZ για iPhone" onDone={(x) => { setMsg({ ok: x.ok, text: x.ok ? "Το USDZ συνδέθηκε." : x.error ?? "Απέτυχε." }); if (x.ok) router.refresh(); }} />}
                  <button type="button" disabled={pending} onClick={() => { if (confirm("Αφαίρεση του 3D μοντέλου; Ο πελάτης θα βλέπει τον όγκο από τις διαστάσεις και τη φωτογραφία.")) act(() => detachArModel(r.id, "glb")); }} className={`${btn} text-eu-red hover:border-eu-red hover:text-eu-red`}><Trash2 className="size-4" aria-hidden /> Αφαίρεση μοντέλου</button>
                </div>
              </div>
            ) : (
              <div><UploadButton productId={r.id} kind="glb" label="Ανέβασμα GLB" onDone={(x) => { setMsg({ ok: x.ok, text: x.ok ? `Το μοντέλο συνδέθηκε${x.box ? ` · ${x.box.w} × ${x.box.h} × ${x.box.d} εκ.` : ""}.` : x.error ?? "Απέτυχε." }); if (x.ok) router.refresh(); }} /></div>
            )}
            {msg && <p role="status" className={`m-0 text-[length:var(--fs-13)] font-bold ${msg.ok ? "text-eu-green" : "text-eu-red"}`}>{msg.text}</p>}
          </Block>

          <div className="flex flex-wrap items-center gap-2 border-t border-eu-line pt-3">
            {r.plan.on
              ? <a href={`/proion/${r.slug}?ar=1`} target="_blank" rel="noreferrer" className={btn}><ExternalLink className="size-4" aria-hidden /> Δοκιμή στη σελίδα του προϊόντος</a>
              : <span className="text-eu-muted text-[length:var(--fs-13)]">Η δοκιμή εμφανίζεται όταν ο πελάτης βλέπει AR.</span>}
            <span className="ml-auto text-eu-muted text-[length:var(--fs-13)]">{r.explicit ? "Ρυθμισμένο από τη διαχείριση" : "Αυτόματη απόφαση"} · κάθε αλλαγή αποθηκεύεται αμέσως</span>
          </div>
        </div>
      )}
    </article>
  );
}
