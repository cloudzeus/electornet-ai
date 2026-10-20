import { newOrigins, type Finding } from "../rules";
import { athens, athensHour } from "../execute";

/**
 * Συνδέσεις στη διαχείριση (LoginEvent method = "admin") — καθαρή λογική. Λογαριασμός = το email που δοκιμάστηκε (σε πεζά).
 * «Γνωστή» IP / χώρα / συσκευή = όσα είχε ο ίδιος λογαριασμός σε ΕΠΙΤΥΧΕΙΣ συνδέσεις των 90 ημερών πριν από το παράθυρο.
 *
 * Η χώρα δεν καταγράφεται πάντα (σήμερα ποτέ): τότε ο έλεγχος γίνεται ανά IP και το λέει η σύνοψη.
 *   Critical: επιτυχία από νέα χώρα (μόνο όταν υπάρχει χώρα) · > 20 αποτυχίες σε μία ώρα σε υπαρκτό λογαριασμό ·
 *             επιτυχία μετά από ≥ 5 αποτυχίες του ίδιου λογαριασμού μέσα σε μία ώρα (πιθανό μάντεμα κωδικού).
 *   Warn: νέα IP (ισχυρότερη διατύπωση όταν είναι νέα και η συσκευή/browser) · σύνδεση 23:00–07:00 ώρα Ελλάδας ·
 *         > 20 αποτυχίες/ώρα σε ανύπαρκτο λογαριασμό ή από μία IP σε πολλούς λογαριασμούς.
 */

export type LoginRow = { staffId: string | null; email: string; success: boolean; reason: string | null; ip: string | null; country: string | null; userAgent: string | null; os: string | null; browser: string | null; at: Date };

export const FAIL_BURST = 20;
export const GUESS_FAILS = 5;
const HOUR = 3_600_000;

const OS: [RegExp, string][] = [[/iphone|ipad|ipod|\bios\b/i, "iOS"], [/android/i, "Android"], [/cros|chrome ?os/i, "ChromeOS"], [/windows/i, "Windows"], [/mac ?os|macintosh/i, "macOS"], [/linux|ubuntu|fedora/i, "Linux"]];
const BROWSER: [RegExp, string][] = [[/\bedg(?:e|a|ios)?\//i, "Edge"], [/^edge\b/i, "Edge"], [/\bopr\/|opera/i, "Opera"], [/firefox|fxios/i, "Firefox"], [/samsungbrowser/i, "Samsung Internet"], [/chrome|crios|chromium/i, "Chrome"], [/safari/i, "Safari"]];
const pick = (rules: [RegExp, string][], ...src: (string | null)[]) => { for (const s of src) if (s) for (const [re, n] of rules) if (re.test(s)) return n; return null; };

/** «Windows / Chrome» — οικογένεια λειτουργικού και browser (όχι εκδόσεις), από τα πεδία os/browser ή το user agent. */
export function uaFamily(r: { userAgent: string | null; os: string | null; browser: string | null }): string | null {
  const os = pick(OS, r.os, r.userAgent);
  const br = pick(BROWSER, r.browser, r.userAgent);
  return os || br ? `${os ?? "?"} / ${br ?? "?"}` : null;
}

const acct = (r: LoginRow) => r.email.trim().toLowerCase();
const byTime = (a: LoginRow, b: LoginRow) => a.at.getTime() - b.at.getTime();

/** Μεγαλύτερο πλήθος γεγονότων σε κυλιόμενη ώρα, μόνο για παράθυρα που τελειώνουν μέσα στο διάστημα ελέγχου. */
function burst(rows: LoginRow[], since: Date): { n: number; end: Date | null; ips: Set<string> } {
  let best = { n: 0, end: null as Date | null, ips: new Set<string>() };
  for (let i = 0, j = 0; j < rows.length; j++) {
    while (rows[j].at.getTime() - rows[i].at.getTime() > HOUR) i++;
    if (rows[j].at >= since && j - i + 1 > best.n) best = { n: j - i + 1, end: rows[j].at, ips: new Set(rows.slice(i, j + 1).map((r) => r.ip ?? "χωρίς IP")) };
  }
  return best;
}

export function classifyLogins(input: { since: Date; events: LoginRow[]; staffEmails: string[] }): Finding[] {
  const { since } = input;
  const events = [...input.events].sort(byTime);
  const staffEmails = new Set(input.staffEmails.map((e) => e.trim().toLowerCase()));
  const ok = events.filter((e) => e.success);
  const okBefore = ok.filter((e) => e.at < since), okRecent = ok.filter((e) => e.at >= since);
  const out: Finding[] = [];

  // γνωστές IP / συσκευές ανά λογαριασμό
  const knownIps = new Map<string, Set<string>>(), knownFam = new Map<string, Set<string>>();
  const put = (m: Map<string, Set<string>>, k: string, v: string | null) => { if (!v) return; if (!m.has(k)) m.set(k, new Set()); m.get(k)!.add(v); };
  for (const e of okBefore) { put(knownIps, acct(e), e.ip); put(knownFam, acct(e), uaFamily(e)); }

  // 1) νέα χώρα / νέα IP (μόνο επιτυχείς)
  const L = (e: LoginRow) => ({ staffId: acct(e), ip: e.ip, country: e.country, at: e.at });
  for (const o of newOrigins(okBefore.map(L), okRecent.map(L))) {
    const e = okRecent.find((r) => acct(r) === o.staffId && r.ip === o.ip && (r.country ?? null) === (o.country ?? null)) ?? okRecent.find((r) => acct(r) === o.staffId && r.ip === o.ip)!;
    const fam = uaFamily(e);
    const first = !knownIps.has(o.staffId) && !okBefore.some((r) => acct(r) === o.staffId);
    const where = `${o.staffId} · ${o.ip ?? "χωρίς IP"}`;
    const when = `στις ${athens(e.at)} από ${o.ip ?? "άγνωστη IP"}${o.country ? ` (${o.country})` : ""}, ${fam ?? "άγνωστη συσκευή"}`;
    const ctx = first ? " Πρώτη επιτυχής σύνδεση του λογαριασμού στις 90 ημέρες — δεν υπάρχει ιστορικό για σύγκριση." : "";
    if (o.newCountry) { out.push({ severity: "critical", title: "Επιτυχής σύνδεση από νέα χώρα", detail: `Ο ${o.staffId} συνδέθηκε ${when}· η χώρα δεν εμφανίζεται στις συνδέσεις του των 90 ημερών.${ctx}`, evidence: `${where} · ${o.country}` }); continue; }
    const newFam = !!fam && !knownFam.get(o.staffId)?.has(fam);
    if (newFam && !first) out.push({ severity: "warn", title: "Σύνδεση από νέα IP και νέα συσκευή/browser", detail: `Ο ${o.staffId} συνδέθηκε ${when}· ούτε η IP ούτε ο συνδυασμός λειτουργικού/browser εμφανίζονται στις συνδέσεις του των 90 ημερών. Επιβεβαιώστε με τον κάτοχο ότι ήταν ο ίδιος.`, evidence: where });
    else out.push({ severity: "warn", title: "Σύνδεση από νέα IP", detail: `Ο ${o.staffId} συνδέθηκε ${when}· η IP δεν εμφανίζεται στις συνδέσεις του των 90 ημερών.${ctx}`, evidence: where });
  }

  // 2) εκρήξεις αποτυχιών ανά λογαριασμό και ανά IP
  const fails = events.filter((e) => !e.success);
  const group = (key: (e: LoginRow) => string | null) => { const m = new Map<string, LoginRow[]>(); for (const e of fails) { const k = key(e); if (!k) continue; if (!m.has(k)) m.set(k, []); m.get(k)!.push(e); } return m; };
  for (const [k, rows] of group(acct)) {
    const b = burst(rows, since);
    if (b.n <= FAIL_BURST) continue;
    const real = staffEmails.has(k) || rows.some((r) => r.staffId);
    out.push({
      severity: real ? "critical" : "warn",
      title: real ? "Πολλές αποτυχημένες συνδέσεις σε λογαριασμό διαχείρισης" : "Πολλές αποτυχημένες συνδέσεις σε ανύπαρκτο λογαριασμό",
      detail: `${b.n} αποτυχίες μέσα σε μία ώρα (έως ${athens(b.end!)}) από ${b.ips.size} IP: ${[...b.ips].slice(0, 5).join(", ")}${b.ips.size > 5 ? "…" : ""}.${real ? " Πιθανή προσπάθεια εύρεσης κωδικού." : " Ο λογαριασμός δεν υπάρχει — δεν κινδυνεύει, αλλά δείχνει σάρωση."}`,
      evidence: k,
    });
  }
  for (const [ip, rows] of group((e) => e.ip)) {
    const b = burst(rows, since);
    if (b.n <= FAIL_BURST) continue;
    const accts = new Set(rows.map(acct));
    if (accts.size < 2) continue; // ένας λογαριασμός: καλύπτεται παραπάνω
    out.push({ severity: "warn", title: "Πολλές αποτυχημένες συνδέσεις από μία IP", detail: `${b.n} αποτυχίες μέσα σε μία ώρα (έως ${athens(b.end!)}) από την ${ip}, σε ${accts.size} λογαριασμούς.`, evidence: ip });
  }

  // 3) επιτυχία αμέσως μετά από αποτυχίες του ίδιου λογαριασμού
  for (const s of okRecent) {
    const k = acct(s);
    const prevOk = ok.filter((r) => acct(r) === k && r.at < s.at).at(-1)?.at.getTime() ?? -Infinity;
    const from = Math.max(prevOk, s.at.getTime() - HOUR);
    const before = fails.filter((f) => acct(f) === k && f.at.getTime() > from && f.at <= s.at);
    if (before.length < GUESS_FAILS) continue;
    const known = !!s.ip && !!knownIps.get(k)?.has(s.ip);
    const ips = [...new Set(before.map((f) => f.ip ?? "χωρίς IP"))];
    out.push({
      severity: "critical",
      title: `Επιτυχής σύνδεση μετά από ${GUESS_FAILS}+ αποτυχίες`,
      detail: `Ο ${k} συνδέθηκε στις ${athens(s.at)} από ${s.ip ?? "άγνωστη IP"} (${known ? "γνωστή IP του λογαριασμού" : "IP που δεν είχε χρησιμοποιήσει"}) μετά από ${before.length} αποτυχίες μέσα σε μία ώρα (IP: ${ips.slice(0, 5).join(", ")}). Πιθανό μάντεμα κωδικού — επιβεβαιώστε με τον κάτοχο ότι ήταν ο ίδιος.`,
      evidence: `${k} · ${s.ip ?? "χωρίς IP"}`,
    });
  }

  // 4) εκτός ωραρίου (ώρα Ελλάδας)
  const night = new Map<string, LoginRow[]>();
  for (const s of okRecent) { const h = athensHour(s.at); if (h >= 23 || h < 7) { const k = acct(s); if (!night.has(k)) night.set(k, []); night.get(k)!.push(s); } }
  for (const [k, rows] of night) out.push({ severity: "warn", title: "Σύνδεση εκτός ωραρίου (23:00–07:00)", detail: `Ο ${k} συνδέθηκε ${rows.map((r) => `${athens(r.at)} από ${r.ip ?? "άγνωστη IP"}`).join(", ")}.`, evidence: k });
  return out;
}

export function loginsSummary(input: { since: Date; events: LoginRow[] }): string {
  const recent = input.events.filter((e) => e.at >= input.since);
  const okN = recent.filter((e) => e.success).length, failN = recent.length - okN;
  const accts = new Set(recent.map(acct)).size, ips = new Set(recent.map((e) => e.ip).filter(Boolean)).size;
  const hist = input.events.filter((e) => e.success && e.at < input.since).length;
  const noCountry = !input.events.some((e) => e.country?.trim());
  return [
    `${okN} επιτυχείς και ${failN} αποτυχημένες συνδέσεις διαχείρισης από ${athens(input.since)} (${accts} λογαριασμοί, ${ips} IP)`,
    `ιστορικό 90 ημερών: ${hist} επιτυχείς συνδέσεις για σύγκριση IP/συσκευών`,
    ...(noCountry ? ["Δεν καταγράφεται χώρα — ο έλεγχος γίνεται ανά IP"] : []),
  ].join(" · ");
}
