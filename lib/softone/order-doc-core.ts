/**
 * Παραγγελία e-shop → παραστατικό πώλησης SoftOne (SALDOC + MTRDOC + ITELINES). Καθαρή σύνθεση, χωρίς δίκτυο.
 *
 * Ακολουθεί ό,τι στέλνει σήμερα το eshop της Euronics (getData σε 480 παραγγελίες της σειράς 7005, 16/10/2026· ξανά
 * 23/11/2026: 258 παραγγελίες από 1/9, όλες σειρά 7005 / τύπος 7005 «ΠΑΡΑΓΓΕΛΙΑ e-Shop», πελάτης 200, SHIPMENT κενό):
 * - SERIES 7005 «ΠΑΡΑΓΓΕΛΙΑ e-Shop» (προεπιλογή, αλλάζει από τις ρυθμίσεις), NUM01 = ο αριθμός της παραγγελίας στο site
 * - TRDR 200 «ΠΕΛΑΤΗΣ ΛΙΑΝΙΚΗΣ» για αποδείξεις· η καρτέλα του πελάτη μόνο όταν ζητήθηκε τιμολόγιο
 * - Τρόπος πληρωμής (PAYMENT) και μεταφορέας (MTRDOC.SOCARRIER) με τους κωδικούς που έδωσε η Euronics (23/11/2026)·
 *   όπου δεν υπάρχει κωδικός μένουν κενά. Όλες οι οδηγίες πληρωμής και αποστολής γράφονται ΚΑΙ αναλυτικά στις
 *   παρατηρήσεις (REMARKS). Ο πίνακας «Τρόποι αποστολής» (SHIPMENT) του SoftOne έχει άλλη χρήση και δεν στέλνεται
 * - COMMENTS1 = ονοματεπώνυμο· στοιχεία αποστολής στο MTRDOC (SHIPPINGADDR / SHPZIP / SHPCITY / SHPDISTRICT, CCCSHP*)
 * - ITELINES.PRICE ΧΩΡΙΣ ΦΠΑ (το SoftOne προσθέτει τον ΦΠΑ του είδους)· το στρογγύλεμα κλείνει με DISC1VAL κεφαλίδας
 * Εκπτώσεις γραμμής (επίσης χωρίς ΦΠΑ): DISC1VAL προσφορά τιμής / δώρο, DISC2VAL κουπόνι, DISC3VAL τρόπος πληρωμής.
 */
import { floorLabel } from "@/lib/orders/model";

/** Η σειρά όπου πέφτουν οι παραγγελίες του σημερινού eshop. Ισχύει όταν η ρύθμιση είναι κενή. */
export const DEFAULT_SERIES = "7005";
/** Ο γενικός πελάτης λιανικής όπου γράφονται όλες οι αποδείξεις του σημερινού eshop (258 στις 258, 23/11/2026). */
export const DEFAULT_RETAIL_TRDR = "200";
/**
 * Τρόπος πληρωμής του site → κωδικός PAYMENT του SoftOne. 1005–1011 τους έστειλε η Euronics 23/11/2026 για το νέο site·
 * 1000 / 1001 / 1004 είναι όσοι χρησιμοποιούσε ήδη το παλιό. Όλοι ελέγχθηκαν την ίδια μέρα (selectorFields + calculate
 * σε σειρά 7005). Το GetTable ΔΕΝ δείχνει τους 1005–1011: μην το εμπιστευτείς για το αν υπάρχει ένας κωδικός.
 * Χωρίς κωδικό (TBI, Revolut, στο κατάστημα, κατόπιν συνεννόησης): το πεδίο μένει κενό και μιλούν οι παρατηρήσεις.
 * «bank» = 1005 «Viva Έμβασμα» με εντολή του χρήστη (23/11/2026), παρότι η κατάθεσή μας γίνεται απευθείας στους λογαριασμούς
 * της εταιρείας· υπάρχει και 1003 «Τραπεζικό Έμβασμα» αν το λογιστήριο ζητήσει αλλαγή.
 * Υπάρχουν και 1010 Microsoft Pay, 1011 Facebook Pay: το site δεν έχει τέτοιους τρόπους.
 */
export const S1_PAYMENT: Record<string, number> = { cod: 1000, card: 1001, "no-card": 1004, bank: 1005, iris: 1006, paypal: 1007, apple: 1008, google: 1009 };
/**
 * Υπηρεσία του site → είδος του SoftOne. Η επέκταση εγγύησης είναι το είδος 103682 «Επέκταση εγγύησης» (κωδικός ΕΓΓΥΗΣΗ,
 * ΦΠΑ 24 %, χωρίς τιμή καταλόγου: η τιμή μπαίνει στη γραμμή), όπως το έγραφε και το παλιό site. Οι υπόλοιπες υπηρεσίες
 * (εγκατάσταση κ.λπ.) δεν έχουν είδος ακόμη: η παραγγελία τους μένει «λείπει κωδικός είδους».
 */
export const S1_SERVICE_MTRL: Record<string, string> = { "epektasi-eggyisis": "103682" };
/** Courier του site → μεταφορέας (SOCARRIER) του SoftOne, όπως τους έστειλε η Euronics 23/11/2026. BOX NOW: δεν έχει κωδικό. */
export const S1_CARRIER: Record<string, number> = { elta: 2001, geniki: 2002, speedex: 2003, acs: 2004, asap: 2006 };
export const PAY_LABEL: Record<string, string> = { card: "Κάρτα", apple: "Apple Pay", google: "Google Pay", revolut: "Revolut Pay", paypal: "PayPal", klarna: "Klarna", tbi: "TBI Bank", iris: "IRIS", "no-card": "Δόσεις χωρίς κάρτα", bank: "Κατάθεση σε τράπεζα", cod: "Αντικαταβολή", store: "Στο κατάστημα" };
const FUL_LABEL: Record<string, string> = { courier: "Courier", freight: "Μεταφορική", "click-collect": "Παραλαβή από κατάστημα", appointment: "Παράδοση με ραντεβού" };
const PAY_STATE: Record<string, string> = { paid: "ΕΞΟΦΛΗΜΕΝΗ", pending: "σε αναμονή πληρωμής", processing: "η πληρωμή ελέγχεται από τον πάροχο", review: "η πληρωμή θέλει έλεγχο πριν την εκτέλεση", failed: "η πληρωμή απέτυχε", cancelled: "ακυρώθηκε" };

export interface SaldocSettings {
  series: string | null;
  retailTrdr: string | null;
}

/**
 * Μεταφορικά και χρέωση αντικαταβολής: η επιβάρυνση παραστατικού «2 Μεταφορικά» του SoftOne (πίνακας EXPN: ΦΠΑ 24 %,
 * λογαριασμός εσόδων 75.00.99.0024), όπως στα τιμολόγια πώλησης (σειρές 7291 / 7301). Δεν είναι είδος: πάει στο EXPANAL,
 * όχι στις γραμμές. Ελεγμένο με calculate 24/11/2026: ο ΦΠΑ βγαίνει στη βάση του 24 % μαζί με τις γραμμές, η έκπτωση
 * κεφαλίδας δεν την αγγίζει, και η παραγγελία EUR-20261124-5199 (49,00 + 3,90) έδωσε ακριβώς 52,90 €.
 */
export const S1_SHIPPING_EXPN = 2;

export interface SaldocLine {
  erpCode: string | null; title: string; qty: number;
  /** τιμή μονάδας καταλόγου με ΦΠΑ */
  listPrice: number;
  /** εκπτώσεις με ΦΠΑ, για όλη την ποσότητα */
  discPrice: number; discCoupon: number; discPayment: number;
  /** ΦΠΑ % του είδους (24, 13, 6) */
  vatRate: number;
  promo?: string | null; terms?: string | null;
  /** σετ ειδών: το σετ (SPCS) και τα μέλη του όπως ήταν στην παραγγελία — η γραμμή «ανοίγει» σε κύριο + μέλη */
  setSpcs?: number | null;
  setParts?: { mtrl: number; qty: number; name: string; main: boolean }[] | null;
}

/**
 * Γραμμή σετ → γραμμές όπως τις γράφει το SoftOne / το σημερινό eshop: το κύριο είδος με όλη την τιμή (και τις εκπτώσεις
 * της γραμμής), τα υπόλοιπα μέλη με τιμή 0· όλες με SPCS. Γραμμή χωρίς σετ μένει ως έχει.
 */
export function expandSetLines(lines: SaldocLine[]): (SaldocLine & { spcs?: number; partOfSet?: boolean })[] {
  return lines.flatMap((l) => {
    // γραμμή σετ χωρίς ορισμό (π.χ. δώρο προσφοράς ή σετ που χάθηκε από το SoftOne πριν την παραγγελία): κωδικός SET-<spcs>
    const spcs = l.setSpcs ?? (/^SET-(\d+)$/.exec(l.erpCode ?? "") ? Number(l.erpCode!.slice(4)) : null);
    if (!spcs) return [l];
    const parts = l.setParts ?? [];
    const main = parts.find((p) => p.main);
    if (!main) return [{ ...l, erpCode: null, spcs }];
    return [
      { ...l, erpCode: String(main.mtrl), qty: l.qty * (main.qty || 1), listPrice: l.listPrice / (main.qty || 1), spcs, partOfSet: true },
      ...parts.filter((p) => !p.main).map((p) => ({ erpCode: String(p.mtrl), title: p.name, qty: l.qty * (p.qty || 1), listPrice: 0, discPrice: 0, discCoupon: 0, discPayment: 0, vatRate: l.vatRate, spcs, partOfSet: true })),
    ];
  });
}
export interface SaldocOrder {
  number: string; fulfilment: string; payment: string; email: string | null;
  contact: { firstName?: string; lastName?: string; phone?: string };
  address: { street?: string; number?: string; floor?: string; zip?: string; city?: string; region?: string; notes?: string };
  carrierName?: string | null;
  /** ο courier που διάλεξε ο πελάτης (acs, geniki, elta, asap, boxnow) — για τον μεταφορέα του παραστατικού */
  carrier?: string | null;
  /** η πληρωμή όπως είναι τη στιγμή της σύνθεσης και οι ώρες που βολεύουν τον πελάτη — μόνο για τις παρατηρήσεις */
  pay?: { instalments?: number; status?: string; psp?: string | null; ref?: string | null } | null;
  slots?: string[] | null;
  locker?: { name?: string; address?: string; zip?: string } | null;
  store?: { name: string; address?: string | null; zip?: string | null; city?: string | null } | null;
  invoice?: { vatNumber?: string; doy?: string; company?: string; activity?: string } | null;
  /** η καρτέλα CUSTOMER του πελάτη τιμολογίου, αν υπάρχει ήδη στο SoftOne */
  invoiceTrdr?: string | null;
  lines: SaldocLine[];
  /** μεταφορικά + αντικαταβολή, με ΦΠΑ */
  shippingFee: number;
  /** το σύνολο της παραγγελίας με ΦΠΑ — ό,τι πλήρωσε ο πελάτης */
  total: number;
}

/** Καρτέλα πελάτη τιμολογίου προς δημιουργία στο SoftOne. `afm` = 9 ψηφία. */
export interface NewErpCustomer { afm: string; name: string; doy: string | null; activity: string | null; phone: string | null; email: string | null; order: string }

export interface SaldocDoc {
  OBJECT: "SALDOC";
  data: { SALDOC: Record<string, unknown>[]; MTRDOC: Record<string, unknown>[]; ITELINES: Record<string, unknown>[]; /** επιβαρύνσεις (μεταφορικά) — λείπει όταν δεν υπάρχουν */ EXPANAL?: Record<string, unknown>[] };
  /** τι λείπει για να σταλεί (κενό = έτοιμο) */
  needs: string[];
  /** τιμολόγιο σε ΑΦΜ χωρίς γνωστή καρτέλα: τα στοιχεία της καρτέλας πελάτη που ανοίγει η αποστολή στο SoftOne (TRDR κενό ως τότε) */
  newCustomer?: NewErpCustomer | null;
  /** δεν εμποδίζουν την αποστολή (π.χ. διαφορά 1 λεπτού από στρογγύλεμα ΦΠΑ) */
  warnings: string[];
  /** πώς βγαίνει το σύνολο στο SoftOne με αυτές τις τιμές (υπολογισμός εδώ· η τελική επιβεβαίωση με calculate) */
  totals: { expected: number; net: number; vat: number; gross: number; rounding: number };
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const cut = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);
const netOf = (gross: number, rate: number) => gross / (1 + rate / 100);
/** τιμή χωρίς ΦΠΑ προς τα πάνω και εκπτώσεις προς τα κάτω: το σύνολο του SoftOne βγαίνει ≥ του δικού μας και κλείνει με έκπτωση κεφαλίδας */
const ceil2 = (n: number) => Math.ceil(r2(n * 100) - 1e-9) / 100 || 0;
const floor2 = (n: number) => Math.floor(r2(n * 100) + 1e-9) / 100;

interface NetLine { rate: number; net: number }

/**
 * Σύνολα όπως τα βγάζει το SoftOne: καθαρή αξία ανά συντελεστή ΦΠΑ, ΦΠΑ στο σύνολο του συντελεστή. Η έκπτωση κεφαλίδας στον
 * μεγαλύτερο συντελεστή των γραμμών· οι επιβαρύνσεις (`charges`, π.χ. μεταφορικά) μπαίνουν στη βάση του ΦΠΑ τους χωρίς έκπτωση.
 */
export function softoneTotals(lines: NetLine[], headerDisc = 0, charges: NetLine[] = []) {
  const by = new Map<number, number>();
  for (const l of lines) by.set(l.rate, r2((by.get(l.rate) ?? 0) + l.net));
  const main = [...by.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (main != null && headerDisc) by.set(main, r2(by.get(main)! - headerDisc));
  for (const c of charges) by.set(c.rate, r2((by.get(c.rate) ?? 0) + c.net));
  let net = 0, vat = 0;
  for (const [rate, n] of by) { net = r2(net + n); vat = r2(vat + r2((n * rate) / 100)); }
  return { net, vat, gross: r2(net + vat) };
}

/**
 * Ο αριθμός της παραγγελίας ως αριθμός, για το πεδίο NUM01 του παραστατικού: «EUR-20261123-9970» → 202611239970.
 * Γιατί: το SoftOne ΔΕΝ κρατά το FINCODE που στέλνουμε (πραγματική δοκιμή 23/11/2026: το παραστατικό αποθηκεύτηκε με
 * FINCODE «PES», τον κωδικό της σειράς). Το παλιό site έγραφε τον αριθμό της παραγγελίας του στο NUM01 (8697) και εκεί
 * τον ψάχνει το προσωπικό. null όταν ο αριθμός δεν έχει ψηφία ή δεν χωρά ακέραια σε αριθμητικό πεδίο (πάνω από 15 ψηφία).
 */
/**
 * Ο αριθμός με τον οποίο βρίσκεται το παραστατικό ΜΕΣΑ στο SoftOne: κωδικός + αύξων αριθμός της σειράς («PES 83»). Το FINDOC
 * είναι εσωτερικό id και δεν φαίνεται στις οθόνες του ERP· το FINCODE της σειράς 7005 είναι σκέτο «PES» σε όλα τα παραστατικά.
 * Όπου το FINCODE έχει ήδη μέσα τον αύξοντα («ΑΠΛ0000083») μένει όπως είναι.
 */
export function erpDocNo(fincode: unknown, seriesnum: unknown): string | null {
  const c = String(fincode ?? "").trim(), n = String(seriesnum ?? "").trim().replace(/^0+/, "");
  if (!n) return c || null;
  return !c ? n : c.endsWith(n) ? c : `${c} ${n}`;
}

/** Μία απάντηση του SoftOne σε ένα βήμα της αποστολής (ErpSync.log). */
export interface ErpLogEntry { at: string; step: string; ok: boolean; text: string }

export function orderNum01(number: string): number | null {
  const d = number.replace(/\D/g, "");
  return d.length >= 1 && d.length <= 15 && Number(d) > 0 ? Number(d) : null;
}

/**
 * Φίλτρο GetTable για το παραστατικό μιας παραγγελίας: σειρά + NUM01 (βλ. orderNum01), SOSOURCE 1351 = πωλήσεις. Μόνο
 * αριθμοί μπαίνουν στο φίλτρο (είναι κείμενο SQL χωρίς παραμέτρους)· χωρίς αριθμό επιστρέφει null — τότε δεν ψάχνουμε.
 */
export function orderDocFilter(number: string, series: string | null | undefined): string | null {
  const n = orderNum01(number), s = (series ?? "").trim() || DEFAULT_SERIES;
  return n && /^\d+$/.test(s) ? `SOSOURCE=1351 AND SERIES=${s} AND NUM01=${n}` : null;
}

export function composeSaldoc(o: SaldocOrder, s: SaldocSettings): SaldocDoc {
  const needs: string[] = [], warnings: string[] = [];
  const series = s.series?.trim() || DEFAULT_SERIES;

  // πελάτης: απόδειξη → πελάτης λιανικής· τιμολόγιο → η καρτέλα του πελάτη (ΑΦΜ). ΑΦΜ χωρίς καρτέλα ΔΕΝ εμποδίζει την
  // αποστολή: η αποστολή ψάχνει τον ΑΦΜ στο SoftOne και, αν δεν υπάρχει, ανοίγει την καρτέλα (`newCustomer`) πριν το παραστατικό
  let trdr: string | null, newCustomer: NewErpCustomer | null = null;
  if (o.invoice?.vatNumber) {
    trdr = o.invoiceTrdr ?? null;
    const vat = o.invoice.vatNumber.replace(/\D/g, ""), company = cut(o.invoice.company ?? "", 128);
    if (trdr) { /* υπάρχει καρτέλα */ }
    else if (/^\d{9}$/.test(vat) && company) {
      newCustomer = { afm: vat, name: company, doy: o.invoice.doy?.trim() || null, activity: o.invoice.activity?.trim() || null, phone: o.contact.phone?.trim() || null, email: o.email, order: o.number };
      warnings.push(`Ο ΑΦΜ ${vat} δεν έχει ακόμη καρτέλα πελάτη: με την αποστολή ψάχνεται στο SoftOne και, αν δεν υπάρχει, η καρτέλα ανοίγει αυτόματα πριν από το παραστατικό.`);
    } else needs.push(`Επωνυμία και ελληνικός ΑΦΜ 9 ψηφίων για το τιμολόγιο (ΑΦΜ ${o.invoice.vatNumber}): χωρίς αυτά δεν ανοίγει αυτόματα καρτέλα πελάτη στο SoftOne`);
  } else {
    trdr = s.retailTrdr?.trim() || DEFAULT_RETAIL_TRDR;
  }

  // γραμμές: τιμή και εκπτώσεις χωρίς ΦΠΑ
  const nets: NetLine[] = [];
  // LINENUM σε κάθε γραμμή (νέες γραμμές: από 9000001). Χωρίς αρίθμηση, όταν ένα είδος είναι κύριο είδος σετ στο SoftOne και
  // δεν είναι η πρώτη γραμμή, το ERP «ανοίγει» μόνο του το σετ και μπερδεύει τις γραμμές: χάνεται η προηγούμενη, μηδενίζονται
  // οι τιμές, σύνολο 0 € (calculate 24/11/2026, EUR-20261116-7979: τηλεόραση + ψυγείο 141700 του σετ 677). Με αρίθμηση το
  // σετ ανοίγει σωστά (το SoftOne προσθέτει το μέλος του με τιμή 0) και το σύνολο βγαίνει ακριβώς.
  const itelines: Record<string, unknown>[] = expandSetLines(o.lines).map((l, i) => {
    if (!l.erpCode || !/^\d+$/.test(l.erpCode)) needs.push(l.spcs ? `Τα μέλη του σετ για «${l.title}» (η παραγγελία δεν κράτησε στιγμιότυπο)` : `Κωδικός είδους SoftOne για «${l.title}»`);
    const price = ceil2(netOf(l.listPrice, l.vatRate));
    // δώρο / δωρεάν: η έκπτωση καλύπτει ακριβώς την αξία (μηδενική γραμμή)· μέλος σετ με τιμή 0: απλώς 0
    const free = l.listPrice > 0 && l.discPrice + l.discCoupon + l.discPayment >= l.listPrice * l.qty - 0.005;
    const d1 = free ? r2(price * l.qty) : floor2(netOf(l.discPrice, l.vatRate)), d2 = free ? 0 : floor2(netOf(l.discCoupon, l.vatRate)), d3 = free ? 0 : floor2(netOf(l.discPayment, l.vatRate));
    nets.push({ rate: l.vatRate, net: r2(r2(price * l.qty) - d1 - d2 - d3) });
    return {
      LINENUM: 9000001 + i, MTRL: l.erpCode && /^\d+$/.test(l.erpCode) ? Number(l.erpCode) : null, QTY1: l.qty, PRICE: price,
      ...(d1 ? { DISC1VAL: d1 } : {}), ...(d2 ? { DISC2VAL: d2 } : {}), ...(d3 ? { DISC3VAL: d3 } : {}),
      ...(l.spcs ? { SPCS: l.spcs } : {}),
      ...(l.promo ? { COMMENTS: cut(l.promo, 255) } : {}), ...(l.terms ? { COMMENTS1: cut(l.terms, 2000) } : {}),
    };
  });
  const expanal: Record<string, unknown>[] = [], charges: NetLine[] = [];
  if (o.shippingFee > 0) {
    const price = ceil2(netOf(o.shippingFee, 24));
    charges.push({ rate: 24, net: price });
    expanal.push({ EXPN: S1_SHIPPING_EXPN, EXPVAL: price });
  }

  // στρογγύλεμα: η μικρότερη έκπτωση κεφαλίδας (χωρίς ΦΠΑ) που δίνει ακριβώς το σύνολο της παραγγελίας. Με δύο δεκαδικά
  // κάποια σύνολα δεν «πετυχαίνονται» ακριβώς (ο ΦΠΑ στρογγυλεύει) — τότε το πλησιέστερο, και το σύνολο δίνεται ρητά.
  const expected = r2(o.total);
  let rounding = 0, forceTotal = false, t = softoneTotals(nets, 0, charges);
  if (t.gross !== expected) {
    const guess = Math.max(0, Math.round(((t.gross - expected) / 1.24) * 100));
    let best = { c: 0, t, d: Math.abs(t.gross - expected) };
    for (let c = Math.max(1, guess - 6); c <= guess + 8; c++) {
      const tt = softoneTotals(nets, c / 100, charges), dd = Math.abs(r2(tt.gross - expected));
      if (dd < best.d - 1e-9) best = { c, t: tt, d: dd };
      if (dd === 0) break;
    }
    rounding = best.c / 100; t = best.t;
    // 1 λεπτό που δεν κλείνει με καμία τιμή: το SoftOne βγάζει ΦΠΑ = στρογγυλεμένο 24 % πάνω σε καθαρή αξία δύο δεκαδικών,
    // οπότε περίπου ένα στα πέντε ποσά (89,00 · 56,60 · 399,00…) δεν προκύπτει από κανένα καθαρό ποσό. Όταν του δώσουμε το
    // σύνολο στην κεφαλίδα (SUMAMNT), κρατά την καθαρή αξία και βάζει ΦΠΑ = σύνολο − καθαρή (calculate 23/11/2026· έτσι
    // είναι και τα παραστατικά του παλιού site, π.χ. 104,04 + 24,96 = 129,00). Μόνο για 1 λεπτό: μεγαλύτερη διαφορά είναι
    // λάθος τιμής ή συντελεστή και πρέπει να φαίνεται, όχι να τη σκεπάσει ο ΦΠΑ.
    if (t.gross !== expected) {
      if (Math.abs(t.gross - expected) <= 0.011) { t = { net: t.net, vat: r2(expected - t.net), gross: expected }; forceTotal = true; }
      else needs.push(`Το σύνολο στο SoftOne βγαίνει ${t.gross.toFixed(2)} € αντί ${expected.toFixed(2)} € (στρογγύλεμα ΦΠΑ)`);
    }
  }

  const name = cut([o.contact.firstName, o.contact.lastName].filter(Boolean).join(" "), 255);
  // ΑΦΜ τιμολογίου: μόνο ψηφία (το SoftOne κρατά σκέτο ΑΦΜ) — στην απόδειξη δεν στέλνεται καθόλου
  const afm = (o.invoice?.vatNumber ?? "").replace(/\D/g, "").slice(0, 30);
  const phone = cut(o.contact.phone ?? "", 30);
  const a = o.address;
  const street = cut([a.street, a.number].filter(Boolean).join(" ") + (floorLabel(a.floor) ? `, ${floorLabel(a.floor)}` : ""), 255);
  let ship: { addr: string; zip: string; city: string; district: string; line: string };
  if (o.fulfilment === "click-collect" && o.store) {
    ship = { addr: cut(o.store.address ?? o.store.name, 255), zip: o.store.zip ?? "", city: o.store.city ?? "", district: "", line: cut(`Παραλαβή από κατάστημα ${o.store.name}${o.store.address ? `, ${o.store.address}` : ""}${o.store.city ? `, ${o.store.city}` : ""}`, 255) };
  } else if (o.locker) {
    ship = { addr: cut(`BOX NOW ${o.locker.name ?? ""}${o.locker.address ? `, ${o.locker.address}` : ""}`, 255), zip: o.locker.zip ?? "", city: a.city ?? "", district: a.region ?? "", line: cut(`Θυρίδα BOX NOW: ${[o.locker.name, o.locker.address, o.locker.zip].filter(Boolean).join(", ")}`, 255) };
  } else {
    ship = { addr: street, zip: a.zip ?? "", city: a.city ?? "", district: a.region ?? "", line: cut([street, [a.zip, a.city].filter(Boolean).join(" ")].filter(Boolean).join(", "), 255) };
  }
  const how = [FUL_LABEL[o.fulfilment] ?? o.fulfilment, o.fulfilment === "courier" ? o.carrierName : null, o.fulfilment === "click-collect" ? o.store?.name : null].filter(Boolean).join(" ");
  // Παρατηρήσεις: ΟΛΕΣ οι οδηγίες πληρωμής και αποστολής — τα πεδία PAYMENT / SOCARRIER δεν έχουν κωδικό για κάθε τρόπο. Οι σημειώσεις του
  // πελάτη τελευταίες, ώστε ένα μακρύ κείμενο να μην κόψει τις οδηγίες.
  const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
  const cod = o.payment === "cod", atStore = o.payment === "store", inst = o.pay?.instalments ?? 1;
  const remarks = [
    "ΠΛΗΡΩΜΗ",
    `Τρόπος: ${PAY_LABEL[o.payment] ?? (o.payment || "δεν δηλώθηκε")}${inst > 1 ? ` σε ${inst} δόσεις` : ""}`,
    cod ? `ΕΙΣΠΡΑΞΗ από τον πελάτη στην παράδοση: ${eur(expected)}`
      : atStore ? `ΕΙΣΠΡΑΞΗ στο κατάστημα κατά την παραλαβή: ${eur(expected)}`
      : o.pay?.status ? `Κατάσταση: ${PAY_STATE[o.pay.status] ?? o.pay.status}${o.pay.status !== "paid" && o.payment === "bank" ? ` — αναμένεται κατάθεση ${eur(expected)}, αποστολή μετά την επιβεβαίωση` : ""}` : null,
    o.pay?.ref ? `Συναλλαγή: ${[o.pay.psp, o.pay.ref].filter(Boolean).join(" ")}` : null,
    `Σύνολο παραγγελίας με ΦΠΑ: ${eur(expected)}`,
    "",
    "ΑΠΟΣΤΟΛΗ",
    `Τρόπος: ${[FUL_LABEL[o.fulfilment] ?? o.fulfilment, o.fulfilment === "click-collect" ? o.store?.name : o.carrierName].filter(Boolean).join(" — ")}`,
    `${o.fulfilment === "click-collect" ? "Παραλαμβάνει" : "Παραλήπτης"}: ${[name, phone ? `τηλ. ${phone}` : null].filter(Boolean).join(", ") || "—"}`,
    `${o.fulfilment === "click-collect" ? "Σημείο" : "Παράδοση"}: ${[ship.line, o.fulfilment !== "click-collect" && !o.locker ? ship.district : null].filter(Boolean).join(", ") || "—"}`,
    o.slots?.length ? `Ώρες που βολεύουν τον πελάτη για τηλέφωνο: ${o.slots.join(", ")}` : null,
    o.fulfilment === "click-collect" ? null : (o.shippingFee > 0 ? `Μεταφορικά${cod ? " και χρέωση αντικαταβολής" : ""}: ${eur(o.shippingFee)} (επιβάρυνση «Μεταφορικά» στο παραστατικό)` : "Μεταφορικά: δωρεάν"),
    "",
    "ΠΕΛΑΤΗΣ",
    o.email ? `Email: ${o.email}` : null,
    o.invoice?.vatNumber ? `Τιμολόγιο: ${[o.invoice.company, `ΑΦΜ ${o.invoice.vatNumber}`, o.invoice.doy ? `ΔΟΥ ${o.invoice.doy}` : null].filter(Boolean).join(" · ")}` : "Παραστατικό: απόδειξη λιανικής",
    a.notes ? `Σημειώσεις πελάτη: ${a.notes}` : null,
  ].filter((l) => l != null).join("\n");

  return {
    OBJECT: "SALDOC",
    data: {
      SALDOC: [{
        // το FINCODE το ξαναγράφει το SoftOne με τον κωδικό της σειράς· ο αριθμός μας μένει στο NUM01 και στο COMMENTS
        SERIES: Number(series), TRDR: trdr ? Number(trdr) : null, FINCODE: o.number, ...(orderNum01(o.number) ? { NUM01: orderNum01(o.number) } : {}),
        // χωρίς κωδικό: ρητά κενό. Αν το πεδίο λείπει, το SoftOne βάζει μόνο του την προεπιλογή του πελάτη 200 («Μετρητά-
        // Πιστωτική κάρτα-Προκαταβολή»), που θα ήταν λάθος οδηγία (calculate 23/11/2026)
        PAYMENT: S1_PAYMENT[o.payment] ?? null,
        COMMENTS: cut(`e-shop ${o.number} · ${how} · ${PAY_LABEL[o.payment] ?? o.payment}`, 255),
        COMMENTS1: name || null,
        REMARKS: remarks.slice(0, 2000),
        ...(rounding ? { DISC1VAL: rounding } : {}),
        ...(forceTotal ? { SUMAMNT: expected } : {}),
      }],
      MTRDOC: [{
        SHIPPINGADDR: ship.addr || null, SHPZIP: ship.zip || null, SHPCITY: ship.city || null, SHPDISTRICT: ship.district || null,
        // μεταφορέας μόνο όταν φεύγει με courier που έχει κωδικό· παραλαβή, ραντεβού, μεταφορική, θυρίδα: κενό
        ...(o.fulfilment === "courier" && o.carrier && S1_CARRIER[o.carrier] ? { SOCARRIER: S1_CARRIER[o.carrier] } : {}),
        // Επωνυμία / ΑΦΜ / ΔΟΥ είναι η ταυτότητα του παραστατικού: σε τιμολόγιο η εταιρεία, σε απόδειξη ο αγοραστής
        // (το ονοματεπώνυμο μένει πάντα στο COMMENTS1). Μήκη όπως τα δηλώνει το SoftOne: NAME 128, AFM 30, ΔΟΥ 64, ADDRESS 128.
        CCCSHPNAME: cut(o.invoice?.company || name, 128) || null, CCCSHPPHONE: phone || null, CCCSHPADDRESS: cut(ship.line, 128) || null,
        ...(afm ? { CCCSHPAFM: afm } : {}),
        ...(o.invoice?.doy ? { CCCSHPIRSDATA: cut(o.invoice.doy, 64) } : {}),
      }],
      ITELINES: itelines,
      ...(expanal.length ? { EXPANAL: expanal } : {}),
    },
    needs: [...new Set(needs)],
    ...(newCustomer ? { newCustomer } : {}),
    warnings,
    totals: { expected, net: t.net, vat: t.vat, gross: t.gross, rounding },
  };
}
