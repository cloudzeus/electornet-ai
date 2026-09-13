"use client";

import { useState } from "react";

/**
 * Small SVG chart kit for the back office (no library). Follows the house
 * dataviz rules: one axis, thin marks, 2px lines, ≥8px markers, 2px gaps
 * between fills, legend for ≥2 series, hover tooltip, tabular numbers.
 * Colors: categorical brand order — navy, blue, green, yellow (fills only), muted.
 */
export const SERIES = ["#122A58", "#1D428A", "#1E7B3C", "#F1C400", "#7A8AA8", "#9FB0D3"];

export interface Series { key: string; label: string; values: number[]; color?: string }

const fmt = (v: number, unit: string) => (unit === "€" ? `${v.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : unit === "$" ? `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : `${v.toLocaleString("el-GR")}${unit ? ` ${unit}` : ""}`);
/** every `step`-th label plus the last one, unless the last would collide with the previous shown label */
const showLabel = (i: number, n: number, step: number) => (i === n - 1 ? true : i % step === 0 && n - 1 - i >= Math.ceil(step / 2));
const nice = (max: number) => { if (max <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(max))); const n = max / p; const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10; return step * p; };

export function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="m-0 p-0 list-none flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--fs-13)] font-bold text-eu-ink-2">
      {series.map((s, i) => <li key={s.key} className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm" style={{ background: s.color ?? SERIES[i] }} aria-hidden /> {s.label}</li>)}
    </ul>
  );
}

/** Multi-series line chart with hover crosshair + tooltip. */
export function LineChart({ labels, series, unit = "", height = 220 }: { labels: string[]; series: Series[]; unit?: string; height?: number }) {
  const [hi, setHi] = useState<number | null>(null);
  const W = 720, H = height, padL = 52, padR = 12, padT = 12, padB = 28;
  const max = nice(Math.max(1e-9, ...series.flatMap((s) => s.values)));
  const n = labels.length;
  const x = (i: number) => padL + (n > 1 ? (i * (W - padL - padR)) / (n - 1) : (W - padL - padR) / 2);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const step = Math.max(1, Math.ceil(n / 8));
  return (
    <div className="grid gap-2">
      <Legend series={series} />
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={series.map((s) => s.label).join(", ")} onMouseLeave={() => setHi(null)}>
          {ticks.map((t) => <g key={t}><line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#e6e8ee" strokeWidth={1} /><text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#7a7a7a" style={{ fontVariantNumeric: "tabular-nums" }}>{unit === "€" || unit === "$" ? t.toFixed(t < 1 ? 2 : 0) : t}</text></g>)}
          {labels.map((l, i) => showLabel(i, n, step) && <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="#7a7a7a">{l}</text>)}
          {series.map((s, si) => {
            const c = s.color ?? SERIES[si];
            const d = s.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
            return <g key={s.key}><path d={d} fill="none" stroke={c} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />{s.values.map((v, i) => (hi === i || n <= 12) && <circle key={i} cx={x(i)} cy={y(v)} r={4} fill={c} stroke="#fff" strokeWidth={2} />)}</g>;
          })}
          {hi !== null && <line x1={x(hi)} x2={x(hi)} y1={padT} y2={H - padB} stroke="#122A58" strokeWidth={1} strokeDasharray="3 3" />}
          {labels.map((_, i) => <rect key={i} x={x(i) - (W - padL - padR) / Math.max(1, n - 1) / 2} y={padT} width={(W - padL - padR) / Math.max(1, n - 1)} height={H - padT - padB} fill="transparent" onMouseEnter={() => setHi(i)} />)}
        </svg>
        {hi !== null && (
          <div className="pointer-events-none absolute top-2 rounded-lg bg-eu-navy text-white text-[length:var(--fs-13)] px-3 py-2 shadow-[var(--shadow-overlay)]" style={{ left: `${(x(hi) / W) * 100}%`, transform: x(hi) > W * 0.7 ? "translateX(-105%)" : "translateX(8px)" }}>
            <div className="font-bold">{labels[hi]}</div>
            {series.map((s, i) => <div key={s.key} className="flex items-center gap-1.5 tabular-nums"><span className="size-2.5 rounded-sm" style={{ background: s.color ?? SERIES[i] }} /> {s.label}: <b>{fmt(s.values[hi], unit)}</b></div>)}
          </div>
        )}
      </div>
    </div>
  );
}

/** Stacked (or single) vertical bars, 2px gaps between segments and bars, rounded data-ends. */
export function BarChart({ labels, series, unit = "", height = 220 }: { labels: string[]; series: Series[]; unit?: string; height?: number }) {
  const [hi, setHi] = useState<number | null>(null);
  const W = 720, H = height, padL = 52, padR = 12, padT = 12, padB = 28;
  const n = labels.length;
  const totals = labels.map((_, i) => series.reduce((a, s) => a + (s.values[i] ?? 0), 0));
  const max = nice(Math.max(1e-9, ...totals));
  const slot = (W - padL - padR) / Math.max(1, n);
  const bw = Math.max(4, Math.min(36, slot - 4));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const step = Math.max(1, Math.ceil(n / 8));
  return (
    <div className="grid gap-2">
      <Legend series={series} />
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={series.map((s) => s.label).join(", ")} onMouseLeave={() => setHi(null)}>
          {ticks.map((t) => <g key={t}><line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#e6e8ee" strokeWidth={1} /><text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#7a7a7a" style={{ fontVariantNumeric: "tabular-nums" }}>{unit === "€" || unit === "$" ? t.toFixed(t < 1 ? 2 : 0) : t}</text></g>)}
          {labels.map((l, i) => {
            const cx = padL + slot * i + slot / 2;
            let acc = 0;
            return (
              <g key={i} onMouseEnter={() => setHi(i)}>
                <rect x={padL + slot * i} y={padT} width={slot} height={H - padT - padB} fill={hi === i ? "rgba(18,42,88,0.05)" : "transparent"} />
                {series.map((s, si) => {
                  const v = s.values[i] ?? 0;
                  const y1 = y(acc + v), y0 = y(acc);
                  acc += v;
                  const h = Math.max(0, y0 - y1 - (si ? 2 : 0));
                  const last = si === series.length - 1 || series.slice(si + 1).every((t) => !(t.values[i] ?? 0));
                  return v > 0 ? <rect key={s.key} x={cx - bw / 2} y={y1} width={bw} height={h} fill={s.color ?? SERIES[si]} rx={last ? 4 : 0} /> : null;
                })}
                {showLabel(i, n, step) && <text x={cx} y={H - 8} textAnchor="middle" fontSize={11} fill="#7a7a7a">{l}</text>}
              </g>
            );
          })}
        </svg>
        {hi !== null && (
          <div className="pointer-events-none absolute top-2 rounded-lg bg-eu-navy text-white text-[length:var(--fs-13)] px-3 py-2 shadow-[var(--shadow-overlay)]" style={{ left: `${((padL + slot * hi + slot / 2) / W) * 100}%`, transform: hi > n * 0.7 ? "translateX(-105%)" : "translateX(8px)" }}>
            <div className="font-bold">{labels[hi]}</div>
            {series.map((s, i) => <div key={s.key} className="flex items-center gap-1.5 tabular-nums"><span className="size-2.5 rounded-sm" style={{ background: s.color ?? SERIES[i] }} /> {s.label}: <b>{fmt(s.values[hi] ?? 0, unit)}</b></div>)}
            {series.length > 1 && <div className="mt-0.5 border-t border-white/20 pt-0.5 tabular-nums">Σύνολο: <b>{fmt(totals[hi], unit)}</b></div>}
          </div>
        )}
      </div>
    </div>
  );
}

/** Horizontal ranked bars (e.g. cost per model) with direct value labels. */
export function RankBars({ rows, unit = "" }: { rows: { label: string; value: number; sub?: string }[]; unit?: string }) {
  const max = Math.max(1e-9, ...rows.map((r) => r.value));
  return (
    <ul className="m-0 p-0 list-none grid gap-2">
      {rows.map((r, i) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 items-center text-[length:var(--fs-14)]">
          <div className="min-w-0"><div className="truncate font-bold text-eu-ink font-mono text-[length:var(--fs-13)]">{r.label}</div>{r.sub && <div className="text-eu-muted text-[length:var(--fs-13)]">{r.sub}</div>}</div>
          <div className="tabular-nums font-bold text-eu-ink">{fmt(r.value, unit)}</div>
          <div className="col-span-2 h-2 rounded-full bg-eu-surface overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: SERIES[i % SERIES.length] }} /></div>
        </li>
      ))}
      {!rows.length && <li className="text-eu-muted">Χωρίς δεδομένα.</li>}
    </ul>
  );
}

export function StatTile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? "bg-eu-navy text-white border-eu-navy" : "bg-white border-eu-line"}`}>
      <div className={`font-heading font-extrabold text-[length:var(--fs-28)] leading-none tabular-nums ${accent ? "text-eu-yellow" : "text-eu-navy"}`}>{value}</div>
      <div className={`mt-1 text-[length:var(--fs-14)] ${accent ? "text-white/85" : "text-eu-muted"}`}>{label}</div>
      {sub && <div className={`text-[length:var(--fs-13)] ${accent ? "text-white/70" : "text-eu-muted"}`}>{sub}</div>}
    </div>
  );
}
