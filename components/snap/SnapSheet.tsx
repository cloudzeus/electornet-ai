"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Camera, X, Loader2, ScanLine, ArrowRight } from "lucide-react";
import { ProductImage } from "@/components/commerce/ProductImage";
import type { AdvisorAnswer } from "@/lib/advisor/answer";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("snap");

type Stage = "idle" | "reading" | "found" | "none";

/**
 * @dynamic Snap & Find: photograph the rating plate of the old appliance
 * (or any model label), the model code is read on the device (tesseract.js,
 * Greek + Latin), matched against the catalogue, and replacements of the
 * same category are proposed with the fit check. Nothing is uploaded in the
 * demo. Production: the image goes to the vision model of the AI Sales
 * Engine, which also recognises the appliance itself (not just the plate)
 * and the niche photo. Opened from the camera icon in the search box or
 * the `eu:snap` event.
 */
export function SnapSheet() {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [ans, setAns] = useState<AdvisorAnswer | null>(null);
  const [manual, setManual] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener("eu:snap", on);
    return () => window.removeEventListener("eu:snap", on);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const lookup = async (q: string) => {
    const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    if (!r.ok) return null;
    const data = (await r.json()) as { products: { id: string; slug: string; brand: string; title: string; price: number; wasPrice?: number; image: string | null; path: string }[] };
    return data.products[0] ?? null;
  };

  const analyse = async (file: File) => {
    setStage("reading");
    setCodes([]);
    setAns(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker(["eng", "ell"]);
      const { data } = await worker.recognize(url);
      await worker.terminate();
      const text = data.text.replace(/[|]/g, "I");
      // Model codes: 5–16 chars with letters AND digits, e.g. WW11DG5B25AELE, QE55QN70FAUXXH, ECAM22.110.SB
      const found = Array.from(new Set((text.match(/\b(?=[A-Z0-9./-]*\d)(?=[A-Z0-9./-]*[A-Z])[A-Z0-9][A-Z0-9./-]{4,15}\b/g) ?? []).map((c) => c.replace(/[.\-/]+$/, ""))));
      setCodes(found.slice(0, 6));
      await match(found.slice(0, 6), text);
    } catch {
      setStage("none");
    }
  };

  const match = async (cands: string[], raw = "") => {
    let hit: Awaited<ReturnType<typeof lookup>> = null;
    for (const c of cands) {
      hit = await lookup(c);
      if (hit) break;
    }
    if (!hit) {
      // brand + category guess from the text (e.g. «Samsung … washing machine»)
      const brand = raw.match(/samsung|lg|bosch|siemens|miele|aeg|beko|candy|whirlpool|pitsos|philips|delonghi|sony|hisense|inventor|toyotomi/i)?.[0];
      if (brand) hit = await lookup(brand);
    }
    if (!hit) {
      setStage("none");
      return;
    }
    const r = await fetch(`/api/advisor?q=${encodeURIComponent(`${hit.path} ${hit.brand}`)}`);
    if (r.ok) setAns((await r.json()) as AdvisorAnswer);
    setStage("found");
    setCodes((c) => (c.length ? c : [hit!.title]));
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="snap-title">
      <button type="button" className="absolute inset-0 bg-eu-navy/60 backdrop-blur-sm" aria-label={c.kleisimo} onClick={() => setOpen(false)} />
      <div className="absolute inset-x-0 bottom-0 @md:inset-auto @md:left-1/2 @md:top-1/2 @md:-translate-x-1/2 @md:-translate-y-1/2 @md:w-[min(760px,92vw)] bg-white rounded-t-3xl @md:rounded-3xl shadow-[var(--shadow-overlay)] max-h-[92dvh] overflow-y-auto grid gap-5 p-5 @md:p-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="relative size-9 shrink-0 rounded-full overflow-hidden bg-eu-yellow ring-2 ring-eu-yellow/50">
                <Image src="/img/advisor/mascot-head.webp" alt="" fill sizes="36px" className="object-cover scale-[1.15] translate-y-[6%]" />
              </span>
              <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5">
                <ScanLine className="size-3.5" aria-hidden /> {c.snap_find_me_ton}
              </div>
            </div>
            <h2 id="snap-title" className="m-0 mt-1 font-heading font-bold text-eu-ink text-[length:var(--fs-24)] leading-tight">
              {c.fotografise_tin_palia_soy}
            </h2>
            <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)]">{c.tin_pinakida_me_to}</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label={c.kleisimo} className="size-11 rounded-full bg-eu-surface inline-flex items-center justify-center hover:bg-eu-surface-3 shrink-0">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="grid grid-cols-1 @md:grid-cols-[240px_minmax(0,1fr)] gap-5 items-start">
          <div className="grid gap-2">
            <label className="relative block aspect-[4/3] rounded-2xl border-2 border-dashed border-eu-line bg-eu-surface overflow-hidden cursor-pointer hover:border-eu-blue">
              <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => e.target.files?.[0] && analyse(e.target.files[0])} />
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt={c.i_fotografia_soy} className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <span className="absolute inset-0 grid place-items-center text-center p-4 text-eu-ink-3 text-[length:var(--fs-14)] font-semibold">
                  <span>
                    <Camera className="size-8 mx-auto mb-2 text-eu-blue" aria-hidden />
                    {c.anoixe_tin_kamera_i}
                  </span>
                </span>
              )}
              {stage === "reading" && (
                <span className="absolute inset-0 bg-eu-navy/70 text-white grid place-items-center text-[length:var(--fs-14)] font-bold">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" aria-hidden /> {c.diavazo_tin_pinakida}
                  </span>
                  <span className="absolute inset-x-6 h-0.5 bg-eu-yellow animate-[eu-scan_1.6s_ease-in-out_infinite]" />
                </span>
              )}
            </label>
            <button type="button" onClick={() => input.current?.click()} className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] min-h-12 hover:bg-eu-blue">
              {preview ? "Άλλη φωτογραφία" : "Φωτογράφισε"}
            </button>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!manual.trim()) return;
                setStage("reading");
                match([manual.trim()]);
              }}
              className="flex gap-1.5"
            >
              <label className="sr-only" htmlFor="snap-manual">
                {c.i_grapse_ton_kodiko}
              </label>
              <input id="snap-manual" value={manual} onChange={(e) => setManual(e.target.value)} placeholder={c.i_grapse_to_montelo} className="flex-1 min-w-0 rounded-full border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] outline-none focus:border-eu-blue" />
              <button type="submit" className="rounded-full border-2 border-eu-navy text-eu-navy font-extrabold px-3 min-h-11 text-[length:var(--fs-14)]">
                OK
              </button>
            </form>
          </div>

          <div className="grid gap-3 content-start min-w-0">
            {stage === "idle" && (
              <ul className="m-0 p-0 list-none grid gap-2 text-[length:var(--fs-15)] text-eu-ink-2">
                {["Αναγνωρίζουμε το μοντέλο από την πινακίδα.", "Σου δείχνουμε τον αντικαταστάτη με τις ίδιες διαστάσεις.", "Βλέπεις τι γλιτώνεις σε ρεύμα και αν χωράει στον χώρο σου."].map((t, i) => (
                  <li key={t} className="flex gap-3">
                    <span className="size-7 shrink-0 rounded-full bg-eu-yellow text-eu-navy font-extrabold inline-flex items-center justify-center text-[length:var(--fs-14)]">{i + 1}</span>
                    {t}
                  </li>
                ))}
              </ul>
            )}
            {codes.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-[length:var(--fs-14)] text-eu-muted">
                Διάβασα:
                {codes.map((c) => (
                  <code key={c} className="rounded-md bg-eu-surface px-2 py-0.5 font-bold text-eu-ink">
                    {c}
                  </code>
                ))}
              </div>
            )}
            {stage === "none" && <p className="m-0 rounded-xl bg-eu-surface p-4 text-eu-ink-2 text-[length:var(--fs-15)]">{c.den_katafera_na_diavaso}</p>}
            {stage === "found" && ans && (
              <>
                <div className="rounded-2xl bg-eu-navy text-white p-4">
                  <div className="font-extrabold text-eu-yellow text-[length:var(--fs-13)] tracking-wide uppercase">{c.vrika_tin_katigoria}</div>
                  <p className="m-0 mt-1 text-[length:var(--fs-15)] leading-snug text-eu-on-dark">{ans.text}</p>
                </div>
                <ul className="m-0 p-0 list-none grid gap-1.5">
                  {ans.products.map((p) => (
                    <li key={p.id}>
                      <Link href={`/proion/${p.slug}`} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl border border-eu-line p-2 hover:border-eu-blue">
                        <ProductImage src={p.image} sizes="64px" className="size-16" rounded="rounded-lg" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-eu-muted-2 font-bold text-[length:var(--fs-13)] uppercase">{p.brand}</span>
                          <span className="block font-bold text-eu-ink text-[length:var(--fs-15)] leading-tight line-clamp-1">{p.title}</span>
                          <span className="block text-eu-ink-3 text-[length:var(--fs-14)] line-clamp-1">{p.why}</span>
                        </span>
                        <span className="font-extrabold text-eu-ink text-[length:var(--fs-16)] shrink-0">{p.price.toLocaleString("el-GR")} €</span>
                        <ArrowRight className="size-4 text-eu-blue shrink-0" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
