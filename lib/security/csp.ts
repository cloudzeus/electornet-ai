/**
 * Content-Security-Policy των σελίδων (εφαρμόζεται από το proxy.ts με νέο nonce σε κάθε αίτημα — όλες οι σελίδες
 * αποδίδονται δυναμικά, οπότε το nonce δεν κοστίζει cache).
 * - scripts: μόνο όσα έχουν το nonce και όσα φορτώνουν αυτά ('strict-dynamic': GTM, pixels, model-viewer)· χωρίς
 *   'unsafe-inline' / eval σε παραγωγή. Το OCR της κάμερας (tesseract) τρέχει σε worker από το δικό μας domain.
 * - styles: μόνο αρχεία CSS και <style> με nonce· κανένα style attribute σε παραγωγή — τα inline styles των components
 *   γίνονται κλάσεις μέσω `sx()` (components/ui/sx.tsx), το next/image μέσω app/globals.css.
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
    // style attributes: σε ανάπτυξη επιτρέπονται (εργαλεία του Next)· σε παραγωγή όχι — τα inline styles γίνονται κλάσεις
    // με <style nonce> (components/ui/sx.tsx)
    ...(dev ? ([["style-src-attr", "'unsafe-inline'"]] as [string, ...string[]][]) : []),
    ["img-src", "'self'", "data:", "blob:", "https:"],
    ["font-src", "'self'", "data:", "https://fonts.gstatic.com"],
    ["media-src", "'self'", "blob:", "https://euronics.b-cdn.net", "https://*.b-cdn.net"],
    ["connect-src", "'self'", ...ANALYTICS, ...(dev ? ["ws:", "wss:"] : [])],
    ["frame-src", "'self'", "https://www.youtube.com", "https://www.youtube-nocookie.com", "https://player.vimeo.com", "https://www.googletagmanager.com", "https://td.doubleclick.net"],
    ["worker-src", "'self'", "blob:"],
    ["manifest-src", "'self'"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    // πληρωμές (Viva, Klarna, τράπεζες) επιστρέφουν με φόρμα σε δικά τους domains. Συνειδητά ευρύ (όχι λίστα hosts):
    // τα 3-D Secure / ACS των τραπεζών αλλάζουν και δεν είναι γνωστά εκ των προτέρων. Η προστασία από ένεση φόρμας
    // είναι το script-src με nonce + το escaping του περιεχομένου (jsonLd, safeNext) — όχι αυτή η οδηγία.
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
