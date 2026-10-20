import "server-only";
import { runAudit } from "./run";
import { sendPendingAlerts } from "./notify";

/**
 * «Τρέξε τώρα» από τη σελίδα «Ασφάλεια»: ένας χειροκίνητος πλήρης έλεγχος τη φορά (κλείδωμα στη διεργασία — διπλό πάτημα,
 * δεύτερη καρτέλα ή δεύτερος διαχειριστής παίρνουν «ήδη τρέχει»). Τρέχει ΟΛΟΥΣ τους ελέγχους (χωρίς `only`), ώστε το report
 * να σημειωθεί πλήρες. Μετά στέλνει τις άμεσες ειδοποιήσεις «ΚΡΙΣΙΜΟ» όπως ο cron (όχι τη σύνοψη — αυτή είναι ξεχωριστό κουμπί).
 * Το κλείδωμα ζει στο globalThis (ίδιο σε server actions και σελίδες, και μετά από HMR στο dev).
 */

type State = { startedAt: Date; by: string };
const KEY = Symbol.for("euronics.security.manualRun");
const g = globalThis as unknown as Record<symbol, State | null | undefined>;
/** Ασφάλεια: ένα κλείδωμα παλαιότερο από 10′ (όλοι οι έλεγχοι έχουν χρονικό όριο ≤ 5′) θεωρείται ξεχασμένο. */
const STALE_MS = 10 * 60_000;

export function manualRunState(now = new Date()): State | null {
  const s = g[KEY];
  return s && now.getTime() - s.startedAt.getTime() < STALE_MS ? s : null;
}

export type ManualRun =
  | { kind: "busy"; startedAt: Date }
  | { kind: "done"; reportId: string; status: string; alerted: boolean };

export async function runManualFull(by: string): Promise<ManualRun> {
  const cur = manualRunState();
  if (cur) return { kind: "busy", startedAt: cur.startedAt };
  const mine: State = { startedAt: new Date(), by };
  g[KEY] = mine;
  try {
    const r = await runAudit("full");
    const alerted = await sendPendingAlerts().then((x) => x.alerted, (e) => { console.error("[security-audit] alerts (manual)", e); return false; });
    return { kind: "done", reportId: r.reportId, status: r.status, alerted };
  } finally {
    if (g[KEY] === mine) g[KEY] = null;
  }
}

const SEND_KEY = Symbol.for("euronics.security.manualSend");
/** Μία «Αποστολή report τώρα» τη φορά (διπλό πάτημα → δεν ξαναστέλνεται). */
export async function withSendLock<T>(fn: () => Promise<T>): Promise<T | "busy"> {
  const s = g[SEND_KEY];
  if (s && Date.now() - s.startedAt.getTime() < 2 * 60_000) return "busy";
  const mine: State = { startedAt: new Date(), by: "" };
  g[SEND_KEY] = mine;
  try { return await fn(); } finally { if (g[SEND_KEY] === mine) g[SEND_KEY] = null; }
}
