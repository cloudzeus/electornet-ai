/**
 * Σκετς παρουσίασης «ο Ερμής εξοπλίζει ένα σπίτι στη Λάρισα». Το στιγμιότυπο (snapshot.json) το γράφει το
 * scripts/skets/prep.ts την προηγούμενη μέρα: πραγματικά προϊόντα του καταλόγου, καταστήματα, ηχογραφημένες φράσεις.
 * Στη σκηνή δεν τρέχει κανένα ερώτημα στη βάση — μόνο η κλήση στο κατάστημα είναι ζωντανή.
 */
export type CatKey = "washer" | "fridge" | "tv" | "ac" | "cooker";
export type Room = "bath" | "kitchen" | "living";

export interface SkProduct { id: string; title: string; brand: string; price: number; image: string; slug: string; /** το κύριο μέγεθος της ερώτησης: «9 kg», «55″», «12.000 BTU» */ key: string; chips: string[] }
export interface SkReject { id: string; reason: string }
export interface SkCategory {
  key: CatKey; room: Room; label: string;
  candidates: SkProduct[];
  /** απορρίψεις μετά την απάντηση του παρουσιαστή, μία-μία */
  reject: SkReject[];
  /** δεύτερος γύρος: από όσα έμειναν, ο Ερμής προτείνει ένα */
  reject2: SkReject[];
  pick: string;
  lines: { ask: string; answer: string; verdict: string; verdict2: string | null; pick: string };
}
export interface SkStore { id: string; name: string; street: string; address: string; city: string; phone: string | null; km: number; lat: number; lng: number; /** «το κατάστημα της Αεροδρομίου» */ spoken: string }
export interface Snapshot {
  at: string;
  presenter: { name: string; vocative: string; full: string };
  home: { lat: number; lng: number; label: string };
  cats: SkCategory[];
  total: number;
  instalments: { months: number; amount: number } | null;
  stores: SkStore[];
  /** κείμενο φράσης → URL ηχογράφησης (φωνή του Ερμή) */
  voice: Record<string, string>;
}
