import "server-only";
import type { Address, Customer } from "@prisma/client";
import { db } from "@/lib/db";
import { districtByName, districtByZip } from "@/lib/geo/regions";

/**
 * Αντιστοίχιση πελάτη e-shop → κωδικούς των πινάκων του SoftOne, από τα τοπικά αντίγραφά τους (TaxOffice = IRSDATA,
 * Country, Currency, District, PostalCode — όλα με `s1Id`). Το CUSTOMER δέχεται **κωδικούς**, όχι κείμενα:
 *  - IRSDATA: η Δ.Ο.Υ. σε πολλούς πελάτες είναι όνομα («ΑΓΡΙΝΙΟΥ», «Πάρου», «ΙΖ’ ΑΘΗΝΩΝ») → βρίσκουμε τον κωδικό
 *  - COUNTRY / SOCURRENCY: Ελλάδα = 1, EUR = 1 (όχι 1000/100) — και σε υπάρχουσα καρτέλα δεν αλλάζουν ποτέ
 *    (το SoftOne απαγορεύει αλλαγή νομίσματος σε συναλλασσόμενο με παραστατικά)
 *  - DISTRICT: κωδικός νομού (από τον ΤΚ ή το όνομα), όχι κείμενο
 * Ό,τι δεν βρίσκεται δεν στέλνεται (μένει ό,τι έχει η καρτέλα) και αναφέρεται στον έλεγχο πριν την αποστολή.
 */
export type Issue = { level: "error" | "warn"; field: string; text: string };

const fold = (s: string | null | undefined) => (s ?? "").toLocaleUpperCase("el-GR").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/Δ\.?\s*Ο\.?\s*Υ\.?/g, " ").replace(/[’'΄`.,\-–]/g, " ").replace(/\s+/g, " ").trim();
const ORD = /^(Α|Β|Γ|Δ|Ε|ΣΤ|Ζ|Η|Θ|Ι|ΙΑ|ΙΒ|ΙΓ|ΙΔ|ΙΕ|ΙΣΤ|ΙΖ|ΙΗ|ΙΘ|Κ|ΚΑ|ΚΒ|ΚΓ|ΚΔ|ΚΕ|ΚΣΤ|ΚΖ|ΚΗ|ΚΘ|Λ) /;

type Lookups = Awaited<ReturnType<typeof lookups>>;
async function lookups() {
  const [tax, el, eur, districts, zips] = await Promise.all([
    db.taxOffice.findMany({ where: { s1Id: { not: null } }, select: { s1Id: true, code: true, name: true, s1Name: true } }),
    db.country.findFirst({ where: { code: { in: ["EL", "GR"] } }, select: { s1Id: true, s1Data: true } }),
    db.currency.findFirst({ where: { code: "EUR" }, select: { s1Id: true } }),
    db.district.findMany({ where: { s1Id: { not: null } }, select: { s1Id: true, name: true, s1Name: true } }),
    db.postalCode.findMany({ where: { s1Missing: false }, select: { code: true, s1Data: true } }),
  ]);
  return { tax, el, eur, districts, zips: new Map(zips.map((z) => [z.code, (z.s1Data as { districtS1?: string; DISTRICT?: string } | null)?.districtS1 ?? (z.s1Data as { DISTRICT?: string } | null)?.DISTRICT ?? null])) };
}

/** Δ.Ο.Υ. (κωδικός ή όνομα με όποια ορθογραφία) → κωδικός IRSDATA. `ambiguous` όταν ταιριάζουν πολλές (π.χ. «ΠΑΤΡΩΝ» = Α/Β/Γ). */
export function resolveDoy(v: string | null | undefined, L: Pick<Lookups, "tax">): { id: string; name: string } | { ambiguous: string[] } | null {
  const raw = (v ?? "").trim();
  if (!raw) return null;
  const exact = L.tax.find((t) => t.s1Id === raw || t.code === raw);
  if (exact) return { id: exact.s1Id!, name: exact.name };
  const f = fold(raw);
  const byName = L.tax.filter((t) => fold(t.name) === f || fold(t.s1Name) === f);
  if (byName.length === 1) return { id: byName[0].s1Id!, name: byName[0].name };
  // χωρίς «Α΄/Β΄…»: μοναδική Δ.Ο.Υ. με αυτό το όνομα;
  const bare = f.replace(ORD, "");
  const noOrd = L.tax.filter((t) => fold(t.name).replace(ORD, "") === bare);
  if (noOrd.length === 1) return { id: noOrd[0].s1Id!, name: noOrd[0].name };
  if (noOrd.length > 1) return { ambiguous: noOrd.map((t) => t.name) };
  // συντομογραφίες: κάθε λέξη αρχή της αντίστοιχης («ΑΓ ΑΝΑΡΓΥΡΩΝ» → «ΑΓΙΩΝ ΑΝΑΡΓΥΡΩΝ»)
  const words = f.split(" ");
  const pre = L.tax.filter((t) => { const w = fold(t.name).split(" "); return w.length === words.length && w.every((x, i) => x.startsWith(words[i])); });
  if (pre.length === 1) return { id: pre[0].s1Id!, name: pre[0].name };
  return pre.length > 1 ? { ambiguous: pre.map((t) => t.name) } : null;
}

export async function erpCodes() {
  const L = await lookups();
  const country = L.el?.s1Id ?? "1";
  const currency = (L.el?.s1Data as { SOCURRENCY?: string } | null)?.SOCURRENCY ?? L.eur?.s1Id ?? "1";
  return { L, country, currency };
}

/** Τι θα σταλεί στο SoftOne για αυτόν τον πελάτη και τι λείπει/δεν αντιστοιχίζεται. Χωρίς καμία κλήση στο SoftOne. */
export function mapCustomer(c: Customer, addr: Address | null, codes: Awaited<ReturnType<typeof erpCodes>>, settings: { country: string; currency: string; vatSts: string; trdCategory: string; payment: string }) {
  const issues: Issue[] = [];
  const fields: Record<string, string> = {};
  // εμπορικά πεδία: μόνο σε νέα καρτέλα (σε υπάρχουσα τα κρατά το SoftOne)
  const commercial = { COUNTRY: settings.country || codes.country, SOCURRENCY: settings.currency || codes.currency, VATSTS: settings.vatSts || "1", ...(settings.trdCategory ? { TRDCATEGORY: settings.trdCategory } : {}), ...(settings.payment ? { PAYMENT: settings.payment } : {}) };
  if (c.doy) {
    const d = resolveDoy(c.doy, codes.L);
    if (d && "id" in d) fields.IRSDATA = d.id;
    else if (d && "ambiguous" in d) issues.push({ level: "warn", field: "Δ.Ο.Υ.", text: `«${c.doy}» ταιριάζει σε ${d.ambiguous.length} Δ.Ο.Υ. (${d.ambiguous.slice(0, 4).join(", ")}) — διάλεξε τη σωστή (ή Επικαιροποίηση από ΑΑΔΕ).` });
    else issues.push({ level: "warn", field: "Δ.Ο.Υ.", text: `«${c.doy}» δεν βρέθηκε στον πίνακα Δ.Ο.Υ. (IRSDATA) — δεν θα σταλεί.` });
  } else if (c.vatNumber) issues.push({ level: "warn", field: "Δ.Ο.Υ.", text: "Υπάρχει ΑΦΜ χωρίς Δ.Ο.Υ." });
  if (c.type === "business" && !c.vatNumber) issues.push({ level: "error", field: "ΑΦΜ", text: "Εταιρεία χωρίς ΑΦΜ — δεν μπορεί να τιμολογηθεί." });
  if (!c.email) issues.push({ level: "warn", field: "Email", text: "Χωρίς email — μένει ό,τι έχει η καρτέλα." });
  if (addr) {
    const zip = addr.zip.replace(/\D/g, "");
    // νομός: από τον ΤΚ (πίνακας ΤΚ του SoftOne ή τα 2 πρώτα ψηφία), αλλιώς από το όνομα νομού/πόλης
    const def = districtByZip(zip) ?? districtByName(addr.region) ?? districtByName(addr.city);
    const dist = (zip && codes.L.zips.get(zip)) || (def ? String(def.s1) : null) || codes.L.districts.find((d) => fold(d.name) === fold(addr.region) || fold(d.s1Name) === fold(addr.region))?.s1Id || null;
    if (dist) fields.DISTRICT = dist; else issues.push({ level: "warn", field: "Νομός", text: `Δεν βρέθηκε νομός${addr.region ? ` για «${addr.region}»` : ""}${zip ? ` / ΤΚ ${zip}` : ""} — μένει ό,τι έχει η καρτέλα.` });
    if (!zip) issues.push({ level: "warn", field: "ΤΚ", text: "Η διεύθυνση δεν έχει ΤΚ — μένει ό,τι έχει η καρτέλα." });
    else if (!codes.L.zips.has(zip)) issues.push({ level: "warn", field: "ΤΚ", text: `Ο ΤΚ ${zip} δεν υπάρχει στον πίνακα ΤΚ του SoftOne — στέλνεται ως κείμενο.` });
  } else issues.push({ level: "warn", field: "Διεύθυνση", text: "Χωρίς διεύθυνση." });
  return { fields, commercial, issues };
}
