/**
 * Δείγμα καμπάνιας «Black Friday 2026» για παρουσίαση: εικόνες στη βιβλιοθήκη, sticker, καμπάνια με προσφορές και κουπόνι,
 * landing page, banners σε όλες τις θέσεις, hero slides, ζώνες αρχικής και ζώνες πληροφοριακών σελίδων — όλα ζωντανά.
 * Ξανατρέχει με ασφάλεια: ό,τι υπάρχει ήδη (με τα ίδια ονόματα / ids «bf26-…») δεν ξαναφτιάχνεται.
 *
 *   npx tsx --conditions=react-server scripts/bf26-demo.ts           δημιουργία
 *   npx tsx --conditions=react-server scripts/bf26-demo.ts --remove  αφαίρεση (λήξη καμπάνιας, αρχείο banners, καθάρισμα ζωνών / hero)
 */
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ingest } from "@/lib/media/repo";
import { saveCampaign, publishCampaign, setCampaignState } from "@/lib/promo/campaigns";
import { emptyDraft, savePromotion } from "@/lib/promo/admin";
import { recomputeOffers } from "@/lib/promo/offers";
import { STICKER_PRESETS } from "@/lib/stickers/model";
import { normalizeBannerDesign, type BannerDesign } from "@/lib/promo/banner-design";
import { ensureBannerCutouts } from "@/lib/promo/banner-cutouts";
import { getHeroAdminDoc, saveHeroDraft, publishHero } from "@/lib/cms/hero-slides";
import { normalizeDoc, validateDoc, type HeroSlideDoc } from "@/lib/cms/hero-slides-model";
import { normalizeHomeDoc, TOP_ZONE, afterZone } from "@/lib/cms/home-sections";
import { INFO_PAGES } from "@/lib/cms/info-pages";
import type { BrandBlock } from "@/lib/cms/brand-store";

const SRC = "/Users/kozyris/Downloads/BLACKFRIDAY_EURONICS DIGITAL";
const TITLE = "Black Friday 2026";
const END = "2026-11-30";
const COUPON = "BF26";
const J = (x: unknown) => x as Prisma.InputJsonValue;

/** προϊόντα του δείγματος: id → έκπτωση % (όλα με απόθεμα στις 13/11/2026) */
const P = {
  lgTv55: "cmuawuep618nbd4r24jyqn25b", samsungTv43: "cmuawuep618nvd4r2as3kh7ir", lgQned55: "cmuawuep618o2d4r2bzqe6yda",
  morrisWasher: "cmuawu2vl0wmfd4r23nqehvo6", winstarFridge: "cmuawu6ox10dtd4r2u2nwgnbu", tekaHob: "cmuawtwqo0szxd4r2oh3qceta",
  winstarAc: "cmvb2glfx00zld4c4axce1iay", delonghiDehum: "cmuawssep08sod4r2sdrspsbp",
  rowentaStick: "cmuawu6ow10c6d4r2boya4t7e", tefalFry: "cmuawtwqm0stmd4r29e6d1h3g", braunIron: "cmuawu2vm0wovd4r23cb3tnxj", hooverVac: "cmuawu6ow10dad4r22cdorl5n",
};
const TIERS: { pct: number; ids: string[] }[] = [
  { pct: 10, ids: [P.winstarFridge, P.winstarAc, P.hooverVac] },
  { pct: 15, ids: [P.lgTv55, P.samsungTv43, P.morrisWasher, P.tekaHob, P.delonghiDehum, P.tefalFry, P.braunIron] },
  { pct: 20, ids: [P.lgQned55, P.rowentaStick] },
];
const ALL = TIERS.flatMap((t) => t.ids);

async function remove(staffId: string) {
  const c = await db.campaign.findFirst({ where: { title: TITLE } });
  if (c) { console.log("καμπάνια →", (await setCampaignState(c.id, "archive", staffId))); await db.adPlacement.updateMany({ where: { campaignId: c.id }, data: { status: "archived" } }); await db.landingPage.updateMany({ where: { campaignId: c.id }, data: { status: "archived" } }); }
  const strip = (blocks: unknown) => (Array.isArray(blocks) ? blocks.filter((b) => !String((b as { id?: string }).id).startsWith("bf26-")) : blocks);
  for (const d of await db.cmsDocument.findMany({ where: { collection: { in: ["page.zones", "home.layout"] } } })) {
    const fix = (j: Prisma.JsonValue | null) => (j && typeof j === "object" && !Array.isArray(j) ? { ...j, blocks: strip((j as { blocks?: unknown }).blocks) } : j);
    await db.cmsDocument.update({ where: { id: d.id }, data: { data: J(fix(d.data)), ...(d.published ? { published: J(fix(d.published)) } : {}) } });
  }
  const hero = await getHeroAdminDoc();
  await saveHeroDraft({ ...hero.draft, slides: hero.draft.slides.filter((s) => !s.id.startsWith("bf26-")) }, staffId);
  await publishHero(staffId);
  await recomputeOffers();
  console.log("αφαιρέθηκε");
}

async function main() {
  const staff = await db.staff.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!staff) throw new Error("Δεν βρέθηκε χρήστης προσωπικού.");
  const who = { id: staff.id, canApprove: true };
  if (process.argv.includes("--remove")) return remove(staff.id);

  // ---- 1. εικόνες: από το master 2500×2500 (σήμα πάνω αριστερά, προβολέας στο κέντρο) βγαίνουν σήμα με διαφάνεια και κενά φόντα
  const folder = (await db.mediaFolder.findFirst({ where: { name: TITLE, parentId: null } })) ?? (await db.mediaFolder.create({ data: { name: TITLE } }));
  const have = new Map((await db.mediaAsset.findMany({ where: { folderId: folder.id }, select: { filename: true, url: true } })).map((a) => [a.filename, a.url]));
  const up = async (filename: string, bytes: Buffer, mime: string, title: string) => have.get(filename) ?? (await ingest({ bytes, filename, mime, folderId: folder.id, createdBy: staff.id, keepFormat: true, title })).url;
  const master = readFileSync(`${SRC}/Posts 600x600/EURONICS_BF26_Post-600x600.jpg`);
  // σήμα: το σκούρο φόντο γίνεται διάφανο (alpha από τη φωτεινότητα) — δουλεύει πάνω σε σκούρα banners
  const crop = await sharp(master).extract({ left: 100, top: 120, width: 860, height: 540 }).resize({ width: 640 }).raw().toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(crop.info.width * crop.info.height * 4);
  for (let i = 0, o = 0; i < crop.data.length; i += 3, o += 4) { const [r, g, b] = [crop.data[i], crop.data[i + 1], crop.data[i + 2]]; rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = Math.min(255, Math.max(0, (Math.max(r, g, b) - 14) * 5)); }
  const logo = await up("bf26-logo.png", await sharp(rgba, { raw: { width: crop.info.width, height: crop.info.height, channels: 4 } }).png().toBuffer(), "image/png", "Black Friday 2026 · σήμα (διαφάνεια)");
  const bgWide = await up("bf26-bg-wide.jpg", await sharp(master).extract({ left: 300, top: 860, width: 2200, height: 620 }).resize({ width: 2000 }).jpeg({ quality: 82 }).toBuffer(), "image/jpeg", "Black Friday 2026 · κενό φόντο (φαρδύ)");
  const bgSquare = await up("bf26-bg-square.jpg", await sharp(master).extract({ left: 800, top: 800, width: 1700, height: 1700 }).resize({ width: 1200 }).jpeg({ quality: 82 }).toBuffer(), "image/jpeg", "Black Friday 2026 · κενό φόντο (τετράγωνο)");
  const keyVisual = await up("bf26-key-visual.jpg", await sharp(master).resize({ width: 1400 }).jpeg({ quality: 84 }).toBuffer(), "image/jpeg", "Black Friday 2026 · βασική εικόνα (σήμα + προβολέας)");
  for (const [f, t] of [["EURONICS_BF26_SiteHeader-1920x400.jpg", "Black Friday 2026 · teaser 1920×400"], ["EURONICS_BF26_SiteHeader-820x360.jpg", "Black Friday 2026 · teaser 820×360"]] as const) await up(f, readFileSync(`${SRC}/${f}`), "image/jpeg", t);
  console.log("εικόνες ✓", { logo, bgWide, bgSquare });

  // ---- 2. sticker στις κάρτες
  if (!(await db.sticker.findUnique({ where: { key: "black-friday" } }))) {
    const base = STICKER_PRESETS.find((p) => p.key === "discount")!.params;
    const params = { ...base, fill: "#05060f", color: "#ffffff", border: "#2f3bd6", borderWidth: 3, rotate: -6, animation: "none" as const, lines: [{ ...base.lines[0], text: "BLACK" }, { ...base.lines[1], text: "FRIDAY" }] };
    await db.sticker.create({ data: { key: "black-friday", name: "Black Friday", params: params as object, createdBy: staff.id, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="47" fill="#05060f" stroke="#2f3bd6" stroke-width="3"/><text x="50" y="47" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="17" fill="#fff">BLACK</text><text x="50" y="65" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="14" fill="#fff">FRIDAY</text></svg>` } });
  }

  // ---- 3. καμπάνια + προσφορές + κουπόνι
  let camp = await db.campaign.findFirst({ where: { title: TITLE } });
  if (!camp) {
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Athens" });
    const r = await saveCampaign({ title: TITLE, goal: "seasonal", brief: "Δείγμα για παρουσίαση: εκπτώσεις 10–20 % σε 12 προϊόντα, κουπόνι BF26, landing, banners σε όλες τις θέσεις, hero, ζώνες.", startsAt: today, endsAt: END, budgetEur: null }, who);
    if (!r.ok) throw new Error(r.errors.join(" "));
    camp = await db.campaign.findUniqueOrThrow({ where: { id: r.id } });
  }
  const promoId: Record<string, string> = {};
  const ensurePromo = async (name: string, make: () => ReturnType<typeof emptyDraft>) => {
    const ex = await db.promotion.findFirst({ where: { name, campaignId: camp!.id } });
    if (ex) return ex.id;
    const r = await savePromotion({ ...make(), name, campaignId: camp!.id }, who, "draft");
    if (!r.ok || !r.id) throw new Error(`${name}: ${(r.errors ?? []).join(" ")}`);
    return r.id;
  };
  const terms = `Ισχύει έως ${END.split("-").reverse().join("/")} ή μέχρι εξαντλήσεως των αποθεμάτων. Δεν συνδυάζεται με άλλες προσφορές τιμής.`;
  for (const t of TIERS) promoId[t.pct] = await ensurePromo(`Black Friday −${t.pct} %`, () => ({ ...emptyDraft("percent"), reward: { percent: t.pct }, tagLabel: `Black Friday −${t.pct}%`, stickerKey: "black-friday", termsText: terms, targets: t.ids.map((refId) => ({ kind: "product" as const, refId, exclude: false })) }));
  promoId.coupon = await ensurePromo("Black Friday · κουπόνι BF26", () => ({ ...emptyDraft("coupon-amount"), couponCode: COUPON, maxUses: 200, maxPerCustomer: 1, termsText: `−10 € σε αγορές από 99 €, μία φορά ανά πελάτη, έως ${END.split("-").reverse().join("/")}.` }));
  const main15 = promoId[15];

  // ---- 4. landing page
  const landing = (await db.landingPage.findUnique({ where: { slug: "black-friday" } })) ?? (await db.landingPage.create({ data: {
    slug: "black-friday", title: "Black Friday 2026", promotionId: main15, campaignId: camp.id, status: "published", createdById: staff.id,
    seoTitle: "Black Friday 2026 στην Euronics", seoDesc: "Εκπτώσεις έως 20 % σε τηλεοράσεις, λευκές συσκευές, κλιματισμό και μικροσυσκευές. Έως 30 Νοεμβρίου.",
    blocks: J([
      { id: "bf26-hero", type: "hero", props: { kicker: "Έως 30 Νοεμβρίου", title: "Black Friday στην Euronics", subtitle: "Εκπτώσεις έως 20 % σε επιλεγμένες συσκευές, με παράδοση και εγκατάσταση από το κατάστημα της γειτονιάς σου.", image: keyVisual, ctaLabel: "Δες τα προϊόντα", ctaHref: "#proionta", tone: "navy" } },
      { id: "bf26-count", type: "countdown", props: { label: "Οι προσφορές λήγουν σε" } },
      { id: "bf26-products", type: "products", props: { title: "Τα προϊόντα του Black Friday", source: "manual", ids: ALL, limit: 24, sort: "discount" } },
      { id: "bf26-coupon", type: "coupon", props: { code: COUPON, text: "−10 € επιπλέον σε αγορές από 99 €. Γράψε τον κωδικό στο καλάθι." } },
      { id: "bf26-faq", type: "faq", props: { title: "Συχνές ερωτήσεις", items: [{ q: "Μέχρι πότε ισχύουν οι τιμές;", a: "Έως 30 Νοεμβρίου 2026 ή μέχρι εξαντλήσεως των αποθεμάτων." }, { q: "Ισχύουν και στα καταστήματα;", a: "Οι τιμές του Black Friday ισχύουν στο e-shop. Ρώτησε το κατάστημά σου για τη διαθεσιμότητα." }, { q: "Μπορώ να πληρώσω με δόσεις;", a: "Ναι, με τους ίδιους τρόπους πληρωμής που ισχύουν πάντα." }] } },
      { id: "bf26-terms", type: "terms", props: { title: "Όροι προσφοράς" } },
    ]) } }));
  const href = `/prosfores/${landing.slug}`;

  // ---- 5. δημοσίευση καμπάνιας (προσφορές ζωντανές) και υπολογισμός τιμών
  if (["draft", "approved", "rejected"].includes(camp.status)) {
    const pub = await publishCampaign(camp.id, who);
    console.log("δημοσίευση καμπάνιας:", JSON.stringify(pub));
    if (pub.rejected || pub.errors.length) throw new Error("Η δημοσίευση δεν ολοκληρώθηκε.");
  }
  console.log("τιμές:", JSON.stringify(await recomputeOffers()));

  // ---- 6. banners σε όλες τις θέσεις (σχεδιασμένα: κενό φόντο καμπάνιας + προβολέας + σήμα + προϊόντα με την τιμή τους)
  const design = (o: { title: string; kicker?: string; body?: string; cta?: string; square?: boolean; ids?: string[]; max?: number; fromPromo?: boolean; bullets?: string[] }): BannerDesign => normalizeBannerDesign({
    bg: { color: "#05060f", image: o.square ? bgSquare : bgWide, video: null, anim: "spotlight" }, logo, ink: "light", accent: "#22e06b",
    kicker: o.kicker ?? "", title: o.title, body: o.body ?? "", cta: o.cta ?? "",
    products: { source: o.fromPromo ? "promotion" : o.ids?.length ? "manual" : "none", ids: o.ids ?? [], max: o.max ?? 2, priceLabel: "ΜΟΝΟ", showBrand: true, showEnergy: true, showWas: true, bullets: o.bullets ?? [] },
  })!;
  const ADS: { slot: string; name: string; d: BannerDesign }[] = [
    { slot: "home-strip", name: "BF26 · Αρχική", d: design({ kicker: "Έως 30 Νοεμβρίου", title: "Black Friday στην Euronics", body: "Εκπτώσεις έως 20 % σε επιλεγμένες συσκευές.", cta: "Δες όλες τις προσφορές", ids: [P.lgQned55, P.rowentaStick] }) },
    { slot: "offers-top", name: "BF26 · Σελίδα προσφορών", d: design({ title: "Οι τιμές του Black Friday ξεκίνησαν", body: "Τηλεοράσεις, λευκές συσκευές, κλιματισμός και μικροσυσκευές έως −20 %. Έως 30 Νοεμβρίου.", cta: "Δες τα προϊόντα" }) },
    { slot: "listing-top", name: "BF26 · Λίστες κατηγοριών", d: design({ kicker: "Black Friday", title: "Έως −20 % μέχρι 30 Νοεμβρίου", cta: "Όλες οι προσφορές", fromPromo: true, max: 3 }) },
    { slot: "pdp-below-buybox", name: "BF26 · Σελίδα προϊόντος", d: design({ kicker: "Black Friday", title: "Δες και αυτό", ids: [P.tefalFry], max: 1 }) },
    { slot: "cart-top", name: "BF26 · Καλάθι", d: design({ kicker: "Κωδικός BF26", title: "−10 € επιπλέον σε αγορές από 99 €", body: "Γράψε τον κωδικό BF26 στο πεδίο κουπονιού. Μία φορά ανά πελάτη, έως 30 Νοεμβρίου." }) },
    { slot: "info-top", name: "BF26 · Πληροφοριακές (πλάτος)", d: design({ kicker: "Έως 30 Νοεμβρίου", title: "Black Friday στην Euronics", cta: "Δες τις προσφορές", ids: [P.morrisWasher, P.samsungTv43] }) },
    { slot: "info-aside", name: "BF26 · Πληροφοριακές (στήλη)", d: design({ kicker: "Black Friday", title: "Προσφορά της εβδομάδας", cta: "Δες το", square: true, ids: [P.delonghiDehum], max: 1 }) },
  ];
  for (const a of ADS) if (!(await db.adPlacement.findFirst({ where: { title: a.name, campaignId: camp.id } }))) await db.adPlacement.create({ data: { slot: a.slot, title: a.name, alt: "Black Friday στην Euronics: εκπτώσεις έως 20 % έως 30 Νοεμβρίου", href, promotionId: main15, landingId: landing.id, campaignId: camp.id, status: "active", endsAt: camp.endsAt, priority: 10, design: a.d as unknown as Prisma.InputJsonValue, createdById: staff.id } });

  // φωτογραφίες προϊόντων χωρίς φόντο για τα banners (μία φορά ανά προϊόν)
  console.log("χωρίς φόντο:", JSON.stringify(await ensureBannerCutouts(ALL, staff.id)));

  // ---- 7. hero slides (μπροστά από τα υπάρχοντα)
  const hero = await getHeroAdminDoc();
  if (!hero.draft.slides.some((s) => s.id.startsWith("bf26-"))) {
    const slide = (id: string, o: Partial<HeroSlideDoc>): HeroSlideDoc => ({ id, active: true, from: null, to: END, permanent: false, kicker: "", title: [""], body: "", primary: { label: "Δες τις προσφορές", href }, secondary: { label: "Όλες οι προσφορές", href: "/prosfores" }, bullets: ["Δωρεάν μεταφορά", "Δόσεις χωρίς κάρτα", "Έως 30 Νοεμβρίου"], image: { url: keyVisual, alt: "Black Friday στην Euronics" }, imageMobile: null, video: null, productId: null, ...o });
    const doc = normalizeDoc({ ...hero.draft, slides: [
      slide("bf26-main", { kicker: "Black Friday 2026 · έως 30 Νοεμβρίου", title: ["Black Friday", "στην Euronics"], body: "Εκπτώσεις έως 20 % σε τηλεοράσεις, λευκές συσκευές, κλιματισμό και μικροσυσκευές.", productId: P.lgQned55 }),
      slide("bf26-home", { kicker: "Black Friday · σπίτι", title: ["Καθάρισμα", "χωρίς καλώδιο", "−20 %"], body: "Επαναφορτιζόμενη σκούπα Rowenta και μικροσυσκευές σε τιμές Black Friday.", productId: P.rowentaStick }),
      ...hero.draft.slides,
    ] });
    const issues = validateDoc(doc);
    if (Object.keys(issues).length) throw new Error(`hero: ${JSON.stringify(issues)}`);
    await saveHeroDraft(doc, staff.id);
    await publishHero(staff.id);
  }

  // εικόνες που άλλαξαν μετά την πρώτη εκτέλεση: landing hero και hero slides δείχνουν τη βασική εικόνα
  const lb = (landing.blocks as { id: string; props: Record<string, unknown> }[]).map((x) => (x.id === "bf26-hero" ? { ...x, props: { ...x.props, image: keyVisual } } : x));
  await db.landingPage.update({ where: { id: landing.id }, data: { blocks: J(lb) } });
  const h2 = await getHeroAdminDoc();
  if (h2.draft.slides.some((x) => x.id.startsWith("bf26-") && x.image.url !== keyVisual)) { await saveHeroDraft({ ...h2.draft, slides: h2.draft.slides.map((x) => (x.id.startsWith("bf26-") ? { ...x, image: { url: keyVisual, alt: "Black Friday στην Euronics" } } : x)) }, staff.id); await publishHero(staff.id); }

  // ---- 8. ζώνες: προστίθενται ΚΑΙ στο πρόχειρο ΚΑΙ στη δημοσιευμένη έκδοση χωριστά, ώστε να μη δημοσιευτούν άλλες εκκρεμείς αλλαγές του πρόχειρου
  const b = (id: string, zone: string, x: Record<string, unknown>) => ({ id: `bf26-${id}`, zone, ...x }) as unknown as BrandBlock;
  const merge = (cur: unknown, add: BrandBlock[]) => { const list = (Array.isArray(cur) ? cur : []) as BrandBlock[]; return [...list, ...add.filter((n) => !list.some((y) => y.id === n.id))]; };
  const promoBlock = (id: string, zone: string, limit: number) => b(id, zone, { type: "promo-products", promotionId: main15, promotionName: "Black Friday −15 %", title: "Black Friday: οι προσφορές", limit, countdown: true, cta: { label: "Όλες οι προσφορές", href } });
  const homeAdd = [
    b("home-count", afterZone("hero"), { type: "countdown", promotionId: main15, promotionName: "Black Friday −15 %", title: "Black Friday στην Euronics", body: "Εκπτώσεις έως 20 % έως 30 Νοεμβρίου.", cta: { label: "Δες τις προσφορές", href } }),
    // χωρίς λίστα προϊόντων εδώ: η ενότητα «Προσφορές» της αρχικής δείχνει ήδη τα ίδια προϊόντα (διπλές κάρτες)
    b("home-landing", afterZone("deals"), { type: "promo-landing", landingId: landing.id, landingTitle: landing.title }),
    b("home-coupon", afterZone("services"), { type: "coupon", code: COUPON, text: "−10 € επιπλέον σε αγορές από 99 €, έως 30 Νοεμβρίου." }),
  ];
  const homeWhere = { collection_key_locale: { collection: "home.layout", key: "home", locale: "el" } };
  const home = await db.cmsDocument.findUnique({ where: homeWhere });
  const withBlocks = (raw: unknown) => { const d = normalizeHomeDoc(raw); return J(normalizeHomeDoc({ ...d, blocks: merge(d.blocks, homeAdd) })); };
  if (home) await db.cmsDocument.update({ where: homeWhere, data: { data: withBlocks(home.data ?? home.published), published: withBlocks(home.published ?? home.data), publishedAt: new Date(), updatedBy: staff.id } });
  else await db.cmsDocument.create({ data: { collection: "home.layout", key: "home", locale: "el", data: withBlocks(null), published: withBlocks(null), publishedAt: new Date(), updatedBy: staff.id } });
  void TOP_ZONE;

  for (const p of INFO_PAGES) {
    const add = [
      b(`${p.key}-top`, "top", { type: "ad", mode: "slot", slot: "info-top" }),
      ...(p.zones.includes("aside") ? [b(`${p.key}-aside`, "aside", { type: "ad", mode: "slot", slot: "info-aside" })] : []),
      ...(p.zones.includes("after") ? [b(`${p.key}-after`, "after", { type: "coupon", code: COUPON, text: "−10 € επιπλέον σε αγορές από 99 €, έως 30 Νοεμβρίου." })] : []),
      promoBlock(`${p.key}-bottom`, "bottom", 4),
    ];
    const where = { collection_key_locale: { collection: "page.zones", key: p.key, locale: "el" } };
    const cur = await db.cmsDocument.findUnique({ where });
    const blocksOf = (j: Prisma.JsonValue | null | undefined) => (j && typeof j === "object" && !Array.isArray(j) ? (j as { blocks?: unknown }).blocks : null);
    // στο πρόχειρο: αν υπάρχει ήδη «Διαφήμιση» στην ίδια θέση, δεν μπαίνει δεύτερη
    const draftNow = (blocksOf(cur?.data) ?? []) as BrandBlock[];
    const draftAdd = add.filter((n) => !(n.type === "ad" && draftNow.some((y) => y.type === "ad" && y.zone === n.zone)));
    const data = J({ blocks: merge(draftNow, draftAdd) }), published = J({ blocks: merge(blocksOf(cur?.published), add) });
    if (cur) await db.cmsDocument.update({ where, data: { data, published, publishedAt: new Date(), updatedBy: staff.id } });
    else await db.cmsDocument.create({ data: { collection: "page.zones", key: p.key, locale: "el", data, published, publishedAt: new Date(), updatedBy: staff.id } });
  }

  // ---- αναφορά
  const offers = await db.productOffer.findMany({ where: { productId: { in: ALL } }, select: { productId: true, price: true, listPrice: true, product: { select: { title: true, brand: { select: { name: true } } } } } });
  console.log(`\nΚαμπάνια ${camp.code} · ${href}`);
  for (const o of offers) console.log(`  ${o.product.brand.name} ${o.product.title.slice(0, 46)} · ${Number(o.listPrice)} → ${Number(o.price)} €`);
  console.log(`  ${offers.length}/${ALL.length} προϊόντα με τιμή προσφοράς · ${await db.adPlacement.count({ where: { campaignId: camp.id, status: "active" } })} banners`);
}

main().then(() => process.exit(0)).catch((e) => { console.error("ΑΠΟΤΥΧΙΑ:", e); process.exit(1); });
