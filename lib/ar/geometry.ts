/**
 * Γεωμετρία του μοντέλου AR: όχι ένα «κουτί με φωτογραφία», αλλά ο όγκος της
 * συσκευής σε πραγματική κλίμακα, διαφανής, με κίτρινες ακμές ώστε να
 * φαίνεται καθαρά πόσο χώρο πιάνει, τη φωτογραφία (cutout) όρθια στην πρόσοψη,
 * ετικέτες διαστάσεων ψημένες στο μοντέλο (φαίνονται και στο Quick Look και
 * στο Scene Viewer, όπου δεν υπάρχει DOM) και το λογότυπο πάνω και πίσω.
 *
 * Μονάδες: μέτρα. Y προς τα πάνω, πάτωμα στο y=0, πρόσοψη προς +z, κέντρο
 * στο x=z=0 — έτσι το Quick Look και το WebXR το ακουμπούν στο πάτωμα σωστά.
 */
export type Vec3 = [number, number, number];
export interface Prim { name: string; material: string; positions: number[]; normals: number[]; uvs: number[]; indices: number[] }
export interface MaterialDef { name: string; color: [number, number, number]; alpha: number; texture?: string; mode: "opaque" | "blend" | "mask"; doubleSided?: boolean; roughness: number }

const add = (a: Vec3, b: Vec3, s = 1): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

/** Τετράγωνο με κέντρο c, άξονες u/v (μοναδιαία) και κανονικό u×v. UV κατά glTF (v=0 πάνω). */
function plane(out: Prim, c: Vec3, u: Vec3, v: Vec3, hu: number, hv: number, n: Vec3) {
  const base = out.positions.length / 3;
  const p0 = add(add(c, u, -hu), v, -hv), p1 = add(add(c, u, hu), v, -hv), p2 = add(add(c, u, hu), v, hv), p3 = add(add(c, u, -hu), v, hv);
  out.positions.push(...p0, ...p1, ...p2, ...p3);
  for (let i = 0; i < 4; i++) out.normals.push(...n);
  out.uvs.push(0, 1, 1, 1, 1, 0, 0, 0);
  out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

const X: Vec3 = [1, 0, 0], Y: Vec3 = [0, 1, 0], Z: Vec3 = [0, 0, 1], NX: Vec3 = [-1, 0, 0], NY: Vec3 = [0, -1, 0], NZ: Vec3 = [0, 0, -1];

/** Κλειστό κουτί με κέντρο c και διαστάσεις s (6 έδρες προς τα έξω). */
function box(out: Prim, c: Vec3, s: Vec3) {
  const [hx, hy, hz] = [s[0] / 2, s[1] / 2, s[2] / 2];
  plane(out, add(c, Z, hz), X, Y, hx, hy, Z);
  plane(out, add(c, NZ, hz), NX, Y, hx, hy, NZ);
  plane(out, add(c, X, hx), NZ, Y, hz, hy, X);
  plane(out, add(c, NX, hx), Z, Y, hz, hy, NX);
  plane(out, add(c, Y, hy), X, NZ, hx, hz, Y);
  plane(out, add(c, NY, hy), X, Z, hx, hz, NY);
}

const prim = (name: string, material: string): Prim => ({ name, material, positions: [], normals: [], uvs: [], indices: [] });

export interface LabelSpec { key: "w" | "h" | "d"; text: string }
export interface ModelSpec {
  dims: { w: number; h: number; d: number }; // cm
  /** λόγος πλάτος/ύψος των εικόνων ετικέτας και λογοτύπου, για σωστές αναλογίες των επιπέδων */
  labelAspect: number;
  logoAspect: number;
  /**
   * Η φωτογραφία: `face` = κατά μέτωπο, γεμίζει ακριβώς την πρόσοψη Π×Υ·
   * `billboard` = τραβηγμένη σε γωνία, στέκεται στο μέσο του βάθους με το
   * πραγματικό της ύψος Υ και τον δικό της λόγο πλευρών, ώστε το προϊόν να
   * φαίνεται να στέκεται μέσα στον όγκο του και όχι κολλημένο τεντωμένο μπροστά.
   */
  front: { mode: "face" | "billboard"; aspect: number };
  /** ποια μέρη: για δικό μας 3D μοντέλο θέλουμε μόνο το πλαίσιο (όγκος, ακμές, ετικέτες) γύρω του */
  parts?: { front?: boolean; logo?: boolean };
}

export function buildGeometry(spec: ModelSpec): { prims: Prim[]; materials: MaterialDef[]; frontAspect: number } {
  const w = spec.dims.w / 100, h = spec.dims.h / 100, d = spec.dims.d / 100;
  const maxDim = Math.max(w, h, d);
  const t = Math.min(0.015, Math.max(0.004, maxDim * 0.012)); // πάχος ακμής
  const gap = 0.002; // απόσταση επιπέδων από την έδρα, να μην τρεμοπαίζουν
  const prims: Prim[] = [];

  // 1. Διαφανής όγκος
  const vol = prim("volume", "volume");
  box(vol, [0, h / 2, 0], [w, h, d]);
  prims.push(vol);

  // 2. Δώδεκα ακμές
  const edges = prim("edges", "edge");
  const hx = w / 2, hz = d / 2;
  for (const y of [0, h]) {
    box(edges, [0, y, hz], [w + t, t, t]); box(edges, [0, y, -hz], [w + t, t, t]);
    box(edges, [hx, y, 0], [t, t, d + t]); box(edges, [-hx, y, 0], [t, t, d + t]);
  }
  for (const [x, z] of [[hx, hz], [-hx, hz], [hx, -hz], [-hx, -hz]]) box(edges, [x, h / 2, z], [t, h + t, t]);
  prims.push(edges);

  // 3. Η φωτογραφία
  const inset = t * 1.2;
  let fw: number, fh: number, fz: number;
  if (spec.front.mode === "face") {
    fw = Math.max(0.01, w - inset * 2); fh = Math.max(0.01, h - inset * 2); fz = hz + gap;
  } else {
    // ύψος = Υ, πλάτος από τον λόγο της φωτογραφίας, όχι πέρα από την οριζόντια διαγώνιο του όγκου
    fh = Math.max(0.01, h - inset * 2);
    fw = Math.min(fh * spec.front.aspect, Math.hypot(w, d));
    fz = 0;
  }
  if (spec.parts?.front !== false) {
    const front = prim("front", "front");
    plane(front, [0, h / 2, fz], X, Y, fw / 2, fh / 2, Z);
    prims.push(front);
  }

  // 4. Ετικέτες διαστάσεων: ύψος ανάλογο με το μέγεθος, ποτέ πιο φαρδιές από την έδρα
  const label = (name: string, c: Vec3, u: Vec3, v: Vec3, n: Vec3, faceW: number) => {
    let lh = Math.min(0.06, Math.max(0.022, maxDim * 0.075));
    let lw = lh * spec.labelAspect;
    if (lw > faceW * 0.85) { lw = faceW * 0.85; lh = lw / spec.labelAspect; }
    const p = prim(name, name);
    plane(p, c, u, v, lw / 2, lh / 2, n);
    prims.push(p);
    return lh;
  };
  const lhW = label("label-w", [0, t + 0.02 + 0.03, hz + gap * 2], X, Y, Z, w); // πλάτος: κάτω στην πρόσοψη
  label("label-h", [hx + gap * 2, h / 2, 0], NZ, Y, X, d); // ύψος: στη μέση της δεξιάς έδρας
  label("label-d", [hx + gap * 2, t + 0.02 + lhW, 0], NZ, Y, X, d); // βάθος: κάτω στη δεξιά έδρα

  // 5. Λογότυπο: πάνω έδρα (κοιτάει προς τα πίσω, όπως το βλέπεις από μπροστά) και πίσω έδρα
  const logo = (name: string, c: Vec3, u: Vec3, v: Vec3, n: Vec3, faceW: number, faceH: number) => {
    let lw = faceW * 0.45, lh = lw / spec.logoAspect;
    if (lh > faceH * 0.5) { lh = faceH * 0.5; lw = lh * spec.logoAspect; }
    const p = prim(name, "logo");
    plane(p, c, u, v, lw / 2, lh / 2, n);
    prims.push(p);
  };
  if (spec.parts?.logo !== false) logo("logo-top", [0, h + gap, 0], X, NZ, Y, w, d);
  // Το πίσω λογότυπο κοιτάει προς τα μέσα: μέσα από τον διαφανή όγκο διαβάζεται σωστά από μπροστά, που είναι η κύρια οπτική γωνία
  if (spec.parts?.logo !== false) logo("logo-back", [0, h / 2, -hz + gap], X, Y, Z, w, h);

  const materials: MaterialDef[] = [
    { name: "volume", color: [0.07, 0.165, 0.345], alpha: 0.16, mode: "blend", doubleSided: true, roughness: 0.6 },
    { name: "edge", color: [0.945, 0.769, 0], alpha: 1, mode: "opaque", roughness: 0.5 },
    { name: "front", color: [1, 1, 1], alpha: 1, texture: "front", mode: "mask", doubleSided: true, roughness: 0.8 },
    { name: "label-w", color: [1, 1, 1], alpha: 1, texture: "label-w", mode: "mask", doubleSided: true, roughness: 0.9 },
    { name: "label-h", color: [1, 1, 1], alpha: 1, texture: "label-h", mode: "mask", doubleSided: true, roughness: 0.9 },
    { name: "label-d", color: [1, 1, 1], alpha: 1, texture: "label-d", mode: "mask", doubleSided: true, roughness: 0.9 },
    { name: "logo", color: [1, 1, 1], alpha: 1, texture: "logo", mode: "mask", doubleSided: true, roughness: 0.9 },
  ];
  return { prims, materials, frontAspect: fw / fh };
}
