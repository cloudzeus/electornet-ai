/**
 * Μοντέλο του widget παρακολούθησης — καθαρές συναρτήσεις (ίδιες σε server και browser): στάδια από την κατάσταση της
 * αποστολής, σύνδεσμος στη σελίδα του courier, ετικέτες καταστάσεων.
 */
export interface TimelineCheckpoint { code: string; text: string; at: string | null; shop: string | null }
export interface TimelineStep { key: "created" | "picked" | "out" | "done"; label: string; state: "done" | "current" | "todo" | "problem" }
export interface ShipmentTimeline {
  carrier: string; courier: string; voucher: string; status: string;
  steps: TimelineStep[]; url: string;
  /** νεότερο πρώτο */
  checkpoints: TimelineCheckpoint[];
  createdAt: string; deliveredAt: string | null; checkedAt: string | null; error: string | null;
}

export const trackUrl = (carrier: string, voucher: string) =>
  carrier === "elta" ? `https://www.elta-courier.gr/search?br=${encodeURIComponent(voucher)}` : `https://www.taxydromiki.com/track/${encodeURIComponent(voucher)}`;

export const STATUS_LABEL: Record<string, string> = {
  created: "Εκδόθηκε · περιμένει παραλαβή",
  closed: "Παραδόθηκε στον courier",
  "in-transit": "Σε μεταφορά",
  "out-for-delivery": "Σε διανομή",
  attempted: "Ανεπιτυχής επίδοση",
  "on-hold": "Σε αναμονή παραλαβής",
  returning: "Επιστρέφει",
  returned: "Επεστράφη",
  delivered: "Παραδόθηκε",
  cancelled: "Ακυρώθηκε",
};
export type Tone = "neutral" | "info" | "good" | "warn" | "bad";
export const STATUS_TONE: Record<string, Tone> = {
  created: "warn", closed: "info", "in-transit": "info", "out-for-delivery": "info", attempted: "bad", "on-hold": "warn",
  returning: "bad", returned: "bad", delivered: "good", cancelled: "neutral",
};

/** Τέσσερα στάδια: Εκδόθηκε → Στον courier → Σε διανομή → Παραδόθηκε (ή Επιστροφή). */
export function stepsOf(status: string): TimelineStep[] {
  const back = status === "returning" || status === "returned";
  const rank: Record<string, number> = { created: 0, closed: 1, "in-transit": 1, "on-hold": 2, "out-for-delivery": 2, attempted: 2, returning: 2, delivered: 3, returned: 3 };
  const r = status === "cancelled" ? -1 : rank[status] ?? 0;
  const labels: [TimelineStep["key"], string][] = [["created", "Εκδόθηκε"], ["picked", "Στον courier"], ["out", status === "on-hold" ? "Σε σημείο παραλαβής" : back ? "Επιστροφή" : "Σε διανομή"], ["done", back ? "Στον αποστολέα" : "Παραδόθηκε"]];
  const bad = status === "attempted" || back;
  return labels.map(([key, label], i) => ({
    key, label,
    state: i < r || (i === r && (status === "delivered" || status === "returned")) ? (bad && i >= 2 ? "problem" : "done") : i === r ? (bad ? "problem" : "current") : "todo",
  }));
}
