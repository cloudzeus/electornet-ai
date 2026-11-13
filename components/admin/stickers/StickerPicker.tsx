"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { StickerSvg } from "@/components/stickers/StickerSvg";
import { ART_PRESETS, fitWidth } from "@/lib/stickers/art";
import { STICKER_PRESETS, paramsFromArt, type StickerParams } from "@/lib/stickers/model";
import { saveSticker, stickerOptions } from "@/app/admin/(shell)/stickers/actions";

type Opt = { id: string; key: string; name: string; params: StickerParams };
let cached: Promise<Opt[]> | null = null;
const load = () => (cached ??= stickerOptions().catch(() => { cached = null; return []; }));

/** Η έτοιμη συλλογή (πρότυπα + βιβλιοθήκη σχημάτων του /admin/stickers) με σταθερά κλειδιά, ώστε κάθε ένα να αποθηκεύεται μία φορά. */
const COLLECTION: { key: string; name: string; params: StickerParams }[] = [
  ...STICKER_PRESETS,
  ...ART_PRESETS.map((a, i) => ({ key: `col-${a.art.id}-${i}`, name: a.lines.filter(Boolean).join(" "), params: paramsFromArt(a) })),
];

/** Επιλογή sticker από τα αποθηκευμένα ή από την έτοιμη συλλογή (με το πρώτο πάτημα αποθηκεύεται στα stickers) (μικρές προεπισκοπήσεις). `by` = ταυτοποίηση με κλειδί ή id. */
export function StickerPicker({ value, onChange, by = "key", allowNone = true }: { value: string | null; onChange: (v: string | null, o?: Opt) => void; by?: "key" | "id"; allowNone?: boolean }) {
  const [opts, setOpts] = useState<Opt[] | null>(null);
  useEffect(() => { let on = true; void load().then((o) => { if (on) setOpts(o); }); return () => { on = false; }; }, []);
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  if (!opts) return <span className="inline-flex items-center gap-2 text-eu-muted text-[length:var(--fs-13)] min-h-11"><Loader2 className="size-4 animate-spin" aria-hidden /> Φόρτωση stickers…</span>;
  const rest = COLLECTION.filter((c) => !opts.some((o) => o.key === c.key || o.name === c.name));
  /** Από τη συλλογή: αποθηκεύεται όπως είναι (το SVG από την προεπισκόπηση του κουμπιού) και επιλέγεται. */
  const adopt = (c: (typeof COLLECTION)[number], svg: string) => start(async () => {
    setErr(null);
    const r = await saveSticker({ key: c.key, name: c.name, params: c.params, svg });
    if (!r.ok) { setErr(r.error); return; }
    const o = { id: r.id, key: c.key, name: c.name, params: c.params };
    cached = null; setOpts((x) => [...(x ?? []), o]); onChange(by === "key" ? o.key : o.id, o);
  });
  const cell = (on: boolean) => `grid gap-1 place-items-center rounded-xl border-2 p-1.5 min-h-11 bg-white text-center ${on ? "border-eu-navy ring-2 ring-eu-yellow" : "border-eu-line hover:border-eu-blue"}`;
  const preview = (params: StickerParams, id: string) => <span className="grid place-items-center h-14"><StickerSvg p={{ ...params, size: params.art ? fitWidth(params.art, 52) : 52, rotate: 0, animation: "none" }} id={id} /></span>;
  const name = (t: string) => <span className="text-eu-ink text-[length:var(--fs-12)] font-bold leading-tight line-clamp-2">{t}</span>;
  const grid = "m-0 p-0 list-none grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(6rem,1fr))]";
  return (
    <div className="grid gap-2">
      <ul className={grid} role="radiogroup" aria-label="Sticker">
        {allowNone && <li><button type="button" role="radio" aria-checked={!value} onClick={() => onChange(null)} className={`${cell(!value)} w-full h-full text-eu-muted font-bold text-[length:var(--fs-13)]`}>Χωρίς</button></li>}
        {opts.map((o) => { const v = by === "key" ? o.key : o.id; const on = value === v; return (
          <li key={o.id}><button type="button" role="radio" aria-checked={on} onClick={() => onChange(v, o)} className={`${cell(on)} w-full`} title={o.name}>{preview(o.params, `pk-${o.id}`)}{name(o.name)}</button></li>
        ); })}
      </ul>
      {rest.length > 0 && (
        <details className="rounded-xl border border-eu-line bg-eu-surface/50" open={!opts.length}>
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center gap-2 px-3 min-h-11 font-bold text-eu-ink-2 text-[length:var(--fs-13)]">Από τη συλλογή ({rest.length}){busy && <Loader2 className="size-4 animate-spin" aria-hidden />}<span className="ml-auto font-normal text-eu-muted">πάτα ένα για να το διαλέξεις</span></summary>
          <div className="grid gap-2 p-2 pt-0">
            <ul className={grid} aria-label="Συλλογή stickers">
              {rest.map((c) => (
                <li key={c.key}><button type="button" disabled={busy} onClick={(e) => adopt(c, e.currentTarget.querySelector("svg")?.outerHTML ?? "")} className={`${cell(false)} w-full disabled:opacity-50`} title={`${c.name} — προστίθεται στα stickers σου και επιλέγεται`}>{preview(c.params, `col-${c.key}`)}{name(c.name)}</button></li>
              ))}
            </ul>
            <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">Για άλλο κείμενο ή χρώμα, άνοιξέ το μετά στα <Link href="/admin/stickers" className="text-eu-blue underline">Stickers</Link>.</p>
          </div>
        </details>
      )}
      {err && <p role="alert" className="m-0 text-eu-red font-bold text-[length:var(--fs-13)]">{err}</p>}
    </div>
  );
}
