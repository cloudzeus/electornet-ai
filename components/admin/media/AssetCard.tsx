"use client";

import { Check, FileText, Film, Play } from "lucide-react";
import type { MediaAssetDTO } from "@/lib/media/types";
import { fileExt, fmtBytes, fmtDuration } from "./format";

/** Grid tile: thumbnail (focal-point aware), kind badge, selection checkbox, meta line. Draggable to folders. */
export function AssetCard({ a, selected, onToggle, onOpen, draggableIds }: { a: MediaAssetDTO; selected: boolean; onToggle: () => void; onOpen: () => void; draggableIds: string[] }) {
  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("application/x-eu-assets", JSON.stringify(draggableIds.length ? draggableIds : [a.id])); e.dataTransfer.effectAllowed = "move"; }}
      className={`group relative rounded-xl bg-white border-2 overflow-hidden transition-all ${selected ? "border-eu-navy shadow-[var(--shadow-raised)]" : "border-eu-line hover:border-eu-blue"}`}
    >
      <button type="button" onClick={onOpen} className="block w-full text-left cursor-pointer" aria-label={`Άνοιγμα ${a.title ?? a.filename}`}>
        <div className="relative aspect-square bg-[repeating-conic-gradient(#eef0f4_0_25%,#fff_0_50%)] bg-[length:16px_16px]">
          {a.thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.thumbUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" style={{ objectPosition: `${a.focalX * 100}% ${a.focalY * 100}%`, backgroundImage: a.blur ? `url(${a.blur})` : undefined, backgroundSize: "cover" }} />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-eu-muted">
              {a.kind === "video" ? <Film className="size-10" aria-hidden /> : <FileText className="size-10" aria-hidden />}
            </div>
          )}
          {a.kind === "video" && (
            <span className="absolute left-2 bottom-2 inline-flex items-center gap-1 rounded-full bg-eu-navy/85 text-white px-2 py-0.5 text-[length:var(--fs-13)] font-bold"><Play className="size-3" aria-hidden /> {fmtDuration(a.duration) || "video"}</span>
          )}
          {a.kind === "file" && <span className="absolute left-2 bottom-2 rounded-full bg-eu-navy/85 text-white px-2 py-0.5 text-[length:var(--fs-13)] font-bold">{fileExt(a.filename)}</span>}
          {a.tags.includes("cutout") && <span className="absolute right-2 bottom-2 rounded-full bg-eu-yellow text-eu-navy px-2 py-0.5 text-[length:var(--fs-13)] font-extrabold">cutout</span>}
        </div>
        <div className="p-2">
          <div className="truncate font-bold text-eu-ink text-[length:var(--fs-14)]">{a.title ?? a.filename}</div>
          <div className="truncate text-eu-muted text-[length:var(--fs-13)] tabular-nums">{a.width && a.height ? `${a.width}×${a.height} · ` : ""}{fmtBytes(a.size)}</div>
        </div>
      </button>
      <label className={`absolute top-2 left-2 size-11 grid place-items-center cursor-pointer ${selected ? "" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"}`}>
        <input type="checkbox" checked={selected} onChange={onToggle} className="sr-only peer" aria-label={`Επιλογή ${a.filename}`} />
        <span className={`size-6 rounded-md border-2 grid place-items-center bg-white/90 peer-focus-visible:ring-2 peer-focus-visible:ring-eu-blue ${selected ? "bg-eu-navy border-eu-navy text-white" : "border-eu-line-3"}`}>{selected && <Check className="size-4" aria-hidden />}</span>
      </label>
    </div>
  );
}
