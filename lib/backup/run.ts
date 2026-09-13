import "server-only";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings/store";

/**
 * Daily database backup: `pg_dump -Fc` (compressed, restorable with
 * pg_restore) → AES-256-CBC with BACKUP_PASSPHRASE (openssl, PBKDF2) →
 * Bunny Storage (a dedicated zone without pull zone, or _backups/ in the
 * media zone) → retention pruning → BackupRun row. Runs from the cron route,
 * the admin button or `scripts/backup-db.ts`.
 */
export interface BackupTarget { host: string; zone: string; password: string; prefix: string; retentionDays: number; dedicated: boolean }

export async function backupTarget(): Promise<BackupTarget> {
  const { data, secrets } = await getSetting("bunny");
  const region = String(data.storageRegion ?? "");
  const host = `https://${region ? `${region}.` : ""}storage.bunnycdn.com`;
  const dedicated = !!String(data.backupZone ?? "").trim();
  const zone = dedicated ? String(data.backupZone).trim() : String(data.storageZone ?? "");
  const password = (dedicated && secrets.backupZonePassword) || secrets.storagePassword || "";
  const base = String(data.basePath ?? "").replace(/^\/|\/$/g, "");
  const prefix = dedicated ? "" : `${base ? `${base}/` : ""}_backups/`;
  return { host, zone, password, prefix, retentionDays: Math.max(1, Number(data.backupRetentionDays) || 30), dedicated };
}

function run(cmd: string, args: string[], input?: Buffer, env?: Record<string, string>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...env } });
    const out: Buffer[] = []; const err: Buffer[] = [];
    p.stdout.on("data", (d: Buffer) => out.push(d));
    p.stderr.on("data", (d: Buffer) => err.push(d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`${cmd} exit ${code}: ${Buffer.concat(err).toString().slice(0, 400)}`))));
    if (input) { p.stdin.on("error", () => {}); p.stdin.end(input); } else p.stdin.end();
  });
}

const dbUrl = () => (process.env.DATABASE_URL ?? "").replace(/[?&]schema=[^&]*/, "").replace(/\?$/, "");
const dbName = () => { try { return new URL(dbUrl()).pathname.replace(/^\//, "") || "db"; } catch { return "db"; } };

export async function runBackup(trigger: "cron" | "manual" | "script" = "cron"): Promise<{ ok: boolean; id: string; path?: string; bytes?: number; encrypted?: boolean; ms: number; error?: string; pruned?: number }> {
  const t0 = Date.now();
  const row = await db.backupRun.create({ data: { trigger } });
  try {
    const target = await backupTarget();
    if (!target.zone || !target.password) throw new Error("Δεν έχει ρυθμιστεί Bunny Storage zone/password (Ρυθμίσεις → Bunny CDN).");
    if (!dbUrl()) throw new Error("DATABASE_URL λείπει.");
    const pass = process.env.BACKUP_PASSPHRASE?.trim();
    const encrypted = !!pass;
    // The media zone is served publicly by the pull zone: a plain dump there would be one guess away from the internet.
    if (!encrypted && !target.dedicated) throw new Error("Χωρίς BACKUP_PASSPHRASE το backup επιτρέπεται μόνο σε αποκλειστικό Backup storage zone (χωρίς pull zone). Όρισε BACKUP_PASSPHRASE στο .env.");
    const pgDump = process.env.PG_DUMP_PATH || "pg_dump";
    let bytes = await run(pgDump, ["-Fc", "--no-owner", "--no-acl", "-d", dbUrl()]);
    if (pass) bytes = await run("openssl", ["enc", "-aes-256-cbc", "-pbkdf2", "-iter", "200000", "-salt", "-pass", "env:BACKUP_PASSPHRASE"], bytes, { BACKUP_PASSPHRASE: pass });
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
    const path = `${target.prefix}${dbName()}-${stamp}-${randomBytes(6).toString("hex")}.dump${encrypted ? ".enc" : ""}`;
    const res = await fetch(`${target.host}/${target.zone}/${path}`, { method: "PUT", headers: { AccessKey: target.password, "Content-Type": "application/octet-stream" }, body: new Uint8Array(bytes) });
    if (!res.ok) throw new Error(`Bunny Storage upload ${res.status}`);
    const ms = Date.now() - t0;
    await db.backupRun.update({ where: { id: row.id }, data: { ok: true, path, zone: target.zone, bytes: bytes.length, sha256, encrypted, ms } });
    const pruned = await prune(target);
    return { ok: true, id: row.id, path, bytes: bytes.length, encrypted, ms, pruned };
  } catch (e) {
    const ms = Date.now() - t0;
    const error = (e as Error).message.slice(0, 500);
    await db.backupRun.update({ where: { id: row.id }, data: { ok: false, error, ms } }).catch(() => null);
    return { ok: false, id: row.id, ms, error };
  }
}

/** Delete backups older than the retention window (keeps at least the 3 newest successful ones). */
async function prune(target: BackupTarget): Promise<number> {
  const since = new Date(Date.now() - target.retentionDays * 86400000);
  const keep = await db.backupRun.findMany({ where: { ok: true, deletedAt: null }, orderBy: { at: "desc" }, take: 3, select: { id: true } });
  const old = await db.backupRun.findMany({ where: { ok: true, deletedAt: null, at: { lt: since }, id: { notIn: keep.map((k) => k.id) } } });
  let n = 0;
  for (const b of old) {
    if (!b.path) continue;
    const res = await fetch(`${target.host}/${b.zone ?? target.zone}/${b.path}`, { method: "DELETE", headers: { AccessKey: target.password } }).catch(() => null);
    if (res && (res.ok || res.status === 404)) { await db.backupRun.update({ where: { id: b.id }, data: { deletedAt: new Date() } }); n++; }
  }
  return n;
}

/** Fetch a backup's bytes from storage (admin download). */
export async function downloadBackup(id: string): Promise<{ bytes: Buffer; filename: string } | null> {
  const b = await db.backupRun.findUnique({ where: { id } });
  if (!b?.ok || !b.path || b.deletedAt) return null;
  const target = await backupTarget();
  const res = await fetch(`${target.host}/${b.zone ?? target.zone}/${b.path}`, { headers: { AccessKey: target.password } });
  if (!res.ok) return null;
  return { bytes: Buffer.from(await res.arrayBuffer()), filename: b.path.split("/").pop() ?? "backup.dump" };
}
