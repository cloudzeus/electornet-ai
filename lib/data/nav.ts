/** Navigation tree — shared by server and client components (no server-only import). */
export interface NavCategory {
  slug: string;
  label: string;
  children: { name: string; slug: string }[];
  count?: number;
}

export const navCategories: NavCategory[] = [
  { slug: "eikona-ixos", label: "Εικόνα & Ήχος", count: 291, children: [{ name: "Τηλεοράσεις", slug: "tileoraseis" }, { name: "Home Cinema", slug: "home-cinema" }, { name: "Φορητός ήχος", slug: "foritos-ichos" }, { name: "Βάσεις TV", slug: "vaseis-tv" }, { name: "Projectors", slug: "projectors" }, { name: "Ηχεία", slug: "icheia" }] },
  { slug: "tilefonia", label: "Τηλεφωνία", count: 225, children: [{ name: "Smartphones", slug: "smartphones" }, { name: "Wearables", slug: "wearables" }, { name: "Ακουστικά", slug: "akoystika" }, { name: "Θήκες", slug: "thikes" }, { name: "Power bank", slug: "power-bank" }, { name: "Σταθερή τηλεφωνία", slug: "statheri-tilefonia" }] },
  { slug: "computing", label: "Computing", count: 181, children: [{ name: "Laptops", slug: "laptops" }, { name: "Tablets", slug: "tablets" }, { name: "Οθόνες", slug: "othones" }, { name: "Περιφερειακά", slug: "perifereiaka" }, { name: "Storage", slug: "storage" }, { name: "Networking", slug: "networking" }, { name: "Εκτύπωση", slug: "ektyposi" }] },
  { slug: "leykes-syskeyes", label: "Λευκές Συσκευές", count: 645, children: [{ name: "Ψυγεία", slug: "psygeia" }, { name: "Πλυντήρια", slug: "plyntiria" }, { name: "Στεγνωτήρια", slug: "stegnotiria" }, { name: "Κουζίνες", slug: "koyzines" }, { name: "Εντοιχιζόμενα", slug: "entoichizomena" }, { name: "Μικροκύματα", slug: "mikrokymata" }, { name: "Απορροφητήρες", slug: "aporrofitires" }] },
  { slug: "klimatismos", label: "Κλιματισμός", count: 227, children: [{ name: "Air condition", slug: "air-condition" }, { name: "Αφυγραντήρες", slug: "afygrantires" }, { name: "Ανεμιστήρες", slug: "anemistires" }, { name: "Θερμαντικά", slug: "thermantika" }, { name: "Ηλιακοί θερμοσίφωνες", slug: "iliakoi-thermosifones" }] },
  { slug: "oikiakos-exoplismos", label: "Οικιακός Εξοπλισμός", count: 508, children: [{ name: "Σκούπες", slug: "skoypes" }, { name: "Σιδέρωμα", slug: "sideroma" }, { name: "Καφές & ροφήματα", slug: "kafes-rofimata" }, { name: "Μαγειρική", slug: "mageiriki" }, { name: "Σκεύη", slug: "skeyi" }] },
  { slug: "frontida", label: "Φροντίδα", count: 158, children: [{ name: "Γυναίκα", slug: "gynaika" }, { name: "Άνδρας", slug: "andras" }, { name: "Παιδί", slug: "paidi" }, { name: "Υγεία & ευεξία", slug: "ygeia-eyexia" }] },
  { slug: "gaming", label: "Gaming", count: 15, children: [{ name: "PC Gaming", slug: "pc-gaming" }, { name: "Ηλεκτρικά πατίνια", slug: "ilektrika-patinia" }, { name: "Αξεσουάρ", slug: "axesoyar" }] },
];

export const navUtility = [
  { slug: "prosfores", label: "Προσφορές", tone: "offer" as const },
  { slug: "brands", label: "Μάρκες" }, // οι σελίδες των εταιριών: /brands και /brands/<μάρκα>
  { slug: "ypiresies", label: "Υπηρεσίες" },
  { slug: "katastimata", label: "Καταστήματα" },
];

/** One-line descriptors per sub-category for the mega menu (customer copy, CMS-editable). */
export const SUB_BLURB: Record<string, string> = {
  tileoraseis: "OLED, QLED, 4K · 32\" έως 85\"",
  "home-cinema": "Soundbar, ενισχυτές, ηχοσυστήματα",
  "foritos-ichos": "Bluetooth ηχεία, ακουστικά",
  "vaseis-tv": "Επιτοίχιες, επιδαπέδιες, με βραχίονα",
  projectors: "Full HD & 4K, φορητοί",
  icheia: "Ηχεία ραφιού, δαπέδου, party",
  smartphones: "iPhone, Samsung, Xiaomi · 5G",
  wearables: "Smartwatch, fitness tracker",
  akoystika: "Ασύρματα, ANC, αθλητικά",
  thikes: "Θήκες, προστασία οθόνης",
  "power-bank": "Φορτιστές, καλώδια",
  "statheri-tilefonia": "Ασύρματα τηλέφωνα σπιτιού",
  laptops: "Windows, MacBook, gaming",
  tablets: "iPad, Android, με πληκτρολόγιο",
  othones: "Γραφείου, gaming, 4K",
  perifereiaka: "Πληκτρολόγια, ποντίκια, webcam",
  storage: "SSD, εξωτερικοί δίσκοι, USB",
  networking: "Router, mesh, Wi-Fi 6",
  ektyposi: "Εκτυπωτές, πολυμηχανήματα, μελάνια",
  psygeia: "Ψυγειοκαταψύκτες, No Frost, side by side",
  plyntiria: "7–11 kg, ατμός, A–C",
  stegnotiria: "Αντλίας θερμότητας",
  koyzines: "Εμαγιέ, κεραμικές, επαγωγικές",
  entoichizomena: "Φούρνοι, εστίες, πλυντήρια πιάτων",
  mikrokymata: "Με ή χωρίς grill",
  aporrofitires: "Τζάκι, συρόμενοι, νησίδας",
  "air-condition": "Inverter 9.000–24.000 BTU, Wi-Fi",
  afygrantires: "10–25 λίτρα, ιονιστής",
  anemistires: "Δαπέδου, ανεμιστήρες οροφής",
  thermantika: "Θερμοπομποί, καλοριφέρ, αερόθερμα",
  "iliakoi-thermosifones": "Επιλεκτικοί, glass",
  skoypes: "Σκουπάκια, ρομπότ, με σακούλα",
  sideroma: "Ατμοσίδερα, πρέσες, ατμοσυστήματα",
  "kafes-rofimata": "Espresso, καψουλών, φίλτρου",
  mageiriki: "Airfryer, πολυμάγειρες, μίξερ",
  skeyi: "Τηγάνια, κατσαρόλες, σετ",
  gynaika: "Αποτρίχωση, styling, περιποίηση",
  andras: "Ξυριστικές, trimmer",
  paidi: "Θερμόμετρα, ενδοεπικοινωνίες",
  "ygeia-eyexia": "Πιεσόμετρα, ζυγαριές, μασάζ",
  "pc-gaming": "Gaming PC, οθόνες 144 Hz",
  "ilektrika-patinia": "Έως 25 km/h, αναδιπλούμενα",
  axesoyar: "Χειριστήρια, headset, καρέκλες",
};
