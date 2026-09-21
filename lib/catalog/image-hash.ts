import sharp from "sharp";

/**
 * Οπτικό αποτύπωμα εικόνας (dHash 16×16 = 256 bit): γκρι, 17×16 pixel, και για κάθε
 * pixel «είναι πιο φωτεινό από το δεξί του;». Η ίδια λήψη σε άλλο μέγεθος, άλλη
 * συμπίεση ή άλλο format δίνει σχεδόν το ίδιο αποτύπωμα· άλλη γωνία του ίδιου
 * προϊόντος δίνει άλλο.
 */
export async function dHash(input: Buffer): Promise<string> {
  const W = 17, H = 16;
  const px = await sharp(input).flatten({ background: "#fff" }).greyscale().resize(W, H, { fit: "fill", kernel: "cubic" }).raw().toBuffer();
  let hex = "", nibble = 0, bits = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W - 1; x++) {
    nibble = (nibble << 1) | (px[y * W + x] > px[y * W + x + 1] ? 1 : 0);
    if (++bits === 4) { hex += nibble.toString(16); nibble = 0; bits = 0; }
  }
  return hex;
}

const POP = Array.from({ length: 16 }, (_, i) => i.toString(2).split("1").length - 1);
/** Πόσα bit διαφέρουν (0–256). */
export function hamming(a: string, b: string): number {
  if (a.length !== b.length) return 256;
  let d = 0;
  for (let i = 0; i < a.length; i++) d += POP[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  return d;
}
