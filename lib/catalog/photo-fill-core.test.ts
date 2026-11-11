import { test } from "node:test";
import assert from "node:assert/strict";
import { checkImage, nonPhotoName, plainPixel, sourceRank, pickPhotos, MAX_PER_PRODUCT, MIN_SIDE_PX, MIN_BYTES, type PhotoCandidate } from "./photo-fill-core";

const img = (over: Partial<PhotoCandidate> = {}): PhotoCandidate => ({
  id: "s1", source: "icecat", url: "https://example.com/photo.jpg", sourceName: "Icecat",
  probe: { bytes: 180_000, width: 1200, height: 1200, mime: "image/jpeg" }, ...over,
});

// ---------- έλεγχος μιας εικόνας ----------

test("καθαρή φωτογραφία προϊόντος περνά", () => assert.equal(checkImage(img().probe!), null));

test("μικρή ανάλυση κόβεται — μετράει η ΜΕΓΑΛΗ πλευρά, όπως ο έλεγχος πληρότητας", () => {
  assert.match(checkImage({ bytes: 90_000, width: 500, height: 500, mime: "image/jpeg" })!, /600/);
  assert.equal(checkImage({ bytes: 90_000, width: 952, height: 535, mime: "image/jpeg" }), null, "φωτογραφία κατασκευαστή 952×535 περνά");
  assert.equal(checkImage({ bytes: 90_000, width: 900, height: 900, mime: "image/jpeg" }), null);
  assert.equal(MIN_SIDE_PX, 600);
});

test("λωρίδες και κολλάζ κόβονται από την αναλογία", () => {
  // 662 × 200 του Icecat: περνά το 600 στη μεγάλη πλευρά, δεν είναι φωτογραφία προϊόντος
  assert.match(checkImage({ bytes: 90_000, width: 662, height: 200, mime: "image/jpeg" })!, /αναλογία/);
  assert.match(checkImage({ bytes: 90_000, width: 2400, height: 600, mime: "image/jpeg" })!, /αναλογία/);
  assert.equal(checkImage({ bytes: 90_000, width: 1800, height: 600, mime: "image/jpeg" }), null, "3:1 ακριβώς: δεκτό");
});

test("GIF και SVG δεν γίνονται φωτογραφίες προϊόντος", () => {
  assert.match(checkImage({ bytes: 90_000, width: 1200, height: 1200, mime: "image/gif" })!, /gif/i);
  assert.match(checkImage({ bytes: 90_000, width: 1200, height: 1200, mime: "image/svg+xml" })!, /svg/i);
  assert.match(checkImage({ bytes: 90_000, width: 1200, height: 1200, mime: "text/html" })!, /εικόνα/);
});

test("πολύ μικρά αρχεία είναι λογότυπα ή placeholders", () => {
  assert.match(checkImage({ bytes: 4_000, width: 1200, height: 1200, mime: "image/jpeg" })!, /KB/);
  assert.equal(checkImage({ bytes: MIN_BYTES, width: 1200, height: 1200, mime: "image/jpeg" }), null);
});

test("άγνωστες διαστάσεις: δεν αποθηκεύεται στα τυφλά", () => {
  assert.match(checkImage({ bytes: 90_000, width: null, height: null, mime: "image/jpeg" })!, /διαστάσεις/);
});

// ---------- προτεραιότητα πηγής ----------

test("Icecat και κατασκευαστής πριν από τα άλλα καταστήματα", () => {
  assert.ok(sourceRank("icecat") < sourceRank("shop"));
  assert.ok(sourceRank("web") < sourceRank("shop"));
  assert.ok(sourceRank("channel3") < sourceRank("shop"));
  assert.ok(sourceRank("icecat") < sourceRank("channel3"), "το Icecat είναι η επίσημη γκαλερί");
});

// ---------- επιλογή ανά προϊόν ----------

test("διαλέγει με σειρά πηγής, όχι με σειρά πρότασης", () => {
  const r = pickPhotos([
    img({ id: "a", source: "shop", url: "https://shop.gr/1.jpg" }),
    img({ id: "b", source: "web", url: "https://brand.com/1.jpg" }),
    img({ id: "c", source: "icecat", url: "https://icecat/1.jpg" }),
  ]);
  assert.deepEqual(r.take.map((x) => x.id), ["c", "b", "a"]);
  assert.deepEqual(r.review, []);
});

test("ώς 6 φωτογραφίες ανά προϊόν σε αυτό το πέρασμα", () => {
  const many = Array.from({ length: 10 }, (_, i) => img({ id: `i${i}`, url: `https://example.com/${i}.jpg` }));
  const r = pickPhotos(many);
  assert.equal(r.take.length, MAX_PER_PRODUCT);
  assert.equal(r.over, 4);
});

test("ό,τι κόβεται μπαίνει στη λίστα «θέλει μάτι» με τον λόγο", () => {
  const r = pickPhotos([
    img({ id: "ok" }),
    img({ id: "small", url: "https://example.com/s.jpg", probe: { bytes: 90_000, width: 300, height: 300, mime: "image/jpeg" } }),
    img({ id: "logo", url: "https://example.com/l.jpg", probe: { bytes: 2_000, width: 900, height: 900, mime: "image/jpeg" } }),
  ]);
  assert.deepEqual(r.take.map((x) => x.id), ["ok"]);
  assert.equal(r.review.length, 2);
  assert.match(r.review.map((x) => x.reason).join(" "), /600/);
  assert.match(r.review.map((x) => x.reason).join(" "), /KB/);
});

test("η ίδια διεύθυνση δύο φορές μετράει μία", () => {
  const r = pickPhotos([img({ id: "a" }), img({ id: "b" })]);
  assert.equal(r.take.length, 1);
  assert.equal(r.duplicates, 1);
});

test("πρόταση που δεν κατέβηκε καθόλου: θέλει μάτι, δεν αποθηκεύεται", () => {
  const r = pickPhotos([img({ id: "x", probe: null, error: "Ο server απάντησε 404 (δεν υπάρχει)." })]);
  assert.deepEqual(r.take, []);
  assert.match(r.review[0].reason, /404/);
});

test("χωρίς προτάσεις: τίποτα, χωρίς παράπονο", () => {
  const r = pickPhotos([]);
  assert.deepEqual(r.take, []);
  assert.deepEqual(r.review, []);
  assert.equal(r.over, 0);
});

test("ελάχιστη πλευρά και όγκος αρχείου είναι τα ίδια που ζητά ο έλεγχος πληρότητας", () => {
  assert.equal(MIN_SIDE_PX, 600);
  assert.equal(MIN_BYTES, 10_240);
});

test("σχέδια, ετικέτες και λογότυπα κόβονται από το όνομα, όσο μεγάλα κι αν είναι", () => {
  for (const u of ["https://x.com/tbc64010ttc-tdy64nxbk-drawing.jpg", "https://x.com/WM_dimensions_01.png", "https://x.com/energy-label.jpg", "https://x.com/a/logo.png", "https://x.com/dim.jpg"])
    assert.ok(nonPhotoName(u), u);
  for (const u of ["https://x.com/dm-1.jpg", "https://x.com/32gn600-b-01.jpg", "https://x.com/dimmer-switch.jpg", "https://x.com/Labelle_front.jpg"])
    assert.equal(nonPhotoName(u), null, u);
  const pick = pickPhotos([img({ id: "d", source: "web", url: "https://x.com/hob-drawing.jpg" }), img({ id: "p", url: "https://x.com/hob-front.jpg" })]);
  assert.deepEqual(pick.take.map((t) => t.id), ["p"]);
  assert.match(pick.review[0].reason, /drawing/);
});

test("χρωματιστό φόντο (banner) κόβεται· λευκό / γκρι / διάφανο περνά", () => {
  const base = { bytes: 90_000, width: 1920, height: 1080, mime: "image/jpeg" };
  assert.match(checkImage({ ...base, plainEdge: 0.05 })!, /φόντο/);
  assert.equal(checkImage({ ...base, plainEdge: 0.95 }), null);
  assert.equal(checkImage({ ...base, plainEdge: null }), null, "αν δεν μετρήθηκε, δεν κόβεται");
  assert.ok(plainPixel(255, 255, 255) && plainPixel(236, 236, 238) && plainPixel(10, 200, 30, 0));
  assert.ok(!plainPixel(220, 30, 40) && !plainPixel(120, 120, 120) && !plainPixel(250, 220, 190));
});
