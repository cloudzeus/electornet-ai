/**
 * Οι couriers του checkout. Ο διαχειριστής ενεργοποιεί όποιους θέλει (Ρυθμίσεις → Αποστολές & courier), με δικό τους
 * κόστος, «δωρεάν από» και χρόνο παράδοσης· ο πελάτης διαλέγει έναν στο checkout. Καθαρές συναρτήσεις — ίδιες σε
 * server (υπολογισμός, παραγγελία) και browser. Ποσά σε λεπτά.
 */
import NO_PRICE_AREAS from "./no-price-areas.json";

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
 * Τα νησιά του Σαρωνικού έχουν Τ.Κ. Αττικής αλλά για τις αποστολές δεν είναι Αττική (καράβι, δικός τους τιμοκατάλογος):
 * Αίγινα/Αγκίστρι 18010, Πόρος 18020, Ύδρα 18040, Σπέτσες 18050. Η Σαλαμίνα (18900) μένει Αττική.
 */
/**
 * Περιοχές χωρίς συμφωνημένη τιμή αποστολής (lib/shipping/no-price-areas.json): μέχρι να μπει τιμή δεν παραδίδουμε εκεί —
 * ο πελάτης το βλέπει στο ταμείο και του μένει η παραλαβή από κατάστημα. Βγάζεις μια περιοχή από το JSON μόλις τιμολογηθεί.
 */
export const noPriceArea = (zip: string | null | undefined): string | null =>
  NO_PRICE_AREAS.find((a) => a.zips.includes((zip ?? "").trim()))?.name ?? null;
export const NO_DELIVERY_REASON = "Δεν παραδίδουμε ακόμη σε αυτή την περιοχή — μπορείς να παραλάβεις από κατάστημα";

export const NON_ATTICA_ZIPS = ["18010", "18020", "18040", "18050"];
/** Αττική: ΤΚ 10xxx–19xxx (Αθήνα, Πειραιάς, Ανατολική/Δυτική Αττική) — χωρίς τα νησιά του Σαρωνικού. */
export const isAtticaZip = (zip: string | null | undefined) => /^1\d{4}$/.test(zip ?? "") && !NON_ATTICA_ZIPS.includes(zip!.trim());

export interface CarrierOffer {
  id: CarrierId; name: string; kind: CarrierKind; eta: string;
  /** τι πληρώνει ο πελάτης για αυτό το καλάθι */
  fee: number; baseFee: number; freeFrom: number | null;
  available: boolean; reason: string | null;
}

type Data = Record<string, unknown>;
const num = (v: unknown): number | null => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const cents = (n: number) => Math.round(n * 100);

/**
 * Οι ενεργοί couriers, με τη σειρά του μητρώου. `general` = το γενικό «δωρεάν από» (λεπτά), όταν ο courier δεν έχει δικό του.
 * ASAP: μόνο Αττική (εκτός αν το κλείσει ο διαχειριστής) — με άγνωστο ΤΚ μένει διαθέσιμος.
 * BOX NOW: μόνο με Partner ID — χωρίς αυτό ο χάρτης θυρίδων δεν ανοίγει.
 */
export function carrierOffers(data: Data, goods: number, zip: string | null, general: number | null): CarrierOffer[] {
  return CARRIERS.filter((c) => data[`${c.id}On`] === true && (c.id !== "boxnow" || String(data.boxnowPartnerId ?? "").trim() !== "")).map((c) => {
    const baseFee = num(data[`${c.id}Fee`]) != null ? cents(num(data[`${c.id}Fee`])!) : c.fee;
    const own = num(data[`${c.id}FreeFrom`]);
    const freeFrom = own != null ? cents(own) : general;
    const eta = String(data[`${c.id}Eta`] ?? "").trim() || c.eta;
    const atticaOnly = c.id === "asap" && data.asapAtticaOnly !== false;
    const outside = atticaOnly && /^\d{5}$/.test(zip ?? "") && !isAtticaZip(zip);
    return { id: c.id, name: c.name, kind: c.kind, eta, baseFee, freeFrom, fee: freeFrom != null && goods >= freeFrom ? 0 : baseFee, available: !outside, reason: outside ? "Μόνο για διευθύνσεις στην Αττική" : null };
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
 * ογκώδεις συσκευές). Ρυθμίσεις → Αποστολές & courier: διακόπτης, κόστος, «δωρεάν από», χρόνος. null = κλειστή.
 */
export interface FreightOffer { fee: number; baseFee: number; freeFrom: number | null; eta: string }
export const FREIGHT_DEFAULT = { fee: 2500, eta: "3–7 εργάσιμες, με τηλεφωνική συνεννόηση" };
export function freightOffer(data: Data, goods: number): FreightOffer | null {
  if (data.freightOn !== true) return null;
  const baseFee = num(data.freightFee) != null ? cents(num(data.freightFee)!) : FREIGHT_DEFAULT.fee;
  const own = num(data.freightFreeFrom);
  const freeFrom = own != null ? cents(own) : null;
  return { baseFee, freeFrom, fee: freeFrom != null && goods >= freeFrom ? 0 : baseFee, eta: String(data.freightEta ?? "").trim() || FREIGHT_DEFAULT.eta };
}
