import sharp from "sharp";

/** Καθαρή λογική pixel της «Αφαίρεσης φόντου» (χωρίς server-only, για tests). Χρήση: lib/catalog/photo-cutout.ts. */

/** Μονόχρωμο φόντο: χρώμα = διάμεσος της περιμέτρου· σβήνει (διαφάνεια) ό,τι μοιάζει, και κρατά τα κύρια σχήματα. */
export async function keyOutEdgeColour(bytes: Buffer, tol = 60) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const edge: number[] = [];
  for (let x = 0; x < w; x++) edge.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) edge.push(y * w, y * w + w - 1);
  const med = (c: number) => { const v = edge.map((i) => data[i * 4 + c]).sort((a, b) => a - b); return v[v.length >> 1]; };
  const bg = [med(0), med(1), med(2)];
  const near = (i: number) => Math.abs(data[i * 4] - bg[0]) + Math.abs(data[i * 4 + 1] - bg[1]) + Math.abs(data[i * 4 + 2] - bg[2]) <= tol;
  if (edge.filter(near).length / edge.length < 0.6) throw new Error("Η εικόνα δεν έχει μονόχρωμο φόντο (π.χ. σκηνικό κουζίνας) — χρειάζεται rembg ή remove.bg.");
  // σε όλη την εικόνα, όχι μόνο από τις άκρες: το φόντο φαίνεται και μέσα από καλάθια/σχάρες
  // και οι αποχρώσεις του (φόντο→λευκό: εικονίδια/γράμματα του banner, φόντο→μαύρο: σκιές) — όχι όταν το φόντο είναι γκρι
  const sat = Math.max(...bg) - Math.min(...bg);
  const tint = (i: number) => {
    if (sat < 40) return false;
    const p = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
    for (const [to, maxT] of [[255, 0.6], [0, 0.5]] as const) {
      const d = bg.map((c) => to - c), t = (d[0] * (p[0] - bg[0]) + d[1] * (p[1] - bg[1]) + d[2] * (p[2] - bg[2])) / (d[0] ** 2 + d[1] ** 2 + d[2] ** 2);
      if (t >= 0 && t <= maxT && Math.hypot(...p.map((v, c) => v - (bg[c] + t * d[c]))) <= 20) return true;
    }
    return false;
  };
  for (let i = 0; i < w * h; i++) if (near(i) || tint(i)) data[i * 4 + 3] = 0;
  // κρόσσι: pixel στο όριο που μοιάζουν ακόμη στο φόντο (anti-aliasing) → διάφανα, δύο περάσματα
  const nearLoose = (i: number) => Math.abs(data[i * 4] - bg[0]) + Math.abs(data[i * 4 + 1] - bg[1]) + Math.abs(data[i * 4 + 2] - bg[2]) <= tol * 2.5;
  for (let pass = 0; pass < 2; pass++) {
    const clear: number[] = [];
    for (let i = 0; i < w * h; i++) {
      if (!data[i * 4 + 3]) continue;
      const x = i % w;
      const edgeOf = (x > 0 && !data[(i - 1) * 4 + 3]) || (x < w - 1 && !data[(i + 1) * 4 + 3]) || (i >= w && !data[(i - w) * 4 + 3]) || (i + w < w * h && !data[(i + w) * 4 + 3]);
      if (edgeOf && nearLoose(i)) clear.push(i);
    }
    for (const i of clear) data[i * 4 + 3] = 0;
  }
  keepMain(data, w, h);
  return { data, info, saturated: sat >= 40 };
}

/**
 * Κρατά τα κύρια σχήματα (≥ minShare του μεγαλύτερου) — πετά μικρά εικονίδια/γράμματα του banner που δεν ακουμπούν το
 * προϊόν, αλλά κρατά ξεχωριστά κομμάτια του ίδιου προϊόντος (π.χ. ηχομπάρα + subwoofer).
 */
export function keepMain(data: Buffer | Uint8Array, w: number, h: number, minShare = 0.15) {
  const label = new Int32Array(w * h), sizes = [0];
  for (let s = 0; s < w * h; s++) {
    if (label[s] || data[s * 4 + 3] <= 24) continue;
    const id = sizes.length; let n = 0; const stack = [s]; label[s] = id;
    while (stack.length) {
      const i = stack.pop()!; n++;
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < w * h && !label[j] && data[j * 4 + 3] > 24) { label[j] = id; stack.push(j); }
    }
    sizes.push(n);
  }
  const min = Math.max(...sizes.slice(1)) * minShare;
  for (let i = 0; i < w * h; i++) if (sizes[label[i]] < min) data[i * 4 + 3] = 0;
}

/** Πλαίσιο γύρω από τα ορατά pixel (alpha > 24). */
export function alphaBox(data: Buffer | Uint8Array, w: number, h: number) {
  let l = w, t = h, r = -1, b = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 24) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
  return r < 0 ? null : { left: l, top: t, width: r - l + 1, height: b - t + 1 };
}
