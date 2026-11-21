"use client";

import { useEffect, useState } from "react";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/**
 * Countdown to a *real* expiry (Omnibus: no fake timers). Renders the
 * server value first, then ticks on the client. `variant="blocks"` is the
 * big 02·14·38 of the deals rail, `"inline"` the 14:38:02 chip.
 */
export function Countdown({ endsAt, variant = "inline", tone = "light", className = "" }: { endsAt: string; variant?: "inline" | "blocks"; tone?: "light" | "dark"; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // First tick deferred so the server-rendered value paints first.
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  const end = new Date(endsAt).getTime();
  const p = parts(end - (now ?? end));
  const pad = (n: number) => String(n).padStart(2, "0");
  const label = `Απομένουν ${p.d ? `${p.d} ημέρες ` : ""}${p.h} ώρες ${p.m} λεπτά`;

  if (variant === "blocks") {
    const cells: [number, string][] = p.d > 0 ? [[p.d, "ημ."], [p.h, "ώρ."], [p.m, "λεπ."]] : [[p.h, "ώρ."], [p.m, "λεπ."], [p.s, "δευτ."]];
    return (
      <div className={`flex gap-1.5 items-end ${className}`} role="timer" aria-label={label}>
        {cells.map(([v, unit]) => (
          <span key={unit} className={`rounded-md px-2.5 py-2 grid justify-items-center gap-0.5 ${tone === "dark" ? "bg-eu-yellow text-eu-navy" : "bg-eu-navy text-white"}`}>
            <span className="font-extrabold text-[length:var(--fs-17)] leading-none tabular-nums">{pad(v)}</span>
            <span className="font-semibold text-[length:var(--fs-12)] leading-none opacity-75">{unit}</span>
          </span>
        ))}
      </div>
    );
  }
  return (
    <span className={`font-extrabold text-eu-ink bg-eu-surface rounded-md px-2 py-1.5 text-[length:var(--fs-13-5)] tabular-nums ${className}`} role="timer" aria-label={label}>
      {pad(p.h + p.d * 24)}:{pad(p.m)}:{pad(p.s)}
    </span>
  );
}
