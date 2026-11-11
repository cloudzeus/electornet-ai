// Πλήρης σάρωση Κωτσόβολου από τη γραμμή εντολών (χειροκίνητη: δεν αγγίζει το firstScanDone, ίδιος ρυθμός με τη νυχτερινή).
// npx tsx --conditions=react-server scripts/competitors-scan.ts --budget 2600 --hours 9 --ai 600 [--limit N]
// Τρέχει μέσα από το runJob του scheduler: ίδιο lock ομάδας «competitors» με τη νυχτερινή, άρα ποτέ δύο σαρώσεις μαζί.
import { db } from "../lib/db";
import { runJob } from "../lib/scheduler";
import { jobByKey } from "../lib/scheduler/jobs";
import { runCompetitorJob } from "../lib/competitors/run";

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); const n = i > 0 ? Number(process.argv[i + 1]) : NaN; return Number.isFinite(n) && n >= 0 ? n : undefined; };

async function main() {
  const base = jobByKey("competitor-kotsovolos");
  if (!base) throw new Error("Δεν βρέθηκε η εργασία competitor-kotsovolos");
  const t0 = Date.now();
  const stamp = () => `${new Date().toLocaleTimeString("el-GR", { timeZone: "Europe/Athens", hour12: false })} +${Math.round((Date.now() - t0) / 60000)}′`;
  const hours = arg("hours");
  const r = await runJob({
    ...base,
    maxMin: Math.max(base.maxMin, Math.ceil((hours ?? 6) * 60) + 15), // το lock δεν πρέπει να λήξει πριν τελειώσει η σάρωση
    run: (trigger) => runCompetitorJob(trigger, {
      budget: arg("budget") || undefined, hours: hours || undefined, aiMax: arg("ai"), limit: arg("limit") || undefined,
      onProgress: (done, total, msg) => console.log(`[${stamp()}] ${done}/${total} · ${msg}`),
    }),
  }, "manual");
  if (!r.ran) { console.log(`τρέχει ήδη: ${r.message}`); return; }
  console.log(`[${stamp()}] ${r.ok ? "OK" : "ΣΦΑΛΜΑ"} · ${r.message}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
