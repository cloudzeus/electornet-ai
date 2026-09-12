import type { EnergyClass } from "@/lib/data/types";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("energyChip");

const COLORS: Record<string, string> = {
  "A+++": "#0f7a3a",
  "A++": "#1e8a3c",
  "A+": "#2f9a3e",
  A: "#2f9a3e",
  B: "#4f9a2f",
  C: "#a9b92b",
  D: "#f2d023",
  E: "#f0a21b",
  F: "#ea6a1c",
  G: "#e63422",
};

/** EU 2017/1369 / EPREL: class chip + product fiche link on every online display, not just the PDP. */
export function EnergyChip({ cls, fiche, compact = false }: { cls: EnergyClass; fiche: string; compact?: boolean }) {
  return (
    <>
      <span
        className="text-white font-extrabold text-[length:var(--fs-13)] px-1.5 py-1 rounded-sm"
        style={{ background: COLORS[cls] ?? "#4f9a2f", color: cls === "D" ? "#1a1a1a" : "#fff" }}
        aria-label={`Ενεργειακή κλάση ${cls}`}
      >
        {cls}
      </span>
      {!compact && (
        <a href={fiche} className="bg-white border border-eu-line text-eu-muted font-semibold text-[length:var(--fs-12)] px-1.5 py-1 rounded-sm hover:text-eu-blue">
          {c.deltio_proiontos}
        </a>
      )}
    </>
  );
}
