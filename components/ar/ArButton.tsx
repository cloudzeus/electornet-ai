"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Box, X, Smartphone, RotateCcw, Ruler } from "lucide-react";
import Image from "next/image";
import QRCode from "qrcode";
import type { Dims } from "@/lib/data/dims";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("ar");

/**
 * @dynamic «Δες το στον χώρο σου»: ο όγκος της συσκευής σε πραγματική
 * κλίμακα, με τη φωτογραφία της στην πρόσοψη και τις διαστάσεις ψημένες
 * πάνω του. Android: WebXR ή Scene Viewer από GLB· iPhone/iPad: AR Quick
 * Look από USDZ· desktop: προεπισκόπηση 3D και QR για συνέχεια στο κινητό.
 * Τα μοντέλα χτίζονται στο /api/ar/{id}/model.{glb,usdz} από τις τρέχουσες
 * διαστάσεις (EPREL, ERP ή τυπικές της κατηγορίας) — κανένα αρχείο ανά SKU.
 */
export function ArButton({ id, title, dims, version = "", ios = true, light = false, className = "" }: { id: string; title: string; dims: Dims | null; /** υπάρχει ελαφριά έκδοση για αργές συνδέσεις */ light?: boolean; /** υπάρχει USDZ; αλλιώς το model-viewer μετατρέπει το GLB για το Quick Look μέσα στη συσκευή */ ios?: boolean; /** αποτύπωμα του μοντέλου — αλλάζει το URL όταν αλλάξουν διαστάσεις/φωτογραφία, ώστε να μην μείνει παλιό στην cache */ version?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "ar">("loading");
  const [canAr, setCanAr] = useState<boolean | null>(null);
  const holder = useRef<HTMLDivElement>(null);
  const mvRef = useRef<(HTMLElement & { cameraOrbit?: string }) | null>(null);
  // Σε 2G/3G ή «εξοικονόμηση δεδομένων» ζητάμε την ελαφριά έκδοση, αν υπάρχει
  const slow = typeof navigator !== "undefined" && (() => { const c = (navigator as Navigator & { connection?: { effectiveType?: string; saveData?: boolean } }).connection; return !!c && (c.saveData || /2g|3g/.test(c.effectiveType ?? "")); })();
  const q = `?v=${version}${light && slow ? "&q=light" : ""}`;
  const glb = `/api/ar/${id}/model.glb${q}`;
  const usdz = `/api/ar/${id}/model.usdz?v=${version}`;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    import("@google/model-viewer").then(() => {
      if (!alive || !holder.current) return;
      holder.current.innerHTML = "";
      const mv = document.createElement("model-viewer") as HTMLElement & { canActivateAR?: boolean; activateAR?: () => Promise<void>; resetTurntableRotation?: () => void; cameraOrbit?: string };
      mvRef.current = mv;
      mv.setAttribute("src", glb);
      if (ios) mv.setAttribute("ios-src", usdz);
      mv.setAttribute("alt", title);
      mv.setAttribute("ar", "");
      mv.setAttribute("ar-modes", "webxr scene-viewer quick-look");
      mv.setAttribute("ar-scale", "fixed"); // πραγματικό μέγεθος: ο πελάτης δεν μπορεί να το μεγεθύνει με τα δάχτυλα
      mv.setAttribute("ar-placement", "floor");
      mv.setAttribute("camera-controls", "");
      mv.setAttribute("touch-action", "pan-y");
      mv.setAttribute("interaction-prompt", "none");
      mv.setAttribute("loading", "eager");
      mv.setAttribute("camera-orbit", "32deg 74deg auto"); // από μπροστά-δεξιά: φαίνονται πρόσοψη και οι ετικέτες ύψους/βάθους στη δεξιά έδρα
      mv.setAttribute("min-camera-orbit", "auto 20deg auto");
      mv.setAttribute("max-camera-orbit", "auto 92deg auto");
      mv.setAttribute("field-of-view", "26deg");
      mv.setAttribute("shadow-intensity", "1.4");
      mv.setAttribute("shadow-softness", "0.7");
      mv.setAttribute("exposure", "1");
      mv.setAttribute("environment-image", "neutral");
      mv.setAttribute("xr-environment", "");
      mv.style.width = "100%";
      mv.style.height = "100%";
      mv.style.background = "radial-gradient(70% 60% at 50% 62%, #ffffff 0%, #eef2f9 100%)";
      mv.addEventListener("load", () => { if (alive) { setStatus("ready"); setCanAr(!!mv.canActivateAR); } });
      mv.addEventListener("error", () => alive && setStatus("error"));
      mv.addEventListener("ar-status", (e) => { const s = (e as CustomEvent<{ status: string }>).detail?.status; if (alive) setStatus(s === "session-started" || s === "object-placed" ? "ar" : "ready"); });
      // Σήμα Euronics και το κουμπί AR: παιδιά του <model-viewer> είναι το overlay και μέσα στο WebXR.
      const brand = document.createElement("img");
      brand.src = "/design/euronics-logo.png";
      brand.alt = "Euronics";
      brand.className = "pointer-events-none absolute left-4 top-4 h-6 w-auto opacity-90 drop-shadow";
      mv.appendChild(brand);
      const btn = document.createElement("button");
      btn.setAttribute("slot", "ar-button");
      btn.className = "absolute left-1/2 -translate-x-1/2 bottom-4 rounded-full bg-eu-navy text-white font-extrabold px-5 min-h-12 shadow-[var(--shadow-overlay)]";
      btn.style.fontSize = "var(--fs-15)";
      btn.textContent = "Άνοιξε σε AR στον χώρο σου";
      mv.appendChild(btn);
      holder.current.appendChild(mv);
    });
    QRCode.toDataURL(`${location.origin}${location.pathname}?ar=1`, { margin: 1, width: 168, color: { dark: "#122A58", light: "#ffffff" } }).then((u) => alive && setQr(u));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => { alive = false; window.removeEventListener("keydown", onKey); mvRef.current = null; };
  }, [open, glb, usdz, ios, title]);

  useEffect(() => {
    // Βαθύς σύνδεσμος από το QR (?ar=1): άνοιγμα μετά το hydration.
    if (new URLSearchParams(location.search).get("ar") !== "1") return;
    const t = setTimeout(() => setOpen(true), 0);
    return () => clearTimeout(t);
  }, []);

  const sourceText = dims?.source === "eprel" ? "από το ευρωπαϊκό μητρώο EPREL, χωρίς προεξοχές όπως πόρτα ή λαβές" : dims?.source === "specs" ? "του κατασκευαστή" : "τυπικές για την κατηγορία";

  return (
    <>
      <button type="button" onClick={() => { setStatus("loading"); setCanAr(null); setOpen(true); }} className={`group inline-flex items-center gap-2 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-15)] px-4 min-h-12 hover:bg-eu-navy hover:text-white transition-colors ${className}`}>
        <Box className="size-4 transition-transform group-hover:rotate-12" aria-hidden /> Δες το στον χώρο σου
      </button>
      {/* Portal: ο διάλογος πρέπει να βγει από προγόνους με transforms, αλλιώς το `fixed` μετριέται ως προς αυτούς. */}
      {open && createPortal(
        <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="ar-title">
          <button type="button" className="absolute inset-0 bg-eu-navy/60 backdrop-blur-sm" aria-label={c.kleisimo} onClick={() => setOpen(false)} />
          <div className="absolute inset-0 h-[100dvh] @md:inset-auto @md:left-1/2 @md:top-1/2 @md:-translate-x-1/2 @md:-translate-y-1/2 @md:w-[min(960px,92vw)] @md:h-[min(92dvh,700px)] bg-white @md:rounded-3xl shadow-[var(--shadow-overlay)] overflow-hidden grid grid-rows-[minmax(0,1fr)_auto] @md:grid-rows-[minmax(0,1fr)] @md:grid-cols-[minmax(0,1fr)_300px] [@media(orientation:landscape)_and_(max-height:520px)]:grid-rows-none [@media(orientation:landscape)_and_(max-height:520px)]:grid-cols-[minmax(0,1fr)_240px]">
            <div className="relative min-h-0 min-w-0 h-full bg-eu-surface">
              <div ref={holder} className="absolute inset-0" />
              {status === "loading" && (
                <div className="absolute inset-0 grid place-items-center pointer-events-none">
                  <div className="rounded-full bg-white/90 px-4 py-2 text-eu-ink-3 text-[length:var(--fs-14)] shadow">Χτίζουμε το μοντέλο στις διαστάσεις του…</div>
                </div>
              )}
              {status === "error" && (
                <div className="absolute inset-0 grid place-items-center p-6 text-center">
                  <p className="m-0 rounded-2xl bg-white p-4 text-eu-ink-3 text-[length:var(--fs-14)] shadow">Το μοντέλο δεν φορτώθηκε. Δοκίμασε ξανά ή σκάναρε το QR από το κινητό.</p>
                </div>
              )}
              {status === "ready" && (
                <button type="button" onClick={() => { const mv = mvRef.current; if (mv) mv.cameraOrbit = "32deg 74deg auto"; }} aria-label="Επαναφορά προβολής" className="absolute right-4 top-4 size-10 rounded-full bg-white/90 text-eu-navy inline-flex items-center justify-center shadow hover:bg-white">
                  <RotateCcw className="size-4" aria-hidden />
                </button>
              )}
            </div>
            <div className="p-4 @md:p-6 grid content-start gap-3 @md:gap-4 border-t @md:border-t-0 @md:border-l border-eu-line-2 min-h-0 overflow-y-auto">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">{c.ar_se_pragmatiki_klimaka}</div>
                  <h2 id="ar-title" className="m-0 mt-1 font-heading font-bold text-eu-ink text-[length:var(--fs-18)] @md:text-[length:var(--fs-20)] leading-tight line-clamp-2">{title}</h2>
                </div>
                <button type="button" onClick={() => setOpen(false)} aria-label={c.kleisimo} className="size-11 rounded-full bg-eu-surface inline-flex items-center justify-center hover:bg-eu-surface-3 shrink-0">
                  <X className="size-5" aria-hidden />
                </button>
              </div>
              {dims && (
                <dl className="m-0 grid grid-cols-3 gap-2">
                  {([["Πλάτος", dims.w], ["Ύψος", dims.h], ["Βάθος", dims.d]] as const).map(([l, v]) => (
                    <div key={l} className="rounded-xl bg-eu-surface p-2.5 min-w-0">
                      <dt className="m-0 text-eu-muted text-[length:var(--fs-14)]">{l}</dt>
                      <dd className="m-0 font-extrabold text-eu-ink text-[length:var(--fs-16)] tabular-nums whitespace-nowrap">{v.toLocaleString("el-GR")} <span className="text-eu-muted font-bold text-[length:var(--fs-13)]">εκ.</span></dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] leading-snug inline-flex items-start gap-2">
                <Ruler className="size-4 mt-0.5 shrink-0 text-eu-blue" aria-hidden />
                <span>Διαστάσεις {sourceText}. Το μοντέλο είναι σε πραγματικό μέγεθος και δεν μεγεθύνεται.</span>
              </p>
              {canAr === false && status !== "loading" && (
                <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] leading-snug">Σε αυτή τη συσκευή βλέπεις την προεπισκόπηση 3D. Για να το βάλεις στον χώρο σου, άνοιξέ το από κινητό.</p>
              )}
              {canAr && (
                <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] leading-snug">Πάτα «Άνοιξε σε AR», στόχευσε το πάτωμα ή την εσοχή και άφησέ το. Περπάτα γύρω του: οι ετικέτες δείχνουν πλάτος, ύψος και βάθος.</p>
              )}
              <div className="hidden @md:flex items-center gap-3 rounded-xl border border-eu-line p-3">
                {qr ? <Image src={qr} alt={c.qr_gia_anoigma_sto} width={84} height={84} unoptimized className="rounded-md" /> : <span className="size-[84px] rounded-md bg-eu-surface" />}
                <div className="text-[length:var(--fs-14)] text-eu-ink-2 leading-snug"><Smartphone className="size-4 text-eu-blue inline mr-1" aria-hidden />{c.skanare_me_to_kinito}</div>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
