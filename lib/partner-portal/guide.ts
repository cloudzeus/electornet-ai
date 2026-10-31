/**
 * Ο οδηγός (wiki) της πύλης συνεργατών. Κάθε άρθρο: σύνοψη, βίντεο (Remotion, όταν υπάρχει), ενότητες με βήματα
 * και συνηθισμένα προβλήματα. Τα slugs χρησιμοποιούνται από τους τρόπους σύνδεσης (`ConnTypeInfo.guide`).
 * Βίντεο: Remotion (motion-studio, compositions Euronics-Guide-<slug>-16x9), 1280×720 χωρίς ήχο, στο Bunny CDN
 * `videos/synergaton/<slug>-<hash>.{mp4,webm}` + `-poster-<hash>.jpg` — το hash αλλάζει σε κάθε νέο render.
 */
export type GuideSection = { title: string; body?: string[]; steps?: string[]; tips?: string[] };
export type GuideArticle = { slug: string; title: string; summary: string; minutes: number; group: "start" | "connect" | "daily"; video?: { src: string; webm?: string; poster: string; duration: string } | null; sections: GuideSection[]; faq?: { q: string; a: string }[] };

export const GUIDE_GROUPS = { start: "Πρώτα βήματα", connect: "Σύνδεση αποθέματος", daily: "Καθημερινά" } as const;

export const GUIDE: GuideArticle[] = [
  {
    slug: "ksekinima", group: "start", minutes: 3, title: "Πώς λειτουργεί η πύλη συνεργατών",
    video: { src: "https://euronics.b-cdn.net/videos/synergaton/ksekinima-10797f1f65.mp4", webm: "https://euronics.b-cdn.net/videos/synergaton/ksekinima-6462aab2db.webm", poster: "https://euronics.b-cdn.net/videos/synergaton/ksekinima-poster-cab48eab9a.jpg", duration: "0:50" },
    summary: "Από τον πρώτο κωδικό μέχρι τη διαθεσιμότητα στο euronics.gr: τα 7 βήματα της αρχικοποίησης.",
    sections: [
      { title: "Τι κερδίζετε", body: ["Οι πελάτες του euronics.gr βλέπουν αν ένα προϊόν υπάρχει στο κατάστημά σας και μπορούν να το παραλάβουν από εσάς. Η παραγγελία έρχεται σε εσάς, με email και εδώ στην πύλη."] },
      { title: "Τα βήματα", steps: ["Ορίζετε κωδικό από το link που σας στείλαμε.", "Απαντάτε σε 10 σύντομες ερωτήσεις (και για τράπεζες και Viva): ο βοηθός προτείνει τον τρόπο σύνδεσης.", "Ελέγχετε τα στοιχεία κάθε καταστήματος (τηλέφωνα, ωράριο, υπηρεσίες).", "Δημιουργείτε σύνδεση αποθέματος.", "Τρέχει έλεγχος: διαβάζουμε ένα μικρό δείγμα.", "Αντιστοιχίζετε στήλες και αποθήκες στα καταστήματά σας.", "Ενεργοποιείτε — από εκεί και πέρα όλα γίνονται αυτόματα."] },
      { title: "Πληρωμές και Viva", body: ["Στο ερωτηματολόγιο ρωτάμε με ποιες τράπεζες και παρόχους πληρωμών συνεργάζεστε. Με λογαριασμό Viva, το ποσό κάθε παραγγελίας eshop που εξυπηρετεί το κατάστημά σας πιστώνεται αυτόματα σε εσάς (διαμοιρασμός πληρωμής), χωρίς χειροκίνητους συμψηφισμούς.", "Αν απαντήσετε «Ναι», σας καλεί ο υπεύθυνος της Viva για την Euronics, χωρίς δέσμευση. Η απάντηση αλλάζει όποτε θέλετε από τις «Ερωτήσεις έναρξης»."] },
      { title: "Τι δεν κάνουμε ποτέ", body: ["Δεν γράφουμε τίποτα στο σύστημά σας: μόνο ανάγνωση αποθέματος. Τα στοιχεία πρόσβασης φυλάσσονται κρυπτογραφημένα και δεν εμφανίζονται ξανά, ούτε στην Euronics."] },
    ],
  },
  {
    slug: "katastimata", group: "start", minutes: 2, title: "Το προφίλ των καταστημάτων σας",
    video: { src: "https://euronics.b-cdn.net/videos/synergaton/katastimata-f4708897fa.mp4", webm: "https://euronics.b-cdn.net/videos/synergaton/katastimata-cdf7b29ecb.webm", poster: "https://euronics.b-cdn.net/videos/synergaton/katastimata-poster-c337d3780b.jpg", duration: "0:53" },
    summary: "Τηλέφωνα, email, ωράριο και υπηρεσίες: τι φαίνεται στο eshop και πώς το αλλάζετε.",
    sections: [
      { title: "Τι αλλάζετε εσείς", body: ["Σταθερό, κινητό, email, ωράριο (και διακεκομμένο), υπηρεσίες και σημείωμα για πελάτες. Οι αλλαγές ισχύουν αμέσως, χωρίς έγκριση, και καταγράφονται στο ιστορικό.", "Σταθερό, κινητό και email γράφονται αυτόματα και στο υποκατάστημά σας στο SoftOne της Euronics, όταν η Euronics έχει ανοίξει αυτή τη δυνατότητα· ωράριο, υπηρεσίες και σημείωμα μένουν μόνο στο eshop."] },
      { title: "Τι αλλάζει μόνο η Euronics", body: ["Επωνυμία, διεύθυνση, ΑΦΜ — έρχονται από το SoftOne της Euronics. Για διόρθωση, μιλήστε με τον υπεύθυνο συνεργατών."] },
    ],
    faq: [{ q: "Γιατί το κατάστημα δεν εμφανίζεται στον χάρτη;", a: "Το εμφανίζει η Euronics όταν έχει σημείο στον χάρτη και είναι έτοιμο. Αν λείπει, η κάρτα του καταστήματος το γράφει." }, { q: "Χωρίς «Παραλαβή παραγγελιών» τι γίνεται;", a: "Το κατάστημα δεν προσφέρεται ως επιλογή παραλαβής στο checkout." }],
  },
  {
    slug: "softone", group: "connect", minutes: 4, title: "Σύνδεση με SoftOne",
    video: { src: "https://euronics.b-cdn.net/videos/synergaton/softone-9c44d7c160.mp4", webm: "https://euronics.b-cdn.net/videos/synergaton/softone-72228228be.webm", poster: "https://euronics.b-cdn.net/videos/synergaton/softone-poster-d5e73a707e.jpg", duration: "0:49" },
    summary: "Διαβάζουμε το απόθεμα ανά υποκατάστημα από τα web services του SoftOne σας, μόνο ανάγνωση.",
    sections: [
      { title: "Τι να ζητήσετε από τον τεχνικό σας", steps: ["Ένα web account μόνο με δικαίωμα ανάγνωσης ειδών και υπολοίπων.", "Το AppID (SoftOne → Web & Mobile → Web Services).", "Εταιρεία, υποκατάστημα σύνδεσης, MODULE και REFID του χρήστη.", "Το serial (όνομα πριν το .oncloud.gr) ή τη διεύθυνση των web services."] },
      { title: "Στην πύλη", steps: ["Σύνδεση → Νέα σύνδεση → SoftOne.", "Συμπληρώστε τα στοιχεία και πατήστε «Αποθήκευση και έλεγχος».", "Στο βήμα «Καταστήματα» κάθε υποκατάστημα SoftOne προτείνεται αυτόματα στο κατάστημα με τον ίδιο κωδικό."] },
    ],
    faq: [{ q: "«Ο server απάντησε HTTP 403» ή «λάθος στοιχεία»", a: "Ελέγξτε AppID και ότι το web account είναι ενεργό με δικαίωμα web services." }, { q: "Λείπει κάποιο υποκατάστημα", a: "Ο χρήστης πρέπει να έχει δικαίωμα σε όλα τα υποκαταστήματα/αποθήκες." }],
  },
  {
    slug: "woocommerce", group: "connect", minutes: 3, title: "Σύνδεση με WooCommerce",
    video: { src: "https://euronics.b-cdn.net/videos/synergaton/woocommerce-c4958352ee.mp4", webm: "https://euronics.b-cdn.net/videos/synergaton/woocommerce-9368fc10aa.webm", poster: "https://euronics.b-cdn.net/videos/synergaton/woocommerce-poster-7280b7ade9.jpg", duration: "0:49" },
    summary: "Διαβάζουμε το απόθεμα από το eshop σας με κλειδί REST API μόνο για ανάγνωση.",
    sections: [
      { title: "Δημιουργία κλειδιού", steps: ["WordPress → WooCommerce → Ρυθμίσεις → Για προχωρημένους → REST API.", "«Προσθήκη κλειδιού», δικαίωμα: Ανάγνωση.", "Αντιγράψτε Consumer key (ck_…) και Consumer secret (cs_…) — το secret φαίνεται μία φορά."] },
      { title: "Στην πύλη", steps: ["Νέα σύνδεση → WooCommerce.", "Διεύθυνση eshop με https, τα δύο κλειδιά, «Αποθήκευση και έλεγχος»."] },
    ],
    faq: [{ q: "401 / 403 στον έλεγχο", a: "Συνήθως plugin ασφαλείας ή Cloudflare κόβει το /wp-json. Επιτρέψτε τα αιτήματα REST API." }],
  },
  {
    slug: "feed", group: "connect", minutes: 3, title: "Σύνδεση με feed (XML, Excel, CSV)",
    video: { src: "https://euronics.b-cdn.net/videos/synergaton/feed-58a12a7783.mp4", webm: "https://euronics.b-cdn.net/videos/synergaton/feed-dcf36d0d95.webm", poster: "https://euronics.b-cdn.net/videos/synergaton/feed-poster-3f698fa0b9.jpg", duration: "0:40" },
    summary: "Ένα αρχείο σε σταθερή διεύθυνση που ενημερώνει το σύστημά σας — το διαβάζουμε αυτόματα.",
    sections: [
      { title: "Τι χρειάζεται το αρχείο", body: ["Στήλη κωδικού ή EAN, στήλη ποσότητας και — αν έχετε πολλά καταστήματα — στήλη καταστήματος/αποθήκης. Τα feed για Skroutz/BestPrice συνήθως κάνουν."] },
      { title: "Αντιστοίχιση στηλών", steps: ["Μετά τον έλεγχο βλέπετε τις στήλες του αρχείου με δείγμα τιμών.", "Όσες αναγνωρίστηκαν αυτόματα έχουν σήμα «Αυτόματα».", "Διορθώστε από την πλευρά των πεδίων ή από τις κάρτες των στηλών· οι έλεγχοι δεξιά ενημερώνονται αμέσως.", "«Πρόταση από τον βοηθό» αν τα ονόματα είναι ασαφή."] },
    ],
    faq: [{ q: "Ελληνικά σε μορφή «Ã¡»", a: "Ορίστε κωδικοποίηση Windows-1253 στα στοιχεία της σύνδεσης." }],
  },
  {
    slug: "upload", group: "connect", minutes: 2, title: "Ανέβασμα αρχείου Excel ή CSV",
    video: { src: "https://euronics.b-cdn.net/videos/synergaton/upload-a90ddb062e.mp4", webm: "https://euronics.b-cdn.net/videos/synergaton/upload-5b6d85813b.webm", poster: "https://euronics.b-cdn.net/videos/synergaton/upload-poster-14bb912f7f.jpg", duration: "0:45" },
    summary: "Ο πιο γρήγορος τρόπος να ξεκινήσετε: ανεβάζετε εσείς το απόθεμα όποτε θέλετε.",
    sections: [
      { title: "Πώς να είναι το αρχείο", body: ["Πρώτη γραμμή με ονόματα στηλών. Μία γραμμή ανά προϊόν και κατάστημα. Έως 3 MB — κρατήστε μόνο κωδικό/EAN, ποσότητα και κατάστημα."], tips: ["Το παλιό .xls δεν υποστηρίζεται: «Αποθήκευση ως» .xlsx.", "«Όλο το απόθεμα»: ό,τι λείπει θεωρείται μηδέν. «Μόνο αλλαγές»: τα υπόλοιπα μένουν ως είχαν."] },
      { title: "Τα βήματα", steps: ["Διαλέξτε το αρχείο — το διαβάζουμε χωρίς να αποθηκεύσουμε τίποτα.", "Επιβεβαιώστε τις στήλες.", "Αντιστοιχίστε τα καταστήματα του αρχείου στα καταστήματά σας.", "Ανέβασμα, και ενεργοποίηση."] },
    ],
  },
  {
    slug: "paraggelies", group: "daily", minutes: 2, title: "Παραγγελίες παραλαβής",
    video: { src: "https://euronics.b-cdn.net/videos/synergaton/paraggelies-455880102d.mp4", webm: "https://euronics.b-cdn.net/videos/synergaton/paraggelies-b104e99f55.webm", poster: "https://euronics.b-cdn.net/videos/synergaton/paraggelies-poster-cd74f19950.jpg", duration: "0:55" },
    summary: "Πού τις βλέπετε, τι σημαίνει κάθε κατάσταση, τα στοιχεία του πελάτη και πώς ζητάτε αναπλήρωση αποθέματος από την Euronics.",
    sections: [
      { title: "Καμία έγκριση — πάντα παράδοση", body: ["Οι παραγγελίες του euronics.gr που ήρθαν στο κατάστημά σας δεν εγκρίνονται ούτε απορρίπτονται: παραδίδονται στον πελάτη. «Προς παραλαβή» είναι όσες περιμένουν ετοιμασία ή τον πελάτη."] },
      { title: "Στοιχεία του πελάτη", body: ["Ανοίξτε μια παραγγελία: ονοματεπώνυμο, τηλέφωνο, email, διεύθυνση, τρόπος παραλαβής και πληρωμής, στοιχεία τιμολογίου και σημειώσεις του πελάτη, όπως τα έδωσε στο eshop."] },
      { title: "Αναπλήρωση αποθέματος από την Euronics", steps: ["Ανοίξτε την παραγγελία και πατήστε «Αίτημα αναπλήρωσης».", "Βάλτε ποσότητα σε όσα προϊόντα χρειάζεστε (0 σε όσα όχι).", "Διαλέξτε πώς να έρθει: στην επόμενη μαζική αποστολή, άμεσα, ή παραλαβή από το πλησιέστερο κατάστημα που έχει απόθεμα.", "Πατήστε «Αποστολή αιτήματος». Όσο αναμένει έγκριση μπορείτε να το ακυρώσετε."], tips: ["Όταν η Euronics το εγκρίνει γίνεται παραγγελία αναπλήρωσης και ενημερώνεστε στην αρχική της πύλης και με email. Στην παραλαβή βλέπετε από ποιο κατάστημα, και σας ειδοποιούμε ξανά όταν είναι έτοιμο.", "Ένα ανοιχτό αίτημα ανά παραγγελία."] },
    ],
  },
  {
    slug: "istoriko", group: "daily", minutes: 2, title: "Ιστορικό και συγχρονισμοί",
    video: { src: "https://euronics.b-cdn.net/videos/synergaton/istoriko-b59e5198d8.mp4", webm: "https://euronics.b-cdn.net/videos/synergaton/istoriko-0bd55624f1.webm", poster: "https://euronics.b-cdn.net/videos/synergaton/istoriko-poster-7999e86dbd.jpg", duration: "0:38" },
    summary: "Κάθε ενημέρωση αποθέματος με δεκτές και απορριφθείσες γραμμές, και κάθε ενέργεια στην πύλη.",
    sections: [
      { title: "Γιατί απορρίπτονται γραμμές", body: ["Χωρίς κωδικό/EAN, με ποσότητα που δεν είναι αριθμός ή «ναι/όχι» (π.χ. «κατόπιν παραγγελίας» ή κενό κελί), ή σε αποθήκη που δεν αντιστοιχίσατε σε κατάστημα. Το «ναι» μετρά ως 1 τεμάχιο, το «όχι» ως 0."] },
    ],
  },
];

export const guideArticle = (slug: string) => GUIDE.find((a) => a.slug === slug);
