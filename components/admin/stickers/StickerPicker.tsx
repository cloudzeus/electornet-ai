"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { StickerSvg } from "@/components/stickers/StickerSvg";
import { fitWidth } from "@/lib/stickers/art";
import type { StickerParams } from "@/lib/stickers/model";
import { stickerOptions } from "@/app/admin/(shell)/stickers/actions";

type Opt = { id: string; key: string; name: string; params: StickerParams };
let cached: Promise<Opt[]> | null = null;
const load = () => (cached ??= stickerOptions().catch(() => { cached = null; return []; }));

/** Επιλογή sticker από τα αποθηκευμένα (μικρές προεπισκοπήσεις). `by` = ταυτοποίηση με κλειδί ή id. */
export function StickerPicker({ value, onChange, by = "key", allowNone = true }: { value: string | null; onChange: (v: string | null, o?: Opt) => void; by?: "key" | "id"; allowNone?: boolean }) {
  const [opts, setOpts] = useState<Opt[] | null>(null);
  useEffect(() => { let on = true; void load().then((o) => { if (on) setOpts(o); }); return () => { on = false; }; }, []);
  if (!opts) return <span className="inline-flex items-center gap-2 text-eu-muted text-[length:var(--fs-13)] min-h-11"><Loader2 className="size-4 animate-spin" aria-hidden /> Φόρτωση stickers…</span>;
  if (!opts.length) return <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Δεν υπάρχουν αποθηκευμένα stickers — φτιάξε ένα στο <Link href="/admin/stickers" className="text-eu-blue underline">Stickers</Link>.</p>;
  const cell = (on: boolean) => `grid gap-1 place-items-center rounded-xl border-2 p-1.5 min-h-11 bg-white text-center ${on ? "border-eu-navy ring-2 ring-eu-yellow" : "border-eu-line hover:border-eu-blue"}`;
  return (
    <ul className="m-0 p-0 list-none grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(6rem,1fr))]" role="radiogroup" aria-label="Sticker">
      {allowNone && <li><button type="button" role="radio" aria-checked={!value} onClick={() => onChange(null)} className={`${cell(!value)} w-full h-full text-eu-muted font-bold text-[length:var(--fs-13)]`}>Χωρίς</button></li>}
      {opts.map((o) => { const v = by === "key" ? o.key : o.id; const on = value === v; const art = o.params.art; return (
        <li key={o.id}><button type="button" role="radio" aria-checked={on} onClick={() => onChange(v, o)} className={`${cell(on)} w-full`} title={o.name}>
          <span className="grid place-items-center h-14"><StickerSvg p={{ ...o.params, size: art ? fitWidth(art, 52) : 52, rotate: 0, animation: "none" }} id={`pk-${o.id}`} /></span>
          <span className="text-eu-ink text-[length:var(--fs-12)] font-bold leading-tight line-clamp-2">{o.name}</span>
        </button></li>
      ); })}
    </ul>
  );
}
