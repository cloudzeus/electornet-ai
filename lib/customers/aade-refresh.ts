import "server-only";
import { db } from "@/lib/db";
import { lookupAfm, cleanAfm, isValidAfm } from "@/lib/aade/vat";
import { reconcile } from "@/lib/aade/map";
import { districtByZip } from "@/lib/geo/regions";

/**
 * Επικαιροποίηση πελάτη από το μητρώο ΑΑΔΕ (afm2info ή ειδικοί κωδικοί): σύγκριση πεδίο-πεδίο με ό,τι έχει το e-shop και
 * εφαρμογή των πεδίων που επιλέγει ο χρήστης. Η ΑΑΔΕ ξαναρωτιέται στην εφαρμογή — δεν εμπιστευόμαστε τιμές από τον browser.
 */
export type AadeField = "company" | "doy" | "profession" | "address";
export type AadeDiff = { key: AadeField; label: string; now: string | null; aade: string | null; same: boolean };
export type AadeCheckResult =
  | { ok: true; afm: string; name: string; active: boolean; legalForm: string | null; source: "proxy" | "soap"; diffs: AadeDiff[]; warnings: string[]; erpLinked: boolean }
  | { ok: false; error: string };

const norm = (v: string | null | undefined) => (v ?? "").toLocaleUpperCase("el-GR").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, "");

async function load(customerId: string) {
  const c = await db.customer.findUnique({ where: { id: customerId }, select: { id: true, vatNumber: true, company: true, doy: true, profession: true, erpTrdr: true, type: true, addresses: { orderBy: [{ isBilling: "desc" }, { isDefault: "desc" }, { createdAt: "asc" }], select: { id: true, street: true, number: true, zip: true, city: true, isBilling: true, isDefault: true } } } });
  if (!c) return { error: "Ο πελάτης δεν βρέθηκε." } as const;
  const afm = cleanAfm(c.vatNumber ?? "");
  if (!afm) return { error: "Ο πελάτης δεν έχει ΑΦΜ — συμπλήρωσέ τον πρώτα (Διόρθωση στοιχείων)." } as const;
  if (!isValidAfm(afm)) return { error: `Ο ΑΦΜ ${afm} δεν είναι έγκυρος (αποτυγχάνει ο έλεγχος ψηφίου).` } as const;
  const r = await lookupAfm(afm);
  if (!r.ok) return { error: `ΑΑΔΕ: ${r.message}` } as const;
  const check = await reconcile(r.company);
  const doyName = c.doy ? (await db.taxOffice.findFirst({ where: { OR: [{ code: c.doy }, { name: c.doy }, { s1Id: c.doy }] }, select: { name: true } }))?.name ?? c.doy : null;
  return { c, afm, check, doyName, billing: c.addresses.find((a) => a.isBilling) ?? (c.addresses.length === 1 ? c.addresses[0] : null) };
}

export async function aadeCheck(customerId: string): Promise<AadeCheckResult> {
  const x = await load(customerId);
  if ("error" in x) return { ok: false, error: x.error! };
  const { c, check, doyName, billing } = x, s = check.suggestion;
  const addrNow = billing ? `${billing.street}${billing.number ? ` ${billing.number}` : ""}, ${billing.zip} ${billing.city}` : null;
  const addrAade = s.street ? `${s.street}${s.number ? ` ${s.number}` : ""}, ${s.zip ?? ""} ${s.city ?? ""}`.trim() : null;
  const diffs: AadeDiff[] = [
    { key: "company", label: "Επωνυμία", now: c.company, aade: s.company, same: norm(c.company) === norm(s.company) },
    { key: "doy", label: "Δ.Ο.Υ.", now: doyName, aade: s.doyName, same: norm(doyName) === norm(s.doyName) || (!!c.doy && c.doy === s.doy) },
    { key: "profession", label: "Δραστηριότητα (ΚΑΔ)", now: c.profession, aade: s.profession, same: norm(c.profession) === norm(s.profession) },
    { key: "address", label: billing ? "Διεύθυνση έδρας / τιμολόγησης" : "Διεύθυνση έδρας (νέα)", now: addrNow, aade: addrAade, same: norm(addrNow) === norm(addrAade) },
  ].filter((d) => d.aade) as AadeDiff[];
  return { ok: true, afm: x.afm, name: check.company.name, active: check.company.isActive, legalForm: check.company.legalForm, source: check.company.source, diffs, warnings: check.warnings, erpLinked: !!c.erpTrdr };
}

/** Εφαρμογή των επιλεγμένων πεδίων στο e-shop. Επιστρέφει τι άλλαξε (για audit/χρονολόγιο). */
export async function aadeApply(customerId: string, keys: AadeField[]) {
  const x = await load(customerId);
  if ("error" in x) return { ok: false as const, error: x.error! };
  const { c, check, billing } = x, s = check.suggestion;
  const data: Record<string, unknown> = {};
  const changed: string[] = [];
  if (keys.includes("company") && s.company) { data.company = s.company; if (c.type !== "business" && check.company.legalForm && !/ΑΤΟΜΙΚΗ/i.test(check.company.legalForm)) data.type = "business"; changed.push("επωνυμία"); }
  if (keys.includes("doy") && s.doy) { data.doy = s.doy; changed.push("Δ.Ο.Υ."); }
  if (keys.includes("profession") && s.profession) { data.profession = s.profession.slice(0, 190); changed.push("δραστηριότητα"); }
  data.vatNumber = x.afm;
  if (c.erpTrdr) data.erpSyncStatus = "queued";
  await db.customer.update({ where: { id: c.id }, data });
  let addressId: string | null = null;
  if (keys.includes("address") && s.street && s.zip && s.city) {
    const region = districtByZip(s.zip)?.name ?? "";
    const a = { street: s.street, number: s.number, zip: s.zip, city: s.city, ...(region ? { region } : {}), lat: null, lng: null, geoSource: null };
    if (billing) { await db.address.update({ where: { id: billing.id }, data: { ...a, isBilling: true } }); addressId = billing.id; }
    else addressId = (await db.address.create({ data: { customerId: c.id, label: "Έδρα (ΑΑΔΕ)", kind: "billing", isBilling: true, isDefault: c.addresses.length === 0, region, street: s.street, number: s.number, zip: s.zip, city: s.city } })).id;
    changed.push("διεύθυνση έδρας");
  }
  return { ok: true as const, changed, addressId, erpLinked: !!c.erpTrdr };
}
