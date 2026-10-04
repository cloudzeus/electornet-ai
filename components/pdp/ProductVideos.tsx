"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { parseVideoUrl } from "@/lib/catalog/video-url";

type Video = { url: string; poster: string | null; width: number | null; height: number | null; title: string | null };

/**
 * Βίντεο του προϊόντος. Μέχρι να πατήσει ο πελάτης «play» φαίνεται μόνο η αφίσα (από το Bunny): κανένα script ή cookie
 * από YouTube / Vimeo, καμία καθυστέρηση στη σελίδα. Τα αρχεία του Bunny παίζουν στον δικό μας player.
 */
export function ProductVideos({ title, videos }: { title: string; videos: Video[] }) {
  const [playing, setPlaying] = useState<number | null>(null);
  const one = videos.length === 1;
  return (
    <section id="videos" className="scroll-mt-24" aria-labelledby="vid-title">
      <div className="font-extrabold text-eu-blue text-[length:var(--fs-14)] tracking-wide mb-1">Βίντεο</div>
      <h2 id="vid-title" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)] leading-tight mb-4">Δες το σε κίνηση</h2>
      <ul className={`m-0 p-0 list-none grid gap-4 ${one ? "max-w-[56rem]" : "[grid-template-columns:repeat(auto-fill,minmax(min(100%,22rem),1fr))]"}`}>
        {videos.map((v, i) => {
          const ref = parseVideoUrl(v.url);
          const label = v.title || `${title} — βίντεο ${i + 1}`;
          return (
            <li key={v.url} className="rounded-xl overflow-hidden bg-eu-navy aspect-video relative">
              {playing === i ? (
                !ref || ref.provider === "file" ? (
                  <video src={v.url} poster={v.poster ?? undefined} controls autoPlay playsInline className="absolute inset-0 size-full bg-black" aria-label={label} />
                ) : (
                  <iframe src={ref.embed} title={label} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen className="absolute inset-0 size-full border-0" />
                )
              ) : (
                <button type="button" onClick={() => setPlaying(i)} aria-label={`Αναπαραγωγή: ${label}`} className="group absolute inset-0 size-full grid place-items-center focus-visible:outline-3 focus-visible:outline-eu-yellow focus-visible:-outline-offset-4">
                  {v.poster
                    // eslint-disable-next-line @next/next/no-img-element -- αφίσα από το Bunny, ήδη WebP στο σωστό μέγεθος
                    ? <img src={v.poster} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
                    : <span className="absolute inset-0 bg-gradient-to-br from-eu-navy to-eu-blue" aria-hidden />}
                  <span className="absolute inset-0 bg-black/15 group-hover:bg-black/5 transition-colors" aria-hidden />
                  <span className="relative size-16 rounded-full bg-eu-yellow text-eu-navy grid place-items-center shadow-lg transition-transform group-hover:scale-105" aria-hidden><Play className="size-7 translate-x-0.5" fill="currentColor" /></span>
                  {ref && ref.provider !== "file" && <span className="absolute right-2 bottom-2 rounded-full bg-black/60 text-white px-2 py-0.5 text-[length:var(--fs-12)]">{ref.provider === "youtube" ? "YouTube" : "Vimeo"}</span>}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
