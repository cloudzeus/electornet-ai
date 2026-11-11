import "server-only";
import { db } from "@/lib/db";
import { friendlyError, getTable, syncLookup } from "@/lib/softone/lookups";

/**
 * Εισαγωγή από το SoftOne ό,τι σχετίζεται με τους μεταφορείς. Μόνο ανάγνωση από το SoftOne, γράφει στη δική μας βάση:
 * 1. SOCARRIER (με διεύθυνση, ΑΦΜ, email…) — τα κενά πεδία μας συμπληρώνονται, ό,τι έγραψε άνθρωπος μένει.
 * 2. TRUCKS → CarrierVehicle (οχήματα ανά μεταφορέα).
 * 3. TRDR.SOCARRIER των συνεργατών → Partner.s1CarrierId (προεπιλεγμένος μεταφορέας τους στο SoftOne).
 */
export async function importCarriersFromSoftOne() {
  const carriers = await syncLookup("carrier");
  if (!carriers.ok) return { ok: false as const, error: carriers.error };
  try {
    const filled = await fillBlanks();
    const vehicles = await syncVehicles();
    const partners = await syncPartnerDefaults();
    return { ok: true as const, carriers: { created: carriers.created, updated: carriers.updated, missing: carriers.missing }, filled, vehicles, partners };
  } catch (e) {
    return { ok: false as const, error: friendlyError(e) };
  }
}

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Κενά πεδία του eshop ← στοιχεία SoftOne. */
async function fillBlanks() {
  const rows = await db.carrier.findMany({ where: { s1Id: { not: null } }, select: { id: true, address: true, city: true, zip: true, email: true, afm: true, phone: true, s1Data: true } });
  let n = 0;
  for (const r of rows) {
    const d = (r.s1Data ?? {}) as Record<string, unknown>;
    const data: Record<string, string> = {};
    const put = (k: "address" | "city" | "zip" | "email" | "afm" | "phone", v: string, max: number) => { if (!r[k] && v) data[k] = v.slice(0, max); };
    put("address", s(d.ADDRESS), 120); put("city", s(d.CITY), 60); put("zip", s(d.ZIP).replace(/\s/g, ""), 5); put("email", s(d.EMAIL), 120); put("afm", s(d.AFM), 12); put("phone", s(d.PHONE01) || s(d.PHONE02), 30);
    if (Object.keys(data).length) { await db.carrier.update({ where: { id: r.id }, data }); n++; }
  }
  return n;
}

const num = (v: string) => { const x = Number(String(v).replace(",", ".")); return Number.isFinite(x) && x > 0 ? x : null; };

async function syncVehicles() {
  const F = ["TRUCKS", "CODE", "NAME", "ISACTIVE", "SOCARRIER", "WEIGHT", "VOLUME", "TRDR", "PNUMBER", "REMARKS"];
  const rows = await getTable("TRUCKS", F, "");
  const all = await db.carrier.findMany({ where: { s1Id: { not: null } }, select: { id: true, s1Id: true, code: true } });
  const carriers = new Map(all.map((c) => [c.s1Id as string, c.id]));
  // Στο SoftOne της Euronics το TRUCKS.SOCARRIER μένει κενό· κάθε όχημα έχει τον ίδιο κωδικό (πινακίδα) με έναν μεταφορέα.
  const byCode = new Map(all.map((c) => [c.code, c.id]));
  const now = new Date();
  const seen: string[] = [];
  for (const r of rows) {
    if (!r[0]) continue;
    seen.push(r[0]);
    const data = {
      code: r[1] || r[0], name: r[2] || r[1] || r[0], plate: r[8] || r[1] || null, active: r[3] !== "0",
      s1CarrierId: r[4] || null, carrierId: (r[4] && carriers.get(r[4])) || byCode.get(r[1]) || byCode.get(r[8]) || null, trdr: Number(r[7]) || null,
      weightKg: num(r[5]), volumeM3: num(r[6]), s1Data: Object.fromEntries(F.map((f, i) => [f, r[i] ?? ""])), s1SyncedAt: now, s1Missing: false,
    };
    await db.carrierVehicle.upsert({ where: { s1Id: r[0] }, create: { s1Id: r[0], ...data }, update: data });
  }
  const missing = (await db.carrierVehicle.updateMany({ where: { s1Id: { not: null, notIn: seen }, s1Missing: false }, data: { s1Missing: true } })).count;
  return { fetched: rows.length, missing };
}

async function syncPartnerDefaults() {
  const partners = await db.partner.findMany({ where: { s1Trdr: { not: null } }, select: { id: true, s1Trdr: true, s1CarrierId: true } });
  let changed = 0, withCarrier = 0;
  for (let i = 0; i < partners.length; i += 400) {
    const chunk = partners.slice(i, i + 400);
    const rows = await getTable("TRDR", ["TRDR", "SOCARRIER"], `TRDR IN (${chunk.map((p) => p.s1Trdr).join(",")})`);
    const by = new Map(rows.map((r) => [Number(r[0]), r[1] || null]));
    for (const p of chunk) {
      const v = by.get(p.s1Trdr as number) ?? null;
      if (v) withCarrier++;
      if (v !== p.s1CarrierId) { await db.partner.update({ where: { id: p.id }, data: { s1CarrierId: v } }); changed++; }
    }
  }
  return { checked: partners.length, withCarrier, changed };
}

/**
 * Παραστατικά με αυτόν τον μεταφορέα ανά μήνα (12 μήνες), από MTRDOC.SOCARRIER + FINDOC.TRNDATE.
 * Κρατιέται 24 ώρες στο s1Data.usage του μεταφορέα για να μη ρωτάμε το SoftOne σε κάθε άνοιγμα.
 */
export async function carrierUsage(carrierId: string, force = false): Promise<{ months: { m: string; n: number }[]; at: string } | null> {
  const c = await db.carrier.findUnique({ where: { id: carrierId }, select: { s1Id: true, s1Data: true } });
  if (!c?.s1Id) return null;
  const d = (c.s1Data ?? {}) as Record<string, unknown>;
  const cached = d.usage as { months: { m: string; n: number }[]; at: string } | undefined;
  if (!force && cached && Date.now() - new Date(cached.at).getTime() < 86400_000) return cached;
  const since = new Date(); since.setDate(1); since.setMonth(since.getMonth() - 11);
  const ymd = (x: Date) => x.toISOString().slice(0, 10);
  // το πρώτο FINDOC του διαστήματος, για να μη διαβάσουμε όλο το ιστορικό του MTRDOC
  const wk = new Date(since); wk.setDate(wk.getDate() + 10);
  const first = await getTable("FINDOC", ["FINDOC"], `TRNDATE>='${ymd(since)}' AND TRNDATE<'${ymd(wk)}'`);
  const minId = Math.min(...first.map((r) => Number(r[0])).filter(Boolean));
  const docs = await getTable("MTRDOC", ["FINDOC"], `SOCARRIER=${Number(c.s1Id)}${Number.isFinite(minId) ? ` AND FINDOC>=${minId}` : ""}`);
  const ids = docs.map((r) => Number(r[0])).filter(Boolean);
  const count = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 400) {
    const rows = await getTable("FINDOC", ["FINDOC", "TRNDATE"], `FINDOC IN (${ids.slice(i, i + 400).join(",")})`);
    for (const r of rows) { const m = (r[1] ?? "").slice(0, 7); if (m >= ymd(since).slice(0, 7)) count.set(m, (count.get(m) ?? 0) + 1); }
  }
  const months: { m: string; n: number }[] = [];
  for (let k = 0; k < 12; k++) { const x = new Date(since); x.setMonth(since.getMonth() + k); const m = ymd(x).slice(0, 7); months.push({ m, n: count.get(m) ?? 0 }); }
  const usage = { months, at: new Date().toISOString() };
  await db.carrier.update({ where: { id: carrierId }, data: { s1Data: { ...d, usage } } });
  return usage;
}
