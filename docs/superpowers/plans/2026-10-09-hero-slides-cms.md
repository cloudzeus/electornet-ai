# Hero slides CMS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Το marketing διαχειρίζεται μόνο του τα slides του hero της αρχικής (κείμενα, εικόνες, βίντεο, προϊόν, ημερομηνίες) με πρόχειρο → δημοσίευση, χωρίς ο hero να μένει ποτέ άδειος.

**Architecture:** Έγγραφο `CmsDocument` (`hero.slides`/`home`) με `data` (πρόχειρο) και `published`, όπως οι σελίδες μαρκών. Καθαρές συναρτήσεις (επιλογή slides κατά ημέρα Ελλάδας, εφεδρεία, επικύρωση, κανονικοποίηση) στο `lib/cms/hero-slides-model.ts` με tests· πρόσβαση στη βάση στο `lib/cms/hero-slides.ts`· επεξεργαστής με ζωντανή προεπισκόπηση στο `/admin/cms/slides`.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma/Postgres (`CmsDocument`, χωρίς αλλαγή σχήματος), node:test μέσω `npm test` (tsx), Tailwind 4 με container queries και tokens `--fs-*`.

**Spec:** `docs/superpowers/specs/2026-10-09-hero-slides-cms-design.md` (ημερομηνίες ως ημέρες `YYYY-MM-DD` ώρας Ελλάδας, inclusive· τα «μόνιμα» είναι μόνο εφεδρικά).

---

## Δομή αρχείων

| Αρχείο | Ευθύνη |
|---|---|
| `lib/cms/hero-slides-model.ts` (νέο) | Τύποι, `DEFAULT_HERO_DOC`, `athensDay`, `pickSlides`, `slideStatus`, `validateSlide/Doc`, `normalizeDoc`, `toHeroSlide`, `emptySlide`. Χωρίς βάση — τρέχει και στον browser. |
| `lib/cms/hero-slides.test.ts` (νέο) | Tests των παραπάνω. |
| `lib/cms/hero-slides.ts` (νέο, server-only) | Ανάγνωση/αποθήκευση/δημοσίευση/επαναφορά, `productInfos`, `getLiveHeroSlides`. |
| `lib/data/types.ts` | `HeroSlide`: `secondary?`, `imageMobile?`, `price?`. |
| `lib/data/catalog.ts` | Αφαιρούνται `heroSlides`/`getHeroSlides` (μεταφέρονται στο `DEFAULT_HERO_DOC`). |
| `lib/cms/render.tsx` | Ο `bento-hero` διαβάζει `getLiveHeroSlides()`. |
| `components/widgets/CinematicHero.tsx` | `<picture>` για φωτογραφία κινητού, προαιρετικό 2ο κουμπί, ετικέτα τιμής προϊόντος. |
| `app/admin/(shell)/cms/slides/actions.ts` (νέο) | Server actions: αποθήκευση, δημοσίευση, επαναφορά, αναζήτηση προϊόντων. |
| `app/admin/(shell)/cms/slides/page.tsx` (νέο) | Σελίδα διαχείρισης. |
| `app/admin/(shell)/cms/slides/HeroSlidesEditor.tsx` (νέο) | Επεξεργαστής (λίστα, φόρμα, προεπισκόπηση). |
| `components/admin/nav.ts` | «Hero slides» χωρίς `soon`. |

---

### Task 1: Μοντέλο και καθαρές συναρτήσεις (TDD)

**Files:**
- Create: `lib/cms/hero-slides-model.ts`
- Test: `lib/cms/hero-slides.test.ts`

- [ ] **Step 1: Γράψε τα tests**

```ts file=lib/cms/hero-slides.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_HERO_DOC, athensDay, emptySlide, normalizeDoc, pickSlides, slideStatus, validateDoc, validateSlide, type HeroDoc, type HeroSlideDoc } from "./hero-slides-model";

const slide = (o: Partial<HeroSlideDoc> = {}): HeroSlideDoc => ({ ...emptySlide(), id: o.id ?? "s", title: ["Τίτλος"], primary: { label: "Δες", href: "/k" }, image: { url: "/img/a.jpg", alt: "Περιγραφή" }, ...o });
const doc = (...slides: HeroSlideDoc[]): HeroDoc => ({ slides });
const at = (iso: string) => new Date(iso);

test("athensDay: μεσάνυχτα Ελλάδας, όχι UTC", () => {
  assert.equal(athensDay(at("2026-10-09T21:30:00Z")), "2026-10-10"); // 00:30 ώρα Ελλάδας (UTC+3)
  assert.equal(athensDay(at("2026-12-31T21:59:00Z")), "2026-12-31"); // 23:59 ώρα Ελλάδας (UTC+2)
});

test("pickSlides: εντός ημερομηνιών, inclusive άκρα", () => {
  const d = doc(slide({ id: "a", from: "2026-10-01", to: "2026-10-31" }), slide({ id: "b", from: "2026-11-01" }), slide({ id: "c", to: "2026-09-30" }));
  assert.deepEqual(pickSlides(d, at("2026-10-01T08:00:00Z")).map((s) => s.id), ["a"]);
  assert.deepEqual(pickSlides(d, at("2026-10-31T20:00:00Z")).map((s) => s.id), ["a"]); // 23:00 Ελλάδας της 31/10
  assert.deepEqual(pickSlides(d, at("2026-11-01T08:00:00Z")).map((s) => s.id), ["b"]);
});

test("pickSlides: τα ανενεργά δεν βγαίνουν", () => {
  assert.deepEqual(pickSlides(doc(slide({ id: "a", active: false }), slide({ id: "b" })), at("2026-10-09T10:00:00Z")).map((s) => s.id), ["b"]);
});

test("pickSlides: τα μόνιμα μόνο όταν δεν υπάρχει άλλο", () => {
  const d = doc(slide({ id: "camp", to: "2026-10-15" }), slide({ id: "perm", permanent: true }));
  assert.deepEqual(pickSlides(d, at("2026-10-09T10:00:00Z")).map((s) => s.id), ["camp"]);
  assert.deepEqual(pickSlides(d, at("2026-10-20T10:00:00Z")).map((s) => s.id), ["perm"]);
});

test("pickSlides: χωρίς τίποτα ενεργό → τα αρχικά (DEFAULT), χωρίς τα ληγμένα", () => {
  const ids = pickSlides(doc(slide({ id: "old", to: "2026-01-01" })), at("2026-10-09T10:00:00Z")).map((s) => s.id);
  assert.deepEqual(ids, ["renew"]);
  assert.deepEqual(pickSlides(null, at("2026-10-09T10:00:00Z")).map((s) => s.id), ["renew"]);
  assert.ok(DEFAULT_HERO_DOC.slides.length === 3);
});

test("slideStatus: ετικέτες κατάστασης", () => {
  const now = at("2026-10-09T10:00:00Z");
  assert.deepEqual(slideStatus(slide({ active: false }), now), { tone: "off", label: "Ανενεργό" });
  assert.deepEqual(slideStatus(slide({ from: "2026-10-15" }), now), { tone: "soon", label: "Από 15/10" });
  assert.deepEqual(slideStatus(slide({ to: "2026-09-30" }), now), { tone: "ended", label: "Έληξε 30/9" });
  assert.deepEqual(slideStatus(slide({ permanent: true }), now), { tone: "permanent", label: "Μόνιμο (όταν δεν υπάρχει άλλο)" });
  assert.deepEqual(slideStatus(slide({ to: "2026-10-31" }), now), { tone: "live", label: "Ενεργό έως 31/10" });
  assert.deepEqual(slideStatus(slide(), now), { tone: "live", label: "Ενεργό τώρα" });
});

test("validateSlide: υποχρεωτικά και σύνδεσμοι", () => {
  assert.deepEqual(validateSlide(slide()), []);
  const bad = validateSlide(slide({ title: ["", " "], image: { url: "/i.jpg", alt: "" }, primary: { label: "Δες", href: "javascript:alert(1)" }, from: "2026-10-10", to: "2026-10-01" }));
  assert.deepEqual(bad.map((i) => i.field).sort(), ["dates", "image", "primary", "title"]);
  assert.deepEqual(validateSlide(slide({ secondary: { label: "Οδηγός", href: "" } })).map((i) => i.field), ["secondary"]);
  assert.deepEqual(validateSlide(slide({ primary: { label: "Δες", href: "https://euronics.gr/x" } })), []);
});

test("validateDoc: ελέγχει μόνο τα ενεργά", () => {
  const d = doc(slide({ id: "ok" }), slide({ id: "off", active: false, title: [] }), slide({ id: "bad", title: [] }));
  assert.deepEqual(Object.keys(validateDoc(d)), ["bad"]);
});

test("normalizeDoc: καθαρίζει είσοδο και αδειάζει ημερομηνίες στα μόνιμα", () => {
  const n = normalizeDoc({ slides: [{ id: "x", active: true, permanent: true, from: "2026-10-01", to: "κάτι", title: ["  Α ", "", "Β", "Γ"], primary: { label: " Δες ", href: "/k" }, secondary: { label: "", href: "" }, bullets: ["1", "", "2", "3", "4"], image: { url: "/i.jpg", alt: " alt " }, imageMobile: { url: "" }, video: null, productId: "" }] });
  const s = n.slides[0];
  assert.equal(s.from, null); assert.equal(s.to, null);
  assert.deepEqual(s.title, ["Α", "Β", "Γ"]);
  assert.deepEqual(s.primary, { label: "Δες", href: "/k" });
  assert.equal(s.secondary, null);
  assert.deepEqual(s.bullets, ["1", "2", "3"]);
  assert.equal(s.image.alt, "alt");
  assert.equal(s.imageMobile, null);
  assert.equal(s.productId, null);
  assert.deepEqual(normalizeDoc("σκουπίδια"), { slides: [] });
});
```

- [ ] **Step 2: Τρέξε τα tests — πρέπει να αποτύχουν**

Run: `npx tsx --test lib/cms/hero-slides.test.ts`
Expected: FAIL — `Cannot find module './hero-slides-model'`.

- [ ] **Step 3: Γράψε το μοντέλο**

```ts file=lib/cms/hero-slides-model.ts
import type { HeroSlide } from "@/lib/data/types";

/**
 * Hero slides της αρχικής (CmsDocument «hero.slides»/«home»): ο τύπος του εγγράφου, τα αρχικά slides και οι καθαρές
 * συναρτήσεις επιλογής/ελέγχου — χωρίς βάση, ώστε να τρέχουν και στον επεξεργαστή (browser) και στα tests.
 * Ημερομηνίες: ημέρες ώρας Ελλάδας «YYYY-MM-DD», και τα δύο άκρα μετρούν.
 * «Μόνιμα»: εφεδρικά — βγαίνουν μόνο όταν δεν υπάρχει άλλο ενεργό slide, ώστε ο hero να μη μείνει ποτέ άδειος.
 */
export interface HeroLink { label: string; href: string }
export interface HeroSlideDoc {
  id: string;
  active: boolean;
  from: string | null;
  to: string | null;
  permanent: boolean;
  kicker: string;
  title: string[];
  body: string;
  primary: HeroLink;
  secondary: HeroLink | null;
  bullets: string[];
  image: { url: string; alt: string };
  imageMobile: { url: string } | null;
  video: { url: string } | null;
  productId: string | null;
  /** μόνο τα αρχικά slides: έτοιμο cutout / σύνδεσμος χωρίς προϊόν της βάσης */
  cutout?: string | null;
  productHref?: string | null;
}
export interface HeroDoc { slides: HeroSlideDoc[] }
export interface SlideIssue { field: "title" | "image" | "primary" | "secondary" | "dates"; message: string }
/** Ό,τι χρειάζεται ο hero από ένα προϊόν του καταλόγου — η τιμή διαβάζεται τη στιγμή της προβολής */
export interface ProductInfo { title: string; slug: string; cutout: string | null; price: number | null }

export const MAX_SLIDES = 12;

const none = { imageMobile: null, video: null, productId: null, from: null, to: null } as const;
export const DEFAULT_HERO_DOC: HeroDoc = {
  slides: [
    {
      ...none, id: "summer-clima", active: true, permanent: false, to: "2026-09-30",
      kicker: "Καλοκαίρι 2026 · κλιματισμός", title: ["Δροσιά", "που δεν καίει", "ρεύμα"],
      body: "Inverter έως A+++, τοποθέτηση από πιστοποιημένο τεχνικό του καταστήματος της γειτονιάς σου, δόσεις χωρίς κάρτα.",
      primary: { label: "Δες τα 186 μοντέλα", href: "/k/klimatismos/air-condition" }, secondary: { label: "Υπολόγισε BTU", href: "/odigoi/epilogi-klimatistikou" },
      bullets: ["Δωρεάν μεταφορά", "Εγκατάσταση", "Εγγύηση έως 5 έτη"],
      image: { url: "/img/hero-clima.jpg", alt: "Δροσερό σαλόνι με κλιματιστικό inverter" }, video: { url: "/video/hero-clima.mp4" },
      cutout: "/img/cutouts/r-152092-0.webp", productHref: "/proion/inventor-veri-vero-18wfi-klimatistiko",
    },
    {
      ...none, id: "back-to-school", active: true, permanent: false, to: "2026-09-30",
      kicker: "Σεπτέμβριος · computing", title: ["Laptop", "για κάθε", "σχολή"],
      body: "Από 399 €, με δωρεάν τσάντα και εγκατάσταση Office από το κατάστημα.",
      primary: { label: "Δες τα 154 μοντέλα", href: "/k/computing/laptops" }, secondary: { label: "Οδηγός επιλογής", href: "/odigoi" },
      bullets: ["Δωρεάν μεταφορά", "Δόσεις χωρίς κάρτα", "Επίσημη εγγύηση"],
      image: { url: "/img/hero-laptop.jpg", alt: "Φοιτήτρια με laptop στο γραφείο της" },
      cutout: "/img/cutouts/r-157206-0.webp", productHref: "/proion/apple-mdhe4gr-a-midnight",
    },
    {
      ...none, id: "renew", active: true, permanent: true,
      kicker: "Euronics Renew", title: ["Refurbished", "με 2 χρόνια", "εγγύηση"],
      body: "Έλεγχος 60 σημείων, μπαταρία ≥85%, Grade A/B με σαφή περιγραφή.",
      primary: { label: "Δες τα Renew", href: "/renew" }, secondary: { label: "Τι είναι το Renew", href: "/renew" },
      bullets: ["2 έτη εγγύηση", "Επιστροφή σε 14 ημέρες", "Δόσεις"],
      image: { url: "/img/hero-renew.jpg", alt: "Refurbished smartphone στο χέρι" },
      cutout: "/img/cutouts/r-146037-0.webp", productHref: "/renew",
    },
  ],
};

/** Η ημέρα στην Ελλάδα για μια στιγμή (ο server τρέχει σε UTC). */
export const athensDay = (now: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
const inDates = (s: HeroSlideDoc, day: string) => (!s.from || day >= s.from) && (!s.to || day <= s.to);

/** Τα slides που βλέπει ο επισκέπτης τώρα: ενεργά εντός ημερομηνιών → αλλιώς τα μόνιμα → αλλιώς τα αρχικά. */
export function pickSlides(doc: HeroDoc | null, now: Date): HeroSlideDoc[] {
  const d = doc ?? DEFAULT_HERO_DOC;
  const day = athensDay(now);
  const live = d.slides.filter((s) => s.active && !s.permanent && inDates(s, day));
  if (live.length) return live;
  const fallback = d.slides.filter((s) => s.active && s.permanent);
  if (fallback.length) return fallback;
  return doc ? pickSlides(null, now) : [];
}

const dm = (day: string) => `${+day.slice(8, 10)}/${+day.slice(5, 7)}`;
export type SlideTone = "live" | "soon" | "ended" | "permanent" | "off";
export function slideStatus(s: HeroSlideDoc, now: Date): { tone: SlideTone; label: string } {
  if (!s.active) return { tone: "off", label: "Ανενεργό" };
  if (s.permanent) return { tone: "permanent", label: "Μόνιμο (όταν δεν υπάρχει άλλο)" };
  const day = athensDay(now);
  if (s.from && day < s.from) return { tone: "soon", label: `Από ${dm(s.from)}` };
  if (s.to && day > s.to) return { tone: "ended", label: `Έληξε ${dm(s.to)}` };
  return { tone: "live", label: s.to ? `Ενεργό έως ${dm(s.to)}` : "Ενεργό τώρα" };
}

const HREF = /^(\/(?!\/)|https:\/\/)/;
export function validateSlide(s: HeroSlideDoc): SlideIssue[] {
  const out: SlideIssue[] = [];
  if (!s.title.some((t) => t.trim())) out.push({ field: "title", message: "Γράψε τουλάχιστον μία γραμμή στον μεγάλο τίτλο." });
  if (!s.image.url) out.push({ field: "image", message: "Διάλεξε φωτογραφία από τη βιβλιοθήκη." });
  else if (!s.image.alt.trim()) out.push({ field: "image", message: "Γράψε τι δείχνει η φωτογραφία (για χρήστες με αναγνώστη οθόνης και για τη Google)." });
  if (!s.primary.label.trim() || !s.primary.href.trim()) out.push({ field: "primary", message: "Το κύριο κουμπί θέλει κείμενο και σύνδεσμο." });
  else if (!HREF.test(s.primary.href.trim())) out.push({ field: "primary", message: "Ο σύνδεσμος ξεκινά με / (σελίδα του site) ή https://." });
  if (s.secondary && (!s.secondary.label.trim() || !HREF.test(s.secondary.href.trim()))) out.push({ field: "secondary", message: "Το δεύτερο κουμπί θέλει κείμενο και σύνδεσμο που ξεκινά με / ή https:// — ή άφησε και τα δύο κενά." });
  if (s.from && s.to && s.to < s.from) out.push({ field: "dates", message: "Η τελευταία ημέρα είναι πριν από την πρώτη." });
  return out;
}

/** Λάθη ανά slide — μόνο για τα ενεργά (τα ανενεργά μπορούν να μείνουν μισοτελειωμένα). */
export function validateDoc(d: HeroDoc): Record<string, SlideIssue[]> {
  const out: Record<string, SlideIssue[]> = {};
  for (const s of d.slides) { if (!s.active) continue; const v = validateSlide(s); if (v.length) out[s.id] = v; }
  return out;
}

export const newSlideId = () => `s-${Math.random().toString(36).slice(2, 10)}`;
export const emptySlide = (): HeroSlideDoc => ({
  id: newSlideId(), active: true, from: null, to: null, permanent: false,
  kicker: "", title: [""], body: "", primary: { label: "", href: "" }, secondary: null, bullets: [],
  image: { url: "", alt: "" }, imageMobile: null, video: null, productId: null,
});

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const link = (v: unknown): HeroLink | null => { const o = obj(v); const label = str(o.label, 60), href = str(o.href, 300); return label || href ? { label, href } : null; };
const url = (v: unknown) => { const u = str(obj(v).url, 500); return u ? { url: u } : null; };

/** Καθαρισμός εισόδου από τον browser πριν μπει στη βάση: σχήμα, μήκη, όρια. */
export function normalizeDoc(input: unknown): HeroDoc {
  const raw = obj(input).slides;
  const slides = (Array.isArray(raw) ? raw : []).slice(0, MAX_SLIDES).map((x): HeroSlideDoc => {
    const s = obj(x), img = obj(s.image), permanent = s.permanent === true;
    return {
      id: str(s.id, 60) || newSlideId(),
      active: s.active !== false,
      from: permanent ? null : day(s.from),
      to: permanent ? null : day(s.to),
      permanent,
      kicker: str(s.kicker, 60),
      title: (Array.isArray(s.title) ? s.title : []).map((t) => str(t, 40)).filter(Boolean).slice(0, 3),
      body: str(s.body, 300),
      primary: link(s.primary) ?? { label: "", href: "" },
      secondary: link(s.secondary),
      bullets: (Array.isArray(s.bullets) ? s.bullets : []).map((b) => str(b, 40)).filter(Boolean).slice(0, 3),
      image: { url: str(img.url, 500), alt: str(img.alt, 160) },
      imageMobile: url(s.imageMobile),
      video: url(s.video),
      productId: str(s.productId, 60) || null,
      cutout: str(s.cutout, 500) || null,
      productHref: str(s.productHref, 300) || null,
    };
  });
  return { slides };
}

/** Έγγραφο → ό,τι ζωγραφίζει ο hero. Με προϊόν του καταλόγου: το cutout, ο σύνδεσμος και η τρέχουσα τιμή του. */
export function toHeroSlide(s: HeroSlideDoc, p: ProductInfo | null): HeroSlide {
  return {
    id: s.id, kicker: s.kicker, title: s.title.filter((t) => t.trim()), body: s.body,
    primary: s.primary, secondary: s.secondary ?? undefined, bullets: s.bullets.filter((b) => b.trim()),
    image: s.image.url, alt: s.image.alt, imageMobile: s.imageMobile?.url, video: s.video?.url,
    cutout: p?.cutout ?? s.cutout ?? undefined, productHref: p ? `/proion/${p.slug}` : s.productHref ?? undefined, price: p?.price ?? undefined,
  };
}
```

- [ ] **Step 4: Επέκτεινε τον τύπο `HeroSlide`** (`lib/data/types.ts`): `secondary` γίνεται προαιρετικό και προστίθενται:

```ts
  secondary?: { label: string; href: string };
  /** κάθετη φωτογραφία για κινητά (≤ 767px) — art direction */
  imageMobile?: string;
  /** τρέχουσα τιμή του προϊόντος του slide */
  price?: number;
```

- [ ] **Step 5: Τρέξε τα tests — πρέπει να περάσουν**

Run: `npx tsx --test lib/cms/hero-slides.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Commit** — `git add lib/cms/hero-slides-model.ts lib/cms/hero-slides.test.ts lib/data/types.ts && git commit -m "Hero slides: μοντέλο, επιλογή κατά ημέρα Ελλάδας, εφεδρεία, επικύρωση (με tests)"`

---

### Task 2: Βάση και βιτρίνα

**Files:**
- Create: `lib/cms/hero-slides.ts`
- Modify: `lib/data/catalog.ts` (αφαίρεση `heroSlides`, `getHeroSlides`), `lib/cms/render.tsx:20,35`

- [ ] **Step 1: Γράψε την πρόσβαση στη βάση**

```ts file=lib/cms/hero-slides.ts
import "server-only";
import { cache } from "react";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getProductsByIds } from "@/lib/data/repo";
import { cutoutFor } from "@/lib/data/cutouts";
import type { HeroSlide } from "@/lib/data/types";
import { DEFAULT_HERO_DOC, pickSlides, toHeroSlide, type HeroDoc, type HeroSlideDoc, type ProductInfo } from "./hero-slides-model";

/**
 * Hero slides στη βάση: CmsDocument «hero.slides»/«home». `data` = πρόχειρο, `published` = ό,τι βλέπει ο πελάτης.
 * Χωρίς έγγραφο η βιτρίνα δείχνει το DEFAULT_HERO_DOC (χωρίς τα ληγμένα) και ο επεξεργαστής το φορτώνει ως πρόχειρο.
 */
const where = { collection_key_locale: { collection: "hero.slides", key: "home", locale: "el" } };
const asDoc = (j: Prisma.JsonValue | null | undefined): HeroDoc | null => (j && typeof j === "object" && !Array.isArray(j) && Array.isArray((j as { slides?: unknown }).slides) ? (j as unknown as HeroDoc) : null);

export async function getHeroAdminDoc() {
  const d = await db.cmsDocument.findUnique({ where });
  return { draft: asDoc(d?.data) ?? DEFAULT_HERO_DOC, published: asDoc(d?.published), publishedAt: d?.publishedAt ?? null };
}

export async function saveHeroDraft(doc: HeroDoc, by: string) {
  const data = doc as unknown as Prisma.InputJsonValue;
  return db.cmsDocument.upsert({ where, update: { data, updatedBy: by, version: { increment: 1 } }, create: { collection: "hero.slides", key: "home", locale: "el", data, updatedBy: by } });
}

export async function publishHero(by: string) {
  const d = await db.cmsDocument.findUnique({ where });
  if (!d) throw new Error("Δεν υπάρχει πρόχειρο.");
  return db.cmsDocument.update({ where, data: { published: d.data as Prisma.InputJsonValue, publishedAt: new Date(), updatedBy: by } });
}

/** Το πρόχειρο γυρίζει στη δημοσιευμένη έκδοση. */
export async function revertHero(by: string): Promise<HeroDoc> {
  const d = await db.cmsDocument.findUnique({ where });
  const pub = asDoc(d?.published);
  if (!pub) throw new Error("Δεν υπάρχει δημοσιευμένη έκδοση.");
  await db.cmsDocument.update({ where, data: { data: pub as unknown as Prisma.InputJsonValue, updatedBy: by, version: { increment: 1 } } });
  return pub;
}

export async function productInfos(ids: string[]): Promise<Record<string, ProductInfo>> {
  if (!ids.length) return {};
  const ps = await getProductsByIds(ids).catch(() => []);
  return Object.fromEntries(ps.map((p) => [p.id, { title: `${p.brand} ${p.title}`, slug: p.slug, cutout: cutoutFor(p.image) ?? p.image ?? null, price: p.noPrice || !p.price ? null : p.price }]));
}

async function resolve(slides: HeroSlideDoc[]): Promise<HeroSlide[]> {
  const info = await productInfos([...new Set(slides.map((s) => s.productId).filter((x): x is string => !!x))]);
  return slides.map((s) => toHeroSlide(s, s.productId ? info[s.productId] ?? null : null));
}

/** Τα slides του hero για αυτό το αίτημα (μία ανάγνωση ανά αίτημα). */
export const getLiveHeroSlides = cache(async (): Promise<HeroSlide[]> => {
  const d = await db.cmsDocument.findUnique({ where, select: { published: true } }).catch(() => null);
  return resolve(pickSlides(asDoc(d?.published), new Date()));
});
```

- [ ] **Step 2: Σύνδεσε τη βιτρίνα** — στο `lib/cms/render.tsx` βγάλε το `getHeroSlides` από το import του `@/lib/data/catalog`, πρόσθεσε `import { getLiveHeroSlides } from "@/lib/cms/hero-slides";` και στη γραμμή 35 άλλαξε `getHeroSlides()` σε `getLiveHeroSlides()`. Στο `lib/data/catalog.ts` σβήσε τον πίνακα `heroSlides` και τη συνάρτηση `getHeroSlides` (και τον τύπο `HeroSlide` από το import αν μείνει αχρησιμοποίητος).

- [ ] **Step 3: Έλεγχος** — Run: `npx tsc --noEmit -p . && npm test` · Expected: χωρίς σφάλματα, όλα τα tests PASS.

- [ ] **Step 4: Browser** — άνοιξε `http://localhost:3111/`: ο hero δείχνει μόνο «Euronics Renew» (τα άλλα δύο έληξαν 30/9).

- [ ] **Step 5: Commit** — `git commit -m "Hero slides: η αρχική διαβάζει το δημοσιευμένο έγγραφο με εφεδρεία"`

---

### Task 3: Hero — φωτογραφία κινητού, προαιρετικό 2ο κουμπί, τιμή προϊόντος

**Files:** Modify: `components/widgets/CinematicHero.tsx`

- [ ] **Step 1:** Πρόσθεσε `getImageProps` στο import του `next/image` και `import { priceLong } from "@/lib/format";`. Πριν από το `export function CinematicHero` πρόσθεσε:

```tsx
/**
 * Φωτογραφία φόντου. Με ξεχωριστή φωτογραφία κινητού: <picture> (art direction, getImageProps) ώστε κάθε συσκευή να
 * κατεβάζει μόνο τη δική της — χωρίς preload, όπως ορίζει η τεκμηρίωση του Next για art direction.
 */
function HeroBackdrop({ s, first }: { s: HeroSlide; first: boolean }) {
  const cls = "object-cover opacity-25 scale-105";
  if (!s.imageMobile) return <Image src={s.image} alt="" fill preload={first} sizes="(max-width: 1024px) 100vw, 66vw" className={cls} unoptimized={s.image.startsWith("http")} />;
  const common = { alt: "", fill: true, sizes: "(max-width: 767px) 100vw, 66vw", fetchPriority: first ? ("high" as const) : undefined };
  const desktop = getImageProps({ ...common, src: s.image, unoptimized: s.image.startsWith("http") }).props;
  const { srcSet: mobileSet, ...rest } = getImageProps({ ...common, src: s.imageMobile, unoptimized: s.imageMobile.startsWith("http") }).props;
  return (
    <picture>
      <source media="(min-width: 768px)" srcSet={desktop.srcSet ?? desktop.src} />
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- alt="" μέσα στο rest: διακοσμητικό φόντο */}
      <img {...rest} srcSet={mobileSet} className={cls} />
    </picture>
  );
}
```

- [ ] **Step 2:** Αντικατέστησε το `<Image src={s.image} alt="" fill priority={i === 0} … />` του backdrop με `<HeroBackdrop s={s} first={i === 0} />`.
- [ ] **Step 3:** Τύλιξε το `<Link href={s.secondary.href} …>…</Link>` σε `{s.secondary && (…)}`.
- [ ] **Step 4:** Μέσα στο `<Link … data-product-inner …>`, μετά το `<Image src={s.cutout} …/>`, πρόσθεσε:

```tsx
{s.price ? <span className="absolute left-1/2 -translate-x-1/2 bottom-[4%] rounded-full bg-eu-yellow text-eu-navy font-extrabold px-3.5 py-1.5 text-[length:var(--fs-16)] shadow-lg whitespace-nowrap tabular-nums">{priceLong(s.price)}</span> : null}
```

- [ ] **Step 5:** `npx tsc --noEmit -p . && npx eslint components/widgets/CinematicHero.tsx` — χωρίς σφάλματα. Browser: η αρχική ίδια με πριν.
- [ ] **Step 6: Commit** — `git commit -m "Hero: φωτογραφία κινητού, προαιρετικό δεύτερο κουμπί, τιμή του προϊόντος"`

---

### Task 4: Server actions της διαχείρισης

**Files:** Create: `app/admin/(shell)/cms/slides/actions.ts`

- [ ] **Step 1:**

```ts file=app/admin/(shell)/cms/slides/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { db } from "@/lib/db";
import { cutoutFor } from "@/lib/data/cutouts";
import { normalizeDoc, validateDoc, type HeroDoc, type ProductInfo, type SlideIssue } from "@/lib/cms/hero-slides-model";
import { publishHero, revertHero, saveHeroDraft } from "@/lib/cms/hero-slides";

const PERM = "cms.slides.write";
const ENTITY = "hero.slides/home";

export async function saveHeroAction(input: HeroDoc): Promise<{ doc: HeroDoc }> {
  const u = await requirePermission(PERM);
  const doc = normalizeDoc(input);
  await saveHeroDraft(doc, u.id);
  await audit(u.id, "cms.hero.save", "CmsDocument", ENTITY, null, { slides: doc.slides.length });
  return { doc };
}

export async function publishHeroAction(input: HeroDoc): Promise<{ ok: true; doc: HeroDoc; publishedAt: string } | { ok: false; issues: Record<string, SlideIssue[]> }> {
  const u = await requirePermission(PERM);
  const doc = normalizeDoc(input);
  const issues = validateDoc(doc);
  if (Object.keys(issues).length) return { ok: false, issues };
  await saveHeroDraft(doc, u.id);
  const r = await publishHero(u.id);
  await audit(u.id, "cms.hero.publish", "CmsDocument", ENTITY, null, { slides: doc.slides.length });
  revalidatePath("/");
  return { ok: true, doc, publishedAt: (r.publishedAt ?? new Date()).toISOString() };
}

export async function revertHeroAction(): Promise<{ doc: HeroDoc }> {
  const u = await requirePermission(PERM);
  const doc = await revertHero(u.id);
  await audit(u.id, "cms.hero.revert", "CmsDocument", ENTITY);
  return { doc };
}

export async function searchHeroProductsAction(q: string): Promise<(ProductInfo & { id: string; sku: string })[]> {
  await requirePermission(PERM);
  const s = q.trim();
  if (s.length < 2) return [];
  const rows = await db.product.findMany({
    where: { active: true, OR: [{ title: { contains: s, mode: "insensitive" } }, { sku: { contains: s, mode: "insensitive" } }] },
    take: 12, orderBy: { title: "asc" },
    select: { id: true, title: true, sku: true, slug: true, price: true, media: { where: { hidden: false, kind: "image" }, orderBy: { sortNo: "asc" }, take: 1, select: { url: true } } },
  });
  return rows.map((r) => ({ id: r.id, sku: r.sku, title: r.title, slug: r.slug, price: r.price ?? null, cutout: cutoutFor(r.media[0]?.url) ?? r.media[0]?.url ?? null }));
}
```

- [ ] **Step 2:** `npx tsc --noEmit -p .` — χωρίς σφάλματα. **Commit** — `git commit -m "Hero slides: server actions (αποθήκευση, δημοσίευση, επαναφορά, αναζήτηση προϊόντων)"`

---

### Task 5: Σελίδα και επεξεργαστής

**Files:** Create: `app/admin/(shell)/cms/slides/page.tsx`, `app/admin/(shell)/cms/slides/HeroSlidesEditor.tsx` · Modify: `components/admin/nav.ts` (βγάλε το `soon: true` από το «Hero slides»).

- [ ] **Step 1: Σελίδα**

```tsx file=app/admin/(shell)/cms/slides/page.tsx
import { GalleryHorizontal } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { getHeroAdminDoc, productInfos } from "@/lib/cms/hero-slides";
import { getSettings } from "@/lib/cms/settings-server";
import { HeroSlidesEditor } from "./HeroSlidesEditor";

export const metadata = { title: "Hero slides" };
export const dynamic = "force-dynamic";

/** Τα slides του hero της αρχικής: πρόχειρο → δημοσίευση, ημερομηνίες ανά slide, ζωντανή προεπισκόπηση. */
export default async function HeroSlidesPage() {
  const user = await requirePermission("cms.slides.write");
  const doc = await getHeroAdminDoc();
  const ids = [...new Set(doc.draft.slides.map((s) => s.productId).filter((x): x is string => !!x))];
  const [products, settings] = await Promise.all([productInfos(ids), getSettings()]);
  return (
    <div className="grid gap-4 min-w-0">
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><GalleryHorizontal className="size-3.5" aria-hidden /> Περιεχόμενο · αρχική</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Hero slides</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">Τα μεγάλα slides στην κορυφή της αρχικής. Κάθε slide εμφανίζεται μόνο στις ημέρες που ορίζεις· όταν δεν υπάρχει κανένα ενεργό, βγαίνουν τα «μόνιμα», ώστε η αρχική να μη μείνει ποτέ χωρίς hero. Οι αλλαγές φαίνονται στο site μόνο με τη «Δημοσίευση».</p>
      </div>
      <HeroSlidesEditor initial={doc.draft} hasPublished={!!doc.published} publishedAt={doc.publishedAt?.toISOString() ?? null} products={products} settings={settings} canUpload={can(user.permissions, "cms.media.write")} />
    </div>
  );
}
```

- [ ] **Step 2: Επεξεργαστής**

```tsx file=app/admin/(shell)/cms/slides/HeroSlidesEditor.tsx
"use client";

import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Image from "next/image";
import { ArrowDown, ArrowUp, ChevronDown, Film, ImagePlus, Loader2, Package, Plus, RotateCcw, Save, Search, Send, Smartphone, Trash2, X } from "lucide-react";
import { CinematicHero } from "@/components/widgets/CinematicHero";
import { SettingsProvider } from "@/components/site/SettingsProvider";
import { MediaPickerDialog } from "@/components/admin/media/MediaPicker";
import type { Settings } from "@/lib/cms/settings";
import { priceLong } from "@/lib/format";
import { MAX_SLIDES, emptySlide, slideStatus, toHeroSlide, validateDoc, type HeroDoc, type HeroSlideDoc, type ProductInfo, type SlideIssue, type SlideTone } from "@/lib/cms/hero-slides-model";
import { publishHeroAction, revertHeroAction, saveHeroAction, searchHeroProductsAction } from "./actions";

const TONE: Record<SlideTone, string> = { live: "bg-eu-green/12 text-eu-green", soon: "bg-eu-blue/10 text-eu-blue", ended: "bg-eu-red/10 text-eu-red", permanent: "bg-eu-yellow/40 text-eu-navy", off: "bg-eu-surface text-eu-muted" };
const input = "w-full rounded-lg border border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] bg-white outline-none focus:border-eu-blue disabled:bg-eu-surface disabled:text-eu-muted";
const btn = "inline-flex items-center justify-center gap-1.5 rounded-full font-bold text-[length:var(--fs-14)] px-4 min-h-11 disabled:opacity-50";
const small = "inline-flex items-center gap-1 rounded-full border border-eu-line font-bold text-[length:var(--fs-13)] px-3 min-h-11 hover:border-eu-navy";
const unopt = (u: string) => u.startsWith("http");
type Media = "image" | "imageMobile" | "video";

/** Πεδίο με ετικέτα, ορατή εξήγηση και μήνυμα λάθους ακριβώς από κάτω. */
function Field({ label, help, error, children }: { label: string; help?: string; error?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 min-w-0">
      <span className="font-bold text-eu-ink-2 text-[length:var(--fs-14)]">{label}</span>
      {children}
      {help && <span className="text-eu-muted text-[length:var(--fs-13)]">{help}</span>}
      {error && <span role="alert" className="text-eu-red font-bold text-[length:var(--fs-13)]">{error}</span>}
    </div>
  );
}

function MediaRow({ title, help, url, video, onPick, onClear, error, children }: { title: string; help: string; url: string | null; video?: boolean; onPick: () => void; onClear?: () => void; error?: string; children?: ReactNode }) {
  return (
    <Field label={title} help={help} error={error}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="relative size-16 shrink-0 rounded-lg overflow-hidden bg-eu-surface grid place-items-center">
          {url && !video && <Image src={url} alt="" fill sizes="64px" className="object-cover" unoptimized={unopt(url)} />}
          {url && video && <Film className="size-6 text-eu-navy" aria-hidden />}
          {!url && <ImagePlus className="size-6 text-eu-muted" aria-hidden />}
        </span>
        <button type="button" onClick={onPick} className={small}><ImagePlus className="size-4" aria-hidden /> {url ? "Αλλαγή" : "Επιλογή από τη βιβλιοθήκη"}</button>
        {url && onClear && <button type="button" onClick={onClear} className={small}><X className="size-4" aria-hidden /> Αφαίρεση</button>}
      </div>
      {children}
    </Field>
  );
}

function ProductField({ s, info, onPick, onClear }: { s: HeroSlideDoc; info: ProductInfo | null; onPick: (id: string, p: ProductInfo) => void; onClear: () => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<(ProductInfo & { id: string; sku: string })[]>([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const search = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) { setRes([]); return; }
    timer.current = setTimeout(async () => { setBusy(true); try { setRes(await searchHeroProductsAction(v)); } finally { setBusy(false); } }, 250);
  };
  const current = info ? `${info.title}${info.price ? ` · ${priceLong(info.price)}` : ""}` : s.cutout ? "Το αρχικό προϊόν του slide (χωρίς σύνδεση με τον κατάλογο)" : null;
  return (
    <Field label="Προϊόν (προαιρετικό)" help="Η φωτογραφία του χωρίς φόντο «επιπλέει» στο slide, με σύνδεσμο στη σελίδα του και την τρέχουσα τιμή του καταλόγου.">
      {current && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-eu-chip text-eu-navy font-bold px-3 py-1.5 text-[length:var(--fs-14)] min-w-0"><Package className="size-4 shrink-0" aria-hidden /><span className="truncate">{current}</span></span>
          <button type="button" onClick={onClear} className={small}><X className="size-4" aria-hidden /> Αφαίρεση</button>
        </div>
      )}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-eu-muted" aria-hidden />
        <input aria-label="Αναζήτηση προϊόντος" value={q} onChange={(e) => search(e.target.value)} placeholder="Όνομα ή κωδικός προϊόντος…" className={`${input} pl-9`} />
        {busy && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-eu-muted" aria-hidden />}
      </div>
      {res.length > 0 && (
        <ul className="m-0 p-0 list-none max-h-64 overflow-y-auto rounded-xl border border-eu-line divide-y divide-eu-line">
          {res.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => { onPick(p.id, { title: p.title, slug: p.slug, cutout: p.cutout, price: p.price }); setQ(""); setRes([]); }} className="w-full flex items-center gap-2 text-left px-3 py-2 min-h-11 hover:bg-eu-chip">
                <span className="relative size-10 shrink-0 rounded bg-eu-surface overflow-hidden">{p.cutout && <Image src={p.cutout} alt="" fill sizes="40px" className="object-contain" unoptimized={unopt(p.cutout)} />}</span>
                <span className="min-w-0"><span className="block font-bold text-eu-ink text-[length:var(--fs-14)] truncate">{p.title}</span><span className="block text-eu-muted text-[length:var(--fs-13)]">{p.sku}{p.price ? ` · ${priceLong(p.price)}` : ""}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Field>
  );
}

function SlideForm({ s, issues, info, onChange, onMedia, onProduct, onRemove }: { s: HeroSlideDoc; issues: SlideIssue[]; info: ProductInfo | null; onChange: (p: Partial<HeroSlideDoc>) => void; onMedia: (m: Media) => void; onProduct: (id: string | null, p?: ProductInfo) => void; onRemove: () => void }) {
  const err = (f: SlideIssue["field"]) => issues.filter((i) => i.field === f).map((i) => i.message).join(" ") || undefined;
  const lines = [0, 1, 2].map((k) => s.title[k] ?? "");
  const bullets = [0, 1, 2].map((k) => s.bullets[k] ?? "");
  const setLine = (k: number, v: string) => onChange({ title: lines.map((x, j) => (j === k ? v : x)) });
  const setBullet = (k: number, v: string) => onChange({ bullets: bullets.map((x, j) => (j === k ? v : x)) });
  const setSecondary = (p: { label?: string; href?: string }) => { const next = { label: s.secondary?.label ?? "", href: s.secondary?.href ?? "", ...p }; onChange({ secondary: next.label || next.href ? next : null }); };
  const legend = "font-heading font-bold text-eu-ink text-[length:var(--fs-16)] mb-1";
  const set = "grid gap-3 min-w-0 m-0 p-0 border-0";
  return (
    <div className="grid gap-5 border-t border-eu-line p-3 @md:p-4">
      <fieldset className={set}>
        <legend className={legend}>Πότε φαίνεται</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <label className="inline-flex items-center gap-2 min-h-11 font-bold text-eu-ink-2 text-[length:var(--fs-14)]"><input type="checkbox" className="size-5" checked={s.active} onChange={(e) => onChange({ active: e.target.checked })} /> Ενεργό</label>
          <label className="inline-flex items-center gap-2 min-h-11 font-bold text-eu-ink-2 text-[length:var(--fs-14)]"><input type="checkbox" className="size-5" checked={s.permanent} onChange={(e) => onChange({ permanent: e.target.checked, ...(e.target.checked ? { from: null, to: null } : {}) })} /> Μόνιμο</label>
        </div>
        <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Τα μόνιμα δεν έχουν ημερομηνίες: εμφανίζονται μόνο όταν δεν υπάρχει άλλο ενεργό slide, ώστε η αρχική να μη μείνει ποτέ χωρίς hero.</p>
        <div className="grid gap-3 @sm:grid-cols-2">
          <Field label="Πρώτη ημέρα" help="Κενό = από τώρα" error={err("dates")}><input type="date" className={input} disabled={s.permanent} value={s.from ?? ""} onChange={(e) => onChange({ from: e.target.value || null })} /></Field>
          <Field label="Τελευταία ημέρα" help="Κενό = χωρίς λήξη· μετρά ολόκληρη η ημέρα"><input type="date" className={input} disabled={s.permanent} value={s.to ?? ""} onChange={(e) => onChange({ to: e.target.value || null })} /></Field>
        </div>
      </fieldset>

      <fieldset className={set}>
        <legend className={legend}>Κείμενα</legend>
        <Field label="Μικρός τίτλος" help="Η κίτρινη ετικέτα πάνω από τον τίτλο, π.χ. «Φθινόπωρο 2026 · ψυγεία»."><input className={input} maxLength={60} value={s.kicker} onChange={(e) => onChange({ kicker: e.target.value })} /></Field>
        <Field label="Μεγάλος τίτλος" help="Έως 3 σύντομες γραμμές — κάθε γραμμή μένει μόνη της." error={err("title")}>
          <div className="grid gap-2">{lines.map((v, k) => <input key={k} aria-label={`Γραμμή ${k + 1}`} placeholder={`Γραμμή ${k + 1}`} className={input} maxLength={40} value={v} onChange={(e) => setLine(k, e.target.value)} />)}</div>
        </Field>
        <Field label="Κείμενο" help="Μία–δύο προτάσεις κάτω από τον τίτλο."><textarea className={`${input} min-h-24 py-2`} maxLength={300} value={s.body} onChange={(e) => onChange({ body: e.target.value })} /></Field>
        <Field label="Σημεία (προαιρετικά)" help="Έως 3 σύντομα, κάτω από τα κουμπιά, π.χ. «Δωρεάν μεταφορά».">
          <div className="grid gap-2 @sm:grid-cols-3">{bullets.map((v, k) => <input key={k} aria-label={`Σημείο ${k + 1}`} className={input} maxLength={40} value={v} onChange={(e) => setBullet(k, e.target.value)} />)}</div>
        </Field>
      </fieldset>

      <fieldset className={set}>
        <legend className={legend}>Κουμπιά</legend>
        <Field label="Κύριο κουμπί (κίτρινο)" help="Σύνδεσμος: σελίδα του site (π.χ. /k/leykes-syskeyes/psygeia) ή https://…" error={err("primary")}>
          <div className="grid gap-2 @sm:grid-cols-2"><input aria-label="Κείμενο κύριου κουμπιού" placeholder="Κείμενο" className={input} maxLength={60} value={s.primary.label} onChange={(e) => onChange({ primary: { ...s.primary, label: e.target.value } })} /><input aria-label="Σύνδεσμος κύριου κουμπιού" placeholder="/k/…" className={input} value={s.primary.href} onChange={(e) => onChange({ primary: { ...s.primary, href: e.target.value } })} /></div>
        </Field>
        <Field label="Δεύτερο κουμπί (προαιρετικό)" help="Άφησε και τα δύο κενά αν δεν χρειάζεται." error={err("secondary")}>
          <div className="grid gap-2 @sm:grid-cols-2"><input aria-label="Κείμενο δεύτερου κουμπιού" placeholder="Κείμενο" className={input} maxLength={60} value={s.secondary?.label ?? ""} onChange={(e) => setSecondary({ label: e.target.value })} /><input aria-label="Σύνδεσμος δεύτερου κουμπιού" placeholder="/odigoi/…" className={input} value={s.secondary?.href ?? ""} onChange={(e) => setSecondary({ href: e.target.value })} /></div>
        </Field>
      </fieldset>

      <fieldset className={set}>
        <legend className={legend}>Εικόνα, βίντεο, προϊόν</legend>
        <MediaRow title="Φωτογραφία φόντου" help="Οριζόντια, τουλάχιστον 1600 px πλάτος. Μπαίνει αχνή πίσω από το κείμενο." url={s.image.url || null} onPick={() => onMedia("image")} error={err("image")}>
          <input aria-label="Τι δείχνει η φωτογραφία" placeholder="Τι δείχνει η φωτογραφία (π.χ. «Κουζίνα με inox ψυγείο»)" className={input} maxLength={160} value={s.image.alt} onChange={(e) => onChange({ image: { ...s.image, alt: e.target.value } })} />
        </MediaRow>
        <MediaRow title="Φωτογραφία για κινητά (προαιρετική)" help="Κάθετη, για οθόνες έως 767 px. Χωρίς αυτήν το κινητό δείχνει την οριζόντια." url={s.imageMobile?.url ?? null} onPick={() => onMedia("imageMobile")} onClear={() => onChange({ imageMobile: null })} />
        <MediaRow title="Βίντεο φόντου (προαιρετικό)" help="Σύντομο mp4 χωρίς ήχο, σε επανάληψη. Δεν παίζει με «εξοικονόμηση δεδομένων» ή «λιγότερη κίνηση» — τότε μένει η φωτογραφία." url={s.video?.url ?? null} video onPick={() => onMedia("video")} onClear={() => onChange({ video: null })} />
        <ProductField s={s} info={info} onPick={(id, p) => onProduct(id, p)} onClear={() => onProduct(null)} />
      </fieldset>

      <button type="button" onClick={onRemove} className={`${btn} justify-self-start border border-eu-red/40 text-eu-red hover:bg-eu-red/10`}><Trash2 className="size-4" aria-hidden /> Διαγραφή slide</button>
    </div>
  );
}

export function HeroSlidesEditor({ initial, hasPublished, publishedAt: pubAt, products: p0, settings, canUpload }: { initial: HeroDoc; hasPublished: boolean; publishedAt: string | null; products: Record<string, ProductInfo>; settings: Settings; canUpload: boolean }) {
  const [doc, setDoc] = useState<HeroDoc>(initial);
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(initial));
  const [published, setPublished] = useState(hasPublished);
  const [publishedAt, setPublishedAt] = useState(pubAt);
  const [products, setProducts] = useState(p0);
  const [openId, setOpenId] = useState<string | null>(initial.slides[0]?.id ?? null);
  const [issues, setIssues] = useState<Record<string, SlideIssue[]>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [picker, setPicker] = useState<{ id: string; field: Media } | null>(null);
  const [pending, start] = useTransition();
  const now = useMemo(() => new Date(), []);
  const dirty = JSON.stringify(doc) !== savedJson;

  const patch = (id: string, p: Partial<HeroSlideDoc>) => setDoc((d) => ({ slides: d.slides.map((s) => (s.id === id ? { ...s, ...p } : s)) }));
  const move = (id: string, dir: -1 | 1) => setDoc((d) => {
    const i = d.slides.findIndex((s) => s.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= d.slides.length) return d;
    const a = [...d.slides]; [a[i], a[j]] = [a[j], a[i]];
    return { slides: a };
  });
  const remove = (id: string) => { if (confirm("Διαγραφή του slide; Φεύγει από το site με την επόμενη δημοσίευση.")) setDoc((d) => ({ slides: d.slides.filter((s) => s.id !== id) })); };
  const add = () => { const s = emptySlide(); setDoc((d) => ({ slides: [...d.slides, s] })); setOpenId(s.id); };
  const loaded = (d: HeroDoc) => { setDoc(d); setSavedJson(JSON.stringify(d)); };

  const save = () => start(async () => { const r = await saveHeroAction(doc); loaded(r.doc); setMsg({ ok: true, text: "Το πρόχειρο αποθηκεύτηκε. Το site αλλάζει μόνο με τη «Δημοσίευση»." }); });
  const publish = () => {
    const v = validateDoc(doc);
    setIssues(v);
    if (Object.keys(v).length) { setOpenId(Object.keys(v)[0]); setMsg({ ok: false, text: "Διόρθωσε τα σημειωμένα πεδία και ξαναπάτα «Δημοσίευση»." }); return; }
    start(async () => {
      const r = await publishHeroAction(doc);
      if (!r.ok) { setIssues(r.issues); setOpenId(Object.keys(r.issues)[0] ?? null); setMsg({ ok: false, text: "Διόρθωσε τα σημειωμένα πεδία και ξαναπάτα «Δημοσίευση»." }); return; }
      loaded(r.doc); setPublished(true); setPublishedAt(r.publishedAt); setIssues({});
      setMsg({ ok: true, text: "Δημοσιεύτηκε — το βλέπουν τώρα οι επισκέπτες." });
    });
  };
  const revert = () => { if (confirm("Ακύρωση όλων των αλλαγών; Το πρόχειρο γυρίζει σε ό,τι δείχνει τώρα το site.")) start(async () => { const r = await revertHeroAction(); loaded(r.doc); setIssues({}); setMsg({ ok: true, text: "Το πρόχειρο γύρισε στο δημοσιευμένο." }); }); };

  const open = doc.slides.find((s) => s.id === openId) ?? null;
  const preview = open ? toHeroSlide(open, open.productId ? products[open.productId] ?? null : null) : null;
  const when = publishedAt ? new Date(publishedAt).toLocaleString("el-GR", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div className="grid gap-4 min-w-0">
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 py-2 bg-white/95 backdrop-blur border-b border-eu-line">
        <span className="mr-auto text-[length:var(--fs-14)] text-eu-ink-3 min-w-0">
          {dirty ? <b className="text-eu-red">Υπάρχουν αλλαγές που δεν έχουν αποθηκευτεί.</b> : published ? `Δημοσιευμένο${when ? ` · ${when}` : ""}` : "Δεν έχει δημοσιευτεί ακόμη — η αρχική δείχνει τα αρχικά slides."}
        </span>
        <button type="button" onClick={save} disabled={pending || !dirty} className={`${btn} border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`}>{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />} Αποθήκευση πρόχειρου</button>
        {published && <button type="button" onClick={revert} disabled={pending} className={`${btn} text-eu-ink-3 hover:bg-eu-surface`}><RotateCcw className="size-4" aria-hidden /> Επαναφορά</button>}
        <button type="button" onClick={publish} disabled={pending} className={`${btn} bg-eu-navy text-white hover:bg-eu-blue`}><Send className="size-4" aria-hidden /> Δημοσίευση</button>
      </div>
      {msg && <p role="status" className={`m-0 rounded-xl px-3 py-2 text-[length:var(--fs-14)] font-bold ${msg.ok ? "bg-eu-green/10 text-eu-green" : "bg-eu-red/10 text-eu-red"}`}>{msg.text}</p>}

      <div className="grid gap-4 @5xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] items-start">
        <ol className="m-0 p-0 list-none grid gap-2 min-w-0">
          {doc.slides.map((s, k) => {
            const st = slideStatus(s, now), isOpen = s.id === openId, iss = issues[s.id] ?? [];
            return (
              <li key={s.id} className={`rounded-2xl border bg-white min-w-0 ${isOpen ? "border-eu-navy" : iss.length ? "border-eu-red" : "border-eu-line"}`}>
                <div className="flex items-center gap-1 p-2">
                  <button type="button" onClick={() => setOpenId(isOpen ? null : s.id)} aria-expanded={isOpen} className="flex flex-1 min-w-0 items-center gap-3 text-left min-h-11">
                    <span className="relative size-12 shrink-0 rounded-lg overflow-hidden bg-eu-surface">{s.image.url && <Image src={s.image.url} alt="" fill sizes="48px" className="object-cover" unoptimized={unopt(s.image.url)} />}</span>
                    <span className="min-w-0">
                      <span className="block font-bold text-eu-ink truncate text-[length:var(--fs-15)]">{s.title.filter((t) => t.trim()).join(" ") || "Χωρίς τίτλο"}</span>
                      <span className={`inline-block mt-0.5 rounded-full px-2 py-0.5 text-[length:var(--fs-12)] font-bold ${TONE[st.tone]}`}>{st.label}</span>
                      {iss.length > 0 && <span className="ml-1.5 text-eu-red font-bold text-[length:var(--fs-12)]">Θέλει διόρθωση</span>}
                    </span>
                    <ChevronDown className={`size-4 ml-auto shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden />
                  </button>
                  <button type="button" aria-label="Μετακίνηση πιο πάνω" disabled={k === 0} onClick={() => move(s.id, -1)} className="size-11 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30"><ArrowUp className="size-4" aria-hidden /></button>
                  <button type="button" aria-label="Μετακίνηση πιο κάτω" disabled={k === doc.slides.length - 1} onClick={() => move(s.id, 1)} className="size-11 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30"><ArrowDown className="size-4" aria-hidden /></button>
                </div>
                {isOpen && (
                  <SlideForm s={s} issues={iss} info={s.productId ? products[s.productId] ?? null : null} onChange={(p) => patch(s.id, p)} onMedia={(field) => setPicker({ id: s.id, field })} onRemove={() => remove(s.id)}
                    onProduct={(id, info) => { if (id && info) setProducts((m) => ({ ...m, [id]: info })); patch(s.id, { productId: id, cutout: null, productHref: null }); }} />
                )}
              </li>
            );
          })}
          {doc.slides.length < MAX_SLIDES && <li><button type="button" onClick={add} className={`${btn} w-full border-2 border-dashed border-eu-line text-eu-navy hover:border-eu-navy`}><Plus className="size-4" aria-hidden /> Νέο slide</button></li>}
        </ol>

        <div className="grid gap-2 min-w-0 @5xl:sticky @5xl:top-16">
          <div className="inline-flex items-center gap-1.5 font-bold text-eu-ink-2 text-[length:var(--fs-14)]"><Smartphone className="size-4" aria-hidden /> Προεπισκόπηση</div>
          {preview ? (
            <div className="@container rounded-xl overflow-hidden">
              <SettingsProvider settings={settings}><CinematicHero key={JSON.stringify(preview)} slides={[preview]} /></SettingsProvider>
            </div>
          ) : <p className="m-0 rounded-xl bg-eu-surface p-4 text-eu-ink-3 text-[length:var(--fs-14)]">Άνοιξε ένα slide για να το δεις όπως θα φανεί.</p>}
          <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Το πραγματικό hero της αρχικής με τα στοιχεία του πρόχειρου. Στο site, δίπλα του μπαίνουν η προσφορά ημέρας, το κοντινότερο κατάστημα και οι υπηρεσίες.</p>
        </div>
      </div>

      {picker && (
        <MediaPickerDialog accept={[picker.field === "video" ? "video" : "image"]} canWrite={canUpload} onClose={() => setPicker(null)}
          onSelect={(a) => {
            const x = a[0];
            if (x) {
              const s = doc.slides.find((y) => y.id === picker.id);
              if (picker.field === "image") patch(picker.id, { image: { url: x.url, alt: s?.image.alt || x.alt || "" } });
              else if (picker.field === "imageMobile") patch(picker.id, { imageMobile: { url: x.url } });
              else patch(picker.id, { video: { url: x.url } });
            }
            setPicker(null);
          }} />
      )}
    </div>
  );
}
```

- [ ] **Step 3:** Στο `components/admin/nav.ts`, στη γραμμή του «Hero slides» σβήσε το `, soon: true`.
- [ ] **Step 4:** `npx tsc --noEmit -p . && npx eslint "app/admin/(shell)/cms/slides" components/admin/nav.ts` — χωρίς σφάλματα.
- [ ] **Step 5: Browser** (`/admin/cms/slides`, συνδεδεμένος χρήστης με `cms.slides.write`): εμφανίζονται 3 slides με «Έληξε 30/9», «Έληξε 30/9», «Μόνιμο»· άνοιγμα slide → φόρμα + προεπισκόπηση· νέο slide → «Δημοσίευση» δείχνει λάθη στα πεδία· στα 375px χωρίς οριζόντια κύλιση.
- [ ] **Step 6: Commit** — `git commit -m "Hero slides: επεξεργαστής με πρόχειρο/δημοσίευση και ζωντανή προεπισκόπηση"`

---

## Αυτοέλεγχος έναντι προδιαγραφών

- §1 δεδομένα → Task 1 (τύποι, `normalizeDoc`), Task 2 (CmsDocument). §2 βιτρίνα → Task 2 (`getLiveHeroSlides`, εφεδρεία), Task 3 (κινητό, τιμή). §3 διαχείριση → Tasks 4–5 (κατάσταση, σειρά, φόρμα, προεπισκόπηση, δημοσίευση/επαναφορά, λάθη δίπλα στα πεδία, audit, μενού). §4 μεταφορά → `DEFAULT_HERO_DOC` (Task 1). §5 έλεγχος → Task 1 tests, βήματα browser στα Tasks 2–5.
- Απόκλιση από τις προδιαγραφές: η «προεπισκόπηση στο site» είναι μέσα στον επεξεργαστή με το πραγματικό component (όχι ξεχωριστό URL)· η cache 60″ αντικαθίσταται από μία ανάγνωση ανά αίτημα (η αρχική είναι ήδη δυναμική).
