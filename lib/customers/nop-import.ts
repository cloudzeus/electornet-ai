import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { phoneKey, mergeHistoryCustomer, refreshCustomerTotals, geocodePending } from "@/lib/softone/purchases";

/**
 * Εισαγωγή πελατών από το σημερινό eshop (nopCommerce) και διασταύρωση με όσους ήδη έχουμε (νέο eshop, ιστορικό SoftOne).
 *
 * Αρχεία (όπως τα βγάζει το admin του nopCommerce — οι στήλες αναγνωρίζονται με το όνομά τους, όποια κι αν είναι η έκδοση):
 * - Customers → Export to Excel (.xlsx) ή Export to XML (.xml)
 * - Promotions → Newsletter subscribers → Export (.csv / .txt)
 *
 * Διασταύρωση (πρώτο που ταιριάζει): λογαριασμός nop → email → κινητό → ΑΦΜ → ονοματεπώνυμο + Τ.Κ. Όταν το email δείχνει
 * σε έναν πελάτη και το κινητό σε άλλον «από το ιστορικό», ο δεύτερος ενώνεται στον πρώτο· αλλιώς σημαδεύεται για έλεγχο.
 * Συμπληρώνονται μόνο κενά — τίποτα που υπάρχει δεν σβήνεται. Κωδικοί δεν μεταφέρονται (ο πελάτης ορίζει νέο με email),
 * κανένα email δεν στέλνεται. Newsletter: μόνο οι ενεργοί συνδρομητές του nop, με καταγραφή της προέλευσης.
 */
export interface NopAddress { firstName?: string; lastName?: string; company?: string; street: string; street2?: string; zip?: string; city?: string; phone?: string }
export interface NopCustomer { row: number; nopId: number | null; email: string | null; firstName: string; lastName: string; company: string | null; phone: string | null; vat: string | null; gender: string | null; active: boolean; guest: boolean; staff: boolean; createdAt: string | null; addresses: NopAddress[]; newsletter: boolean | null }
export interface NopSubscriber { row: number; email: string; active: boolean; createdAt: string | null }
export interface NopJob { id: string; kind: "customers" | "newsletter"; file: string; createdAt: string; customers: NopCustomer[]; subscribers: NopSubscriber[]; columns: string[]; warnings: string[] }

const DIR = path.join(tmpdir(), "eu-nop-import");
const key = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ς/g, "σ").replace(/[^a-z0-9α-ω]/g, "");
const ALIASES: Record<string, string[]> = {
  nopId: ["id", "customerid"], guid: ["customerguid", "guid"], email: ["email", "emailaddress", "ηλεκτρονικοταχυδρομειο"], username: ["username"],
  firstName: ["firstname", "ονομα"], lastName: ["lastname", "επωνυμο"], company: ["company", "εταιρεια"], gender: ["gender", "φυλο"],
  street: ["streetaddress", "address1", "address", "διευθυνση"], street2: ["streetaddress2", "address2"], zip: ["zippostalcode", "zip", "postalcode", "τκ", "ταχυδρομικοσκωδικασ"],
  city: ["city", "πολη"], phone: ["phone", "phonenumber", "τηλεφωνο"], vat: ["vatnumber", "vat", "αφμ"], active: ["active", "ενεργοσ", "ενεργο"],
  guest: ["isguest"], registered: ["isregistered"], admin: ["isadministrator"], vendor: ["isvendor", "vendorid"], createdAt: ["createdonutc", "createdon", "registrationdate"],
};
const pick = (rec: Record<string, string>, f: string) => { for (const a of ALIASES[f] ?? []) if (rec[a] != null && rec[a] !== "") return rec[a].trim(); return ""; };
const truthy = (v: string) => /^(true|1|yes|ναι|αληθεσ)$/i.test(v.trim());
const lowerEmail = (v: string) => { const t = v.trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(t) ? t : null; };

function toCustomer(rec: Record<string, string>, row: number, addresses: NopAddress[] = []): NopCustomer {
  const nopId = Number(pick(rec, "nopId")) || null;
  const street = pick(rec, "street");
  const own = street ? [{ street, street2: pick(rec, "street2") || undefined, zip: pick(rec, "zip") || undefined, city: pick(rec, "city") || undefined, phone: pick(rec, "phone") || undefined }] : [];
  const news = Object.entries(rec).filter(([k]) => k.startsWith("newsletter"));
  return {
    row, nopId, email: lowerEmail(pick(rec, "email")), firstName: pick(rec, "firstName"), lastName: pick(rec, "lastName"), company: pick(rec, "company") || null,
    phone: pick(rec, "phone") || addresses.find((a) => a.phone)?.phone || null, vat: (pick(rec, "vat").replace(/\D/g, "") || null), gender: pick(rec, "gender") || null,
    active: pick(rec, "active") === "" ? true : truthy(pick(rec, "active")), guest: truthy(pick(rec, "guest")) || (pick(rec, "registered") !== "" && !truthy(pick(rec, "registered"))),
    staff: truthy(pick(rec, "admin")) || (Number(pick(rec, "vendor")) > 0 || truthy(pick(rec, "vendor"))), createdAt: pick(rec, "createdAt") || null,
    addresses: [...own, ...addresses], newsletter: news.length ? news.some(([, v]) => truthy(v)) : null,
  };
}

// ---------- Ανάγνωση ----------

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let cur: string[] = [], field = "", q = false;
  const sep = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') q = false; else field += ch; continue; }
    if (ch === '"') q = true; else if (ch === sep) { cur.push(field); field = ""; } else if (ch === "\n") { cur.push(field.replace(/\r$/, "")); rows.push(cur); cur = []; field = ""; } else field += ch;
  }
  if (field || cur.length) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const xmlText = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim();
function xmlFields(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/<([A-Za-z][\w.-]*)>([^<]*)<\/\1>/g)) out[key(m[1])] = xmlText(m[2]);
  return out;
}

export async function parseNopFile(buf: Buffer, filename: string): Promise<Omit<NopJob, "id" | "createdAt">> {
  const warnings: string[] = [];
  const name = filename.toLowerCase();
  if (name.endsWith(".xml")) {
    const text = buf.toString("utf8");
    const blocks = [...text.matchAll(/<Customer>([\s\S]*?)<\/Customer>/g)].map((m) => m[1]);
    if (!blocks.length) throw new Error("Το XML δεν έχει στοιχεία <Customer> — είναι εξαγωγή πελατών του nopCommerce;");
    const customers = blocks.map((b, i) => {
      const addresses = [...b.matchAll(/<Address>([\s\S]*?)<\/Address>/g)].map((m) => { const r = xmlFields(m[1]); return { firstName: pick(r, "firstName") || undefined, lastName: pick(r, "lastName") || undefined, company: pick(r, "company") || undefined, street: pick(r, "street") || r.address1 || "", street2: pick(r, "street2") || undefined, zip: pick(r, "zip") || undefined, city: pick(r, "city") || undefined, phone: pick(r, "phone") || undefined }; }).filter((a) => a.street);
      return toCustomer(xmlFields(b.replace(/<Addresses>[\s\S]*?<\/Addresses>/g, "")), i + 1, addresses);
    });
    return { kind: "customers", file: filename, customers, subscribers: [], columns: Object.keys(xmlFields(blocks[0])), warnings };
  }
  let table: string[][];
  if (name.endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0]; if (!ws) throw new Error("Το αρχείο δεν έχει φύλλο.");
    table = [];
    ws.eachRow({ includeEmpty: false }, (row) => { const vals = (row.values as unknown[]).slice(1).map((v) => (v == null ? "" : typeof v === "object" && v && "text" in v ? String((v as { text: unknown }).text) : v instanceof Date ? v.toISOString() : String(v))); table.push(vals); });
  } else table = parseCsv(buf.toString("utf8").replace(/^﻿/, ""));
  if (!table.length) throw new Error("Το αρχείο είναι κενό.");
  const header = table[0].map(key);
  const hasHeader = header.some((h) => Object.values(ALIASES).flat().includes(h));
  const body = hasHeader ? table.slice(1) : table;
  const cols = hasHeader ? header : table[0].map((_, i) => `c${i}`);
  // Newsletter: λίγες στήλες, μία με email και μία true/false
  const isNewsletter = cols.length <= 6 && !cols.some((c) => ALIASES.firstName.includes(c) || ALIASES.lastName.includes(c));
  if (isNewsletter) {
    const sample = body.slice(0, 50);
    const ei = cols.findIndex((_, i) => sample.filter((r) => lowerEmail(r[i] ?? "")).length > sample.length / 2);
    const ai = cols.findIndex((c, i) => ALIASES.active.includes(c) || (i !== ei && sample.every((r) => /^(true|false|0|1)$/i.test((r[i] ?? "").trim()))));
    if (ei < 0) throw new Error("Δεν βρέθηκε στήλη με email.");
    if (ai < 0) warnings.push("Δεν βρέθηκε στήλη «Active» — όλοι θεωρούνται ενεργοί.");
    const ci = cols.findIndex((c) => ALIASES.createdAt.includes(c));
    const subscribers = body.map((r, i) => ({ row: i + (hasHeader ? 2 : 1), email: lowerEmail(r[ei] ?? "") ?? "", active: ai < 0 ? true : truthy(r[ai] ?? ""), createdAt: ci >= 0 ? r[ci] || null : null })).filter((s) => s.email);
    return { kind: "newsletter", file: filename, customers: [], subscribers, columns: cols, warnings };
  }
  if (!cols.some((c) => ALIASES.email.includes(c))) throw new Error("Δεν βρέθηκε στήλη «Email» — είναι εξαγωγή πελατών του nopCommerce;");
  const customers = body.map((r, i) => toCustomer(Object.fromEntries(cols.map((c, k) => [c, r[k] ?? ""])), i + 2));
  return { kind: "customers", file: filename, customers, subscribers: [], columns: cols, warnings };
}

export async function saveJob(j: Omit<NopJob, "id" | "createdAt">): Promise<NopJob> {
  const job: NopJob = { ...j, id: randomUUID(), createdAt: new Date().toISOString() };
  await mkdir(DIR, { recursive: true });
  await writeFile(path.join(DIR, `${job.id}.json`), JSON.stringify(job));
  return job;
}
export async function loadJob(id: string): Promise<NopJob | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  try { return JSON.parse(await readFile(path.join(DIR, `${id}.json`), "utf8")) as NopJob; } catch { return null; }
}

// ---------- Διασταύρωση ----------

export type NopAction = "create" | "link" | "merge" | "conflict" | "same" | "skip";
export interface NopDecision { row: number; action: NopAction; by: string | null; customerId: string | null; otherId: string | null; reason: string; email: string | null; name: string }
type Cand = { id: string; email: string | null; phoneKey: string | null; vatNumber: string | null; nopId: number | null; source: string; firstName: string; lastName: string; passwordHash: string | null; _count: { orders: number } };

async function candidates(rows: NopCustomer[]) {
  const emails = rows.map((r) => r.email).filter((e): e is string => !!e);
  const phones = rows.map((r) => phoneKey(r.phone)).filter((p): p is string => !!p);
  const vats = rows.map((r) => r.vat).filter((v): v is string => !!v && v.length === 9);
  const ids = rows.map((r) => r.nopId).filter((n): n is number => !!n);
  const sel = { id: true, email: true, phoneKey: true, vatNumber: true, nopId: true, source: true, firstName: true, lastName: true, passwordHash: true, _count: { select: { orders: true } } } as const;
  const list: Cand[] = await db.customer.findMany({ where: { status: { not: "anonymised" }, OR: [{ nopId: { in: ids } }, { email: { in: emails } }, { phoneKey: { in: phones } }, { vatNumber: { in: vats } }] }, select: sel });
  return list;
}

export async function decide(rows: NopCustomer[]): Promise<NopDecision[]> {
  const out: NopDecision[] = [];
  for (let i = 0; i < rows.length; i += 1000) {
    const part = rows.slice(i, i + 1000);
    const cands = await candidates(part);
    for (const r of part) {
      const name = [r.firstName, r.lastName].filter(Boolean).join(" ") || r.company || "—";
      const base = { row: r.row, email: r.email, name, otherId: null as string | null };
      if (r.staff) { out.push({ ...base, action: "skip", by: null, customerId: null, reason: "Διαχειριστής / πωλητής του nop" }); continue; }
      if (!r.email) { out.push({ ...base, action: "skip", by: null, customerId: null, reason: r.guest ? "Επισκέπτης χωρίς email" : "Χωρίς έγκυρο email" }); continue; }
      const pk = phoneKey(r.phone);
      const byNop = r.nopId ? cands.find((c) => c.nopId === r.nopId) : undefined;
      const byEmail = cands.find((c) => c.email === r.email);
      const byPhone = pk ? cands.filter((c) => c.phoneKey === pk) : [];
      const byVat = r.vat && r.vat.length === 9 ? cands.find((c) => c.vatNumber === r.vat) : undefined;
      if (byNop) { out.push({ ...base, action: "same", by: "λογαριασμός nop", customerId: byNop.id, reason: "Έχει ήδη εισαχθεί — συμπληρώνονται μόνο κενά" }); continue; }
      const main = byEmail ?? byPhone.find((c) => !c.email || c.email === r.email) ?? byVat;
      const mainBy = byEmail ? "email" : main && byPhone.includes(main) ? "κινητό" : main ? "ΑΦΜ" : null;
      // δεύτερος πελάτης με το ίδιο κινητό: ενώνεται αν είναι «από το ιστορικό» χωρίς δικό του λογαριασμό, αλλιώς έλεγχος
      const other = main ? byPhone.find((c) => c.id !== main.id) : undefined;
      if (main && other) {
        const mergeable = other.source === "softone-history" && !other.email && !other.passwordHash && other._count.orders === 0;
        out.push({ ...base, action: mergeable ? "merge" : "conflict", by: mainBy, customerId: main.id, otherId: other.id, reason: mergeable ? "Ίδιο κινητό με πελάτη από το ιστορικό του SoftOne — ενώνονται" : "Το ίδιο κινητό έχει κι άλλος πελάτης με δικό του λογαριασμό — θέλει έλεγχο" });
        continue;
      }
      if (main) {
        if (main.email && main.email !== r.email) { out.push({ ...base, action: "conflict", by: mainBy, customerId: main.id, otherId: null, reason: `Ταιριάζει με ${mainBy} αλλά ο πελάτης έχει άλλο email — θέλει έλεγχο` }); continue; }
        out.push({ ...base, action: "link", by: mainBy, customerId: main.id, reason: main.source === "softone-history" ? "Πελάτης από το ιστορικό του SoftOne — παίρνει email και λογαριασμό nop" : "Υπάρχων πελάτης — συμπληρώνονται κενά" });
        continue;
      }
      // ονοματεπώνυμο + Τ.Κ. σε πελάτη από το ιστορικό
      const zip = r.addresses.find((a) => a.zip)?.zip?.replace(/\s/g, "");
      if (r.firstName && r.lastName && zip) {
        const m = await db.customer.findFirst({ where: { source: "softone-history", email: null, firstName: { equals: r.firstName, mode: "insensitive" }, lastName: { equals: r.lastName, mode: "insensitive" }, addresses: { some: { zip } } }, select: { id: true } });
        if (m) { out.push({ ...base, action: "link", by: "όνομα + Τ.Κ.", customerId: m.id, reason: "Πελάτης από το ιστορικό του SoftOne με ίδιο ονοματεπώνυμο και Τ.Κ." }); continue; }
      }
      out.push({ ...base, action: "create", by: null, customerId: null, reason: "Νέος πελάτης" });
    }
  }
  return out;
}

export async function planJob(job: NopJob) {
  if (job.kind === "newsletter") {
    const emails = job.subscribers.map((s) => s.email);
    const [subs, custs] = await Promise.all([db.newsletterSubscriber.findMany({ where: { email: { in: emails } }, select: { email: true, source: true } }), db.customer.findMany({ where: { email: { in: emails } }, select: { email: true } })]);
    const local = new Set(subs.filter((s) => s.source !== "import").map((s) => s.email)), cust = new Set(custs.map((c) => c.email));
    const counts = { active: job.subscribers.filter((s) => s.active).length, inactive: job.subscribers.filter((s) => !s.active).length, keepLocal: job.subscribers.filter((s) => local.has(s.email)).length, withCustomer: job.subscribers.filter((s) => cust.has(s.email)).length };
    return { kind: job.kind, total: job.subscribers.length, counts, decisions: [] as NopDecision[], warnings: job.warnings };
  }
  const decisions = await decide(job.customers);
  const counts = Object.fromEntries((["create", "link", "merge", "conflict", "same", "skip"] as NopAction[]).map((a) => [a, decisions.filter((d) => d.action === a).length]));
  const by = Object.fromEntries([...new Set(decisions.map((d) => d.by).filter(Boolean))].map((b) => [b!, decisions.filter((d) => d.by === b).length]));
  // για την οθόνη: όλες οι συγκρούσεις και δείγμα από τα υπόλοιπα
  const shown = [...decisions.filter((d) => d.action === "conflict"), ...(["merge", "link", "create", "same", "skip"] as NopAction[]).flatMap((a) => decisions.filter((d) => d.action === a).slice(0, 40))];
  return { kind: job.kind, total: job.customers.length, counts, by, decisions: shown, warnings: job.warnings };
}

// ---------- Εφαρμογή ----------

const date = (v: string | null) => { if (!v) return null; const d = new Date(v.includes("T") || v.includes("-") ? v : v.replace(/(\d{1,2})\/(\d{1,2})\/(\d{4})/, "$3-$2-$1")); return Number.isNaN(d.getTime()) ? null : d; };
const zipOf = (z?: string) => (z ?? "").replace(/\s/g, "");

async function addAddresses(customerId: string, r: NopCustomer) {
  const have = await db.address.findMany({ where: { customerId }, select: { street: true, zip: true } });
  let n = have.length;
  for (const a of r.addresses) {
    const street = [a.street, a.street2].filter(Boolean).join(", ").slice(0, 200);
    if (!street || have.some((h) => h.street.toLowerCase() === street.toLowerCase() && h.zip === zipOf(a.zip))) continue;
    await db.address.create({ data: { customerId, street, zip: zipOf(a.zip), city: (a.city ?? "—").slice(0, 80) || "—", region: "", recipient: [a.firstName, a.lastName].filter(Boolean).join(" ") || null, phone: a.phone ?? null, label: "Από το παλιό eshop", isDefault: n === 0 } });
    have.push({ street, zip: zipOf(a.zip) }); n++;
  }
}

export async function applyCustomers(job: NopJob, offset: number, limit: number, staffId: string | null) {
  const rows = job.customers.slice(offset, offset + limit);
  const decisions = await decide(rows);
  const res = { created: 0, linked: 0, merged: 0, conflicts: 0, skipped: 0, errors: [] as string[] };
  const touched = new Set<string>();
  for (const d of decisions) {
    const r = rows.find((x) => x.row === d.row)!;
    try {
      if (d.action === "skip") { res.skipped++; continue; }
      const pk = phoneKey(r.phone);
      const tags = ["nopcommerce", ...(d.action === "conflict" ? ["έλεγχος-διπλού"] : [])];
      if (d.action === "create") {
        const c = await db.customer.create({ data: {
          email: r.email, firstName: r.firstName.slice(0, 80), lastName: (r.lastName || r.company || "—").slice(0, 120), company: r.company, vatNumber: r.vat && r.vat.length === 9 ? r.vat : null,
          type: r.company && r.vat ? "business" : "individual", mobile: pk?.startsWith("69") ? pk : null, phone: pk && !pk.startsWith("69") ? pk : !pk ? r.phone : null, phoneKey: pk,
          gender: /^f|θηλ/i.test(r.gender ?? "") ? "f" : /^m|αρσ/i.test(r.gender ?? "") ? "m" : null, nopId: r.nopId, source: "nop", status: r.active ? "active" : "blocked", tags,
          createdAt: date(r.createdAt) ?? undefined, events: { create: { kind: "import", meta: { from: "nopcommerce", nopId: r.nopId, file: job.file }, staffId } },
        }, select: { id: true } });
        await addAddresses(c.id, r); touched.add(c.id); res.created++; continue;
      }
      const id = d.customerId!;
      if (d.action === "merge" && d.otherId) { await mergeHistoryCustomer(d.otherId, id); res.merged++; }
      const cur = await db.customer.findUniqueOrThrow({ where: { id }, select: { email: true, firstName: true, lastName: true, phoneKey: true, mobile: true, phone: true, vatNumber: true, company: true, nopId: true, tags: true, gender: true } });
      const patch: Prisma.CustomerUpdateInput = { tags: [...new Set([...cur.tags, ...tags])] };
      if (!cur.email && r.email && !(await db.customer.findUnique({ where: { email: r.email }, select: { id: true } }))) patch.email = r.email;
      if (!cur.nopId && r.nopId && !(await db.customer.findUnique({ where: { nopId: r.nopId }, select: { id: true } }))) patch.nopId = r.nopId;
      if ((!cur.firstName || cur.lastName === "Πελάτης λιανικής") && r.firstName) { patch.firstName = r.firstName.slice(0, 80); patch.lastName = (r.lastName || cur.lastName).slice(0, 120); }
      if (!cur.phoneKey && pk) { patch.phoneKey = pk; if (pk.startsWith("69") && !cur.mobile) patch.mobile = pk; else if (!cur.phone) patch.phone = pk; }
      if (!cur.vatNumber && r.vat?.length === 9) patch.vatNumber = r.vat;
      if (!cur.company && r.company) patch.company = r.company;
      if (!cur.gender && r.gender) patch.gender = /^f|θηλ/i.test(r.gender) ? "f" : /^m|αρσ/i.test(r.gender) ? "m" : null;
      await db.customer.update({ where: { id }, data: { ...patch, events: { create: { kind: "import", meta: { from: "nopcommerce", nopId: r.nopId, matchedBy: d.by, action: d.action, other: d.otherId }, staffId } } } });
      if (d.action === "conflict" && d.otherId) await db.customer.update({ where: { id: d.otherId }, data: { tags: { push: "έλεγχος-διπλού" } } }).catch(() => null);
      await addAddresses(id, r); touched.add(id);
      if (d.action === "conflict") res.conflicts++; else res.linked++;
    } catch (e) { res.errors.push(`Γραμμή ${d.row}: ${(e as Error).message.split("\n").pop()}`); }
  }
  await refreshCustomerTotals([...touched]);
  return res;
}

/** Newsletter του nop: μόνο οι ενεργοί γίνονται συνδρομητές, με συγκατάθεση που γράφει από πού ήρθε. Τοπικές επιλογές κερδίζουν. */
export async function applyNewsletter(job: NopJob, offset: number, limit: number, staffId: string | null) {
  const rows = job.subscribers.slice(offset, offset + limit);
  const res = { subscribed: 0, unsubscribed: 0, keptLocal: 0, errors: [] as string[] };
  for (const s of rows) {
    try {
      const ex = await db.newsletterSubscriber.findUnique({ where: { email: s.email }, select: { id: true, source: true } });
      if (ex && ex.source !== "import") { res.keptLocal++; continue; }
      const cust = await db.customer.findUnique({ where: { email: s.email }, select: { id: true, firstName: true } });
      const when = date(s.createdAt);
      const sub = await db.newsletterSubscriber.upsert({ where: { email: s.email }, create: { email: s.email, customerId: cust?.id ?? null, firstName: cust?.firstName || null, status: s.active ? "subscribed" : "unsubscribed", source: "import", confirmedAt: s.active ? when ?? new Date() : null, unsubscribedAt: s.active ? null : new Date(), unsubscribeReason: s.active ? null : "ανενεργός στο παλιό eshop" }, update: { customerId: cust?.id ?? undefined, status: s.active ? "subscribed" : "unsubscribed" }, select: { id: true } });
      await db.consent.create({ data: { customerId: cust?.id ?? null, subscriberId: sub.id, email: s.email, topic: "newsletter", channel: "email", granted: s.active, method: "import", source: "import", confirmedAt: s.active ? when : null, staffId, evidence: { from: "nopcommerce", file: job.file, row: s.row, active: s.active, subscribedAt: s.createdAt } as Prisma.InputJsonValue } });
      if (cust) await db.customer.update({ where: { id: cust.id }, data: { newsletter: s.active } });
      if (s.active) res.subscribed++; else res.unsubscribed++;
    } catch (e) { res.errors.push(`${s.email}: ${(e as Error).message.split("\n").pop()}`); }
  }
  return res;
}

export function geocodeImported() { void geocodePending(undefined, 20000); }
