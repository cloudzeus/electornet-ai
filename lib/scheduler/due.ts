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
