import type { NewsItem } from "../types";

/**
 * @dynamic Νέα & ανακοινώσεις — demo records in the shape the CMS will
 * deliver. Titles reflect real Euronics Greece themes (δίκτυο
 * καταστημάτων, Renew, ενεργειακή ετικέτα, εκδηλώσεις); dates are demo.
 */
export const news: NewsItem[] = [
  {
    slug: "neo-katastima-marousi",
    title: "Νέο κατάστημα Euronics στο Μαρούσι — εγκαίνια Σάββατο 20 Σεπτεμβρίου",
    excerpt: "Το 351ο μέλος του δικτύου ανοίγει στη Λεωφόρο Κηφισίας με 900 τ.μ. έκθεσης, showroom κλιματισμού και σημείο παραλαβής 2 ωρών.",
    date: "2026-09-08",
    category: "katastimata",
    image: "/img/store-front.jpg",
    featured: true,
    body: [
      "Το νέο κατάστημα της Ματσιάρη Ο.Ε. στο Μαρούσι έρχεται να καλύψει τη βόρεια Αττική με πλήρη γκάμα λευκών συσκευών, εικόνας & ήχου και κλιματισμού, με τεχνικό συνεργείο για εγκαταστάσεις την ίδια εβδομάδα.",
      "Το Σάββατο των εγκαινίων, κάθε αγορά άνω των 300 € συνοδεύεται από δωρεάν επέκταση εγγύησης 5 ετών, ενώ οι πρώτοι 100 επισκέπτες κερδίζουν κάρτα δώρου 20 €.",
      "Ωράριο: Δευτέρα–Παρασκευή 09:00–21:00, Σάββατο 09:00–20:00. Παραλαβή online παραγγελιών σε 2 ώρες από την πρώτη ημέρα.",
    ],
    cta: { label: "Δες το κατάστημα", href: "/katastimata" },
    source: "cms",
  },
  {
    slug: "renew-programma-anakataskeyis",
    title: "Euronics Renew: ανακατασκευασμένα iPhone και MacBook με εγγύηση 2 ετών",
    excerpt: "Ελεγμένες συσκευές σε 40 σημεία, βαθμολόγηση Grade A/B, έως 40% φθηνότερα και με το ίδιο δικαίωμα επιστροφής.",
    date: "2026-09-02",
    category: "proionta",
    image: "/img/hero-renew.jpg",
    body: [
      "Το πρόγραμμα Renew επεκτείνεται σε όλο το δίκτυο: κάθε συσκευή περνά από 40 σημεία ελέγχου, αντικατάσταση μπαταρίας όπου χρειάζεται και πλήρη διαγραφή δεδομένων.",
      "Η εγγύηση είναι 2 έτη, όπως στα καινούργια, και ισχύει το δικαίωμα υπαναχώρησης 14 ημερών.",
    ],
    cta: { label: "Δες τα Renew", href: "/renew" },
    source: "cms",
  },
  {
    slug: "black-friday-2026-prokratisi",
    title: "Black Friday 2026: προκράτηση προσφορών από 10 Νοεμβρίου με δόσεις χωρίς κάρτα",
    excerpt: "Οι εγγεγραμμένοι πελάτες βλέπουν τις προσφορές 48 ώρες νωρίτερα και κλειδώνουν απόθεμα με παραλαβή από κατάστημα.",
    date: "2026-08-28",
    category: "prosfores",
    image: "/img/guide-tv.jpg",
    body: ["Οι προσφορές της Black Friday θα ανοίξουν σταδιακά ανά κατηγορία. Με λογαριασμό Euronics λαμβάνεις ειδοποίηση για τα προϊόντα της λίστας σου μόλις πέσει η τιμή τους."],
    cta: { label: "Φτιάξε τη λίστα σου", href: "/lista" },
    source: "cms",
  },
  {
    slug: "nea-energeiaki-etiketa-2026",
    title: "Νέα ενεργειακή ετικέτα ΕΕ: τι αλλάζει σε ψυγεία και πλυντήρια από το 2026",
    excerpt: "Η κλίμακα A–G αντικαθιστά τα A+++ και τα δελτία προϊόντος γίνονται υποχρεωτικά online. Σε κάθε κάρτα προϊόντος βλέπεις πλέον την κλάση και το δελτίο.",
    date: "2026-08-20",
    category: "etaireia",
    image: "/img/guide-energy.jpg",
    body: ["Ο Κανονισμός 2017/1369 απαιτεί την ετικέτα και το δελτίο προϊόντος να είναι ορατά πριν την αγορά. Το νέο euronics.gr τα δείχνει στην κάρτα, στη σελίδα προϊόντος και στη σύγκριση."],
    cta: { label: "Διάβασε τον οδηγό", href: "/odigoi/nea-energeiaki-etiketa" },
    source: "cms",
  },
  {
    slug: "klimatistika-egkatastasi-48-ores",
    title: "Καύσωνας: εγκατάσταση κλιματιστικού σε 48 ώρες σε 120 καταστήματα",
    excerpt: "Ενισχύονται τα τεχνικά συνεργεία σε Αττική, Θεσσαλονίκη, Πάτρα και Ηράκλειο. Ραντεβού online κατά την αγορά.",
    date: "2026-07-15",
    category: "katastimata",
    image: "/img/guide-ac.jpg",
    body: ["Η παράδοση με ραντεβού & εγκατάσταση επιλέγεται στο checkout· ο τεχνικός του καταστήματος επιβεβαιώνει ημέρα και ώρα εντός 24 ωρών."],
    cta: { label: "Έξυπνος οδηγός κλιματιστικών", href: "/odigos-agoras/klimatistika" },
    source: "cms",
  },
  {
    slug: "back-to-school-laptop-2026",
    title: "Back to school: laptop για κάθε σχολή από 399 € με δωρεάν τσάντα και Office",
    excerpt: "Συνεργασία με Microsoft και HP για φοιτητικά πακέτα· 12 δόσεις χωρίς κάρτα με φοιτητική ταυτότητα.",
    date: "2026-08-25",
    category: "prosfores",
    image: "/img/hero-laptop.jpg",
    cta: { label: "Δες τα laptop", href: "/k/computing/laptops" },
    source: "cms",
  },
  {
    slug: "euronics-international-athens-2026",
    title: "Η Euronics International συνεδριάζει στην Αθήνα: 8.000 καταστήματα, 37 χώρες",
    excerpt: "Η ελληνική Euronics φιλοξενεί το ετήσιο συνέδριο του ομίλου· στο επίκεντρο η ενεργειακή μετάβαση και το omnichannel.",
    date: "2026-06-10",
    category: "etaireia",
    image: "/img/store-front.jpg",
    source: "cms",
  },
  {
    slug: "workshop-kafe-barista",
    title: "Workshop barista στα καταστήματα: μάθε τη μηχανή espresso σου",
    excerpt: "Δωρεάν σεμινάρια 45 λεπτών κάθε Σάββατο σε 30 καταστήματα, με δοκιμή σε DeLonghi, Philips και AEG.",
    date: "2026-09-05",
    category: "ekdiloseis",
    image: "/img/product-espresso.jpg",
    cta: { label: "Κλείσε θέση", href: "/katastimata" },
    source: "cms",
  },
];

export const NEWS_CATEGORIES: { slug: NewsItem["category"]; label: string }[] = [
  { slug: "prosfores", label: "Προσφορές" },
  { slug: "katastimata", label: "Καταστήματα" },
  { slug: "proionta", label: "Προϊόντα" },
  { slug: "ekdiloseis", label: "Εκδηλώσεις" },
  { slug: "etaireia", label: "Εταιρεία" },
];
