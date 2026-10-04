"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Link2, Loader2, Play, Plus } from "lucide-react";
import { addProductVideo, setProductVideoHidden, type ProductVideoDTO } from "@/app/admin/(shell)/catalog/actions";
import { parseVideoUrl } from "@/lib/catalog/video-url";

const btn = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 min-h-11 font-bold text-[length:var(--fs-14)] transition-colors disabled:opacity-50";

/** Βίντεο στην καρτέλα προϊόντος: προσθήκη με σύνδεσμο (αρχείο → Bunny, YouTube / Vimeo → ενσωμάτωση), απόκρυψη / επαναφορά. */
export function ProductVideosAdmin({ productId, initial, canWrite }: { productId: string; initial: ProductVideoDTO[]; canWrite: boolean }) {
  const [videos, setVideos] = useState(initial);
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const add = () => start(async () => {
    setMsg(null);
    const r = await addProductVideo(productId, url);
    setVideos(r.videos);
    if (r.ok) { setUrl(""); setMsg({ tone: "ok", text: "Το βίντεο προστέθηκε." }); } else setMsg({ tone: "warn", text: r.error ?? "Δεν προστέθηκε." });
  });
  const toggle = (v: ProductVideoDTO) => start(async () => setVideos(await setProductVideoHidden(productId, v.id, !v.hidden)));
  return (
    <div className="grid gap-3">
      <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Εμφανίζονται στη σελίδα του προϊόντος, στην ενότητα «Βίντεο». Τα αρχεία .mp4 μετατρέπονται και ανεβαίνουν στο Bunny· τα YouTube / Vimeo μένουν ενσωμάτωση με αφίσα από το Bunny.</p>
      {videos.length > 0 && (
        <ul className="m-0 p-0 list-none grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,15rem),1fr))]">
          {videos.map((v) => { const ref = parseVideoUrl(v.url); return (
            <li key={v.id} className={`rounded-xl border border-eu-line p-1.5 grid gap-1.5 min-w-0 ${v.hidden ? "opacity-60" : ""}`}>
              <div className="relative aspect-video rounded-lg overflow-hidden bg-eu-navy grid place-items-center">
                {/* eslint-disable-next-line @next/next/no-img-element -- αφίσα από το Bunny */}
                {v.poster && <img src={v.poster} alt="" className="absolute inset-0 size-full object-cover" />}
                <Play className="relative size-6 text-white drop-shadow" aria-hidden />
                <span className="absolute left-1 top-1 rounded-full bg-black/60 text-white px-1.5 py-0.5 text-[length:var(--fs-11)]">{v.onBunny ? "Bunny" : ref?.provider === "youtube" ? "YouTube" : ref?.provider === "vimeo" ? "Vimeo" : "σύνδεσμος"}{v.hidden ? " · κρυμμένο" : ""}</span>
              </div>
              <div className="flex items-center gap-1 min-w-0">
                <a href={v.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 inline-flex items-center gap-1 min-h-11 text-eu-blue text-[length:var(--fs-12)] hover:underline"><Link2 className="size-3.5 shrink-0" aria-hidden /><span className="truncate">{v.url.replace(/^https?:\/\//, "")}</span></a>
                {canWrite && <button type="button" onClick={() => toggle(v)} disabled={pending} aria-label={v.hidden ? "Επαναφορά βίντεο" : "Απόκρυψη βίντεο"} title={v.hidden ? "Επαναφορά" : "Απόκρυψη"} className="size-11 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface text-eu-ink-3">{v.hidden ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}</button>}
              </div>
            </li>
          ); })}
        </ul>
      )}
      {canWrite && (
        <div className="grid gap-1">
          <label htmlFor={`vid-${productId}`} className="text-eu-ink-2 font-bold text-[length:var(--fs-13)]">Νέο βίντεο</label>
          <div className="flex flex-wrap gap-2">
            <input id={`vid-${productId}`} value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && url.trim()) { e.preventDefault(); add(); } }} inputMode="url" placeholder="https://www.youtube.com/watch?v=… ή https://…/video.mp4" className="min-w-0 flex-[1_1_18rem] rounded-lg border border-eu-line bg-white px-3 min-h-11 text-[length:var(--fs-14)] focus-visible:outline-2 focus-visible:outline-eu-blue" />
            <button type="button" onClick={add} disabled={pending || !url.trim()} className={`${btn} bg-eu-navy text-white hover:bg-eu-blue`}>{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />} Προσθήκη</button>
          </div>
          <span className="text-eu-muted text-[length:var(--fs-12)]">Ένα αρχείο .mp4 μπορεί να θέλει λίγα λεπτά για να μετατραπεί.</span>
        </div>
      )}
      <p role="status" aria-live="polite" className={`m-0 rounded-xl px-3 py-2 text-[length:var(--fs-14)] ${msg ? (msg.tone === "warn" ? "bg-eu-red/10 text-eu-red" : "bg-eu-green/12 text-eu-ink") : "sr-only"}`}>{msg?.text}</p>
    </div>
  );
}
