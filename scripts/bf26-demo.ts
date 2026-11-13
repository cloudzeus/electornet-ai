/**
 * Καμπάνια «Black Friday 2026» με όλα τα εργαλεία marketing του e-shop, ζωντανή:
 *  εικόνες στη βιβλιοθήκη · sticker στις κάρτες · καμπάνια με εκπτώσεις %, δωρεάν μεταφορικά και κουπόνι · landing page ·
 *  banners σε όλες τις θέσεις (προϊόντα χωρίς φόντο) · hero slides (όλα Black Friday) και «Προσφορά ημέρας» ανά ημέρα ·
 *  αρχική: ανακοίνωση, banner κορυφής, ticker, «Προσφορές», αντίστροφη μέτρηση, κάρτα landing, κουπόνι ·
 *  ζώνες όλων των πληροφοριακών σελίδων · τίτλος στο πλακίδιο δίπλα στο hero · πρόχειρο newsletter (ΔΕΝ στέλνεται).
 * Ξανατρέχει με ασφάλεια: ενημερώνει ό,τι υπάρχει (ids / ονόματα «bf26-…», «BF26 · …») αντί να το ξαναφτιάχνει.
 * Ό,τι αλλάζει σε υπάρχον περιεχόμενο (ticker, «Προσφορές», παλιά hero slides, κείμενα UI) κρατιέται στο CmsDocument
 * «bf26.demo» και επανέρχεται με --remove.
 *
 *   npx tsx --conditions=react-server scripts/bf26-demo.ts           δημιουργία / ενημέρωση
 *   npx tsx --conditions=react-server scripts/bf26-demo.ts --remove  αφαίρεση (αρχείο καμπάνιας, τιμές πίσω, καθάρισμα αρχικής / ζωνών / hero)
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
import { normalizeHomeDoc, TOP_ZONE, afterZone, type HomeDoc } from "@/lib/cms/home-sections";
import { INFO_PAGES } from "@/lib/cms/info-pages";
import { draftFromCampaign } from "@/lib/newsletter/draft";
import { contentHash } from "@/lib/newsletter/core";
import type { BrandBlock } from "@/lib/cms/brand-store";

const SRC = "/Users/kozyris/Downloads/BLACKFRIDAY_EURONICS DIGITAL";
const TITLE = "Black Friday 2026";
const END = "2026-11-30";
const COUPON = "BF26";
const J = (x: unknown) => x as Prisma.InputJsonValue;
const day = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Athens" });
const STATE = { collection_key_locale: { collection: "bf26.demo", key: "state", locale: "el" } };
const COPY_DOC = { collection_key_locale: { collection: "copy", key: "ui", locale: "el" } };
type Which = "data" | "published";
type State = { heroOff?: string[]; heroDeals?: string[]; home?: Record<Which, Record<string, unknown>>; copy?: Record<Which, Record<string, string | null>> };
const getState = async () => ((await db.cmsDocument.findUnique({ where: STATE }))?.data ?? {}) as State;
const setState = (s: State) => db.cmsDocument.upsert({ where: STATE, update: { data: J(s) }, create: { collection: "bf26.demo", key: "state", locale: "el", data: J(s) } });

/** προϊόντα της καμπάνιας: id → έκπτωση % (όλα με απόθεμα στις 13/11/2026) */
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
const SHOW = [P.lgQned55, P.rowentaStick, P.morrisWasher, P.samsungTv43, P.delonghiDehum, P.tefalFry, P.lgTv55, P.tekaHob, P.braunIron, P.winstarAc, P.winstarFridge, P.hooverVac];

// ---- λεκτικά: μία φωνή παντού — τι, πόσο, ως πότε. Κανένας ισχυρισμός που δεν ισχύει (τα ποσοστά είναι τα πραγματικά της καμπάνιας).
const UNTIL = "έως 30 Νοεμβρίου";
const T = {
  line: "Black Friday στην Euronics",
  sub: `Έως −20 % σε τηλεοράσεις, λευκές συσκευές, κλιματισμό και μικροσυσκευές, ${UNTIL}.`,
  coupon: `−10 € επιπλέον σε αγορές από 99 € με τον κωδικό ${COUPON}. Μία φορά ανά πελάτη, ${UNTIL}.`,
  terms: "Ισχύει έως 30/11/2026 ή μέχρι να εξαντληθούν τα αποθέματα. Δεν συνδυάζεται με άλλες προσφορές τιμής.",
  ticker: ["Black Friday έως 30 Νοεμβρίου", "Έως −20 % σε επιλεγμένες συσκευές", `−10 € επιπλέον με τον κωδικό ${COUPON} από 99 €`, "Δωρεάν μεταφορικά στα προϊόντα Black Friday", "Δόσεις χωρίς κάρτα έως 24 μήνες"],
};
/** κείμενα UI που γυρίζουν στο Black Friday: το πλακίδιο δίπλα στο hero */
const COPY: Record<string, Record<string, string>> = { dealTile: { prosfora_imeras: "Black Friday · προσφορά ημέρας" } };

/**
 * Hero: ΜΟΝΟ slides Black Friday, σε εκδοχές (γενικό + ένα ανά κατηγορία, με το προϊόν χωρίς φόντο) και «Προσφορά ημέρας»
 * για κάθε ημέρα της καμπάνιας. Τα υπόλοιπα slides δεν σβήνονται: γίνονται ανενεργά και ξαναγίνονται ενεργά στο --remove.
 */
async function heroSlides(staffId: string, image: string, href: string) {
  const hero = await getHeroAdminDoc();
  const st = await getState();
  const others = hero.draft.slides.filter((x) => !x.id.startsWith("bf26-"));
  const heroOff = [...new Set([...(st.heroOff ?? []), ...others.filter((x) => x.active).map((x) => x.id)])];
  const slide = (id: string, cat: string | null, catLabel: string, o: Partial<HeroSlideDoc>): HeroSlideDoc => ({
    id: `bf26-${id}`, active: true, from: null, to: END, permanent: false, kicker: "", title: [""], body: "",
    primary: { label: "Δες τις προσφορές", href }, secondary: { label: catLabel, href: cat ? `/k/${cat}` : "/prosfores" },
    bullets: ["Δωρεάν μεταφορικά", "Δόσεις χωρίς κάρτα", "Έως 30 Νοεμβρίου"], image: { url: image, alt: T.line }, imageMobile: null, video: null, productId: null, ...o,
  });
  const days: string[] = [];
  for (let d = new Date(); day(d) <= END; d = new Date(d.getTime() + 86_400_000)) days.push(day(d));
  const doc = normalizeDoc({ ...hero.draft,
    deals: [...(hero.draft.deals ?? []).filter((x) => !days.includes(x.day)), ...days.map((dd, i) => ({ day: dd, productId: SHOW[i % SHOW.length] }))],
    slides: [
      slide("main", null, "Όλες οι προσφορές", { kicker: "Black Friday 2026 · έως 30 Νοεμβρίου", title: ["Black Friday", "στην Euronics"], body: T.sub }),
      slide("tv", "eikona-kai-ichos", "Όλες οι τηλεοράσεις", { kicker: "Black Friday · τηλεοράσεις", title: ["Η τηλεόραση", "που περίμενες", "−20 %"], body: "LG QNED 55 ιντσών στο −20 % και Mini LED Samsung στο −15 %.", productId: P.lgQned55 }),
      slide("white", "leykes-syskeyes", "Όλες οι λευκές συσκευές", { kicker: "Black Friday · λευκές συσκευές", title: ["Πλυντήριο 9 κιλών", "−15 %"], body: "Πλυντήριο, ψυγείο και εστίες σε τιμές Black Friday, με παράδοση από το κατάστημα της γειτονιάς σου.", productId: P.morrisWasher }),
      slide("clima", "klimatismos-thermansi", "Κλιματισμός και θέρμανση", { kicker: "Black Friday · χειμώνας", title: ["Σπίτι ζεστό,", "χωρίς υγρασία"], body: "Αφυγραντήρας De'Longhi στο −15 % και κλιματιστικό inverter στο −10 %.", productId: P.delonghiDehum }),
      slide("home", "oikiakos-exoplismos", "Όλες οι μικροσυσκευές", { kicker: "Black Friday · σπίτι", title: ["Καθάρισμα", "χωρίς καλώδιο", "−20 %"], body: "Επαναφορτιζόμενη σκούπα Rowenta στο −20 %, φριτέζα αέρος και σύστημα σιδερώματος στο −15 %.", productId: P.rowentaStick }),
      ...others.map((x) => ({ ...x, active: false })),
    ] });
  const issues = validateDoc(doc);
  if (Object.keys(issues).length) throw new Error(`hero: ${JSON.stringify(issues)}`);
  await saveHeroDraft(doc, staffId);
  await publishHero(staffId);
  await setState({ ...st, heroOff, heroDeals: [...new Set([...(st.heroDeals ?? []), ...days])] });
  console.log(`hero ✓ ${doc.slides.filter((x) => x.active).length} slides · προσφορά ημέρας για ${days.length} ημέρες · ${heroOff.length} παλιά slides ανενεργά`);
}

async function remove(staffId: string) {
  const st = await getState();
  for (const c of await db.campaign.findMany({ where: { title: TITLE, status: { notIn: ["archived"] } } })) {
    console.log("καμπάνια", c.code, "→", await setCampaignState(c.id, "archive", staffId));
    await db.adPlacement.updateMany({ where: { campaignId: c.id }, data: { status: "archived" } });
    await db.landingPage.updateMany({ where: { campaignId: c.id }, data: { status: "archived" } });
    await db.newsletter.deleteMany({ where: { campaignId: c.id, status: "draft" } });
  }
  const strip = (blocks: unknown) => (Array.isArray(blocks) ? blocks.filter((b) => !String((b as { id?: string }).id).startsWith("bf26-")) : blocks);
  for (const d of await db.cmsDocument.findMany({ where: { collection: { in: ["page.zones", "home.layout"] } } })) {
    const fix = (j: Prisma.JsonValue | null, which: Which) => {
      if (!j || typeof j !== "object" || Array.isArray(j)) return j;
      const o = j as { blocks?: unknown; sections?: { id: string; props?: unknown }[] };
      const saved = d.collection === "home.layout" && d.key === "home" ? st.home?.[which] : undefined;
      // ticker / «Προσφορές» της αρχικής: πίσω στις ρυθμίσεις που είχαν πριν την καμπάνια
      const sections = saved && Array.isArray(o.sections) ? o.sections.map((s) => (s.id in saved ? { id: s.id, ...(saved[s.id] ? { props: saved[s.id] } : {}) } : s)) : o.sections;
      return { ...o, blocks: strip(o.blocks), ...(sections ? { sections } : {}) };
    };
    await db.cmsDocument.update({ where: { id: d.id }, data: { data: J(fix(d.data, "data")), ...(d.published ? { published: J(fix(d.published, "published")) } : {}) } });
  }
  // κείμενα UI: πίσω στις τιμές που είχαν (null = δεν υπήρχε αλλαγή → φεύγει το κλειδί)
  const cp = await db.cmsDocument.findUnique({ where: COPY_DOC });
  if (cp && st.copy) {
    const back = (j: Prisma.JsonValue | null, which: Which) => { const o = structuredClone((j ?? {}) as Record<string, Record<string, string>>); for (const [k, v] of Object.entries(st.copy![which] ?? {})) { const [ns, key] = k.split("."); if (v == null) delete o[ns]?.[key]; else (o[ns] ??= {})[key] = v; } return J(o); };
    await db.cmsDocument.update({ where: COPY_DOC, data: { data: back(cp.data, "data"), ...(cp.published ? { published: back(cp.published, "published") } : {}) } });
  }
  const hero = await getHeroAdminDoc();
  await saveHeroDraft({ ...hero.draft, deals: (hero.draft.deals ?? []).filter((x) => !(st.heroDeals ?? []).includes(x.day)), slides: hero.draft.slides.filter((s) => !s.id.startsWith("bf26-")).map((s) => ((st.heroOff ?? []).includes(s.id) ? { ...s, active: true } : s)) }, staffId);
  await publishHero(staffId);
  await db.cmsDocument.deleteMany({ where: { collection: "bf26.demo" } });
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
  const up = async (filename: string, make: () => Promise<Buffer> | Buffer, mime: string, title: string) => have.get(filename) ?? (await ingest({ bytes: await make(), filename, mime, folderId: folder.id, createdBy: staff.id, keepFormat: true, title })).url;
  const master = () => readFileSync(`${SRC}/Posts 600x600/EURONICS_BF26_Post-600x600.jpg`);
  const logo = await up("bf26-logo-2.png", async () => {
    // σήμα: το σκούρο φόντο γίνεται διάφανο (alpha από τη φωτεινότητα) και οι άκρες σβήνουν ομαλά, ώστε να μη φαίνεται πλαίσιο γύρω του
    const crop = await sharp(master()).extract({ left: 40, top: 80, width: 1000, height: 660 }).resize({ width: 720 }).raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = crop.info, F = 48;
    const rgba = Buffer.alloc(w * h * 4);
    for (let y = 0, i = 0, o = 0; y < h; y++) for (let x = 0; x < w; x++, i += 3, o += 4) {
      const [r, g, b] = [crop.data[i], crop.data[i + 1], crop.data[i + 2]];
      const edge = Math.min(1, Math.min(x, y, w - 1 - x, h - 1 - y) / F);
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = Math.round(Math.min(255, Math.max(0, (Math.max(r, g, b) - 14) * 5)) * edge);
    }
    return sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  }, "image/png", "Black Friday 2026 · σήμα (διαφάνεια)");
  const bgWide = await up("bf26-bg-wide.jpg", () => sharp(master()).extract({ left: 300, top: 860, width: 2200, height: 620 }).resize({ width: 2000 }).jpeg({ quality: 82 }).toBuffer(), "image/jpeg", "Black Friday 2026 · κενό φόντο (φαρδύ)");
  const bgSquare = await up("bf26-bg-square.jpg", () => sharp(master()).extract({ left: 800, top: 800, width: 1700, height: 1700 }).resize({ width: 1200 }).jpeg({ quality: 82 }).toBuffer(), "image/jpeg", "Black Friday 2026 · κενό φόντο (τετράγωνο)");
  const keyVisual = await up("bf26-key-visual.jpg", () => sharp(master()).resize({ width: 1400 }).jpeg({ quality: 84 }).toBuffer(), "image/jpeg", "Black Friday 2026 · βασική εικόνα (σήμα + προβολέας)");
  for (const [f, t] of [["EURONICS_BF26_SiteHeader-1920x400.jpg", "Black Friday 2026 · teaser 1920×400"], ["EURONICS_BF26_SiteHeader-820x360.jpg", "Black Friday 2026 · teaser 820×360"]] as const) await up(f, () => readFileSync(`${SRC}/${f}`), "image/jpeg", t);

  // ---- 2. sticker στις κάρτες
  if (!(await db.sticker.findUnique({ where: { key: "black-friday" } }))) {
    const base = STICKER_PRESETS.find((p) => p.key === "discount")!.params;
    const params = { ...base, fill: "#05060f", color: "#ffffff", border: "#2f3bd6", borderWidth: 3, rotate: -6, animation: "none" as const, lines: [{ ...base.lines[0], text: "BLACK" }, { ...base.lines[1], text: "FRIDAY" }] };
    await db.sticker.create({ data: { key: "black-friday", name: "Black Friday", params: params as object, createdBy: staff.id, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="47" fill="#05060f" stroke="#2f3bd6" stroke-width="3"/><text x="50" y="47" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="17" fill="#fff">BLACK</text><text x="50" y="65" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="14" fill="#fff">FRIDAY</text></svg>` } });
  }

  // ---- 3. καμπάνια + προσφορές (εκπτώσεις %, δωρεάν μεταφορικά, κουπόνι)
  let camp = await db.campaign.findFirst({ where: { title: TITLE, status: { notIn: ["archived", "ended"] } } });
  // ο κωδικός μιας παλιάς (αφαιρεμένης) εκτέλεσης ελευθερώνεται
  await db.coupon.updateMany({ where: { code: COUPON, promotion: { status: { in: ["ended", "archived"] } } }, data: { code: `${COUPON}-OLD-${Date.now()}` } });
  if (!camp) {
    const r = await saveCampaign({ title: TITLE, goal: "seasonal", brief: "Εκπτώσεις 10–20 % σε 12 προϊόντα, δωρεάν μεταφορικά, κουπόνι BF26, landing, banners σε όλες τις θέσεις, hero, αρχική, ζώνες σελίδων, newsletter.", startsAt: day(new Date()), endsAt: END, budgetEur: null }, who);
    if (!r.ok) throw new Error(r.errors.join(" "));
    camp = await db.campaign.findUniqueOrThrow({ where: { id: r.id } });
  }
  const livePub = ["scheduled", "live", "paused"].includes(camp.status);
  const ensurePromo = async (name: string, make: () => ReturnType<typeof emptyDraft>) => {
    const ex = await db.promotion.findFirst({ where: { name, campaignId: camp!.id } });
    if (ex) return ex.id;
    // σε ήδη δημοσιευμένη καμπάνια η νέα προσφορά δημοσιεύεται αμέσως (παίρνει τις ημερομηνίες της)
    const r = await savePromotion({ ...make(), name, campaignId: camp!.id }, who, livePub ? "publish" : "draft");
    if (!r.ok || !r.id) throw new Error(`${name}: ${(r.errors ?? []).join(" ")}`);
    return r.id;
  };
  const targets = (ids: string[]) => ids.map((refId) => ({ kind: "product" as const, refId, exclude: false }));
  const promoId: Record<string, string> = {};
  for (const t of TIERS) promoId[t.pct] = await ensurePromo(`Black Friday −${t.pct} %`, () => ({ ...emptyDraft("percent"), reward: { percent: t.pct }, tagLabel: `Black Friday −${t.pct}%`, stickerKey: "black-friday", termsText: T.terms, targets: targets(t.ids) }));
  promoId.coupon = await ensurePromo("Black Friday · κουπόνι BF26", () => ({ ...emptyDraft("coupon-amount"), couponCode: COUPON, maxUses: 200, maxPerCustomer: 1, termsText: T.coupon }));
  promoId.shipping = await ensurePromo("Black Friday · δωρεάν μεταφορικά", () => ({ ...emptyDraft("shipping"), tagLabel: "Δωρεάν μεταφορικά", termsText: `Δωρεάν μεταφορικά στα προϊόντα Black Friday, ${UNTIL}.`, targets: targets(ALL) }));
  const main15 = promoId[15];

  // ---- 4. landing page
  const blocks = J([
    { id: "bf26-hero", type: "hero", props: { kicker: "Έως 30 Νοεμβρίου", title: T.line, subtitle: "12 συσκευές έως −20 %, με δωρεάν μεταφορικά και παράδοση από το κατάστημα της γειτονιάς σου.", image: keyVisual, ctaLabel: "Δες τα προϊόντα", ctaHref: "#proionta", tone: "navy" } },
    { id: "bf26-count", type: "countdown", props: { label: "Οι τιμές Black Friday λήγουν σε" } },
    { id: "bf26-products", type: "products", props: { title: "Όλα τα προϊόντα του Black Friday", source: "manual", ids: ALL, limit: 24, sort: "discount" } },
    { id: "bf26-coupon", type: "coupon", props: { code: COUPON, text: "−10 € επιπλέον σε αγορές από 99 €. Γράψε τον κωδικό στο καλάθι." } },
    { id: "bf26-faq", type: "faq", props: { title: "Συχνές ερωτήσεις", items: [
      { q: "Μέχρι πότε ισχύουν οι τιμές;", a: "Έως 30 Νοεμβρίου 2026 ή μέχρι να εξαντληθούν τα αποθέματα." },
      { q: "Πώς χρησιμοποιώ τον κωδικό BF26;", a: "Γράψε BF26 στο πεδίο κουπονιού του καλαθιού. Δίνει −10 € σε αγορές από 99 €, μία φορά ανά πελάτη." },
      { q: "Έχει χρέωση η μεταφορά;", a: "Όχι. Τα προϊόντα του Black Friday έχουν δωρεάν μεταφορικά." },
      { q: "Μπορώ να πληρώσω με δόσεις;", a: "Ναι, με τους ίδιους τρόπους πληρωμής που ισχύουν πάντα." },
      { q: "Ισχύουν οι τιμές και στα καταστήματα;", a: "Οι τιμές του Black Friday ισχύουν στο e-shop. Ρώτησε το κατάστημά σου για τη διαθεσιμότητα." },
    ] } },
    { id: "bf26-terms", type: "terms", props: { title: "Όροι προσφοράς" } },
  ]);
  const seo = { seoTitle: "Black Friday 2026 στην Euronics", seoDesc: "Εκπτώσεις έως 20 % σε τηλεοράσεις, λευκές συσκευές, κλιματισμό και μικροσυσκευές, με δωρεάν μεταφορικά. Έως 30 Νοεμβρίου." };
  const landing = await db.landingPage.upsert({ where: { slug: "black-friday" }, update: { title: TITLE, promotionId: main15, campaignId: camp.id, status: "published", blocks, ...seo }, create: { slug: "black-friday", title: TITLE, promotionId: main15, campaignId: camp.id, status: "published", createdById: staff.id, blocks, ...seo } });
  const href = `/prosfores/${landing.slug}`;

  // ---- 5. δημοσίευση καμπάνιας (προσφορές ζωντανές) και υπολογισμός τιμών
  if (!livePub) {
    const pub = await publishCampaign(camp.id, who);
    console.log("δημοσίευση καμπάνιας:", JSON.stringify(pub));
    if (pub.rejected || pub.errors.length) throw new Error("Η δημοσίευση δεν ολοκληρώθηκε.");
  }
  console.log("τιμές:", JSON.stringify(await recomputeOffers()));
  console.log("χωρίς φόντο:", JSON.stringify(await ensureBannerCutouts(ALL, staff.id)));

  // ---- 6. banners σε όλες τις θέσεις (σχεδιασμένα: φόντο καμπάνιας + προβολέας + σήμα + προϊόντα με την τιμή τους)
  const design = (o: { title: string; kicker?: string; body?: string; cta?: string; square?: boolean; ids?: string[]; max?: number; fromPromo?: boolean }): BannerDesign => normalizeBannerDesign({
    bg: { color: "#05060f", image: o.square ? bgSquare : bgWide, video: null, anim: "spotlight" }, logo, ink: "light", accent: "#22e06b",
    kicker: o.kicker ?? "", title: o.title, body: o.body ?? "", cta: o.cta ?? "",
    products: { source: o.fromPromo ? "promotion" : o.ids?.length ? "manual" : "none", ids: o.ids ?? [], max: o.max ?? 2, priceLabel: "ΜΟΝΟ", showBrand: true, showEnergy: true, showWas: true, bullets: [] },
  })!;
  const ADS: { slot: string; name: string; priority?: number; d: BannerDesign }[] = [
    // η «κορυφή» μπαίνει ως συγκεκριμένο banner στη ζώνη κορυφής της αρχικής· στη θέση home-strip κερδίζει το άλλο (μικρότερη προτεραιότητα)
    { slot: "home-strip", name: "BF26 · Αρχική (κορυφή)", priority: 20, d: design({ kicker: "Έως 30 Νοεμβρίου", title: "Black Friday: οι τιμές έπεσαν", body: T.sub, cta: "Δες τις προσφορές" }) },
    { slot: "home-strip", name: "BF26 · Αρχική", d: design({ kicker: "Black Friday · −20 %", title: "Δύο που ξεχωρίζουν", body: "Τηλεόραση LG QNED 55 ιντσών και σκούπα Rowenta χωρίς καλώδιο.", cta: "Όλες οι προσφορές", ids: [P.lgQned55, P.rowentaStick] }) },
    { slot: "offers-top", name: "BF26 · Σελίδα προσφορών", d: design({ kicker: "Έως 30 Νοεμβρίου", title: "Οι προσφορές του Black Friday", body: "12 συσκευές έως −20 %, με δωρεάν μεταφορικά. Μέχρι να εξαντληθούν.", cta: "Δες τα προϊόντα" }) },
    { slot: "listing-top", name: "BF26 · Λίστες κατηγοριών", d: design({ kicker: "Black Friday", title: "Έως −20 % έως 30 Νοεμβρίου", cta: "Όλες οι προσφορές", fromPromo: true, max: 3 }) },
    { slot: "pdp-below-buybox", name: "BF26 · Σελίδα προϊόντος", d: design({ kicker: "Black Friday · −15 %", title: "Και αυτό σε τιμή Black Friday", ids: [P.tefalFry], max: 1 }) },
    { slot: "cart-top", name: "BF26 · Καλάθι", d: design({ kicker: `Κωδικός ${COUPON}`, title: "−10 € επιπλέον από 99 €", body: `Γράψε ${COUPON} στο πεδίο κουπονιού. Μία φορά ανά πελάτη, ${UNTIL}.` }) },
    { slot: "info-top", name: "BF26 · Πληροφοριακές (πλάτος)", d: design({ kicker: "Έως 30 Νοεμβρίου", title: T.line, cta: "Δες τις προσφορές", ids: [P.morrisWasher, P.samsungTv43] }) },
    { slot: "info-aside", name: "BF26 · Πληροφοριακές (στήλη)", d: design({ kicker: "Black Friday · −15 %", title: "Για τον χειμώνα", cta: "Δες το", square: true, ids: [P.delonghiDehum], max: 1 }) },
  ];
  const adId: Record<string, string> = {};
  for (const a of ADS) {
    const data = { slot: a.slot, title: a.name, alt: `${T.line}: εκπτώσεις έως 20 % ${UNTIL}`, href, promotionId: main15, landingId: landing.id, campaignId: camp.id, status: "active", endsAt: camp.endsAt, priority: a.priority ?? 10, design: a.d as unknown as Prisma.InputJsonValue };
    const ex = await db.adPlacement.findFirst({ where: { title: a.name, campaignId: camp.id } });
    adId[a.name] = (ex ? await db.adPlacement.update({ where: { id: ex.id }, data }) : await db.adPlacement.create({ data: { ...data, createdById: staff.id } })).id;
  }

  // ---- 7. hero: όλα τα slides Black Friday + προσφορά ημέρας ανά ημέρα
  await heroSlides(staff.id, keyVisual, href);

  // ---- 8. αρχική και ζώνες σελίδων: γράφονται ΚΑΙ στο πρόχειρο ΚΑΙ στη δημοσιευμένη έκδοση χωριστά, ώστε να μη δημοσιευτούν άλλες εκκρεμείς αλλαγές του πρόχειρου
  const b = (id: string, zone: string, x: Record<string, unknown>) => ({ id: `bf26-${id}`, zone, ...x }) as unknown as BrandBlock;
  const merge = (cur: unknown, add: BrandBlock[]) => [...((Array.isArray(cur) ? cur : []) as BrandBlock[]).filter((y) => !String(y.id).startsWith("bf26-")), ...add];
  const promoBlock = (id: string, zone: string, limit: number) => b(id, zone, { type: "promo-products", promotionId: main15, promotionName: "Black Friday −15 %", title: "Black Friday: δες τι έπεσε", limit, countdown: true, cta: { label: "Όλες οι προσφορές", href } });
  const couponBlock = (id: string, zone: string) => b(id, zone, { type: "coupon", code: COUPON, text: T.coupon });
  const homeAdd = [
    b("home-note", TOP_ZONE, { type: "announcement", text: `Black Friday ${UNTIL}: έως −20 % και δωρεάν μεταφορικά`, href, endsAt: camp.endsAt.toISOString() }),
    b("home-top", TOP_ZONE, { type: "ad", mode: "placement", placementId: adId["BF26 · Αρχική (κορυφή)"], placementTitle: "BF26 · Αρχική (κορυφή)" }),
    b("home-count", afterZone("hero"), { type: "countdown", promotionId: main15, promotionName: "Black Friday −15 %", title: "Οι τιμές Black Friday λήγουν σε", body: T.sub, cta: { label: "Δες τις προσφορές", href } }),
    // χωρίς δεύτερη λίστα προϊόντων εδώ: η ενότητα «Προσφορές» της αρχικής δείχνει τα προϊόντα της καμπάνιας (διπλές κάρτες αλλιώς)
    b("home-landing", afterZone("deals"), { type: "promo-landing", landingId: landing.id, landingTitle: landing.title }),
    couponBlock("home-coupon", afterZone("services")),
  ];
  // ενότητες της αρχικής που γυρίζουν στο Black Friday: ticker και «Προσφορές» (οι προηγούμενες ρυθμίσεις κρατιούνται για το --remove)
  const sectionProps: Record<string, Record<string, unknown>> = {
    ticker: { items: T.ticker },
    deals: { title: "Προσφορές Black Friday", source: "products", productIds: SHOW.slice(0, 8), endsAt: camp.endsAt.toISOString(), limit: 8 },
  };
  const homeWhere = { collection_key_locale: { collection: "home.layout", key: "home", locale: "el" } };
  const home = await db.cmsDocument.findUnique({ where: homeWhere });
  let st = await getState();
  const keep = (raw: unknown) => Object.fromEntries(normalizeHomeDoc(raw).sections.filter((s) => s.id in sectionProps).map((s) => [s.id, s.props ?? null]));
  if (!st.home) { st = { ...st, home: { data: keep(home?.data ?? home?.published), published: keep(home?.published ?? home?.data) } }; await setState(st); }
  const withBf = (raw: unknown) => { const d: HomeDoc = normalizeHomeDoc(raw); return J(normalizeHomeDoc({ sections: d.sections.map((s) => (s.id in sectionProps ? { ...s, props: { ...(s.props ?? {}), ...sectionProps[s.id] } } : s)), blocks: merge(d.blocks, homeAdd) })); };
  const homeData = { data: withBf(home?.data ?? home?.published), published: withBf(home?.published ?? home?.data), publishedAt: new Date(), updatedBy: staff.id };
  if (home) await db.cmsDocument.update({ where: homeWhere, data: homeData });
  else await db.cmsDocument.create({ data: { collection: "home.layout", key: "home", locale: "el", ...homeData } });

  for (const p of INFO_PAGES) {
    const add = [
      b(`${p.key}-top`, "top", { type: "ad", mode: "slot", slot: "info-top" }),
      ...(p.zones.includes("aside") ? [b(`${p.key}-aside`, "aside", { type: "ad", mode: "slot", slot: "info-aside" })] : []),
      ...(p.zones.includes("after") ? [couponBlock(`${p.key}-after`, "after")] : []),
      promoBlock(`${p.key}-bottom`, "bottom", 4),
    ];
    const where = { collection_key_locale: { collection: "page.zones", key: p.key, locale: "el" } };
    const cur = await db.cmsDocument.findUnique({ where });
    const blocksOf = (j: Prisma.JsonValue | null | undefined) => (j && typeof j === "object" && !Array.isArray(j) ? (j as { blocks?: unknown }).blocks : null);
    // στο πρόχειρο: αν υπάρχει ήδη δική σου «Διαφήμιση» στην ίδια θέση, δεν μπαίνει δεύτερη
    const draftNow = ((blocksOf(cur?.data) ?? []) as BrandBlock[]).filter((y) => !String(y.id).startsWith("bf26-"));
    const draftAdd = add.filter((n) => !(n.type === "ad" && draftNow.some((y) => y.type === "ad" && y.zone === n.zone)));
    const data = J({ blocks: merge(draftNow, draftAdd) }), published = J({ blocks: merge(blocksOf(cur?.published), add) });
    if (cur) await db.cmsDocument.update({ where, data: { data, published, publishedAt: new Date(), updatedBy: staff.id } });
    else await db.cmsDocument.create({ data: { collection: "page.zones", key: p.key, locale: "el", data, published, publishedAt: new Date(), updatedBy: staff.id } });
  }

  // ---- 9. κείμενα UI: το πλακίδιο δίπλα στο hero γράφει «Black Friday · προσφορά ημέρας» (η προηγούμενη τιμή κρατιέται για το --remove)
  const cp = await db.cmsDocument.findUnique({ where: COPY_DOC });
  const flat = Object.entries(COPY).flatMap(([ns, kv]) => Object.entries(kv).map(([k, v]) => [ns, k, v] as const));
  const asMap = (j: Prisma.JsonValue | null | undefined) => structuredClone((j && typeof j === "object" && !Array.isArray(j) ? j : {}) as Record<string, Record<string, string>>);
  if (!st.copy) { const was = (j: Prisma.JsonValue | null | undefined) => Object.fromEntries(flat.map(([ns, k]) => [`${ns}.${k}`, asMap(j)[ns]?.[k] ?? null])); st = { ...(await getState()), copy: { data: was(cp?.data), published: was(cp?.published) } }; await setState(st); }
  const withCopy = (j: Prisma.JsonValue | null | undefined) => { const o = asMap(j); for (const [ns, k, v] of flat) (o[ns] ??= {})[k] = v; return J(o); };
  if (cp) await db.cmsDocument.update({ where: COPY_DOC, data: { data: withCopy(cp.data), published: withCopy(cp.published), publishedAt: new Date(), updatedBy: staff.id } });
  else await db.cmsDocument.create({ data: { collection: "copy", key: "ui", locale: "el", data: withCopy(null), published: withCopy(null), publishedAt: new Date(), updatedBy: staff.id } });

  // ---- 10. newsletter: ΜΟΝΟ πρόχειρο με τα λεκτικά της καμπάνιας — δεν στέλνεται από εδώ
  try {
    const nl = (await db.newsletter.findFirst({ where: { campaignId: camp.id }, select: { id: true } })) ?? (await draftFromCampaign(camp.id, staff.id));
    const row = await db.newsletter.findUniqueOrThrow({ where: { id: nl.id } });
    if (row.status === "draft") {
      const subject = "Black Friday στην Euronics: έως −20 % έως 30 Νοεμβρίου", preheader = `12 συσκευές σε τιμές Black Friday, δωρεάν μεταφορικά και −10 € με τον κωδικό ${COUPON}.`;
      const nb = (row.blocks as { type: string }[]).map((x) => (x.type === "text" ? { ...x, body: `Οι τιμές του Black Friday ξεκίνησαν. ${T.sub} Τα προϊόντα έχουν δωρεάν μεταφορικά, και με τον κωδικό ${COUPON} κερδίζεις −10 € επιπλέον σε αγορές από 99 €.` } : x.type === "cta" ? { ...x, label: "Δες τις προσφορές" } : x.type === "hero" ? { ...x, headline: T.line, sub: "Έως −20 % · έως 30 Νοεμβρίου" } : x));
      await db.newsletter.update({ where: { id: row.id }, data: { title: "Newsletter · Black Friday 2026", subject, preheader, blocks: J(nb), contentHash: contentHash({ subject, preheader, blocks: nb as never }) } });
    }
    console.log("newsletter ✓ πρόχειρο (δεν στάλθηκε)");
  } catch (e) { console.log("newsletter ✗", e instanceof Error ? e.message : e); }

  // ---- αναφορά
  const offers = await db.productOffer.findMany({ where: { productId: { in: ALL } }, select: { price: true, listPrice: true } });
  console.log(`\nΚαμπάνια ${camp.code} · ${href} · ${offers.filter((o) => Number(o.price) < Number(o.listPrice)).length}/${ALL.length} προϊόντα με έκπτωση · ${await db.adPlacement.count({ where: { campaignId: camp.id, status: "active" } })} banners · ${await db.promotion.count({ where: { campaignId: camp.id, status: "active" } })} προσφορές ενεργές`);
}

main().then(() => process.exit(0)).catch((e) => { console.error("ΑΠΟΤΥΧΙΑ:", e); process.exit(1); });
