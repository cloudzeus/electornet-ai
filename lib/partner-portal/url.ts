/** Το δημόσιο URL της πύλης για links σε email (PORTAL_URL, π.χ. https://synergaton.dgsmart.gr). Χωρίς εξαρτήσεις από το runtime του Next. */
export function portalUrl(path: string) {
  const base = (process.env.PORTAL_URL ?? `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3111"}/synergaton`).replace(/\/$/, "");
  return base + path;
}
