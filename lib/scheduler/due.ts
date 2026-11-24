/** Πότε είναι η σειρά μιας αυτόματης εργασίας. Καθαρές συναρτήσεις — χωρίς βάση, για tests. */
export type Schedule = { everyMin: number } | { dailyAt: [hour: number, minute: number] };

const TZ = "Europe/Athens";

/** Η στιγμή «hh:mm ώρα Αθήνας» της ημέρας (Αθήνας) που περιέχει το `ref`. */
export function athensAt(ref: Date, hh: number, mm: number): Date {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(ref).map((x) => [x.type, x.value]));
  // offset της Αθήνας εκείνη τη στιγμή (UTC+2 ή +3)
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  const offsetMin = Math.round((asUtc - Math.floor(ref.getTime() / 60000) * 60000) / 60000);
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, hh, mm) - offsetMin * 60000);
}

export function isDue(s: Schedule, last: Date | null, now: Date): boolean {
  if ("everyMin" in s) return !last || now.getTime() - last.getTime() >= s.everyMin * 60000;
  const slot = athensAt(now, s.dailyAt[0], s.dailyAt[1]);
  return now >= slot && (!last || last < slot);
}

/** Εκτέλεση που ξεπέρασε το `maxMin` της θεωρείται κολλημένη: δεν πιάνει θέση και δεν κρατά την ομάδα της. */
export const isStuck = (startedAt: number, maxMin: number, now: Date) => now.getTime() - startedAt > maxMin * 60000;

/**
 * Ποιες εργασίες ξεκινούν τώρα. Τρέχουν παράλληλα (έως `maxParallel`), ώστε μια αργή ή κολλημένη να μη σταματά τις υπόλοιπες —
 * πριν έτρεχαν η μία μετά την άλλη και μία κολλημένη πάγωνε τιμές, απόθεμα και υπενθυμίσεις για ώρες.
 * Δεν ξεκινά: ό,τι τρέχει ακόμη σε αυτή τη διεργασία (και κολλημένο: όχι δεύτερο αντίγραφο), ό,τι είναι σε παύση,
 * ό,τι δεν είναι η ώρα του, και δεύτερη εργασία ομάδας που ήδη τρέχει. `running`: κλειδί → πότε ξεκίνησε (ms).
 */
export function pickDue<J extends { key: string; group: string; maxMin: number; schedule: Schedule }>(jobs: J[], rows: Map<string, { enabled: boolean; lastStartAt: Date | null }>, running: Map<string, number>, now: Date, maxParallel = 3): J[] {
  const active = jobs.filter((j) => running.has(j.key) && !isStuck(running.get(j.key)!, j.maxMin, now));
  const groups = new Set(active.map((j) => j.group));
  const picked: J[] = [];
  for (const job of jobs) {
    if (active.length + picked.length >= maxParallel) break;
    const row = rows.get(job.key);
    if (running.has(job.key) || (row && !row.enabled) || groups.has(job.group) || !isDue(job.schedule, row?.lastStartAt ?? null, now)) continue;
    groups.add(job.group);
    picked.push(job);
  }
  return picked;
}

export function nextRun(s: Schedule, last: Date | null, now: Date): Date {
  if ("everyMin" in s) return last ? new Date(Math.max(now.getTime(), last.getTime() + s.everyMin * 60000)) : now;
  const today = athensAt(now, s.dailyAt[0], s.dailyAt[1]);
  if (isDue(s, last, now)) return now;
  return now < today ? today : athensAt(new Date(today.getTime() + 26 * 3600000), s.dailyAt[0], s.dailyAt[1]);
}

export function describe(s: Schedule): string {
  if ("everyMin" in s) return s.everyMin % 60 === 0 ? `κάθε ${s.everyMin / 60} ώρ${s.everyMin === 60 ? "α" : "ες"}` : `κάθε ${s.everyMin}′`;
  return `καθημερινά ${String(s.dailyAt[0]).padStart(2, "0")}:${String(s.dailyAt[1]).padStart(2, "0")}`;
}
