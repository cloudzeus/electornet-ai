import { statusOf, type Finding, type Severity } from "../rules";

/**
 * Πιστοποιητικό TLS του site — καθαρή λογική. Το I/O (cert.ts) συνδέεται με node:tls στο host:443 (με SNI) και δίνει
 * τα στοιχεία του πιστοποιητικού που παρουσιάζει ο server (μέσω Cloudflare: το πιστοποιητικό της άκρης του Cloudflare).
 *   critical: λήγει σε < 7 ημέρες / έληξε · μη έγκυρο (ο browser θα το απέρριπτε)
 *   warn: λήγει σε < 21 ημέρες
 */

export const CERT_CRIT_DAYS = 7;
export const CERT_WARN_DAYS = 21;
const DAY = 86_400_000;

export type CertInfo = {
  host: string;
  /** valid_to / valid_from όπως τα δίνει το node:tls («Jan 10 12:00:00 2027 GMT») */
  validTo: string;
  validFrom?: string;
  /** εκδότης: O / CN */
  issuer: string;
  subject?: string;
  /** αν ο έλεγχος αλυσίδας + ονόματος πέτυχε (όπως σε browser) */
  authorized: boolean;
  authError?: string | null;
};

const fmt = (d: Date) => d.toISOString().slice(0, 10);

export function certOutcome(c: CertInfo, now: Date): { status: Severity; summary: string; findings: Finding[] } {
  const findings: Finding[] = [];
  const to = new Date(c.validTo);
  if (Number.isNaN(to.getTime())) {
    findings.push({ severity: "error", title: "Άγνωστη ημερομηνία λήξης πιστοποιητικού", detail: `Ο server έδωσε valid_to «${c.validTo}» που δεν αναγνωρίζεται.`, evidence: c.host });
    return { status: statusOf(findings), summary: `Πιστοποιητικό του ${c.host} από ${c.issuer} — η λήξη δεν διαβάστηκε.`, findings };
  }
  const days = Math.floor((to.getTime() - now.getTime()) / DAY);
  if (days < 0) findings.push({ severity: "critical", title: "Το πιστοποιητικό έχει λήξει", detail: `Έληξε στις ${fmt(to)} — οι browsers δείχνουν προειδοποίηση ασφαλείας στους επισκέπτες. Εκδότης: ${c.issuer}.`, evidence: `${c.host} · λήξη ${fmt(to)}` });
  else if (days < CERT_CRIT_DAYS) findings.push({ severity: "critical", title: `Το πιστοποιητικό λήγει σε λιγότερο από ${CERT_CRIT_DAYS} ημέρες`, detail: `Λήγει στις ${fmt(to)} (σε ${days} ημέρες). Εκδότης: ${c.issuer}. Ελέγξτε την αυτόματη ανανέωση (Cloudflare → SSL/TLS → Edge Certificates).`, evidence: `${c.host} · λήξη ${fmt(to)}` });
  else if (days < CERT_WARN_DAYS) findings.push({ severity: "warn", title: `Το πιστοποιητικό λήγει σε λιγότερο από ${CERT_WARN_DAYS} ημέρες`, detail: `Λήγει στις ${fmt(to)} (σε ${days} ημέρες). Εκδότης: ${c.issuer}. Συνήθως ανανεώνεται αυτόματα — αν πλησιάσει τις ${CERT_CRIT_DAYS} ημέρες, ελέγξτε το Cloudflare.`, evidence: `${c.host} · λήξη ${fmt(to)}` });
  // ένα εύρημα για τη λήξη αρκεί: «έληξε» δεν χρειάζεται και «μη έγκυρο» (CERT_HAS_EXPIRED)
  if (!c.authorized && !(days < 0 && /expired/i.test(c.authError ?? ""))) {
    findings.push({ severity: "critical", title: "Μη έγκυρο πιστοποιητικό", detail: `Ο έλεγχος του πιστοποιητικού απέτυχε όπως θα αποτύγχανε σε browser: ${c.authError ?? "άγνωστος λόγος"}. Εκδότης: ${c.issuer}${c.subject ? `, για ${c.subject}` : ""}.`, evidence: `${c.host} · ${c.authError ?? "unauthorized"}` });
  }
  const from = c.validFrom ? new Date(c.validFrom) : null;
  const summary = `Πιστοποιητικό του ${c.host}: εκδότης ${c.issuer}${from && !Number.isNaN(from.getTime()) ? `, ισχύει από ${fmt(from)}` : ""} έως ${fmt(to)} (${days < 0 ? `έληξε πριν από ${-days} ημέρες` : `${days} ημέρες ακόμη`})· ${c.authorized ? "έγκυρο (αλυσίδα και όνομα)" : `ΜΗ έγκυρο: ${c.authError ?? "άγνωστος λόγος"}`}`;
  return { status: statusOf(findings), summary, findings };
}

/** «Google Trust Services (WE1)» από τα πεδία O / CN του εκδότη. */
export function issuerName(issuer: Record<string, string | string[] | undefined> | undefined): string {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || "";
  const o = one(issuer?.O), cn = one(issuer?.CN);
  return o && cn && o !== cn ? `${o} (${cn})` : o || cn || "άγνωστος εκδότης";
}
