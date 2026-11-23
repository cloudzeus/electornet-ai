/** Κοινά ονόματα και κανόνες των συναινέσεων (server + client· καμία εξάρτηση από βάση). */

export const TOPIC_LABEL: Record<string, string> = {
  newsletter: "Newsletter", offers: "Προσφορές", "price-drop": "Πτώση τιμής", "back-in-stock": "Διαθεσιμότητα", service: "Service & εγγυήσεις", orders: "Παραγγελίες",
  "cookies-analytics": "Cookies μέτρησης", "cookies-marketing": "Cookies marketing", geolocation: "Τοποθεσία", profiling: "Προσωποποίηση", terms: "Όροι χρήσης", privacy: "Πολιτική απορρήτου",
};
export const CHANNEL_LABEL: Record<string, string> = { email: "Email", sms: "SMS", push: "Push", viber: "Viber", phone: "Τηλέφωνο", web: "Site" };
export const METHOD_LABEL: Record<string, string> = {
  checkbox: "Τσεκ σε φόρμα", "double-opt-in": "Διπλή επιβεβαίωση", "account-toggle": "Διακόπτης λογαριασμού", admin: "Από προσωπικό", import: "Εισαγωγή", "store-form": "Έντυπη φόρμα καταστήματος",
  popup: "Banner cookies", phone: "Τηλέφωνο", letter: "Επιστολή ή email", "social-button": "Σύνδεση με τρίτο", "one-click": "Διαγραφή με ένα κλικ", complaint: "Αναφορά ως spam", "reminder-link": "Σύνδεσμος υπενθύμισης",
};
export const SOURCE_LABEL: Record<string, string> = { checkout: "Ταμείο", account: "Λογαριασμός", footer: "Υποσέλιδο", popup: "Banner", admin: "Διαχείριση", import: "Εισαγωγή", store: "Κατάστημα", api: "Σύνδεσμος email", snap: "Φωτογραφία συσκευής", "email-link": "Σύνδεσμος email", "warranty-link": "Σύνδεσμος εγγύησης" };

/** Τι καταχωρεί το προσωπικό με email: θέμα → επιτρεπτά κανάλια. */
export const STAFF_TOPICS: { topic: string; channels: string[] }[] = [
  { topic: "newsletter", channels: ["email"] },
  { topic: "offers", channels: ["email", "sms", "viber", "push"] },
  { topic: "price-drop", channels: ["email", "push"] },
  { topic: "back-in-stock", channels: ["email", "sms"] },
  { topic: "service", channels: ["email", "sms"] },
  { topic: "profiling", channels: ["web"] },
];
/** Πώς δηλώθηκε, όταν την καταχωρεί το προσωπικό. */
export const STAFF_METHODS = ["store-form", "phone", "letter"] as const;

const TEXT_KEY: Record<string, string> = { newsletter: "newsletter", offers: "offers", "price-drop": "offers", "back-in-stock": "offers", service: "service", terms: "terms", privacy: "privacy", "cookies-analytics": "cookies", "cookies-marketing": "cookies", geolocation: "geolocation" };
/** Ποιο κείμενο συναίνεσης αντιστοιχεί σε ένα θέμα (null = δεν έχει δικό του κείμενο). */
export const textKeyForTopic = (topic: string): string | null => TEXT_KEY[topic] ?? null;

export const label = (map: Record<string, string>, k: string | null | undefined) => (k ? map[k] ?? k : "—");

/** Η έκδοση σε ισχύ: η πιο πρόσφατη ενεργή με «ισχύει από» έως τώρα. Οι μελλοντικές περιμένουν, οι παλιότερες μένουν ως ιστορικό. */
export function inForce<T extends { active: boolean; effectiveFrom: Date | string }>(versions: T[], now = new Date()): T | null {
  const t = now.getTime();
  return versions.filter((v) => v.active && new Date(v.effectiveFrom).getTime() <= t).sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())[0] ?? null;
}

/** Θέματα που έχουν δικό τους κείμενο (μια εγγραφή τους χωρίς κείμενο είναι κενό στα αποδεικτικά). */
export const TEXT_TOPICS = Object.keys(TEXT_KEY);

/** Πού βλέπει ο πελάτης κάθε κείμενο. `auto` = η οθόνη διαβάζει την έκδοση σε ισχύ· αλλιώς δείχνει δικό της κείμενο. */
export const TEXT_SHOWN: Record<string, { where: string; auto: boolean }> = {
  newsletter: { where: "Φόρμες εγγραφής στο newsletter (υποσέλιδο, σελίδα newsletter, ενότητες αρχικής)", auto: true },
  offers: { where: "Προτιμήσεις επικοινωνίας στον λογαριασμό", auto: false },
  service: { where: "Προτιμήσεις επικοινωνίας στον λογαριασμό", auto: false },
  terms: { where: "Φόρμα εγγραφής", auto: false },
  privacy: { where: "Φόρμα εγγραφής", auto: false },
  cookies: { where: "Banner cookies (το μητρώο κρατά και το κείμενο του banner όπως φάνηκε)", auto: false },
  geolocation: { where: "Κοντινότερο κατάστημα", auto: false },
};
