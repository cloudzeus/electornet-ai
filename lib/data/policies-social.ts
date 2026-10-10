import type { Policy } from "./types";

/**
 * Οι σελίδες που ζητούν οι πάροχοι social login (Google, Microsoft, Facebook, Apple): πολιτική απορρήτου, όροι χρήσης,
 * cookies — με το κείμενο του σημερινού euronics.gr, αλλά:
 *  1. οι διευθύνσεις του παλιού site γίνονται του domain που ανοίγει τη σελίδα (dev, demo, live) και οι δικές μας διαδρομές
 *  2. προστίθενται ενότητες για τη σύνδεση μέσω τρίτων (ό,τι ζητούν Google API Services User Data Policy, Meta, Apple)
 * Καθαρές συναρτήσεις.
 */
const OLD_PATHS: [RegExp, string][] = [
  [/https?:\/\/(?:www\.)?euronics\.gr\/privacy-notice\/?/gi, "/aporrito"],
  [/https?:\/\/(?:www\.)?euronics\.gr\/euronics-cookies\/?/gi, "/cookies"],
  [/https?:\/\/(?:www\.)?euronics\.gr\/(?:όροι-χρήσης|%CF%8C%CF%81%CE%BF%CE%B9-%CF%87%CF%81%CE%AE%CF%83%CE%B7%CF%82)\/?/gi, "/oroi-chrisis"],
];

/** Κείμενο του παλιού site → διευθύνσεις του τρέχοντος domain. Τα email της εταιρείας (…@euronics.gr) μένουν ως έχουν. */
export function localizeText(text: string, origin: string): string {
  const o = origin.replace(/\/+$/, "");
  const host = o.replace(/^https?:\/\//, "");
  let t = text;
  for (const [re, path] of OLD_PATHS) t = t.replace(re, `${o}${path}`);
  t = t.replace(/https?:\/\/(?:www\.)?euronics\.gr(?=[/\s,;)]|$)/gi, o);
  // «www.euronics.gr» / «euronics.gr» ως όνομα του site — όχι μέσα σε email (…@euronics.gr) ή σε ήδη αντικατεστημένη διεύθυνση
  t = t.replace(/(?<![@\w./-])(?:www\.)?euronics\.gr(?![\w-])/gi, host);
  return t;
}

export function localizePolicy(p: Policy, origin: string): Policy {
  // χωρίς παραπομπή στη σελίδα του παλιού site: το κείμενο είναι πλέον του καταστήματος
  return { ...p, sourceUrl: undefined, intro: p.intro ? localizeText(p.intro, origin) : p.intro, sections: p.sections.map((s) => ({ title: localizeText(s.title, origin), body: s.body.map((b) => localizeText(b, origin)) })) };
}

/** Ενότητες για την πολιτική απορρήτου: σύνδεση με Google, Microsoft, Facebook ή Apple. */
export function socialPrivacySections(origin: string): Policy["sections"] {
  const o = origin.replace(/\/+$/, "");
  return [
    {
      title: "Σύνδεση και εγγραφή μέσω Google, Microsoft, Facebook ή Apple",
      body: [
        "Μπορείτε να δημιουργήσετε λογαριασμό ή να συνδεθείτε στο κατάστημα με τον λογαριασμό σας σε Google, Microsoft, Facebook ή Apple, αντί για κωδικό. Η χρήση αυτών των επιλογών είναι προαιρετική· μπορείτε πάντα να χρησιμοποιείτε email και κωδικό.",
        "Όταν επιλέγετε έναν πάροχο, μεταφέρεστε στη σελίδα του, όπου συνδέεστε και εγκρίνετε ποια στοιχεία θα μας δοθούν. Τον κωδικό του λογαριασμού σας στον πάροχο δεν τον βλέπουμε και δεν τον αποθηκεύουμε ποτέ.",
        "Ζητάμε μόνο τα βασικά στοιχεία ταυτότητας (Google, Microsoft, Apple: «openid», «email», «profile» / «name email» · Facebook: «public_profile», «email») και αποθηκεύουμε: το μοναδικό αναγνωριστικό του λογαριασμού σας στον πάροχο, τη διεύθυνση email (και αν ο πάροχος την έχει επιβεβαιώσει) και το ονοματεπώνυμο. Δεν αποθηκεύουμε φωτογραφία προφίλ, λίστα φίλων ή επαφών, δημοσιεύσεις ή άλλα δεδομένα, και δεν κρατάμε κλειδιά πρόσβασης (tokens) στον λογαριασμό σας.",
        "Χρησιμοποιούμε τα στοιχεία αυτά αποκλειστικά για να δημιουργήσουμε και να αναγνωρίζουμε τον λογαριασμό σας στο κατάστημα (σύνδεση, παραγγελίες, εγγυήσεις, ειδοποιήσεις που έχετε επιλέξει). Δεν δημοσιεύουμε τίποτα για λογαριασμό σας στον πάροχο, δεν πωλούμε και δεν μεταβιβάζουμε τα στοιχεία σε τρίτους για διαφήμιση. Νομική βάση είναι η εκτέλεση της σύμβασης (λογαριασμός πελάτη) σύμφωνα με το άρθρο 6 παρ. 1 β' του ΓΚΠΔ.",
        "Αν υπάρχει ήδη λογαριασμός με το ίδιο email, συνδέεται με τον πάροχο μόνο όταν ο πάροχος επιβεβαιώνει ότι το email σας ανήκει.",
        "Apple: αν επιλέξετε «Απόκρυψη email», η Apple μάς δίνει μια διεύθυνση προώθησης (…@privaterelay.appleid.com). Τα μηνύματα για τις παραγγελίες σας στέλνονται σε αυτή και η Apple τα προωθεί στο email σας.",
        "Google: η χρήση και η μεταφορά σε άλλη εφαρμογή πληροφοριών που λαμβάνουμε από τα Google APIs τηρούν την Πολιτική δεδομένων χρηστών των υπηρεσιών API της Google (Google API Services User Data Policy), συμπεριλαμβανομένων των απαιτήσεων Περιορισμένης Χρήσης (Limited Use).",
        "Ο κάθε πάροχος επεξεργάζεται τα δικά του δεδομένα σύμφωνα με τη δική του πολιτική απορρήτου: Google (https://policies.google.com/privacy), Microsoft (https://privacy.microsoft.com/el-gr/privacystatement), Meta / Facebook (https://www.facebook.com/privacy/policy), Apple (https://www.apple.com/gr/legal/privacy/).",
      ],
    },
    {
      title: "Διάρκεια τήρησης, αποσύνδεση και διαγραφή",
      body: [
        "Τα στοιχεία της σύνδεσης μέσω τρίτου τηρούνται όσο υπάρχει ο λογαριασμός σας. Τα παραστατικά αγορών και ό,τι απαιτεί ο νόμος (φορολογικά, εγγυήσεις) τηρούνται για τον χρόνο που ορίζει η νομοθεσία.",
        "Μπορείτε να ανακαλέσετε την πρόσβαση από τις ρυθμίσεις του παρόχου σας ανά πάσα στιγμή. Η ανάκληση δεν διαγράφει τον λογαριασμό σας στο κατάστημα· για σύνδεση χρησιμοποιείτε τότε email και κωδικό («Ξέχασα τον κωδικό» για να ορίσετε έναν).",
        `Για τη διαγραφή του λογαριασμού και των δεδομένων σας ακολουθήστε τις οδηγίες στο ${o}/diagrafi-dedomenon ή από «Ο λογαριασμός μου» → «Τα στοιχεία μου» → «Τα δεδομένα μου (GDPR)». Απαντάμε το αργότερο σε 30 ημέρες.`,
      ],
    },
  ];
}

/** Ενότητα για τους όρους χρήσης: λογαριασμός και σύνδεση μέσω τρίτων. */
export function socialTermsSections(origin: string): Policy["sections"] {
  const o = origin.replace(/\/+$/, "");
  return [{
    title: "ΛΟΓΑΡΙΑΣΜΟΣ ΧΡΗΣΤΗ ΚΑΙ ΣΥΝΔΕΣΗ ΜΕΣΩ ΤΡΙΤΩΝ",
    body: [
      "Ο χρήστης μπορεί να δημιουργήσει λογαριασμό με email και κωδικό ή μέσω λογαριασμού Google, Microsoft, Facebook ή Apple. Με τη δημιουργία λογαριασμού με οποιονδήποτε τρόπο, ο χρήστης αποδέχεται τους παρόντες όρους και έχει ενημερωθεί για την Πολιτική απορρήτου.",
      "Ο χρήστης ευθύνεται για την ασφάλεια του λογαριασμού του στον πάροχο που χρησιμοποιεί για τη σύνδεση. Η εταιρεία δεν ευθύνεται για τη διαθεσιμότητα των υπηρεσιών σύνδεσης των παρόχων· σε περίπτωση μη διαθεσιμότητας, η σύνδεση γίνεται με email και κωδικό.",
      "Η χρήση των υπηρεσιών των παρόχων διέπεται από τους δικούς τους όρους. Η εταιρεία λαμβάνει από τον πάροχο μόνο τα στοιχεία που περιγράφονται στην Πολιτική απορρήτου και δεν δημοσιεύει περιεχόμενο για λογαριασμό του χρήστη.",
      `Ο χρήστης μπορεί οποιαδήποτε στιγμή να διαγράψει τον λογαριασμό του, σύμφωνα με τις οδηγίες στο ${o}/diagrafi-dedomenon.`,
    ],
  }];
}

/** Πότε προστέθηκαν οι ενότητες της σύνδεσης μέσω τρίτων (η «τελευταία ενημέρωση» της πολιτικής και των όρων). */
export const SOCIAL_UPDATED = "2026-10-10";

/** Η πολιτική όπως εμφανίζεται στο site: προσαρμοσμένες διευθύνσεις + οι ενότητες της σύνδεσης μέσω τρίτων. */
export function sitePolicy(p: Policy, origin: string): Policy {
  const l = localizePolicy(p, origin);
  if (p.slug === "aporrito") {
    // πριν από «Υπεύθυνοι επικοινωνίας…», ώστε τα δικαιώματα και η επικοινωνία να μένουν στο τέλος
    const at = l.sections.findIndex((s) => /Υπεύθυνοι επικοινωνίας/i.test(s.title));
    const sections = [...l.sections];
    sections.splice(at >= 0 ? at : sections.length, 0, ...socialPrivacySections(origin));
    return { ...l, sections, updated: SOCIAL_UPDATED };
  }
  if (p.slug === "oroi-chrisis") {
    const at = l.sections.findIndex((s) => /ΠΡΟΣΤΑΣΙΑ ΔΕΔΟΜΕΝΩΝ/i.test(s.title));
    const sections = [...l.sections];
    sections.splice(at >= 0 ? at : sections.length, 0, ...socialTermsSections(origin));
    return { ...l, sections, updated: SOCIAL_UPDATED };
  }
  return l;
}
