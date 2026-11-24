import { db } from "@/lib/db";
import { isStuck, nextRun, pickDue } from "./due";
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

/** Εκτελέσεις αυτής της διεργασίας που δεν έχουν επιστρέψει ακόμη: κλειδί → πότε ξεκίνησαν και αν σημειώθηκαν ήδη ως κολλημένες. */
const inFlight = new Map<string, { at: number; flagged: boolean }>();

let ticking = false;
export async function tick(now = new Date()) {
  if (ticking) return;
  ticking = true;
  try {
    await flagStuck(now);
    const rows = await db.scheduledJob.findMany({ where: { key: { in: JOBS.map((j) => j.key) } } });
    // χωρίς await: κάθε εργασία τρέχει μόνη της και το επόμενο tick δεν την περιμένει
    for (const job of pickDue(JOBS, new Map(rows.map((r) => [r.key, r])), new Map([...inFlight].map(([k, v]) => [k, v.at])), now)) void runJob(job, "cron").catch((e) => console.error(`[scheduler] ${job.key}:`, e));
  } catch (e) {
    console.error("[scheduler] tick:", e);
  } finally {
    ticking = false;
  }
}

/** Εργασία που ξεπέρασε το όριό της: γράφεται μία φορά ως αποτυχία, για να φαίνεται κόκκινη στη σελίδα συγχρονισμών. */
async function flagStuck(now: Date) {
  for (const [key, run] of inFlight) {
    const job = jobByKey(key);
    if (!job || run.flagged || !isStuck(run.at, job.maxMin, now)) continue;
    run.flagged = true;
    const message = `Δεν τελείωσε σε ${job.maxMin}′ και θεωρείται κολλημένη (π.χ. περιμένει κλείδωμα στη βάση ή απάντηση που δεν ήρθε). Οι υπόλοιπες εργασίες συνεχίζουν· αυτή ξανατρέχει μόλις ελευθερωθεί ή μετά από επανεκκίνηση του server.`;
    console.error(`[scheduler] ${key}: ΚΟΛΛΗΣΕ — ${message}`);
    await db.scheduledJob.update({ where: { key }, data: { lastOk: false, lastMessage: message, fails: { increment: 1 } } }).catch(() => {});
  }
}

/** Παίρνει το lock της ομάδας με ατομικό update· null = τρέχει ήδη κάτι της ίδιας ομάδας. Επιστρέφει τη λήξη του, που είναι και η «ταυτότητά» του. */
async function acquire(group: string, maxMin: number) {
  const key = `lock:${group}`, now = new Date(), until = new Date(now.getTime() + maxMin * 60000);
  await db.scheduledJob.upsert({ where: { key }, create: { key, enabled: false }, update: {} });
  const r = await db.scheduledJob.updateMany({ where: { key, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] }, data: { lockedUntil: until } });
  return r.count === 1 ? until : null;
}
/** Μόνο το δικό μας lock: εργασία που ξεκόλλησε αργά δεν ελευθερώνει το lock που πήρε στο μεταξύ άλλη της ίδιας ομάδας. */
const release = (group: string, until: Date) => db.scheduledJob.updateMany({ where: { key: `lock:${group}`, lockedUntil: until }, data: { lockedUntil: null } });

export type RunOutcome = { ran: false; message: string } | { ran: true; ok: boolean; message: string };

export async function runJob(jobOrKey: JobDef | string, trigger: "cron" | "manual"): Promise<RunOutcome> {
  const job = typeof jobOrKey === "string" ? jobByKey(jobOrKey) : jobOrKey;
  if (!job) return { ran: false, message: "Άγνωστη εργασία." };
  // δεύτερο αντίγραφο της ίδιας εργασίας ποτέ: αν το πρώτο κόλλησε σε κλείδωμα της βάσης, το δεύτερο θα κολλούσε δίπλα του και θα έτρωγε συνδέσεις
  if (inFlight.has(job.key)) return { ran: false, message: "Η προηγούμενη εκτέλεση δεν έχει τελειώσει ακόμη." };
  inFlight.set(job.key, { at: Date.now(), flagged: false });
  try {
    return await runLocked(job, trigger);
  } finally {
    inFlight.delete(job.key);
  }
}

async function runLocked(job: JobDef, trigger: "cron" | "manual"): Promise<RunOutcome> {
  const lock = await acquire(job.group, job.maxMin);
  if (!lock) return { ran: false, message: "Τρέχει ήδη εργασία της ίδιας ομάδας — δοκίμασε σε λίγα λεπτά." };
  const startedAt = new Date();
  await db.scheduledJob.upsert({ where: { key: job.key }, create: { key: job.key, lastStartAt: startedAt }, update: { lastStartAt: startedAt } });
  let ok = false, message = "", idle = false;
  try {
    const r = await job.run(trigger);
    ok = r.ok; message = r.message; idle = !!r.idle;
  } catch (e) {
    message = `Απρόσμενο σφάλμα: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    const secs = Math.round((Date.now() - startedAt.getTime()) / 1000);
    message = `${trigger === "manual" ? "Χειροκίνητα · " : ""}${message} (${secs}″)`;
    if (!idle) await db.scheduledJob.update({ where: { key: job.key }, data: { lastEndAt: new Date(), lastOk: ok, lastMessage: message, runs: { increment: 1 }, ...(ok ? {} : { fails: { increment: 1 } }) } }).catch(() => {});
    await release(job.group, lock).catch(() => {});
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
