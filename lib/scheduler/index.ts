import { db } from "@/lib/db";
import { isDue, nextRun } from "./due";
import { JOBS, jobByKey, type JobDef } from "./jobs";

/**
 * Εσωτερικός scheduler: ξεκινά από το instrumentation.ts στον Node server και κάθε λεπτό τρέχει ό,τι είναι η σειρά του.
 * Το lock ζει στη βάση (ScheduledJob, γραμμή «lock:<ομάδα>»), άρα δύο servers ή ένα επανεκκινημένο container δεν διπλοτρέχουν
 * την ίδια εργασία· lock που έμεινε από server που έπεσε λήγει μόνο του μετά το `maxMin`.
 * Ενεργός στην παραγωγή· αλλού μόνο με `SCHEDULER=on`. `SCHEDULER=off` τον κλείνει παντού.
 */
export function schedulerEnabled() {
  const v = process.env.SCHEDULER;
  return v === "on" || (v !== "off" && process.env.NODE_ENV === "production");
}

const g = globalThis as unknown as { __euScheduler?: NodeJS.Timeout };

export function startScheduler() {
  if (g.__euScheduler || !schedulerEnabled()) return;
  console.log("[scheduler] ενεργός:", JOBS.map((j) => j.key).join(", "));
  // πρώτος έλεγχος 2′ μετά την εκκίνηση, ώστε να μη βαραίνει το boot
  setTimeout(() => void tick(), 120_000).unref();
  g.__euScheduler = setInterval(() => void tick(), 60_000);
  g.__euScheduler.unref();
}

let ticking = false;
export async function tick(now = new Date()) {
  if (ticking) return;
  ticking = true;
  try {
    const rows = await db.scheduledJob.findMany({ where: { key: { in: JOBS.map((j) => j.key) } } });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    for (const job of JOBS) {
      const row = byKey.get(job.key);
      if (row && !row.enabled) continue;
      if (!isDue(job.schedule, row?.lastStartAt ?? null, now)) continue;
      await runJob(job, "cron");
    }
  } catch (e) {
    console.error("[scheduler] tick:", e);
  } finally {
    ticking = false;
  }
}

/** Παίρνει το lock της ομάδας με ατομικό update· false = τρέχει ήδη κάτι της ίδιας ομάδας. */
async function acquire(group: string, maxMin: number) {
  const key = `lock:${group}`, now = new Date(), until = new Date(now.getTime() + maxMin * 60000);
  await db.scheduledJob.upsert({ where: { key }, create: { key, enabled: false }, update: {} });
  const r = await db.scheduledJob.updateMany({ where: { key, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] }, data: { lockedUntil: until } });
  return r.count === 1;
}
const release = (group: string) => db.scheduledJob.update({ where: { key: `lock:${group}` }, data: { lockedUntil: null } });

export type RunOutcome = { ran: false; message: string } | { ran: true; ok: boolean; message: string };

export async function runJob(jobOrKey: JobDef | string, trigger: "cron" | "manual"): Promise<RunOutcome> {
  const job = typeof jobOrKey === "string" ? jobByKey(jobOrKey) : jobOrKey;
  if (!job) return { ran: false, message: "Άγνωστη εργασία." };
  if (!(await acquire(job.group, job.maxMin))) return { ran: false, message: "Τρέχει ήδη εργασία της ίδιας ομάδας — δοκίμασε σε λίγα λεπτά." };
  const startedAt = new Date();
  await db.scheduledJob.upsert({ where: { key: job.key }, create: { key: job.key, lastStartAt: startedAt }, update: { lastStartAt: startedAt } });
  let ok = false, message = "", idle = false;
  try {
    const r = await job.run();
    ok = r.ok; message = r.message; idle = !!r.idle;
  } catch (e) {
    message = `Απρόσμενο σφάλμα: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    const secs = Math.round((Date.now() - startedAt.getTime()) / 1000);
    message = `${trigger === "manual" ? "Χειροκίνητα · " : ""}${message} (${secs}″)`;
    if (!idle) await db.scheduledJob.update({ where: { key: job.key }, data: { lastEndAt: new Date(), lastOk: ok, lastMessage: message, runs: { increment: 1 }, ...(ok ? {} : { fails: { increment: 1 } }) } }).catch(() => {});
    await release(job.group).catch(() => {});
  }
  if (!idle) console.log(`[scheduler] ${job.key}: ${ok ? "OK" : "ΣΦΑΛΜΑ"} — ${message}`);
  return { ran: true, ok, message };
}

/** Για τη σελίδα συγχρονισμών: κατάσταση κάθε εργασίας + πότε θα ξανατρέξει. */
export async function jobStatus(now = new Date()) {
  const rows = await db.scheduledJob.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return JOBS.map((j) => {
    const row = byKey.get(j.key), lock = byKey.get(`lock:${j.group}`);
    const running = !!(row?.lastStartAt && (!row.lastEndAt || row.lastEndAt < row.lastStartAt) && lock?.lockedUntil && lock.lockedUntil > now);
    return { key: j.key, label: j.label, schedule: j.schedule, enabled: row?.enabled ?? true, running, lastStartAt: row?.lastStartAt ?? null, lastEndAt: row?.lastEndAt ?? null, lastOk: row?.lastOk ?? null, lastMessage: row?.lastMessage ?? null, runs: row?.runs ?? 0, fails: row?.fails ?? 0, next: nextRun(j.schedule, row?.lastStartAt ?? null, now) };
  });
}

export async function setJobEnabled(key: string, enabled: boolean) {
  if (!jobByKey(key)) throw new Error("Άγνωστη εργασία");
  await db.scheduledJob.upsert({ where: { key }, create: { key, enabled }, update: { enabled } });
}
