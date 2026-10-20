import { athensDateTime } from "../notify-core";
import { statusOf, type Finding, type Severity } from "../rules";

/**
 * Ο εξωτερικός φύλακας (GitHub Actions) από τη μεριά της εφαρμογής — καθαρή λογική. Κάθε υπογεγραμμένη κλήση του
 * heartbeat γράφει `security.watch.ping` στο ιστορικό ενεργειών (το πολύ μία ανά 10′). Ο φύλακας τρέχει κάθε ώρα και
 * καθημερινά· σιωπή πάνω από 26 ώρες σημαίνει ότι σταμάτησε (απενεργοποιημένο schedule, λάθος μυστικό, χαλασμένο workflow).
 */
export const WATCHER_STALE_MS = 26 * 3_600_000;

export function watcherOutcome(lastPing: Date | null, now: Date): { status: Severity; summary: string; findings: Finding[] } {
  const findings: Finding[] = [];
  const hint = "Ελέγξτε στο GitHub (Actions → security-watch) ότι το workflow τρέχει: τα schedules σε δημόσια repos απενεργοποιούνται μετά από 60 ημέρες χωρίς δραστηριότητα, και το SECURITY_WATCH_SECRET πρέπει να είναι ίδιο σε GitHub και Coolify.";
  if (!lastPing) {
    findings.push({ severity: "warn", title: "Ο εξωτερικός φύλακας δεν έχει επικοινωνήσει (κανένα σήμα τις τελευταίες 30 ημέρες)", detail: `Δεν υπάρχει καμία υπογεγραμμένη κλήση του heartbeat. ${hint}`, evidence: "watcher never" });
  } else if (now.getTime() - lastPing.getTime() > WATCHER_STALE_MS) {
    findings.push({ severity: "warn", title: `Ο εξωτερικός φύλακας δεν έχει επικοινωνήσει από ${athensDateTime(lastPing)}`, detail: `Τελευταίο σήμα πριν από ${Math.floor((now.getTime() - lastPing.getTime()) / 3_600_000)} ώρες (όριο 26). ${hint}`, evidence: "watcher stale" });
  }
  const summary = lastPing ? `Τελευταίο σήμα του εξωτερικού φύλακα: ${athensDateTime(lastPing)} (ώρα Ελλάδας, πριν από ${Math.max(0, Math.round((now.getTime() - lastPing.getTime()) / 60_000))}′)` : "Τελευταίο σήμα του εξωτερικού φύλακα: κανένα τις τελευταίες 30 ημέρες";
  return { status: statusOf(findings), summary, findings };
}
