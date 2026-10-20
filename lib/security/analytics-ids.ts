/**
 * Τα IDs των pixels (Ρυθμίσεις → «Analytics & pixels») μπαίνουν μέσα σε inline scripts με nonce (components/site/Analytics).
 * Ο έλεγχος μορφής της φόρμας τρέχει μόνο στον browser — εδώ, στον server, κρατάμε μόνο ό,τι αποτελείται από γράμματα,
 * ψηφία, «-» και «_», ώστε ένα ID με « ' » / « " » / «</script>» να μη γίνει κώδικας σε κάθε σελίδα. Άκυρο ID = δεν φορτώνει.
 */
const KEYS = ["ga4", "gtm", "googleAds", "metaPixel", "tiktokPixel", "clarity", "hotjar"] as const;
type Key = (typeof KEYS)[number];
export type CleanAnalyticsIds = Partial<Record<Key, string>> & { consentMode?: boolean };

export function cleanAnalyticsIds(raw: unknown): CleanAnalyticsIds {
  const out: CleanAnalyticsIds = {};
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  for (const k of KEYS) {
    const v = typeof r[k] === "string" ? (r[k] as string).trim() : "";
    if (/^[A-Za-z0-9_-]{1,40}$/.test(v)) out[k] = v;
  }
  if (typeof r.consentMode === "boolean") out.consentMode = r.consentMode;
  return out;
}
