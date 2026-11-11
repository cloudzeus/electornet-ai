"use client";
// 30 ημέρες, δύο βηματικές γραμμές (κάθε τιμή ισχύει ώσπου να αλλάξει): εμείς και Κωτσόβολος. Ένας άξονας (€).
import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import { chartData, eur, type HistPoint } from "@/lib/competitors/badge";

// Επικυρωμένο ζεύγος (dataviz validator: CVD ΔE 24, contrast ≥ 3:1): μπλε = εμείς, πορτοκαλί = Κωτσόβολος.
const OURS = "var(--eu-blue-light)", THEIRS = "#c2691c";
const W = 600, H = 200;
const day = (t: number) => new Date(t).toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit" });

export function CompetitorChart({ history, now }: { history: HistPoint[]; now: number }) {
  const c = chartData(history, now);
  const [hover, setHover] = useState<number | null>(null);
  const tableId = useId();
  if (!c) return (
    <div data-help="kotsovolos-chart" className="grid place-items-center gap-1 rounded-xl border border-dashed border-eu-line bg-eu-surface px-4 py-8 text-center text-[length:var(--fs-14)] text-eu-ink-3">
      <p className="m-0 font-bold text-eu-ink">Δεν υπάρχει ακόμη μέτρηση</p>
      <p className="m-0">Γεμίζει από τον νυχτερινό έλεγχο μόλις βρεθεί τιμή στον Κωτσόβολο.</p>
    </div>
  );
  const x = (t: number) => ((t - c.from) / Math.max(1, c.to - c.from)) * W;
  const y = (v: number) => H - ((v - c.min) / (c.max - c.min)) * H;
  const step = (k: "ours" | "theirs") => {
    const pts = c.points.filter((p) => p[k] != null);
    if (!pts.length) return "";
    let d = `M${x(pts[0].t)},${y(pts[0][k]!)}`;
    for (const p of pts.slice(1)) d += ` H${x(p.t)} V${y(p[k]!)}`;
    return d + ` H${W}`;
  };
  const lastOf = (k: "ours" | "theirs") => [...c.points].reverse().find((p) => p[k] != null)?.[k] ?? null;
  const ticks = [c.max, (c.max + c.min) / 2, c.min].map((v) => Math.round(v));
  // ποια μέτρηση ισχύει σε μια θέση: η τελευταία πριν από αυτήν
  const at = (i: number) => c.points[Math.max(0, Math.min(c.points.length - 1, i))];
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = c.from + ((e.clientX - r.left) / r.width) * (c.to - c.from);
    let i = -1;
    c.points.forEach((p, j) => { if (p.t <= t) i = j; });
    setHover(i < 0 ? null : i);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") setHover((h) => Math.min(c.points.length - 1, (h ?? -1) + 1));
    else if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? c.points.length) - 1));
    else if (e.key === "Escape") setHover(null);
    else return;
    e.preventDefault();
  };
  const h = hover != null ? at(hover) : null;
  const theirsNow = lastOf("theirs"), oursNow = lastOf("ours");

  return (
    <div data-help="kotsovolos-chart" className="grid gap-2 min-w-0">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--fs-13)] font-bold text-eu-ink-2">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: OURS }} aria-hidden />Εμείς{oursNow != null && <span className="font-normal text-eu-ink-3 tabular-nums">{eur(oursNow)}</span>}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: THEIRS }} aria-hidden />Κωτσόβολος{theirsNow != null && <span className="font-normal text-eu-ink-3 tabular-nums">{eur(theirsNow)}</span>}</span>
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        <div className="flex flex-col justify-between py-0 text-right text-[length:var(--fs-11)] text-eu-muted tabular-nums h-48" aria-hidden>
          {ticks.map((t, i) => <span key={i} className="leading-none">{t.toLocaleString("el-GR")} €</span>)}
        </div>
        <div role="img" tabIndex={0} aria-describedby={tableId}
          aria-label={`Γράφημα 30 ημερών: εμείς ${oursNow != null ? eur(oursNow) : "—"}, Κωτσόβολος ${theirsNow != null ? eur(theirsNow) : "—"}. Βέλη αριστερά/δεξιά για κάθε μέτρηση.`}
          className="relative h-48 min-w-0 cursor-crosshair touch-pan-y rounded outline-none focus-visible:ring-2 focus-visible:ring-eu-blue"
          onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} onKeyDown={onKey} onBlur={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
            {[0, H / 2, H].map((g) => <line key={g} x1={0} x2={W} y1={g} y2={g} stroke="var(--eu-line-2)" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
            <path d={step("ours")} fill="none" stroke={OURS} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            <path d={step("theirs")} fill="none" stroke={THEIRS} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            {h && <line x1={x(h.t)} x2={x(h.t)} y1={0} y2={H} stroke="var(--eu-muted)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
          </svg>
          {/* τελείες στο τέλος: HTML ώστε να μένουν στρογγυλές παρά το preserveAspectRatio="none" */}
          {(["ours", "theirs"] as const).map((k) => { const v = lastOf(k); return v == null ? null : <span key={k} aria-hidden className="absolute right-0 size-2.5 -translate-y-1/2 translate-x-1/2 rounded-full ring-2 ring-white" style={{ top: `${(y(v) / H) * 100}%`, background: k === "ours" ? OURS : THEIRS }} />; })}
          {h && (
            <div aria-live="polite" className={`pointer-events-none absolute top-1 z-10 grid gap-0.5 rounded-lg border border-eu-line bg-white px-2.5 py-1.5 text-[length:var(--fs-12)] shadow-[var(--shadow-raised)] tabular-nums whitespace-nowrap ${x(h.t) > W / 2 ? "-translate-x-full" : ""}`}
              style={{ left: `calc(${(x(h.t) / W) * 100}% ${x(h.t) > W / 2 ? "- 8px" : "+ 8px"})` }}>
              <span className="font-bold text-eu-ink">από {day(h.t)}</span>
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded" style={{ background: OURS }} />Εμείς <b className="ml-auto pl-2">{h.ours != null ? eur(h.ours) : "—"}</b></span>
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded" style={{ background: THEIRS }} />Κωτσόβολος <b className="ml-auto pl-2">{h.theirs != null ? eur(h.theirs) : "—"}</b></span>
            </div>
          )}
        </div>
        <span />
        <div className="flex justify-between pt-1 text-[length:var(--fs-11)] text-eu-muted tabular-nums" aria-hidden><span>{day(c.from)}</span><span>σήμερα</span></div>
      </div>
      <details className="text-[length:var(--fs-13)]">
        <summary className="inline-flex min-h-11 md:min-h-8 cursor-pointer items-center font-bold text-eu-blue">Οι μετρήσεις σε πίνακα</summary>
        <table id={tableId} className="mt-1 w-full text-left tabular-nums">
          <thead className="text-eu-muted"><tr><th className="py-1 font-semibold">Από</th><th className="py-1 text-right font-semibold">Εμείς</th><th className="py-1 text-right font-semibold">Κωτσόβολος</th></tr></thead>
          <tbody>{[...c.points].reverse().map((p) => <tr key={p.t} className="border-t border-eu-line-2"><td className="py-1">{day(p.t)}</td><td className="py-1 text-right">{p.ours != null ? eur(p.ours) : "—"}</td><td className="py-1 text-right">{p.theirs != null ? eur(p.theirs) : "—"}</td></tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}
