import { isDue, nextRun, describe, type Schedule } from "@/lib/scheduler/due";

/**
 * Πρόγραμμα αυτόματης ενημέρωσης ενός XML feed (πρώτο βήμα του οδηγού): χειροκίνητα, κάθε N λεπτά, ή καθημερινά ΩΩ:ΛΛ.
 * Ποτέ πιο συχνά από το όριο λήψης του προμηθευτή (`minFetchMin`) ούτε από 15′. Καθαρές συναρτήσεις — χωρίς βάση.
 */
export type FeedSchedule = { mode: "manual" } | { mode: "every"; min: number } | { mode: "daily"; at: [number, number] };
export const MANUAL: FeedSchedule = { mode: "manual" };
const FLOOR_MIN = 15;
const MAX_EVERY = 7 * 24 * 60;

export const minEvery = (minFetchMin: number) => Math.max(FLOOR_MIN, Math.floor(minFetchMin) || 0);

export function normSchedule(raw: unknown, minFetchMin: number): FeedSchedule {
  const o = (raw ?? {}) as { mode?: unknown; min?: unknown; at?: unknown };
  if (o.mode === "every") {
    const n = Math.floor(Number(o.min));
    if (!Number.isFinite(n) || n <= 0) return MANUAL;
    return { mode: "every", min: Math.min(MAX_EVERY, Math.max(minEvery(minFetchMin), n)) };
  }
  if (o.mode === "daily" && Array.isArray(o.at) && o.at.length === 2) {
    const [h, m] = o.at.map((x) => Math.floor(Number(x)));
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return { mode: "daily", at: [h, m] };
  }
  return MANUAL;
}

const toSchedule = (s: FeedSchedule): Schedule | null => (s.mode === "every" ? { everyMin: s.min } : s.mode === "daily" ? { dailyAt: s.at } : null);

export const feedDue = (s: FeedSchedule, last: Date | null, now: Date) => { const x = toSchedule(s); return !!x && isDue(x, last, now); };
export const feedNext = (s: FeedSchedule, last: Date | null, now: Date) => { const x = toSchedule(s); return x ? nextRun(x, last, now) : null; };
export const describeSchedule = (s: FeedSchedule) => { const x = toSchedule(s); return x ? describe(x) : "χειροκίνητα"; };
