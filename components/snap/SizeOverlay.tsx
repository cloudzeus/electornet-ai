"use client";

import { useState } from "react";
import { Box } from "lucide-react";

type D = { w: number; h: number; d: number };

/** Ορθογώνιο στερεό σε πλάγια προβολή: μπροστινή όψη + πάνω + πλάι (βάθος προς τα πάνω-δεξιά). */
function Solid({ x, y, w, h, dx, dy, kind }: { x: number; y: number; w: number; h: number; dx: number; dy: number; kind: "new" | "old" }) {
  const fill = kind === "new" ? "var(--color-eu-yellow, #ffd400)" : "#ffffff";
  const op = kind === "new" ? [0.42, 0.3, 0.22] : [0.08, 0.05, 0.04];
  const stroke = kind === "new" ? "var(--color-eu-navy, #122a58)" : "#ffffff";
  const dash = kind === "old" ? "6 5" : undefined;
  return (
    <g stroke={stroke} strokeWidth={kind === "new" ? 2.5 : 2} strokeDasharray={dash} strokeLinejoin="round" vectorEffect="non-scaling-stroke">
      <polygon points={`${x},${y} ${x + dx},${y - dy} ${x + w + dx},${y - dy} ${x + w},${y}`} fill={fill} fillOpacity={op[1]} vectorEffect="non-scaling-stroke" />
      <polygon points={`${x + w},${y} ${x + w + dx},${y - dy} ${x + w + dx},${y + h - dy} ${x + w},${y + h}`} fill={fill} fillOpacity={op[2]} vectorEffect="non-scaling-stroke" />
      <rect x={x} y={y} width={w} height={h} fill={fill} fillOpacity={op[0]} vectorEffect="non-scaling-stroke" />
    </g>
  );
}

/**
 * Το νέο προϊόν ως στερεό πάνω στη φωτογραφία της παλιάς, στην ίδια κλίμακα και στο ίδιο «πάτωμα»: φαίνεται αμέσως αν
 * είναι μεγαλύτερο ή μικρότερο. Χωρίς πλαίσιο συσκευής στη φωτογραφία (π.χ. φωτογραφήθηκε μόνο η πινακίδα): τα δύο
 * στερεά δίπλα-δίπλα σε κλίμακα. Μόνο όταν είναι γνωστές οι διαστάσεις και των δύο.
 */
export function SizeOverlay({ photo, box, old, neu, estimate, wall, onAr }: { photo: string | null; box: [number, number, number, number] | null | undefined; old: { w: number | null; h: number | null; d: number | null }; neu: D; estimate: boolean; /** συσκευή τοίχου (κλιματιστικό, τηλεόραση): κεντράρεται στη θέση της παλιάς — αλλιώς πατά στο ίδιο πάτωμα */ wall?: boolean; onAr?: () => void }) {
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  if (!old.w || !old.h) return null;
  const oldD: D = { w: old.w, h: old.h, d: old.d ?? neu.d };
  const label = `${neu.w}×${neu.h}×${neu.d} cm`;
  const footer = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-13)] text-eu-ink-3">
      <span className="inline-flex items-center gap-1.5"><span className="inline-block w-4 h-3 rounded-sm bg-eu-yellow/60 border-2 border-eu-navy" aria-hidden /> Το νέο ({label})</span>
      <span className="inline-flex items-center gap-1.5"><span className="inline-block w-4 h-3 rounded-sm border-2 border-dashed border-eu-muted" aria-hidden /> Η παλιά ({oldD.w}×{oldD.h}{old.d ? `×${old.d}` : ""} cm{estimate ? ", εκτίμηση" : ""})</span>
      {onAr && <button type="button" onClick={onAr} className="ml-auto inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold px-3 min-h-10 hover:bg-eu-navy hover:text-white"><Box className="size-4" aria-hidden /> Δες το στον χώρο σου (AR)</button>}
    </div>
  );

  if (photo && box) {
    const W = nat?.w ?? 1000, H = nat?.h ?? 750;
    const bx = box[0] * W, by = box[1] * H, bw = box[2] * W, bh = box[3] * H;
    // ΜΙΑ κλίμακα (pixels ανά cm) από το πλάτος: σε μετωπική φωτογραφία είναι ίδια οριζόντια και κάθετα, και το πλάτος
    // του πλαισίου είναι πιο αξιόπιστο από το ύψος του
    const k = bw / oldD.w;
    const ow = oldD.w * k, oh = oldD.h * k, nw = neu.w * k, nh = neu.h * k, dx = neu.d * k * 0.3, dy = neu.d * k * 0.18;
    const cx = bx + bw / 2, base = wall ? by + bh / 2 : by + bh;
    const oy = wall ? base - oh / 2 : base - oh, y = wall ? base - nh / 2 : base - nh;
    const x = cx - nw / 2;
    return (
      <figure className="m-0 grid gap-2">
        <div className="relative rounded-2xl overflow-hidden bg-eu-surface">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt="Η παλιά συσκευή" className="block w-full h-auto" onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
          {nat && (
            <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full" aria-hidden>
              <rect x={cx - ow / 2} y={oy} width={ow} height={oh} fill="none" stroke="#fff" strokeWidth={2} strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
              <Solid x={x} y={y} w={nw} h={nh} dx={dx} dy={dy} kind="new" />
            </svg>
          )}
          <span className="absolute left-2 top-2 rounded-full bg-eu-navy/85 text-white font-bold px-2.5 py-1 text-[length:var(--fs-13)]">Το νέο σε κλίμακα, στη θέση της παλιάς</span>
        </div>
        <figcaption>{footer}</figcaption>
      </figure>
    );
  }

  // δίπλα-δίπλα σε κλίμακα, στο ίδιο πάτωμα
  const maxH = Math.max(oldD.h, neu.h) + Math.max(oldD.d, neu.d) * 0.25, scale = 180 / maxH;
  const gap = 40, pad = 16;
  const oW = oldD.w * scale, oH = oldD.h * scale, nW = neu.w * scale, nH = neu.h * scale;
  const floor = 200 + pad;
  const width = pad * 2 + oW + gap + nW + Math.max(oldD.d, neu.d) * scale * 0.35;
  return (
    <figure className="m-0 grid gap-2">
      <div className="rounded-2xl bg-eu-navy p-2">
        <svg viewBox={`0 0 ${width} ${floor + pad}`} className="w-full h-auto max-h-64" aria-hidden>
          <line x1={0} x2={width} y1={floor} y2={floor} stroke="#ffffff" strokeOpacity={0.25} />
          <Solid x={pad} y={floor - oH} w={oW} h={oH} dx={oldD.d * scale * 0.32} dy={oldD.d * scale * 0.2} kind="old" />
          <Solid x={pad + oW + gap} y={floor - nH} w={nW} h={nH} dx={neu.d * scale * 0.32} dy={neu.d * scale * 0.2} kind="new" />
        </svg>
      </div>
      <figcaption>{footer}</figcaption>
    </figure>
  );
}
