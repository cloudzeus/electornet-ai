/**
 * Σκετς παρουσίασης «ο Ερμής εξοπλίζει ένα σπίτι στη Λάρισα». Το στιγμιότυπο (snapshot.json) το γράφει το
 * scripts/skets/prep.ts την προηγούμενη μέρα: πραγματικά προϊόντα του καταλόγου, καταστήματα, ηχογραφημένες φράσεις.
 * Στη σκηνή δεν τρέχει κανένα ερώτημα στη βάση — μόνο η κλήση στο κατάστημα είναι ζωντανή.
 */
export type CatKey = "washer" | "fridge" | "tv" | "ac" | "cooker";
export type Room = "bath" | "kitchen" | "living";

export interface SkProduct { id: string; title: string; brand: string; /** κωδικός μοντέλου κατασκευαστή, για το τηλέφωνο με το κατάστημα */ model: string | null; price: number; image: string; slug: string; /** το κύριο μέγεθος της ερώτησης: «9 kg», «55″», «12.000 BTU» */ key: string; chips: string[] }
export interface SkReject { id: string; reason: string }
/** Άλλη απάντηση του παρουσιαστή (π.χ. «σαράντα τετραγωνικά» αντί για «είκοσι πέντε») → άλλη ετυμηγορία και άλλο προϊόν.
 * min/max: εύρος του αριθμού που είπε (στη μονάδα `unit` της ομάδας) · words: regex (χωρίς τόνους) όταν δεν είπε αριθμό («πιο μεγάλο»). */
export interface SkAlt { key: string; min?: number; max?: number; words?: string; verdict: string; reject: SkReject[]; pick: string; pickLine: string; /** «μου το είπατε ήδη» για αυτή τη διακλάδωση («…προτιμάτε επαγωγική») */ known?: string }
/** διακλαδώσεις που έχουν διαλεχτεί στη σκηνή: ομάδα → SkAlt.key (λείπει = το βασικό σενάριο) */
export type Alts = Partial<Record<CatKey, string>>;
export interface SkCategory {
  key: CatKey; room: Room; label: string;
  candidates: SkProduct[];
  /** απορρίψεις μετά την απάντηση του παρουσιαστή, μία-μία */
  reject: SkReject[];
  /** δεύτερος γύρος: από όσα έμειναν, ο Ερμής προτείνει ένα */
  reject2: SkReject[];
  pick: string;
  /** μονάδα του αριθμού στην απάντηση του παρουσιαστή, για τις διακλαδώσεις */
  unit?: "m2" | "m";
  alts?: SkAlt[];
  lines: { ask: string; answer: string; /** διευκρίνιση πριν την απάντηση: ο Ερμής ρωτά πιο συγκεκριμένα, ο παρουσιαστής απαντά */ follow?: { ask: string; answer: string } | null; verdict: string; verdict2: string | null; pick: string; /** όταν ο παρουσιαστής το είπε ήδη νωρίτερα («…και μεγάλο κάδο»): η ερώτηση αντικαθίσταται από αυτό, χωρίς αναμονή */ known?: string };
}
export interface SkStore { id: string; name: string; street: string; address: string; city: string; phone: string | null; km: number; lat: number; lng: number; /** «το κατάστημα της Αεροδρομίου» */ spoken: string }
/** cat: σε ποια ομάδα ισχύει (null = οπουδήποτε) · q: πώς μπορεί να το πει ο παρουσιαστής · a: τι απαντά ο Ερμής · ids: προϊόντα στην οθόνη */
export interface SkQA { cat: CatKey | null; q: string[]; a: string; ids: string[]; /** μόνο στην έναρξη (πριν μάθει ο Ερμής τα νέα) */ start?: boolean; /** ενώ ο Ερμής ρωτά, πριν διαλέξει προϊόν της ομάδας */ pre?: boolean }
export interface Snapshot {
  at: string;
  presenter: { name: string; vocative: string; full: string; /** «για λογαριασμό του …», «στο όνομα του …» */ genitive: string };
  home: { lat: number; lng: number; label: string };
  cats: SkCategory[];
  total: number;
  instalments: { months: number; amount: number } | null;
  stores: SkStore[];
  /** κείμενο φράσης → URL ηχογράφησης (φωνή του Ερμή) */
  voice: Record<string, string>;
  /** έτοιμες απαντήσεις σε πιθανές ερωτήσεις/σχόλια του παρουσιαστή (scripts/skets/qa.ts), ηχογραφημένες όπως όλες οι φράσεις */
  qa?: SkQA[];
}

/** Ζωντανή ερώτηση εκτός σεναρίου: προϊόν που πρότεινε ο Ερμής του eshop (από τη βάση, τη στιγμή της ερώτησης). */
export interface LiveProduct { id: string; brand: string; title: string; price: number; image: string | null; why: string }
/** Φάσεις της ζωντανής ερώτησης, όπως τις μοιράζει ο server σε σκηνή και τηλεχειριστήριο. */
export interface LiveEv { n: number; phase: "thinking" | "answer" | "audio" | "error" | "resume"; q: string; text?: string; products?: LiveProduct[]; audio?: string; /** η εκφώνηση έρχεται ανά πρόταση: σειρά και πλήθος */ part?: number; parts?: number; error?: string; /** απάντηση στον παρουσιαστή μέσα στο σενάριο: κλείνει μόνη της στο τέλος, χωρίς «πάμε πίσω» (resume = ήταν τελικά η αναμενόμενη απάντηση → συνέχεια) */ quiet?: boolean }
