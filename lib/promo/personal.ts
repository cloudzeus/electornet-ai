import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { renderTemplate } from "@/lib/email/templates";
import { sendMail } from "@/lib/email/send";
import { marketingAllowed, randomCode } from "./issue";
import type { PromoTarget } from "./engine";

/**
 * Προσωποποιημένες προσφορές (Φάση 3). Από ό,τι ξέρουμε για τον πελάτη βγαίνει ένας προσωπικός κωδικός μίας χρήσης
 * που ισχύει ΜΟΝΟ στο συγκεκριμένο προϊόν ή κατηγορία (Coupon.scope), με τον λόγο γραμμένο («Από τη λίστα σου»).
 *  - wishlist:   προϊόν της λίστας επιθυμιών
 *  - replace:    αντικατάσταση παλιάς συσκευής (καταχωρημένη συσκευή ή «σύγκριση συσκευής» από φωτογραφία)
 *  - cart:       προϊόν που έμεινε στο καλάθι
 *  - complement: συμπληρωματική κατηγορία μετά από αγορά (π.χ. τηλεόραση → soundbar)
 * Κάθε κανόνας έχει δική του προσφορά-κουπόνι (PERSONAL-…) ώστε να φαίνεται στις αναφορές. Ένας κωδικός ανά πελάτη
 * ανά αφορμή, με περίοδο αναμονής. Email μόνο σε όσους έχουν δώσει συναίνεση. Τίποτα δεν τρέχει αν είναι κλειστό.
 */

export type PersonalKind = "wishlist" | "replace" | "cart" | "complement";
export interface PersonalRule { enabled: boolean; percent: number; validDays: number; cooldownDays: number; minPrice?: number; minAgeYears?: number; idleHours?: number; withinDays?: number; pairs?: { from: string; to: string }[] }
export interface PersonalConfig { sendEmail: boolean; maxPerCustomer: number; rules: Record<PersonalKind, PersonalRule> }

export const PERSONAL_META: Record<PersonalKind, { title: string; reason: string; help: string }> = {
  wishlist: { title: "Λίστα επιθυμιών", reason: "Από τη λίστα επιθυμιών σου", help: "Ο πελάτης έχει ένα προϊόν στη λίστα του: παίρνει έκπτωση μόνο σε αυτό." },
  replace: { title: "Αντικατάσταση παλιάς συσκευής", reason: "Για την αντικατάσταση της συσκευής σου", help: "Ο πελάτης έχει δηλωμένη συσκευή παλαιότερη από Χ χρόνια ή φωτογράφισε τη συσκευή που θέλει να αντικαταστήσει: παίρνει έκπτωση στην ίδια κατηγορία." },
  cart: { title: "Καλάθι που έμεινε", reason: "Για το προϊόν που άφησες στο καλάθι", help: "Ο πελάτης άφησε προϊόν στο καλάθι χωρίς να ολοκληρώσει: παίρνει έκπτωση σε αυτό." },
  complement: { title: "Συμπληρωματικά μετά από αγορά", reason: "Ταιριάζει με την αγορά σου", help: "Μετά από αγορά σε μια κατηγορία, έκπτωση σε μια συμπληρωματική (π.χ. τηλεόραση → soundbar)." },
};

export const DEFAULT_PERSONAL: PersonalConfig = {
  sendEmail: false, maxPerCustomer: 3,
  rules: {
    wishlist: { enabled: false, percent: 5, validDays: 14, cooldownDays: 60, minPrice: 50 },
    replace: { enabled: false, percent: 7, validDays: 30, cooldownDays: 180, minAgeYears: 7 },
    cart: { enabled: false, percent: 5, validDays: 7, cooldownDays: 30, idleHours: 48, minPrice: 50 },
    complement: { enabled: false, percent: 10, validDays: 30, cooldownDays: 90, withinDays: 30, pairs: [] },
  },
};

const SECTION = "promo-personal";
export async function getPersonalConfig(): Promise<PersonalConfig> {
  const row = await db.setting.findUnique({ where: { section: SECTION } }).catch(() => null);
  const v = (row?.data as Partial<PersonalConfig> | null) ?? {};
  const rules = Object.fromEntries((Object.keys(DEFAULT_PERSONAL.rules) as PersonalKind[]).map((k) => [k, { ...DEFAULT_PERSONAL.rules[k], ...(v.rules?.[k] ?? {}) }])) as PersonalConfig["rules"];
  return { ...DEFAULT_PERSONAL, ...v, rules };
}

const clamp = (n: unknown, lo: number, hi: number, d: number) => { const x = Number(n); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : d; };
export function sanitizePersonal(c: PersonalConfig): PersonalConfig {
  const rules = {} as PersonalConfig["rules"];
  for (const k of Object.keys(DEFAULT_PERSONAL.rules) as PersonalKind[]) {
    const r = c.rules?.[k] ?? DEFAULT_PERSONAL.rules[k], d = DEFAULT_PERSONAL.rules[k];
    rules[k] = {
      enabled: !!r.enabled, percent: clamp(r.percent, 1, 50, d.percent), validDays: clamp(r.validDays, 1, 180, d.validDays), cooldownDays: clamp(r.cooldownDays, 1, 730, d.cooldownDays),
      ...(d.minPrice != null ? { minPrice: clamp(r.minPrice, 0, 100000, d.minPrice) } : {}),
      ...(d.minAgeYears != null ? { minAgeYears: clamp(r.minAgeYears, 1, 30, d.minAgeYears) } : {}),
      ...(d.idleHours != null ? { idleHours: clamp(r.idleHours, 1, 720, d.idleHours) } : {}),
      ...(d.withinDays != null ? { withinDays: clamp(r.withinDays, 1, 365, d.withinDays) } : {}),
      ...(k === "complement" ? { pairs: (r.pairs ?? []).filter((p) => p.from && p.to && p.from !== p.to).slice(0, 50) } : {}),
    };
  }
  return { sendEmail: !!c.sendEmail, maxPerCustomer: clamp(c.maxPerCustomer, 1, 10, 3), rules };
}
export async function savePersonalConfig(c: PersonalConfig, staffId: string) {
  const clean = sanitizePersonal(c);
  await db.setting.upsert({ where: { section: SECTION }, create: { section: SECTION, data: clean as unknown as Prisma.InputJsonValue, updatedById: staffId }, update: { data: clean as unknown as Prisma.InputJsonValue, updatedById: staffId } });
  // η προσφορά-κουπόνι κάθε κανόνα ακολουθεί το ποσοστό του
  for (const k of Object.keys(clean.rules) as PersonalKind[]) await ensurePromotion(k, clean.rules[k], staffId);
  return clean;
}

/** Η προσφορά-κουπόνι του κανόνα (PERSONAL-WISHLIST κ.λπ.) — φαίνεται στη λίστα και στις αναφορές. */
async function ensurePromotion(k: PersonalKind, r: PersonalRule, staffId: string | null) {
  const code = `PERSONAL-${k.toUpperCase()}`;
  const data = { name: `Προσωπική προσφορά · ${PERSONAL_META[k].title}`, mechanism: "coupon-percent", reward: { percent: r.percent }, stacking: "combine", status: r.enabled ? "active" : "paused", termsText: `Προσωπικός κωδικός μίας χρήσης, μόνο για το προϊόν / την κατηγορία που αναγράφεται. ${PERSONAL_META[k].reason}.` };
  return db.promotion.upsert({ where: { code }, create: { code, ...data, createdById: staffId, approvedById: staffId }, update: data });
}

const flat = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
/** τύπος συσκευής της «σύγκρισης» (lib/snap/kind.ts) → κατηγορία του καταλόγου */
const KIND_CATEGORY: Record<string, RegExp> = {
  "plyntiria": /^πλυντηρια(?! πιατων)/, "plyntiria-piaton": /πλυντηρια πιατων|πλυντηριο πιατων/, "stegnotiria": /στεγνωτ/,
  "psygeia": /^ψυγει/, "air-condition": /κλιματιστ/, "tileoraseis": /^τηλεορασ/, "koyzines": /^κουζιν/,
};

export interface PersonalCandidate { kind: PersonalKind; customerId: string; email: string; firstName: string; key: string; scope: PromoTarget[]; target: string; reason: string }

/** Ποιοι πελάτες θα πάρουν τι — χωρίς να γράψει τίποτα. */
export async function personalCandidates(cfg: PersonalConfig, now = new Date()): Promise<PersonalCandidate[]> {
  const out: PersonalCandidate[] = [];
  const customer = { status: "active", anonymisedAt: null } as const;
  const R = cfg.rules;
  if (R.wishlist.enabled) {
    const items = await db.wishlistItem.findMany({ where: { list: { customer } }, take: 5000, select: { productId: true, list: { select: { customer: { select: { id: true, email: true, firstName: true } } } } } });
    const prods = new Map((await db.product.findMany({ where: { id: { in: [...new Set(items.map((i) => i.productId))] }, active: true }, select: { id: true, title: true, price: true } })).map((p) => [p.id, p]));
    for (const i of items) { const p = prods.get(i.productId); if (!p || !p.price || p.price < (R.wishlist.minPrice ?? 0)) continue; const c = i.list.customer; out.push({ kind: "wishlist", customerId: c.id, email: c.email, firstName: c.firstName, key: `wishlist:${p.id}`, scope: [{ kind: "product", refId: p.id, exclude: false }], target: p.title, reason: PERSONAL_META.wishlist.reason }); }
  }
  if (R.replace.enabled) {
    const minAge = R.replace.minAgeYears ?? 7;
    const cutoff = new Date(now.getFullYear() - minAge, now.getMonth(), now.getDate());
    const devices = await db.customerDevice.findMany({ where: { customer, purchasedAt: { lte: cutoff }, productId: { not: null } }, take: 5000, select: { id: true, title: true, productId: true, customer: { select: { id: true, email: true, firstName: true } } } });
    const cats = new Map((await db.product.findMany({ where: { id: { in: devices.map((d) => d.productId!) } }, select: { id: true, categoryId: true, category: { select: { name: true } } } })).map((p) => [p.id, p]));
    for (const d of devices) { const p = cats.get(d.productId!); if (!p) continue; out.push({ kind: "replace", customerId: d.customer.id, email: d.customer.email, firstName: d.customer.firstName, key: `replace:device:${d.id}`, scope: [{ kind: "category", refId: p.categoryId, exclude: false }], target: p.category.name, reason: `Για την αντικατάσταση: ${d.title}` }); }
    // «σύγκριση συσκευής»: ο πελάτης φωτογράφισε τη συσκευή που θέλει να αντικαταστήσει — αρκεί αυτό ή ηλικία ≥ όριο
    const scans = await db.snapScan.findMany({ where: { customerId: { not: null }, kind: { not: null }, OR: [{ ageYears: { gte: minAge } }, { ageYears: null }] }, take: 5000, orderBy: { at: "desc" }, select: { id: true, kind: true, brand: true, customerId: true } });
    if (scans.length) {
      const allCats = await db.category.findMany({ where: { active: true, productCount: { gt: 0 } }, select: { id: true, name: true, productCount: true } });
      const catFor = (kind: string) => { const re = KIND_CATEGORY[kind]; if (!re) return null; return allCats.filter((c) => re.test(flat(c.name)) && !/αξεσουαρ|ανταλλακτικ/.test(flat(c.name))).sort((x, y) => y.productCount - x.productCount)[0] ?? null; };
      const people = new Map((await db.customer.findMany({ where: { id: { in: scans.map((s) => s.customerId!) }, ...customer }, select: { id: true, email: true, firstName: true } })).map((c) => [c.id, c]));
      for (const s of scans) { const c = catFor(s.kind!), who = people.get(s.customerId!); if (!c || !who) continue; out.push({ kind: "replace", customerId: who.id, email: who.email, firstName: who.firstName, key: `replace:kind:${c.id}`, scope: [{ kind: "category", refId: c.id, exclude: false }], target: c.name, reason: `Για την αντικατάσταση ${s.brand ? `του ${s.brand} ` : ""}που μας έδειξες` }); }
    }
  }
  if (R.cart.enabled) {
    const idle = new Date(now.getTime() - (R.cart.idleHours ?? 48) * 3_600_000), oldest = new Date(now.getTime() - 14 * 86_400_000);
    const carts = await db.cart.findMany({ where: { customer, updatedAt: { lt: idle, gt: oldest }, lines: { some: {} } }, take: 2000, select: { updatedAt: true, customer: { select: { id: true, email: true, firstName: true } }, lines: { select: { variant: { select: { price: true, product: { select: { id: true, title: true } } } } } } } });
    for (const c of carts) {
      if (!c.customer) continue;
      if (await db.order.count({ where: { customerId: c.customer.id, createdAt: { gte: c.updatedAt } } })) continue;
      const top = [...c.lines].sort((a, b) => Number(b.variant.price) - Number(a.variant.price))[0];
      if (!top || Number(top.variant.price) < (R.cart.minPrice ?? 0)) continue;
      const p = top.variant.product;
      out.push({ kind: "cart", customerId: c.customer.id, email: c.customer.email, firstName: c.customer.firstName, key: `cart:${p.id}`, scope: [{ kind: "product", refId: p.id, exclude: false }], target: p.title, reason: PERSONAL_META.cart.reason });
    }
  }
  if (R.complement.enabled && R.complement.pairs?.length) {
    const since = new Date(now.getTime() - (R.complement.withinDays ?? 30) * 86_400_000);
    const parents = new Map((await db.category.findMany({ select: { id: true, parentId: true, name: true } })).map((c) => [c.id, c]));
    const chain = (id: string) => { const o: string[] = []; for (let c: string | null | undefined = id, g = 0; c && g < 8; c = parents.get(c)?.parentId, g++) o.push(c); return o; };
    const lines = await db.orderLine.findMany({ where: { isGift: false, order: { createdAt: { gte: since }, status: { notIn: ["cancelled", "returned"] }, customer } }, take: 5000, select: { title: true, orderId: true, variant: { select: { product: { select: { categoryId: true } } } }, order: { select: { customer: { select: { id: true, email: true, firstName: true } } } } } });
    for (const l of lines) {
      const c = l.order.customer; if (!c) continue;
      const cats = chain(l.variant.product.categoryId);
      for (const pair of R.complement.pairs) if (cats.includes(pair.from)) out.push({ kind: "complement", customerId: c.id, email: c.email, firstName: c.firstName, key: `complement:${l.orderId}:${pair.to}`, scope: [{ kind: "category", refId: pair.to, exclude: false }], target: parents.get(pair.to)?.name ?? "κατηγορία", reason: `Ταιριάζει με: ${l.title}` });
    }
  }
  // αφαίρεση όσων έχουν ήδη κωδικό για την ίδια αφορμή μέσα στην περίοδο αναμονής
  const keys = [...new Set(out.map((o) => o.key))];
  const existing = keys.length ? await db.coupon.findMany({ where: { personalKey: { in: keys }, customerId: { in: [...new Set(out.map((o) => o.customerId))] } }, select: { personalKey: true, customerId: true, createdAt: true } }) : [];
  const recent = new Set(existing.filter((e) => { const k = e.personalKey!.split(":")[0] as PersonalKind; return now.getTime() - e.createdAt.getTime() < (cfg.rules[k]?.cooldownDays ?? 60) * 86_400_000; }).map((e) => `${e.customerId}|${e.personalKey}`));
  const seen = new Set<string>(), perCustomer = new Map<string, number>();
  return out.filter((o) => {
    const id = `${o.customerId}|${o.key}`;
    if (recent.has(id) || seen.has(id)) return false;
    const n = perCustomer.get(o.customerId) ?? 0;
    if (n >= cfg.maxPerCustomer) return false;
    seen.add(id); perCustomer.set(o.customerId, n + 1);
    return true;
  });
}

/** Έκδοση: γράφει τους κωδικούς και (αν επιτρέπεται) στέλνει email. Επιστρέφει πόσοι ανά κανόνα. */
export async function issuePersonalOffers(opts: { staffId?: string | null } = {}) {
  const cfg = await getPersonalConfig();
  const list = await personalCandidates(cfg);
  if (!list.length) return { issued: 0, emailed: 0, byKind: {} as Record<string, number> };
  const promos = new Map<PersonalKind, { id: string }>();
  for (const k of [...new Set(list.map((l) => l.kind))]) promos.set(k, await ensurePromotion(k, cfg.rules[k], opts.staffId ?? null));
  const allowed = cfg.sendEmail ? await marketingAllowed([...new Set(list.map((l) => l.customerId))]) : new Set<string>();
  let issued = 0, emailed = 0;
  const byKind: Record<string, number> = {};
  for (const c of list) {
    const r = cfg.rules[c.kind];
    const expiresAt = new Date(Date.now() + r.validDays * 86_400_000);
    let coupon = null;
    for (let i = 0; i < 5 && !coupon; i++) coupon = await db.coupon.create({ data: { code: randomCode("ME"), promotionId: promos.get(c.kind)!.id, kind: "unique", customerId: c.customerId, email: c.email.toLowerCase(), trigger: "personal", expiresAt, maxUses: 1, scope: c.scope as unknown as Prisma.InputJsonValue, reason: c.reason, personalKey: c.key } }).catch(() => null);
    if (!coupon) continue;
    issued++; byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
    if (allowed.has(c.customerId)) {
      const m = await renderTemplate("personal-offer", { firstName: c.firstName, code: coupon.code, value: `−${r.percent} %`, target: c.target, reason: c.reason, until: expiresAt.toLocaleDateString("el-GR", { day: "numeric", month: "long" }) }).catch(() => null);
      if (m) { await sendMail({ to: c.email, template: "personal-offer", meta: { couponId: coupon.id }, ...m }).catch(() => null); emailed++; }
    }
  }
  return { issued, emailed, byKind };
}

/** Οι προσωπικές προσφορές ενός πελάτη (για τον λογαριασμό του): σε ισχύ και αχρησιμοποίητες. */
export async function myOffers(customerId: string, email: string) {
  const now = new Date();
  const rows = await db.coupon.findMany({
    where: { kind: "unique", usedCount: 0, OR: [{ customerId }, { email: email.toLowerCase() }], AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }], promotion: { status: { in: ["active", "scheduled"] }, held: false } },
    orderBy: { createdAt: "desc" }, take: 30,
    include: { promotion: { select: { mechanism: true, reward: true, rules: true, termsText: true } } },
  });
  const targets = rows.flatMap((r) => ((r.scope as PromoTarget[] | null) ?? []));
  const [prods, cats] = await Promise.all([
    db.product.findMany({ where: { id: { in: targets.filter((t) => t.kind === "product").map((t) => t.refId) } }, select: { id: true, slug: true, title: true, price: true, media: { where: { hidden: false, kind: "image" }, orderBy: { sortNo: "asc" }, take: 1, select: { url: true } } } }),
    db.category.findMany({ where: { id: { in: targets.filter((t) => t.kind === "category").map((t) => t.refId) } }, select: { id: true, slug: true, name: true, parent: { select: { slug: true, parent: { select: { slug: true } } } } } }),
  ]);
  return rows.map((r) => {
    const t = ((r.scope as PromoTarget[] | null) ?? [])[0];
    const p = t?.kind === "product" ? prods.find((x) => x.id === t.refId) : null;
    const c = t?.kind === "category" ? cats.find((x) => x.id === t.refId) : null;
    const rw = r.promotion.reward as { percent?: number; amount?: number };
    return {
      code: r.code, reason: r.reason, expiresAt: r.expiresAt?.toISOString() ?? null, terms: r.promotion.termsText,
      value: r.promotion.mechanism === "coupon-percent" ? `−${rw.percent ?? 0} %` : `−${((rw.amount ?? 0) / 100).toLocaleString("el-GR")} €`,
      target: p ? { kind: "product" as const, title: p.title, href: `/proion/${p.slug}`, image: p.media[0]?.url ?? null, price: p.price } : c ? { kind: "category" as const, title: c.name, href: `/k/${[c.parent?.parent?.slug, c.parent?.slug, c.slug].filter(Boolean).join("/")}`, image: null, price: null } : null,
    };
  });
}
