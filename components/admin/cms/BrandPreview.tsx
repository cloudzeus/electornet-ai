"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Loader2, Monitor, Smartphone } from "lucide-react";
import { sx } from "@/components/ui/sx";

/** Ζωντανή προεπισκόπηση του πρόχειρου (iframe), σε πλάτος υπολογιστή (σμίκρυνση) ή κινητού. */
export function Preview({ src, v, device, setDevice, saving, highlight = null, attr = "data-zone" }: { src: string; v: number; device: "desktop" | "mobile"; setDevice: (d: "desktop" | "mobile") => void; saving: boolean; /** τιμή του attr που τονίζεται (π.χ. ζώνη «top») */ highlight?: string | null; attr?: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [loadedV, setLoadedV] = useState<number | null>(null);
  // τονισμός με κανόνα CSS (όχι inline στυλ), μόνο αφού φορτώσει η τρέχουσα έκδοση — χωρίς παρέμβαση στο hydration
  useEffect(() => {
    const d = frame.current?.contentDocument;
    if (!d || loadedV !== v) return;
    let st = d.getElementById("eu-hl") as HTMLStyleElement | null;
    // το iframe έχει δικό του CSP με nonce: ένα <style> χωρίς το nonce του θα μπλοκαριζόταν
    if (!st) { st = d.createElement("style"); st.id = "eu-hl"; st.nonce = d.querySelector<HTMLElement>("script[nonce], style[nonce]")?.nonce ?? ""; d.head.appendChild(st); }
    if (!highlight) { st.textContent = ""; return; }
    const sel = `[${attr}="${highlight.replace(/"/g, "")}"]`;
    st.textContent = `${sel}{outline:8px solid #f5b400!important;outline-offset:-4px;background-color:rgba(245,180,0,.25)!important;border-radius:12px;box-shadow:0 0 0 9999px rgba(11,31,77,.18)!important;transition:outline-color .15s}`;
    const el = [...d.querySelectorAll<HTMLElement>(sel)].find((n) => n.offsetParent !== null);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlight, attr, loadedV, v]);
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [bh, setBh] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => { setW(e.contentRect.width); setBh(e.contentRect.height); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const target = device === "desktop" ? 1280 : 390;
  const scale = w ? Math.min(1, w / target) : 1;
  // το πλαίσιο γεμίζει το ύψος της οθόνης· η σελίδα μέσα έχει όσο ύψος χρειάζεται για να το γεμίσει στη σμίκρυνση
  const h = bh && scale ? Math.max(760, Math.round(bh / scale)) : 760;
  // το πλάτος (από τη συσκευή) μπαίνει με κλάση· ύψος / κλίμακα / κεντράρισμα αλλάζουν με το μέγεθος του πλαισίου και
  // γράφονται απευθείας στο στοιχείο (CSSOM — το CSP δεν επιτρέπει style attributes στο HTML)
  const inner = useRef<HTMLDivElement>(null);
  const wide = sx({ width: target });
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    el.style.height = `${h}px`;
    el.style.transform = `scale(${scale})`;
    el.style.margin = device === "mobile" && w > target ? "0 auto" : "";
  }, [h, scale, device, w, target]);
  return (
    <div className="@7xl:sticky @7xl:top-44 grid gap-2 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold text-eu-ink-2 text-[length:var(--fs-14)] inline-flex items-center gap-2">Προεπισκόπηση πρόχειρου{saving && <Loader2 className="size-3.5 animate-spin" aria-hidden />}</span>
        <div className="flex gap-1 rounded-full bg-white border border-eu-line p-1" role="radiogroup" aria-label="Συσκευή">
          {(["desktop", "mobile"] as const).map((d) => <button key={d} type="button" role="radio" aria-checked={device === d} onClick={() => setDevice(d)} className={`inline-flex items-center gap-1.5 rounded-full px-3 min-h-10 font-bold text-[length:var(--fs-13)] ${device === d ? "bg-eu-navy text-white" : "text-eu-ink-2"}`}>{d === "desktop" ? <Monitor className="size-4" aria-hidden /> : <Smartphone className="size-4" aria-hidden />}{d === "desktop" ? "Υπολογιστής" : "Κινητό"}</button>)}
        </div>
      </div>
      <div ref={box} className="rounded-2xl border border-eu-line bg-eu-line-2 overflow-hidden h-[max(24rem,calc(100dvh-11rem))]">
        {wide.node}
        <div ref={inner} className={`origin-top-left h-[760px] ${wide.className}`}>
          <iframe ref={frame} onLoad={() => setLoadedV(v)} key={v} title="Προεπισκόπηση σελίδας" src={`${src}${src.includes("?") ? "&" : "?"}v=${v}`} className="block bg-white w-full h-full border-0" />
        </div>
      </div>
      <span className="text-eu-muted text-[length:var(--fs-13)]">Ανανεώνεται μόνη της μετά από κάθε αλλαγή. Οι πελάτες δεν βλέπουν το πρόχειρο.</span>
    </div>
  );
}
