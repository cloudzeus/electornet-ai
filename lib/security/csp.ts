/**
 * Content-Security-Policy των σελίδων (εφαρμόζεται από το proxy.ts με νέο nonce σε κάθε αίτημα — όλες οι σελίδες
 * αποδίδονται δυναμικά, οπότε το nonce δεν κοστίζει cache).
 * - scripts: μόνο όσα έχουν το nonce και όσα φορτώνουν αυτά ('strict-dynamic': GTM, pixels, model-viewer)· χωρίς
 *   'unsafe-inline' / eval σε παραγωγή. Το OCR της κάμερας (tesseract) τρέχει σε worker από το δικό μας domain.
 * - styles: στοιχεία <style> μόνο με nonce· 'unsafe-inline' μόνο για style attributes (style-src-attr), που τα
 *   χρησιμοποιεί το React — δεν εκτελούν κώδικα.
 * - πηγές με ονόματα: βίντεο (Bunny, YouTube, Vimeo), analytics, Google Fonts· εικόνες από οποιοδήποτε https
 *   (φωτογραφίες προϊόντων από πολλούς προμηθευτές, χάρτες, pixels).
 */
const ANALYTICS = [
  "https://*.google-analytics.com", "https://*.analytics.google.com", "https://*.googletagmanager.com", "https://*.g.doubleclick.net", "https://www.google.com",
  "https://*.clarity.ms", "https://c.bing.com", "https://*.facebook.com", "https://*.facebook.net", "https://*.tiktok.com", "https://*.tiktokw.us",
  "https://*.hotjar.com", "https://*.hotjar.io", "wss://*.hotjar.com",
];

export function buildCsp({ nonce, dev }: { nonce: string; dev: boolean }): string {
  const d: [string, ...string[]][] = [
    ["default-src", "'self'"],
    // σε ανάπτυξη το React χρειάζεται eval για τα stack traces· σε παραγωγή όχι
    ["script-src", "'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    // σε ανάπτυξη το Next βάζει styles χωρίς nonce (HMR) — εκεί 'unsafe-inline' (με nonce θα αγνοούνταν)
    ["style-src", "'self'", ...(dev ? ["'unsafe-inline'"] : [`'nonce-${nonce}'`]), "https://fonts.googleapis.com"],
    ["style-src-attr", "'unsafe-inline'"],
    ["img-src", "'self'", "data:", "blob:", "https:"],
    ["font-src", "'self'", "data:", "https://fonts.gstatic.com"],
    ["media-src", "'self'", "blob:", "https://euronics.b-cdn.net", "https://*.b-cdn.net"],
    ["connect-src", "'self'", ...ANALYTICS, ...(dev ? ["ws:", "wss:"] : [])],
    ["frame-src", "'self'", "https://www.youtube.com", "https://www.youtube-nocookie.com", "https://player.vimeo.com", "https://www.googletagmanager.com", "https://td.doubleclick.net"],
    ["worker-src", "'self'", "blob:"],
    ["manifest-src", "'self'"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    // πληρωμές (Viva, Klarna, τράπεζες) επιστρέφουν με φόρμα σε δικά τους domains
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

/**
 * Το iframe με srcDoc (προεπισκοπήσεις email στη διαχείριση) κληρονομεί το CSP της σελίδας: τα <style> του email
 * (media queries, γραμματοσειρά) χρειάζονται το nonce της σελίδας για να εφαρμοστούν.
 */
export function withStyleNonce(html: string, nonce: string | null | undefined): string {
  return nonce ? html.replace(/<style\b/gi, `<style nonce="${nonce.replace(/"/g, "")}"`) : html;
}
