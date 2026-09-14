import "server-only";
import { db } from "@/lib/db";
import type { AadeCompany } from "./vat";

/**
 * ΑΑΔΕ (RgWsPublic2) ↔ SoftOne IRSDATA / CUSTOMER ↔ δικά μας μοντέλα.
 *
 * Κλειδί σύνδεσης για τη ΔΟΥ: ο **αριθμητικός κωδικός**. Η ΑΑΔΕ επιστρέφει
 * `doy` (π.χ. «1101») και το SoftOne κρατά τον ίδιο κωδικό στο
 * `IRSDATA.CODE` (και `IRSDATA.IRSDATA`). Δεν κάνουμε ποτέ ταίριασμα με το
 * όνομα: οι περιγραφές διαφέρουν σε τονισμό και συντομογραφίες
 * («Α ΑΘΗΝΩΝ» ↔ «Α΄ ΑΘΗΝΩΝ»).
 */
export const AADE_TO_SOFTONE: { aade: string; aadeLabel: string; softone: string; ours: string; note?: string }[] = [
  { aade: "afm", aadeLabel: "ΑΦΜ", softone: "CUSTOMER.AFM", ours: "Customer.vatNumber" },
  { aade: "doy", aadeLabel: "Κωδικός ΔΟΥ", softone: "CUSTOMER.IRSDATA → IRSDATA.CODE", ours: "Customer.doy / TaxOffice.code", note: "Το κλειδί σύνδεσης. Η τιμή που γράφουμε στο SoftOne είναι ο κωδικός, όχι η περιγραφή." },
  { aade: "doyDescr", aadeLabel: "Περιγραφή ΔΟΥ", softone: "IRSDATA.NAME", ours: "TaxOffice.name", note: "Μόνο για εμφάνιση· διαφέρει σε τόνους/συντομογραφίες από το SoftOne." },
  { aade: "onomasia", aadeLabel: "Επωνυμία", softone: "CUSTOMER.NAME", ours: "Customer.company", note: "Νομική επωνυμία — αυτή μπαίνει στο τιμολόγιο." },
  { aade: "commerTitle", aadeLabel: "Διακριτικός τίτλος", softone: "CUSTOMER.NAME1", ours: "Customer.notes / εμφάνιση", note: "Προαιρετικό· συχνά κενό." },
  { aade: "legalStatusDescr", aadeLabel: "Νομική μορφή", softone: "CUSTOMER.TRDCATEGORY (χειροκίνητα)", ours: "Customer.profession", note: "Δεν υπάρχει 1:1 πίνακας· κρατιέται ως κείμενο." },
  { aade: "postalAddress", aadeLabel: "Οδός έδρας", softone: "CUSTOMER.ADDRESS", ours: "Address.street" },
  { aade: "postalAddressNo", aadeLabel: "Αριθμός", softone: "CUSTOMER.ADDRESS (ενωμένο)", ours: "Address.number", note: "Το SoftOne έχει ένα πεδίο διεύθυνσης: ενώνουμε «οδός αριθμός»." },
  { aade: "postalZipCode", aadeLabel: "Τ.Κ.", softone: "CUSTOMER.ZIP → ZIP.CODE", ours: "Address.zip / PostalCode.code" },
  { aade: "postalAreaDescription", aadeLabel: "Περιοχή", softone: "CUSTOMER.CITY", ours: "Address.city" },
  { aade: "deactivationFlag", aadeLabel: "Ενεργός (1) / ανενεργός (0)", softone: "CUSTOMER.ISACTIVE", ours: "Customer.status", note: "Ανενεργός ΑΦΜ ⇒ μπλοκάρουμε τιμολόγηση." },
  { aade: "registDate / stopDate", aadeLabel: "Έναρξη / διακοπή", softone: "—", ours: "Customer.meta (ιστορικό ελέγχου)" },
  { aade: "firmActTab[].firmActCode", aadeLabel: "ΚΑΔ", softone: "CUSTOMER.JOBTYPETRD (κύριος)", ours: "Customer.profession", note: "Ο κύριος ΚΑΔ (firmActKind = 1) γίνεται «επάγγελμα»." },
];

export interface AfmCheck {
  company: AadeCompany;
  /** Η ΔΟΥ όπως υπάρχει στα δικά μας (συγχρονισμένη από IRSDATA) */
  taxOffice: { id: string; code: string; name: string; s1Id: string | null } | null;
  /** Τι θα γραφόταν στον πελάτη / στο SoftOne */
  suggestion: { company: string | null; vatNumber: string; doy: string | null; doyName: string | null; profession: string | null; street: string | null; number: string | null; zip: string | null; city: string | null };
  warnings: string[];
}

/** Δένει την απάντηση της ΑΑΔΕ με τον δικό μας πίνακα ΔΟΥ και ετοιμάζει τις τιμές για καταχώρηση. */
export async function reconcile(company: AadeCompany): Promise<AfmCheck> {
  const warnings: string[] = [];
  const code = company.doy?.replace(/\D/g, "") || null;
  const taxOffice = code ? await db.taxOffice.findFirst({ where: { code }, select: { id: true, code: true, name: true, s1Id: true } }) : null;
  if (code && !taxOffice) warnings.push(`Η ΔΟΥ ${code}${company.doyDescr ? ` (${company.doyDescr})` : ""} δεν υπάρχει στον πίνακα IRSDATA του SoftOne. Συγχρόνισε τις Δ.Ο.Υ. ή πρόσθεσέ τη χειροκίνητα.`);
  if (!company.active) warnings.push(`Ο ΑΦΜ είναι ανενεργός στο μητρώο${company.stopDate ? ` (διακοπή ${company.stopDate})` : ""}${company.deactivationFlagDescr ? `: ${company.deactivationFlagDescr}` : ""}.`);
  const mainAct = company.firmActs.find((a) => a.kind === "1") ?? company.firmActs[0] ?? null;
  return {
    company,
    taxOffice,
    suggestion: {
      company: company.onomasia,
      vatNumber: company.afm,
      doy: taxOffice?.code ?? code,
      doyName: taxOffice?.name ?? company.doyDescr,
      profession: mainAct ? `${mainAct.descr}${mainAct.code ? ` (${mainAct.code})` : ""}` : null,
      street: company.postalAddress,
      number: company.postalAddressNo,
      zip: company.postalZipCode,
      city: company.postalAreaDescription,
    },
    warnings,
  };
}

/** Διεύθυνση έδρας όπως θα πάει στο SoftOne (ένα πεδίο ADDRESS). */
export const erpAddress = (c: AadeCompany) => [c.postalAddress, c.postalAddressNo].filter(Boolean).join(" ") || null;
