/**
 * Τρέχει τον εντοπισμό λογοτύπων για ΟΛΕΣ τις μάρκες, σε παρτίδες, μέχρι να
 * τελειώσουν. Σέβεται το όριο του Brandfetch (200 αναζητήσεις / 5 λεπτά):
 * η κάθε παρτίδα έχει απόσταση 1,6 s ανά κλήση και μεταξύ παρτίδων περιμένει.
 * Τρέξε: npx tsx --conditions=react-server scripts/resolve-brand-logos.ts
 */
try { process.loadEnvFile(); } catch {}
import { resolveBrandLogos, logoStats } from "../lib/brandfetch/brands";
import { db } from "../lib/db";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  for (let round = 1; round <= 20; round++) {
    const r = await resolveBrandLogos({ limit: 150 });
    const s = await logoStats();
    console.log(`[${new Date().toISOString().slice(11, 19)}] παρτίδα ${round}: +${r.matched} με domain, ${r.unmatched} για έλεγχο${r.error ? ` · ${r.error}` : ""} → σύνολο ${s.withDomain} λογότυπα, ${s.suggested} προτάσεις, ${s.pending} απομένουν`);
    if (!r.ok && r.error?.includes("Όριο")) { await sleep(5 * 60000); continue; }
    if (s.pending === 0) { console.log("ολοκληρώθηκε"); break; }
    await sleep(20000);
  }
  await db.$disconnect();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
