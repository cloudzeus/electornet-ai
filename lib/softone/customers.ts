import "server-only";
import type { Address, Customer } from "@prisma/client";
import { db } from "@/lib/db";
import { s1, getS1Config } from "@/lib/softone";
import { getSetting } from "@/lib/settings/store";

/**
 * SoftOne CUSTOMER (table TRDR) ⇄ shop Customer.
 * Official services only (getData / setData / getBrowserInfo+getBrowserData).
 * Rules: read-before-write on update (echo every field we don't own), never
 * overwrite ERP fiscal identity from the shop once linked, log every sync as
 * a CustomerEvent and keep erpSyncStatus / erpLastError on the customer.
 *
 * Field map (shop → ERP): see docs/customers.md.
 */
export interface ErpCustomerRow { TRDR: string; CODE: string; NAME: string; AFM?: string; IRSDATA?: string; ADDRESS?: string; ZIP?: string; CITY?: string; DISTRICT?: string; PHONE01?: string; PHONE02?: string; EMAIL?: string; ISACTIVE?: string; REMARKS?: string; INSDATE?: string; UPDDATE?: string }

async function defaults() {
  const { data } = await getSetting("softone");
  return {
    prefix: String(data.customerCodePrefix || "WEB"),
    country: String(data.customerCountry || "1000"),
    currency: String(data.customerCurrency || "100"),
    vatSts: String(data.customerVatSts || "1"),
    trdCategory: String(data.customerTrdCategory || ""),
    payment: String(data.customerPayment || ""),
    autoPush: data.customersAutoPush === true,
  };
}

export const erpCodeFor = (prefix: string, number: number) => `${prefix}${String(number).padStart(6, "0")}`;
export const displayName = (c: Pick<Customer, "type" | "company" | "firstName" | "lastName">) => (c.type === "business" && c.company ? c.company : `${c.lastName} ${c.firstName}`.trim());

/** Shop customer + default address → CUSTOMER master row (fields we own). */
export function toErpCustomer(c: Customer, addr: Address | null, d: Awaited<ReturnType<typeof defaults>>) {
  const row: Record<string, string> = {
    CODE: c.erpCode || erpCodeFor(d.prefix, c.number),
    NAME: displayName(c).slice(0, 128),
    ISACTIVE: c.status === "active" ? "1" : "0",
    ISPROSP: "0",
    COUNTRY: d.country,
    SOCURRENCY: d.currency,
    VATSTS: d.vatSts,
    EMAIL: c.email.slice(0, 128),
  };
  if (c.vatNumber) row.AFM = c.vatNumber;
  if (c.doy) row.IRSDATA = c.doy;
  if (c.phone) row.PHONE01 = c.phone.slice(0, 20);
  if (c.mobile) row.PHONE02 = c.mobile.slice(0, 20);
  if (c.profession) row.JOBTYPETRD = c.profession.slice(0, 128);
  if (addr) {
    row.ADDRESS = `${addr.street}${addr.number ? ` ${addr.number}` : ""}`.slice(0, 100);
    row.ZIP = addr.zip;
    row.CITY = addr.city.slice(0, 30);
    row.DISTRICT = addr.region.slice(0, 30);
  }
  if (d.trdCategory) row.TRDCATEGORY = d.trdCategory;
  if (d.payment) row.PAYMENT = d.payment;
  row.REMARKS = `e-shop πελάτης #${c.number}${c.type === "business" ? " (εταιρεία)" : ""}`;
  return row;
}

/** Extra addresses → CUSBRANCH lines (LINENUM kept for existing, ≥ 9000001 for new). */
export function toErpBranches(addrs: Address[]) {
  let next = 9000001;
  return addrs.map((a) => ({
    LINENUM: a.erpBranch ?? next++,
    CODE: (a.label || a.city).slice(0, 25),
    NAME: (a.recipient || a.label || a.city).slice(0, 64),
    ISACTIVE: "1",
    VATSTS: "1",
    ADDRESS: `${a.street}${a.number ? ` ${a.number}` : ""}`.slice(0, 100),
    ZIP: a.zip,
    CITY: a.city.slice(0, 30),
    DISTRICT: a.region.slice(0, 30),
    ...(a.phone ? { PHONE01: a.phone.slice(0, 20) } : {}),
    ...(a.notes ? { REMARKS: a.notes.slice(0, 2000) } : {}),
  }));
}

async function event(customerId: string, kind: string, meta: unknown, staffId?: string | null) {
  await db.customerEvent.create({ data: { customerId, kind, meta: meta as object, staffId: staffId ?? null } }).catch(() => null);
}

/** Create or update the ERP customer. Returns TRDR + CODE. */
export async function pushCustomerToErp(customerId: string, staffId?: string | null) {
  if (!(await getS1Config())) return { ok: false as const, error: "Το SoftOne δεν έχει ρυθμιστεί." };
  const c = await db.customer.findUniqueOrThrow({ where: { id: customerId }, include: { addresses: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] } } });
  const d = await defaults();
  const main = c.addresses.find((a) => a.isDefault) ?? c.addresses[0] ?? null;
  const extras = c.addresses.filter((a) => a.id !== main?.id);
  try {
    let existing: Record<string, string> = {};
    if (c.erpTrdr) {
      const cur = await s1("getData", { object: "CUSTOMER", key: c.erpTrdr, locateinfo: "CUSTOMER:CODE,NAME,AFM,IRSDATA,ADDRESS,ZIP,CITY,DISTRICT,PHONE01,PHONE02,EMAIL,ISACTIVE,REMARKS,COUNTRY,SOCURRENCY,VATSTS,TRDCATEGORY,PAYMENT" });
      if (!cur.success) throw new Error(cur.error ?? "getData failed");
      existing = (cur.data?.CUSTOMER?.[0] ?? {}) as Record<string, string>;
    }
    const row = { ...existing, ...toErpCustomer(c, main, d) };
    // ERP owns fiscal identity once linked: never blank AFM/IRSDATA from the shop
    if (c.erpTrdr && existing.AFM && !c.vatNumber) row.AFM = existing.AFM;
    if (c.erpTrdr && existing.IRSDATA && !c.doy) row.IRSDATA = existing.IRSDATA;
    const data: Record<string, unknown> = { CUSTOMER: [row] };
    if (extras.length) data.CUSBRANCH = toErpBranches(extras);
    const res = await s1("setData", { OBJECT: "CUSTOMER", KEY: c.erpTrdr ?? "", data });
    if (!res.success) throw new Error(res.error ?? `setData errorcode ${res.errorcode}`);
    const trdr = String(res.id ?? c.erpTrdr ?? "");
    // read back to confirm (success:true ≠ persisted)
    const back = await s1("getData", { object: "CUSTOMER", key: trdr, locateinfo: "CUSTOMER:CODE,NAME,AFM,EMAIL;CUSBRANCH:LINENUM,CODE" });
    const saved = (back.data?.CUSTOMER?.[0] ?? {}) as Record<string, string>;
    const branches = (back.data?.CUSBRANCH ?? []) as { LINENUM: string; CODE: string }[];
    for (const a of extras) { const b = branches.find((x) => x.CODE === (a.label || a.city).slice(0, 25)); if (b) await db.address.update({ where: { id: a.id }, data: { erpBranch: Number(b.LINENUM) } }); }
    await db.customer.update({ where: { id: c.id }, data: { erpTrdr: trdr, erpCode: saved.CODE ?? row.CODE, erpSyncStatus: "sent", erpSyncedAt: new Date(), erpLastError: null } });
    await event(c.id, "erp-push", { trdr, code: saved.CODE ?? row.CODE, name: saved.NAME }, staffId);
    return { ok: true as const, trdr, code: saved.CODE ?? row.CODE };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Αποτυχία";
    await db.customer.update({ where: { id: c.id }, data: { erpSyncStatus: "failed", erpLastError: error } });
    await event(c.id, "erp-push", { error }, staffId);
    return { ok: false as const, error };
  }
}

/** Refresh identity / contact fields from the ERP record (ERP wins). */
export async function pullCustomerFromErp(customerId: string, staffId?: string | null) {
  const c = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
  if (!c.erpTrdr) return { ok: false as const, error: "Ο πελάτης δεν είναι συνδεδεμένος με το SoftOne." };
  try {
    const r = await s1("getData", { object: "CUSTOMER", key: c.erpTrdr, locateinfo: "CUSTOMER:CODE,NAME,AFM,IRSDATA,ADDRESS,ZIP,CITY,DISTRICT,PHONE01,PHONE02,EMAIL,ISACTIVE,JOBTYPETRD" });
    if (!r.success) throw new Error(r.error ?? "getData failed");
    const row = (r.data?.CUSTOMER?.[0] ?? {}) as Record<string, string>;
    await db.customer.update({ where: { id: c.id }, data: { erpCode: row.CODE, vatNumber: row.AFM || c.vatNumber, doy: row.IRSDATA || c.doy, phone: row.PHONE01 || c.phone, mobile: row.PHONE02 || c.mobile, profession: row.JOBTYPETRD || c.profession, ...(c.type === "business" ? { company: row.NAME || c.company } : {}), erpSyncStatus: "linked", erpSyncedAt: new Date(), erpLastError: null } });
    await event(c.id, "erp-pull", { code: row.CODE, name: row.NAME }, staffId);
    return { ok: true as const, row };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Αποτυχία";
    await db.customer.update({ where: { id: c.id }, data: { erpSyncStatus: "failed", erpLastError: error } });
    return { ok: false as const, error };
  }
}

/** Search ERP customers by ΑΦΜ, email or name (browser CUSTOMER, filters use `=` and `*` prefix wildcard). */
export async function searchErpCustomers(q: { afm?: string; email?: string; name?: string }): Promise<ErpCustomerRow[]> {
  const filters = [q.afm && `CUSTOMER.AFM=${q.afm}`, q.email && `CUSTOMER.EMAIL=${q.email}`, q.name && `CUSTOMER.NAME=${q.name}*`].filter(Boolean).join("&");
  if (!filters) return [];
  const info = await s1("getBrowserInfo", { object: "CUSTOMER", list: "", filters });
  if (!info.success || !info.reqID) return [];
  const data = await s1("getBrowserData", { reqID: info.reqID, start: 0, limit: 20 });
  if (!data.success) return [];
  const fields = (info.fields as { name: string }[] | undefined)?.map((f) => f.name.replace(/^CUSTOMER\./, "")) ?? [];
  return ((data.rows ?? []) as string[][]).map((r) => Object.fromEntries(r.map((v, i) => [fields[i] ?? String(i), v]))) as unknown as ErpCustomerRow[];
}

/** Link an existing ERP customer to a shop customer (by TRDR) and pull its identity. */
export async function linkCustomerToErp(customerId: string, trdr: string, staffId?: string | null) {
  const clash = await db.customer.findFirst({ where: { erpTrdr: trdr, NOT: { id: customerId } } });
  if (clash) return { ok: false as const, error: `Ο TRDR ${trdr} είναι ήδη συνδεδεμένος με τον πελάτη ${clash.email}.` };
  await db.customer.update({ where: { id: customerId }, data: { erpTrdr: trdr, erpSyncStatus: "linked" } });
  await event(customerId, "erp-link", { trdr }, staffId);
  return pullCustomerFromErp(customerId, staffId);
}

export async function shouldAutoPush() {
  return (await defaults()).autoPush && !!(await getS1Config());
}
