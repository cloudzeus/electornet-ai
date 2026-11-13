"use client";

import { useState } from "react";
import { Images, Trash2 } from "lucide-react";
import { MediaPickerDialog } from "@/components/admin/media/MediaPicker";
import { sx } from "@/components/ui/sx";

/** URL εικόνας με επιλογή από τη βιβλιοθήκη media και μικρή προεπισκόπηση. */
export function ImageUrlField({ label, value, onChange, help }: { label: string; value: string; onChange: (v: string) => void; help?: string }) {
  const [open, setOpen] = useState(false);
  const sThumb = sx({ backgroundImage: `url("${value}")` });
  return (
    <div className="grid gap-1 text-[length:var(--fs-14)] font-bold text-eu-ink-2">
      <span>{label}</span>
      <div className="flex flex-wrap gap-2 items-center">
        {value && /^(https?:)?\//.test(value) && <>{sThumb.node}<span className={`size-11 shrink-0 rounded-lg border border-eu-line bg-center bg-cover ${sThumb.className}`} aria-hidden /></>}
        <input aria-label={label} className="min-w-0 flex-1 basis-32 rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] bg-white font-normal" value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://euronics.b-cdn.net/…" />
        <button type="button" onClick={() => setOpen(true)} className="shrink-0 inline-flex items-center gap-1 rounded-full border-2 border-eu-line px-3 min-h-11 font-bold hover:border-eu-navy"><Images className="size-4" aria-hidden /> Βιβλιοθήκη</button>
        {value && <button type="button" onClick={() => onChange("")} aria-label={`Αφαίρεση εικόνας: ${label}`} title="Αφαίρεση εικόνας" className="shrink-0 inline-flex items-center justify-center rounded-full border-2 border-eu-line size-11 text-eu-red hover:border-eu-red"><Trash2 className="size-4" aria-hidden /></button>}
      </div>
      {help && <span className="font-normal text-eu-muted text-[length:var(--fs-13)]">{help}</span>}
      {open && <MediaPickerDialog accept={["image"]} canWrite={false} onClose={() => setOpen(false)} onSelect={(a) => { if (a[0]) onChange(a[0].url); setOpen(false); }} />}
    </div>
  );
}
