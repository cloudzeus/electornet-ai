// Πλήρης σάρωση Κωτσόβολου από τη γραμμή εντολών (χειροκίνητη: δεν αγγίζει το firstScanDone, ίδιος ρυθμός με τη νυχτερινή).
// npx tsx --conditions=react-server scripts/competitors-scan.ts --budget 2600 --hours 9 --ai 600 [--limit N]
import { db } from "../lib/db";
import { runCompetitorJob } from "../lib/competitors/run";

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); const n = i > 0 ? Number(process.argv[i + 1]) : NaN; return Number.isFinite(n) && n > 0 ? n : undefined; };

async function main() {
  const t0 = Date.now();
  const stamp = () => `${new Date().toLocaleTimeString("el-GR", { timeZone: "Europe/Athens", hour12: false })} +${Math.round((Date.now() - t0) / 60000)}′`;
  const r = await runCompetitorJob("manual", {
    budget: arg("budget"), hours: arg("hours"), aiMax: arg("ai"), limit: arg("limit"),
    onProgress: (done, total, msg) => console.log(`[${stamp()}] ${done}/${total} · ${msg}`),
  });
  console.log(`[${stamp()}] ${r.ok ? "OK" : "ΣΦΑΛΜΑ"} · ${r.message}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
