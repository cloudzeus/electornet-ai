/**
 * Daily database backup → Bunny Storage. Run from crontab / launchd:
 *   0 3 * * *  cd /path/to/app && npx tsx --conditions=react-server scripts/backup-db.ts >> logs/backup.log 2>&1
 * Reads DATABASE_URL, BACKUP_PASSPHRASE (AES-256), PG_DUMP_PATH (optional) from .env.
 */
try { process.loadEnvFile(); } catch { /* env already provided */ }
import { runBackup } from "../lib/backup/run";
import { db } from "../lib/db";

async function main() {
  const r = await runBackup("script");
  console.log(`${new Date().toISOString()} backup ${r.ok ? "OK" : "FAILED"} ${r.path ?? ""} ${r.bytes ? `${(r.bytes / 1024).toFixed(0)} KB` : ""} ${r.encrypted ? "aes-256" : "PLAIN (set BACKUP_PASSPHRASE!)"} ${r.ms} ms${r.pruned ? ` · pruned ${r.pruned}` : ""}${r.error ? ` · ${r.error}` : ""}`);
  await db.$disconnect();
  process.exit(r.ok ? 0 : 1);
}
main();
