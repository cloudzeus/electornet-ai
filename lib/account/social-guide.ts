/**
 * Ο αναλυτικός οδηγός ρύθμισης του social login (Google, Microsoft, Facebook, Apple) για το domain από το οποίο ζητήθηκε.
 * Καθαρές συναρτήσεις: δομή εγγράφου → Markdown (λήψη) και HTML (εκτύπωση / PDF). Τα URLs βγαίνουν από το origin, ακριβώς
 * όπως τα στέλνει η εφαρμογή στους παρόχους (lib/account/oauth.ts → redirectUri).
 */
export type GuideProvider = "google" | "microsoft" | "facebook" | "apple";
export const GUIDE_PROVIDERS: GuideProvider[] = ["google", "microsoft", "facebook", "apple"];

export interface GuideValue { label: string; value: string; note?: string }
export interface GuideStep { title: string; body: string[]; values?: GuideValue[]; warn?: string }
export interface GuideSection { id: GuideProvider; title: string; summary: string; console: GuideValue; before: string[]; steps: GuideStep[]; errors: { code: string; fix: string }[]; upkeep: string[] }
export interface GuideDoc { title: string; origin: string; host: string; generatedAt: string; isLocal: boolean; intro: string[]; urls: GuideValue[]; sections: GuideSection[]; finish: string[] }

const LIVE_FALLBACK = "https://euronics.dgsoft.gr";
const TENANT_LABEL: Record<string, string> = {
  consumers: "Personal Microsoft accounts only",
  common: "Accounts in any organizational directory and personal Microsoft accounts",
  organizations: "Accounts in any organizational directory",
};

export function buildSocialGuide(input: { origin: string; providers?: GuideProvider[]; microsoftTenant?: string | null; now?: Date }): GuideDoc {
  const origin = input.origin.replace(/\/+$/, "");
  const host = origin.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const hostname = host.replace(/:\d+$/, "");
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(hostname) || hostname.endsWith(".localhost");
  const isHttps = origin.startsWith("https://");
  // Οι νομικές σελίδες πρέπει να είναι δημόσιες (https): από τοπικό περιβάλλον, του live site
  const site = isHttps && !isLocal ? origin : LIVE_FALLBACK;
  const siteHost = site.replace(/^https?:\/\//, "");
  const regDomain = siteHost.split(".").slice(-2).join(".");
  const cb = (p: GuideProvider) => `${origin}/api/account/oauth/${p}/callback`;
  const tenant = input.microsoftTenant?.trim() || "consumers";
  const tenantLabel = TENANT_LABEL[tenant] ?? "Accounts in this organizational directory only (Single tenant)";
  const admin = `${origin}/admin/settings/social-login`;
  const privacy: GuideValue = { label: "Πολιτική απορρήτου", value: `${site}/aporrito` };
  const terms: GuideValue = { label: "Όροι χρήσης", value: `${site}/oroi-chrisis` };
  const deletion: GuideValue = { label: "Οδηγίες διαγραφής δεδομένων", value: `${site}/diagrafi-dedomenon` };
  const home: GuideValue = { label: "Αρχική σελίδα", value: `${site}/` };
  const testStep = (p: string): GuideStep => ({
    title: "Καταχώριση στοιχείων και έλεγχος στη διαχείριση",
    body: [
      `Άνοιξε τη διαχείριση στο ${admin} (Ρυθμίσεις → Social login) και πήγαινε στην ενότητα «${p}».`,
      "Συμπλήρωσε τα πεδία του «Βήμα 2 · Στοιχεία της εφαρμογής» με τις τιμές που αντέγραψες και πάτα «Αποθήκευση» (κάτω).",
      "Πάτα «Έλεγχος στοιχείων»: ο πάροχος επιβεβαιώνει ότι αναγνωρίζει την εφαρμογή. Αν βγει σφάλμα, δες τον πίνακα σφαλμάτων πιο κάτω.",
      `Πάτα «Δοκιμαστική σύνδεση»: συνδέεσαι με τον δικό σου λογαριασμό ${p} και επιστρέφεις στη σελίδα με το αποτέλεσμα. Δεν δημιουργείται λογαριασμός πελάτη και δουλεύει και με το κουμπί κλειστό.`,
      `Αν όλα είναι σωστά, άνοιξε τον διακόπτη «Εμφάνιση «Σύνδεση με ${p}» στους πελάτες» και αποθήκευσε. Το κουμπί εμφανίζεται αμέσως στη σύνδεση, στην εγγραφή και στο checkout.`,
    ],
  });

  const all: Record<GuideProvider, GuideSection> = {
    google: {
      id: "google", title: "Google", summary: "Σύνδεση με λογαριασμό Google (Gmail). Δωρεάν, χωρίς έλεγχο από τη Google για τα βασικά δικαιώματα (όνομα, email).",
      console: { label: "Google Cloud Console · Google Auth Platform", value: "https://console.cloud.google.com/auth/overview" },
      before: [
        "Εταιρικός λογαριασμός Google (π.χ. it@… της εταιρείας) — όχι προσωπικός υπαλλήλου, ώστε η πρόσβαση να μη χαθεί αν φύγει.",
        "Πρόσβαση στο email υποστήριξης που θα φαίνεται στους πελάτες στην οθόνη συναίνεσης.",
        "Προαιρετικά: λογότυπο τετράγωνο (120 × 120 px, PNG/JPG, έως 1 MB). Αν ανεβάσεις λογότυπο, η Google μπορεί να ζητήσει επαλήθευση του brand (μερικές εργάσιμες) πριν το εμφανίσει.",
      ],
      steps: [
        { title: "Έργο (project) στο Google Cloud", body: ["Άνοιξε το https://console.cloud.google.com/ και συνδέσου με τον εταιρικό λογαριασμό.", "Πάνω αριστερά, δίπλα στο λογότυπο, πάτα τον επιλογέα έργου → «New project».", "Project name: «Euronics Web» (ή όποιο όνομα θέλεις — δεν το βλέπουν οι πελάτες). Organization: της εταιρείας, αν υπάρχει. Πάτα «Create» και επίλεξε το νέο έργο από τον επιλογέα."] },
        { title: "Έναρξη Google Auth Platform", body: ["Μενού ☰ → «APIs & Services» → «OAuth consent screen» (ή απευθείας https://console.cloud.google.com/auth/overview).", "Πάτα «Get started».", "App information: App name «Euronics», User support email: το email υποστήριξης. «Next».", "Audience: «External» (πελάτες εκτός εταιρείας). «Next».", "Contact information: email του τεχνικού υπευθύνου (εκεί στέλνει ειδοποιήσεις η Google). «Next».", "Αποδέξου την πολιτική δεδομένων χρηστών της Google και πάτα «Create»."] },
        { title: "Branding: σύνδεσμοι και domain", body: ["Αριστερά «Branding». Συμπλήρωσε τα παρακάτω πεδία ακριβώς όπως είναι.", `Στο «Authorized domains» πάτα «Add domain» και γράψε το κύριο domain (${regDomain}) — χωρίς https:// και χωρίς www.`, "Πάτα «Save»."], values: [{ ...home, label: "Application home page" }, { ...privacy, label: "Application privacy policy link" }, { ...terms, label: "Application terms of service link" }, { label: "Authorized domain", value: regDomain }] },
        { title: "Data access: δικαιώματα (scopes)", body: ["Αριστερά «Data access» → «Add or remove scopes».", "Επίλεξε τα τρία βασικά: «openid», «…/auth/userinfo.email», «…/auth/userinfo.profile». Πάτα «Update» και «Save».", "Αυτά είναι «non-sensitive»: δεν χρειάζεται έλεγχος (verification) από τη Google."], values: [{ label: "Scopes", value: "openid email profile" }] },
        { title: "Audience: δημοσίευση", body: ["Αριστερά «Audience». Στο «Publishing status» πάτα «Publish app» → «Confirm». Η κατάσταση γίνεται «In production».", "Χωρίς αυτό, μπορούν να συνδεθούν μόνο οι λογαριασμοί της λίστας «Test users» (έως 100)."], warn: "Αν μείνει «Testing», οι πελάτες βλέπουν «Access blocked: … has not completed the Google verification process»." },
        { title: "Clients: δημιουργία OAuth client", body: ["Αριστερά «Clients» → «Create client».", "Application type: «Web application». Name: «Euronics web» (εσωτερικό).", "Στο «Authorized JavaScript origins» πάτα «Add URI» και επικόλλησε το origin (χωρίς / στο τέλος).", "Στο «Authorized redirect URIs» πάτα «Add URI» και επικόλλησε το redirect URI — ακριβώς, γράμμα προς γράμμα.", "Πάτα «Create»."], values: [{ label: "Authorized JavaScript origin", value: origin }, { label: "Authorized redirect URI", value: cb("google") }], warn: isLocal ? "Τοπικό περιβάλλον: η Google δέχεται http://localhost. Για το live site πρόσθεσε στο ίδιο client και το https origin/redirect του live (πάτα το κουμπί του οδηγού και από εκεί)." : undefined },
        { title: "Client ID και Client secret", body: ["Στο παράθυρο που ανοίγει αντίγραψε το «Client ID» (τελειώνει σε .apps.googleusercontent.com) και το «Client secret» (ξεκινά με GOCSPX-).", "Το secret αντίγραψέ το αμέσως και φύλαξέ το σε ασφαλές σημείο (password manager). Αν χαθεί: Clients → το client → «Add secret» και διαγραφή του παλιού.", "Οι αλλαγές της Google μπορεί να χρειαστούν από 5 λεπτά έως λίγες ώρες για να ισχύσουν."], values: [{ label: "Πεδίο διαχείρισης", value: "Client ID  ←  Client ID" }, { label: "Πεδίο διαχείρισης", value: "Client secret  ←  Client secret" }] },
        testStep("Google"),
      ],
      errors: [
        { code: "Error 400: redirect_uri_mismatch", fix: `Το redirect URI στο client δεν είναι ακριβώς ${cb("google")}. Έλεγξε https/http, www, κάθετο στο τέλος και ότι το πρόσθεσες στο σωστό client.` },
        { code: "Access blocked: … has not completed the Google verification process", fix: "Η εφαρμογή είναι σε «Testing». Audience → «Publish app»." },
        { code: "invalid_client (στον «Έλεγχο στοιχείων»)", fix: "Λάθος Client ID ή Client secret, ή secret άλλου client. Δημιούργησε νέο secret και ξαναδοκίμασε." },
        { code: "Error 400: origin_mismatch", fix: `Λείπει το ${origin} από τα «Authorized JavaScript origins».` },
      ],
      upkeep: ["Το Client secret δεν λήγει. Αν διαρρεύσει: «Add secret», ενημέρωση στη διαχείριση, διαγραφή του παλιού.", "Κάθε νέο domain (π.χ. αλλαγή σε euronics.gr) θέλει νέο origin και redirect URI στο ίδιο client."],
    },
    microsoft: {
      id: "microsoft", title: "Microsoft", summary: "Σύνδεση με λογαριασμό Microsoft (Outlook, Hotmail, Live, Xbox). Δωρεάν.",
      console: { label: "Microsoft Entra admin center · App registrations", value: "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" },
      before: [
        "Λογαριασμός στο Microsoft Entra ID (π.χ. ο διαχειριστής του Microsoft 365 της εταιρείας) με ρόλο «Application Developer» ή ανώτερο. Προσωπικός λογαριασμός Outlook χωρίς οργανισμό δεν αρκεί για νέες εγγραφές εφαρμογών.",
        `Τι λογαριασμοί θα δέχεστε — τώρα στη διαχείριση: «${tenant}» → στο Azure: «${tenantLabel}». Τα δύο πρέπει να ταιριάζουν.`,
      ],
      steps: [
        { title: "Νέα εγγραφή εφαρμογής", body: ["Άνοιξε το https://entra.microsoft.com → αριστερά «Identity» → «Applications» → «App registrations» → «New registration».", "Name: «Euronics» (αυτό βλέπει ο πελάτης στην οθόνη συναίνεσης).", `Supported account types: «${tenantLabel}».`, "Redirect URI: πλατφόρμα «Web» και η διεύθυνση παρακάτω.", "Πάτα «Register»."], values: [{ label: "Supported account types", value: tenantLabel }, { label: "Redirect URI (Web)", value: cb("microsoft") }], warn: isLocal ? "Τοπικό περιβάλλον: η Microsoft δέχεται http://localhost στην πλατφόρμα Web. Για το live πρόσθεσε το https redirect στο «Authentication → Add URI»." : undefined },
        { title: "Application (client) ID", body: ["Στη σελίδα «Overview» της εφαρμογής αντίγραψε το «Application (client) ID» (μορφή 00000000-0000-0000-0000-000000000000).", "Το «Directory (tenant) ID» χρειάζεται μόνο αν δέχεστε λογαριασμούς ενός συγκεκριμένου οργανισμού."], values: [{ label: "Πεδίο διαχείρισης", value: "Application (client) ID  ←  Application (client) ID" }] },
        { title: "Client secret", body: ["Αριστερά «Certificates & secrets» → καρτέλα «Client secrets» → «New client secret».", "Description: «Euronics web», Expires: έως 24 μήνες (π.χ. «730 days (24 months)»). Πάτα «Add».", "Αντίγραψε ΑΜΕΣΩΣ τη στήλη «Value» — εμφανίζεται μόνο τώρα. Το «Secret ID» δεν είναι το secret."], values: [{ label: "Πεδίο διαχείρισης", value: "Client secret · Value  ←  στήλη «Value»" }], warn: "Γράψε στο ημερολόγιο την ημερομηνία λήξης: όταν λήξει, η σύνδεση με Microsoft σταματά." },
        { title: "Δικαιώματα (API permissions)", body: ["Αριστερά «API permissions». Πρέπει να υπάρχουν (Microsoft Graph, Delegated): «openid», «email», «profile» (και το προεπιλεγμένο «User.Read»).", "Αν λείπουν: «Add a permission» → «Microsoft Graph» → «Delegated permissions» → επίλεξέ τα → «Add permissions». Δεν χρειάζεται «Grant admin consent» για αυτά."], values: [{ label: "Delegated permissions", value: "openid email profile" }] },
        { title: "Email στο token (για εταιρικούς λογαριασμούς)", body: ["Αριστερά «Token configuration» → «Add optional claim» → Token type «ID» → επίλεξε «email» → «Add» (αν ρωτήσει, αποδέξου και το σχετικό Graph permission).", "Χρειάζεται μόνο αν δέχεστε και εταιρικούς/σχολικούς λογαριασμούς· οι προσωπικοί στέλνουν email ούτως ή άλλως."] },
        { title: "Branding (προαιρετικό)", body: ["Αριστερά «Branding & properties»: Home page URL, Terms of service URL, Privacy statement URL και λογότυπο.", "Χωρίς «verified publisher» η οθόνη συναίνεσης γράφει «unverified». Η επαλήθευση (Publisher verification) θέλει λογαριασμό Microsoft AI Cloud Partner Program — προαιρετική."], values: [{ ...home, label: "Home page URL" }, { ...terms, label: "Terms of service URL" }, { ...privacy, label: "Privacy statement URL" }] },
        testStep("Microsoft"),
      ],
      errors: [
        { code: "AADSTS50011: The redirect URI … does not match", fix: `Πρόσθεσε ακριβώς ${cb("microsoft")} στο «Authentication» → πλατφόρμα Web.` },
        { code: "AADSTS7000215: Invalid client secret provided", fix: "Μπήκε το «Secret ID» αντί για το «Value», ή το secret έληξε. Φτιάξε νέο και αντίγραψε το «Value»." },
        { code: "AADSTS700016: Application … was not found in the directory", fix: "Το «Microsoft λογαριασμοί» της διαχείρισης δεν ταιριάζει με το «Supported account types» (π.χ. consumers ενώ η εφαρμογή είναι single tenant), ή λάθος Client ID." },
        { code: "unauthorized_client / «not enabled for consumers»", fix: "Η εφαρμογή δεν δέχεται προσωπικούς λογαριασμούς: άλλαξε το «Supported account types» (Authentication → Supported account types) ή διάλεξε το αντίστοιχο στη διαχείριση." },
      ],
      upkeep: ["Το client secret λήγει (έως 24 μήνες): ένα μήνα πριν, φτιάξε νέο, βάλ' το στη διαχείριση και διάγραψε το παλιό.", "Κάθε νέο domain θέλει νέο Redirect URI στο «Authentication»."],
    },
    facebook: {
      id: "facebook", title: "Facebook", summary: "Σύνδεση με λογαριασμό Facebook. Δωρεάν· η εφαρμογή πρέπει να γίνει «Live» για να μπορούν να συνδεθούν οι πελάτες.",
      console: { label: "Meta for Developers · Apps", value: "https://developers.facebook.com/apps/" },
      before: [
        "Λογαριασμός Facebook ενός υπευθύνου, εγγεγραμμένος ως developer στο https://developers.facebook.com (Get started).",
        "Προτείνεται Business Portfolio της εταιρείας στο Meta Business Suite, ώστε η εφαρμογή να ανήκει στην εταιρεία και να μπορεί να γίνει επαλήθευση επιχείρησης αν ζητηθεί.",
        "Εικονίδιο εφαρμογής 1024 × 1024 px (PNG/JPG).",
      ],
      steps: [
        { title: "Δημιουργία εφαρμογής", body: ["https://developers.facebook.com/apps/ → «Create app».", "App name: «Euronics», App contact email: το email υποστήριξης. «Next».", "Use case: «Authenticate and request data from users with Facebook Login». «Next».", "Business: διάλεξε το Business Portfolio της εταιρείας (ή «I don't want to connect a business portfolio yet»). «Next» → «Create app» (ζητά τον κωδικό του Facebook)."] },
        { title: "Δικαιώματα: email", body: ["Αριστερά «Use cases» → «Authentication and account creation» → «Customize».", "Στην καρτέλα «Permissions» πάτα «Add» δίπλα στο «email». Το «public_profile» υπάρχει ήδη."], values: [{ label: "Permissions", value: "email, public_profile" }] },
        { title: "Ρυθμίσεις Facebook Login", body: ["Στο ίδιο σημείο, καρτέλα «Settings» (Facebook Login settings).", "«Client OAuth login»: Yes · «Web OAuth login»: Yes · «Enforce HTTPS»: Yes · «Use Strict Mode for redirect URIs»: Yes.", "Στο «Valid OAuth Redirect URIs» επικόλλησε το redirect URI και πάτα «Save changes»."], values: [{ label: "Valid OAuth Redirect URI", value: cb("facebook") }], warn: isLocal ? "Τοπικό περιβάλλον: το Facebook επιτρέπει redirect σε localhost μόνο όσο η εφαρμογή είναι σε «Development». Για τους πελάτες χρειάζεται το https redirect του live." : undefined },
        { title: "Βασικές ρυθμίσεις (App settings → Basic)", body: ["Αριστερά «App settings» → «Basic».", `App domains: ${siteHost}.`, "Privacy Policy URL, Terms of Service URL, και στο «User data deletion» επίλεξε «Data deletion instructions URL» με τη διεύθυνση παρακάτω.", "Category: «Shopping». App icon: το εικονίδιο 1024 × 1024.", "Κάτω-κάτω «Add platform» → «Website» → Site URL το origin. «Save changes»."], values: [{ label: "App domains", value: siteHost }, { ...privacy, label: "Privacy Policy URL" }, { ...terms, label: "Terms of Service URL" }, { ...deletion, label: "Data deletion instructions URL" }, { label: "Website · Site URL", value: `${site}/` }] },
        { title: "App ID και App secret", body: ["Στην ίδια σελίδα (App settings → Basic): αντίγραψε το «App ID» (μόνο ψηφία) και το «App secret» (πάτα «Show», ζητά κωδικό· 32 χαρακτήρες 0-9 και a-f)."], values: [{ label: "Πεδίο διαχείρισης", value: "App ID  ←  App ID" }, { label: "Πεδίο διαχείρισης", value: "App secret  ←  App secret" }] },
        testStep("Facebook"),
        { title: "Δημοσίευση (Live)", body: ["Αριστερά «Publish» (ή ο διακόπτης «App Mode» στην κορυφή): από «Development» σε «Live».", "Αν το Dashboard ζητήσει εκκρεμότητες (π.χ. επαλήθευση επιχείρησης ή έλεγχο δικαιωμάτων στο «App Review»), ολοκλήρωσέ τες εκεί· για «email» και «public_profile» συνήθως αρκούν τα βήματα αυτού του οδηγού.", "Σε «Development» μπορούν να συνδεθούν μόνο όσοι έχουν ρόλο στην εφαρμογή (App roles)."], warn: "Πριν το «Live» κάνε τη «Δοκιμαστική σύνδεση» με λογαριασμό που έχει ρόλο στην εφαρμογή." },
      ],
      errors: [
        { code: "URL Blocked: This redirect failed because the redirect URI is not whitelisted", fix: `Λείπει ή διαφέρει το ${cb("facebook")} από τα «Valid OAuth Redirect URIs», ή είναι κλειστό το «Web OAuth login».` },
        { code: "Can't load URL: The domain of this URL isn't included in the app's domains", fix: `Πρόσθεσε ${siteHost} στα «App domains» και το Website platform.` },
        { code: "App not active / Η εφαρμογή δεν είναι διαθέσιμη", fix: "Η εφαρμογή είναι σε «Development»: δημοσίευσέ την (Live) ή δοκίμασε με λογαριασμό που έχει ρόλο." },
        { code: "Ο πελάτης μπαίνει χωρίς email", fix: "Λείπει το δικαίωμα «email» ή ο χρήστης έχει Facebook χωρίς επιβεβαιωμένο email. Η εφαρμογή ζητά τότε το email στον πελάτη." },
      ],
      upkeep: ["Το App secret δεν λήγει. Αν διαρρεύσει: App settings → Basic → «Reset», ενημέρωση στη διαχείριση.", "Η Meta στέλνει ειδοποιήσεις στο developer account (π.χ. ετήσιος έλεγχος «Data Use Checkup») — αν δεν απαντηθούν, η εφαρμογή μπορεί να περιοριστεί."],
    },
    apple: {
      id: "apple", title: "Apple", summary: "«Sign in with Apple» για iPhone, iPad και Mac. Χρειάζεται συνδρομή Apple Developer Program και δημόσιο https domain.",
      console: { label: "Apple Developer · Certificates, Identifiers & Profiles", value: "https://developer.apple.com/account/resources/identifiers/list/serviceId" },
      before: [
        "Συνδρομή Apple Developer Program στο όνομα της εταιρείας (Organization). Για εγγραφή οργανισμού η Apple ζητά αριθμό D-U-N-S της εταιρείας.",
        "Ρόλος «Account Holder» ή «Admin» στον λογαριασμό developer.",
        isLocal || !isHttps ? `Η Apple ΔΕΝ δέχεται localhost ή http. Ο οδηγός παρακάτω χρησιμοποιεί το live site (${site}) — άνοιξε τη διαχείριση από εκεί και πάτα ξανά το κουμπί για ακριβείς διευθύνσεις.` : "Δημόσιο https domain — εντάξει.",
      ],
      steps: [
        { title: "App ID (κύριο αναγνωριστικό)", body: ["https://developer.apple.com/account → «Certificates, IDs & Profiles» → «Identifiers» → «+».", "Επίλεξε «App IDs» → «Continue» → «App» → «Continue».", "Description: «Euronics», Bundle ID: «Explicit», π.χ. gr.euronics.app.", "Στα «Capabilities» τσέκαρε «Sign In with Apple» → «Continue» → «Register».", "Αν υπάρχει ήδη App ID της εφαρμογής κινητού, μπορείς να χρησιμοποιήσεις εκείνο (με ενεργό το Sign In with Apple)."], values: [{ label: "Bundle ID (παράδειγμα)", value: "gr.euronics.app" }] },
        { title: "Services ID (αυτό είναι το Client ID για το web)", body: ["«Identifiers» → «+» → «Services IDs» → «Continue».", "Description: «Euronics web» (το βλέπει ο πελάτης), Identifier: π.χ. gr.euronics.signin → «Continue» → «Register».", "Άνοιξε το Services ID που δημιούργησες, τσέκαρε «Sign In with Apple» και πάτα «Configure».", "Primary App ID: το App ID του προηγούμενου βήματος.", "«Domains and Subdomains»: το domain χωρίς https://.", "«Return URLs»: το redirect URI, ακριβώς.", "«Next» → «Done» → «Continue» → «Save»."], values: [{ label: "Services ID (παράδειγμα)", value: "gr.euronics.signin" }, { label: "Domains and Subdomains", value: siteHost }, { label: "Return URL", value: `${site}/api/account/oauth/apple/callback` }] },
        { title: "Κλειδί (Key) για Sign in with Apple", body: ["«Keys» → «+». Key Name: «Euronics Sign in».", "Τσέκαρε «Sign in with Apple» → «Configure» → Primary App ID: το ίδιο App ID → «Save» → «Continue» → «Register».", "Πάτα «Download»: κατεβαίνει το αρχείο AuthKey_XXXXXXXXXX.p8. ΜΟΝΟ ΜΙΑ ΦΟΡΑ — φύλαξέ το σε ασφαλές σημείο.", "Το XXXXXXXXXX (10 χαρακτήρες) είναι το «Key ID»."], warn: "Αν χαθεί το .p8, δεν ξανακατεβαίνει: φτιάχνεις νέο κλειδί (Revoke το παλιό) και ενημερώνεις τη διαχείριση." },
        { title: "Team ID", body: ["Πάνω δεξιά στο developer.apple.com, κάτω από το όνομα του λογαριασμού, ή «Membership details» → «Team ID» (10 χαρακτήρες)."] },
        { title: "Email προς χρήστες με «Απόκρυψη email»", body: ["Όσοι διαλέξουν «Hide My Email» δίνουν διεύθυνση …@privaterelay.appleid.com. Για να φτάνουν εκεί τα emails του καταστήματος (παραγγελίες, εγγυήσεις):", "«Services» → «Sign in with Apple for Email Communication» → «Configure» → πρόσθεσε το domain και τις διευθύνσεις αποστολής (π.χ. noreply@ του domain σας).", "Τα domains αποστολής πρέπει να περνούν έλεγχο SPF (και DKIM) — τον ρυθμίζει όποιος διαχειρίζεται το DNS / τον πάροχο email."] },
        { title: "Στοιχεία στη διαχείριση", body: ["Services ID ← το Identifier του Services ID (π.χ. gr.euronics.signin) — όχι το Bundle ID.", "Team ID ← Team ID. Key ID ← Key ID.", "Ιδιωτικό κλειδί (.p8) ← άνοιξε το αρχείο .p8 με επεξεργαστή κειμένου και επικόλλησε ΟΛΟ το περιεχόμενο, μαζί με τις γραμμές -----BEGIN PRIVATE KEY----- και -----END PRIVATE KEY-----.", "Το client secret της Apple φτιάχνεται αυτόματα από το κλειδί σε κάθε σύνδεση — δεν χρειάζεται ανανέωση."] },
        testStep("Apple"),
      ],
      errors: [
        { code: "invalid_client", fix: "Services ID, Team ID, Key ID ή .p8 δεν ταιριάζουν· ή το κλειδί δεν έχει «Sign in with Apple» για το ίδιο Primary App ID. Έλεγξε ότι στο Services ID μπήκε το Identifier του Services ID και όχι το Bundle ID." },
        { code: "invalid_request: Invalid redirect_uri", fix: `Το Return URL στο Services ID δεν είναι ακριβώς ${site}/api/account/oauth/apple/callback, ή λείπει το ${siteHost} από τα Domains.` },
        { code: "Ο πελάτης μπαίνει χωρίς όνομα", fix: "Η Apple στέλνει το όνομα μόνο στην πρώτη σύνδεση. Αν είχε συνδεθεί παλιότερα: iPhone → Ρυθμίσεις → [όνομα] → Σύνδεση με Apple → Euronics → «Διακοπή χρήσης» και νέα σύνδεση." },
      ],
      upkeep: ["Η συνδρομή Apple Developer Program ανανεώνεται κάθε χρόνο — αν λήξει, η σύνδεση με Apple σταματά.", "Το κλειδί .p8 δεν λήγει. Κάθε νέο domain θέλει Domain και Return URL στο Services ID."],
    },
  };

  const providers = (input.providers?.length ? input.providers : GUIDE_PROVIDERS).filter((p) => GUIDE_PROVIDERS.includes(p));
  return {
    title: providers.length === 1 ? `Οδηγός ρύθμισης σύνδεσης με ${all[providers[0]].title}` : "Οδηγός ρύθμισης social login",
    origin, host, isLocal, generatedAt: (input.now ?? new Date()).toISOString(),
    intro: [
      `Ο οδηγός φτιάχτηκε για το domain ${host}: όλες οι διευθύνσεις παρακάτω είναι αυτές που θα στείλει αυτό το site στους παρόχους. Αν οι πελάτες μπαίνουν και από άλλο domain (π.χ. με και χωρίς www, ή μετά τη μετάβαση στο euronics.gr), πάτα το κουμπί «Δημιουργία οδηγού» και από εκεί και πρόσθεσε τις διευθύνσεις του στην ίδια εφαρμογή κάθε παρόχου.`,
      "Κάθε διεύθυνση πρέπει να μπει ακριβώς όπως είναι: ίδιο https/http, ίδιο www, χωρίς κάθετο (/) στο τέλος όταν δεν έχει.",
      "Οι λογαριασμοί στις κονσόλες των παρόχων πρέπει να είναι εταιρικοί. Τα secrets δεν στέλνονται με email ή chat — μπαίνουν μόνο στη διαχείριση, όπου αποθηκεύονται κρυπτογραφημένα.",
      ...(isLocal ? ["Προσοχή: τοπικό περιβάλλον (localhost). Google και Microsoft το δέχονται, το Facebook μόνο σε «Development», η Apple καθόλου. Για τους πελάτες χρειάζονται οι διευθύνσεις του live site."] : []),
    ],
    urls: [
      { label: "Origin του site", value: origin },
      ...providers.map((p) => ({ label: `Redirect URI · ${all[p].title}`, value: p === "apple" ? `${site}/api/account/oauth/apple/callback` : cb(p) })),
      home, privacy, terms, deletion,
      { label: "Ρυθμίσεις social login (διαχείριση)", value: admin },
    ],
    sections: providers.map((p) => all[p]),
    finish: [
      "Για κάθε πάροχο: «Έλεγχος στοιχείων» → «Δοκιμαστική σύνδεση» → άνοιγμα του διακόπτη → «Αποθήκευση».",
      "Έλεγξε τη σελίδα σύνδεσης του site σε κινητό και υπολογιστή: τα κουμπιά εμφανίζονται μόνο για όσους παρόχους είναι ανοιχτοί και πλήρως ρυθμισμένοι.",
      "Κράτα σε ασφαλές σημείο (password manager της εταιρείας): ποιος λογαριασμός κατέχει κάθε εφαρμογή, ημερομηνία λήξης του secret της Microsoft, το αρχείο .p8 της Apple.",
    ],
  };
}

// ---------- εμφάνιση ----------
const mdEsc = (s: string) => s.replace(/([*_`])/g, "\\$1");
export function guideToMarkdown(d: GuideDoc): string {
  const L: string[] = [`# ${d.title}`, "", `Domain: **${d.host}** · ${new Date(d.generatedAt).toLocaleString("el-GR")}`, ""];
  for (const p of d.intro) L.push(`> ${mdEsc(p)}`, ">");
  L.push("", "## Διευθύνσεις για αντιγραφή", "", "| Τι | Τιμή |", "|---|---|");
  for (const u of d.urls) L.push(`| ${mdEsc(u.label)} | \`${u.value}\` |`);
  for (const s of d.sections) {
    L.push("", `## ${s.title}`, "", mdEsc(s.summary), "", `Κονσόλα: ${s.console.label} — ${s.console.value}`, "", "### Πριν ξεκινήσεις", "");
    for (const b of s.before) L.push(`- ${mdEsc(b)}`);
    s.steps.forEach((st, i) => {
      L.push("", `### Βήμα ${i + 1}. ${st.title}`, "");
      st.body.forEach((b, j) => L.push(`${j + 1}. ${mdEsc(b)}`));
      if (st.values?.length) { L.push(""); for (const v of st.values) L.push(`- **${mdEsc(v.label)}:** \`${v.value}\``); }
      if (st.warn) L.push("", `> ⚠️ ${mdEsc(st.warn)}`);
    });
    L.push("", "### Συνηθισμένα σφάλματα", "", "| Μήνυμα | Λύση |", "|---|---|");
    for (const e of s.errors) L.push(`| ${mdEsc(e.code)} | ${mdEsc(e.fix)} |`);
    L.push("", "### Συντήρηση", "");
    for (const u of s.upkeep) L.push(`- ${mdEsc(u)}`);
  }
  L.push("", "## Ολοκλήρωση", "");
  for (const f of d.finish) L.push(`- ${mdEsc(f)}`);
  return L.join("\n") + "\n";
}

const h = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const link = (s: string) => h(s).replace(/(https?:\/\/[^\s<]+[^\s<.,;:)])/g, '<a href="$1">$1</a>');
/** Αυτόνομη σελίδα HTML για εκτύπωση / αποθήκευση ως PDF. */
export function guideToHtml(d: GuideDoc): string {
  const val = (v: GuideValue) => `<div class="v"><span>${h(v.label)}</span><code>${h(v.value)}</code></div>`;
  const sec = (s: GuideSection) => `<section><h2>${h(s.title)}</h2><p class="lead">${h(s.summary)}</p><p>Κονσόλα: <b>${h(s.console.label)}</b> — ${link(s.console.value)}</p>
<h3>Πριν ξεκινήσεις</h3><ul>${s.before.map((b) => `<li>${link(b)}</li>`).join("")}</ul>
${s.steps.map((st, i) => `<div class="step"><h3><span class="n">${i + 1}</span>${h(st.title)}</h3><ol>${st.body.map((b) => `<li>${link(b)}</li>`).join("")}</ol>${st.values?.length ? `<div class="vals">${st.values.map(val).join("")}</div>` : ""}${st.warn ? `<p class="warn">⚠ ${h(st.warn)}</p>` : ""}</div>`).join("")}
<h3>Συνηθισμένα σφάλματα</h3><table><thead><tr><th>Μήνυμα</th><th>Λύση</th></tr></thead><tbody>${s.errors.map((e) => `<tr><td><code>${h(e.code)}</code></td><td>${h(e.fix)}</td></tr>`).join("")}</tbody></table>
<h3>Συντήρηση</h3><ul>${s.upkeep.map((u) => `<li>${h(u)}</li>`).join("")}</ul></section>`;
  return `<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(d.title)} · ${h(d.host)}</title>
<style>
:root{--ink:#14213d;--muted:#5b6475;--line:#d9dee8;--blue:#1d428a;--warn:#fff4d6}
*{box-sizing:border-box}body{margin:0;background:#fff;color:var(--ink);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:860px;margin:0 auto;padding:24px 16px 64px}h1{font-size:1.75rem;line-height:1.2;margin:0 0 4px}h2{font-size:1.4rem;margin:40px 0 8px;padding-top:16px;border-top:3px solid var(--blue);break-before:page}
h3{font-size:1.05rem;margin:22px 0 8px;display:flex;gap:10px;align-items:center}.n{flex:none;width:28px;height:28px;border-radius:50%;background:var(--blue);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:.85rem}
.meta{color:var(--muted);margin:0 0 16px}.lead{font-weight:600}.intro{background:#f4f6fb;border-radius:12px;padding:12px 16px}.intro p{margin:6px 0}
ol,ul{padding-left:1.4em}li{margin:4px 0}.vals{display:grid;gap:6px;margin:10px 0}.v{display:grid;gap:2px;border:1px solid var(--line);border-radius:10px;padding:8px 12px}.v span{font-size:.85rem;color:var(--muted);font-weight:600}
code{font:0.92rem/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all;background:#f4f6fb;border-radius:6px;padding:2px 6px}.v code{background:none;padding:0;font-size:1rem;color:var(--ink)}
.warn{background:var(--warn);border-radius:10px;padding:10px 12px}table{width:100%;border-collapse:collapse;font-size:.95rem}th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--line);padding:8px}
a{color:var(--blue);word-break:break-all}.bar{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.bar button{font:inherit;font-weight:700;border-radius:999px;border:2px solid var(--blue);background:#fff;color:var(--blue);padding:8px 16px;min-height:44px;cursor:pointer}
@media print{.bar{display:none}main{padding:0}h2{break-before:page}.step,.v,tr{break-inside:avoid}a{color:inherit;text-decoration:none}}
</style></head><body><main>
<h1>${h(d.title)}</h1><p class="meta">Domain <b>${h(d.host)}</b> · ${h(new Date(d.generatedAt).toLocaleString("el-GR"))}</p>
<div class="bar"><button onclick="window.print()">Εκτύπωση / PDF</button></div>
<div class="intro">${d.intro.map((p) => `<p>${h(p)}</p>`).join("")}</div>
<h2 style="break-before:auto">Διευθύνσεις για αντιγραφή</h2><div class="vals">${d.urls.map(val).join("")}</div>
${d.sections.map(sec).join("")}
<h2>Ολοκλήρωση</h2><ul>${d.finish.map((f) => `<li>${h(f)}</li>`).join("")}</ul>
</main></body></html>`;
}
