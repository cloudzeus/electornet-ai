"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { createStickerFromSvg } from "@/app/admin/(shell)/stickers/actions";

/** Ανέβασμα δικού σου sticker — μόνο SVG. Καθαρίζεται (χωρίς scripts / εξωτερικούς συνδέσμους) και ανοίγει στον σχεδιαστή. */
export function StickerSvgUpload() {
  const ref = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const pick = (file: File) => {
    setErr(null);
    if (!/\.svg$/i.test(file.name) || (file.type && file.type !== "image/svg+xml")) return setErr("Δεκτά μόνο αρχεία SVG.");
    if (file.size > 300 * 1024) return setErr("Το SVG είναι μεγαλύτερο από 300 KB.");
    start(async () => { const r = await createStickerFromSvg(file.name, await file.text()); if (r.ok) router.push(`/admin/stickers/${r.id}`); else setErr(r.error); });
  };
  return (
    <div className="grid gap-1">
      <button type="button" disabled={pending} onClick={() => ref.current?.click()} className="inline-flex items-center gap-2 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-chip disabled:opacity-50">
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />} Ανέβασμα SVG
      </button>
      <input ref={ref} type="file" accept=".svg,image/svg+xml" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ""; }} />
      {err && <p role="alert" className="m-0 text-eu-red text-[length:var(--fs-13)]">{err}</p>}
    </div>
  );
}
