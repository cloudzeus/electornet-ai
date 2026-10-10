/**
 * Schema-first definition of the back-office settings. The admin UI, the
 * validation, the encryption of secrets and the storefront readers are all
 * driven by this file — add a field here and it appears in /admin/settings.
 * Only the super-admin can open these pages (integrations, keys, secrets).
 */
export type FieldType = "text" | "url" | "email" | "number" | "secret" | "toggle" | "select" | "textarea" | "softone-objs";

export type Values = Record<string, string | number | boolean>;

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  help?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** exposed to the storefront (never for secrets) */
  public?: boolean;
  required?: boolean;
  width?: "half" | "full";
  /** ομάδα (κάρτα) μέσα στην ενότητα — βλ. Section.groups */
  group?: string;
  /** έλεγχος μορφής καθώς γράφεις (προειδοποίηση, δεν μπλοκάρει την αποθήκευση) */
  rule?: { re: RegExp; bad: string; good?: string };
  /** εμφανίζεται μόνο όταν ισχύει (οι κρυφές τιμές διατηρούνται) */
  showIf?: (v: Values) => boolean;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

export interface Section {
  key: string;
  title: string;
  description: string;
  group: "site" | "integrations" | "marketing" | "commerce";
  /** server action name for a «Δοκιμή σύνδεσης» button */
  test?: "softone" | "smtp" | "openrouter" | "bunny";
  /** τι κάνει η δοκιμή, κάτω από το κουμπί */
  testHelp?: string;
  /** κάρτες της φόρμας, με τη σειρά· πεδία χωρίς group πάνε στην πρώτη */
  groups?: { key: string; title: string; help?: string }[];
  fields: Field[];
}

const on = (k: string) => (v: Values) => v[k] === true;
const is = (k: string, ...vals: string[]) => (v: Values) => vals.includes(String(v[k] ?? ""));
const not = (k: string, ...vals: string[]) => (v: Values) => !vals.includes(String(v[k] ?? ""));
const R = {
  https: { re: /^https:\/\/[^\s/]+\.[^\s]+$/, bad: "Πρέπει να είναι πλήρες URL που ξεκινά με https://" },
  url: { re: /^https?:\/\/[^\s/]+\.[^\s]*$/, bad: "Πρέπει να είναι πλήρες URL (https://…)" },
  email: { re: /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i, bad: "Δεν μοιάζει με email" },
  phone: { re: /^\+?[\d\s-]{10,16}$/, bad: "Γράψε τον αριθμό με 10 ψηφία (ή με +30)" },
  afm: { re: /^\d{9}$/, bad: "Ο ΑΦΜ έχει 9 ψηφία, χωρίς κενά" },
  int: { re: /^\d+$/, bad: "Μόνο ψηφία" },
  social: (host: string) => ({ re: new RegExp(`^https://(www\\.)?${host.replace(/\./g, "\\.")}/`, "i"), bad: `Επικόλλησε όλο τον σύνδεσμο του προφίλ, π.χ. https://www.${host}/euronics` }),
};
const yesNo = (key: string, label: string, help?: string, pub = false): Field => ({ key, label, type: "toggle", help, public: pub, width: "half" });

/**
 * Couriers του checkout (βλ. lib/shipping/carriers.ts): ανά courier διακόπτης, κόστος, «δωρεάν από», χρόνος παράδοσης
 * (δημόσια) και τα στοιχεία σύνδεσης για την έκδοση vouchers (κρυφά).
 */
const CARRIER_SETUP: { id: string; title: string; help: string; fee: string; eta: string; creds: Field[] }[] = [
  { id: "acs", title: "ACS Courier", help: "Στοιχεία web services από την ACS (Company ID, User ID, κωδικός, API key).", fee: "4.90", eta: "1–3 εργάσιμες", creds: [
    { key: "acsCompanyId", label: "Company ID", type: "text", width: "half" }, { key: "acsUserId", label: "User ID", type: "text", width: "half" },
    { key: "acsPassword", label: "Κωδικός", type: "secret", width: "half" }, { key: "acsApiKey", label: "API key", type: "secret", width: "half" }] },
  { id: "geniki", title: "Γενική Ταχυδρομική", help: "Στοιχεία web services από τη Γενική Ταχυδρομική (όνομα χρήστη, κωδικός, app key).", fee: "4.90", eta: "1–3 εργάσιμες", creds: [
    { key: "genikiUser", label: "Όνομα χρήστη", type: "text", width: "half" }, { key: "genikiPassword", label: "Κωδικός", type: "secret", width: "half" },
    { key: "genikiAppKey", label: "App key", type: "secret", width: "half" }] },
  { id: "elta", title: "ΕΛΤΑ Courier", help: "Τα στοιχεία web services δίνονται από την ΕΛΤΑ Courier (info@elta-courier.gr): κωδικός πελάτη, χρήστης, κωδικός.", fee: "3.90", eta: "2–4 εργάσιμες", creds: [
    { key: "eltaCustomerCode", label: "Κωδικός πελάτη", type: "text", width: "half" }, { key: "eltaUser", label: "Χρήστης", type: "text", width: "half" },
    { key: "eltaPassword", label: "Κωδικός", type: "secret", width: "half" }] },
  { id: "asap", title: "ASAP Couriers", help: "Αυθημερόν / express στην Αττική. Το API δίνεται μετά από αίτηση στο asapcouriers.gr/eshop-partners.", fee: "6.90", eta: "Αυθημερόν στην Αττική", creds: [
    { key: "asapAtticaOnly", label: "Μόνο για Αττική", type: "toggle", public: true, width: "half", help: "Με ΤΚ εκτός Αττικής ο πελάτης δεν μπορεί να τον διαλέξει." },
    { key: "asapApiKey", label: "API key", type: "secret", width: "half" }] },
  { id: "boxnow", title: "BOX NOW (θυρίδες)", help: "Ο πελάτης διαλέγει θυρίδα σε χάρτη. Partner ID, Client ID και Client secret από το BOX NOW (boxnow.gr → e-shops).", fee: "2.90", eta: "1–2 εργάσιμες σε θυρίδα", creds: [
    { key: "boxnowPartnerId", label: "Partner ID", type: "text", public: true, width: "half", help: "Χρειάζεται για τον χάρτη θυρίδων στο checkout." },
    { key: "boxnowClientId", label: "Client ID", type: "text", width: "half" },
    { key: "boxnowApiKey", label: "Client secret", type: "secret", width: "half" },
    { key: "boxnowEnv", label: "Περιβάλλον", type: "select", width: "half", options: [{ value: "stage", label: "Δοκιμαστικό (stage)" }, { value: "production", label: "Παραγωγή" }] }] },
];
const CARRIER_GROUPS = CARRIER_SETUP.map((c) => ({ key: c.id, title: c.title, help: c.help }));
const CARRIER_FIELDS: Field[] = CARRIER_SETUP.flatMap((c) => {
  const shown = (v: Values) => v[`${c.id}On`] === true;
  return [
    { key: `${c.id}On`, label: `Προσφέρεται στο checkout`, type: "toggle", public: true, width: "half", group: c.id } as Field,
    { key: `${c.id}Fee`, label: "Κόστος αποστολής", type: "number", public: true, width: "half", group: c.id, showIf: shown, min: 0, step: 0.01, unit: "€", placeholder: c.fee },
    { key: `${c.id}FreeFrom`, label: "Δωρεάν από", type: "number", public: true, width: "half", group: c.id, showIf: shown, min: 0, step: 1, unit: "€", help: "Κενό = όπως το γενικό «Δωρεάν αποστολή από»." },
    { key: `${c.id}Eta`, label: "Χρόνος παράδοσης", type: "text", public: true, width: "half", group: c.id, showIf: shown, placeholder: c.eta, help: "Όπως το βλέπει ο πελάτης στο checkout." },
    ...c.creds.map((f) => ({ ...f, group: c.id, showIf: shown })),
  ];
});

export const SECTIONS: Section[] = [
  {
    key: "general",
    title: "Γενικά",
    description: "Ταυτότητα του site και στοιχεία εταιρείας που εμφανίζονται σε footer, έγγραφα και emails.",
    group: "site",
    groups: [
      { key: "site", title: "Το site", help: "Το όνομα και η διεύθυνση που βλέπουν οι πελάτες και οι μηχανές αναζήτησης." },
      { key: "company", title: "Στοιχεία εταιρείας", help: "Εμφανίζονται στο footer, στα «Οικονομικά στοιχεία» και στα emails παραγγελιών (υποχρέωση κατά τον νόμο για ηλεκτρονικό εμπόριο)." },
      { key: "contact", title: "Εξυπηρέτηση πελατών", help: "Πού απευθύνονται οι πελάτες: εμφανίζονται στην επικοινωνία, στο checkout και στα emails." },
      { key: "ops", title: "Λειτουργία" },
    ],
    fields: ([
      { key: "siteName", label: "Όνομα site", type: "text", public: true, required: true, placeholder: "Euronics", width: "half", group: "site", help: "Στον τίτλο κάθε σελίδας και στο όνομα αποστολέα." },
      { key: "baseUrl", label: "Βασικό URL", type: "url", public: true, required: true, placeholder: "https://www.euronics.gr", width: "half", group: "site", rule: R.https, help: "Η διεύθυνση του καταστήματος, χωρίς / στο τέλος. Χρησιμοποιείται σε emails, sitemap και social login." },
      { key: "legalName", label: "Επωνυμία εταιρείας", type: "text", public: true, width: "half", group: "company", placeholder: "π.χ. ΑΦΟΙ … Α.Ε.", help: "Όπως στο ΓΕΜΗ." },
      { key: "vat", label: "ΑΦΜ", type: "text", public: true, width: "half", group: "company", placeholder: "123456789", rule: R.afm },
      { key: "address", label: "Διεύθυνση έδρας", type: "text", public: true, group: "company", placeholder: "Οδός αριθμός, ΤΚ Πόλη" },
      { key: "phone", label: "Τηλέφωνο εξυπηρέτησης", type: "text", public: true, width: "half", group: "contact", placeholder: "210 1234567", rule: R.phone },
      { key: "email", label: "Email εξυπηρέτησης", type: "email", public: true, width: "half", group: "contact", placeholder: "info@euronics.gr", rule: R.email },
      yesNo("maintenance", "Λειτουργία συντήρησης", "Οι πελάτες βλέπουν σελίδα «Επιστρέφουμε σύντομα»· το /admin μένει ανοιχτό. Άνοιξέ το μόνο για προγραμματισμένη συντήρηση.", true),
    ] as Field[]).map((f) => (f.key === "maintenance" ? { ...f, group: "ops" } : f)),
  },
  {
    key: "social",
    title: "Social προφίλ",
    description: "Σύνδεσμοι που εμφανίζονται στο footer και στα share/OG metadata.",
    group: "marketing",
    groups: [
      { key: "profiles", title: "Προφίλ", help: "Όσα συμπληρώσεις εμφανίζονται ως εικονίδια στο footer· τα κενά κρύβονται." },
      { key: "share", title: "Κοινοποίηση", help: "Η εικόνα που εμφανίζεται όταν κάποιος μοιράζεται σελίδα του site χωρίς δική της εικόνα." },
    ],
    fields: [
      { key: "facebook", label: "Facebook", type: "url", public: true, width: "half", group: "profiles", placeholder: "https://www.facebook.com/…", rule: R.social("facebook.com") },
      { key: "instagram", label: "Instagram", type: "url", public: true, width: "half", group: "profiles", placeholder: "https://www.instagram.com/…", rule: R.social("instagram.com") },
      { key: "youtube", label: "YouTube", type: "url", public: true, width: "half", group: "profiles", placeholder: "https://www.youtube.com/@…", rule: R.social("youtube.com") },
      { key: "tiktok", label: "TikTok", type: "url", public: true, width: "half", group: "profiles", placeholder: "https://www.tiktok.com/@…", rule: R.social("tiktok.com") },
      { key: "linkedin", label: "LinkedIn", type: "url", public: true, width: "half", group: "profiles", placeholder: "https://www.linkedin.com/company/…", rule: R.social("linkedin.com") },
      { key: "x", label: "X (Twitter)", type: "url", public: true, width: "half", group: "profiles", placeholder: "https://x.com/…", rule: { re: /^https:\/\/(www\.)?(x|twitter)\.com\//i, bad: "Επικόλλησε όλο τον σύνδεσμο, π.χ. https://x.com/euronics" } },
      { key: "ogImage", label: "Προεπιλεγμένη εικόνα κοινοποίησης (OG)", type: "url", public: true, group: "share", rule: R.https, placeholder: "https://euronics.b-cdn.net/brand/og.jpg", help: "Απόλυτο URL εικόνας 1200×630 px (JPG ή PNG, έως 1 MB). Facebook, Viber και LinkedIn την κόβουν στο ίδιο κάδρο." },
    ],
  },
  {
    key: "social-login",
    title: "Social login",
    description: "Οι πελάτες συνδέονται ή φτιάχνουν λογαριασμό με Google, Microsoft, Facebook ή Apple — χωρίς κωδικό. Τα secrets αποθηκεύονται κρυπτογραφημένα.",
    group: "integrations",
    fields: [
      yesNo("googleEnabled", "Google", undefined, true),
      { key: "googleClientId", label: "Google client ID", type: "text", width: "half", placeholder: "123456789-abc….apps.googleusercontent.com" },
      { key: "googleClientSecret", label: "Google client secret", type: "secret", width: "half" },
      yesNo("microsoftEnabled", "Microsoft", undefined, true),
      { key: "microsoftClientId", label: "Microsoft application (client) ID", type: "text", width: "half", placeholder: "00000000-0000-0000-0000-000000000000" },
      { key: "microsoftClientSecret", label: "Microsoft client secret (Value)", type: "secret", width: "half" },
      { key: "microsoftTenant", label: "Microsoft λογαριασμοί", type: "text", placeholder: "consumers", width: "half" },
      yesNo("facebookEnabled", "Facebook", undefined, true),
      { key: "facebookAppId", label: "Facebook App ID", type: "text", width: "half" },
      { key: "facebookAppSecret", label: "Facebook App secret", type: "secret", width: "half" },
      yesNo("appleEnabled", "Apple", undefined, true),
      { key: "appleClientId", label: "Apple Services ID", type: "text", width: "half", placeholder: "gr.euronics.signin" },
      { key: "appleTeamId", label: "Apple Team ID", type: "text", width: "half", placeholder: "A1B2C3D4E5" },
      { key: "appleKeyId", label: "Apple Key ID", type: "text", width: "half", placeholder: "ABC123DEFG" },
      { key: "applePrivateKey", label: "Apple ιδιωτικό κλειδί (.p8)", type: "secret", width: "full" },
      /** παλιό πεδίο (έτοιμο JWT που λήγει ανά 6 μήνες) — χρησιμοποιείται μόνο αν δεν υπάρχει .p8 */
      { key: "appleSecret", label: "Apple client secret (JWT, παλιό)", type: "secret", width: "half" },
    ],
  },
  {
    key: "analytics",
    title: "Analytics & pixels",
    description: "Φορτώνονται στο storefront μόνο μετά από συγκατάθεση cookies (consent mode).",
    group: "marketing",
    groups: [
      { key: "google", title: "Google", help: "Αρκεί ένα από GA4 ή Tag Manager: αν έχεις GTM, βάλε το GA4 μέσα στο container και άφησε το GA4 εδώ κενό, για να μη μετριούνται διπλά οι επισκέψεις." },
      { key: "ads", title: "Διαφημιστικά pixels", help: "Μετρούν αγορές από διαφημίσεις. Φορτώνονται μόνο αν ο επισκέπτης δεχτεί cookies marketing." },
      { key: "ux", title: "Συμπεριφορά επισκεπτών", help: "Heatmaps και καταγραφές συνεδριών για βελτίωση του UX. Φορτώνονται μόνο με συγκατάθεση στατιστικών." },
    ],
    fields: [
      { key: "ga4", label: "Google Analytics 4 · Measurement ID", type: "text", public: true, placeholder: "G-XXXXXXXXXX", width: "half", group: "google", rule: { re: /^G-[A-Z0-9]{6,12}$/, bad: "Ξεκινά με G- (Admin → Data streams → Web)" }, help: "Admin → Data streams → Web → Measurement ID." },
      { key: "gtm", label: "Google Tag Manager · Container ID", type: "text", public: true, placeholder: "GTM-XXXXXXX", width: "half", group: "google", rule: { re: /^GTM-[A-Z0-9]{4,10}$/, bad: "Ξεκινά με GTM-" }, help: "Πάνω δεξιά στο tagmanager.google.com." },
      { key: "googleAds", label: "Google Ads · Conversion ID", type: "text", public: true, placeholder: "AW-123456789", width: "half", group: "ads", rule: { re: /^AW-\d{6,12}$/, bad: "Ξεκινά με AW- και ακολουθούν ψηφία" }, help: "Google Ads → Goals → Conversions → Tag setup." },
      { key: "metaPixel", label: "Meta (Facebook/Instagram) Pixel ID", type: "text", public: true, width: "half", group: "ads", placeholder: "123456789012345", rule: { re: /^\d{15,16}$/, bad: "Το Pixel ID είναι 15–16 ψηφία" }, help: "Events Manager → Data sources → Pixel." },
      { key: "tiktokPixel", label: "TikTok Pixel ID", type: "text", public: true, width: "half", group: "ads", placeholder: "C1A2B3C4D5E6F7G8H9I0", rule: { re: /^[A-Z0-9]{18,22}$/, bad: "20 κεφαλαία γράμματα/ψηφία" }, help: "TikTok Ads Manager → Assets → Events." },
      { key: "gsc", label: "Google Search Console · verification", type: "text", public: true, width: "half", group: "google", placeholder: "abc123…", help: "Μόνο ο κωδικός από το meta tag (content=\"…\"), όχι όλο το tag." },
      { key: "clarity", label: "Microsoft Clarity · Project ID", type: "text", public: true, width: "half", group: "ux", placeholder: "abcd1234ef", rule: { re: /^[a-z0-9]{8,12}$/, bad: "10 μικρά γράμματα/ψηφία (Settings → Overview)" } },
      { key: "hotjar", label: "Hotjar · Site ID", type: "text", public: true, width: "half", group: "ux", placeholder: "1234567", rule: { re: /^\d{6,8}$/, bad: "Το Site ID είναι 6–8 ψηφία" } },
      { ...yesNo("consentMode", "Google Consent Mode v2", "Στέλνει «denied» στη Google μέχρι να δεχτεί ο επισκέπτης cookies. Απαιτείται στην ΕΕ για να μετρά σωστά το Google Ads — άφησέ το ενεργό.", true), group: "google" },
    ],
  },
  {
    key: "softone",
    title: "SoftOne ERP (Web Services)",
    description: "Σύνδεση με το SoftOne μέσω των επίσημων s1services (login → authenticate, session ανά ημέρα, Windows-1253).",
    group: "integrations",
    test: "softone",
    testHelp: "Κάνει login + authenticate με τα στοιχεία της φόρμας (και μη αποθηκευμένα). Μόνο ανάγνωση — δεν γράφει τίποτα στο ERP.",
    groups: [
      { key: "conn", title: "Σύνδεση", help: "Τα στοιχεία του Web Account που έδωσε ο συνεργάτης SoftOne. Με τα τέσσερα πρώτα, το «Φέρε επιλογές» δείχνει εταιρείες και υποκαταστήματα." },
      { key: "customers", title: "Πελάτες e-shop στο ERP", help: "Πώς δημιουργείται η καρτέλα πελάτη (CUSTOMER / TRDR) όταν ο πελάτης φτάσει στο ERP. Οι κωδικοί (id) είναι από τους πίνακες του SoftOne." },
      { key: "items", title: "Είδη & τιμές", help: "Ποια είδη έρχονται στο e-shop και με ποιον τιμοκατάλογο." },
      { key: "orders", title: "Παραγγελίες", help: "Οι παραγγελίες ΔΕΝ στέλνονται στο ERP· χτίζεται μόνο προεπισκόπηση του παραστατικού μέχρι ρητή έγκριση." },
    ],
    fields: [
      { ...yesNo("enabled", "Ενεργός συγχρονισμός", "Κλειστό = καμία κλήση προς το SoftOne (ούτε ανάγνωση)."), group: "conn" },
      { key: "syncMinutes", label: "Συχνότητα συγχρονισμού", type: "number", placeholder: "15", width: "half", group: "conn", min: 5, max: 1440, step: 1, unit: "λεπτά", help: "Κάθε πόσο διαβάζονται τιμές και αποθέματα. Κάτω από 5 λεπτά φορτώνει άσκοπα το ERP." },
      { key: "url", label: "URL web services", type: "text", required: true, placeholder: "https://123456.oncloud.gr/s1services", help: "Ή μόνο το serial (π.χ. 01102358330113) για εγκατάσταση oncloud.", width: "half", group: "conn", rule: { re: /^(https:\/\/[^\s]+\/s1services\/?|\d{6,16})$/, bad: "Πλήρες URL που τελειώνει σε /s1services ή μόνο το serial" } },
      { key: "appId", label: "App ID", type: "text", required: true, width: "half", group: "conn", placeholder: "1001", rule: R.int, help: "Από SoftOne → Web & Mobile → Web Services." },
      { key: "username", label: "Username", type: "text", required: true, width: "half", group: "conn", help: "Ο Web Account χρήστης — όχι προσωπικός λογαριασμός υπαλλήλου." },
      { key: "password", label: "Password", type: "secret", required: true, width: "half", group: "conn" },
      { key: "objs", label: "Εταιρεία · Υποκατάστημα · Module · Χρήστης", type: "softone-objs", group: "conn", help: "Με τα τέσσερα παραπάνω, το πρώτο login φέρνει τις διαθέσιμες επιλογές από το SoftOne." },
      { ...yesNo("customersAutoPush", "Αυτόματη αποστολή νέων πελατών στο SoftOne", "Κάθε νέος λογαριασμός / πρώτη παραγγελία δημιουργεί CUSTOMER (TRDR)."), group: "customers" },
      { key: "customerCodePrefix", label: "Πρόθεμα κωδικού πελάτη (CODE)", type: "text", placeholder: "WEB", help: "Ο κωδικός γίνεται π.χ. WEB000123 από τον αριθμό πελάτη του e-shop.", width: "half", group: "customers", rule: { re: /^[A-Z0-9-]{1,8}$/, bad: "Έως 8 κεφαλαία λατινικά/ψηφία" } },
      { key: "customerCountry", label: "Χώρα (COUNTRY id)", type: "text", placeholder: "1000", width: "half", group: "customers", rule: R.int, help: "Το id της Ελλάδας στον πίνακα χωρών του ERP." },
      { key: "customerCurrency", label: "Νόμισμα (SOCURRENCY id)", type: "text", placeholder: "100", width: "half", group: "customers", rule: R.int, help: "Το id του ευρώ." },
      { key: "customerVatSts", label: "Καθεστώς ΦΠΑ (VATSTS)", type: "text", placeholder: "1", width: "half", group: "customers", rule: R.int, help: "Συνήθως 1 = κανονικό." },
      { key: "customerTrdCategory", label: "Λογιστική κατηγορία (TRDCATEGORY)", type: "text", placeholder: "π.χ. 3", width: "half", group: "customers", rule: R.int, help: "Κατηγορία πελατών λιανικής. Κενό = η προεπιλογή του ERP." },
      { key: "customerPayment", label: "Τρόπος πληρωμής (PAYMENT)", type: "text", placeholder: "π.χ. 1000", width: "half", group: "customers", rule: R.int, help: "Προεπιλεγμένος τρόπος πληρωμής νέων πελατών. Κενό = του ERP." },
      { key: "itemsWrite", label: "Αλλαγές προϊόντων προς SoftOne", type: "select", options: [{ value: "off", label: "Ανενεργό — μόνο ανάγνωση (προεπιλογή)" }, { value: "on", label: "Ενεργό — η καρτέλα προϊόντος γράφει και στο SoftOne" }], help: "Ενεργό: ό,τι αλλάζει στην καρτέλα προϊόντος (όνομα, περιγραφές, χαρακτηριστικά, διαστάσεις, εγγύηση) γράφεται στο είδος του SoftOne (setData ITEM), επαληθεύεται με νέα ανάγνωση και μετά ενημερώνεται το e-shop. Χρειάζεται και το δικαίωμα «Εκτέλεση συγχρονισμού ERP».", width: "half", group: "items" },
      { key: "priceList", label: "Τιμοκατάλογος web", type: "text", placeholder: "π.χ. 1", width: "half", group: "items", help: "Ο τιμοκατάλογος του ERP από τον οποίο έρχονται οι τιμές του e-shop." },
      { key: "webFilter", label: "Φίλτρο ειδών web", type: "textarea", placeholder: "ITEM.WEBACTIVE=1", group: "items", help: "Φίλτρο του browser του SoftOne (μόνο «=», με & ανάμεσα), π.χ. ITEM.WEBACTIVE=1&ITEM.ISACTIVE=1." },
      { key: "orderPush", label: "Παραγγελίες προς SoftOne", type: "select", options: [{ value: "preview", label: "Μόνο προεπισκόπηση (προεπιλογή)" }, { value: "off", label: "Ανενεργό" }], help: "Στην προεπισκόπηση χτίζεται το παραστατικό αλλά ΔΕΝ στέλνεται. Η πραγματική αποστολή (setData SALDOC) ενεργοποιείται μόνο μετά από δοκιμή σε σειρά δοκιμών και ρητή έγκριση.", width: "half", group: "orders" },
      { key: "orderSeries", label: "Σειρά παραστατικού παραγγελίας (SERIES)", type: "text", placeholder: "π.χ. 7021", help: "Από τον πελάτη / ERP. Χωρίς σειρά, το παραστατικό μένει σε προεπισκόπηση.", width: "half", group: "orders", rule: R.int },
      { key: "orderRetailTrdr", label: "Πελάτης λιανικής για επισκέπτες (TRDR)", type: "text", placeholder: "π.χ. 12345", help: "Για παραγγελίες χωρίς κωδικό πελάτη στο SoftOne.", width: "half", group: "orders", rule: R.int },
    ],
  },
  {
    key: "payments",
    title: "Πληρωμές",
    description: "Πάροχος καρτών, wallets και εναλλακτικοί τρόποι πληρωμής.",
    group: "commerce",
    groups: [
      { key: "cards", title: "Πληρωμή με κάρτα", help: "Τα στοιχεία από το περιβάλλον του παρόχου. Ξεκίνα σε «Test» και γύρνα σε «Live» μόνο αφού ολοκληρωθεί μια δοκιμαστική αγορά. Viva: στην πηγή πληρωμής (Online payments → Websites/Apps) βάλε Success URL https://<το site>/api/payments/viva/success και Failure URL https://<το site>/api/payments/viva/failure· στα Webhooks πρόσθεσε https://<το site>/api/webhooks/viva για «Transaction Payment Created» και «Transaction Failed»." },
      { key: "wallets", title: "Wallets & άλλοι τρόποι (μέσω Viva)", help: "Ο πελάτης τα διαλέγει στο checkout και η σελίδα της Viva ανοίγει κατευθείαν σε αυτά. Ο πελάτης που έχει πληρώσει με Viva σε άλλο κατάστημα βλέπει εκεί τις αποθηκευμένες κάρτες του. Apple Pay / Google Pay εμφανίζονται μόνο σε συσκευές που τα υποστηρίζουν." },
      { key: "cod", title: "Αντικαταβολή" },
      { key: "bank", title: "Κατάθεση σε τράπεζα", help: "Ο πελάτης βλέπει το IBAN μετά την παραγγελία και στο email επιβεβαίωσης." },
    ],
    fields: ([
      { key: "provider", label: "Πάροχος καρτών", type: "select", public: true, options: [{ value: "viva", label: "Viva Wallet" }, { value: "everypay", label: "EveryPay" }, { value: "cardlink", label: "Cardlink" }, { value: "stripe", label: "Stripe" }], width: "half", group: "cards" },
      { key: "mode", label: "Περιβάλλον", type: "select", public: true, options: [{ value: "test", label: "Test / demo — καμία πραγματική χρέωση" }, { value: "live", label: "Live — πραγματικές χρεώσεις" }], width: "half", group: "cards" },
      { key: "merchantId", label: "Merchant ID", type: "text", width: "half", group: "cards", help: "Viva: Settings → API access. Cardlink: το MID της σύμβασης." },
      { key: "clientId", label: "Client ID", type: "text", width: "half", group: "cards", showIf: is("provider", "viva", "stripe", "everypay"), help: "Viva: Smart Checkout credentials. Stripe: publishable key (pk_…)." },
      { key: "clientSecret", label: "Client secret", type: "secret", width: "half", group: "cards", showIf: is("provider", "viva", "stripe", "everypay") },
      { key: "apiKey", label: "API key", type: "secret", width: "half", group: "cards", help: "Viva: API key. Stripe: secret key (sk_…). Cardlink: shared secret." },
      { key: "webhookSecret", label: "Webhook secret", type: "secret", width: "half", group: "cards", help: "Επιβεβαιώνει ότι οι ειδοποιήσεις πληρωμής έρχονται πράγματι από τον πάροχο." },
      { key: "sourceCode", label: "Source code (Viva)", type: "text", width: "half", group: "cards", showIf: is("provider", "viva"), placeholder: "1234", rule: R.int, help: "Viva → Sales → Online payments → Websites/Apps → κωδικός πηγής." },
      { key: "maxInstalments", label: "Μέγιστες άτοκες δόσεις", type: "number", public: true, width: "half", group: "cards", min: 0, max: 60, step: 1, placeholder: "12", help: "0 = χωρίς δόσεις. Οι δόσεις ανά ποσό ορίζονται στον πάροχο." },
      yesNo("applePay", "Apple Pay", undefined, true),
      yesNo("googlePay", "Google Pay", undefined, true),
      yesNo("paypal", "PayPal", "Μέσω Viva.", true),
      yesNo("iris", "IRIS", "Άμεσα από το e-banking, μέσω Viva. Η επιβεβαίωση μπορεί να αργήσει λίγα λεπτά.", true),
      yesNo("klarna", "Klarna", "Πληρωμή σε δόσεις χωρίς κάρτα, μέσω Viva.", true),
      yesNo("revolutPay", "Revolut Pay", "Πληρωμή με τον λογαριασμό Revolut του πελάτη.", true),
      { key: "revolutApiKey", label: "Revolut merchant API key", type: "secret", group: "wallets", showIf: on("revolutPay"), help: "Revolut Business → Merchant → APIs → Production secret key." },
      yesNo("cod", "Αντικαταβολή", "Πληρωμή στον courier κατά την παράδοση.", true),
      { key: "codFee", label: "Χρέωση αντικαταβολής", type: "number", public: true, width: "half", group: "cod", showIf: on("cod"), min: 0, max: 50, step: 0.01, unit: "€", placeholder: "2.00" },
      { key: "codMax", label: "Μέγιστο ποσό αντικαταβολής", type: "number", public: true, width: "half", group: "cod", showIf: on("cod"), min: 0, step: 1, unit: "€", placeholder: "500", help: "Πάνω από αυτό η αντικαταβολή δεν προσφέρεται. Νόμιμο όριο μετρητών: 500 €." },
      yesNo("bankTransfer", "Κατάθεση σε τράπεζα", undefined, true),
      { key: "iban", label: "IBAN", type: "text", public: true, group: "bank", showIf: on("bankTransfer"), placeholder: "GR16 0110 1250 0000 0001 2300 695", rule: { re: /^GR(\s*\d){25}$/i, bad: "Ελληνικό IBAN: GR + 25 ψηφία" } },
    ] as Field[]).map((f) => (["applePay", "googlePay", "paypal", "iris", "klarna", "revolutPay"].includes(f.key) ? { ...f, group: "wallets" } : f.key === "cod" ? { ...f, group: "cod" } : f.key === "bankTransfer" ? { ...f, group: "bank" } : f)),
  },
  {
    key: "shipping",
    title: "Αποστολές & courier",
    description: "Ποιοι couriers προσφέρονται στο checkout, με τι κόστος και χρόνο παράδοσης, και τα στοιχεία σύνδεσης για τα vouchers.",
    group: "commerce",
    groups: [
      { key: "cost", title: "Γενικό κόστος αποστολής", help: "Ισχύει όταν δεν είναι ενεργός κανένας courier, και ως «δωρεάν από» για όσους δεν έχουν δικό τους." },
      ...CARRIER_GROUPS,
      { key: "delivery", title: "Άλλοι τρόποι παράδοσης" },
    ],
    fields: ([
      { key: "freeShippingFrom", label: "Δωρεάν αποστολή από", type: "number", public: true, width: "half", group: "cost", min: 0, step: 1, unit: "€", placeholder: "49", help: "Κενό = ποτέ δωρεάν. Το καλάθι δείχνει «σου λείπουν Χ € για δωρεάν αποστολή»." },
      { key: "shippingFee", label: "Βασικό κόστος αποστολής", type: "number", public: true, width: "half", group: "cost", min: 0, step: 0.01, unit: "€", placeholder: "3.90" },
      ...CARRIER_FIELDS,
      yesNo("clickCollect", "Click & Collect", "Παραλαβή από κατάστημα, χωρίς χρέωση.", true),
      { key: "clickCollectHours", label: "Έτοιμο για παραλαβή σε", type: "number", public: true, width: "half", group: "delivery", showIf: on("clickCollect"), min: 1, max: 240, step: 1, unit: "ώρες", placeholder: "2", help: "Η υπόσχεση που βλέπει ο πελάτης στο checkout." },
      yesNo("appointmentDelivery", "Παράδοση με ραντεβού (λευκές συσκευές)", "Ο πελάτης διαλέγει ημέρα και ώρα για ψυγεία, πλυντήρια, κουζίνες.", true),
    ] as Field[]).map((f) => (["clickCollect", "appointmentDelivery"].includes(f.key) ? { ...f, group: "delivery" } : f)),
  },
  {
    key: "bunny",
    title: "Bunny CDN",
    description: "Αποθήκευση και διανομή εικόνων, cutouts, 3D μοντέλων και video μέσω Bunny Storage + Pull Zone, με Bunny Optimizer για responsive εικόνες.",
    group: "integrations",
    test: "bunny",
    testHelp: "Διαβάζει τη λίστα αρχείων του storage zone (και του pull zone, αν δώσεις Account API key). Δεν ανεβάζει ούτε σβήνει τίποτα.",
    groups: [
      { key: "cdn", title: "Διανομή (Pull zone)", help: "Από εδώ φτάνουν οι εικόνες στους πελάτες. Bunny → CDN → Pull zones." },
      { key: "storage", title: "Αποθήκευση (Storage zone)", help: "Εδώ ανεβαίνουν τα αρχεία. Bunny → Storage → το zone → FTP & API access." },
      { key: "images", title: "Εικόνες" },
      { key: "backup", title: "Αντίγραφα ασφαλείας βάσης", help: "Τα backups κρυπτογραφούνται πριν ανέβουν. Προτείνεται ξεχωριστό zone χωρίς pull zone, ώστε να μην είναι ποτέ δημόσια προσβάσιμα." },
    ],
    fields: [
      { ...yesNo("enabled", "Χρήση CDN για media", "Όταν είναι ανενεργό, τα media σερβίρονται από τον server της εφαρμογής (/public).", true), group: "cdn" },
      { key: "cdnUrl", label: "Pull zone URL", type: "url", public: true, required: true, placeholder: "https://euronics.b-cdn.net", width: "half", group: "cdn", rule: R.https },
      { key: "pullZoneId", label: "Pull zone ID", type: "text", placeholder: "123456", help: "Για καθαρισμό cache (purge) όταν αλλάζει μια εικόνα.", width: "half", group: "cdn", rule: R.int },
      { key: "accountApiKey", label: "Account API key", type: "secret", help: "Bunny → Account settings → API key. Μόνο για purge & στατιστικά.", width: "half", group: "cdn" },
      { key: "storageZone", label: "Storage zone name", type: "text", required: true, placeholder: "euronics-media", width: "half", group: "storage" },
      { key: "storageRegion", label: "Storage region", type: "select", options: [{ value: "", label: "Falkenstein (DE, default)" }, { value: "uk", label: "London (UK)" }, { value: "ny", label: "New York (US)" }, { value: "la", label: "Los Angeles (US)" }, { value: "sg", label: "Singapore" }, { value: "se", label: "Stockholm (SE)" }, { value: "br", label: "São Paulo (BR)" }, { value: "jh", label: "Johannesburg (ZA)" }, { value: "syd", label: "Sydney (AU)" }], help: "Η κύρια περιοχή που διάλεξες όταν έφτιαξες το zone.", width: "half", group: "storage" },
      { key: "storagePassword", label: "Storage zone password (FTP & API)", type: "secret", required: true, width: "half", group: "storage", help: "Το «Password» — όχι το «Read-only password»." },
      { key: "basePath", label: "Βασικός φάκελος", type: "text", placeholder: "/media", width: "half", group: "storage", rule: { re: /^\/[\w\-/]*$/, bad: "Ξεκινά με / και περιέχει μόνο λατινικά, ψηφία, - και /" } },
      { key: "tokenAuthKey", label: "Token authentication key", type: "secret", help: "Για υπογεγραμμένα, προσωρινά URLs (τιμολόγια, εγγυήσεις). Pull zone → Security → Token authentication.", width: "half", group: "storage" },
      { ...yesNo("optimizer", "Bunny Optimizer (responsive εικόνες)", "Κάθε εικόνα σερβίρεται στο μέγεθος της οθόνης και σε WebP/AVIF. Θέλει ενεργό Optimizer στο pull zone.", true), group: "images" },
      { key: "imageQuality", label: "Ποιότητα εικόνων", type: "number", public: true, placeholder: "82", width: "half", group: "images", showIf: on("optimizer"), min: 40, max: 100, step: 1, unit: "%", help: "75–85 = καθαρές εικόνες με μικρό βάρος." },
      { key: "backupZone", label: "Backup storage zone", type: "text", placeholder: "euronics-backups", help: "Κενό = φάκελος _backups/ στο zone των media (τα αρχεία κρυπτογραφούνται και έχουν τυχαίο όνομα).", width: "half", group: "backup" },
      { key: "backupZonePassword", label: "Backup zone password", type: "secret", help: "Κενό = ο κωδικός του zone των media.", width: "half", group: "backup" },
      { key: "backupRetentionDays", label: "Διατήρηση backup", type: "number", placeholder: "30", help: "Παλαιότερα αντίγραφα διαγράφονται αυτόματα μετά από κάθε επιτυχημένο backup.", width: "half", group: "backup", min: 7, max: 365, step: 1, unit: "ημέρες" },
    ],
  },
  {
    key: "aade",
    title: "ΑΑΔΕ",
    description: "Αναζήτηση ΑΦΜ στο μητρώο επιχειρήσεων (RgWsPublic2) για τιμολόγηση: επωνυμία, ΔΟΥ, έδρα, ΚΑΔ και αν ο ΑΦΜ είναι ενεργός.",
    group: "integrations",
    groups: [
      { key: "vat", title: "Αναζήτηση ΑΦΜ στο checkout", help: "Ο πελάτης που ζητά τιμολόγιο γράφει τον ΑΦΜ και τα υπόλοιπα στοιχεία συμπληρώνονται μόνα τους." },
      { key: "soap", title: "Απευθείας σύνδεση ΑΑΔΕ", help: "Ειδικοί κωδικοί από το TAXISnet για την υπηρεσία «Αναζήτηση Βασικών Στοιχείων Μητρώου Επιχειρήσεων» — ΟΧΙ οι κωδικοί TAXISnet της εταιρείας." },
    ],
    fields: [
      { ...yesNo("vatEnabled", "Αναζήτηση ΑΦΜ ενεργή", "Χωρίς αυτό το checkout ζητά τα στοιχεία χειροκίνητα.", true), group: "vat" },
      { key: "vatSource", label: "Πηγή", type: "select", options: [{ value: "proxy", label: "Proxy afm2info (χωρίς κωδικούς)" }, { value: "soap", label: "Απευθείας ΑΑΔΕ (ειδικοί κωδικοί)" }], help: "Ο proxy δεν χρειάζεται κωδικούς αλλά δεν επιστρέφει τον κωδικό Δ.Ο.Υ. — η αντιστοίχιση με το IRSDATA γίνεται τότε με το όνομα.", width: "half", group: "vat" },
      { key: "vatProxyUrl", label: "Proxy URL", type: "url", placeholder: "https://vat.wwa.gr/afm2info", width: "half", group: "vat", showIf: not("vatSource", "soap"), rule: R.https },
      { key: "vatUsername", label: "Username ειδικών κωδικών", type: "text", width: "half", group: "soap", showIf: is("vatSource", "soap") },
      { key: "vatPassword", label: "Password ειδικών κωδικών", type: "secret", width: "half", group: "soap", showIf: is("vatSource", "soap") },
      { key: "vatCalledBy", label: "ΑΦΜ εταιρείας (afm_called_by)", type: "text", placeholder: "094xxxxxx", help: "Ο ΑΦΜ που κάνει την κλήση. Κενό αν οι κωδικοί είναι προσωπικοί.", width: "half", group: "soap", showIf: is("vatSource", "soap"), rule: R.afm },
      { key: "vatEndpoint", label: "Endpoint", type: "url", placeholder: "https://www1.gsis.gr/wsaade/RgWsPublic2/RgWsPublic2", help: "Κενό = παραγωγικό. Για δοκιμές: https://www1.gsis.gr/wsaadedg/RgWsPublic2/RgWsPublic2", width: "half", group: "soap", showIf: is("vatSource", "soap"), rule: R.https },
    ],
  },
  {
    key: "email",
    title: "Email & SMS",
    description: "Αποστολή συναλλακτικών emails, newsletter και SMS.",
    group: "integrations",
    test: "smtp",
    testHelp: "Για SMTP: ελέγχει ότι ο server απαντά στη θύρα. Δεν στέλνει email.",
    groups: [
      { key: "sender", title: "Αποστολέας & εμφάνιση", help: "Πώς φαίνονται τα emails (επιβεβαίωση παραγγελίας, κουπόνια, υπενθυμίσεις) στα εισερχόμενα του πελάτη." },
      { key: "transport", title: "Αποστολή emails", help: "Ένας τρόπος αποστολής. Τα πεδία αλλάζουν ανάλογα με την επιλογή." },
      { key: "newsletter", title: "Newsletter", help: "Οι εγγραφές από το site (με συγκατάθεση) περνούν στη λίστα του παρόχου." },
      { key: "sms", title: "SMS", help: "Ειδοποιήσεις παραγγελίας και κωδικοί επιβεβαίωσης κινητού." },
    ],
    fields: [
      { key: "fromName", label: "Όνομα αποστολέα", type: "text", placeholder: "Euronics", width: "half", group: "sender" },
      { key: "fromEmail", label: "Email αποστολέα", type: "email", placeholder: "noreply@euronics.gr", width: "half", group: "sender", rule: R.email, help: "Το domain πρέπει να είναι επιβεβαιωμένο στον πάροχο (SPF/DKIM), αλλιώς τα emails πάνε στα spam." },
      { key: "emailLogoUrl", label: "Λογότυπο emails (URL)", type: "url", placeholder: "https://euronics.b-cdn.net/brand/euronics-logo-white.png", help: "Απόλυτο URL που φτάνουν οι email clients — λευκό λογότυπο σε διαφάνεια. Κενό = το αντίγραφο στο Bunny CDN.", width: "half", group: "sender", rule: R.https },
      { key: "emailAssetUrl", label: "Base URL εικόνων emails", type: "url", placeholder: "https://euronics.dgsoft.gr", help: "Πού τρέχει ΑΥΤΗ η εφαρμογή — από εκεί σερβίρονται οι εικόνες των emails. Διαφορετικό από το site του πελάτη όσο το euronics.gr δείχνει το παλιό site.", width: "half", group: "sender", rule: R.https },
      { key: "transport", label: "Τρόπος αποστολής", type: "select", options: [{ value: "smtp", label: "SMTP" }, { value: "resend", label: "Resend" }, { value: "sendgrid", label: "SendGrid" }, { value: "mailgun", label: "Mailgun" }], width: "half", group: "transport" },
      { key: "apiKey", label: "API key παρόχου", type: "secret", width: "half", group: "transport", showIf: not("transport", "smtp", "") },
      { key: "mailgunDomain", label: "Mailgun domain", type: "text", placeholder: "mg.euronics.gr", help: "Το επιβεβαιωμένο sending domain. Κενό = το domain του email αποστολέα.", width: "half", group: "transport", showIf: is("transport", "mailgun") },
      { key: "mailgunRegion", label: "Mailgun region", type: "select", options: [{ value: "eu", label: "EU (api.eu.mailgun.net)" }, { value: "us", label: "US (api.mailgun.net)" }], width: "half", group: "transport", showIf: is("transport", "mailgun"), help: "Όπου δημιουργήθηκε το domain στο Mailgun." },
      { key: "smtpHost", label: "SMTP host", type: "text", width: "half", group: "transport", showIf: is("transport", "smtp", ""), placeholder: "smtp.office365.com" },
      { key: "smtpPort", label: "SMTP port", type: "number", placeholder: "587", width: "half", group: "transport", showIf: is("transport", "smtp", ""), min: 1, max: 65535, step: 1, help: "587 (STARTTLS) ή 465 (SSL)." },
      { key: "smtpUser", label: "SMTP user", type: "text", width: "half", group: "transport", showIf: is("transport", "smtp", "") },
      { key: "smtpPass", label: "SMTP password", type: "secret", width: "half", group: "transport", showIf: is("transport", "smtp", ""), help: "Σε Microsoft 365 / Gmail με 2FA χρειάζεται «app password»." },
      { key: "newsletterProvider", label: "Πάροχος newsletter", type: "select", options: [{ value: "", label: "Κανένας" }, { value: "mailchimp", label: "Mailchimp" }, { value: "klaviyo", label: "Klaviyo" }, { value: "moosend", label: "Moosend" }], width: "half", group: "newsletter" },
      { key: "newsletterApiKey", label: "Newsletter API key", type: "secret", width: "half", group: "newsletter", showIf: not("newsletterProvider", "") },
      { key: "newsletterList", label: "Λίστα / audience ID", type: "text", width: "half", group: "newsletter", showIf: not("newsletterProvider", ""), help: "Mailchimp: Audience → Settings → Audience ID. Klaviyo: Lists → η λίστα → List ID." },
      { key: "smsProvider", label: "Πάροχος SMS", type: "select", options: [{ value: "", label: "Κανένας" }, { value: "yuboto", label: "Yuboto" }, { value: "apifon", label: "Apifon" }, { value: "twilio", label: "Twilio" }], width: "half", group: "sms" },
      { key: "smsApiKey", label: "SMS API key", type: "secret", width: "half", group: "sms", showIf: not("smsProvider", "") },
      { key: "smsSender", label: "Όνομα αποστολέα SMS", type: "text", placeholder: "EURONICS", width: "half", group: "sms", showIf: not("smsProvider", ""), rule: { re: /^[A-Za-z0-9 ]{1,11}$/, bad: "Έως 11 λατινικοί χαρακτήρες ή ψηφία" }, help: "Πρέπει να έχει εγκριθεί από τον πάροχο." },
    ],
  },
  {
    key: "ai",
    title: "AI & υπηρεσίες",
    description: "Ο Ερμής (σύμβουλος), γεωεντοπισμός, χάρτες, αναζήτηση.",
    group: "integrations",
    test: "openrouter",
    testHelp: "Ελέγχει το κλειδί OpenRouter, κάνει μια μικρή κλήση στο κύριο μοντέλο και δείχνει τις φωνές του ElevenLabs. Κόστος: κλάσματα του cent.",
    groups: [
      { key: "advisor", title: "Ο Ερμής & μοντέλα", help: "Ένα κλειδί OpenRouter για όλες τις AI λειτουργίες. Τα μοντέλα γράφονται ως id του OpenRouter (εταιρεία/μοντέλο)." },
      { key: "voice", title: "Φωνή", help: "Μικρόφωνο και εκφώνηση απαντήσεων. Οι ρυθμίσεις εμφανίζονται όταν ενεργοποιήσεις τη φωνή." },
      { key: "media", title: "Εικόνες & 3D" },
      { key: "services", title: "Χάρτες, γεωεντοπισμός, αναζήτηση" },
    ],
    fields: [
      { ...yesNo("advisorEnabled", "Ο Ερμής ενεργός", "Απαντήσεις με LLM· χωρίς κλειδί πέφτει στους κανόνες demo.", true), group: "advisor" },
      { key: "openrouterApiKey", label: "OpenRouter API key", type: "secret", required: true, help: "Ένα κλειδί για όλα τα μοντέλα και όλες τις AI λειτουργίες (openrouter.ai/keys).", width: "half", group: "advisor", rule: { re: /^sk-or-v1-[a-f0-9]{40,}$/, bad: "Τα κλειδιά OpenRouter ξεκινούν με sk-or-v1-" } },
      { key: "routing", label: "Δρομολόγηση μοντέλου", type: "select", options: [{ value: "auto", label: "Αυτόματη (openrouter/auto)" }, { value: "task", label: "Ανά εργασία (τα μοντέλα παρακάτω)" }], help: "Στην αυτόματη, το OpenRouter διαλέγει το κατάλληλο μοντέλο για κάθε ερώτηση· τα παρακάτω μένουν ως fallback.", width: "half", group: "advisor" },
      { key: "providerSort", label: "Προτίμηση παρόχου", type: "select", options: [{ value: "", label: "Προεπιλογή OpenRouter" }, { value: "price", label: "Φθηνότερος" }, { value: "throughput", label: "Ταχύτερος (throughput)" }, { value: "latency", label: "Μικρότερη καθυστέρηση" }], width: "half", group: "advisor", help: "Όταν ένα μοντέλο προσφέρεται από πολλούς παρόχους, ποιον προτιμάμε." },
      { key: "model", label: "Κύριο μοντέλο (Ερμής, κείμενα)", type: "text", placeholder: "openrouter/auto", help: "π.χ. anthropic/claude-sonnet-4.5, openai/gpt-5, google/gemini-2.5-pro. Κενό = openrouter/auto.", width: "half", group: "advisor", rule: { re: /^[\w.-]+\/[\w.:-]+$/, bad: "Μορφή εταιρεία/μοντέλο, π.χ. openai/gpt-5" } },
      { key: "modelFast", label: "Γρήγορο/φθηνό μοντέλο", type: "text", placeholder: "google/gemini-2.5-flash", width: "half", group: "advisor", help: "Για alt text, ταξινόμηση και βήματα agent — εκεί που μετρά η ταχύτητα.", rule: { re: /^[\w.-]+\/[\w.:-]+$/, bad: "Μορφή εταιρεία/μοντέλο" } },
      { key: "modelVision", label: "Μοντέλο εικόνας (alt text, Snap & Find)", type: "text", placeholder: "google/gemini-2.5-flash", help: "Κενό = το γρήγορο μοντέλο.", width: "half", group: "advisor", rule: { re: /^[\w.-]+\/[\w.:-]+$/, bad: "Μορφή εταιρεία/μοντέλο" } },
      { key: "fallbackModels", label: "Fallback μοντέλα", type: "text", placeholder: "anthropic/claude-sonnet-4.5, openai/gpt-4.1-mini", help: "Με κόμμα· δοκιμάζονται με τη σειρά αν το πρώτο αποτύχει ή είναι κάτω.", width: "half", group: "advisor" },
      { key: "embedModel", label: "Μοντέλο embeddings (ευρετήριο Ερμή)", type: "text", placeholder: "openai/text-embedding-3-small", width: "half", group: "advisor", help: "Πρέπει να δίνει 1536 διαστάσεις — τόσες έχει το ευρετήριο στη βάση. Αλλαγή μοντέλου ξαναϋπολογίζει όλα τα embeddings." },
      { key: "dailyBudgetUsd", label: "Ημερήσιο όριο κόστους", type: "number", placeholder: "10", help: "Όταν ξεπεραστεί, ο Ερμής γυρίζει σε κανόνες μέχρι την επόμενη μέρα.", width: "half", group: "advisor", min: 0, step: 1, unit: "$" },
      { key: "maxTokens", label: "Μέγιστο μήκος απάντησης", type: "number", placeholder: "600", width: "half", group: "advisor", min: 100, max: 8000, step: 50, unit: "tokens", help: "≈ 0,75 λέξεις ανά token. 600 = σύντομη, περιεκτική απάντηση." },
      { key: "temperature", label: "Δημιουργικότητα (temperature)", type: "number", placeholder: "0.4", width: "half", group: "advisor", min: 0, max: 2, step: 0.1, help: "0 = πάντα η ίδια, ακριβής απάντηση· 1 = πιο ελεύθερη. Για πωλητή: 0.3–0.5." },
      { key: "siteTitle", label: "Όνομα app στο OpenRouter (X-Title)", type: "text", placeholder: "euronics.gr", width: "half", group: "advisor", help: "Πώς εμφανίζεται η εφαρμογή στα στατιστικά του OpenRouter." },
      { ...yesNo("voiceEnabled", "Φωνή στον Ερμή (δοκιμαστικό)", "Μικρόφωνο (speech-to-text) και εκφώνηση απαντήσεων (text-to-speech), με cache έτοιμου ήχου.", true), group: "voice" },
      { key: "voiceProvider", label: "Πάροχος φωνής", type: "select", options: [{ value: "openrouter", label: "OpenRouter — μοντέλο με audio (gpt-audio)" }, { value: "elevenlabs", label: "ElevenLabs — καθαρό TTS" }], help: "Το ElevenLabs θέλει ELEVENLABS_API_KEY στο περιβάλλον του server· χωρίς αυτό μένει το OpenRouter. Κάθε πάροχος έχει δική του cache ήχου. Η απομαγνητοφώνηση μένει στο OpenRouter.", width: "half", group: "voice", showIf: on("voiceEnabled") },
      { key: "voiceRate", label: "Επιπλέον ταχύτητα στον browser", type: "number", placeholder: "1", public: true, help: "Πολλαπλασιαστής αναπαραγωγής (1 = όπως το αρχείο). Αλλάζει χωρίς αναδημιουργία ήχου.", width: "half", group: "voice", showIf: on("voiceEnabled"), min: 0.5, max: 2, step: 0.05, unit: "×" },
      { key: "elevenVoiceId", label: "ElevenLabs · Voice ID", type: "text", placeholder: "JBFqnCBsd6RMkjVDRZzb", help: "Διάλεξε φωνή με ΕΛΛΗΝΙΚΗ μητρική προφορά (Voice Library με φίλτρο Greek, π.χ. Georgios, Theos, Iordanis). Το κουμπί «Δοκιμή» δείχνει τις φωνές του λογαριασμού.", width: "half", group: "voice", showIf: (v) => v.voiceEnabled === true && v.voiceProvider === "elevenlabs", rule: { re: /^[A-Za-z0-9]{20}$/, bad: "Το Voice ID έχει 20 λατινικούς χαρακτήρες/ψηφία" } },
      { key: "elevenModel", label: "ElevenLabs · Μοντέλο", type: "select", options: [{ value: "eleven_v3", label: "v3 — το πιο ζωντανό, με audio tags (≈ 1,3 s)" }, { value: "eleven_flash_v2_5", label: "Flash v2.5 — ο ταχύτερος (≈ 0,35 s)" }, { value: "eleven_multilingual_v2", label: "Multilingual v2 — σταθερό (≈ 2 s)" }, { value: "eleven_turbo_v2_5", label: "Turbo v2.5 — ισορροπία" }], help: "Χρόνοι μέχρι τον πρώτο ήχο. Το v3 αγνοεί την ταχύτητα· τα άλλα τη σέβονται. Για ελληνική προφορά μετρά κυρίως η φωνή.", width: "half", group: "voice", showIf: (v) => v.voiceEnabled === true && v.voiceProvider === "elevenlabs" },
      { key: "elevenTags", label: "ElevenLabs · Βασικά audio tags", type: "text", placeholder: "[warm]", help: "Μόνο v3. Ο βασικός τόνος: [warm], [calm], [confident], [cheerful]… Αλλαγή = νέα cache ήχου.", width: "half", group: "voice", showIf: (v) => v.voiceEnabled === true && v.voiceProvider === "elevenlabs" && (v.elevenModel || "eleven_v3") === "eleven_v3", rule: { re: /^(\[[a-z ]+\]\s*)+$/, bad: "Σε αγκύλες, π.χ. [warm] [calm]" } },
      { ...yesNo("elevenAutoTags", "ElevenLabs · Χρωματισμός ανά πρόταση", "Μόνο v3. Ερώτηση → [curious], προσφορά → [happy], πρόταση → [confident], «δυστυχώς» → [thoughtful]. Κανόνες, χωρίς κόστος."), group: "voice", showIf: (v: Values) => v.voiceEnabled === true && v.voiceProvider === "elevenlabs" && (v.elevenModel || "eleven_v3") === "eleven_v3" },
      { key: "elevenSpeed", label: "ElevenLabs · Ταχύτητα", type: "number", placeholder: "1.0", help: "1.0 = φυσικός ρυθμός. Πάνω από 1.1 ακούγεται βιαστικό.", width: "half", group: "voice", showIf: (v) => v.voiceEnabled === true && v.voiceProvider === "elevenlabs" && (v.elevenModel || "eleven_v3") !== "eleven_v3", min: 0.7, max: 1.2, step: 0.05, unit: "×" },
      { key: "elevenTempo", label: "ElevenLabs · Επιτάχυνση ομιλίας", type: "number", placeholder: "1", help: "Επιτάχυνση με διατήρηση του τόνου της φωνής (ffmpeg atempo) — δουλεύει και στο v3. 1.3 = 30% πιο γρήγορα. Αλλαγή = οι φράσεις ξαναεκφωνούνται (νέα cache) όταν ζητηθούν.", width: "half", group: "voice", showIf: (v) => v.voiceEnabled === true && v.voiceProvider === "elevenlabs", min: 0.8, max: 1.6, step: 0.05, unit: "×" },
      { key: "elevenStability", label: "ElevenLabs · Σταθερότητα", type: "number", placeholder: "0.5", help: "Ψηλά = πιο σταθερή, σοβαρή εκφώνηση· χαμηλά = πιο εκφραστική.", width: "half", group: "voice", showIf: (v) => v.voiceEnabled === true && v.voiceProvider === "elevenlabs", min: 0, max: 1, step: 0.05 },
      { key: "elevenSimilarity", label: "ElevenLabs · Πιστότητα φωνής", type: "number", placeholder: "0.8", width: "half", group: "voice", showIf: (v) => v.voiceEnabled === true && v.voiceProvider === "elevenlabs", min: 0, max: 1, step: 0.05, help: "Πόσο κοντά στη φωνή-πρότυπο. 0.75–0.85 συνήθως." },
      { key: "elevenUsdPer1kChars", label: "ElevenLabs · Κόστος ανά 1.000 χαρακτήρες", type: "number", placeholder: "0.1", help: "Εκτίμηση για τις αναφορές κόστους (ανάλογα με το πλάνο σου).", width: "half", group: "voice", showIf: (v) => v.voiceEnabled === true && v.voiceProvider === "elevenlabs", min: 0, step: 0.01, unit: "$" },
      { key: "voiceTtsModel", label: "Μοντέλο εκφώνησης (OpenRouter)", type: "text", placeholder: "openai/gpt-audio-mini", help: "Chat μοντέλο με audio output. Χρέωση ανά audio token.", width: "half", group: "voice", showIf: (v) => v.voiceEnabled === true && v.voiceProvider !== "elevenlabs" },
      { key: "voiceName", label: "Φωνή του Ερμή", type: "select", options: [{ value: "ash", label: "Ash (αρσενική, ζεστή)" }, { value: "echo", label: "Echo (αρσενική, καθαρή)" }, { value: "verse", label: "Verse (αρσενική, νεανική)" }, { value: "ballad", label: "Ballad (αρσενική, ήρεμη)" }, { value: "sage", label: "Sage (ουδέτερη)" }, { value: "alloy", label: "Alloy (ουδέτερη)" }, { value: "nova", label: "Nova (θηλυκή)" }, { value: "shimmer", label: "Shimmer (θηλυκή)" }, { value: "coral", label: "Coral (θηλυκή)" }], width: "half", group: "voice", showIf: (v) => v.voiceEnabled === true && v.voiceProvider !== "elevenlabs" },
      { key: "voiceStyle", label: "Ύφος εκφώνησης", type: "text", placeholder: "Ζεστός, σίγουρος τόνος, γρήγορος ρυθμός χωρίς παύσεις.", help: "Οδηγία τόνου/ρυθμού προς το μοντέλο. Αλλαγή = «Αναδημιουργία όλων» στο audio cache.", width: "half", group: "voice", showIf: (v) => v.voiceEnabled === true && v.voiceProvider !== "elevenlabs" },
      { key: "voiceTempo", label: "Ταχύτητα ομιλίας (στο αρχείο)", type: "number", placeholder: "1.4", help: "Επιτάχυνση με διατήρηση τονικότητας. 1.4 = 40% πιο γρήγορα. Αλλαγή = «Αναδημιουργία όλων».", width: "half", group: "voice", showIf: (v) => v.voiceEnabled === true && v.voiceProvider !== "elevenlabs", min: 0.5, max: 2, step: 0.05, unit: "×" },
      { key: "voiceSttModel", label: "Μοντέλο απομαγνητοφώνησης", type: "text", placeholder: "openai/whisper-large-v3", help: "Μετατρέπει την ομιλία του πελάτη σε κείμενο. Ελληνικά: άριστα.", width: "half", group: "voice", showIf: on("voiceEnabled") },
      { key: "voiceCacheMaxChars", label: "Cache φράσεων έως", type: "number", placeholder: "400", help: "Φράσεις μέχρι αυτό το μήκος αποθηκεύονται ως έτοιμος ήχος και δεν ξαναχρεώνονται.", width: "half", group: "voice", showIf: on("voiceEnabled"), min: 0, max: 4000, step: 50, unit: "χαρ." },
      { key: "bgRemoval", label: "Αφαίρεση φόντου εικόνων", type: "select", options: [{ value: "rembg", label: "Τοπικό rembg (birefnet)" }, { value: "removebg", label: "remove.bg API" }, { value: "off", label: "Ανενεργό" }], help: "Χρησιμοποιείται από τη βιβλιοθήκη media για cutouts προϊόντων.", width: "half", group: "media" },
      { key: "removeBgApiKey", label: "remove.bg API key", type: "secret", width: "half", group: "media", showIf: is("bgRemoval", "removebg") },
      { key: "rembgCommand", label: "Εντολή rembg", type: "text", placeholder: "rembg", help: "Διαδρομή του CLI στον server (π.χ. /opt/rembg/bin/rembg).", width: "half", group: "media", showIf: is("bgRemoval", "rembg", "") },
      { key: "mapsApiKey", label: "Google Maps API key", type: "secret", width: "half", group: "services", help: "Για τον χάρτη καταστημάτων. Περιόρισέ το στο domain σου στο Google Cloud (HTTP referrers)." },
      { key: "geoProvider", label: "Γεωεντοπισμός (IP)", type: "select", options: [{ value: "ipapi", label: "ipapi.co" }, { value: "maxmind", label: "MaxMind" }, { value: "cloudflare", label: "Cloudflare headers" }], width: "half", group: "services", help: "Βρίσκει το πλησιέστερο κατάστημα χωρίς να ζητήσει τοποθεσία από τον browser." },
      { key: "geoApiKey", label: "Geo API key", type: "secret", width: "half", group: "services", showIf: not("geoProvider", "cloudflare"), help: "Για ipapi.co είναι προαιρετικό (δωρεάν όριο ημέρας)." },
      { key: "searchProvider", label: "Αναζήτηση", type: "select", options: [{ value: "local", label: "Ενσωματωμένη" }, { value: "algolia", label: "Algolia" }, { value: "meilisearch", label: "Meilisearch" }], width: "half", group: "services" },
      { key: "searchApiKey", label: "Search API key", type: "secret", width: "half", group: "services", showIf: not("searchProvider", "local", "") },
      { key: "searchHost", label: "Search host / app ID", type: "text", width: "half", group: "services", showIf: not("searchProvider", "local", ""), help: "Algolia: Application ID. Meilisearch: URL του server." },
    ],
  },
];

export const SECTION_GROUPS: { key: Section["group"]; label: string }[] = [
  { key: "site", label: "Site" },
  { key: "commerce", label: "Εμπόριο" },
  { key: "marketing", label: "Marketing" },
  { key: "integrations", label: "Διασυνδέσεις" },
];

export const sectionByKey = (key: string) => SECTIONS.find((s) => s.key === key);
export const isSecret = (f: Field) => f.type === "secret";
