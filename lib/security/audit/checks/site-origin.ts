import { getSetting } from "@/lib/settings/store";

/**
 * Το δημόσιο URL ΑΥΤΗΣ της εφαρμογής (όχι το «Βασικό URL» των ρυθμίσεων: αυτό είναι το site του πελάτη, που όσο το
 * euronics.gr δείχνει το παλιό site διαφέρει). Σειρά: SECURITY_SITE_URL → AUTH_URL (αν είναι δημόσιο https) →
 * Ρυθμίσεις → Email → «Base URL εικόνων emails» (πού τρέχει η εφαρμογή) → το live site. Η πηγή γράφεται στη σύνοψη.
 */
export const LIVE_SITE = "https://euronics.dgsoft.gr";
/** Χρονικό όριο ανάγνωσης βάσης/ρυθμίσεων μέσα στους ελέγχους (η βάση μπορεί να μην απαντά — ο έλεγχος συνεχίζει). */
export const DB_MS = 8_000;

export const withTimeout = <T>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${what}: δεν απάντησε σε ${ms / 1000}″`)), ms).unref?.())]);

const publicHttps = (u: unknown): string | null => {
  if (typeof u !== "string" || !u.trim()) return null;
  try {
    const x = new URL(u.trim());
    if (x.protocol !== "https:" || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(x.hostname) || x.hostname.endsWith(".localhost")) return null;
    return x.origin;
  } catch { return null; }
};

/** `fallback`: η ενσωματωμένη προεπιλογή (ο έλεγχος site το δίνει ως warn εύρημα). */
export async function siteOrigin(): Promise<{ origin: string; source: string; fallback?: boolean }> {
  const env = publicHttps(process.env.SECURITY_SITE_URL);
  if (env) return { origin: env, source: "SECURITY_SITE_URL" };
  const auth = publicHttps(process.env.AUTH_URL);
  if (auth) return { origin: auth, source: "AUTH_URL" };
  const email = await withTimeout(getSetting("email"), DB_MS, "Ρυθμίσεις").then((s) => publicHttps(s.data.emailAssetUrl), () => null);
  if (email) return { origin: email, source: "Ρυθμίσεις → Email → Base URL εικόνων" };
  return { origin: LIVE_SITE, source: "προεπιλογή (live site)", fallback: true };
}
