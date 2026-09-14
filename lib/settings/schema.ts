/**
 * Schema-first definition of the back-office settings. The admin UI, the
 * validation, the encryption of secrets and the storefront readers are all
 * driven by this file — add a field here and it appears in /admin/settings.
 * Only the super-admin can open these pages (integrations, keys, secrets).
 */
export type FieldType = "text" | "url" | "email" | "number" | "secret" | "toggle" | "select" | "textarea" | "softone-objs";

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
}

export interface Section {
  key: string;
  title: string;
  description: string;
  group: "site" | "integrations" | "marketing" | "commerce";
  /** server action name for a «Δοκιμή σύνδεσης» button */
  test?: "softone" | "smtp" | "openrouter" | "bunny";
  fields: Field[];
}

const yesNo = (key: string, label: string, help?: string, pub = false): Field => ({ key, label, type: "toggle", help, public: pub, width: "half" });

export const SECTIONS: Section[] = [
  {
    key: "general",
    title: "Γενικά",
    description: "Ταυτότητα του site και στοιχεία εταιρείας που εμφανίζονται σε footer, έγγραφα και emails.",
    group: "site",
    fields: [
      { key: "siteName", label: "Όνομα site", type: "text", public: true, required: true, placeholder: "Euronics", width: "half" },
      { key: "baseUrl", label: "Βασικό URL", type: "url", public: true, required: true, placeholder: "https://www.euronics.gr", width: "half" },
      { key: "legalName", label: "Επωνυμία εταιρείας", type: "text", public: true, width: "half" },
      { key: "vat", label: "ΑΦΜ", type: "text", public: true, width: "half" },
      { key: "address", label: "Διεύθυνση έδρας", type: "text", public: true },
      { key: "phone", label: "Τηλέφωνο εξυπηρέτησης", type: "text", public: true, width: "half" },
      { key: "email", label: "Email εξυπηρέτησης", type: "email", public: true, width: "half" },
      yesNo("maintenance", "Λειτουργία συντήρησης", "Το storefront δείχνει σελίδα συντήρησης· το /admin μένει ανοιχτό.", true),
    ],
  },
  {
    key: "social",
    title: "Social προφίλ",
    description: "Σύνδεσμοι που εμφανίζονται στο footer και στα share/OG metadata.",
    group: "marketing",
    fields: [
      { key: "facebook", label: "Facebook", type: "url", public: true, width: "half" },
      { key: "instagram", label: "Instagram", type: "url", public: true, width: "half" },
      { key: "youtube", label: "YouTube", type: "url", public: true, width: "half" },
      { key: "tiktok", label: "TikTok", type: "url", public: true, width: "half" },
      { key: "linkedin", label: "LinkedIn", type: "url", public: true, width: "half" },
      { key: "x", label: "X (Twitter)", type: "url", public: true, width: "half" },
      { key: "ogImage", label: "Προεπιλεγμένη εικόνα κοινοποίησης (OG)", type: "url", public: true, help: "1200×630 px" },
    ],
  },
  {
    key: "social-login",
    title: "Social login",
    description: "Σύνδεση πελατών με Google, Microsoft, Facebook, Apple. Τα secrets αποθηκεύονται κρυπτογραφημένα.",
    group: "integrations",
    fields: [
      yesNo("googleEnabled", "Google", undefined, true),
      { key: "googleClientId", label: "Google client ID", type: "text", width: "half" },
      { key: "googleClientSecret", label: "Google client secret", type: "secret", width: "half" },
      yesNo("microsoftEnabled", "Microsoft", undefined, true),
      { key: "microsoftClientId", label: "Microsoft client ID", type: "text", width: "half" },
      { key: "microsoftClientSecret", label: "Microsoft client secret", type: "secret", width: "half" },
      { key: "microsoftTenant", label: "Microsoft tenant", type: "text", placeholder: "common", width: "half" },
      yesNo("facebookEnabled", "Facebook", undefined, true),
      { key: "facebookAppId", label: "Facebook app ID", type: "text", width: "half" },
      { key: "facebookAppSecret", label: "Facebook app secret", type: "secret", width: "half" },
      yesNo("appleEnabled", "Apple", undefined, true),
      { key: "appleClientId", label: "Apple services ID", type: "text", width: "half" },
      { key: "appleSecret", label: "Apple client secret (JWT)", type: "secret", width: "half" },
    ],
  },
  {
    key: "analytics",
    title: "Analytics & pixels",
    description: "Φορτώνονται στο storefront μόνο μετά από συγκατάθεση cookies (consent mode).",
    group: "marketing",
    fields: [
      { key: "ga4", label: "Google Analytics 4 measurement ID", type: "text", public: true, placeholder: "G-XXXXXXX", width: "half" },
      { key: "gtm", label: "Google Tag Manager container", type: "text", public: true, placeholder: "GTM-XXXXXX", width: "half" },
      { key: "googleAds", label: "Google Ads conversion ID", type: "text", public: true, placeholder: "AW-XXXXXXX", width: "half" },
      { key: "metaPixel", label: "Meta Pixel ID", type: "text", public: true, width: "half" },
      { key: "tiktokPixel", label: "TikTok Pixel ID", type: "text", public: true, width: "half" },
      { key: "clarity", label: "Microsoft Clarity ID", type: "text", public: true, width: "half" },
      { key: "hotjar", label: "Hotjar site ID", type: "text", public: true, width: "half" },
      { key: "gsc", label: "Google Search Console verification", type: "text", public: true, width: "half" },
      yesNo("consentMode", "Google Consent Mode v2", "Στέλνει default denied μέχρι τη συγκατάθεση.", true),
    ],
  },
  {
    key: "softone",
    title: "SoftOne ERP (Web Services)",
    description: "Σύνδεση με το SoftOne μέσω των επίσημων s1services (login → authenticate, session ανά ημέρα, Windows-1253).",
    group: "integrations",
    test: "softone",
    fields: [
      yesNo("enabled", "Ενεργός συγχρονισμός"),
      { key: "url", label: "URL web services", type: "text", required: true, placeholder: "https://123456.oncloud.gr/s1services", help: "Ή μόνο το serial (123456) για oncloud.", width: "half" },
      { key: "appId", label: "App ID", type: "text", required: true, width: "half" },
      { key: "username", label: "Username", type: "text", required: true, width: "half" },
      { key: "password", label: "Password", type: "secret", required: true, width: "half" },
      { key: "objs", label: "Εταιρεία · Υποκατάστημα · Module · Χρήστης", type: "softone-objs", help: "Με τα τέσσερα παραπάνω, το πρώτο login φέρνει τις διαθέσιμες επιλογές από το SoftOne." },
      { key: "syncMinutes", label: "Συχνότητα συγχρονισμού (λεπτά)", type: "number", placeholder: "15", width: "half" },
      yesNo("customersAutoPush", "Αυτόματη αποστολή νέων πελατών στο SoftOne", "Κάθε νέος λογαριασμός / πρώτη παραγγελία δημιουργεί CUSTOMER (TRDR)."),
      { key: "customerCodePrefix", label: "Πρόθεμα κωδικού πελάτη (CODE)", type: "text", placeholder: "WEB", help: "Ο κωδικός γίνεται π.χ. WEB000123 από τον αριθμό πελάτη του e-shop.", width: "half" },
      { key: "customerCountry", label: "Χώρα (COUNTRY id)", type: "text", placeholder: "1000", width: "half" },
      { key: "customerCurrency", label: "Νόμισμα (SOCURRENCY id)", type: "text", placeholder: "100", width: "half" },
      { key: "customerVatSts", label: "Καθεστώς ΦΠΑ (VATSTS)", type: "text", placeholder: "1", width: "half" },
      { key: "customerTrdCategory", label: "Λογιστική κατηγορία (TRDCATEGORY)", type: "text", placeholder: "", width: "half" },
      { key: "customerPayment", label: "Τρόπος πληρωμής (PAYMENT)", type: "text", placeholder: "", width: "half" },
      { key: "priceList", label: "Τιμοκατάλογος web", type: "text", placeholder: "π.χ. 1", width: "half" },
      { key: "webFilter", label: "Φίλτρο ειδών web (SQL filter)", type: "textarea", placeholder: "ITEM.WEBACTIVE=1" },
    ],
  },
  {
    key: "payments",
    title: "Πληρωμές",
    description: "Πάροχος καρτών, wallets και εναλλακτικοί τρόποι πληρωμής.",
    group: "commerce",
    fields: [
      { key: "provider", label: "Πάροχος καρτών", type: "select", public: true, options: [{ value: "viva", label: "Viva Wallet" }, { value: "everypay", label: "EveryPay" }, { value: "cardlink", label: "Cardlink" }, { value: "stripe", label: "Stripe" }], width: "half" },
      { key: "mode", label: "Περιβάλλον", type: "select", public: true, options: [{ value: "test", label: "Test / demo" }, { value: "live", label: "Live" }], width: "half" },
      { key: "merchantId", label: "Merchant ID", type: "text", width: "half" },
      { key: "clientId", label: "Client ID", type: "text", width: "half" },
      { key: "clientSecret", label: "Client secret", type: "secret", width: "half" },
      { key: "apiKey", label: "API key", type: "secret", width: "half" },
      { key: "webhookSecret", label: "Webhook secret", type: "secret", width: "half" },
      { key: "sourceCode", label: "Source code (Viva)", type: "text", width: "half" },
      yesNo("applePay", "Apple Pay", undefined, true),
      yesNo("googlePay", "Google Pay", undefined, true),
      yesNo("revolutPay", "Revolut Pay", undefined, true),
      { key: "revolutApiKey", label: "Revolut merchant API key", type: "secret" },
      yesNo("cod", "Αντικαταβολή", undefined, true),
      { key: "codFee", label: "Χρέωση αντικαταβολής (€)", type: "number", public: true, width: "half" },
      { key: "codMax", label: "Μέγιστο ποσό αντικαταβολής (€)", type: "number", public: true, width: "half" },
      yesNo("bankTransfer", "Κατάθεση σε τράπεζα", undefined, true),
      { key: "iban", label: "IBAN", type: "text", public: true },
      { key: "maxInstalments", label: "Μέγιστες άτοκες δόσεις", type: "number", public: true, width: "half" },
    ],
  },
  {
    key: "shipping",
    title: "Αποστολές & courier",
    description: "Διασυνδέσεις courier και κανόνες αποστολής.",
    group: "commerce",
    fields: [
      { key: "courier", label: "Κύριος courier", type: "select", public: true, options: [{ value: "acs", label: "ACS" }, { value: "geniki", label: "Γενική Ταχυδρομική" }, { value: "elta", label: "ΕΛΤΑ Courier" }, { value: "speedex", label: "Speedex" }, { value: "boxnow", label: "BOX NOW" }], width: "half" },
      { key: "courierAccount", label: "Κωδικός πελάτη courier", type: "text", width: "half" },
      { key: "courierApiKey", label: "Courier API key", type: "secret", width: "half" },
      { key: "boxnowApiKey", label: "BOX NOW API key", type: "secret", width: "half" },
      { key: "freeShippingFrom", label: "Δωρεάν αποστολή από (€)", type: "number", public: true, width: "half" },
      { key: "shippingFee", label: "Βασικό κόστος αποστολής (€)", type: "number", public: true, width: "half" },
      yesNo("clickCollect", "Click & Collect", undefined, true),
      yesNo("appointmentDelivery", "Παράδοση με ραντεβού (λευκές συσκευές)", undefined, true),
      { key: "clickCollectHours", label: "Έτοιμο για παραλαβή σε (ώρες)", type: "number", public: true, width: "half" },
    ],
  },
  {
    key: "bunny",
    title: "Bunny CDN",
    description: "Αποθήκευση και διανομή εικόνων, cutouts, 3D μοντέλων και video μέσω Bunny Storage + Pull Zone, με Bunny Optimizer για responsive εικόνες.",
    group: "integrations",
    test: "bunny",
    fields: [
      yesNo("enabled", "Χρήση CDN για media", "Όταν είναι ανενεργό, τα media σερβίρονται από το /public.", true),
      { key: "cdnUrl", label: "Pull zone URL", type: "url", public: true, required: true, placeholder: "https://euronics.b-cdn.net", width: "half" },
      { key: "pullZoneId", label: "Pull zone ID", type: "text", placeholder: "123456", help: "Για purge cache.", width: "half" },
      { key: "storageZone", label: "Storage zone name", type: "text", required: true, placeholder: "euronics-media", width: "half" },
      { key: "storageRegion", label: "Storage region", type: "select", options: [{ value: "", label: "Falkenstein (DE, default)" }, { value: "uk", label: "London (UK)" }, { value: "ny", label: "New York (US)" }, { value: "la", label: "Los Angeles (US)" }, { value: "sg", label: "Singapore" }, { value: "se", label: "Stockholm (SE)" }, { value: "br", label: "São Paulo (BR)" }, { value: "jh", label: "Johannesburg (ZA)" }, { value: "syd", label: "Sydney (AU)" }], help: "Ορίζει το storage endpoint ({region}.storage.bunnycdn.com).", width: "half" },
      { key: "storagePassword", label: "Storage zone password (FTP & API)", type: "secret", required: true, width: "half" },
      { key: "accountApiKey", label: "Account API key", type: "secret", help: "Μόνο για purge & στατιστικά.", width: "half" },
      { key: "basePath", label: "Βασικός φάκελος", type: "text", placeholder: "/media", width: "half" },
      yesNo("optimizer", "Bunny Optimizer (responsive εικόνες)", "Παράμετροι ?width= &quality= &format= στα URLs.", true),
      { key: "imageQuality", label: "Ποιότητα εικόνων (%)", type: "number", public: true, placeholder: "82", width: "half" },
      { key: "tokenAuthKey", label: "Token authentication key", type: "secret", help: "Για υπογεγραμμένα URLs (π.χ. τιμολόγια, εγγυήσεις).", width: "half" },
      { key: "backupZone", label: "Backup storage zone", type: "text", placeholder: "euronics-backups", help: "Ξεχωριστό Bunny Storage zone ΧΩΡΙΣ pull zone για τα αντίγραφα της βάσης. Κενό = φάκελος _backups/ στο zone των media (τα αρχεία κρυπτογραφούνται και έχουν τυχαίο όνομα).", width: "half" },
      { key: "backupZonePassword", label: "Backup zone password", type: "secret", help: "Κενό = ο κωδικός του zone των media.", width: "half" },
      { key: "backupRetentionDays", label: "Διατήρηση backup (ημέρες)", type: "number", placeholder: "30", help: "Παλαιότερα αντίγραφα διαγράφονται αυτόματα μετά από κάθε επιτυχημένο backup.", width: "half" },
    ],
  },
  {
    key: "aade",
    title: "ΑΑΔΕ",
    description: "Αναζήτηση ΑΦΜ στο μητρώο επιχειρήσεων (RgWsPublic2) για τιμολόγηση: επωνυμία, ΔΟΥ, έδρα, ΚΑΔ και αν ο ΑΦΜ είναι ενεργός.",
    group: "integrations",
    fields: [
      yesNo("vatEnabled", "Αναζήτηση ΑΦΜ ενεργή", "Χωρίς αυτό το checkout ζητά τα στοιχεία χειροκίνητα.", true),
      { key: "vatSource", label: "Πηγή", type: "select", options: [{ value: "proxy", label: "Proxy afm2info (χωρίς κωδικούς)" }, { value: "soap", label: "Απευθείας ΑΑΔΕ (ειδικοί κωδικοί)" }], help: "Ο proxy δεν χρειάζεται κωδικούς αλλά δεν επιστρέφει τον κωδικό Δ.Ο.Υ. — η αντιστοίχιση με το IRSDATA γίνεται τότε με το όνομα.", width: "half" },
      { key: "vatProxyUrl", label: "Proxy URL", type: "url", placeholder: "https://vat.wwa.gr/afm2info", width: "half" },
      { key: "vatUsername", label: "Username ειδικών κωδικών", type: "text", help: "Ειδικοί κωδικοί που εκδίδονται από το TAXISnet για την υπηρεσία «Στοιχεία Επιχειρήσεων» — ΟΧΙ οι κωδικοί TAXISnet. Μόνο για την απευθείας σύνδεση.", width: "half" },
      { key: "vatPassword", label: "Password ειδικών κωδικών", type: "secret", width: "half" },
      { key: "vatCalledBy", label: "ΑΦΜ εταιρείας (afm_called_by)", type: "text", placeholder: "094xxxxxx", help: "Ο ΑΦΜ που κάνει την κλήση. Κενό αν οι κωδικοί είναι προσωπικοί.", width: "half" },
      { key: "vatEndpoint", label: "Endpoint", type: "url", placeholder: "https://www1.gsis.gr/wsaade/RgWsPublic2/RgWsPublic2", help: "Κενό = παραγωγικό. Για δοκιμές: https://www1.gsis.gr/wsaadedg/RgWsPublic2/RgWsPublic2", width: "half" },
    ],
  },
  {
    key: "email",
    title: "Email & SMS",
    description: "Αποστολή συναλλακτικών emails, newsletter και SMS.",
    group: "integrations",
    test: "smtp",
    fields: [
      { key: "fromName", label: "Όνομα αποστολέα", type: "text", placeholder: "Euronics", width: "half" },
      { key: "fromEmail", label: "Email αποστολέα", type: "email", placeholder: "noreply@euronics.gr", width: "half" },
      { key: "emailLogoUrl", label: "Λογότυπο emails (URL)", type: "url", placeholder: "https://euronics.b-cdn.net/brand/euronics-logo-white.png", help: "Απόλυτο URL που φτάνουν οι email clients — λευκό λογότυπο σε διαφάνεια. Κενό = το αντίγραφο στο Bunny CDN.", width: "half" },
      { key: "emailAssetUrl", label: "Base URL εικόνων emails", type: "url", placeholder: "https://euronics.dgsoft.gr", help: "Πού τρέχει ΑΥΤΗ η εφαρμογή — από εκεί σερβίρονται οι εικόνες των emails. Διαφορετικό από το site του πελάτη όσο το euronics.gr δείχνει το παλιό site.", width: "half" },
      { key: "transport", label: "Μεταφορά", type: "select", options: [{ value: "smtp", label: "SMTP" }, { value: "resend", label: "Resend" }, { value: "sendgrid", label: "SendGrid" }, { value: "mailgun", label: "Mailgun" }], width: "half" },
      { key: "apiKey", label: "API key παρόχου", type: "secret", width: "half" },
      { key: "mailgunDomain", label: "Mailgun domain", type: "text", placeholder: "mg.euronics.gr", help: "Το επιβεβαιωμένο sending domain. Κενό = το domain του email αποστολέα.", width: "half" },
      { key: "mailgunRegion", label: "Mailgun region", type: "select", options: [{ value: "eu", label: "EU (api.eu.mailgun.net)" }, { value: "us", label: "US (api.mailgun.net)" }], width: "half" },
      { key: "smtpHost", label: "SMTP host", type: "text", width: "half" },
      { key: "smtpPort", label: "SMTP port", type: "number", placeholder: "587", width: "half" },
      { key: "smtpUser", label: "SMTP user", type: "text", width: "half" },
      { key: "smtpPass", label: "SMTP password", type: "secret", width: "half" },
      { key: "newsletterProvider", label: "Newsletter", type: "select", options: [{ value: "", label: "—" }, { value: "mailchimp", label: "Mailchimp" }, { value: "klaviyo", label: "Klaviyo" }, { value: "moosend", label: "Moosend" }], width: "half" },
      { key: "newsletterApiKey", label: "Newsletter API key", type: "secret", width: "half" },
      { key: "newsletterList", label: "Newsletter list / audience ID", type: "text", width: "half" },
      { key: "smsProvider", label: "SMS", type: "select", options: [{ value: "", label: "—" }, { value: "yuboto", label: "Yuboto" }, { value: "apifon", label: "Apifon" }, { value: "twilio", label: "Twilio" }], width: "half" },
      { key: "smsApiKey", label: "SMS API key", type: "secret", width: "half" },
      { key: "smsSender", label: "SMS sender name", type: "text", placeholder: "EURONICS", width: "half" },
    ],
  },
  {
    key: "ai",
    title: "AI & υπηρεσίες",
    description: "Ο Ερμής (σύμβουλος), γεωεντοπισμός, χάρτες, αναζήτηση.",
    group: "integrations",
    test: "openrouter",
    fields: [
      yesNo("advisorEnabled", "Ο Ερμής ενεργός", "Απαντήσεις με LLM· χωρίς κλειδί πέφτει στους κανόνες demo.", true),
      { key: "openrouterApiKey", label: "OpenRouter API key", type: "secret", required: true, help: "Ένα κλειδί για όλα τα μοντέλα και όλες τις AI λειτουργίες (openrouter.ai/keys).", width: "half" },
      { key: "routing", label: "Δρομολόγηση μοντέλου", type: "select", options: [{ value: "auto", label: "Αυτόματη (openrouter/auto επιλέγει ανά ερώτηση)" }, { value: "task", label: "Ανά εργασία (τα μοντέλα παρακάτω)" }], help: "Στην αυτόματη, το OpenRouter διαλέγει το κατάλληλο μοντέλο για κάθε prompt· τα παρακάτω μένουν ως fallback.", width: "half" },
      { key: "providerSort", label: "Προτίμηση παρόχου", type: "select", options: [{ value: "", label: "Προεπιλογή OpenRouter" }, { value: "price", label: "Φθηνότερος" }, { value: "throughput", label: "Ταχύτερος (throughput)" }, { value: "latency", label: "Μικρότερη καθυστέρηση" }], width: "half" },
      { key: "model", label: "Κύριο μοντέλο (Ερμής, κείμενα)", type: "text", placeholder: "openrouter/auto", help: "OpenRouter model id, π.χ. anthropic/claude-sonnet-4.5, openai/gpt-5, google/gemini-2.5-pro. Κενό = openrouter/auto.", width: "half" },
      { key: "modelFast", label: "Γρήγορο/φθηνό μοντέλο (alt text, ταξινόμηση, agent βήματα)", type: "text", placeholder: "google/gemini-2.5-flash", width: "half" },
      { key: "modelVision", label: "Μοντέλο εικόνας (alt text, Snap & Find)", type: "text", placeholder: "google/gemini-2.5-flash", help: "Κενό = γρήγορο μοντέλο.", width: "half" },
      { key: "fallbackModels", label: "Fallback μοντέλα", type: "text", placeholder: "anthropic/claude-sonnet-4.5, openai/gpt-4.1-mini", help: "Με κόμμα· δοκιμάζονται με τη σειρά αν το πρώτο αποτύχει ή είναι κάτω.", width: "half" },
      { key: "dailyBudgetUsd", label: "Ημερήσιο όριο κόστους ($)", type: "number", placeholder: "10", help: "Όταν ξεπεραστεί, ο Ερμής γυρίζει σε κανόνες μέχρι την επόμενη μέρα.", width: "half" },
      yesNo("voiceEnabled", "Φωνή στον Ερμή (δοκιμαστικό)", "Μικρόφωνο (speech-to-text) και εκφώνηση απαντήσεων (text-to-speech) μέσω OpenRouter, με cache έτοιμου ήχου.", true),
      { key: "voiceTtsModel", label: "Μοντέλο εκφώνησης", type: "text", placeholder: "openai/gpt-audio-mini", help: "Chat μοντέλο με audio output (streaming pcm16). Χρέωση ανά audio token.", width: "half" },
      { key: "voiceName", label: "Φωνή του Ερμή", type: "select", options: [{ value: "ash", label: "Ash (αρσενική, ζεστή)" }, { value: "echo", label: "Echo (αρσενική, καθαρή)" }, { value: "verse", label: "Verse (αρσενική, νεανική)" }, { value: "ballad", label: "Ballad (αρσενική, ήρεμη)" }, { value: "sage", label: "Sage (ουδέτερη)" }, { value: "alloy", label: "Alloy (ουδέτερη)" }, { value: "nova", label: "Nova (θηλυκή)" }, { value: "shimmer", label: "Shimmer (θηλυκή)" }, { value: "coral", label: "Coral (θηλυκή)" }], width: "half" },
      { key: "voiceStyle", label: "Ύφος εκφώνησης", type: "text", placeholder: "Πολύ γρήγορος ρυθμός ομιλίας, σαν ενθουσιώδης νέος πωλητής που βιάζεται· χαρούμενος τόνος με χαμόγελο, ενέργεια, καθόλου παύσεις.", help: "Οδηγία τόνου/ρυθμού προς το μοντέλο. Αλλαγή = «Αναδημιουργία όλων» στο audio cache.", width: "half" },
      { key: "voiceTempo", label: "Ταχύτητα ομιλίας (στο αρχείο)", type: "number", placeholder: "1.4", help: "Επιτάχυνση με διατήρηση τονικότητας κατά την κωδικοποίηση (ffmpeg atempo). 1.4 = 40% πιο γρήγορα. Αλλαγή = «Αναδημιουργία όλων».", width: "half" },
      { key: "voiceRate", label: "Επιπλέον ταχύτητα στον browser", type: "number", placeholder: "1", public: true, help: "Πολλαπλασιαστής αναπαραγωγής πάνω στο αρχείο (1 = όπως το αρχείο, έως 2). Αλλάζει χωρίς αναδημιουργία.", width: "half" },
      { key: "voiceSttModel", label: "Μοντέλο απομαγνητοφώνησης", type: "text", placeholder: "openai/whisper-large-v3", help: "Endpoint /audio/transcriptions του OpenRouter. Ελληνικά: άριστα.", width: "half" },
      { key: "voiceCacheMaxChars", label: "Cache φράσεων έως (χαρακτήρες)", type: "number", placeholder: "400", help: "Φράσεις μέχρι αυτό το μήκος αποθηκεύονται ως έτοιμος ήχος και δεν ξαναχρεώνονται.", width: "half" },
      { key: "maxTokens", label: "Max tokens απάντησης", type: "number", placeholder: "600", width: "half" },
      { key: "temperature", label: "Temperature", type: "number", placeholder: "0.4", width: "half" },
      { key: "siteTitle", label: "Όνομα app στο OpenRouter (X-Title)", type: "text", placeholder: "euronics.gr", width: "half" },
      { key: "geoProvider", label: "Γεωεντοπισμός (IP)", type: "select", options: [{ value: "ipapi", label: "ipapi.co" }, { value: "maxmind", label: "MaxMind" }, { value: "cloudflare", label: "Cloudflare headers" }], width: "half" },
      { key: "geoApiKey", label: "Geo API key", type: "secret", width: "half" },
      { key: "mapsApiKey", label: "Google Maps API key", type: "secret", width: "half" },
      { key: "bgRemoval", label: "Αφαίρεση φόντου εικόνων", type: "select", options: [{ value: "rembg", label: "Τοπικό rembg (birefnet)" }, { value: "removebg", label: "remove.bg API" }, { value: "off", label: "Ανενεργό" }], help: "Χρησιμοποιείται από τη βιβλιοθήκη media.", width: "half" },
      { key: "removeBgApiKey", label: "remove.bg API key", type: "secret", width: "half" },
      { key: "rembgCommand", label: "Εντολή rembg", type: "text", placeholder: "rembg", help: "Διαδρομή του CLI στον server (π.χ. /opt/rembg/bin/rembg).", width: "half" },
      { key: "searchProvider", label: "Αναζήτηση", type: "select", options: [{ value: "local", label: "Ενσωματωμένη" }, { value: "algolia", label: "Algolia" }, { value: "meilisearch", label: "Meilisearch" }], width: "half" },
      { key: "searchApiKey", label: "Search API key", type: "secret", width: "half" },
      { key: "searchHost", label: "Search host / app ID", type: "text", width: "half" },
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
