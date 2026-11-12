// Ρυθμιστής κλήσεων προς τον Κωτσόβολο (Global Constraints): μία κλήση τη φορά, τυχαίες παύσεις, διαλείμματα, όριο, παράθυρο, φρένο.
export class KotStopError extends Error {
  constructor(public reason: "blocked" | "errors" | "budget" | "window", msg?: string) { super(msg ?? reason); }
}

type Opts = { budget: number; until: Date; rand?: () => number; sleep?: (ms: number) => Promise<void>; now?: () => Date };
const MAX_RETRY_AFTER_S = 600;

export function createPacer(o: Opts) {
  const rand = o.rand ?? Math.random, now = o.now ?? (() => new Date());
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const between = (a: number, b: number) => a + rand() * (b - a);
  let used = 0, sinceBreak = 0, nextBreak = Math.floor(between(80, 121)), slow = false;
  let errRun = 0, blockedOnce = false, sumMs = 0, n = 0;
  const closed = () => { if (now() >= o.until) throw new KotStopError("window"); };

  return {
    get used() { return used; },
    async wait() {
      if (used >= o.budget) throw new KotStopError("budget");
      closed();
      if (used > 0) {
        if (sinceBreak >= nextBreak) { sinceBreak = 0; nextBreak = Math.floor(between(80, 121)); await sleep(between(60000, 120000)); }
        else await sleep(slow ? between(6000, 14000) : between(3000, 7000));
        closed();
      }
      used++; sinceBreak++;
    },
    async record(r: { status: number; ms: number; retryAfterS?: number }) {
      slow = n > 0 && r.ms > 3 * (sumMs / n);
      sumMs += r.ms; n++;
      if ([429, 403, 503].includes(r.status)) {
        const s = r.retryAfterS ?? 60;
        if (blockedOnce || s > MAX_RETRY_AFTER_S) throw new KotStopError("blocked", `HTTP ${r.status}`);
        blockedOnce = true;
        await sleep(s * 1000);
        return;
      }
      if (r.status === 0 || r.status >= 500) { if (++errRun >= 3) throw new KotStopError("errors"); }
      else errRun = 0;
    },
  };
}
export type Pacer = ReturnType<typeof createPacer>;
