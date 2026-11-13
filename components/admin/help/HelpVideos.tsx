import { PlayCircle } from "lucide-react";
import type { HelpVideo } from "@/lib/help/types";

const dur = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/**
 * Video-ξεναγήσεις μιας σελίδας της διαχείρισης: σύντομα (20–60″), με λεζάντες αντί για ήχο. Φορτώνουν μόνο όταν πατηθεί το play
 * (preload="none") και δείχνουν πρώτα το εξώφυλλό τους. `compact`: μία στήλη, για το συρτάρι της βοήθειας.
 */
export function HelpVideos({ videos, compact = false }: { videos: HelpVideo[]; compact?: boolean }) {
  if (!videos.length) return null;
  return (
    <section aria-labelledby="h-videos" className="grid gap-2">
      <h3 id="h-videos" className={compact ? "m-0 font-extrabold text-eu-navy text-[length:var(--fs-12)] uppercase tracking-wide" : "m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]"}>Δες το σε video</h3>
      <ul className={`m-0 p-0 list-none grid gap-3 ${compact ? "" : "@3xl:grid-cols-2"}`}>
        {videos.map((v) => (
          <li key={v.file} className="grid gap-1.5 rounded-xl border border-eu-line bg-white p-2">
            <video controls preload="none" playsInline poster={`/api/help-shot/v.${v.file}.jpg`} className="w-full aspect-video rounded-lg bg-eu-navy" aria-label={v.title}>
              <source src={`/api/help-shot/v.${v.file}.mp4`} type="video/mp4" />
            </video>
            <span className="flex items-start gap-1.5 px-1 font-bold text-eu-ink text-[length:var(--fs-14)] leading-snug"><PlayCircle className="size-4 mt-0.5 shrink-0 text-eu-blue" aria-hidden /><span className="flex-1">{v.title}</span><span className="font-normal text-eu-muted tabular-nums text-[length:var(--fs-13)]">{dur(v.seconds)}</span></span>
          </li>
        ))}
      </ul>
    </section>
  );
}
