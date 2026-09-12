import type { BrandStore } from "@/lib/cms/brand-store";

/**
 * @dynamic Three sample brand stores (LG, Samsung, Apple). In production
 * these records live in the CMS («Brand stores» collection) and are edited
 * by the brand's key account manager: theme tokens, hero, blocks, product
 * ids, schedule. Wordmarks are text until the official assets are licensed.
 */
export const brandStores: BrandStore[] = [
  {
    slug: "lg",
    name: "LG",
    wordmark: "LG",
    tagline: "Life's Good",
    theme: { bg: "#0b0b0d", bg2: "#17171b", ink: "#ffffff", muted: "#b5b5bd", accent: "#a50034", accentInk: "#ffffff", mode: "dark" },
    hero: {
      kicker: "LG στη Euronics",
      title: ["Εικόνα που", "σε κοιτάζει", "πίσω."],
      body: "OLED evo και QNED evo AI με επεξεργαστή α9, webOS 26 και 5 χρόνια εγγύηση panel. Δες τα στο κατάστημα της γειτονιάς σου.",
      cta: { label: "Δες τις τηλεοράσεις LG", href: "/k/eikona-ixos/tileoraseis?brand=lg" },
      productId: "r-152715",
    },
    blocks: [
      { id: "lg-new", type: "new-arrivals", kicker: "Νέα προϊόντα 2026", title: "Μόλις έφτασαν", lead: "Η νέα σειρά QNED evo AI και το ψυγείο InstaView.", productIds: ["r-152715", "r-146545", "r-108803"] },
      {
        id: "lg-series",
        type: "series",
        kicker: "Σειρές",
        title: "Διάλεξε τη σειρά σου",
        items: [
          { name: "QNED evo AI", blurb: "Mini LED, Quantum Dot και AI επεξεργασία εικόνας για φωτεινά σαλόνια.", image: "/img/products/r-152715-1.jpg", productIds: ["r-152715"], href: "/k/eikona-ixos/tileoraseis?brand=lg" },
          { name: "NanoCell & LED", blurb: "Καθαρά χρώματα και webOS σε 32\" έως 65\", στην καλύτερη τιμή.", image: "/img/products/p-lg-43nano82-0.jpg", productIds: ["p-lg-43nano82", "r-108803"], href: "/k/eikona-ixos/tileoraseis?brand=lg" },
          { name: "Ψυγεία InstaView", blurb: "Χτύπα δύο φορές το τζάμι και δες μέσα χωρίς να ανοίξεις την πόρτα.", image: "/img/products/r-146545-1.jpg", productIds: ["r-146545"], href: "/k/leykes-syskeyes/psygeia?brand=lg" },
        ],
      },
      {
        id: "lg-tech",
        type: "tech",
        kicker: "Τεχνολογία",
        title: "Τι κάνει μια LG, LG",
        items: [
          { icon: "cpu", title: "Επεξεργαστής α9 AI", blurb: "Αναβαθμίζει κάθε πηγή σε ποιότητα κοντά σε 4K και ρυθμίζει ήχο ανά σκηνή." },
          { icon: "eye", title: "OLED evo", blurb: "Τέλειο μαύρο, κάθε pixel αυτόφωτο, 5 χρόνια εγγύηση panel." },
          { icon: "wifi", title: "webOS 26 & ThinQ", blurb: "Όλες οι πλατφόρμες, φωνητικές εντολές, έλεγχος συσκευών από το κινητό." },
          { icon: "leaf", title: "Inverter Direct Drive", blurb: "10 χρόνια εγγύηση μοτέρ στα πλυντήρια και τα ψυγεία." },
        ],
      },
      { id: "lg-offers", type: "offers", kicker: "Προσφορές LG", title: "Μέχρι την Κυριακή", productIds: ["p-lg-43nano82", "r-108803", "r-152715", "r-146545"], endsAt: "2026-09-13T23:59:00+03:00" },
      { id: "lg-story", type: "story", kicker: "Η ιστορία", title: "Το σαλόνι που φωτίζεται από την οθόνη, όχι από τη λάμπα", image: "/img/products/r-152715-3.jpg", body: "Ο νέος επεξεργαστής α9 gen 8 αναλύει κάθε καρέ και το ξαναχτίζει με βάθος, ενώ το Mini LED backlight δίνει φωτεινότητα που αντέχει και το μεσημέρι με ανοιχτές κουρτίνες. Στη Euronics το βλέπεις live δίπλα σε OLED και επιλέγεις με το μάτι σου.", cta: { label: "Κλείσε επίδειξη στο κατάστημα", href: "/katastimata" }, align: "right" },
      { id: "lg-support", type: "support", facts: ["Επίσημη εγγύηση LG Hellas 2 έτη", "5 έτη εγγύηση panel OLED", "Service αντιπροσωπείας, γνήσια ανταλλακτικά", "Παράδοση και τοποθέτηση σε βάση τοίχου από το κατάστημα"], askAris: ["OLED ή QNED για φωτεινό σαλόνι;", "55 ή 65 ίντσες για 3 μέτρα;"] },
    ],
    seo: { title: "LG στη Euronics — OLED evo, QNED, ψυγεία InstaView", description: "Η σελίδα της LG στη Euronics: νέα προϊόντα, σειρές, προσφορές και τεχνολογία, με εργοστασιακή εγγύηση και service αντιπροσωπείας." },
  },
  {
    slug: "samsung",
    name: "Samsung",
    wordmark: "SAMSUNG",
    tagline: "Do what you can't",
    theme: { bg: "#ffffff", bg2: "#f4f6fb", ink: "#0b1a3a", muted: "#5c6a85", accent: "#1428a0", accentInk: "#ffffff", mode: "light" },
    hero: {
      kicker: "Samsung στη Euronics",
      title: ["Galaxy AI", "σε κάθε", "συσκευή."],
      body: "Galaxy S26 Ultra, Vision AI τηλεοράσεις και Bespoke AI πλυντήρια που μαθαίνουν τη ρουτίνα σου. Όλα με 2 χρόνια εγγύηση Samsung Hellas.",
      cta: { label: "Δες τα νέα Galaxy", href: "/k/tilefonia/smartphones?brand=samsung" },
      productId: "r-150601",
      image: "/img/campaigns/samsung-vision-ai.jpg",
    },
    blocks: [
      { id: "s-new", type: "new-arrivals", kicker: "Νέα προϊόντα", title: "Η νέα γενιά Galaxy & Neo QLED", lead: "Ό,τι παρουσιάστηκε φέτος, διαθέσιμο τώρα.", productIds: ["r-150601", "r-154164", "r-134843"] },
      {
        id: "s-series",
        type: "series",
        kicker: "Σειρές",
        title: "Τρεις κόσμοι, μία εφαρμογή",
        items: [
          { name: "Galaxy", blurb: "S26 Ultra με Galaxy AI: μετάφραση σε κλήση, Circle to Search, κάμερα 200 MP.", image: "/img/products/r-150601-0.jpg", productIds: ["r-150601", "p-samsung-s26"], href: "/k/tilefonia/smartphones?brand=samsung" },
          { name: "Neo QLED & OLED", blurb: "Vision AI, Glare Free οθόνη, 144 Hz για gaming.", image: "/img/campaigns/samsung-oled-s95f.jpg", productIds: ["r-154164", "r-142829", "p-samsung-55-qled"], href: "/k/eikona-ixos/tileoraseis?brand=samsung" },
          { name: "Bespoke AI", blurb: "Πλυντήρια που ζυγίζουν τα ρούχα και δοσολογούν μόνα τους, 20 χρόνια εγγύηση μοτέρ.", image: "/img/products/r-134843-1.jpg", productIds: ["r-134843"], href: "/k/leykes-syskeyes/plyntiria?brand=samsung" },
        ],
      },
      { id: "s-story", type: "story", kicker: "Vision AI", title: "Η τηλεόραση που καταλαβαίνει τι βλέπεις", image: "/img/campaigns/samsung-vision-ai.jpg", body: "Το Vision AI αναγνωρίζει το περιεχόμενο και προσαρμόζει εικόνα και ήχο σε πραγματικό χρόνο, μεταφράζει υπότιτλους live και μετατρέπει την οθόνη σε πίνακα όταν δεν βλέπεις. Η Glare Free επίστρωση του S95F κρατά το μαύρο μαύρο ακόμη και με τον ήλιο απέναντι.", cta: { label: "Δες τη σειρά S95F", href: "/k/eikona-ixos/tileoraseis?brand=samsung" }, align: "left" },
      {
        id: "s-tech",
        type: "tech",
        kicker: "Τεχνολογία",
        title: "Γιατί Samsung",
        items: [
          { icon: "sparkles", title: "Galaxy AI", blurb: "Live μετάφραση, σύνοψη σημειώσεων, επεξεργασία φωτογραφίας με ένα άγγιγμα." },
          { icon: "eye", title: "Vision AI", blurb: "Αυτόματη βελτίωση εικόνας και ήχου ανά σκηνή." },
          { icon: "shield", title: "Knox", blurb: "Ασφάλεια σε επίπεδο chip σε κινητά και τηλεοράσεις." },
          { icon: "wifi", title: "SmartThings", blurb: "Μία εφαρμογή για όλο το σπίτι, ενεργειακή παρακολούθηση." },
        ],
      },
      { id: "s-offers", type: "offers", kicker: "Προσφορές Samsung", title: "Cashback & δώρα", productIds: ["r-134843", "r-142829", "r-154164", "r-150601"], endsAt: "2026-09-30T23:59:00+03:00" },
      { id: "s-support", type: "support", facts: ["Εγγύηση Samsung Hellas 2 έτη", "20 χρόνια εγγύηση μοτέρ Digital Inverter", "Επίσημο service με γνήσια ανταλλακτικά", "Trade-in παλιού κινητού στο κατάστημα"], askAris: ["Τι διαφορά έχει το S26 Ultra από το S26;", "Neo QLED ή OLED S95F;"] },
    ],
    seo: { title: "Samsung στη Euronics — Galaxy AI, Neo QLED, Bespoke AI", description: "Η σελίδα της Samsung στη Euronics: νέα Galaxy, Vision AI τηλεοράσεις, Bespoke AI λευκές συσκευές, προσφορές και cashback." },
  },
  {
    slug: "apple",
    name: "Apple",
    wordmark: "Apple",
    tagline: "Think different",
    theme: { bg: "#fbfbfd", bg2: "#f0f0f3", ink: "#1d1d1f", muted: "#6e6e73", accent: "#0071e3", accentInk: "#ffffff", mode: "light" },
    hero: {
      kicker: "Apple Authorised Reseller",
      title: ["MacBook Air.", "Ελαφρύ.", "Απίστευτο."],
      body: "M5 chip, 18 ώρες μπαταρία, 1,24 kg. Με 24 άτοκες δόσεις και δωρεάν εγκατάσταση από το κατάστημα.",
      cta: { label: "Δες τα MacBook", href: "/k/computing/laptops?brand=apple" },
      productId: "r-157206",
    },
    blocks: [
      { id: "a-new", type: "new-arrivals", kicker: "Νέα", title: "iPhone 17 · MacBook Air M5 · MacBook Neo", lead: "Η φετινή σειρά, σε όλα τα χρώματα.", productIds: ["r-146037", "r-157206", "r-150983"] },
      {
        id: "a-series",
        type: "series",
        kicker: "Σειρές",
        title: "Διάλεξε το δικό σου",
        items: [
          { name: "iPhone", blurb: "iPhone 17 και 16e με Apple Intelligence, 5 χρόνια ενημερώσεις.", image: "/img/products/r-146037-1.jpg", productIds: ["r-146037", "r-141249", "p-iphone-17-pro-256"], href: "/k/tilefonia/smartphones?brand=apple" },
          { name: "Mac", blurb: "MacBook Air M5 και MacBook Neo: ό,τι χρειάζεται σχολή και δουλειά.", image: "/img/products/r-157206-1.jpg", productIds: ["r-157206", "r-157205", "r-150983", "r-150980"], href: "/k/computing/laptops?brand=apple" },
          { name: "Euronics Renew", blurb: "Ανακατασκευασμένα iPhone, MacBook και iPad με 2 χρόνια εγγύηση, έως −40 %.", image: "/img/hero-renew.jpg", productIds: ["p-iphone-15-renew", "p-macbook-air-m1-renew", "p-ipad-102-renew"], href: "/renew" },
        ],
      },
      {
        id: "a-tech",
        type: "tech",
        kicker: "Γιατί Apple",
        title: "Λεπτομέρειες που μετράνε",
        items: [
          { icon: "cpu", title: "Apple silicon", blurb: "M5 και A19: ταχύτητα χωρίς ανεμιστήρα, μπαταρία μιας ημέρας." },
          { icon: "sparkles", title: "Apple Intelligence", blurb: "Γραφή, σύνοψη, εικόνες, στη συσκευή σου, ιδιωτικά." },
          { icon: "camera", title: "Κάμερα 48 MP", blurb: "Fusion camera με 2x οπτικό zoom ποιότητας." },
          { icon: "shield", title: "Ιδιωτικότητα", blurb: "Face ID, κρυπτογράφηση από άκρο σε άκρο, χωρίς παρακολούθηση." },
        ],
      },
      { id: "a-offers", type: "offers", kicker: "Προσφορές Apple", title: "Δόσεις & Renew", productIds: ["r-141249", "r-150983", "p-macbook-air-m1-renew", "p-iphone-15-renew"], endsAt: "2026-09-30T23:59:00+03:00" },
      { id: "a-story", type: "story", kicker: "Στο κατάστημα", title: "Μεταφορά δεδομένων και ρύθμιση σε 30 λεπτά", image: "/img/hero-laptop.jpg", body: "Φέρνεις το παλιό, φεύγεις με το νέο έτοιμο: iCloud, εφαρμογές, Face ID, Apple Pay. Το κατάστημα της γειτονιάς σου το κάνει χωρίς χρέωση, και αν το παλιό αξίζει, το παίρνουμε ως Renew.", cta: { label: "Βρες κατάστημα", href: "/katastimata" }, align: "right" },
      { id: "a-support", type: "support", facts: ["Apple Authorised Reseller", "Εγγύηση Apple 2 έτη + AppleCare διαθέσιμο", "Δωρεάν μεταφορά δεδομένων στο κατάστημα", "24 άτοκες δόσεις"], askAris: ["MacBook Air ή MacBook Neo για φοιτητή;", "iPhone 17 ή 16e;"] },
    ],
    seo: { title: "Apple στη Euronics — iPhone 17, MacBook Air M5, Renew", description: "Η σελίδα της Apple στη Euronics: νέα iPhone και MacBook, σειρές, προσφορές με δόσεις, Euronics Renew, μεταφορά δεδομένων στο κατάστημα." },
  },
];
