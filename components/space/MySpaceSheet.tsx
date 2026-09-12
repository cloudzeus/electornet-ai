"use client";

import { useEffect, useState } from "react";
import { Ruler, X, DoorOpen, ArrowUpDown } from "lucide-react";
import { useMySpace } from "./MySpaceProvider";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("mySpace");

/**
 * «Ο χώρος μου»: door width, lift, optional niche. Three fields, saved
 * once; every card then answers «χωράει;». Sheet from the right on
 * desktop, bottom sheet on phones. Inputs ≥ 44px, labels visible.
 */
export function MySpaceSheet() {
  const { open } = useMySpace();
  // Remount the form on every open so its state starts from the saved space.
  return open ? <SheetForm /> : null;
}

function SheetForm() {
  const { space, setSpace, setOpen } = useMySpace();
  const [door, setDoor] = useState(space?.door ?? 75);
  const [lift, setLift] = useState(space?.lift ?? true);
  const [withNiche, setWithNiche] = useState(!!space?.niche);
  const [niche, setNiche] = useState(space?.niche ?? { w: 60, h: 85, d: 60 });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);
  const field = "w-full rounded-xl border-2 border-eu-line bg-white px-3 min-h-12 text-[length:var(--fs-16)] font-bold text-eu-ink focus:border-eu-blue outline-none";
  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="myspace-title">
      <button type="button" className="absolute inset-0 bg-eu-navy/50" aria-label={c.kleisimo} onClick={() => setOpen(false)} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSpace({ door, lift, niche: withNiche ? niche : undefined });
          setOpen(false);
        }}
        className="absolute bottom-0 inset-x-0 @md:inset-y-0 @md:left-auto @md:right-0 @md:w-[420px] bg-white rounded-t-3xl @md:rounded-none @md:rounded-l-3xl p-6 @md:p-8 grid gap-5 content-start shadow-[var(--shadow-overlay)] max-h-[92dvh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Fit-My-Space</div>
            <h2 id="myspace-title" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)] leading-tight">
              {c.o_choros_moy}
            </h2>
            <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)]">{c.dose_ta_mia_fora}</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label={c.kleisimo} className="size-11 rounded-full bg-eu-surface inline-flex items-center justify-center hover:bg-eu-surface-3">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <label className="grid gap-1.5">
          <span className="font-bold text-eu-ink text-[length:var(--fs-15)] inline-flex items-center gap-2">
            <DoorOpen className="size-4 text-eu-blue" aria-hidden /> Στενότερη πόρτα στη διαδρομή (εκ.)
          </span>
          <input type="number" inputMode="numeric" min={40} max={200} value={door} onChange={(e) => setDoor(Number(e.target.value))} className={field} />
          <span className="text-eu-muted text-[length:var(--fs-14)]">{c.metra_to_katharo_anoigma}</span>
        </label>
        <label className="flex items-center justify-between gap-3 rounded-xl border-2 border-eu-line px-3 min-h-12 cursor-pointer">
          <span className="font-bold text-eu-ink text-[length:var(--fs-15)] inline-flex items-center gap-2">
            <ArrowUpDown className="size-4 text-eu-blue" aria-hidden /> {c.yparchei_asanser}
          </span>
          <input type="checkbox" checked={lift} onChange={(e) => setLift(e.target.checked)} className="size-5 accent-eu-blue" />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-xl border-2 border-eu-line px-3 min-h-12 cursor-pointer">
          <span className="font-bold text-eu-ink text-[length:var(--fs-15)] inline-flex items-center gap-2">
            <Ruler className="size-4 text-eu-blue" aria-hidden /> {c.echo_sygkekrimeni_esochi}
          </span>
          <input type="checkbox" checked={withNiche} onChange={(e) => setWithNiche(e.target.checked)} className="size-5 accent-eu-blue" />
        </label>
        {withNiche && (
          <fieldset className="m-0 p-0 border-0 min-w-0 grid grid-cols-3 gap-2">
            <legend className="font-bold text-eu-ink text-[length:var(--fs-15)] mb-1.5">Εσοχή Π × Υ × Β (εκ.)</legend>
            {(["w", "h", "d"] as const).map((k) => (
              <label key={k} className="grid gap-1">
                <span className="text-eu-muted text-[length:var(--fs-14)]">{k === "w" ? "Πλάτος" : k === "h" ? "Ύψος" : "Βάθος"}</span>
                <input type="number" inputMode="numeric" min={10} max={300} value={niche[k]} onChange={(e) => setNiche({ ...niche, [k]: Number(e.target.value) })} className={field} />
              </label>
            ))}
          </fieldset>
        )}
        <div className="flex gap-2 pt-2">
          <button type="submit" className="flex-1 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-16)] min-h-12 hover:bg-eu-blue">
            {c.apothikeysi}
          </button>
          {space && (
            <button type="button" onClick={() => { setSpace(null); setOpen(false); }} className="rounded-full border-2 border-eu-line text-eu-ink-3 font-bold text-[length:var(--fs-15)] px-4 min-h-12 hover:border-eu-ink">
              {c.katharisma}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/** Header entry point: shows the saved door width once set. */
export function MySpaceButton({ className = "" }: { className?: string }) {
  const { space, setOpen } = useMySpace();
  return (
    <button type="button" onClick={() => setOpen(true)} className={`flex flex-col items-center gap-0.5 font-semibold text-[length:var(--fs-13-5)] min-h-11 justify-center hover:text-white ${space ? "text-eu-yellow" : "text-eu-on-dark-2"} ${className}`} aria-label={space ? `Ο χώρος μου: πόρτα ${space.door} εκ.` : "Ο χώρος μου: δες αν χωράει"}>
      <Ruler className="size-4" aria-hidden />
      {space ? `Πόρτα ${space.door} εκ.` : "Ο χώρος μου"}
    </button>
  );
}
