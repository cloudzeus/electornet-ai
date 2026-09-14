try { process.loadEnvFile(); } catch {}
import { resolveBrandLogos } from "../lib/brandfetch/brands";
import { db } from "../lib/db";
async function main() {
  const r = await resolveBrandLogos({ limit: Number(process.argv[2]) || 25 });
  console.log(JSON.stringify({ ok: r.ok, scanned: r.scanned, matched: r.matched, unmatched: r.unmatched, remaining: r.remaining, error: r.error }));
  for (const s of r.samples) console.log(`  ${s.name.padEnd(24)} ${s.domain ?? "—"} ${s.score ?? ""}`);
  await db.$disconnect();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
