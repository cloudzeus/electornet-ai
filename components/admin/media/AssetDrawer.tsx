"use client";

import { useState, useTransition } from "react";
import { Copy, Check, Crop, Download, ExternalLink, FileText, Replace, Scissors, Trash2, X, Clapperboard, Crosshair, Sparkles } from "lucide-react";
import type { MediaAssetDTO, MediaFolderDTO } from "@/lib/media/types";
import { updateAsset, removeBackgroundAction, setVideoPoster, aiDescribeAsset } from "@/app/admin/(shell)/media/actions";
import { fmtBytes, fmtDuration, fileExt } from "./format";

/** Right-hand detail panel: preview, editable metadata, focal point, actions. Mount with key={asset.id} so the form resets per asset. */
export function AssetDrawer({ a, folders, canWrite, onClose, onChange, onDelete, onEdit, onReplace, onCreated }: {
  a: MediaAssetDTO;
  folders: MediaFolderDTO[];
  canWrite: boolean;
  onClose: () => void;
  onChange: (a: MediaAssetDTO) => void;
  onDelete: (id: string) => void;
  onEdit: (a: MediaAssetDTO) => void;
  onReplace: (a: MediaAssetDTO, file: File) => void;
  onCreated: (a: MediaAssetDTO) => void;
}) {
  const [form, setForm] = useState({ title: a.title ?? "", alt: a.alt ?? "", caption: a.caption ?? "", tags: a.tags.join(", "), folderId: a.folderId ?? "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [posterAt, setPosterAt] = useState(1);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const r = await updateAsset(a.id, { title: form.title || null, alt: form.alt || null, caption: form.caption || null, tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean), folderId: form.folderId || null });
      onChange(r);
      setMsg("Αποθηκεύτηκε.");
    });
  const setFocal = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canWrite || a.kind !== "image") return;
    const b = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - b.left) / b.width) * 100) / 100, y = Math.round(((e.clientY - b.top) / b.height) * 100) / 100;
    start(async () => onChange(await updateAsset(a.id, { focalX: x, focalY: y })));
  };
  const copy = () => navigator.clipboard.writeText(a.url.startsWith("/") ? location.origin + a.url : a.url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  const removeBg = () =>
    start(async () => {
      setMsg("Αφαίρεση φόντου… (μπορεί να πάρει λίγα δευτερόλεπτα)");
      const r = await removeBackgroundAction(a.id);
      if (r.ok) { onCreated(r.asset); setMsg("Δημιουργήθηκε νέα εικόνα χωρίς φόντο."); } else setMsg(r.error);
    });
  const aiDescribe = () =>
    start(async () => {
      setMsg("Ο Ερμής περιγράφει την εικόνα…");
      const r = await aiDescribeAsset(a.id, true);
      if (r.ok) { onChange(r.asset); setForm((f) => ({ ...f, alt: r.asset.alt ?? "", title: r.asset.title ?? "", tags: r.asset.tags.join(", ") })); setMsg("Alt, τίτλος και tags συμπληρώθηκαν με AI — έλεγξε και αποθήκευσε."); } else setMsg(r.error);
    });
  const poster = () => start(async () => { const r = await setVideoPoster(a.id, posterAt); if (r.ok) { onChange(r.asset); setMsg("Το poster ενημερώθηκε."); } else setMsg(r.error); });

  const field = "rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] font-normal outline-none focus:border-eu-blue bg-white w-full";
  const action = "inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-3 min-h-10 font-bold text-eu-ink text-[length:var(--fs-14)] hover:border-eu-navy disabled:opacity-50";
  return (
    <aside className="grid content-start gap-4 bg-white border-l border-eu-line p-4 @lg:p-5 overflow-y-auto" aria-label="Λεπτομέρειες αρχείου">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] uppercase tracking-wide">{a.kind === "image" ? "Εικόνα" : a.kind === "video" ? "Video" : fileExt(a.filename)}</div>
          <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)] leading-tight break-words">{a.title ?? a.filename}</h3>
        </div>
        <button type="button" onClick={onClose} aria-label="Κλείσιμο" className="size-11 rounded-full bg-eu-surface inline-flex items-center justify-center hover:bg-eu-surface-3 shrink-0"><X className="size-5" aria-hidden /></button>
      </div>

      <div className="relative rounded-xl overflow-hidden bg-[repeating-conic-gradient(#eef0f4_0_25%,#fff_0_50%)] bg-[length:16px_16px] border border-eu-line">
        {a.kind === "image" && (
          <div onClick={setFocal} className={`relative ${canWrite ? "cursor-crosshair" : ""}`} title={canWrite ? "Κλικ για focal point" : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.url} alt={a.alt ?? ""} className="block w-full max-h-[320px] object-contain" />
            <span className="absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-eu-yellow bg-eu-navy/60 grid place-items-center pointer-events-none" style={{ left: `${a.focalX * 100}%`, top: `${a.focalY * 100}%` }}><Crosshair className="size-3.5 text-eu-yellow" aria-hidden /></span>
          </div>
        )}
        {a.kind === "video" && <video src={a.url} poster={a.thumbUrl ?? undefined} controls preload="metadata" className="block w-full max-h-[320px] bg-black" />}
        {a.kind === "file" && (
          <a href={a.url} target="_blank" rel="noreferrer" className="grid place-items-center gap-2 p-8 text-eu-ink hover:text-eu-blue">
            <FileText className="size-12" aria-hidden /><span className="font-bold text-[length:var(--fs-14)]">{a.filename}</span>
          </a>
        )}
      </div>
      {a.kind === "image" && <p className="m-0 -mt-2 text-eu-muted text-[length:var(--fs-13)]">Focal point {Math.round(a.focalX * 100)}% / {Math.round(a.focalY * 100)}% — κλικ στην εικόνα για αλλαγή. Κρατά το σημαντικό μέρος ορατό σε κάθε crop.</p>}

      <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-1 text-[length:var(--fs-14)]">
        <dt className="text-eu-muted">Αρχείο</dt><dd className="m-0 truncate font-bold" title={a.filename}>{a.filename}</dd>
        <dt className="text-eu-muted">Τύπος</dt><dd className="m-0">{a.mime}</dd>
        <dt className="text-eu-muted">Μέγεθος</dt><dd className="m-0 tabular-nums">{fmtBytes(a.size)}</dd>
        {a.width && <><dt className="text-eu-muted">Διαστάσεις</dt><dd className="m-0 tabular-nums">{a.width}×{a.height}px</dd></>}
        {a.duration != null && <><dt className="text-eu-muted">Διάρκεια</dt><dd className="m-0 tabular-nums">{fmtDuration(a.duration)}</dd></>}
        <dt className="text-eu-muted">Αποθήκευση</dt><dd className="m-0">{a.storage === "bunny" ? "Bunny CDN" : "τοπικά"}</dd>
        <dt className="text-eu-muted">Ανέβηκε</dt><dd className="m-0 tabular-nums">{new Date(a.createdAt).toLocaleString("el-GR")}</dd>
      </dl>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className={action}>{copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Αντιγράφηκε" : "URL"}</button>
        <a href={a.url} target="_blank" rel="noreferrer" className={action}><ExternalLink className="size-4" aria-hidden /> Άνοιγμα</a>
        <a href={a.url} download={a.filename} className={action}><Download className="size-4" aria-hidden /> Λήψη</a>
        {canWrite && a.kind === "image" && <button type="button" onClick={() => onEdit(a)} className={`${action} border-eu-navy bg-eu-navy text-white hover:bg-eu-blue`}><Crop className="size-4" aria-hidden /> Επεξεργασία</button>}
        {canWrite && a.kind === "image" && !a.tags.includes("cutout") && <button type="button" disabled={pending} onClick={removeBg} className={action}><Scissors className="size-4" aria-hidden /> Αφαίρεση φόντου</button>}
        {canWrite && a.kind === "image" && <button type="button" disabled={pending} onClick={aiDescribe} className={action}><Sparkles className="size-4" aria-hidden /> Alt με AI</button>}
        {canWrite && (
          <label className={`${action} cursor-pointer`}>
            <Replace className="size-4" aria-hidden /> Αντικατάσταση
            <input type="file" className="sr-only" accept={a.kind === "image" ? "image/*" : a.kind === "video" ? "video/*" : undefined} onChange={(e) => e.target.files?.[0] && onReplace(a, e.target.files[0])} />
          </label>
        )}
      </div>

      {canWrite && a.kind === "video" && (
        <div className="rounded-xl border border-eu-line p-3 grid gap-2">
          <div className="font-bold text-eu-ink text-[length:var(--fs-14)] inline-flex items-center gap-1.5"><Clapperboard className="size-4 text-eu-blue" aria-hidden /> Poster frame</div>
          <div className="flex items-center gap-2">
            <input type="range" min={0} max={Math.max(1, Math.floor(a.duration ?? 10))} step={0.5} value={posterAt} onChange={(e) => setPosterAt(Number(e.target.value))} className="flex-1 accent-eu-navy min-h-11" aria-label="Δευτερόλεπτο poster" />
            <span className="tabular-nums text-[length:var(--fs-14)] w-12 text-right">{posterAt.toFixed(1)}s</span>
            <button type="button" disabled={pending} onClick={poster} className={action}>Ορισμός</button>
          </div>
        </div>
      )}

      {canWrite && (
        <form onSubmit={(e) => { e.preventDefault(); save(); }} className="grid gap-3">
          <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">Τίτλος<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={field} /></label>
          {a.kind === "image" && <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">Alt κείμενο <span className="font-normal text-eu-muted">(προσβασιμότητα & SEO)</span><input value={form.alt} onChange={(e) => setForm({ ...form, alt: e.target.value })} className={field} /></label>}
          <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">Λεζάντα<input value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} className={field} /></label>
          <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">Tags <span className="font-normal text-eu-muted">(με κόμμα)</span><input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="hero, samsung, tv" className={field} /></label>
          <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">Φάκελος
            <select value={form.folderId} onChange={(e) => setForm({ ...form, folderId: e.target.value })} className={field}>
              <option value="">— χωρίς φάκελο —</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pending} className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-blue disabled:opacity-50">Αποθήκευση</button>
            {msg && <span role="status" className="text-eu-ink-3 text-[length:var(--fs-14)]">{msg}</span>}
          </div>
        </form>
      )}
      {canWrite && (
        <button type="button" onClick={() => confirm(`Διαγραφή «${a.filename}»; Δεν αναιρείται.`) && onDelete(a.id)} className="justify-self-start inline-flex items-center gap-1.5 rounded-full px-3 min-h-10 font-bold text-eu-red text-[length:var(--fs-14)] hover:bg-eu-red/10"><Trash2 className="size-4" aria-hidden /> Διαγραφή αρχείου</button>
      )}
    </aside>
  );
}
