import { worst, type Severity } from "./rules";
import { asSeverity } from "./notify-core";
import { athens, RUN_META } from "./execute";
import { WATCHER_STALE_MS } from "./checks/watcher-core";
import type { StoredCheck } from "./types";

/**
 * Σελίδα «Ασφάλεια» (/admin/asfaleia) — καθαρή λογική: λωρίδα 90 ημερών, κατάσταση «τώρα», φύλακας. ΚΑΘΑΡΟ αρχείο.
 * Αρχή όπως στους ελέγχους: κανένα ψευδές «όλα καλά» — άγνωστο status → error, έλεγχος που δεν έτρεξε → φαίνεται.
 */

export const HISTORY_DAYS = 90;
/** Ο πλήρης έλεγχος τρέχει μία φορά τη μέρα· πάνω από 26 ώρες χωρίς πλήρη = δεν έτρεξε. */
export const FULL_STALE_MS = 26 * 3_600_000;
/** Ο ωριαίος τρέχει κάθε ώρα· πάνω από 2 ώρες χωρίς = δεν έτρεξε (μία χαμένη εκτέλεση συγχωρείται: deploy). */
export const LIGHT_STALE_MS = 2 * 3_600_000;

const DAY_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit" });
/** «2026-10-20»: η ημέρα σε ώρα Ελλάδας. */
export const athensDay = (d: Date) => DAY_FMT.format(d);

export type DayCell = {
  /** «2026-10-20» */ day: string;
  /** «20/10» */ label: string;
  /** το χειρότερο report της ημέρας· null = κανένας έλεγχος */ status: Severity | null;
  /** το νεότερο report με τη χειρότερη κατάσταση */ reportId: string | null;
  count: number;
};

/** Ημέρες του ημερολογίου (χωρίς ώρες — ανεξάρτητα από αλλαγή ώρας), η τελευταία είναι η σημερινή της Ελλάδας. */
function lastDays(now: Date, n: number): string[] {
  const [y, m, d] = athensDay(now).split("-").map(Number);
  const base = Date.UTC(y, m - 1, d);
  return Array.from({ length: n }, (_, i) => new Date(base - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

/** Λωρίδα ιστορικού: ένα κελί ανά ημέρα (παλαιότερη πρώτη), χρώμα = το χειρότερο report της ημέρας. */
export function dayStrip(reports: { id: string; startedAt: Date; status: unknown }[], now: Date, days = HISTORY_DAYS): DayCell[] {
  const by = new Map<string, { id: string; startedAt: Date; status: Severity }[]>();
  for (const r of reports) {
    const k = athensDay(r.startedAt);
    (by.get(k) ?? by.set(k, []).get(k)!).push({ id: r.id, startedAt: r.startedAt, status: asSeverity(r.status) });
  }
  return lastDays(now, days).map((day) => {
    const rs = by.get(day) ?? [];
    const label = `${day.slice(8, 10)}/${day.slice(5, 7)}`;
    if (!rs.length) return { day, label, status: null, reportId: null, count: 0 };
    const status = worst(rs.map((r) => r.status));
    const pick = rs.filter((r) => r.status === status).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];
    return { day, label, status, reportId: pick.id, count: rs.length };
  });
}

export function stripStats(cells: DayCell[]): Record<Severity | "none", number> {
  const out: Record<Severity | "none", number> = { ok: 0, warn: 0, critical: 0, error: 0, none: 0 };
  for (const c of cells) out[c.status ?? "none"]++;
  return out;
}

/** Ο εξωτερικός φύλακας: never = κανένα σήμα (στο διάστημα που διαβάστηκε), stale = σιωπή πάνω από 26 ώρες. */
export function watcherState(lastPing: Date | null, now: Date): { kind: "never" | "stale" | "ok"; ageMs: number | null } {
  if (!lastPing) return { kind: "never", ageMs: null };
  const ageMs = Math.max(0, now.getTime() - lastPing.getTime());
  return { kind: ageMs > WATCHER_STALE_MS ? "stale" : "ok", ageMs };
}

export type ReportBrief = { startedAt: Date; status: unknown; partial: boolean };
export type Note = { severity: Exclude<Severity, "ok">; text: string };

/**
 * Κατάσταση «τώρα»: η χειρότερη του τελευταίου πλήρους και του ωριαίου που έτρεξε ΜΕΤΑ από αυτόν (ο ωριαίος καλύπτει
 * μέρος των ελέγχων — δεν «καθαρίζει» ένα εύρημα του πλήρους). Σημειώσεις για ό,τι δεν έτρεξε έγκαιρα ή ήταν μερικό.
 */
export function overview({ full, light, now }: { full: ReportBrief | null; light: ReportBrief | null; now: Date }): { status: Severity; notes: Note[] } {
  const notes: Note[] = [];
  const statuses: Severity[] = [];
  if (!full) notes.push({ severity: "error", text: "Δεν υπάρχει ακόμη πλήρης έλεγχος — πατήστε «Τρέξε τώρα» ή περιμένετε τον αυτόματο (07:00)." });
  else {
    statuses.push(asSeverity(full.status));
    if (now.getTime() - full.startedAt.getTime() > FULL_STALE_MS) notes.push({ severity: "error", text: `Ο πλήρης έλεγχος δεν έτρεξε τις τελευταίες 26 ώρες (τελευταίος ${athens(full.startedAt)}).` });
    if (full.partial) notes.push({ severity: "warn", text: "Ο τελευταίος πλήρης έλεγχος ήταν μερικός έλεγχος: κάποιος έλεγχος δεν κάλυψε όλο το διάστημα." });
  }
  if (!light || now.getTime() - light.startedAt.getTime() > LIGHT_STALE_MS) {
    notes.push({ severity: "warn", text: light ? `Ο ωριαίος έλεγχος δεν έτρεξε τις τελευταίες 2 ώρες (τελευταίος ${athens(light.startedAt)}).` : "Δεν υπάρχει ακόμη ωριαίος έλεγχος." });
  }
  if (light && (!full || light.startedAt > full.startedAt)) {
    statuses.push(asSeverity(light.status));
    if (light.partial) notes.push({ severity: "warn", text: "Ο τελευταίος ωριαίος έλεγχος ήταν μερικός έλεγχος." });
  }
  return { status: worst([...statuses, ...notes.map((n) => n.severity)]), notes };
}

export function findingCounts(checks: StoredCheck[]): { critical: number; error: number; warn: number } {
  const out = { critical: 0, error: 0, warn: 0 };
  for (const c of checks) for (const f of c.findings) out[f.severity]++;
  return out;
}

/** Το report έχει το σημάδι «έτρεξαν όλοι οι έλεγχοι του είδους» (RUN_META — εγγραφή χωρίς key, που αλλιώς αγνοείται). */
export function hasRunMarker(checks: unknown): boolean {
  return Array.isArray(checks) && checks.some((c) => !!c && typeof c === "object" && (c as Record<string, unknown>).meta === RUN_META.meta && (c as Record<string, unknown>).allChecks === true);
}
