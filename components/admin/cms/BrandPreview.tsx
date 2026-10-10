"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Monitor, Smartphone } from "lucide-react";

/** Ζωντανή προεπισκόπηση του πρόχειρου (iframe), σε πλάτος υπολογιστή (σμίκρυνση) ή κινητού. */
export function Preview({ src, v, device, setDevice, saving }: { src: string; v: number; device: "desktop" | "mobile"; setDevice: (d: "desktop" | "mobile") => void; saving: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const target = device === "desktop" ? 1280 : 390;
  const scale = w ? Math.min(1, w / target) : 1;
  const h = 760;
  return (
    <div className="@7xl:sticky @7xl:top-44 grid gap-2 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold text-eu-ink-2 text-[length:var(--fs-14)] inline-flex items-center gap-2">Προεπισκόπηση πρόχειρου{saving && <Loader2 className="size-3.5 animate-spin" aria-hidden />}</span>
        <div className="flex gap-1 rounded-full bg-white border border-eu-line p-1" role="radiogroup" aria-label="Συσκευή">
          {(["desktop", "mobile"] as const).map((d) => <button key={d} type="button" role="radio" aria-checked={device === d} onClick={() => setDevice(d)} className={`inline-flex items-center gap-1.5 rounded-full px-3 min-h-10 font-bold text-[length:var(--fs-13)] ${device === d ? "bg-eu-navy text-white" : "text-eu-ink-2"}`}>{d === "desktop" ? <Monitor className="size-4" aria-hidden /> : <Smartphone className="size-4" aria-hidden />}{d === "desktop" ? "Υπολογιστής" : "Κινητό"}</button>)}
        </div>
      </div>
      <div ref={box} className="rounded-2xl border border-eu-line bg-eu-line-2 overflow-hidden" style={{ height: h * scale + (device === "mobile" ? 0 : 0) }}>
        <div style={{ width: target, height: h, transform: `scale(${scale})`, transformOrigin: "top left", margin: device === "mobile" && w > target ? "0 auto" : undefined }}>
          <iframe key={v} title="Προεπισκόπηση σελίδας" src={`${src}${src.includes("?") ? "&" : "?"}v=${v}`} className="block bg-white" style={{ width: target, height: h, border: 0 }} />
        </div>
      </div>
      <span className="text-eu-muted text-[length:var(--fs-13)]">Ανανεώνεται μόνη της μετά από κάθε αλλαγή. Οι πελάτες δεν βλέπουν το πρόχειρο.</span>
    </div>
  );
}
