"use client";

import { useState } from "react";
import { ImagePlus, X, Film, FileText } from "lucide-react";
import type { MediaAssetDTO, MediaKind } from "@/lib/media/types";
import { MediaLibrary } from "./MediaLibrary";

/** Modal wrapper of the library in picker mode. */
export function MediaPickerDialog({ accept, multiple, canWrite, onSelect, onClose }: { accept?: MediaKind[]; multiple?: boolean; canWrite: boolean; onSelect: (a: MediaAssetDTO[]) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[75]" role="dialog" aria-modal="true" aria-label="Επιλογή από τη βιβλιοθήκη">
      <button type="button" className="absolute inset-0 bg-eu-navy/60 backdrop-blur-sm" aria-label="Κλείσιμο" onClick={onClose} />
      <div className="absolute inset-3 @md:inset-8 bg-white rounded-3xl shadow-[var(--shadow-overlay)] overflow-hidden grid">
        <MediaLibrary mode="picker" accept={accept} multiple={multiple} canWrite={canWrite} onSelect={onSelect} onClose={onClose} />
      </div>
    </div>
  );
}

/**
 * Form field for CMS editors: shows the chosen asset (thumb, name), opens the
 * picker, clears. Value is the asset id + url so the document stays
 * renderable without a join. Use inside any client form.
 */
export function MediaField({ label, value, accept = ["image"], canWrite, onChange, help }: { label: string; value: MediaAssetDTO | null; accept?: MediaKind[]; canWrite: boolean; onChange: (a: MediaAssetDTO | null) => void; help?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="grid gap-1">
      <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{label}</span>
      <div className="flex items-center gap-3 rounded-xl border-2 border-eu-line p-2 min-h-14 bg-white">
        {value ? (
          <>
            {value.thumbUrl ? <FieldThumb a={value} /> : <span className="size-12 rounded-lg bg-eu-surface grid place-items-center text-eu-muted">{value.kind === "video" ? <Film className="size-5" aria-hidden /> : <FileText className="size-5" aria-hidden />}</span>}
            <span className="min-w-0 flex-1"><span className="block truncate font-bold text-[length:var(--fs-14)]">{value.title ?? value.filename}</span><span className="block truncate text-eu-muted text-[length:var(--fs-13)]">{value.width ? `${value.width}×${value.height} · ` : ""}{value.storage === "bunny" ? "CDN" : "local"}</span></span>
            <button type="button" onClick={() => setOpen(true)} className="rounded-full border-2 border-eu-line px-3 min-h-10 font-bold text-[length:var(--fs-13)] hover:border-eu-navy">Αλλαγή</button>
            <button type="button" onClick={() => onChange(null)} aria-label="Αφαίρεση" className="size-10 rounded-full inline-flex items-center justify-center text-eu-muted hover:bg-eu-red/10 hover:text-eu-red"><X className="size-4" aria-hidden /></button>
          </>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-full bg-eu-surface px-4 min-h-10 font-bold text-eu-navy text-[length:var(--fs-14)] hover:bg-eu-surface-3"><ImagePlus className="size-4" aria-hidden /> Επιλογή από βιβλιοθήκη</button>
        )}
      </div>
      {help && <span className="text-eu-muted text-[length:var(--fs-13)]">{help}</span>}
      {open && <MediaPickerDialog accept={accept} multiple={false} canWrite={canWrite} onSelect={(a) => { onChange(a[0] ?? null); setOpen(false); }} onClose={() => setOpen(false)} />}
    </div>
  );
}

function FieldThumb({ a }: { a: MediaAssetDTO }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={a.thumbUrl ?? ""} alt="" className="size-12 rounded-lg object-cover" style={{ objectPosition: `${a.focalX * 100}% ${a.focalY * 100}%` }} />;
}
