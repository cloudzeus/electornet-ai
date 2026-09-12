"use client";

import { useEffect, useRef, useState } from "react";
import { Box, X, Smartphone } from "lucide-react";
import Image from "next/image";
import QRCode from "qrcode";
import type { Dims } from "@/lib/data/dims";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("ar");

/**
 * @dynamic «Δες το στον χώρο σου»: opens the product as a to-scale box
 * (front face = product photo) in AR. Android / desktop: <model-viewer>
 * with WebXR / Scene Viewer from a GLB; iPhone / iPad: AR Quick Look from
 * a USDZ. On desktop the dialog shows a QR code so the customer continues
 * on the phone. Models are generated per SKU from its dimensions
 * (scripts/gen-models.py) — production: the PIM keeps a 3D asset per SKU
 * and falls back to the dimension box.
 */
export function ArButton({
  id,
  title,
  dims,
  className = "",
}: {
  id: string;
  title: string;
  dims: Dims | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const holder = useRef<HTMLDivElement>(null);
  const glb = `/models/${id}.glb`;
  const usdz = `/models/${id}.usdz`;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    import("@google/model-viewer").then(() => {
      if (!alive || !holder.current) return;
      holder.current.innerHTML = "";
      const mv = document.createElement("model-viewer");
      mv.setAttribute("src", glb);
      mv.setAttribute("ios-src", usdz);
      mv.setAttribute("alt", title);
      mv.setAttribute("ar", "");
      mv.setAttribute("ar-modes", "webxr scene-viewer quick-look");
      mv.setAttribute("ar-scale", "fixed");
      mv.setAttribute("camera-controls", "");
      mv.setAttribute("auto-rotate", "");
      mv.setAttribute("shadow-intensity", "1");
      mv.setAttribute("exposure", "1.1");
      mv.setAttribute("environment-image", "neutral");
      mv.style.width = "100%";
      mv.style.height = "100%";
      mv.style.background =
        "radial-gradient(70% 60% at 50% 60%, #fff 0%, #eef2f9 100%)";
      const btn = document.createElement("button");
      btn.setAttribute("slot", "ar-button");
      btn.className =
        "absolute left-1/2 -translate-x-1/2 bottom-4 rounded-full bg-eu-navy text-white font-extrabold px-5 min-h-12 shadow-[var(--shadow-overlay)]";
      btn.style.fontSize = "var(--fs-15)";
      btn.textContent = "Άνοιξε σε AR στον χώρο σου";
      mv.appendChild(btn);
      holder.current.appendChild(mv);
    });
    QRCode.toDataURL(`${location.origin}${location.pathname}?ar=1`, {
      margin: 1,
      width: 168,
      color: { dark: "#122A58", light: "#ffffff" },
    }).then((u) => alive && setQr(u));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, glb, usdz, title]);

  useEffect(() => {
    // Deep link from the QR code (?ar=1): open after hydration.
    if (new URLSearchParams(location.search).get("ar") !== "1") return;
    const t = setTimeout(() => setOpen(true), 0);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group inline-flex items-center gap-2 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-15)] px-4 min-h-12 hover:bg-eu-navy hover:text-white transition-colors ${className}`}
      >
        <Box
          className="size-4 transition-transform group-hover:rotate-12"
          aria-hidden
        />{" "}
        Δες το στον χώρο σου
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[70]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ar-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-eu-navy/60 backdrop-blur-sm"
            aria-label={c.kleisimo}
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 @md:inset-auto @md:left-1/2 @md:top-1/2 @md:-translate-x-1/2 @md:-translate-y-1/2 @md:w-[min(920px,92vw)] bg-white rounded-t-3xl @md:rounded-3xl shadow-[var(--shadow-overlay)] overflow-hidden grid grid-cols-1 @md:grid-cols-[minmax(0,1fr)_280px] max-h-[92dvh]">
            <div
              ref={holder}
              className="relative aspect-[4/3] @md:aspect-auto @md:min-h-[520px] bg-eu-surface"
            />
            <div className="p-5 @md:p-6 grid content-start gap-4 border-t @md:border-t-0 @md:border-l border-eu-line-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">
                    {c.ar_se_pragmatiki_klimaka}
                  </div>
                  <h2
                    id="ar-title"
                    className="m-0 mt-1 font-heading font-bold text-eu-ink text-[length:var(--fs-20)] leading-tight"
                  >
                    {title}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={c.kleisimo}
                  className="size-11 rounded-full bg-eu-surface inline-flex items-center justify-center hover:bg-eu-surface-3 shrink-0"
                >
                  <X className="size-5" aria-hidden />
                </button>
              </div>
              {dims && (
                <dl className="m-0 grid grid-cols-3 gap-2">
                  {[
                    ["Πλάτος", dims.w],
                    ["Ύψος", dims.h],
                    ["Βάθος", dims.d],
                  ].map(([l, v]) => (
                    <div
                      key={l as string}
                      className="rounded-xl bg-eu-surface p-3"
                    >
                      <dt className="m-0 text-eu-muted text-[length:var(--fs-14)]">
                        {l}
                      </dt>
                      <dd className="m-0 font-extrabold text-eu-ink text-[length:var(--fs-18)] tabular-nums">
                        {(v as number).toLocaleString("el-GR")} εκ.
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] leading-snug">
                Στο κινητό πάτα «Άνοιξε σε AR» και τοποθέτησέ το στο πάτωμα ή
                στην εσοχή. Οι διαστάσεις είναι{" "}
                {dims?.source === "specs"
                  ? "του κατασκευαστή"
                  : "τυπικές για την κατηγορία"}
                .
              </p>
              <div className="hidden @md:flex items-center gap-3 rounded-xl border border-eu-line p-3">
                {qr ? (
                  <Image src={qr} alt={c.qr_gia_anoigma_sto} width={84} height={84} unoptimized className="rounded-md" />
                ) : (
                  <span className="size-[84px] rounded-md bg-eu-surface" />
                )}
                <div className="text-[length:var(--fs-14)] text-eu-ink-2 leading-snug">
                  <Smartphone
                    className="size-4 text-eu-blue inline mr-1"
                    aria-hidden
                  />
                  {c.skanare_me_to_kinito}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
