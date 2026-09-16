"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Camera, X, Loader2, ScanLine, ArrowRight, Sparkles, Check, RefreshCw, Wrench, Recycle, Smartphone, Zap, Ruler } from "lucide-react";
import { ProductImage } from "@/components/commerce/ProductImage";
import type { AdvisorAnswer } from "@/lib/advisor/answer";
import type { SnapResult } from "@/lib/snap/identify";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("snap");

type Stage = "idle" | "reading" | "ai" | "found" | "none";
type Action = "replace" | "register" | "service" | "recycle";

/** Downscale on the device before upload: ≤1280px JPEG. The original never leaves the phone. */
async function shrink(file: File): Promise<string> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(file); });
  const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement("canvas");
  cv.width = Math.round(bmp.width * k);
  cv.height = Math.round(bmp.height * k);
  cv.getContext("2d")!.drawImage(bmp, 0, 0, cv.width, cv.height);
  return cv.toDataURL("image/jpeg", 0.85);
}

/**
 * @dynamic Snap & Find: photograph the old appliance or its rating plate.
 * Two recognisers run at once: the vision model of the AI engine (appliance
 * kind, brand, model, energy class, age, dims) and on-device OCR
 * (tesseract.js) as a fallback when AI is off or over budget. The result
 * proposes replacements of the same category with the yearly energy saving
 * and a fit check against the old dims, plus four next steps: replace,
 * register in «my devices», service request, recycling. The photo is kept
 * only when the customer chooses register or service.
 */
export function SnapSheet() {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [ans, setAns] = useState<AdvisorAnswer | null>(null);
  const [ai, setAi] = useState<SnapResult | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [me, setMe] = useState<{ authenticated: boolean; firstName?: string } | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [problem, setProblem] = useState("");
  const [mode, setMode] = useState("visit");
  const input = useRef<HTMLInputElement>(null);
  const run = useRef(0);

  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener("eu:snap", on);
    if (new URLSearchParams(window.location.search).get("snap") === "1") setTimeout(on, 0);
    return () => window.removeEventListener("eu:snap", on);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    fetch("/api/account/me").then((r) => r.json()).then(setMe).catch(() => setMe({ authenticated: false }));
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const lookup = async (q: string) => {
    const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    if (!r.ok) return null;
    const data = (await r.json()) as { products: { id: string; slug: string; brand: string; title: string; price: number; wasPrice?: number; image: string | null; path: string }[] };
    return data.products[0] ?? null;
  };

  const reset = () => { setCodes([]); setAns(null); setAi(null); setAiNote(null); setAction(null); setDone(null); };

  const analyse = async (file: File) => {
    const id = ++run.current;
    setStage("reading");
    reset();
    setPreview(URL.createObjectURL(file));
    const data = await shrink(file);
    setPhoto(data);
    // 1) vision model (server) and 2) on-device OCR, in parallel
    const aiP = fetch("/api/snap/identify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image: data }) })
      .then(async (r) => (await r.json()) as SnapResult | { error: string; aiAvailable: false })
      .catch(() => ({ error: "Σφάλμα δικτύου.", aiAvailable: false as const }));
    const ocrP = (async () => {
      try {
        const { createWorker } = await import("tesseract.js");
        const worker = await createWorker(["eng", "ell"]);
        const { data: d } = await worker.recognize(data);
        await worker.terminate();
        const text = d.text.replace(/[|]/g, "I");
        const found = Array.from(new Set((text.match(/\b(?=[A-Z0-9./-]*\d)(?=[A-Z0-9./-]*[A-Z])[A-Z0-9][A-Z0-9./-]{4,15}\b/g) ?? []).map((x) => x.replace(/[.\-/]+$/, ""))));
        return { found: found.slice(0, 6), text };
      } catch { return { found: [] as string[], text: "" }; }
    })();
    const r = await aiP;
    if (id !== run.current) return;
    if ("error" in r) {
      setAiNote(r.error);
      const o = await ocrP;
      if (id !== run.current) return;
      setCodes(o.found);
      await match(o.found, o.text);
      return;
    }
    if (!r.appliance.isAppliance || (!r.replacements.length && !r.matched)) {
      // AI saw no appliance / unknown category: let OCR try the plate before giving up
      const o = await ocrP;
      if (id !== run.current) return;
      setCodes(o.found);
      if (o.found.length) { setAi(r); await match(o.found, o.text); return; }
    }
    setAi(r);
    setStage("ai");
  };

  const match = async (cands: string[], raw = "") => {
    let hit: Awaited<ReturnType<typeof lookup>> = null;
    for (const x of cands) { hit = await lookup(x); if (hit) break; }
    if (!hit) {
      const brand = raw.match(/samsung|lg|bosch|siemens|miele|aeg|beko|candy|whirlpool|pitsos|philips|delonghi|sony|hisense|inventor|toyotomi/i)?.[0];
      if (brand) hit = await lookup(brand);
    }
    if (!hit) { setStage("none"); return; }
    const r = await fetch(`/api/advisor?q=${encodeURIComponent(`${hit.path} ${hit.brand}`)}`);
    if (r.ok) setAns((await r.json()) as AdvisorAnswer);
    setStage("found");
    setCodes((x) => (x.length ? x : [hit!.title]));
  };

  const a = ai?.appliance;
  const label = a ? [a.brand, a.model].filter(Boolean).join(" ") || a.kindLabel : "";
  const track = (act: Action) => ai && fetch("/api/snap/identify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scanId: ai.scanId, action: act }) }).catch(() => null);

  const register = async () => {
    if (!ai || !a) return;
    setBusy(true);
    const r = await fetch("/api/account/devices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ brand: a.brand ?? "Άγνωστη μάρκα", title: a.kindLabel, model: a.model, serial: a.serial, energyClass: a.energyClass, photo, scanId: ai.scanId, notes: a.ageYears ? `Εκτιμώμενη ηλικία ${a.ageYears} έτη` : undefined }) }).then((x) => x.json()).catch(() => ({ ok: false, error: "Σφάλμα δικτύου." }));
    setBusy(false);
    setDone(r.ok ? "Η συσκευή καταχωρήθηκε στις «Συσκευές μου» μαζί με τη φωτογραφία." : r.error ?? "Δεν έγινε η καταχώρηση.");
  };
  const service = async () => {
    if (!ai || !problem.trim()) return;
    setBusy(true);
    const r = await fetch("/api/account/tickets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "repair", mode, description: problem.trim(), device: label, scanId: ai.scanId }) }).then((x) => x.json()).catch(() => ({ ok: false, error: "Σφάλμα δικτύου." }));
    setBusy(false);
    setDone(r.ok ? `Το αίτημα ${r.number} καταχωρήθηκε. Θα σε καλέσουμε για ραντεβού μέσα σε μία εργάσιμη.` : r.error ?? "Δεν έγινε η καταχώρηση.");
  };

  if (!open) return null;
  const loginHref = `/syndesi?next=${encodeURIComponent("/?snap=1")}`;
  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="snap-title">
      <button type="button" className="absolute inset-0 bg-eu-navy/60 backdrop-blur-sm" aria-label={c.kleisimo} onClick={() => setOpen(false)} />
      <div className="absolute inset-x-0 bottom-0 @md:inset-auto @md:left-1/2 @md:top-1/2 @md:-translate-x-1/2 @md:-translate-y-1/2 @md:w-[min(820px,92vw)] bg-white rounded-t-3xl @md:rounded-3xl shadow-[var(--shadow-overlay)] max-h-[92dvh] overflow-y-auto grid gap-5 p-5 @md:p-7">
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
            <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)]">Ολόκληρη τη συσκευή ή την πινακίδα με το μοντέλο. Η φωτογραφία αναλύεται στιγμιαία και δεν αποθηκεύεται, εκτός αν επιλέξεις «Συσκευές μου» ή «Service».</p>
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
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Αναγνωρίζω τη συσκευή…
                  </span>
                  <span className="absolute inset-x-6 h-0.5 bg-eu-yellow animate-[eu-scan_1.6s_ease-in-out_infinite]" />
                </span>
              )}
            </label>
            <button type="button" onClick={() => input.current?.click()} className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] min-h-12 hover:bg-eu-blue">
              {preview ? "Άλλη φωτογραφία" : "Φωτογράφισε"}
            </button>
            <form
              onSubmit={(e) => { e.preventDefault(); if (!manual.trim()) return; run.current++; reset(); setStage("reading"); match([manual.trim()]); }}
              className="flex gap-1.5"
            >
              <label className="sr-only" htmlFor="snap-manual">{c.i_grapse_ton_kodiko}</label>
              <input id="snap-manual" value={manual} onChange={(e) => setManual(e.target.value)} placeholder={c.i_grapse_to_montelo} className="flex-1 min-w-0 rounded-full border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] outline-none focus:border-eu-blue" />
              <button type="submit" className="rounded-full border-2 border-eu-navy text-eu-navy font-extrabold px-3 min-h-11 text-[length:var(--fs-14)]">OK</button>
            </form>
          </div>

          <div className="grid gap-3 content-start min-w-0">
            {stage === "idle" && (
              <ul className="m-0 p-0 list-none grid gap-2 text-[length:var(--fs-15)] text-eu-ink-2">
                {["Το AI αναγνωρίζει τη συσκευή, τη μάρκα, το μοντέλο και την ηλικία της.", "Σου δείχνουμε αντικαταστάτες που χωράνε στην ίδια θέση.", "Βλέπεις τι γλιτώνεις σε ρεύμα τον χρόνο και τι μπορείς να κάνεις με την παλιά."].map((t, i) => (
                  <li key={t} className="flex gap-3">
                    <span className="size-7 shrink-0 rounded-full bg-eu-yellow text-eu-navy font-extrabold inline-flex items-center justify-center text-[length:var(--fs-14)]">{i + 1}</span>
                    {t}
                  </li>
                ))}
              </ul>
            )}
            {stage === "reading" && (
              <div className="grid gap-2" aria-live="polite">
                {[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-xl bg-eu-surface animate-pulse" style={{ animationDelay: `${i * 120}ms` }} />)}
              </div>
            )}
            {aiNote && stage !== "reading" && <p className="m-0 rounded-xl bg-eu-surface p-3 text-eu-ink-3 text-[length:var(--fs-14)]">{aiNote}</p>}
            {codes.length > 0 && stage !== "ai" && (
              <div className="flex flex-wrap items-center gap-1.5 text-[length:var(--fs-14)] text-eu-muted">
                Διάβασα:
                {codes.map((x) => <code key={x} className="rounded-md bg-eu-surface px-2 py-0.5 font-bold text-eu-ink">{x}</code>)}
              </div>
            )}
            {stage === "none" && <p className="m-0 rounded-xl bg-eu-surface p-4 text-eu-ink-2 text-[length:var(--fs-15)]">{c.den_katafera_na_diavaso}</p>}

            {stage === "ai" && ai && a && (
              <>
                <div className="rounded-2xl bg-eu-navy text-white p-4 grid gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-extrabold text-eu-yellow text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><Sparkles className="size-3.5" aria-hidden /> Αναγνώριση με AI</div>
                    <span className="text-eu-on-dark-3 text-[length:var(--fs-13)] tabular-nums">Βεβαιότητα {Math.round(a.confidence * 100)}%</span>
                  </div>
                  <div className="font-heading font-bold text-[length:var(--fs-20)] leading-tight">{a.kindLabel}{label && label !== a.kindLabel ? ` · ${label}` : ""}</div>
                  <div className="h-1 rounded-full bg-white/15 overflow-hidden"><span className="block h-full bg-eu-yellow" style={{ width: `${Math.round(a.confidence * 100)}%` }} /></div>
                  <div className="flex flex-wrap gap-1.5 text-[length:var(--fs-13)]">
                    {a.energyClass && <span className="rounded-full bg-white/12 px-2.5 py-1 font-bold">Κλάση {a.energyClass}</span>}
                    {a.ageYears != null && <span className="rounded-full bg-white/12 px-2.5 py-1 font-bold">~{a.ageYears} ετών</span>}
                    {a.condition && <span className="rounded-full bg-white/12 px-2.5 py-1 font-bold">Κατάσταση: {a.condition}</span>}
                    {a.dims?.w && a.dims.h && <span className="rounded-full bg-white/12 px-2.5 py-1 font-bold inline-flex items-center gap-1"><Ruler className="size-3" aria-hidden /> {a.dims.w}×{a.dims.h}{a.dims.d ? `×${a.dims.d}` : ""} cm</span>}
                    {a.serial && <span className="rounded-full bg-white/12 px-2.5 py-1 font-bold">S/N {a.serial}</span>}
                  </div>
                  {ai.oldKwh && <p className="m-0 text-eu-on-dark text-[length:var(--fs-14)]">Μια συσκευή αυτής της ηλικίας καίει περίπου <b className="text-eu-yellow">{ai.oldKwh} kWh</b> τον χρόνο, δηλαδή <b className="text-eu-yellow">{Math.round(ai.oldKwh * ai.kwhPrice)} €</b> ρεύμα{ai.co2GPerKwh ? <> και <b className="text-eu-yellow">{Math.round((ai.oldKwh * ai.co2GPerKwh) / 1000)} kg CO₂</b></> : null}.</p>}
                  {a.notes && <p className="m-0 text-eu-on-dark-3 text-[length:var(--fs-13)]">{a.notes}</p>}
                </div>

                {ai.matched && (
                  <Link href={`/proion/${ai.matched.slug}`} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl border-2 border-eu-yellow bg-eu-yellow/10 p-2 hover:border-eu-navy">
                    <ProductImage src={ai.matched.image} sizes="56px" className="size-14" rounded="rounded-lg" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-eu-muted-2 font-bold text-[length:var(--fs-13)] uppercase">Το ίδιο μοντέλο στον κατάλογο</span>
                      <span className="block font-bold text-eu-ink text-[length:var(--fs-15)] leading-tight line-clamp-1">{ai.matched.brand} {ai.matched.title}</span>
                    </span>
                    <ArrowRight className="size-4 text-eu-blue shrink-0" aria-hidden />
                  </Link>
                )}

                {ai.replacements.length > 0 && (
                  <div className="grid gap-1.5">
                    <div className="font-extrabold text-eu-ink text-[length:var(--fs-14)]">Αντικαταστάτες που ταιριάζουν</div>
                    <ul className="m-0 p-0 list-none grid gap-1.5">
                      {ai.replacements.map((p) => (
                        <li key={p.id}>
                          <Link href={`/proion/${p.slug}`} onClick={() => { track("replace"); setOpen(false); }} className="flex items-center gap-3 rounded-xl border border-eu-line p-2 hover:border-eu-blue">
                            <ProductImage src={p.image} sizes="64px" className="size-16" rounded="rounded-lg" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-eu-muted-2 font-bold text-[length:var(--fs-13)] uppercase">{p.brand}</span>
                              <span className="block font-bold text-eu-ink text-[length:var(--fs-15)] leading-tight line-clamp-1">{p.title}</span>
                              <span className="flex flex-wrap gap-x-2 text-[length:var(--fs-13)] text-eu-ink-3">
                                {p.savingEur != null && p.savingEur > 0 && <span className="text-eu-green font-bold inline-flex items-center gap-0.5"><Zap className="size-3" aria-hidden /> −{p.savingEur} €/έτος</span>}{p.savingCo2Kg != null && p.savingCo2Kg > 0 && <span className="text-eu-green font-bold inline-flex items-center gap-0.5" title="Λιγότερο CO₂ τον χρόνο, με την ένταση του ελληνικού δικτύου">· −{p.savingCo2Kg} kg CO₂/έτος</span>}
                                {p.fit && <span className={p.fit.ok ? "text-eu-green font-bold" : "text-eu-ink-3"}>{p.fit.ok ? "✓ Χωράει" : p.fit.note}</span>}
                                <span className="line-clamp-1">{p.why}</span>
                              </span>
                            </span>
                            <span className="text-right shrink-0">
                              {p.wasPrice && <span className="block text-eu-muted line-through text-[length:var(--fs-13)] tabular-nums">{p.wasPrice.toLocaleString("el-GR")} €</span>}
                              <span className="font-extrabold text-eu-ink text-[length:var(--fs-16)] tabular-nums">{p.price.toLocaleString("el-GR")} €</span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* next steps */}
                <div className="grid gap-2">
                  <div className="font-extrabold text-eu-ink text-[length:var(--fs-14)]">Τι θέλεις να κάνεις με την παλιά;</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([
                      ["replace", RefreshCw, "Αντικατάσταση"],
                      ["register", Smartphone, "Συσκευές μου"],
                      ["service", Wrench, "Αίτημα service"],
                      ["recycle", Recycle, "Ανακύκλωση"],
                    ] as const).map(([k, Icon, t]) => (
                      <button key={k} type="button" onClick={() => { setDone(null); setAction(action === k ? null : k); if (k === "recycle" || k === "replace") track(k); }} aria-pressed={action === k} className={`rounded-xl border-2 min-h-12 px-2 font-extrabold text-[length:var(--fs-14)] inline-flex items-center justify-center gap-1.5 ${action === k ? "border-eu-navy bg-eu-navy text-white" : "border-eu-line text-eu-navy hover:border-eu-blue"}`}>
                        <Icon className="size-4" aria-hidden /> {t}
                      </button>
                    ))}
                  </div>

                  {done && <p className="m-0 rounded-xl bg-eu-green/10 text-eu-ink p-3 text-[length:var(--fs-14)] font-semibold inline-flex items-start gap-2"><Check className="size-4 text-eu-green shrink-0 mt-0.5" aria-hidden /> {done}</p>}

                  {action === "replace" && !done && (
                    <div className="rounded-xl bg-eu-surface p-3 text-[length:var(--fs-14)] text-eu-ink-2 grid gap-2">
                      <p className="m-0">Διάλεξε έναν αντικαταστάτη από πάνω ή δες όλη την κατηγορία. Στο checkout ζητάς <b>δωρεάν παραλαβή της παλιάς</b> συσκευής από τον τεχνικό που φέρνει τη νέα.</p>
                      {ai.categoryHref && <Link href={ai.categoryHref} onClick={() => setOpen(false)} className="justify-self-start rounded-full bg-eu-navy text-white font-extrabold px-4 min-h-11 inline-flex items-center gap-1.5 hover:bg-eu-blue">Όλη η κατηγορία <ArrowRight className="size-4" aria-hidden /></Link>}
                    </div>
                  )}
                  {action === "register" && !done && (
                    <div className="rounded-xl bg-eu-surface p-3 text-[length:var(--fs-14)] text-eu-ink-2 grid gap-2">
                      <p className="m-0">Θα καταχωρήσουμε <b>{label || a.kindLabel}</b> στις «Συσκευές μου» μαζί με τη φωτογραφία, για εγγύηση, service και υπενθυμίσεις.</p>
                      {me?.authenticated ? (
                        <button type="button" onClick={register} disabled={busy} className="justify-self-start rounded-full bg-eu-navy text-white font-extrabold px-4 min-h-11 inline-flex items-center gap-1.5 hover:bg-eu-blue disabled:opacity-60">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Καταχώρηση με τη φωτογραφία</button>
                      ) : (
                        <Link href={loginHref} className="justify-self-start rounded-full bg-eu-navy text-white font-extrabold px-4 min-h-11 inline-flex items-center gap-1.5 hover:bg-eu-blue">Σύνδεση για καταχώρηση <ArrowRight className="size-4" aria-hidden /></Link>
                      )}
                      <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Με την καταχώρηση συναινείς στη φύλαξη της φωτογραφίας στον λογαριασμό σου. Μπορείς να τη διαγράψεις όποτε θέλεις.</p>
                    </div>
                  )}
                  {action === "service" && !done && (
                    <form onSubmit={(e) => { e.preventDefault(); service(); }} className="rounded-xl bg-eu-surface p-3 text-[length:var(--fs-14)] text-eu-ink-2 grid gap-2">
                      <p className="m-0">Αίτημα επισκευής για <b>{label || a.kindLabel}</b>. Το κατάστημα της γειτονιάς σου θα σε καλέσει για ραντεβού.</p>
                      <label className="grid gap-1 font-bold text-eu-ink">Τι πρόβλημα έχει;
                        <textarea value={problem} onChange={(e) => setProblem(e.target.value)} required rows={2} placeholder="π.χ. δεν στύβει, κάνει θόρυβο" className="rounded-xl border-2 border-eu-line bg-white px-3 py-2 font-normal text-[length:var(--fs-15)] outline-none focus:border-eu-blue" />
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {([["visit", "Επίσκεψη τεχνικού"], ["pickup", "Παραλαβή από το σπίτι"], ["store", "Στο κατάστημα"]] as const).map(([k, t]) => (
                          <button key={k} type="button" onClick={() => setMode(k)} aria-pressed={mode === k} className={`rounded-full border-2 px-3 min-h-10 font-bold ${mode === k ? "border-eu-navy bg-eu-navy text-white" : "border-eu-line text-eu-navy"}`}>{t}</button>
                        ))}
                      </div>
                      {me?.authenticated ? (
                        <button type="submit" disabled={busy || !problem.trim()} className="justify-self-start rounded-full bg-eu-navy text-white font-extrabold px-4 min-h-11 inline-flex items-center gap-1.5 hover:bg-eu-blue disabled:opacity-60">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wrench className="size-4" aria-hidden />} Αποστολή αιτήματος</button>
                      ) : (
                        <Link href={loginHref} className="justify-self-start rounded-full bg-eu-navy text-white font-extrabold px-4 min-h-11 inline-flex items-center gap-1.5 hover:bg-eu-blue">Σύνδεση για αίτημα <ArrowRight className="size-4" aria-hidden /></Link>
                      )}
                    </form>
                  )}
                  {action === "recycle" && !done && (
                    <div className="rounded-xl bg-eu-surface p-3 text-[length:var(--fs-14)] text-eu-ink-2 grid gap-2">
                      <p className="m-0"><b>Δωρεάν ανακύκλωση ΑΗΗΕ.</b> Παραδίδεις την παλιά στο κατάστημα ή την παραλαμβάνουμε με την παράδοση της νέας. Ο χαλκός και τα μέταλλα ανακτώνται, τα ψυκτικά αέρια αδρανοποιούνται.</p>
                      <div className="flex flex-wrap gap-1.5">
                        <Link href="/ypiresies/anakyklosi-aiie" onClick={() => setOpen(false)} className="rounded-full bg-eu-navy text-white font-extrabold px-4 min-h-11 inline-flex items-center gap-1.5 hover:bg-eu-blue">Πώς γίνεται <ArrowRight className="size-4" aria-hidden /></Link>
                        <Link href="/katastimata?service=recycling" onClick={() => setOpen(false)} className="rounded-full border-2 border-eu-navy text-eu-navy font-extrabold px-4 min-h-11 inline-flex items-center gap-1.5">Σημεία ανακύκλωσης</Link>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

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
