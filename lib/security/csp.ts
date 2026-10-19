/**
 * Content-Security-Policy των σελίδων (εφαρμόζεται από το proxy.ts με νέο nonce σε κάθε αίτημα — όλες οι σελίδες
 * αποδίδονται δυναμικά, οπότε το nonce δεν κοστίζει cache). Scripts: μόνο όσα έχουν το nonce και όσα φορτώνουν αυτά
 * ('strict-dynamic': GTM, pixels, model-viewer)· χωρίς 'unsafe-inline' / 'unsafe-eval' σε παραγωγή. Εικόνες, βίντεο,
 * iframes (YouTube/Vimeo, χάρτες) και κλήσεις μόνο μέσω https.
 */
export function buildCsp({ nonce, dev }: { nonce: string; dev: boolean }): string {
  const d: [string, ...string[]][] = [
    ["default-src", "'self'"],
    // σε ανάπτυξη το React χρειάζεται eval για τα stack traces· σε παραγωγή όχι. Αν ποτέ τα μοντέλα AR αποκτήσουν
    // συμπίεση draco/ktx2, το model-viewer θα θέλει 'wasm-unsafe-eval'.
    ["script-src", "'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    // inline style attributes (React / Tailwind) και η γραμματοσειρά των emails στις προεπισκοπήσεις
    ["style-src", "'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    ["img-src", "'self'", "data:", "blob:", "https:"],
    ["font-src", "'self'", "data:", "https:"],
    ["media-src", "'self'", "blob:", "https:"],
    ["connect-src", "'self'", "https:", ...(dev ? ["ws:", "wss:"] : [])],
    ["frame-src", "'self'", "https:"],
    ["worker-src", "'self'", "blob:"],
    ["manifest-src", "'self'"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'", "https:"],
    ["frame-ancestors", "'self'"],
  ];
  return [...d.map((x) => x.join(" ")), ...(dev ? [] : ["upgrade-insecure-requests"])].join("; ");
}

/** Σε ποια αιτήματα μπαίνει: σελίδες. Όχι API, στατικά αρχεία, εικόνες/μοντέλα, ούτε η προβολή newsletter (έχει δικό της). */
export function appliesCsp(pathname: string): boolean {
  if (/^\/(api|_next)\//.test(pathname) || pathname.startsWith("/newsletter/v/")) return false;
  return !/\.[a-z0-9]{2,5}$/i.test(pathname);
}
