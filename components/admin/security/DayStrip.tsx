import Link from "next/link";
import type { DayCell } from "@/lib/security/audit/view";
import { stripStats } from "@/lib/security/audit/view";
import { SEVERITY_LABEL } from "@/lib/security/audit/notify-core";
import type { Severity } from "@/lib/security/audit/rules";
import { SEV_FILL, SEV_ICON } from "./Severity";

const ORDER: (Severity | "none")[] = ["ok", "warn", "critical", "error", "none"];
const LEGEND: Record<Severity | "none", string> = { ...SEVERITY_LABEL, none: "δεν έτρεξε" };

/**
 * Λωρίδα 90 ημερών: ένα κελί ανά ημέρα με το χρώμα του χειρότερου report της (+ εικονίδιο, όχι μόνο χρώμα) — πάτημα →
 * εκείνο το report. Γκρι = κανένας έλεγχος. 10 στήλες σε κινητό (κελιά ≥ 28px), 15 σε tablet, 30 (≈ ένας μήνας ανά σειρά)
 * σε υπολογιστή. Κείμενο με τα πλήθη για αναγνώστες οθόνης και για όποιον δεν ξεχωρίζει χρώματα.
 */
export function DayStrip({ cells }: { cells: DayCell[] }) {
  const stats = stripStats(cells);
  const first = cells[0];
  const last = cells.at(-1);
  return (
    <div className="grid gap-3 min-w-0">
      <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">
        {first && last && <>Από {first.label} έως {last.label}: </>}
        {ORDER.filter((k) => stats[k]).map((k, i) => <span key={k}>{i ? " · " : ""}<b className="text-eu-ink">{stats[k]}</b> {k === "none" ? "ημέρες χωρίς έλεγχο" : LEGEND[k]}</span>)}
      </p>
      <ol className="m-0 p-0 list-none grid grid-cols-10 @xl:grid-cols-15 @4xl:grid-cols-30 gap-1" aria-label="Ιστορικό 90 ημερών, μία ημέρα ανά κελί">
        {cells.map((c) => {
          const Icon = c.status && c.status !== "ok" ? SEV_ICON[c.status] : null;
          const text = `${c.label}: ${c.status ? `${SEVERITY_LABEL[c.status]} (${c.count} ${c.count === 1 ? "έλεγχος" : "έλεγχοι"})` : "δεν έτρεξε έλεγχος"}`;
          const cls = `flex items-center justify-center aspect-square min-h-7 rounded-md ${SEV_FILL[c.status ?? "none"]}`;
          return (
            <li key={c.day} className="min-w-0">
              {c.reportId ? (
                <Link href={`/admin/asfaleia/${c.reportId}`} title={text} aria-label={text} className={`${cls} hover:ring-2 hover:ring-eu-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-eu-blue`}>
                  {Icon && <Icon className="size-3.5 text-white" aria-hidden />}
                </Link>
              ) : (
                <span title={text} aria-label={text} role="img" className={cls} />
              )}
            </li>
          );
        })}
      </ol>
      <ul className="m-0 p-0 list-none flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--fs-13)] text-eu-ink-3" aria-label="Υπόμνημα">
        {ORDER.map((k) => (
          <li key={k} className="inline-flex items-center gap-1.5"><span className={`inline-block size-3 rounded-sm ${SEV_FILL[k]}`} aria-hidden />{LEGEND[k]}</li>
        ))}
      </ul>
    </div>
  );
}
