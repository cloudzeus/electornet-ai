"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission, hasPermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { analyzeDraft, approvePromotion, bulkPromotions, refreshStorefront, savePromotion, type BulkAction, type DraftAnalysis, type PromoDraft, type SaveIntent, type SaveResult } from "@/lib/promo/admin";
import { savePromoPolicy, type PromoPolicy } from "@/lib/promo/policy";

const PERM = "catalog.promos.write";

export async function analyzeAction(d: PromoDraft): Promise<DraftAnalysis> {
  await requirePermission(PERM);
  return analyzeDraft(d);
}

export async function saveAction(d: PromoDraft, intent: SaveIntent): Promise<SaveResult> {
  const user = await requirePermission(PERM);
  const before = d.id ? await db.promotion.findUnique({ where: { id: d.id }, include: { targets: true } }) : null;
  const r = await savePromotion(d, { id: user.id, canApprove: hasPermission(user, "catalog.promos.approve") }, intent);
  if (r.ok) {
    await audit(user.id, d.id ? (intent === "publish" ? "promo.publish" : "promo.update") : intent === "publish" ? "promo.create+publish" : "promo.create", "Promotion", r.id, before, { ...d, status: r.status });
    revalidatePath("/admin/prosfores");
  }
  return r;
}

export async function approveAction(id: string) {
  const user = await requirePermission("catalog.promos.approve");
  const r = await approvePromotion(id, user.id);
  if (r.ok) { await audit(user.id, "promo.approve", "Promotion", id, null, { status: r.status }); revalidatePath("/admin/prosfores"); }
  return r;
}

export async function bulkAction(ids: string[], action: BulkAction) {
  const user = await requirePermission(action === "reject" ? "catalog.promos.approve" : PERM);
  const changed = await bulkPromotions(ids, action, user.id);
  await audit(user.id, `promo.bulk.${action}`, "Promotion", null, null, { ids, changed });
  revalidatePath("/admin/prosfores");
  return { changed };
}

/** Αναζήτηση στόχων για τον οδηγό: προϊόντα (τίτλος, κωδικός, EAN), μάρκες, κατηγορίες. */
export async function searchTargetsAction(kind: "product" | "brand" | "category", q: string) {
  await requirePermission(PERM);
  const s = q.trim();
  if (kind === "product") {
    if (s.length < 2) return [];
    const rows = await db.product.findMany({ where: { active: true, OR: [{ title: { contains: s, mode: "insensitive" } }, { sku: { contains: s, mode: "insensitive" } }, { ean: s }, { erpCode: s }] }, take: 20, orderBy: { title: "asc" }, select: { id: true, title: true, sku: true, price: true, brand: { select: { name: true } } } });
    return rows.map((r) => ({ id: r.id, label: r.title, sub: `${r.brand.name} · ${r.sku}${r.price ? ` · ${r.price.toLocaleString("el-GR")} €` : ""}` }));
  }
  if (kind === "brand") {
    const rows = await db.brand.findMany({ where: s ? { name: { contains: s, mode: "insensitive" } } : {}, take: 30, orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { products: true } } } });
    return rows.map((r) => ({ id: r.id, label: r.name, sub: `${r._count.products.toLocaleString("el-GR")} προϊόντα` }));
  }
  const rows = await db.category.findMany({ where: { active: true, ...(s ? { name: { contains: s, mode: "insensitive" } } : { depth: { lte: 1 } }) }, take: 40, orderBy: [{ depth: "asc" }, { sortNo: "asc" }], select: { id: true, name: true, depth: true, parent: { select: { name: true } } } });
  return rows.map((r) => ({ id: r.id, label: r.name, sub: r.parent ? `στο ${r.parent.name}` : "κύρια κατηγορία" }));
}

/** Όλες οι κύριες κατηγορίες — για «όλο το κατάστημα». */
export async function rootCategoriesAction() {
  await requirePermission(PERM);
  return db.category.findMany({ where: { depth: 0, active: true }, select: { id: true, name: true } });
}

export async function savePolicyAction(p: PromoPolicy) {
  const user = await requirePermission(PERM);
  const before = await db.setting.findUnique({ where: { section: "promos" } });
  const saved = await savePromoPolicy(p, user.id);
  refreshStorefront();
  await audit(user.id, "promo.policy", "Setting", "promos", before?.data ?? null, saved);
  revalidatePath("/admin/prosfores/kanones");
  return saved;
}

export interface SimInput {
  items: { productId: string; qty: number }[];
  coupon: string | null;
  customer: "guest" | "new" | "registered";
  zip: string | null; payment: string | null; delivery: "courier" | "click-collect" | "appointment";
  at: string | null;
  /** και μη δημοσιευμένες (πρόχειρες, σε αναμονή έγκρισης, σε παύση) */
  drafts: boolean;
  /** ο πελάτης θεωρείται μέλος αυτών των κοινών */
  segments?: string[];
}

/** Προσομοιωτής: το ίδιο καλάθι με την ίδια μηχανή, σε όποια ημερομηνία και για όποιον πελάτη — με ίχνος. */
export async function simulateAction(input: SimInput) {
  await requirePermission(PERM);
  const { linesFor, promosWith, resolveCoupon } = await import("@/lib/promo/server");
  const { evaluate } = await import("@/lib/promo/engine");
  const { getPromoPolicy } = await import("@/lib/promo/policy");
  const now = input.at ? new Date(input.at) : new Date();
  const items = input.items.filter((i) => i.qty > 0).slice(0, 30).map((i, k) => ({ key: `l${k}`, productId: i.productId, qty: Math.min(99, Math.floor(i.qty)) }));
  const [{ lines, missing }, promos, policy] = await Promise.all([linesFor(items), promosWith(input.drafts ? ["active", "scheduled", "paused", "pending", "draft"] : ["active", "scheduled"]), getPromoPolicy()]);
  const coupon = await resolveCoupon(input.coupon, {});
  // σε προσομοίωση οι μη δημοσιευμένες λογίζονται «ενεργές» ώστε να φανεί τι θα έκαναν
  const pool = promos.map((p) => (input.drafts && ["paused", "pending", "draft"].includes(p.status) ? { ...p, status: "active", name: `${p.name} (${p.status === "draft" ? "πρόχειρη" : p.status === "pending" ? "σε αναμονή" : "σε παύση"})` } : p));
  const r = evaluate(lines, pool, {
    now, customer: { registered: input.customer !== "guest", isNew: input.customer !== "registered", segments: input.customer === "guest" ? [] : input.segments ?? [] },
    channel: input.delivery === "click-collect" ? "click-collect" : "online", zip: input.zip, payment: input.payment, delivery: input.delivery,
    coupon: coupon && coupon.problem && coupon.problem.includes("προσωπικός") ? { ...coupon, problem: undefined } : coupon, maxLinePct: policy.maxLinePct, costFloor: policy.belowCost === "block",
  });
  const giftIds = r.gifts.map((g) => g.productId);
  const giftTitles = new Map((giftIds.length ? await db.product.findMany({ where: { id: { in: giftIds } }, select: { id: true, title: true } }) : []).map((g) => [g.id, g.title]));
  return {
    missing, at: now.toISOString(),
    lines: r.lines.map((l) => { const info = lines.find((x) => x.key === l.key)!; return { title: info.title, brand: info.brand, qty: l.qty, listTotal: l.listTotal, discPrice: l.discPrice, discCoupon: l.discCoupon, total: l.total, capped: l.capped ?? null, labels: l.adjustments.map((a) => `${a.label} (${a.code} v${a.version})`) }; }),
    listTotal: r.listTotal, discPrice: r.discPrice, discCoupon: r.discCoupon, discPayment: r.discPayment, total: r.total,
    couponApplied: r.couponApplied, couponMessage: r.couponMessage,
    gifts: r.gifts.map((g) => ({ label: g.label, title: giftTitles.get(g.productId) ?? g.productId, qty: g.qty })),
    services: r.services.map((s) => ({ label: s.label, slug: s.slug })), freeShipping: r.freeShipping?.label ?? null, hints: r.hints,
    trace: r.trace.map((t) => ({ name: t.name, code: t.code, applied: t.applied, amount: t.amount, reason: t.reason })),
  };
}
export type SimResult = Awaited<ReturnType<typeof simulateAction>>;

export async function couponBatchAction(input: { promotionId: string; count: number; prefix: string; validDays: number | null }) {
  const user = await requirePermission(PERM);
  const { createCouponBatch } = await import("@/lib/promo/issue");
  const r = await createCouponBatch({ ...input, staffId: user.id });
  revalidatePath("/admin/prosfores/kouponia");
  if (!r.ok) return r;
  const csv = ["code,promotion,expires", ...r.codes.map((c) => `${c},${r.promotion},${r.expiresAt ? r.expiresAt.toISOString().slice(0, 10) : ""}`)].join("\n");
  return { ok: true as const, count: r.codes.length, csv };
}

export async function issueCouponAction(input: { promotionCode: string; email: string; send: boolean }) {
  const user = await requirePermission(PERM);
  const { issueCoupon } = await import("@/lib/promo/issue");
  const r = await issueCoupon({ promotionCode: input.promotionCode, trigger: "manual", email: input.email, send: input.send, staffId: user.id });
  revalidatePath("/admin/prosfores/kouponia");
  return r.ok ? { ok: true as const, code: r.coupon.code, created: r.created } : { ok: false as const, error: r.reason };
}

/** Απενεργοποίηση κωδικού: λήγει τώρα (δεν σβήνεται — μένει στις αναφορές). */
export async function expireCouponAction(id: string) {
  const user = await requirePermission(PERM);
  const c = await db.coupon.update({ where: { id }, data: { expiresAt: new Date() } });
  await audit(user.id, "coupon.expire", "Coupon", id, null, { code: c.code });
  revalidatePath("/admin/prosfores/kouponia");
  return { ok: true };
}

export async function saveTagConfigAction(cfg: import("@/lib/promo/tags").TagConfig) {
  const user = await requirePermission(PERM);
  const { saveTagConfig, refreshInfoTags } = await import("@/lib/promo/tags");
  const saved = await saveTagConfig(cfg, user.id);
  const counts = await refreshInfoTags();
  await audit(user.id, "tags.config", "Setting", "promo-tags", null, saved);
  revalidatePath("/admin/prosfores/etiketes");
  return counts;
}

export async function setManualTagAction(slug: string, productIds: string[], on: boolean) {
  const user = await requirePermission(PERM);
  const { setManualTag } = await import("@/lib/promo/tags");
  await setManualTag(slug, productIds.slice(0, 500), on);
  await audit(user.id, on ? "tags.add" : "tags.remove", "Tag", slug, null, { productIds });
  revalidatePath("/admin/prosfores/etiketes");
  return { ok: true };
}

export interface PriceRow { input: string; price: number | null; productId: string | null; title: string | null; sku: string | null; list: number | null; pct: number | null; issue: string | null }

/** Excel / CSV / επικόλληση → προεπισκόπηση ειδικών τιμών (κωδικός ή EAN + τελική τιμή). Τίποτα δεν αποθηκεύεται εδώ. */
export async function previewPricesAction(form: FormData): Promise<{ ok: true; rows: PriceRow[]; maxLinePct: number } | { ok: false; error: string }> {
  await requirePermission(PERM);
  const { readXlsx, readDelimited } = await import("@/lib/xlsx-lite");
  const { getPromoPolicy } = await import("@/lib/promo/policy");
  const file = form.get("file");
  const paste = String(form.get("paste") ?? "");
  let table: string[][] = [];
  try {
    if (file instanceof File && file.size) {
      if (file.size > 8 * 1024 * 1024) return { ok: false, error: "Το αρχείο ξεπερνά τα 8 MB." };
      const buf = Buffer.from(await file.arrayBuffer());
      table = /\.xlsx$/i.test(file.name) ? readXlsx(buf) : readDelimited(buf.toString("utf8"));
    } else if (paste.trim()) table = readDelimited(paste);
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Δεν διαβάστηκε το αρχείο." }; }
  if (!table.length) return { ok: false, error: "Δεν βρέθηκαν γραμμές." };
  // στήλες: από την κεφαλίδα αν υπάρχει, αλλιώς 1η = κωδικός, 2η = τιμή
  const head = table[0].map((h) => h.toLocaleLowerCase("el-GR"));
  const hasHead = head.some((h) => /κωδ|sku|code|ean|barcode|τιμ|price/.test(h));
  const ci = hasHead ? Math.max(0, head.findIndex((h) => /κωδ|sku|code|ean|barcode/.test(h))) : 0;
  const pi = hasHead ? (head.findIndex((h) => /ειδικ|νέα|νεα|τελικ|προσφ|special|new|price|τιμ/.test(h) && head.indexOf(h) !== ci)) : 1;
  const body = (hasHead ? table.slice(1) : table).filter((r) => (r[ci] ?? "").trim()).slice(0, 5000);
  const codes = [...new Set(body.map((r) => r[ci].trim()))];
  const products = await db.product.findMany({ where: { OR: [{ sku: { in: codes } }, { ean: { in: codes } }, { erpCode: { in: codes } }] }, select: { id: true, title: true, sku: true, ean: true, erpCode: true, active: true, variants: { select: { price: true }, take: 1 } } });
  const find = (c: string) => products.find((p) => p.sku === c || p.ean === c || p.erpCode === c) ?? null;
  const policy = await getPromoPolicy();
  const seen = new Set<string>();
  const rows: PriceRow[] = body.map((r) => {
    const code = r[ci].trim();
    const raw = (r[pi < 0 ? 1 : pi] ?? "").replace(/[€\s]/g, "");
    const num = Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw);
    const price = Number.isFinite(num) && num > 0 ? Math.round(num * 100) : null;
    const p = find(code);
    const list = p?.variants[0] ? Math.round(Number(p.variants[0].price) * 100) : null;
    const pct = price != null && list ? Math.round(((list - price) / list) * 100) : null;
    let issue: string | null = null;
    if (!p) issue = "δεν βρέθηκε προϊόν";
    else if (!p.active) issue = "ανενεργό προϊόν";
    else if (price == null) issue = "μη έγκυρη τιμή";
    else if (!list) issue = "το προϊόν δεν έχει τιμή eshop";
    else if (price >= list) issue = "δεν είναι χαμηλότερη από την τρέχουσα";
    else if (pct! > policy.maxLinePct) issue = `έκπτωση ${pct} % — πάνω από το όριο ${policy.maxLinePct} % (θα κοπεί)`;
    if (p && seen.has(p.id)) issue = "διπλή γραμμή — κρατιέται η πρώτη";
    if (p) seen.add(p.id);
    return { input: code, price, productId: p?.id ?? null, title: p?.title ?? null, sku: p?.sku ?? null, list, pct, issue };
  });
  return { ok: true, rows, maxLinePct: policy.maxLinePct };
}

/** Από τις έγκυρες γραμμές της προεπισκόπησης → πρόχειρη προσφορά ειδικής τιμής, για έλεγχο και δημοσίευση στον οδηγό. */
export async function createSpecialPriceAction(input: { name: string; startsAt: string | null; endsAt: string | null; prices: Record<string, number> }) {
  const user = await requirePermission(PERM);
  const { emptyDraft } = await import("@/lib/promo/admin");
  const prices = Object.fromEntries(Object.entries(input.prices).filter(([, v]) => v > 0).slice(0, 5000));
  if (!Object.keys(prices).length) return { ok: false as const, error: "Καμία έγκυρη γραμμή." };
  const d = { ...emptyDraft("special"), name: input.name.trim() || `Ειδικές τιμές ${new Date().toLocaleDateString("el-GR")}`, startsAt: input.startsAt, endsAt: input.endsAt, reward: { price: prices } };
  const r = await savePromotion(d, { id: user.id, canApprove: hasPermission(user, "catalog.promos.approve") }, "draft");
  if (r.ok) await audit(user.id, "promo.import-excel", "Promotion", r.id, null, { count: Object.keys(prices).length });
  revalidatePath("/admin/prosfores");
  return r.ok ? { ok: true as const, id: r.id! } : { ok: false as const, error: (r.errors ?? []).join(" ") };
}

/** Ερμής: περιγραφή → προσχέδιο για τον οδηγό. Δεν αποθηκεύει τίποτα. */
export async function ermisDraftAction(text: string) {
  await requirePermission(PERM);
  const t = text.trim().slice(0, 600);
  if (t.length < 6) return { ok: false as const, error: "Γράψε τι προσφορά θέλεις, π.χ. «−20 % σε όλα τα πλυντήρια μέχρι 30/11»." };
  const { draftFromText } = await import("@/lib/promo/ermis");
  const { describePromo } = await import("@/lib/promo/catalog");
  const { targetNames } = await import("@/lib/promo/admin");
  const r = await draftFromText(t);
  const names = await targetNames(r.draft.targets);
  return {
    ok: true as const, via: r.via, notes: r.notes, name: r.draft.name,
    summary: describePromo(r.draft, { service: (await import("@/lib/data/fixtures/services")).services.find((x) => x.slug === r.draft.reward.serviceSlug)?.title.toLocaleLowerCase("el-GR") }),
    targets: r.draft.targets.map((x) => names[x.refId] ?? x.refId), startsAt: r.draft.startsAt, endsAt: r.draft.endsAt,
    encoded: Buffer.from(JSON.stringify(r.draft), "utf8").toString("base64url"),
  };
}

// ---- landing pages ----
export interface LandingInput { id?: string | null; slug: string; title: string; promotionId: string | null; status: "draft" | "published" | "archived"; startsAt: string | null; endsAt: string | null; seoTitle: string | null; seoDesc: string | null; blocks: import("@/lib/promo/landing-blocks").Block[] }

const slugify = (s: string) => s.toLocaleLowerCase("el-GR").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[α-ω]/g, (c) => ({ α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i", κ: "k", λ: "l", μ: "m", ν: "n", ξ: "x", ο: "o", π: "p", ρ: "r", σ: "s", ς: "s", τ: "t", υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o" })[c] ?? c)
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

export async function createLandingAction(input: { title: string; promotionId: string | null }) {
  const user = await requirePermission(PERM);
  const { newBlockId, BLOCKS } = await import("@/lib/promo/landing-blocks");
  const make = (type: string) => ({ id: newBlockId(), type, props: BLOCKS.find((b) => b.type === type)!.make() });
  let slug = slugify(input.title) || `prosfora-${Date.now().toString(36)}`;
  if (await db.landingPage.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  const hero = make("hero"); (hero.props as { title: string }).title = input.title;
  const page = await db.landingPage.create({ data: { slug, title: input.title.trim() || "Νέα σελίδα προσφοράς", promotionId: input.promotionId, createdById: user.id, blocks: [hero, make("countdown"), make("products"), make("terms")] as unknown as Prisma.InputJsonValue } });
  await audit(user.id, "landing.create", "LandingPage", page.id, null, { slug });
  return { id: page.id };
}

export async function saveLandingAction(input: LandingInput) {
  const user = await requirePermission(PERM);
  const slug = slugify(input.slug || input.title);
  if (!slug) return { ok: false as const, error: "Δώσε διεύθυνση (slug)." };
  const clash = await db.landingPage.findUnique({ where: { slug } });
  if (clash && clash.id !== input.id) return { ok: false as const, error: `Η διεύθυνση /prosfores/${slug} χρησιμοποιείται ήδη.` };
  const data = { slug, title: input.title.trim().slice(0, 160) || slug, promotionId: input.promotionId || null, status: input.status, startsAt: input.startsAt ? new Date(input.startsAt) : null, endsAt: input.endsAt ? new Date(input.endsAt) : null, seoTitle: input.seoTitle?.trim() || null, seoDesc: input.seoDesc?.trim() || null, blocks: input.blocks.slice(0, 40) as unknown as Prisma.InputJsonValue };
  const before = input.id ? await db.landingPage.findUnique({ where: { id: input.id } }) : null;
  const page = input.id ? await db.landingPage.update({ where: { id: input.id }, data }) : await db.landingPage.create({ data: { ...data, createdById: user.id } });
  await audit(user.id, input.id ? "landing.update" : "landing.create", "LandingPage", page.id, before, data);
  revalidatePath("/admin/prosfores/selides");
  revalidatePath(`/prosfores/${slug}`);
  return { ok: true as const, id: page.id, slug };
}

// ---- διαφημιστικές θέσεις ----
export interface PlacementInput { id?: string | null; slot: string; title: string; image: string | null; imageMobile: string | null; alt: string | null; href: string | null; promotionId: string | null; landingId: string | null; status: "draft" | "active" | "paused" | "archived"; startsAt: string | null; endsAt: string | null; priority: number; categories: string[] }

export async function savePlacementAction(input: PlacementInput) {
  const user = await requirePermission(PERM);
  const { SLOTS } = await import("@/lib/promo/landing-blocks");
  if (!SLOTS.some((s) => s.key === input.slot)) return { ok: false as const, error: "Άγνωστη θέση." };
  if (input.status === "active" && !input.image) return { ok: false as const, error: "Χρειάζεται εικόνα για να ενεργοποιηθεί." };
  let href = input.href?.trim() || null;
  if (!href && input.landingId) href = `/prosfores/${(await db.landingPage.findUnique({ where: { id: input.landingId }, select: { slug: true } }))?.slug ?? ""}`;
  if (href && !/^\/(?!\/)/.test(href) && !/^https:\/\//.test(href)) return { ok: false as const, error: "Ο σύνδεσμος ξεκινά με / (εσωτερικός) ή https://." };
  const data = { slot: input.slot, title: input.title.trim().slice(0, 120) || "Banner", image: input.image?.trim() || null, imageMobile: input.imageMobile?.trim() || null, alt: input.alt?.trim() || null, href, promotionId: input.promotionId || null, landingId: input.landingId || null, status: input.status, startsAt: input.startsAt ? new Date(input.startsAt) : null, endsAt: input.endsAt ? new Date(input.endsAt) : null, priority: Math.max(0, Math.min(999, Math.round(input.priority || 100))), audience: input.categories.length ? { categories: input.categories } : Prisma.JsonNull };
  const before = input.id ? await db.adPlacement.findUnique({ where: { id: input.id } }) : null;
  const row = input.id ? await db.adPlacement.update({ where: { id: input.id }, data }) : await db.adPlacement.create({ data: { ...data, createdById: user.id } });
  await audit(user.id, input.id ? "ad.update" : "ad.create", "AdPlacement", row.id, before, data);
  const { invalidateAds } = await import("@/lib/promo/landing");
  invalidateAds();
  revalidatePath("/admin/prosfores/theseis");
  return { ok: true as const, id: row.id };
}

// ---- κοινά πελατών ----
export interface SegmentInput { id?: string | null; name: string; description: string | null; rules: import("@/lib/promo/segments").SegmentRules }

export async function previewSegmentAction(rules: import("@/lib/promo/segments").SegmentRules) {
  await requirePermission(PERM);
  const { membersOf, sanitizeRules } = await import("@/lib/promo/segments");
  const members = await membersOf(sanitizeRules(rules));
  const { marketingAllowed } = await import("@/lib/promo/issue");
  const consent = await marketingAllowed(members.map((m) => m.id));
  return { count: members.length, consent: consent.size };
}

export async function saveSegmentAction(input: SegmentInput) {
  const user = await requirePermission(PERM);
  const { membersOf, sanitizeRules } = await import("@/lib/promo/segments");
  if (!input.name.trim()) return { ok: false as const, error: "Δώσε όνομα στο κοινό." };
  const rules = sanitizeRules(input.rules);
  const count = (await membersOf(rules)).length;
  const data = { name: input.name.trim().slice(0, 120), description: input.description?.trim() || null, rules: rules as Prisma.InputJsonValue, members: count, computedAt: new Date() };
  const before = input.id ? await db.segment.findUnique({ where: { id: input.id } }) : null;
  const row = input.id ? await db.segment.update({ where: { id: input.id }, data }) : await db.segment.create({ data: { ...data, createdById: user.id } });
  await audit(user.id, input.id ? "segment.update" : "segment.create", "Segment", row.id, before, data);
  revalidatePath("/admin/prosfores/koina");
  return { ok: true as const, id: row.id, count };
}

export async function archiveSegmentAction(id: string) {
  const user = await requirePermission(PERM);
  const used = await db.promotion.count({ where: { status: { in: ["active", "scheduled", "pending", "paused"] }, OR: [{ rules: { path: ["segments"], array_contains: [id] } }, { rules: { path: ["earlyAccess", "segments"], array_contains: [id] } }] } });
  if (used) return { ok: false as const, error: `Χρησιμοποιείται σε ${used} ενεργές προσφορές — άλλαξέ τες πρώτα.` };
  await db.segment.update({ where: { id }, data: { archived: true } });
  await audit(user.id, "segment.archive", "Segment", id);
  revalidatePath("/admin/prosfores/koina");
  return { ok: true as const };
}

export async function issueSegmentCouponsAction(input: { segmentId: string; promotionCode: string; send: boolean }) {
  const user = await requirePermission(PERM);
  const { issueToSegment } = await import("@/lib/promo/issue");
  const r = await issueToSegment({ ...input, staffId: user.id });
  revalidatePath("/admin/prosfores/kouponia");
  return r;
}

// ---- πλοήγηση καταλόγου για την επιλογή προϊόντων: κατηγορία → υποκατηγορία → μάρκες → προϊόντα ----
async function subtree(categoryId: string) {
  const ids = [categoryId];
  for (let level = [categoryId], g = 0; level.length && g < 4; g++) {
    level = (await db.category.findMany({ where: { parentId: { in: level } }, select: { id: true } })).map((c) => c.id);
    ids.push(...level);
  }
  return ids;
}

/** Οι υποκατηγορίες ενός κόμβου (ή οι κύριες) με το πλήθος ενεργών προϊόντων, και η διαδρομή ως εκεί. */
export async function browseCategoriesAction(parentId: string | null) {
  await requirePermission(PERM);
  const [children, path] = await Promise.all([
    db.category.findMany({ where: { parentId, active: true, productCount: { gt: 0 } }, orderBy: [{ sortNo: "asc" }, { name: "asc" }], select: { id: true, name: true, productCount: true, _count: { select: { children: true } } } }),
    (async () => { const out: { id: string; name: string }[] = []; for (let id = parentId, g = 0; id && g < 6; g++) { const c = await db.category.findUnique({ where: { id }, select: { id: true, name: true, parentId: true } }); if (!c) break; out.unshift({ id: c.id, name: c.name }); id = c.parentId; } return out; })(),
  ]);
  return { path, children: children.map((c) => ({ id: c.id, name: c.name, count: c.productCount, hasChildren: c._count.children > 0 })) };
}

/** Οι μάρκες που υπάρχουν σε μια κατηγορία (και στις υποκατηγορίες της), με πλήθος προϊόντων. */
export async function browseBrandsAction(categoryId: string) {
  await requirePermission(PERM);
  const cats = await subtree(categoryId);
  const rows = await db.product.groupBy({ by: ["brandId"], where: { active: true, categoryId: { in: cats } }, _count: { _all: true } });
  const brands = await db.brand.findMany({ where: { id: { in: rows.map((r) => r.brandId) } }, select: { id: true, name: true } });
  const name = new Map(brands.map((b) => [b.id, b.name]));
  return rows.map((r) => ({ id: r.brandId, name: name.get(r.brandId) ?? "—", count: r._count._all })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "el"));
}

/** Τα προϊόντα μιας κατηγορίας (και προαιρετικά μιας μάρκας). Έως 300 — με «q» αναζήτηση στον server όταν είναι περισσότερα. */
export async function browseProductsAction(input: { categoryId?: string | null; brandId?: string | null; q?: string }) {
  await requirePermission(PERM);
  const q = (input.q ?? "").trim();
  const where: Prisma.ProductWhereInput = {
    active: true,
    ...(input.categoryId ? { categoryId: { in: await subtree(input.categoryId) } } : {}),
    ...(input.brandId ? { brandId: input.brandId } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }, { ean: q }] } : {}),
  };
  if (!input.categoryId && !input.brandId && q.length < 2) return { total: 0, items: [] };
  const [total, rows] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({ where, orderBy: { title: "asc" }, take: 300, select: { id: true, title: true, sku: true, price: true, brand: { select: { name: true } }, media: { where: { hidden: false, kind: "image" }, orderBy: { sortNo: "asc" }, take: 1, select: { url: true } } } }),
  ]);
  return { total, items: rows.map((r) => ({ id: r.id, title: r.title, sku: r.sku, brand: r.brand.name, price: r.price ?? null, image: r.media[0]?.url ?? null })) };
}
