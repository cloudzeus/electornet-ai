import type { ReactNode } from "react";
import { sx } from "@/components/ui/sx";

/**
 * A4-landscape page of the proposal document. On screen: one card per
 * page on a desk background, scaled to the viewport width (the page is a
 * fixed 1123×794 css-px design box, scaled with a CSS transform so it is
 * pixel-identical on desktop and readable on a phone). In print: one
 * sheet per page, full-bleed, overflow hidden.
 */
export function DocPage({ children, no, tone = "light", label, className = "" }: { children: ReactNode; no: number; tone?: "light" | "dark" | "grey"; label?: string; className?: string }) {
  const bg = tone === "dark" ? "bg-eu-navy text-white" : tone === "grey" ? "bg-eu-surface text-eu-ink" : "bg-white text-eu-ink";
  return (
    <section className="doc-page-wrap" aria-label={label ?? `Σελίδα ${no}`} data-page={no}>
      <div className={`doc-page ${bg} ${className}`}>{children}</div>
    </section>
  );
}

export function PageHead({ title, section, no, tone = "light" }: { title: string; section: string; no: number; tone?: "light" | "dark" }) {
  return (
    <div className={`flex justify-between items-baseline border-b-[3px] border-eu-yellow pb-3 mb-5 ${tone === "dark" ? "text-white" : ""}`}>
      <h2 className="m-0 font-heading font-bold text-[26px] leading-[1.2]">{title}</h2>
      <div className={`font-bold text-[10.5px] tracking-[0.12em] ${tone === "dark" ? "text-eu-on-dark-2" : "text-eu-muted-2"}`}>
        {section} · {String(no).padStart(2, "0")}
      </div>
    </div>
  );
}

export function Kicker({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "yellow" | "red" | "muted" }) {
  const c = { blue: "text-eu-blue", yellow: "text-eu-yellow", red: "text-eu-red", muted: "text-eu-muted-2" }[tone];
  return <div className={`font-extrabold text-[10.5px] tracking-[0.12em] mb-2.5 ${c}`}>{children}</div>;
}

export function Body({ children, className = "", dark = false }: { children: ReactNode; className?: string; dark?: boolean }) {
  return <div className={`text-[12.5px] leading-[1.7] ${dark ? "text-eu-on-dark" : "text-eu-ink-2"} ${className}`}>{children}</div>;
}

export function Callout({ title, children, tone = "grey" }: { title: string; children: ReactNode; tone?: "grey" | "navy" | "blue" | "red" }) {
  const s = {
    grey: "bg-eu-surface text-eu-ink-2",
    navy: "bg-eu-navy text-eu-on-dark",
    blue: "bg-eu-blue text-white",
    red: "bg-eu-surface text-eu-ink-2 border-l-4 border-eu-red",
  }[tone];
  const t = tone === "grey" || tone === "red" ? "text-eu-blue" : "text-eu-yellow";
  return (
    <div className={`p-4 rounded-lg ${s}`}>
      <div className={`font-extrabold text-[10px] tracking-[0.1em] mb-2 ${t}`}>{title}</div>
      <div className="text-[11.5px] leading-[1.6]">{children}</div>
    </div>
  );
}

export function Finding({ no, title, children }: { no: string; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-2 border-b border-eu-line-3 last:border-0">
      <span className="shrink-0 w-[26px] font-extrabold text-eu-red text-[15px] leading-[1.3]">{no}</span>
      <div>
        <div className="font-bold text-[13px] leading-[1.35]">{title}</div>
        <div className="text-eu-muted text-[11.5px] leading-[1.5]">{children}</div>
      </div>
    </div>
  );
}

export function Table({ head, rows, widths, headTone = "navy", dense = false }: { head: string[]; rows: ReactNode[][]; widths?: string[]; headTone?: "navy" | "mixed"; dense?: boolean }) {
  const cell = dense ? "px-2 py-[5px]" : "px-3 py-2";
  return (
    <table className={`w-full border-collapse ${dense ? "text-[10px] leading-[1.35]" : "text-[11.5px] leading-[1.5]"} bg-white rounded-lg overflow-hidden`}>
      <thead>
        <tr>
          {head.map((h, i) => {
            const w = sx({ width: widths?.[i] });
            return (
              <th
                key={h}
                className={`text-left ${dense ? "px-2 py-2" : "px-3 py-2.5"} font-extrabold text-[10px] tracking-[0.05em] text-white ${headTone === "mixed" && i === head.length - 1 ? "bg-eu-blue" : "bg-eu-navy"} ${w.className}`}
              >
                {w.node}
                {h}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} className={`${cell} border-b border-eu-line-2 align-top ${j === 0 ? "font-bold text-eu-ink" : "text-eu-ink-2"}`}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Tag({ children, tone = "navy" }: { children: ReactNode; tone?: "navy" | "blue" | "green" | "red" | "purple" | "yellow" }) {
  const c = {
    navy: "bg-eu-navy text-white",
    blue: "bg-eu-blue text-white",
    green: "bg-eu-green text-white",
    red: "bg-eu-red text-white",
    purple: "bg-eu-purple text-white",
    yellow: "bg-eu-yellow text-eu-navy",
  }[tone];
  return <span className={`inline-block font-extrabold text-[9.5px] tracking-[0.06em] px-2 py-1 rounded-sm ${c}`}>{children}</span>;
}

/** ✓ / ✗ / ~ cell for the feature matrix */
export function Mark({ v }: { v: "yes" | "no" | "partial" | "new" }) {
  const m = {
    yes: ["✓", "text-eu-green"],
    no: ["—", "text-eu-muted-3"],
    partial: ["~", "text-eu-amber"],
    new: ["★", "text-eu-blue"],
  }[v];
  return <span className={`font-extrabold ${m[1]}`}>{m[0]}</span>;
}
