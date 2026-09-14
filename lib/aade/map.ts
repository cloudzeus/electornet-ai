import "server-only";
import { db } from "@/lib/db";
import { foldGreek } from "@/lib/geo/regions";
import type { AadeCompany } from "./vat";

/**
 * ΑΑΔΕ ↔ SoftOne `IRSDATA` ↔ δικά μας μοντέλα.
 *
 * Η Δ.Ο.Υ. δένεται **με τον αριθμητικό κωδικό** όταν υπάρχει (απευθείας SOAP:
 * `doy` = «1101» = `IRSDATA.CODE`). Ο proxy `afm2info` δίνει **μόνο περιγραφή**,
 * οπότε εκεί πέφτουμε σε ταίριασμα ονόματος αφού πρώτα φύγουν τόνοι, κενά και
 * σημεία στίξης («Α΄ ΑΘΗΝΩΝ» ↔ «Α ΑΘΗΝΩΝ»).
 */
export const AADE_TO_SOFTONE: { aade: string; aadeLabel: string; softone: string; ours: string; note?: string }[] = [
  { aade: "afm", aadeLabel: "ΑΦΜ", softone: "CUSTOMER.AFM", ours: "Customer.vatNumber" },
  { aade: "doy (SOAP) / doy_descr (proxy)", aadeLabel: "Δ.Ο.Υ.", softone: "CUSTOMER.IRSDATA → IRSDATA.CODE / NAME", ours: "Customer.doy, TaxOffice", note: "Με κωδικό όταν υπάρχει· αλλιώς ταίριασμα ονόματος." },
  { aade: "onomasia", aadeLabel: "Επωνυμία", softone: "CUSTOMER.NAME", ours: "Customer.company", note: "Μπαίνει στο τιμολόγιο." },
  { aade: "commer_title", aadeLabel: "Διακριτικός τίτλος", softone: "CUSTOMER.NAME1", ours: "εμφάνιση" },
  { aade: "legal_status_descr", aadeLabel: "Νομική μορφή", softone: "CUSTOMER.TRDCATEGORY (χειροκίνητα)", ours: "—", note: "Δεν υπάρχει 1:1 πίνακας." },
  { aade: "postal_address + postal_address_no", aadeLabel: "Έδρα", softone: "CUSTOMER.ADDRESS (ενωμένα)", ours: "Address.street + number", note: "Το SoftOne έχει ένα πεδίο διεύθυνσης." },
  { aade: "postal_zip_code", aadeLabel: "Τ.Κ.", softone: "CUSTOMER.ZIP → ZIP.CODE", ours: "Address.zip, PostalCode", note: "Από εδώ βγαίνει νομός/περιφέρεια." },
  { aade: "postal_area_description", aadeLabel: "Περιοχή", softone: "CUSTOMER.CITY", ours: "Address.city" },
  { aade: "deactivation_flag + stop_date", aadeLabel: "Ενεργός", softone: "CUSTOMER.ISACTIVE", ours: "Customer.status", note: "«1» χωρίς ημ. διακοπής = ενεργός." },
  { aade: "regist_date", aadeLabel: "Έναρξη", softone: "—", ours: "ιστορικό ελέγχου" },
  { aade: "firm_act_tab[].firm_act_code", aadeLabel: "ΚΑΔ", softone: "CUSTOMER.JOBTYPETRD (κύριος)", ours: "Customer.profession", note: "Κύριος = firm_act_kind «1»." },
];

export interface AfmCheck {
  company: AadeCompany;
  taxOffice: { id: string; code: string; name: string; matchedBy: "code" | "name" } | null;
  suggestion: { company: string | null; vatNumber: string; doy: string | null; doyName: string | null; profession: string | null; street: string | null; number: string | null; zip: string | null; city: string | null };
  warnings: string[];
}

/** Σπάει «ΛΥΚΟΥΡΓΟΥ 18» σε οδό και αριθμό (το SoftOne/ΑΑΔΕ δίνουν ενωμένο). */
export function splitStreet(address: string | null): { street: string | null; number: string | null } {
  if (!address) return { street: null, number: null };
  const m = address.trim().match(/^(.*?)[\s,]+(\d+[Α-ΩA-Z]?(?:\s*[-–]\s*\d+[Α-ΩA-Z]?)?)$/u);
  return m ? { street: m[1].trim(), number: m[2].replace(/\s+/g, "") } : { street: address.trim(), number: null };
}

/** Δένει την απάντηση της ΑΑΔΕ με τον δικό μας πίνακα Δ.Ο.Υ. και ετοιμάζει τιμές για καταχώρηση. */
export async function reconcile(company: AadeCompany): Promise<AfmCheck> {
  const warnings: string[] = [];
  const code = company.doyCode?.replace(/\D/g, "") || null;
  let taxOffice: AfmCheck["taxOffice"] = null;
  if (code) {
    const hit = await db.taxOffice.findFirst({ where: { code }, select: { id: true, code: true, name: true } });
    if (hit) taxOffice = { ...hit, matchedBy: "code" };
  }
  if (!taxOffice && company.doyDescr) {
    const want = foldGreek(company.doyDescr);
    const all = await db.taxOffice.findMany({ select: { id: true, code: true, name: true, s1Name: true } });
    const hit = all.find((t) => foldGreek(t.name) === want || (t.s1Name && foldGreek(t.s1Name) === want));
    if (hit) taxOffice = { id: hit.id, code: hit.code, name: hit.name, matchedBy: "name" };
  }
  if (!taxOffice && (code || company.doyDescr)) warnings.push(`Η Δ.Ο.Υ. «${company.doyDescr ?? code}» δεν βρέθηκε στον πίνακα IRSDATA. Συγχρόνισε τις Δ.Ο.Υ. ή πρόσθεσέ τη χειροκίνητα.`);
  if (!company.isActive) warnings.push(`Ο ΑΦΜ είναι ανενεργός στο μητρώο${company.stopDate ? ` (διακοπή ${company.stopDate})` : ""}${company.aadeStatus ? `: ${company.aadeStatus}` : ""}.`);
  if (company.source === "proxy" && !code) warnings.push("Χωρίς ειδικούς κωδικούς ΑΑΔΕ δεν επιστρέφεται ο κωδικός Δ.Ο.Υ.· έγινε ταίριασμα με το όνομα.");
  const { street, number } = splitStreet(company.address);
  return {
    company,
    taxOffice,
    suggestion: {
      company: company.name,
      vatNumber: company.afm,
      doy: taxOffice?.code ?? code,
      doyName: taxOffice?.name ?? company.doyDescr,
      profession: company.profession,
      street, number,
      zip: company.zip,
      city: company.city,
    },
    warnings,
  };
}

/** Διεύθυνση έδρας όπως πάει στο SoftOne (ένα πεδίο ADDRESS). */
export const erpAddress = (c: AadeCompany) => c.address;
