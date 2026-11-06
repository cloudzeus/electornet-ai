import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { asapConfig, asapDepot, asapGeocode, asapPriceQuote } from "@/lib/couriers/asap/client";
import { EXPRESS_ETA, STANDARD_ETA, STANDARD_UNKNOWN, asapEligible, expressCheck, inZips, normalizeAsapRules, pickAsapPrice, type AsapRules } from "./asap-express";
import type { ShipLimit } from "./bulky-server";
import { categoryPaths } from "@/lib/warranty/pricing";
import DEFAULT_CATS from "./asap-categories.json";

/** Ρυθμίσεις ASAP Express (setting «shipping.asap»), 60″ στη μνήμη. Χωρίς αποθηκευμένες κατηγορίες → η λίστα του πελάτη (Excel). */
const SECTION = "shipping.asap";
let mem: { at: number; v: AsapRules } | null = null;

export async function getAsapRules(): Promise<AsapRules> {
  if (mem && Date.now() - mem.at < 60_000) return mem.v;
  const row = await db.setting.findUnique({ where: { section: SECTION } }).catch(() => null);
  const v = normalizeAsapRules(row?.data);
  if (!row || !(row.data as Record<string, unknown> | null)?.categories) v.categories = { ...(DEFAULT_CATS as Record<string, boolean>) };
  // env ASAP_EXPRESS=on|off κερδίζει τον διακόπτη (δοκιμή σε dev χωρίς αλλαγή της κοινής βάσης· άμεσο κλείσιμο σε ανάγκη)
  if (process.env.ASAP_EXPRESS === "on") v.on = true; else if (process.env.ASAP_EXPRESS === "off") v.on = false;
  mem = { at: Date.now(), v };
  return v;
}

export async function saveAsapRules(raw: unknown, userId: string) {
  const before = await getAsapRules();
  const after = normalizeAsapRules(raw);
  const data = after as unknown as Prisma.InputJsonValue;
  await db.setting.upsert({ where: { section: SECTION }, update: { data, updatedById: userId }, create: { section: SECTION, data, updatedById: userId } });
  mem = null;
  return { before, after };
}

export interface HomeAddress { street?: string | null; number?: string | null; city?: string | null; zip?: string | null }
/** Ό,τι χρειάζεται το checkout στην Αττική. express = null → δεν προσφέρεται (το καλάθι δεν το επιτρέπει ή η ASAP δεν έδωσε τιμή). */
export interface AtticaOffer {
  attica: boolean;
  standard: { eta: string; inStock: boolean };
  express: null | { state: "need-address" } | { state: "pending" } | { state: "ok"; fee: number; zone: string; eta: string };
  /** γιατί δεν προσφέρεται Express (για τη διαχείριση / έλεγχο, όχι για τον πελάτη) */
  why: string | null;
}

// Η ASAP τιμολογεί ανά ζώνη και βάρος: τιμή ανά ΤΚ + δέμα, 30′ στη μνήμη· αποτυχίες 1′ (ASAP εκτός λειτουργίας δεν φρενάρει
// κάθε υπολογισμό). Ο υπολογισμός της ASAP κρατά ~5″, γι' αυτό ο ίδιος υπολογισμός μοιράζεται όσο τρέχει.
type Priced = { v: { fee: number; zone: string } | null; err?: string };
const priceMem = new Map<string, { at: number; ttl: number; p: Promise<Priced>; done?: Priced }>();
let depotMem: { at: number; v: { lat: number; lon: number } } | null = null;
const TIMEOUT = 15_000;

function livePrice(addr: { street: string; number: string; city: string; zip: string }, pkg: { weightKg: number; dims: [number, number, number] }, zones: string[]) {
  const key = JSON.stringify([addr.zip, Math.round(pkg.weightKg * 10), pkg.dims.map((d) => Math.round(d)), zones]);
  const hit = priceMem.get(key);
  if (hit && (!hit.done || Date.now() - hit.at < hit.ttl)) return hit;
  const run = async (): Promise<Priced> => {
    const c = await asapConfig();
    if (!c) return { v: null, err: "ASAP χωρίς στοιχεία σύνδεσης" };
    try {
      if (!depotMem || Date.now() - depotMem.at > 86_400_000) { const d = await asapDepot(c, TIMEOUT); if (d) depotMem = { at: Date.now(), v: d }; }
      if (!depotMem) return { v: null, err: "χωρίς αποθήκη παραλαβής" };
      const to = await asapGeocode(c, { street: addr.street, number: addr.number, zip: addr.zip, city: addr.city }, TIMEOUT);
      if (!to) return { v: null, err: "η διεύθυνση δεν βρέθηκε" };
      const v = pickAsapPrice(await asapPriceQuote(c, depotMem.v, to, pkg, TIMEOUT), zones);
      return { v, err: v ? undefined : "εκτός ζώνης ή χωρίς τιμή" };
    } catch (e) { return { v: null, err: e instanceof Error ? e.message : "σφάλμα ASAP" }; }
  };
  const entry: { at: number; ttl: number; p: Promise<Priced>; done?: Priced } = { at: Date.now(), ttl: 60_000, p: Promise.resolve({ v: null }) };
  entry.p = run().then((r) => { entry.done = r; entry.at = Date.now(); // λάθος διεύθυνση: όχι στη μνήμη (το κλειδί είναι ο ΤΚ — η διορθωμένη διεύθυνση ξαναρωτά)
    entry.ttl = r.v || r.err === "εκτός ζώνης ή χωρίς τιμή" ? 1_800_000 : r.err === "η διεύθυνση δεν βρέθηκε" ? 0 : 60_000; return r; });
  priceMem.set(key, entry);
  if (priceMem.size > 1000) priceMem.delete(priceMem.keys().next().value!);
  return entry;
}

/**
 * Παράδοση στην Αττική για αυτό το καλάθι: κανονική (χρόνος ανάλογα με τη διαθεσιμότητα) και, αν επιτρέπεται, Express
 * με τιμή από την ASAP. Εκτός Αττικής ή με κλειστή ροή → attica: false (το checkout όπως πριν).
 */
export async function atticaOffer(lines: { productId: string; qty: number; title: string }[], addr: HomeAddress, limits: Map<string, ShipLimit>, rules?: AsapRules, /** πόσο περιμένουμε την ASAP· μετά «pending» (ο browser ξαναρωτά) */ waitMs = 1500): Promise<AtticaOffer> {
  rules ??= await getAsapRules();
  const ids = [...new Set(lines.map((l) => l.productId))];
  const prods = ids.length ? await db.product.findMany({ where: { id: { in: ids } }, select: { id: true, sku: true, categoryId: true, availState: true } }) : [];
  const pm = new Map(prods.map((p) => [p.id, p]));
  const inStockOf = (id: string) => { const s = pm.get(id)?.availState; return s === "in-stock" || s === "low"; };
  const inStock = lines.length > 0 && lines.every((l) => inStockOf(l.productId));
  const standard = { eta: inStock ? STANDARD_ETA : STANDARD_UNKNOWN, inStock };
  const attica = rules.on && inZips(addr.zip, rules.atticaZips);
  if (!attica) return { attica: false, standard, express: null, why: rules.on ? "εκτός Αττικής" : "κλειστό" };
  const paths = await categoryPaths(prods.map((p) => p.categoryId));
  const check = expressCheck(lines.map((l) => {
    const p = pm.get(l.productId), lim = limits.get(l.productId);
    return { title: l.title, qty: l.qty, eligible: !!p && asapEligible(paths.get(p.categoryId) ?? [], p.sku, rules!), inStock: inStockOf(l.productId), weightKg: lim?.weightKg ?? null, dimsCm: lim?.dimsCm ?? null };
  }), rules);
  if (!check.ok) return { attica, standard, express: null, why: check.reason };
  const street = addr.street?.trim() ?? "", number = addr.number?.trim() ?? "", city = addr.city?.trim() ?? "";
  if (!street || !number || !city) return { attica, standard, express: { state: "need-address" }, why: null };
  const e = livePrice({ street, number, city, zip: addr.zip!.trim() }, check.pkg, rules.zones);
  const r = e.done ?? (await Promise.race([e.p, new Promise<null>((ok) => setTimeout(() => ok(null), waitMs))]));
  if (!r) return { attica, standard, express: { state: "pending" }, why: null };
  if (!r.v) return { attica, standard, express: null, why: r.err ?? "χωρίς τιμή" };
  return { attica, standard, express: { state: "ok", fee: r.v.fee, zone: r.v.zone, eta: EXPRESS_ETA }, why: null };
}
