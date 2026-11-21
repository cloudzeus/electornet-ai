/**
 * Οι couriers του checkout. Ο διαχειριστής ενεργοποιεί όποιους θέλει (Ρυθμίσεις → Αποστολές & courier), με δικό τους
 * κόστος, «δωρεάν από» και χρόνο παράδοσης· ο πελάτης διαλέγει έναν στο checkout. Καθαρές συναρτήσεις — ίδιες σε
 * server (υπολογισμός, παραγγελία) και browser. Ποσά σε λεπτά.
 */
import NO_PRICE_AREAS from "./no-price-areas.json";
import PRICED_AREAS from "./priced-areas.json";
import { ISLAND_PREFIXES } from "@/lib/delivery/rates";

export type CarrierId = "acs" | "geniki" | "elta" | "asap" | "boxnow";
/** address = στη διεύθυνση του πελάτη · locker = σε αυτόματο θυρίδα (ο πελάτης διαλέγει θυρίδα) */
export type CarrierKind = "address" | "locker";

export interface CarrierDef { id: CarrierId; name: string; kind: CarrierKind; eta: string; fee: number }
export const CARRIERS: CarrierDef[] = [
  { id: "acs", name: "ACS Courier", kind: "address", eta: "1–3 εργάσιμες", fee: 490 },
  { id: "geniki", name: "Γενική Ταχυδρομική", kind: "address", eta: "1–3 εργάσιμες", fee: 490 },
  { id: "elta", name: "ΕΛΤΑ Courier", kind: "address", eta: "2–4 εργάσιμες", fee: 390 },
  { id: "asap", name: "ASAP Couriers", kind: "address", eta: "Αυθημερόν στην Αττική", fee: 690 },
  { id: "boxnow", name: "BOX NOW", kind: "locker", eta: "1–2 εργάσιμες σε θυρίδα", fee: 290 },
];
export const carrierDef = (id: string | null | undefined) => CARRIERS.find((c) => c.id === id) ?? null;
export const isCarrierId = (v: unknown): v is CarrierId => CARRIERS.some((c) => c.id === v);

/**
 * Περιοχές χωρίς συμφωνημένη τιμή αποστολής (lib/shipping/no-price-areas.json). Όπως ζήτησε η Euronics (19/11/2026):
 * ΔΕΝ μπλοκάρονται — ο πελάτης παραγγέλνει κανονικά, χωρίς πληρωμή, τα μεταφορικά ορίζονται στο τηλέφωνο και το email
 * επιβεβαίωσης λέει ότι θα τον καλέσουμε. Βγάζεις μια περιοχή από το JSON μόλις τιμολογηθεί.
 */
export const noPriceArea = (zip: string | null | undefined): string | null =>
  NO_PRICE_AREAS.find((a) => a.zips.includes((zip ?? "").trim()))?.name ?? null;
export const ON_REQUEST_REASON = "Τα μεταφορικά εδώ ορίζονται κατόπιν συνεννόησης — σε καλούμε εμείς, ή επικοινώνησε με το κατάστημα της περιοχής σου";
export const ON_REQUEST_LABEL = "Κατόπιν συνεννόησης";

/**
 * Τα νησιά του Σαρωνικού έχουν Τ.Κ. Αττικής αλλά για τις αποστολές δεν είναι Αττική (καράβι, δικός τους τιμοκατάλογος):
 * Αίγινα/Αγκίστρι 18010, Πόρος 18020, Ύδρα 18040, Σπέτσες 18050. Η Σαλαμίνα (18900) μένει Αττική.
 */
export const NON_ATTICA_ZIPS = ["18010", "18020", "18040", "18050"];
/** Αττική: ΤΚ 10xxx–19xxx (Αθήνα, Πειραιάς, Ανατολική/Δυτική Αττική) — χωρίς τα νησιά του Σαρωνικού. */
export const isAtticaZip = (zip: string | null | undefined) => /^1\d{4}$/.test(zip ?? "") && !NON_ATTICA_ZIPS.includes(zip!.trim());

/**
 * Οι περιοχές του συμφωνημένου τιμοκαταλόγου (Περίπτωση 2 της Euronics: περιοχές ΧΩΡΙΣ δικό μας κατάστημα, με δικές τους
 * τιμές ανά κλάση Α–Ε). Χρεώνονται πάντα, ακόμη κι αν τυχαίνει να έχουμε κατάστημα στον Τ.Κ. — έτσι το επιβεβαίωσε η
 * Euronics για Χαλκιδική, Κάλυμνο, Σκόπελο, Ιθάκη, Σκύρο και Σπέτσες (19/11/2026). Τα `zips` είναι προθέματα Τ.Κ.
 */
export const pricedArea = (zip: string | null | undefined): string | null => {
  const z = (zip ?? "").trim();
  if (!/^\d{5}$/.test(z)) return null;
  return PRICED_AREAS.find((a) => a.zips.some((p) => z.startsWith(p)))?.name ?? null;
};

/**
 * «Ανεξάρτητα ποσού έχουμε δωρεάν μεταφορικά σε περιοχές με καταστήματα» (Euronics, σημείωση στο έγγραφο 2.0, 20/11/2026).
 * Δωρεάν όταν υπάρχει ενεργό κατάστημα-μέλος στον ίδιο Τ.Κ. ή σε Τ.Κ. της ίδιας πόλης (ίδια 3 πρώτα ψηφία). Στα νησιά
 * και στην Κρήτη μόνο ο ίδιος Τ.Κ. μετρά: ένα 3ψήφιο πρόθεμα εκεί πιάνει πολλά διαφορετικά νησιά.
 * Οι περιοχές του τιμοκαταλόγου (`pricedArea`) και οι περιοχές χωρίς τιμή (`noPriceArea`) ελέγχονται ΠΡΙΝ από αυτό.
 */
export function storeAreaZip(zip: string | null | undefined, storeZips: Iterable<string>): boolean {
  const z = (zip ?? "").trim();
  if (!/^\d{5}$/.test(z)) return false;
  const list = [...storeZips];
  if (list.includes(z)) return true;
  if (ISLAND_PREFIXES.includes(z.slice(0, 2))) return false;
  return list.some((s) => s.slice(0, 3) === z.slice(0, 3));
}

export interface CarrierOffer {
  id: CarrierId; name: string; kind: CarrierKind; eta: string;
  /** τι πληρώνει ο πελάτης για αυτό το καλάθι */
  fee: number; baseFee: number;
  available: boolean; reason: string | null;
}

type Data = Record<string, unknown>;
const num = (v: unknown): number | null => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const cents = (n: number) => Math.round(n * 100);

/**
 * Οι ενεργοί couriers, με τη σειρά του μητρώου. Η αξία του καλαθιού δεν μηδενίζει τα μεταφορικά — δεν υπάρχει «δωρεάν από»
 * (απόφαση Euronics 20/11/2026): κάθε αποστολή χρεώνεται με τον τιμοκατάλογο.
 * ASAP: μόνο Αττική (εκτός αν το κλείσει ο διαχειριστής) — με άγνωστο ΤΚ μένει διαθέσιμος.
 * BOX NOW: μόνο με Partner ID — χωρίς αυτό ο χάρτης θυρίδων δεν ανοίγει.
 */
export function carrierOffers(data: Data, zip: string | null): CarrierOffer[] {
  return CARRIERS.filter((c) => data[`${c.id}On`] === true && (c.id !== "boxnow" || String(data.boxnowPartnerId ?? "").trim() !== "")).map((c) => {
    const baseFee = num(data[`${c.id}Fee`]) != null ? cents(num(data[`${c.id}Fee`])!) : c.fee;
    const eta = String(data[`${c.id}Eta`] ?? "").trim() || c.eta;
    const atticaOnly = c.id === "asap" && data.asapAtticaOnly !== false;
    const outside = atticaOnly && /^\d{5}$/.test(zip ?? "") && !isAtticaZip(zip);
    return { id: c.id, name: c.name, kind: c.kind, eta, baseFee, fee: baseFee, available: !outside, reason: outside ? "Μόνο για διευθύνσεις στην Αττική" : null };
  });
}

/**
 * Ο courier που ισχύει: ο επιλεγμένος αν είναι διαθέσιμος, αλλιώς ο φθηνότερος για παράδοση στο σπίτι (η θυρίδα
 * θέλει επιλογή από τον πελάτη, γι' αυτό δεν γίνεται προεπιλογή), αλλιώς ο φθηνότερος διαθέσιμος.
 */
export function pickCarrier(offers: CarrierOffer[], chosen: string | null | undefined): CarrierOffer | null {
  const ok = offers.filter((o) => o.available);
  const cheapest = (l: CarrierOffer[]) => [...l].sort((a, b) => a.fee - b.fee)[0];
  return ok.find((o) => o.id === chosen) ?? cheapest(ok.filter((o) => o.kind === "address")) ?? cheapest(ok) ?? null;
}

/**
 * Μεταφορική (εσωτερική διαδικασία, χωρίς voucher): για τις κατηγορίες «μεταφορική» της σελίδας Αποστολές (λευκές /
 * ογκώδεις συσκευές). Ρυθμίσεις → Αποστολές & courier: διακόπτης, κόστος, χρόνος. null = κλειστή.
 */
export interface FreightOffer { fee: number; baseFee: number; eta: string }
export const FREIGHT_DEFAULT = { fee: 2500, eta: "3–7 εργάσιμες, με τηλεφωνική συνεννόηση" };
export function freightOffer(data: Data): FreightOffer | null {
  if (data.freightOn !== true) return null;
  const baseFee = num(data.freightFee) != null ? cents(num(data.freightFee)!) : FREIGHT_DEFAULT.fee;
  return { baseFee, fee: baseFee, eta: String(data.freightEta ?? "").trim() || FREIGHT_DEFAULT.eta };
}
