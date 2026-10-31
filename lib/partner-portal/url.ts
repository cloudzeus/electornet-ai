/**
 * Το δημόσιο URL της πύλης για links σε email (PORTAL_URL, π.χ. https://synergaton.dgsmart.gr). Χωρίς αυτό: <site>/synergaton,
 * με το AUTH_URL όπως τα υπόλοιπα emails (υπάρχει πάντα στην παραγωγή). Χωρίς εξαρτήσεις από το runtime του Next.
 */
export function portalUrl(path: string) {
  const site = (process.env.AUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3111").replace(/\/$/, "");
  const base = (process.env.PORTAL_URL || `${site}/synergaton`).replace(/\/$/, "");
  return base + path;
}
