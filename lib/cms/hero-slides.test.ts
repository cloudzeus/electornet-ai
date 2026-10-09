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
