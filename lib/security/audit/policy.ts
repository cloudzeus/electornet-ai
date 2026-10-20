/**
 * Πολιτική του ελέγχου ασφαλείας: τι επιτρέπεται να φορτώνει / να εμφανίζεται στο site. Ένα σημείο, κοινό για τον
 * εσωτερικό έλεγχο (εφαρμογή) και τον εξωτερικό φύλακα (scripts/security-watch.ts) — γι' αυτό ΚΑΘΑΡΟ αρχείο: κανένα
 * import (ούτε Node, ούτε prisma, ούτε server-only).
 *
 * Hosts: ταιριάζουν ακριβώς ή ως υποτομέας («googletagmanager.com» → και «www.googletagmanager.com»), ΠΟΤΕ με startsWith
 * («googletagmanager.com.evil.example» δεν περνά).
 */

/** Τα κλειδιά των pixels στις Ρυθμίσεις → «Analytics & pixels» (lib/security/analytics-ids.ts). */
export type AnalyticsKey = "ga4" | "gtm" | "googleAds" | "metaPixel" | "tiktokPixel" | "clarity" | "hotjar";

/**
 * Hosts από τους οποίους επιτρέπεται `<script src>` στο HTML — ΜΟΝΟ όταν το αντίστοιχο pixel είναι ρυθμισμένο
 * (`allowedScriptHosts`). Ό,τι φορτώνουν δυναμικά αυτά ('strict-dynamic') δεν φαίνεται στο HTML και δεν ελέγχεται εδώ.
 */
export const ALLOWED_SCRIPT_HOSTS: Readonly<Record<AnalyticsKey, readonly string[]>> = {
  ga4: ["googletagmanager.com", "google-analytics.com"],
  googleAds: ["googletagmanager.com"],
  gtm: ["googletagmanager.com"],
  metaPixel: ["connect.facebook.net"],
  tiktokPixel: ["analytics.tiktok.com"],
  clarity: ["clarity.ms"],
  hotjar: ["static.hotjar.com"],
};

/** Οι επιτρεπτοί script hosts για τα pixels που έχουν (μη κενό) ID στις ρυθμίσεις. */
export function allowedScriptHosts(ids: Partial<Record<string, unknown>>): string[] {
  const out = new Set<string>();
  for (const [k, hosts] of Object.entries(ALLOWED_SCRIPT_HOSTS)) {
    const v = ids[k];
    if (typeof v === "string" ? v.trim() : v) hosts.forEach((h) => out.add(h));
  }
  return [...out];
}

/** Hosts επιτρεπτών iframes (ίδιοι με το frame-src του CSP — lib/security/csp.ts). */
export const ALLOWED_FRAME_HOSTS: readonly string[] = ["youtube.com", "youtube-nocookie.com", "player.vimeo.com", "googletagmanager.com", "td.doubleclick.net"];

/**
 * Επιπλέον hosts iframe που δέχεται ΜΟΝΟ η σάρωση περιεχομένου (scanContent: περιγραφές ERP, CMS κ.λπ.) — ΟΧΙ το CSP του
 * site (frame-src) και ΟΧΙ η σάρωση σελίδων (scanPage). Βίντεο προϊόντων Groupe SEB (SEB / Tefal / Rowenta…) στις
 * περιγραφές SoftOne (longDesc): https://dam.groupeseb.com/…mp4.
 */
export const CONTENT_FRAME_HOSTS: readonly string[] = ["dam.groupeseb.com"];

/**
 * Διαδρομές `/cdn-cgi/…` (λειτουργίες του Cloudflare που προσθέτουν δικά τους scripts στις σελίδες μας: Zaraz, Rocket
 * Loader, Email Obfuscation, JS detections κ.λπ.) που επιτρέπονται — ως προθέματα διαδρομής. ΚΕΝΗ: δεν χρησιμοποιούμε
 * καμία. Η επίθεση του 10/2026 μπήκε ακριβώς έτσι (Cloudflare Zaraz «Custom HTML» → /cdn-cgi/zaraz/s.js, με δικό του
 * nonce στο CSP μας), οπότε ό,τι εμφανιστεί κάτω από /cdn-cgi/ είναι critical μέχρι να εγκριθεί ρητά εδώ.
 */
export const ALLOWED_CDN_CGI: readonly string[] = [];

/**
 * Bunny Storage: αρχεία επικίνδυνου τύπου (σελίδες, σενάρια, εκτελέσιμα, .zip) που ΠΡΟΥΠΗΡΧΑΝ στη ζώνη και ελέγχθηκαν ως
 * νόμιμα — ΑΚΡΙΒΕΙΣ διαδρομές μέσα στη ζώνη (όπως τις γράφει το εύρημα, π.χ. «legacy/manual.zip»). Σωπαίνουν μόνο το
 * εύρημα «παλαιότερα επικίνδυνα αρχεία»· αν ένα τέτοιο αρχείο αλλάξει, είναι ξανά κρίσιμο. ΚΕΝΗ μέχρι να εγκριθεί κάτι ρητά.
 */
export const BUNNY_ALLOWED: readonly string[] = [];

/**
 * Δείκτες ClickFix / συγκαλυμμένου κώδικα. Είδη:
 * - `strong`: δεν εμφανίζονται ποτέ σε νόμιμο περιεχόμενο ή κώδικά μας → critical από μόνοι τους.
 * - `keys`: συντόμευση πληκτρολογίου (Win+R, Ctrl+V…)· `tool`: όνομα εργαλείου (PowerShell, Windows Terminal)· `lure`:
 *   φράση του ψεύτικου CAPTCHA («I'm not a robot»). Μόνοι τους → warn (περιγραφές λογισμικού/πληκτρολογίων). Critical:
 *   συντόμευση μαζί με εργαλείο ή φράση δολώματος, το ζεύγος του δολώματος Win+R + Ctrl+V, ή φράση δολώματος + εργαλείο.
 *   Ένα πληκτρολόγιο με «Win+X, Ctrl+C / Ctrl+V, Win+D» μένει warn.
 * Για HTML σελίδων, περιεχόμενο και inline scripts — ΟΧΙ για bundles JS (εκεί υπάρχουν νόμιμα new Function / fetch).
 * Τα \b εμποδίζουν τυχαία ταιριάσματα μέσα σε base64 (εικόνες data:).
 */
export type MarkerKind = "strong" | "keys" | "tool" | "lure";
export type Marker = { label: string; kind: MarkerKind; re: RegExp };

export const CLICKFIX_MARKERS: readonly Marker[] = [
  { label: "mshta", kind: "strong", re: /\bmshta(?:\.exe)?\b/i },
  { label: "εντολή powershell (-enc / -w hidden / iex / download)", kind: "strong", re: /\bpowershell(?:\.exe)?\b[^<\n]{0,120}?(?:\s-(?:e|ec|enc|encodedcommand|w|windowstyle|nop|noprofile|ep|executionpolicy)\b|\biex\b|\binvoke-(?:expression|webrequest|restmethod)\b|\biwr\b|\birm\b|downloadstring|frombase64string)/i },
  { label: "«verify you are human»", kind: "strong", re: /\bverify\s+(?:that\s+)?you(?:\s+are|'re|’re)\s+(?:a\s+)?human\b/i },
  { label: "«Performing security verification» (εκτός γνήσιας σελίδας ελέγχου του Cloudflare)", kind: "strong", re: /\bperforming\s+security\s+verification\b/i },
  { label: "«επαληθεύστε ότι είστε άνθρωπος»", kind: "strong", re: /επαλ[ηή]θε[υύ]σ(?:τε|ε|η)\s+(?:ότι|πως)\s+(?:είστε|είσαι)\s+άνθρωπ/iu },
  { label: "CapEmbed (ψεύτικο CAPTCHA)", kind: "strong", re: /\bCapEmbed\b/ },
  { label: "localStorage.getItem('verified')", kind: "strong", re: /localStorage\s*\.\s*getItem\s*\(\s*\\?["'`]verified\\?["'`]\s*\)/ },
  { label: "πίνακας char codes → String.fromCharCode", kind: "strong", re: /\[\s*\d{2,3}(?:\s*,\s*\d{2,3}){20,}\s*\]\s*\.\s*map\s*\(/ },
  { label: "String.fromCharCode με πολλά char codes", kind: "strong", re: /String\s*\.\s*fromCharCode\s*\(\s*\d{2,3}(?:\s*,\s*\d{2,3}){20,}/ },
  { label: "διπλό base64 (atob(atob(…)))", kind: "strong", re: /\batob\s*\(\s*atob\s*\(/ },
  { label: "new Function( μαζί με fetch(", kind: "strong", re: /^(?=[\s\S]*\bnew\s+Function\s*\()(?=[\s\S]*\bfetch\s*\()/ },
  { label: "posthoganalytics.com (διακομιστής της επίθεσης — όχι το PostHog)", kind: "strong", re: /\bposthoganalytics\.com\b/i },
  { label: "Win+R", kind: "keys", re: /\bwin(?:dows)?(?:\s*key)?\s*\+\s*r\b/i },
  { label: "Win+X", kind: "keys", re: /\bwin(?:dows)?(?:\s*key)?\s*\+\s*x\b/i },
  { label: "Ctrl+V", kind: "keys", re: /\bctrl\s*\+\s*v\b/i },
  { label: "«I'm not a robot» / «δεν είμαι ρομπότ»", kind: "lure", re: /\bI(?:'|’)?\s*a?m\s+not\s+a\s+robot\b|δεν\s+είμαι\s+ρομπότ/iu },
  { label: "powershell", kind: "tool", re: /\bpowershell\b/i },
  { label: "Windows Terminal", kind: "tool", re: /\bwindows\s+terminal\b/i },
  { label: "cmd /c", kind: "tool", re: /\bcmd(?:\.exe)?\s+\/c\b/i },
];

/** Ολόκληρη λέξη και στα ελληνικά (το \b της JS δεν ξέρει ελληνικά γράμματα). */
const word = (alts: string) => new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${alts})(?![\\p{L}\\p{N}])`, "iu");

/** Spam (ελληνικά + αγγλικά) → warn. Ένεση SEO spam σε περιγραφές/σελίδες, όχι εκτέλεση κώδικα. */
export const SPAM_MARKERS: readonly { label: string; re: RegExp }[] = [
  { label: "casino / καζίνο", re: word("casinos?|καζ[ίι]νο|sportsbook|online\\s+betting|στοιχηματικ\\p{L}*") },
  { label: "φάρμακα (viagra, cialis…)", re: word("viagra|cialis|levitra|tramadol|online\\s+pharmacy|φαρμακε[ίι]ο\\s+online") },
  { label: "crypto", re: word("crypto(?:currency|currencies)?|bitcoin|κρυπτονομ[ίι]σμα\\p{L}*") },
  // όχι ενικός «δάνειο» (άτοκο δάνειο / χρηματοδότηση σε νόμιμα κείμενα)
  { label: "δάνεια / loans", re: word("loans?|payday|δ[άα]νει(?:α|ων)") },
  { label: "περιεχόμενο ενηλίκων", re: word("porn\\p{L}*|πορν[οό]\\p{L}*|adult\\s+(?:content|dating|videos?|cams?|sites?)|escort\\s+(?:services?|girls?|agency|agencies)") },
  { label: "απομιμήσεις", re: word("replica\\s+(?:watches|rolex|bags)|fake\\s+rolex") },
];

/** Headers που πρέπει να υπάρχουν (λείπουν → warn). Το CSP / frame-ancestors ελέγχονται χωριστά (checkHeaders). */
export const REQUIRED_HEADERS: readonly { name: string; label: string; re: RegExp }[] = [
  { name: "strict-transport-security", label: "HSTS (Strict-Transport-Security)", re: /max-age\s*=\s*[1-9]\d*/i },
  { name: "x-content-type-options", label: "X-Content-Type-Options: nosniff", re: /^\s*nosniff\s*$/i },
];
