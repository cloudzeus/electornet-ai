import "server-only";
import { db } from "@/lib/db";
import { resolveAvailability, parseConds, isAvailState, type AvailRule, type AvailInput, type AvailResult } from "@/lib/catalog/availability-core";

/**
 * Προβολή της διαθεσιμότητας στο `Product.availLabel / availState` (η βιτρίνα διαβάζει μόνο αυτά). Τρέχει μετά την
 * προβολή τιμής/αποθέματος (`projectOffers`) και όταν αλλάξουν οι κανόνες. Γράφει μόνο όσα άλλαξαν, σε ομάδες ίδιας τιμής.
 */
export async function loadAvailRules(): Promise<AvailRule[]> {
  const rows = await db.availabilityRule.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  return rows.map((r) => ({ id: r.id, active: r.active, conditions: parseConds(r.conditions), label: r.label, state: isAvailState(r.state) ? r.state : "order", publish: r.publish }));
}

/** Γονείς κάθε κατηγορίας (η ίδια πρώτη) — οι κανόνες «κατηγορία» πιάνουν και τις υποκατηγορίες. */
export async function categoryChains(): Promise<(id: string) => string[]> {
  const cats = await db.category.findMany({ select: { id: true, parentId: true } });
  const parent = new Map(cats.map((c) => [c.id, c.parentId]));
  const memo = new Map<string, string[]>();
  return (id: string) => {
    const hit = memo.get(id);
    if (hit) return hit;
    const out: string[] = [];
    for (let c: string | null | undefined = id; c && !out.includes(c) && out.length < 12; c = parent.get(c)) out.push(c);
    memo.set(id, out);
    return out;
  };
}

type Row = { id: string; erpCode: string; source: string | null; stock: number; price: number | null; brandId: string; categoryId: string; supplierAvail: string | null; availLabel: string | null; availState: string | null };
const select = { id: true, erpCode: true, source: true, stock: true, price: true, brandId: true, categoryId: true, supplierAvail: true, availLabel: true, availState: true } as const;

export function inputOf(p: Omit<Row, "id" | "availLabel" | "availState">, override: string | null | undefined, chain: (id: string) => string[]): AvailInput {
  return { stock: p.stock, override: override ?? null, supplier: p.supplierAvail, brandId: p.brandId, categoryIds: chain(p.categoryId), hasPrice: !!(p.price && p.price > 0) };
}

async function loadInputs(where: object) {
  const [chain, products] = await Promise.all([categoryChains(), db.product.findMany({ where, select }) as Promise<Row[]>]);
  const mtrls = products.filter((p) => p.source === "softone" && /^\d+$/.test(p.erpCode)).map((p) => Number(p.erpCode));
  const own = new Map<string, string | null>();
  for (let i = 0; i < mtrls.length; i += 5000) {
    const part = await db.s1Item.findMany({ where: { mtrl: { in: mtrls.slice(i, i + 5000) }, availText: { not: null } }, select: { mtrl: true, availText: true } });
    for (const s of part) own.set(String(s.mtrl), s.availText);
  }
  return products.map((p) => ({ p, input: inputOf(p, p.source === "softone" ? own.get(p.erpCode) : null, chain) }));
}

/** Χωρίς `productIds`: όλος ο κατάλογος. Επιστρέφει πόσα προϊόντα άλλαξαν. */
export async function projectAvailability(productIds?: string[]): Promise<number> {
  const [rules, rows] = await Promise.all([loadAvailRules(), loadInputs(productIds ? { id: { in: productIds } } : {})]);
  const groups = new Map<string, { label: string; state: string; ids: string[] }>();
  for (const { p, input } of rows) {
    const a = resolveAvailability(input, rules);
    if (a.label === p.availLabel && a.state === p.availState) continue;
    const k = `${a.state}\u0000${a.label}`;
    const g = groups.get(k) ?? { label: a.label, state: a.state, ids: [] };
    g.ids.push(p.id); groups.set(k, g);
  }
  let n = 0;
  for (const g of groups.values()) for (let i = 0; i < g.ids.length; i += 2000) n += (await db.product.updateMany({ where: { id: { in: g.ids.slice(i, i + 2000) } }, data: { availLabel: g.label, availState: g.state } })).count;
  return n;
}

/** Η επιλυμένη διαθεσιμότητα ανά προϊόν (για τον έλεγχο πληρότητας: φράση + «δημοσιεύεται»). */
export async function availabilityOf(where: object): Promise<Map<string, AvailResult>> {
  const [rules, rows] = await Promise.all([loadAvailRules(), loadInputs(where)]);
  return new Map(rows.map(({ p, input }) => [p.id, resolveAvailability(input, rules)]));
}

export interface AvailTally { total: number; hidden: number; phrases: { label: string; state: string; source: AvailResult["source"]; ruleId?: string; count: number }[] }

/** Τι θα δείχνει η βιτρίνα με αυτούς τους κανόνες (πριν την αποθήκευση): φράσεις και πλήθη στα ενεργά προϊόντα. */
export async function tallyAvailability(rules: AvailRule[]): Promise<AvailTally> {
  const rows = await loadInputs({ active: true });
  const m = new Map<string, AvailTally["phrases"][number]>();
  let hidden = 0;
  for (const { input } of rows) {
    const a = resolveAvailability(input, rules);
    if (!a.publish) hidden++;
    const k = `${a.source}\u0000${a.ruleId ?? ""}\u0000${a.state}\u0000${a.label}`;
    const x = m.get(k) ?? { label: a.label, state: a.state, source: a.source, ...(a.ruleId ? { ruleId: a.ruleId } : {}), count: 0 };
    x.count++; m.set(k, x);
  }
  return { total: rows.length, hidden, phrases: [...m.values()].sort((a, b) => b.count - a.count) };
}

/** «Δοκιμή για προϊόν» της σελίδας κανόνων: τι βγαίνει και γιατί (με τους αποθηκευμένους κανόνες· `input` για δοκιμή με άλλους). */
export async function explainAvailability(productId: string): Promise<{ product: { id: string; title: string; sku: string; stock: number; supplierAvail: string | null; override: string | null }; input: AvailInput; result: AvailResult } | null> {
  const p = await db.product.findUnique({ where: { id: productId }, select: { ...select, title: true, sku: true } });
  if (!p) return null;
  const [rules, chain] = await Promise.all([loadAvailRules(), categoryChains()]);
  const override = p.source === "softone" && /^\d+$/.test(p.erpCode) ? (await db.s1Item.findUnique({ where: { mtrl: Number(p.erpCode) }, select: { availText: true } }))?.availText ?? null : null;
  const input = inputOf(p, override, chain);
  return { product: { id: p.id, title: p.title, sku: p.sku, stock: p.stock, supplierAvail: p.supplierAvail, override }, input, result: resolveAvailability(input, rules) };
}
