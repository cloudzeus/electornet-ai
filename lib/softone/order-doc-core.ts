/**
 * Παραγγελία e-shop → παραστατικό πώλησης SoftOne (SALDOC + MTRDOC + ITELINES). Καθαρή σύνθεση, χωρίς δίκτυο.
 *
 * Ακολουθεί ό,τι στέλνει σήμερα το eshop της Euronics (getData σε 480 παραγγελίες της σειράς 7005, 16/10/2026):
 * - SERIES 7005 «ΠΑΡΑΓΓΕΛΙΑ e-Shop», FINCODE = ο αριθμός της παραγγελίας στο site
 * - TRDR 200 «ΠΕΛΑΤΗΣ ΛΙΑΝΙΚΗΣ» για αποδείξεις· η καρτέλα του πελάτη μόνο όταν ζητήθηκε τιμολόγιο
 * - PAYMENT με τους κωδικούς του SoftOne (1001 Κάρτα, 1004 EurobankLoans, 1000 Αντικαταβολή, 1003 Έμβασμα, 1002 Paypal)
 * - COMMENTS1 = ονοματεπώνυμο· στοιχεία αποστολής στο MTRDOC (SHIPPINGADDR / SHPZIP / SHPCITY / SHPDISTRICT, CCCSHP*)
 * - ITELINES.PRICE ΧΩΡΙΣ ΦΠΑ (το SoftOne προσθέτει τον ΦΠΑ του είδους)· το στρογγύλεμα κλείνει με DISC1VAL κεφαλίδας
 * Εκπτώσεις γραμμής (επίσης χωρίς ΦΠΑ): DISC1VAL προσφορά τιμής / δώρο, DISC2VAL κουπόνι, DISC3VAL τρόπος πληρωμής.
 */

export type PayKey = "card" | "apple" | "google" | "revolut" | "paypal" | "klarna" | "tbi" | "iris" | "no-card" | "bank" | "cod" | "store";
/** Οι κωδικοί PAYMENT που βρέθηκαν στο SoftOne της Euronics. Όσα λείπουν συμπληρώνονται στις Ρυθμίσεις → SoftOne. */
export const DEFAULT_PAYMENT: Partial<Record<PayKey, string>> = { card: "1001", apple: "1001", google: "1001", "no-card": "1004", cod: "1000", bank: "1003", paypal: "1002" };
export const PAY_LABEL: Record<string, string> = { card: "Κάρτα", apple: "Apple Pay", google: "Google Pay", revolut: "Revolut Pay", paypal: "PayPal", klarna: "Klarna", tbi: "TBI Bank", iris: "IRIS", "no-card": "Δόσεις χωρίς κάρτα", bank: "Κατάθεση σε τράπεζα", cod: "Αντικαταβολή", store: "Στο κατάστημα" };
const FUL_LABEL: Record<string, string> = { courier: "Courier", "click-collect": "Παραλαβή από κατάστημα", appointment: "Παράδοση με ραντεβού" };

export interface SaldocSettings {
  series: string | null;
  retailTrdr: string | null;
  /** τρόπος πληρωμής του site → κωδικός PAYMENT του SoftOne (υπερισχύει του DEFAULT_PAYMENT) */
  payment: Partial<Record<string, string>>;
  /** είδος (MTRL) για τα μεταφορικά / έξοδα αντικαταβολής */
  shippingMtrl: string | null;
}

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
  locker?: { name?: string; address?: string; zip?: string } | null;
  store?: { name: string; address?: string | null; zip?: string | null; city?: string | null } | null;
  invoice?: { vatNumber?: string; doy?: string; company?: string } | null;
  /** η καρτέλα CUSTOMER του πελάτη τιμολογίου, αν υπάρχει ήδη στο SoftOne */
  invoiceTrdr?: string | null;
  lines: SaldocLine[];
  /** μεταφορικά + αντικαταβολή, με ΦΠΑ */
  shippingFee: number;
  /** το σύνολο της παραγγελίας με ΦΠΑ — ό,τι πλήρωσε ο πελάτης */
  total: number;
}

export interface SaldocDoc {
  OBJECT: "SALDOC";
  data: { SALDOC: Record<string, unknown>[]; MTRDOC: Record<string, unknown>[]; ITELINES: Record<string, unknown>[] };
  /** τι λείπει για να σταλεί (κενό = έτοιμο) */
  needs: string[];
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

/** Σύνολα όπως τα βγάζει το SoftOne: καθαρή αξία ανά συντελεστή ΦΠΑ, ΦΠΑ στο σύνολο του συντελεστή. Η έκπτωση κεφαλίδας στον μεγαλύτερο. */
export function softoneTotals(lines: NetLine[], headerDisc = 0) {
  const by = new Map<number, number>();
  for (const l of lines) by.set(l.rate, r2((by.get(l.rate) ?? 0) + l.net));
  const main = [...by.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (main != null && headerDisc) by.set(main, r2(by.get(main)! - headerDisc));
  let net = 0, vat = 0;
  for (const [rate, n] of by) { net = r2(net + n); vat = r2(vat + r2((n * rate) / 100)); }
  return { net, vat, gross: r2(net + vat) };
}

export function composeSaldoc(o: SaldocOrder, s: SaldocSettings): SaldocDoc {
  const needs: string[] = [];
  const series = s.series?.trim() || null;
  if (!series) needs.push("Σειρά παραστατικού (Ρυθμίσεις → SoftOne → Σειρά παραστατικού παραγγελίας· σήμερα 7005)");

  // πελάτης: απόδειξη → πελάτης λιανικής· τιμολόγιο → η καρτέλα του πελάτη (ΑΦΜ)
  let trdr: string | null;
  if (o.invoice?.vatNumber) {
    trdr = o.invoiceTrdr ?? null;
    if (!trdr) needs.push(`Καρτέλα πελάτη τιμολογίου στο SoftOne για ΑΦΜ ${o.invoice.vatNumber} (δημιουργείται πριν την αποστολή)`);
  } else {
    trdr = s.retailTrdr?.trim() || null;
    if (!trdr) needs.push("Πελάτης λιανικής (TRDR — σήμερα 200 «ΠΕΛΑΤΗΣ ΛΙΑΝΙΚΗΣ»)");
  }

  const payment = s.payment[o.payment]?.trim() || DEFAULT_PAYMENT[o.payment as PayKey] || null;
  if (!payment) needs.push(`Κωδικός τρόπου πληρωμής στο SoftOne για «${PAY_LABEL[o.payment] ?? o.payment}» (Ρυθμίσεις → SoftOne)`);

  // γραμμές: τιμή και εκπτώσεις χωρίς ΦΠΑ
  const nets: NetLine[] = [];
  const itelines: Record<string, unknown>[] = expandSetLines(o.lines).map((l) => {
    if (!l.erpCode || !/^\d+$/.test(l.erpCode)) needs.push(l.spcs ? `Τα μέλη του σετ για «${l.title}» (η παραγγελία δεν κράτησε στιγμιότυπο)` : `Κωδικός είδους SoftOne για «${l.title}»`);
    const price = ceil2(netOf(l.listPrice, l.vatRate));
    // δώρο / δωρεάν: η έκπτωση καλύπτει ακριβώς την αξία (μηδενική γραμμή)· μέλος σετ με τιμή 0: απλώς 0
    const free = l.listPrice > 0 && l.discPrice + l.discCoupon + l.discPayment >= l.listPrice * l.qty - 0.005;
    const d1 = free ? r2(price * l.qty) : floor2(netOf(l.discPrice, l.vatRate)), d2 = free ? 0 : floor2(netOf(l.discCoupon, l.vatRate)), d3 = free ? 0 : floor2(netOf(l.discPayment, l.vatRate));
    nets.push({ rate: l.vatRate, net: r2(r2(price * l.qty) - d1 - d2 - d3) });
    return {
      MTRL: l.erpCode && /^\d+$/.test(l.erpCode) ? Number(l.erpCode) : null, QTY1: l.qty, PRICE: price,
      ...(d1 ? { DISC1VAL: d1 } : {}), ...(d2 ? { DISC2VAL: d2 } : {}), ...(d3 ? { DISC3VAL: d3 } : {}),
      ...(l.spcs ? { SPCS: l.spcs } : {}),
      ...(l.promo ? { COMMENTS: cut(l.promo, 255) } : {}), ...(l.terms ? { COMMENTS1: cut(l.terms, 2000) } : {}),
    };
  });
  if (o.shippingFee > 0) {
    if (!s.shippingMtrl?.trim()) needs.push("Είδος SoftOne για τα μεταφορικά (Ρυθμίσεις → SoftOne → Είδος μεταφορικών)");
    const price = ceil2(netOf(o.shippingFee, 24));
    nets.push({ rate: 24, net: price });
    itelines.push({ MTRL: s.shippingMtrl?.trim() ? Number(s.shippingMtrl) : null, QTY1: 1, PRICE: price, COMMENTS: cut(`Μεταφορικά${o.carrierName ? ` ${o.carrierName}` : ""}${o.payment === "cod" ? " · αντικαταβολή" : ""}`, 255) });
  }

  // στρογγύλεμα: η μικρότερη έκπτωση κεφαλίδας (χωρίς ΦΠΑ) που δίνει ακριβώς το σύνολο της παραγγελίας. Με δύο δεκαδικά
  // κάποια σύνολα δεν «πετυχαίνονται» ακριβώς (ο ΦΠΑ στρογγυλεύει) — τότε το πλησιέστερο και προειδοποίηση.
  const expected = r2(o.total);
  const warnings: string[] = [];
  let rounding = 0, t = softoneTotals(nets);
  if (t.gross !== expected) {
    const guess = Math.max(0, Math.round(((t.gross - expected) / 1.24) * 100));
    let best = { c: 0, t, d: Math.abs(t.gross - expected) };
    for (let c = Math.max(1, guess - 6); c <= guess + 8; c++) {
      const tt = softoneTotals(nets, c / 100), dd = Math.abs(r2(tt.gross - expected));
      if (dd < best.d - 1e-9) best = { c, t: tt, d: dd };
      if (dd === 0) break;
    }
    rounding = best.c / 100; t = best.t;
    if (t.gross !== expected) (Math.abs(t.gross - expected) <= 0.011 ? warnings : needs).push(`Το σύνολο στο SoftOne βγαίνει ${t.gross.toFixed(2)} € αντί ${expected.toFixed(2)} € (στρογγύλεμα ΦΠΑ)`);
  }

  const name = cut([o.contact.firstName, o.contact.lastName].filter(Boolean).join(" "), 255);
  const phone = cut(o.contact.phone ?? "", 30);
  const a = o.address;
  const street = cut([a.street, a.number].filter(Boolean).join(" ") + (a.floor ? `, ${a.floor}ος όροφος` : ""), 255);
  let ship: { addr: string; zip: string; city: string; district: string; line: string };
  if (o.fulfilment === "click-collect" && o.store) {
    ship = { addr: cut(o.store.address ?? o.store.name, 255), zip: o.store.zip ?? "", city: o.store.city ?? "", district: "", line: cut(`Παραλαβή από κατάστημα ${o.store.name}${o.store.address ? `, ${o.store.address}` : ""}${o.store.city ? `, ${o.store.city}` : ""}`, 255) };
  } else if (o.locker) {
    ship = { addr: cut(`BOX NOW ${o.locker.name ?? ""}${o.locker.address ? `, ${o.locker.address}` : ""}`, 255), zip: o.locker.zip ?? "", city: a.city ?? "", district: a.region ?? "", line: cut(`Θυρίδα BOX NOW: ${[o.locker.name, o.locker.address, o.locker.zip].filter(Boolean).join(", ")}`, 255) };
  } else {
    ship = { addr: street, zip: a.zip ?? "", city: a.city ?? "", district: a.region ?? "", line: cut([street, [a.zip, a.city].filter(Boolean).join(" ")].filter(Boolean).join(", "), 255) };
  }
  const how = [FUL_LABEL[o.fulfilment] ?? o.fulfilment, o.fulfilment === "courier" ? o.carrierName : null, o.fulfilment === "click-collect" ? o.store?.name : null].filter(Boolean).join(" ");
  const remarks = [o.email ? `Email: ${o.email}` : null, phone ? `Τηλέφωνο: ${phone}` : null, o.invoice?.vatNumber ? `Τιμολόγιο: ${[o.invoice.company, `ΑΦΜ ${o.invoice.vatNumber}`, o.invoice.doy ? `ΔΟΥ ${o.invoice.doy}` : null].filter(Boolean).join(" · ")}` : null, a.notes ? `Σημειώσεις πελάτη: ${a.notes}` : null].filter(Boolean).join("\n");

  return {
    OBJECT: "SALDOC",
    data: {
      SALDOC: [{
        SERIES: series ? Number(series) : null, TRDR: trdr ? Number(trdr) : null, FINCODE: o.number,
        PAYMENT: payment ? Number(payment) : null,
        COMMENTS: cut(`e-shop ${o.number} · ${how} · ${PAY_LABEL[o.payment] ?? o.payment}`, 255),
        COMMENTS1: name || null,
        ...(remarks ? { REMARKS: remarks.slice(0, 2000) } : {}),
        ...(rounding ? { DISC1VAL: rounding } : {}),
      }],
      MTRDOC: [{
        SHIPPINGADDR: ship.addr || null, SHPZIP: ship.zip || null, SHPCITY: ship.city || null, SHPDISTRICT: ship.district || null,
        CCCSHPNAME: name || null, CCCSHPPHONE: phone || null, CCCSHPADDRESS: ship.line || null,
        ...(o.invoice?.doy ? { CCCSHPIRSDATA: cut(o.invoice.doy, 100) } : {}),
      }],
      ITELINES: itelines,
    },
    needs: [...new Set(needs)],
    warnings,
    totals: { expected, net: t.net, vat: t.vat, gross: t.gross, rounding },
  };
}
