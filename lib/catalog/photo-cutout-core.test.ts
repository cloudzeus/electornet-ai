import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { alphaBox, keepMain, keyOutEdgeColour } from "./photo-cutout-core";

// κόκκινο banner 120×80 με γκρι «προϊόν» 40×40 στη μέση και ένα ξεχωριστό λευκό εικονίδιο-απόχρωση πάνω αριστερά
async function banner() {
  const red = { r: 220, g: 30, b: 40 };
  return sharp({ create: { width: 120, height: 80, channels: 3, background: red } }).composite([
    { input: { create: { width: 40, height: 40, channels: 3, background: { r: 150, g: 150, b: 150 } } }, left: 40, top: 20 },
    { input: { create: { width: 6, height: 6, channels: 3, background: { r: 30, g: 30, b: 30 } } }, left: 5, top: 5 },
  ]).png().toBuffer();
}

test("μονόχρωμο φόντο: μένει μόνο το προϊόν (το μικρό εικονίδιο φεύγει)", async () => {
  const { data, info } = await keyOutEdgeColour(await banner());
  assert.deepEqual(alphaBox(data, info.width, info.height), { left: 40, top: 20, width: 40, height: 40 });
});

test("σκηνικό χωρίς μονόχρωμο φόντο → σφάλμα (χρειάζεται AI)", async () => {
  const noisy = Buffer.alloc(60 * 40 * 3).map((_, i) => (i * 97) % 256);
  const png = await sharp(noisy, { raw: { width: 60, height: 40, channels: 3 } }).png().toBuffer();
  await assert.rejects(keyOutEdgeColour(png), /μονόχρωμο φόντο/);
});

test("keepMain πετά τα μικρά κομμάτια, κρατά τα μεγάλα (π.χ. subwoofer δίπλα στην ηχομπάρα)", () => {
  const w = 30, h = 1, d = new Uint8Array(w * h * 4);
  for (const x of [0, ...Array.from({ length: 10 }, (_, k) => 3 + k), ...Array.from({ length: 5 }, (_, k) => 20 + k)]) d[x * 4 + 3] = 255;
  keepMain(d, w, h);
  assert.equal(d[0 * 4 + 3], 0); // 1 pixel < 15% των 10 → φεύγει
  assert.equal(d[20 * 4 + 3], 255); // 5 pixel ≥ 15% → μένει
  assert.deepEqual(alphaBox(d, w, h), { left: 3, top: 0, width: 22, height: 1 });
});
