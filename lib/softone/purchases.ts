import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getTable } from "@/lib/softone/lookups";
import { logged, type Trigger } from "@/lib/softone/catalog";
import { geocodeCustomerAddress } from "@/lib/customers/geocode-address";
import { planDevices, type PlanLine } from "@/lib/warranty/erp-devices";
import { warrantyFromSpecs } from "@/lib/warranty/policy";

/**
 * Ιστορικό αγορών του σημερινού eshop από το SoftOne → πελάτες, αγορές, συσκευές και εγγυήσεις στο νέο eshop.
 * ΜΟΝΟ αναγνώσεις από το ERP (GetTable). Τι βρήκαμε στα δεδομένα:
 * - Οι παραγγελίες του eshop έχουν δικές τους σειρές (PES…, E-ΠΑΕ). Τα παραστατικά του πελάτη (απόδειξη, τιμολόγιο, πιστωτικό)
 *   δείχνουν την παραγγελία τους στο `CCCFINDOCS` — έτσι δεν μετράμε την ίδια αγορά δύο φορές.
 * - Οι λιανικές γράφονται στον γενικό πελάτη TRDR 200 «ΠΕΛΑΤΗΣ ΛΙΑΝΙΚΗΣ»· ο πραγματικός αγοραστής είναι στο MTRDOC
 *   (`CCCSHPNAME`, `CCCSHPPHONE`, `CCCSHPADDRESS`) — χωρίς email. Ταίριασμα προσώπου με το κινητό / τηλέφωνο.
 * - Όσοι ζητούν τιμολόγιο ανοίγονται ως πελάτες στο SoftOne (κατηγορία «…ESHOP»): ταίριασμα με TRDR, ΑΦΜ, email.
 * - Τα παραστατικά προς τα καταστήματα-μέλη (δελτία, PKP, παραγγελίες μέλους) δεν είναι αγορές πελάτη και μένουν έξω.
 * Δεν γράφονται συναινέσεις: οι πελάτες αυτοί δεν έχουν δώσει συγκατάθεση για προωθητικά.
 */
export const RETAIL_TRDR = 200;
const SERIES: Record<number, { kind: "order" | "receipt" | "invoice" | "credit"; status?: string }> = {
  7005: { kind: "order" }, 7006: { kind: "order", status: "phone" }, 7007: { kind: "order", status: "paid" }, 7008: { kind: "order", status: "unpaid" },
  7009: { kind: "order", status: "cancelled" }, 7152: { kind: "order", status: "pending" }, 7061: { kind: "order" },
  7315: { kind: "receipt" }, 7415: { kind: "receipt" }, 7261: { kind: "invoice" },
  7151: { kind: "credit" }, 7150: { kind: "credit" }, 7319: { kind: "credit" },
};

const int = (v: string | undefined) => { const n = parseInt(v ?? "", 10); return Number.isFinite(n) ? n : null; };
const num = (v: string | undefined) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
const txt = (v: string | undefined) => { const t = (v ?? "").replace(/\s+/g, " ").trim(); return t || null; };
const date = (v: string | undefined) => { if (!v) return null; const d = new Date(v.replace(" ", "T")); return Number.isNaN(d.getTime()) ? null : d; };
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));
/** Τα τελευταία 10 ψηφία, μόνο για ελληνικά κινητά / σταθερά — αλλιώς δεν είναι αξιόπιστο κλειδί προσώπου. */
export const phoneKey = (raw: string | null | undefined) => { const d = (raw ?? "").replace(/\D/g, "").replace(/^0030|^30(?=\d{10}$)/, "").slice(-10); return /^(69|2)\d{8,9}$/.test(d) && d.length === 10 ? d : null; };
const validEmail = (e: string | null | undefined) => { const t = (e ?? "").trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(t) ? t : null; };
const validAfm = (a: string | null | undefined) => { const t = (a ?? "").replace(/\D/g, ""); return /^\d{9}$/.test(t) && t !== "000000000" ? t : null; };
const splitName = (full: string) => { const p = full.split(" ").filter(Boolean); return p.length > 1 ? { firstName: p[0], lastName: p.slice(1).join(" ") } : { firstName: "", lastName: full }; };
/** «Οδός 12, 54621 Θεσσαλονίκη» → οδός / Τ.Κ. / πόλη (όσο γίνεται — η αρχική γραμμή μένει στο recipient της αγοράς). */
function parseAddress(raw: string) {
  const m = /(\d{3})\s?(\d{2})/.exec(raw);
  const zip = m ? `${m[1]}${m[2]}` : "";
  const before = m ? raw.slice(0, m.index) : raw, after = m ? raw.slice(m.index + m[0].length) : "";
  const street = before.replace(/[,\s-]+$/, "").trim() || raw.trim();
  const city = after.replace(/^[,\s-]+/, "").split(/[,(]/)[0].trim();
  return { street: street.slice(0, 200), zip, city: city.slice(0, 80) };
}

/** `buyer` = FINDOC.COMMENTS1: το ονοματεπώνυμο του αγοραστή (ίδιο με το CCCSHPNAME όπου υπάρχουν και τα δύο — και υπάρχει όπου εκείνο λείπει) */
interface Doc { findoc: number; series: number; fincode: string; date: Date; trdr: number; total: number | null; net: number | null; vat: number | null; parent: number | null; buyer: string | null }

/** Συγχρονισμός: όλες οι αγορές από `since` (προεπιλογή 2020) ή, χωρίς όρισμα μετά τον πρώτο, όσες άλλαξαν. */
export function syncPurchases(opts: { since?: Date; until?: Date; trigger?: Trigger } = {}) {
  return logged("cust-purchases", opts.trigger ?? "manual", async () => {
    const state = await db.s1SyncState.findUnique({ where: { kind: "purchases" } });
    const since = opts.since ?? (state?.cursor ? new Date(state.cursor.getTime() - 2 * 86_400_000) : new Date("2020-01-01"));
    const until = opts.until ? ` AND TRNDATE<'${opts.until.toISOString().slice(0, 10)}'` : "";
    const filter = `SERIES IN (${Object.keys(SERIES).join(",")}) AND ${opts.until ? `TRNDATE>='${since.toISOString().slice(0, 10)}'${until}` : `(TRNDATE>='${since.toISOString().slice(0, 10)}' OR UPDDATE>='${since.toISOString().slice(0, 19).replace("T", " ")}')`}`;
    const rows = await getTable("FINDOC", ["FINDOC", "SERIES", "FINCODE", "TRNDATE", "TRDR", "SUMAMNT", "NETAMNT", "VATAMNT", "CCCFINDOCS", "UPDDATE", "COMMENTS1"], filter);
    const docs: Doc[] = rows.map((r) => ({ findoc: int(r[0])!, series: int(r[1])!, fincode: r[2] ?? "", date: date(r[3])!, trdr: int(r[4]) ?? 0, total: num(r[5]), net: num(r[6]), vat: num(r[7]), parent: int(r[8]), buyer: txt(r[10]) })).filter((d) => d.findoc && d.date && SERIES[d.series]);
    let maxUpd = state?.cursor ?? null;
    for (const r of rows) { const u = date(r[9]); if (u && (!maxUpd || u > maxUpd)) maxUpd = u; }

    // Πελάτες του ERP που εμφανίζονται: τα μέλη / προμηθευτές μένουν έξω
    const trdrs = [...new Set(docs.map((d) => d.trdr).filter((t) => t && t !== RETAIL_TRDR))];
    const trdrInfo = new Map<number, Record<string, string>>();
    const TF = ["TRDR", "CODE", "NAME", "AFM", "IRSDATA", "ADDRESS", "ZIP", "CITY", "DISTRICT", "PHONE01", "PHONE02", "EMAIL", "TRDCATEGORY", "TRDBUSINESS", "TRDPGROUP", "JOBTYPETRD"];
    for (const part of chunk(trdrs, 400)) for (const r of await getTable("TRDR", TF, `TRDR IN (${part.join(",")})`)) trdrInfo.set(int(r[0])!, Object.fromEntries(TF.map((f, i) => [f, r[i] ?? ""])));
    const members = new Set<number>();
    for (const [t, i] of trdrInfo) if (i.TRDBUSINESS?.trim() || i.TRDPGROUP?.trim()) members.add(t);
    const mine = docs.filter((d) => d.trdr === RETAIL_TRDR || (trdrInfo.has(d.trdr) && !members.has(d.trdr)));
    const byFindoc = new Map(mine.map((d) => [d.findoc, d]));
    // Παραγγελία λιανικής που τιμολογήθηκε σε επιχείρηση: η παραγγελία ανήκει στον πελάτη του τιμολογίου (όχι σε «νέο» πελάτη από το τηλέφωνο)
    const invoiceTrdrOf = new Map<number, number>();
    for (const d of mine) if (SERIES[d.series].kind !== "order" && d.parent && d.trdr !== RETAIL_TRDR) invoiceTrdrOf.set(d.parent, d.trdr);

    // Αγοραστής (MTRDOC) και γραμμές (MTRLINES)
    const recip = new Map<number, { name: string | null; phone: string | null; address: string | null; afm: string | null; job: string | null }>();
    const lines = new Map<number, { lineNo: number; mtrl: number | null; qty: number; price: number | null; total: number | null; member: number | null }[]>();
    for (const part of chunk(mine.map((d) => d.findoc), 500)) {
      for (const r of await getTable("MTRDOC", ["FINDOC", "CCCSHPNAME", "CCCSHPPHONE", "CCCSHPADDRESS", "CCCSHPAFM", "CCCSHPJOB"], `FINDOC IN (${part.join(",")})`)) { const f = int(r[0])!; recip.set(f, { name: txt(r[1]) ?? byFindoc.get(f)?.buyer ?? null, phone: txt(r[2]), address: txt(r[3]), afm: txt(r[4]), job: txt(r[5]) }); }
      for (const r of await getTable("MTRLINES", ["FINDOC", "MTRLINES", "MTRL", "QTY1", "PRICE", "LINEVAL", "CCCCUSTOMER"], `FINDOC IN (${part.join(",")})`)) {
        const f = int(r[0])!; const l = lines.get(f) ?? []; lines.set(f, l);
        l.push({ lineNo: int(r[1]) ?? l.length + 1, mtrl: int(r[2]), qty: num(r[3]) ?? 1, price: num(r[4]), total: num(r[5]), member: int(r[6]) });
      }
    }
    // Ονόματα ειδών: από τον καθρέφτη· όσα δεν είναι είδη του site (υπηρεσίες, παλιά) από το ERP
    const mtrls = [...new Set([...lines.values()].flat().map((l) => l.mtrl).filter((m): m is number => !!m))];
    const known = new Map((await db.s1Item.findMany({ where: { mtrl: { in: mtrls } }, select: { mtrl: true, code: true, name: true, guaranteeMonths: true } })).map((i) => [i.mtrl, i]));
    const unknown = mtrls.filter((m) => !known.has(m));
    for (const part of chunk(unknown, 500)) for (const r of await getTable("MTRL", ["MTRL", "CODE", "NAME", "GUARTIME"], `MTRL IN (${part.join(",")})`)) known.set(int(r[0])!, { mtrl: int(r[0])!, code: r[1] ?? "", name: (r[2] ?? "").trim(), guaranteeMonths: int(r[3]) });
    const productOf = new Map((await db.product.findMany({ where: { erpCode: { in: mtrls.map(String) } }, select: { id: true, erpCode: true, brand: { select: { name: true } }, modelCode: true } })).map((p) => [Number(p.erpCode), p]));

    let created = 0, updated = 0, skipped = 0, failed = 0;
    const errors: string[] = [];
    const touchedCustomers = new Set<string>();
    // Πρώτα οι παραγγελίες, μετά τα παραστατικά (ώστε να βρουν τον «γονέα» τους)
    const ordered = [...mine].sort((a, b) => Number(SERIES[a.series].kind !== "order") - Number(SERIES[b.series].kind !== "order") || +a.date - +b.date);
    const idOfFindoc = new Map((await db.purchase.findMany({ where: { s1Findoc: { in: ordered.map((d) => d.findoc) } }, select: { id: true, s1Findoc: true } })).map((p) => [p.s1Findoc!, p.id]));
    const series = new Map((await db.docSeries.findMany({ where: { s1Id: { in: Object.keys(SERIES) } }, select: { s1Id: true, code: true, name: true } })).map((s) => [Number(s.s1Id), s]));

    for (const d of ordered) {
      const def = SERIES[d.series], rc = recip.get(d.findoc) ?? (d.buyer ? { name: d.buyer, phone: null, address: null, afm: null, job: null } : null);
      const billed = d.trdr === RETAIL_TRDR ? invoiceTrdrOf.get(d.findoc) : undefined;
      const asDoc = billed ? { ...d, trdr: billed } : d, info = trdrInfo.get(asDoc.trdr);
      // σταθερότητα: η αγορά κρατά τον πελάτη της· παραστατικό λιανικής → ο πελάτης της παραγγελίας του (ίδιος αγοραστής)
      const kept = idOfFindoc.has(d.findoc) ? (await db.purchase.findUnique({ where: { id: idOfFindoc.get(d.findoc)! }, select: { customerId: true } }))?.customerId ?? null : null;
      const parentCustomer = def.kind !== "order" && d.parent && d.trdr === RETAIL_TRDR && idOfFindoc.has(d.parent) ? (await db.purchase.findUnique({ where: { id: idOfFindoc.get(d.parent)! }, select: { customerId: true } }))?.customerId ?? null : null;
      const customerId = (!billed && (kept ?? parentCustomer)) || await resolveCustomer(asDoc, rc, info).catch(() => null);
      if (customerId) touchedCustomers.add(customerId);
      const recipient = { name: rc?.name ?? info?.NAME ?? null, phone: rc?.phone ?? (info?.PHONE02 || info?.PHONE01 || null), address: rc?.address ?? ([info?.ADDRESS, info?.ZIP, info?.CITY].filter(Boolean).join(", ") || null), afm: rc?.afm ?? info?.AFM ?? null, company: d.trdr !== RETAIL_TRDR ? info?.NAME ?? null : null };
      const parentId = def.kind !== "order" && d.parent ? idOfFindoc.get(d.parent) ?? null : null;
      const s = series.get(d.series);
      const data = {
        customerId, source: "softone", kind: def.kind, status: def.status ?? (def.kind === "order" ? "pending" : "issued"), s1Series: d.series, seriesCode: s?.code ?? null, seriesName: s?.name ?? null,
        docNo: d.fincode || null, date: d.date, trdr: d.trdr, total: d.total, net: d.net, vat: d.vat, recipient: recipient as Prisma.InputJsonValue, parentId, syncedAt: new Date(),
      };
      // οι γραμμές του SoftOne είναι χωρίς ΦΠΑ· δείχνονται με ΦΠΑ, όπως το σύνολο του παραστατικού
      const gross = d.total && d.net && d.net > 0 ? d.total / d.net : 1;
      const g = (v: number | null) => (v == null ? null : Math.round(v * gross * 100) / 100);
      const ls = (lines.get(d.findoc) ?? []).sort((a, b) => a.lineNo - b.lineNo).map((l, i) => {
        const it = l.mtrl ? known.get(l.mtrl) : undefined;
        return { lineNo: i + 1, mtrl: l.mtrl, productId: l.mtrl ? productOf.get(l.mtrl)?.id ?? null : null, code: it?.code ?? null, title: it?.name || "Είδος", qty: l.qty, unitPrice: g(l.price), lineTotal: g(l.total), memberTrdr: l.member };
      });
      const existing = idOfFindoc.get(d.findoc);
      if (existing && customerId) { const prev = await db.purchase.findUnique({ where: { id: existing }, select: { customerId: true } }); if (prev?.customerId && prev.customerId !== customerId) await mergeHistoryCustomer(prev.customerId, customerId); }
      let p: { id: string };
      try {
      p = await db.$transaction(async (tx) => {
        const row = existing ? await tx.purchase.update({ where: { id: existing }, data, select: { id: true } }) : await tx.purchase.create({ data: { ...data, s1Findoc: d.findoc }, select: { id: true } });
        // γραμμές στη θέση τους (σταθερά ids: οι συσκευές δείχνουν σε αυτές)
        if (!existing) { if (ls.length) await tx.purchaseLine.createMany({ data: ls.map((l) => ({ ...l, purchaseId: row.id })) }); }
        else {
          for (const l of ls) await tx.purchaseLine.upsert({ where: { purchaseId_lineNo: { purchaseId: row.id, lineNo: l.lineNo } }, create: { ...l, purchaseId: row.id }, update: l });
          await tx.purchaseLine.deleteMany({ where: { purchaseId: row.id, lineNo: { gt: ls.length } } });
        }
        return row;
      }, { timeout: 60_000, maxWait: 15_000 }); // απομακρυσμένη βάση: πολλές γραμμές σε ένα παραστατικό θέλουν χρόνο
      } catch (e) { failed++; if (failed <= 20) errors.push(`FINDOC ${d.findoc}: ${(e as Error).message.split("\n").pop()?.slice(0, 160)}`); continue; }
      idOfFindoc.set(d.findoc, p.id);
      if (existing) updated++; else created++;
      // Συσκευές: από παραγγελίες που δεν ακυρώθηκαν (τα παραστατικά συχνά εκδίδει το κατάστημα-μέλος, όχι εδώ)
      if (customerId && def.kind === "order" && def.status !== "cancelled") await devicesFor(customerId, p.id, d, ls, productOf, known);
    }
    if (!mine.length) skipped = docs.length;

    await refreshCustomerTotals([...touchedCustomers]);
    // Geodata: οι νέες διευθύνσεις παίρνουν συντεταγμένες, νομό και πλησιέστερο κατάστημα — στο παρασκήνιο, με τον ρυθμό του geocoder
    void geocodePending([...touchedCustomers]);
    await db.s1SyncState.upsert({ where: { kind: "purchases" }, update: { cursor: maxUpd, lastFullAt: opts.since ? new Date() : undefined }, create: { kind: "purchases", cursor: maxUpd, lastFullAt: new Date() } });
    if (failed) console.warn(`[purchases] ${failed} παραστατικά δεν γράφτηκαν:`, errors.join(" | "));
    return { fetched: docs.length, created, updated, missing: docs.length - mine.length, skipped: skipped + failed };
  });
}

/** Ποιος πελάτης: TRDR (τιμολόγιο) → ΑΦΜ → email → κινητό· αλλιώς νέος πελάτης «από το ιστορικό του SoftOne». */
async function resolveCustomer(d: Doc, rc: { name: string | null; phone: string | null; address: string | null; afm: string | null } | null, info?: Record<string, string>): Promise<string | null> {
  const isInvoice = d.trdr !== RETAIL_TRDR && !!info;
  const name = (isInvoice ? info!.NAME : rc?.name)?.replace(/\s+/g, " ").trim() ?? "";
  const pk = phoneKey(rc?.phone) ?? (isInvoice ? phoneKey(info!.PHONE02) ?? phoneKey(info!.PHONE01) : null);
  const afm = isInvoice ? validAfm(info!.AFM) : validAfm(rc?.afm);
  const email = isInvoice ? validEmail(info!.EMAIL) : null;
  if (!name && !pk) return null;

  const or: Prisma.CustomerWhereInput[] = [];
  if (isInvoice) or.push({ erpTrdr: String(d.trdr) });
  if (afm) or.push({ vatNumber: afm });
  if (email) or.push({ email });
  if (pk && !isInvoice) or.push({ phoneKey: pk });
  let found = or.length ? await db.customer.findFirst({ where: { OR: or, status: { not: "anonymised" } }, orderBy: { createdAt: "asc" }, select: { id: true, erpTrdr: true, phoneKey: true, vatNumber: true, email: true } }) : null;
  // χωρίς κανένα κλειδί: ίδιο ονοματεπώνυμο ΚΑΙ ίδιος Τ.Κ. (μόνο σε πελάτες από το ιστορικό)
  const zip = rc?.address ? parseAddress(rc.address).zip : "";
  if (!found && !isInvoice && name && zip) {
    const n0 = splitName(name);
    found = await db.customer.findFirst({ where: { source: "softone-history", type: "individual", firstName: { equals: n0.firstName, mode: "insensitive" }, lastName: { equals: n0.lastName, mode: "insensitive" }, addresses: { some: { zip } } }, orderBy: { createdAt: "asc" }, select: { id: true, erpTrdr: true, phoneKey: true, vatNumber: true, email: true } });
  }
  if (found) {
    const patch: Prisma.CustomerUpdateInput = {};
    if (isInvoice && !found.erpTrdr) { patch.erpTrdr = String(d.trdr); patch.erpCode = info!.CODE || null; patch.erpSyncStatus = "linked"; }
    if (!found.phoneKey && pk) patch.phoneKey = pk;
    if (!found.vatNumber && afm) patch.vatNumber = afm;
    if (!found.email && email && !(await db.customer.findUnique({ where: { email }, select: { id: true } }))) patch.email = email;
    if (Object.keys(patch).length) await db.customer.update({ where: { id: found.id }, data: patch }).catch(() => null);
    await addAddress(found.id, rc?.address ?? null, info, rc?.name ?? null, rc?.phone ?? null);
    return found.id;
  }
  const n = !name ? { firstName: "", lastName: "Πελάτης λιανικής" } : isInvoice ? { firstName: "", lastName: name } : splitName(name);
  const mobile = pk?.startsWith("69") ? pk : null, phone = pk && !pk.startsWith("69") ? pk : !pk ? (rc?.phone ?? null)?.slice(0, 30) ?? null : null;
  const c = await db.customer.create({ data: {
    type: isInvoice ? "business" : "individual", email: email && !(await db.customer.findUnique({ where: { email }, select: { id: true } })) ? email : null,
    firstName: n.firstName.slice(0, 80), lastName: n.lastName.slice(0, 120), company: isInvoice ? name.slice(0, 200) : null, vatNumber: afm, doy: isInvoice ? info!.IRSDATA || null : null, profession: isInvoice ? info!.JOBTYPETRD || null : null,
    mobile, phone, phoneKey: pk, source: "softone-history", status: "active", tags: ["ιστορικό-softone"],
    ...(isInvoice ? { erpTrdr: String(d.trdr), erpCode: info!.CODE || null, erpSyncStatus: "linked" } : {}),
    events: { create: { kind: "erp-pull", meta: { from: "softone-history", findoc: d.findoc } } },
  }, select: { id: true } });
  await addAddress(c.id, rc?.address ?? null, info, rc?.name ?? null, rc?.phone ?? null);
  return c.id;
}

async function addAddress(customerId: string, raw: string | null, info: Record<string, string> | undefined, recipient: string | null, phone: string | null) {
  const a = raw ? parseAddress(raw) : info?.ADDRESS ? { street: info.ADDRESS.trim(), zip: (info.ZIP ?? "").replace(/\s/g, ""), city: (info.CITY ?? "").trim() } : null;
  if (!a || !a.street) return;
  const same = await db.address.findFirst({ where: { customerId, street: { equals: a.street, mode: "insensitive" }, zip: a.zip }, select: { id: true } });
  if (same) return;
  const count = await db.address.count({ where: { customerId } });
  await db.address.create({ data: { customerId, street: a.street, zip: a.zip, city: a.city || "—", region: info?.DISTRICT?.trim() || "", recipient, phone, label: "Από παραγγελία", isDefault: count === 0 } }).catch(() => null);
}

type Line = { lineNo: number; mtrl: number | null; productId: string | null; code: string | null; title: string; qty: number; unitPrice: number | null; lineTotal: number | null };
/** Εγγύηση κατασκευαστή από τα χαρακτηριστικά των προϊόντων («Εγγύηση: 5 χρόνια»), σε μήνες. */
async function specWarranties(productIds: string[]) {
  const out = new Map<string, number>();
  if (!productIds.length) return out;
  const specs = await db.spec.findMany({ where: { productId: { in: productIds }, key: { contains: "γγ", mode: "insensitive" } }, select: { productId: true, key: true, value: true } });
  const by = new Map<string, { key: string; value: string }[]>();
  for (const s of specs) by.set(s.productId, [...(by.get(s.productId) ?? []), s]);
  for (const [id, list] of by) { const w = warrantyFromSpecs(list); if (w) out.set(id, w.months); }
  return out;
}

/** Συσκευές ενός παραστατικού: εγγύηση κατασκευαστή (GUARTIME → χαρακτηριστικά → 24) και επέκταση στη σωστή συσκευή. */
async function devicesFor(customerId: string, purchaseId: string, d: Doc, ls: Line[], productOf: Map<number, { id: string; brand: { name: string }; modelCode: string | null }>, known: Map<number, { guaranteeMonths: number | null }>) {
  const lineIds = new Map((await db.purchaseLine.findMany({ where: { purchaseId }, select: { id: true, lineNo: true } })).map((l) => [l.lineNo, l.id]));
  const pid = (l: { mtrl: number | null }) => (l.mtrl ? productOf.get(l.mtrl)?.id ?? null : null);
  const specW = await specWarranties([...new Set(ls.map(pid).filter((x): x is string => !!x))]);
  const plan = planDevices(ls as PlanLine[], (l) => (l.mtrl ? known.get(l.mtrl)?.guaranteeMonths : null) || specW.get(pid(l) ?? "") || null);
  for (const pd of plan) {
    const l = ls.find((x) => x.lineNo === pd.lineNo)!;
    const p = l.mtrl ? productOf.get(l.mtrl) : undefined;
    const lineId = lineIds.get(l.lineNo); if (!lineId) continue;
    const until = new Date(d.date); until.setMonth(until.getMonth() + pd.months);
    const extUntil = pd.extMonths ? new Date(until.getTime()) : null; if (extUntil) extUntil.setMonth(extUntil.getMonth() + pd.extMonths!);
    const data = { customerId, productId: p?.id ?? null, brand: p?.brand.name ?? "", title: l.title, model: p?.modelCode ?? l.code, purchasedAt: d.date, invoiceNo: d.fincode || String(d.findoc), warrantyMonths: pd.months, warrantyUntil: until, extendedUntil: extUntil, extendedPlan: pd.extPlan, registeredBy: "erp" };
    await db.customerDevice.upsert({ where: { purchaseLineId_unitNo: { purchaseLineId: lineId, unitNo: pd.unit } }, create: { ...data, purchaseLineId: lineId, unitNo: pd.unit }, update: data }).catch(() => null);
  }
}

/**
 * Επανυπολογισμός εγγυήσεων των συσκευών από το SoftOne με τα ήδη αποθηκευμένα παραστατικά — χωρίς κλήση στο SoftOne.
 * Με `dryRun` μόνο μετρά τι θα άλλαζε. Δεν αγγίζει επεκτάσεις που πληρώθηκαν από το e-shop.
 */
export async function recomputeErpWarranties(opts: { dryRun?: boolean } = {}) {
  const stats = { docs: 0, devices: 0, monthsChanged: 0, extAdded: 0, extRemoved: 0, untouchedPaid: 0, samples: [] as string[] };
  const docIds = (await db.$queryRawUnsafe<{ id: string }[]>(`select distinct l."purchaseId" id from "CustomerDevice" d join "PurchaseLine" l on l.id = d."purchaseLineId" where d."registeredBy" = 'erp'`)).map((x) => x.id);
  for (let i = 0; i < docIds.length; i += 200) {
    const docs = await db.purchase.findMany({ where: { id: { in: docIds.slice(i, i + 200) } }, select: { id: true, date: true, lines: { select: { id: true, lineNo: true, mtrl: true, code: true, title: true, qty: true, unitPrice: true, productId: true } } } });
    const devs = await db.customerDevice.findMany({ where: { registeredBy: "erp", purchaseLineId: { in: docs.flatMap((dc) => dc.lines.map((l) => l.id)) } }, select: { id: true, purchaseLineId: true, unitNo: true, warrantyMonths: true, extendedUntil: true, extendedPlan: true, extensions: { where: { status: "paid" }, select: { id: true } } } });
    const specW = await specWarranties([...new Set(docs.flatMap((dc) => dc.lines.map((l) => l.productId)).filter((x): x is string => !!x))]);
    for (const dc of docs) {
      stats.docs++;
      const lines: PlanLine[] = dc.lines.map((l) => ({ lineNo: l.lineNo, mtrl: l.mtrl, code: l.code, title: l.title, qty: l.qty, unitPrice: l.unitPrice == null ? null : Number(l.unitPrice), productId: l.productId }));
      const plan = planDevices(lines, (l) => specW.get(l.productId ?? "") ?? null);
      for (const l of dc.lines) for (const dev of devs.filter((x) => x.purchaseLineId === l.id)) {
        stats.devices++;
        const pd = plan.find((x) => x.lineNo === l.lineNo && x.unit === dev.unitNo);
        if (!pd) continue;
        const paid = dev.extensions.length > 0;
        if (paid) stats.untouchedPaid++;
        const until = new Date(dc.date); until.setMonth(until.getMonth() + pd.months);
        const extUntil = pd.extMonths ? new Date(until.getTime()) : null; if (extUntil) extUntil.setMonth(extUntil.getMonth() + pd.extMonths!);
        const monthsChanged = dev.warrantyMonths !== pd.months, hadExt = !!dev.extendedUntil, hasExt = !!extUntil;
        if (monthsChanged) stats.monthsChanged++;
        if (!paid && hadExt !== hasExt) { if (hasExt) stats.extAdded++; else stats.extRemoved++; }
        if (stats.samples.length < 8 && (monthsChanged || (!paid && hadExt !== hasExt))) stats.samples.push(`${l.title.slice(0, 50)}: ${dev.warrantyMonths}→${pd.months} μήνες${!paid && hadExt !== hasExt ? (hasExt ? " · +επέκταση" : " · −επέκταση") : ""}`);
        if (!opts.dryRun && (monthsChanged || (!paid && (hadExt !== hasExt || (hasExt && +dev.extendedUntil! !== +extUntil!))))) {
          await db.customerDevice.update({ where: { id: dev.id }, data: { warrantyMonths: pd.months, warrantyUntil: until, ...(paid ? {} : { extendedUntil: extUntil, extendedPlan: pd.extPlan }) } });
        }
      }
    }
  }
  return stats;
}

/** Σύνοψη αγορών ανά πελάτη: παραγγελίες που δεν ακυρώθηκαν (SoftOne) + παραγγελίες του νέου eshop. */
export async function refreshCustomerTotals(ids: string[]) {
  for (const part of chunk(ids, 200)) {
    // μία αγορά = παραγγελία που δεν ακυρώθηκε, ή παραστατικό πώλησης χωρίς παραγγελία
    const agg = await db.purchase.groupBy({ by: ["customerId"], where: { customerId: { in: part }, OR: [{ kind: "order", NOT: { status: "cancelled" } }, { kind: { in: ["receipt", "invoice"] }, parentId: null }] }, _count: { _all: true }, _sum: { total: true }, _min: { date: true }, _max: { date: true } });
    const shop = await db.order.groupBy({ by: ["customerId"], where: { customerId: { in: part }, status: { notIn: ["cancelled", "pending"] } }, _count: { _all: true }, _sum: { total: true }, _min: { createdAt: true }, _max: { createdAt: true } });
    for (const id of part) {
      const a = agg.find((x) => x.customerId === id), s = shop.find((x) => x.customerId === id);
      const dates = [a?._min.date, a?._max.date, s?._min.createdAt, s?._max.createdAt].filter((x): x is Date => !!x);
      await db.customer.update({ where: { id }, data: {
        purchaseCount: (a?._count._all ?? 0) + (s?._count._all ?? 0), purchaseTotal: Number(a?._sum.total ?? 0) + Number(s?._sum.total ?? 0),
        firstPurchaseAt: dates.length ? new Date(Math.min(...dates.map(Number))) : null, lastPurchaseAt: dates.length ? new Date(Math.max(...dates.map(Number))) : null,
      } }).catch(() => null);
    }
  }
}

export async function purchaseStats() {
  const [customers, fromHistory, purchases, byKind, devices, state, geocoded, geoPending, geoMissed] = await Promise.all([
    db.customer.count(), db.customer.count({ where: { source: "softone-history" } }), db.purchase.count({ where: { source: "softone" } }),
    db.purchase.groupBy({ by: ["kind"], where: { source: "softone" }, _count: { _all: true } }), db.customerDevice.count({ where: { registeredBy: "erp" } }),
    db.s1SyncState.findUnique({ where: { kind: "purchases" } }),
    db.address.count({ where: { lat: { not: null } } }), db.address.count({ where: { lat: null, geocodedAt: null } }), db.address.count({ where: { lat: null, geocodedAt: { not: null } } }),
  ]);
  return { customers, fromHistory, purchases, byKind: Object.fromEntries(byKind.map((k) => [k.kind, k._count._all])), devices, geocoded, geoPending, geoMissed, cursor: state?.cursor ?? null, lastFullAt: state?.lastFullAt ?? null };
}

/**
 * Συντεταγμένες, νομός και πλησιέστερο κατάστημα για διευθύνσεις πελατών που δεν έχουν ακόμη (μέσω του geocode API του
 * eshop — Nominatim: έως 1 αίτημα / δευτερόλεπτο, οπότε σειριακά). Χωρίς `customerIds`: όλες οι εκκρεμείς.
 */
let geocoding = false;
export async function geocodePending(customerIds?: string[], limit = 5000) {
  if (geocoding) return { ok: 0, missed: 0, busy: true };
  geocoding = true;
  let ok = 0, missed = 0;
  try {
    const rows = await db.address.findMany({ where: { lat: null, geocodedAt: null, ...(customerIds ? { customerId: { in: customerIds } } : {}) }, select: { id: true }, take: limit, orderBy: { createdAt: "asc" } });
    for (const a of rows) {
      const r = await geocodeCustomerAddress(a.id).catch(() => ({ ok: false as const }));
      if (r.ok) ok++; else { missed++; await db.address.update({ where: { id: a.id }, data: { geocodedAt: new Date() } }).catch(() => null); } // να μη ξαναδοκιμάζεται κάθε φορά
      await new Promise((res) => setTimeout(res, 1100));
    }
  } finally { geocoding = false; }
  return { ok, missed, busy: false };
}

/**
 * Ένας πελάτης «από το ιστορικό» που αποδείχθηκε ίδιος με άλλον (π.χ. η παραγγελία του τιμολογήθηκε σε επιχείρηση):
 * διευθύνσεις, συσκευές και αγορές περνούν στον σωστό και ο διπλός φεύγει — μόνο αν τον δημιούργησε ο συγχρονισμός και
 * δεν έχει τίποτα δικό του (λογαριασμό, email, παραγγελίες νέου eshop, συναινέσεις, σημειώσεις).
 */
export async function mergeHistoryCustomer(fromId: string, toId: string) {
  const c = await db.customer.findUnique({ where: { id: fromId }, select: { source: true, email: true, passwordHash: true, _count: { select: { orders: true, consents: true, customerNotes: true, tickets: true, social: true } } } });
  if (!c || c.source !== "softone-history" || c.email || c.passwordHash || Object.values(c._count).some((n) => n > 0)) return;
  if (await db.purchase.count({ where: { customerId: fromId, s1Findoc: null } })) return;
  await db.$transaction(async (tx) => {
    await tx.purchase.updateMany({ where: { customerId: fromId }, data: { customerId: toId } });
    await tx.customerDevice.updateMany({ where: { customerId: fromId }, data: { customerId: toId } });
    const target = await tx.address.findMany({ where: { customerId: toId }, select: { street: true, zip: true } });
    for (const a of await tx.address.findMany({ where: { customerId: fromId } })) {
      if (target.some((t) => t.street.toLowerCase() === a.street.toLowerCase() && t.zip === a.zip)) continue;
      await tx.address.update({ where: { id: a.id }, data: { customerId: toId, isDefault: false } });
    }
    await tx.customerEvent.create({ data: { customerId: toId, kind: "erp-pull", meta: { merged: fromId, reason: "ίδιος αγοραστής" } } });
    await tx.customer.delete({ where: { id: fromId } });
  });
}
