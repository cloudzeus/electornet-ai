"use client";

import { useState } from "react";
import { Images } from "lucide-react";
import { MediaPickerDialog } from "@/components/admin/media/MediaPicker";

/** URL εικόνας με επιλογή από τη βιβλιοθήκη media και μικρή προεπισκόπηση. */
export function ImageUrlField({ label, value, onChange, help }: { label: string; value: string; onChange: (v: string) => void; help?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="grid gap-1 text-[length:var(--fs-14)] font-bold text-eu-ink-2">
      <span>{label}</span>
      <div className="flex gap-2 items-center">
        {value && /^(https?:)?\//.test(value) && <span className="size-11 shrink-0 rounded-lg border border-eu-line bg-center bg-cover" style={{ backgroundImage: `url("${value}")` }} aria-hidden />}
        <input aria-label={label} className="w-full rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] bg-white font-normal" value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://euronics.b-cdn.net/…" />
        <button type="button" onClick={() => setOpen(true)} className="shrink-0 inline-flex items-center gap-1 rounded-full border-2 border-eu-line px-3 min-h-11 font-bold hover:border-eu-navy"><Images className="size-4" aria-hidden /> Βιβλιοθήκη</button>
      </div>
      {help && <span className="font-normal text-eu-muted text-[length:var(--fs-13)]">{help}</span>}
      {open && <MediaPickerDialog accept={["image"]} canWrite={false} onClose={() => setOpen(false)} onSelect={(a) => { if (a[0]) onChange(a[0].url); setOpen(false); }} />}
    </div>
  );
}
