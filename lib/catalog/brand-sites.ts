/**
 * **Μάρκα → ιστότοπος κατασκευαστή** — καθαρός πίνακας, χωρίς δίκτυο ή βάση.
 *
 * Γιατί υπάρχει: ο εμπλουτισμός δοκιμάζει πρώτα να βρει τη σελίδα του μοντέλου **δωρεάν** (sitemap ή αναζήτηση του
 * ίδιου του site) και μόνο αν αποτύχει πληρώνει αναζήτηση στο web — που είναι το 85% του κόστους. Για να δοκιμαστεί
 * όμως η δωρεάν διαδρομή, πρέπει να ξέρουμε ΠΟΙΟ είναι το site. Ο κώδικας μάντευε `www.<μάρκα>.gr` / `.com`, που
 * σχεδόν ποτέ δεν πετυχαίνει: η Inventor είναι στο **inventoraircondition.gr**, η Metz στο **metzblue.com**.
 *
 * Μετρημένο στα 623 τρεξίματα μέχρι τις 3/11/2026: η δωρεάν διαδρομή έπιασε **4 φορές**. Σε ζωντανή δοκιμή με σωστή
 * διεύθυνση, το `toyotomi.gr` έδωσε την ακριβή σελίδα του μοντέλου σε 4 δευτερόλεπτα χωρίς κόστος.
 *
 * Οι διευθύνσεις βγήκαν από τα **πραγματικά** πετυχημένα τρεξίματα, όχι από εικασία. Σειρά: πρώτο το ελληνικό site
 * (έχει τα μοντέλα που πουλάμε), μετά το διεθνές. Μεταπωλητές και συγκεντρωτές δεν μπαίνουν εδώ — τους καλύπτει το
 * βήμα «άλλα καταστήματα» του εμπλουτισμού.
 *
 * Νέα μάρκα: τρέξε τον εμπλουτισμό, δες ποιον ιστότοπο χρησιμοποίησε στην πράξη, και πρόσθεσέ τον.
 */
const SITES: Record<string, string[]> = {
  toyotomi: ["www.toyotomi.gr", "www.toyotomi.eu"],
  inventor: ["www.inventoraircondition.gr", "ac.inv-static.com"],
  metz: ["www.metzblue.com"],
  lg: ["www.lg.com"],
  winstar: ["www.winstar.gr"],
  hisense: ["gr.hisense.com", "www.hisense.com"],
  midea: ["www.midea.com", "www.fgeurope.gr"],
  fujitsu: ["www.fujitsu-general.com"],
  aeg: ["www.aeg.com.gr", "www.aeg.com"],
  apple: ["www.apple.com"],
  aux: ["www.auxsolutions.gr"],
  nobu: ["www.nobuklima.gr", "nobu.inv-static.com"],
  samsung: ["www.samsung.com"],
  haier: ["www.inventoraircondition-haier.gr", "haier.inv-static.com"],
  pitsos: ["www.pitsos.gr"],
  gree: ["www.gree.gr"],
  tesla: ["www.tesla.info"],
};

/** Ο πίνακας κρατά ολόκληρο τον υπολογιστή-ξενιστή, με `www.` όπου χρειάζεται: το «aeg.com.gr» και το «gr.hisense.com»
 * δεν ξεχωρίζουν με κανόνα, και ο κανόνας που τα μαντεύει σπάει σιωπηλά. */
const origin = (host: string) => `https://${host}`;

const key = (s: string) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Οι ιστότοποι μιας μάρκας, με τη σειρά που αξίζει να δοκιμαστούν. Άγνωστη μάρκα → κενό. */
export function brandSites(brand: string): string[] {
  const k = key(brand);
  return k && SITES[k] ? SITES[k].map(origin) : [];
}
