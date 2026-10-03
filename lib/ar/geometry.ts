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

/** Μικρό οκτάεδρο («διαμάντι») — η κουκκίδα της διάστικτης γραμμής. 8 τρίγωνα, επίπεδες έδρες. */
function octa(out: Prim, c: Vec3, r: number) {
  const P: Vec3[] = [[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]];
  const F: [number, number, number][] = [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]];
  for (const [i, j, k] of F) {
    const base = out.positions.length / 3;
    const a = P[i], b = P[j], q = P[k];
    const nx = a[0] + b[0] + q[0], ny = a[1] + b[1] + q[1], nz = a[2] + b[2] + q[2];
    const nl = Math.hypot(nx, ny, nz) || 1;
    for (const v of [a, b, q]) { out.positions.push(c[0] + v[0], c[1] + v[1], c[2] + v[2]); out.normals.push(nx / nl, ny / nl, nz / nl); out.uvs.push(0, 0); }
    out.indices.push(base, base + 1, base + 2);
  }
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
  front: { mode: "face" | "billboard" | "top"; aspect: number };
  /**
   * solid = ρεαλιστικό σώμα στο χρώμα του προϊόντος με τη φωτογραφία στην πρόσοψη (προεπιλογή — στο AR μοιάζει με τη
   * συσκευή) · volume = διαφανής όγκος μέτρησης με κίτρινες ακμές (π.χ. γύρω από δικό μας 3D μοντέλο).
   */
  style?: "solid" | "volume";
  /** χρώμα σώματος (0–1) για το solid — από τη φωτογραφία */
  bodyColor?: [number, number, number];
  /** ποια μέρη: για δικό μας 3D μοντέλο θέλουμε μόνο το πλαίσιο (όγκος, ακμές, ετικέτες) γύρω του */
  parts?: { front?: boolean; logo?: boolean; /** ψημένες ετικέτες διαστάσεων· η προεπισκόπηση τις αντικαθιστά με ζωντανές HTML ετικέτες */ labels?: boolean };
}

export function buildGeometry(spec: ModelSpec): { prims: Prim[]; materials: MaterialDef[]; frontAspect: number } {
  const w = spec.dims.w / 100, h = spec.dims.h / 100, d = spec.dims.d / 100;
  const maxDim = Math.max(w, h, d);
  const t = Math.min(0.008, Math.max(0.003, maxDim * 0.006)); // πάχος ακμής: λεπτή γραμμή, όχι δοκάρι
  const gap = 0.002; // απόσταση επιπέδων από την έδρα, να μην τρεμοπαίζουν
  const prims: Prim[] = [];
  const solid = spec.style === "solid";

  // 1. Σώμα: συμπαγές (solid) ή διαφανής όγκος
  const vol = prim("volume", "volume");
  box(vol, [0, h / 2, 0], [w, h, d]);
  prims.push(vol);

  // 2. Οι δώδεκα ακμές ως σχέδιο μέτρησης: συμπαγείς γωνίες (σαν στόχαστρο) και ανάμεσά τους διακριτική
  // διάστικτη γραμμή από μικρά «διαμάντια». Τονίζει τον όγκο χωρίς να βαραίνει — τα περισσότερα προϊόντα δεν
  // θα έχουν 3D μοντέλο, οπότε το στερεό είναι αυτό που βλέπει ο πελάτης.
  const edges = prim("edges", "edge");
  const dots = prim("dots", "dot");
  const hx = w / 2, hz = d / 2;
  const spacing = Math.min(0.03, Math.max(0.01, maxDim * 0.028));
  const r = t * 0.75;
  const corners: Vec3[] = [];
  for (const x of [-hx, hx]) for (const y of [0, h]) for (const z of [-hz, hz]) corners.push([x, y, z]);
  const edgeList: [Vec3, Vec3][] = [];
  for (let i = 0; i < corners.length; i++) for (let j = i + 1; j < corners.length; j++) {
    const a = corners[i], b = corners[j];
    if ([0, 1, 2].filter((k) => a[k] !== b[k]).length === 1) edgeList.push([a, b]);
  }
  for (const [a, b] of solid ? [] : edgeList) {
    const axis = [0, 1, 2].find((k) => a[k] !== b[k])!;
    const len = Math.abs(b[axis] - a[axis]);
    const dir = Math.sign(b[axis] - a[axis]);
    const L = Math.min(0.06, len * 0.14); // μήκος της συμπαγούς γωνίας
    for (const [from, s] of [[a, dir], [b, -dir]] as [Vec3, number][]) {
      const c: Vec3 = [...from] as Vec3; c[axis] += (s * L) / 2;
      const size: Vec3 = [t, t, t]; size[axis] = L + t;
      box(edges, c, size);
    }
    const free = len - 2 * L - spacing;
    const n = Math.max(0, Math.floor(free / spacing));
    const start = L + (len - 2 * L - n * spacing) / 2 + spacing / 2;
    for (let k = 0; k < n; k++) {
      const c: Vec3 = [...a] as Vec3; c[axis] += dir * (start + k * spacing);
      octa(dots, c, r);
    }
  }
  if (!solid) prims.push(edges, dots);

  // 3. Η φωτογραφία
  const inset = t * 1.2;
  let fw: number, fh: number, fz: number;
  if (spec.front.mode === "face") {
    // solid: η φωτογραφία ΕΙΝΑΙ η πρόσοψη (χωρίς περιθώριο)· volume: λίγο μέσα από τις ακμές
    const ins = solid ? 0 : inset;
    fw = Math.max(0.01, w - ins * 2); fh = Math.max(0.01, h - ins * 2); fz = hz + gap;
  } else {
    // ύψος = Υ, πλάτος από τον λόγο της φωτογραφίας, όχι πέρα από την οριζόντια διαγώνιο του όγκου
    fh = Math.max(0.01, h - inset * 2);
    fw = Math.min(fh * spec.front.aspect, Math.hypot(w, d));
    fz = 0;
  }
  if (spec.front.mode === "top") { fw = w; fh = d; } // η πάνω έδρα: πλάτος × βάθος
  if (spec.parts?.front !== false) {
    const front = prim("front", "front");
    // top: πάνω στην πάνω έδρα, με το πάνω μέρος της φωτογραφίας προς τα πίσω (όπως τη βλέπεις από μπροστά)
    if (spec.front.mode === "top") plane(front, [0, h + gap, 0], X, NZ, w / 2, d / 2, Y);
    else plane(front, [0, h / 2, fz], X, Y, fw / 2, fh / 2, Z);
    prims.push(front);
  }

  // 4. Ετικέτες διαστάσεων: ύψος ανάλογο με το μέγεθος, ποτέ πιο φαρδιές ή ψηλές από την έδρα τους — σε χαμηλές
  // συσκευές (soundbar, εστία) δεν πρέπει να εξέχουν πάνω από το σώμα.
  const lhMax = Math.min(0.06, Math.max(0.022, maxDim * 0.075));
  const size = (faceW: number, faceH: number) => {
    let lh = Math.min(lhMax, faceH * 0.42), lw = lh * spec.labelAspect;
    if (lw > faceW * 0.85) { lw = faceW * 0.85; lh = lw / spec.labelAspect; }
    return [lw, lh] as const;
  };
  const label = (name: string, c: Vec3, u: Vec3, v: Vec3, n: Vec3, [lw, lh]: readonly [number, number]) => {
    const p = prim(name, name); // δικό της υλικό, μονής όψης: μέσα από τον διαφανή όγκο η απέναντι ετικέτα θα φαινόταν ανάποδα
    plane(p, c, u, v, lw / 2, lh / 2, n);
    prims.push(p);
  };
  // Κάθε ετικέτα και στην απέναντι έδρα, ώστε να διαβάζεται από όποια πλευρά κι αν το γυρίσει ο πελάτης
  if (spec.parts?.labels !== false) {
    const sw = size(w, h), ss = size(d, h);
    const yW = Math.min(t + 0.012 + sw[1] / 2, h / 2);
    label("label-w", [0, yW, hz + gap * 2], X, Y, Z, sw); // πλάτος: κάτω στην πρόσοψη
    label("label-w-back", [0, yW, -hz - gap * 2], NX, Y, NZ, sw); // …και στην πίσω έδρα
    const yD = t + 0.012 + ss[1] / 2;
    if (yD + ss[1] / 2 + 0.006 <= h / 2 - ss[1] / 2) {
      label("label-h", [hx + gap * 2, h / 2, 0], NZ, Y, X, ss); // ύψος: στη μέση της δεξιάς έδρας
      label("label-h-left", [-hx - gap * 2, h / 2, 0], Z, Y, NX, ss); // …και αριστερά
      label("label-d", [hx + gap * 2, yD, 0], NZ, Y, X, ss); // βάθος: κάτω στη δεξιά έδρα
      label("label-d-left", [-hx - gap * 2, yD, 0], Z, Y, NX, ss); // …και αριστερά
    } else {
      // χαμηλή συσκευή: δεν χωρούν δύο ετικέτες στην πλαϊνή έδρα — ύψος δεξιά, βάθος αριστερά
      label("label-h", [hx + gap * 2, h / 2, 0], NZ, Y, X, ss);
      label("label-d-left", [-hx - gap * 2, h / 2, 0], Z, Y, NX, ss);
    }
  }

  // 5. Λογότυπο: πάνω έδρα (κοιτάει προς τα πίσω, όπως το βλέπεις από μπροστά) και πίσω έδρα
  const logo = (name: string, c: Vec3, u: Vec3, v: Vec3, n: Vec3, faceW: number, faceH: number) => {
    let lw = faceW * 0.45, lh = lw / spec.logoAspect;
    if (lh > faceH * 0.5) { lh = faceH * 0.5; lw = lh * spec.logoAspect; }
    const p = prim(name, "logo");
    plane(p, c, u, v, lw / 2, lh / 2, n);
    prims.push(p);
  };
  // Στο ρεαλιστικό σώμα χωρίς λογότυπο: η συσκευή δεν έχει σήμα Euronics πάνω της (το σήμα είναι στον viewer)
  if (!solid && spec.front.mode !== "top" && spec.parts?.logo !== false) logo("logo-top", [0, h + gap, 0], X, NZ, Y, w, d);
  // Το πίσω λογότυπο κοιτάει προς τα μέσα: μέσα από τον διαφανή όγκο διαβάζεται σωστά από μπροστά, που είναι η κύρια οπτική γωνία
  if (!solid && spec.parts?.logo !== false) logo("logo-back", [0, h / 2, -hz + gap], X, Y, Z, w, h);

  const materials: MaterialDef[] = [
    solid
      ? { name: "volume", color: spec.bodyColor ?? [0.93, 0.93, 0.93], alpha: 1, mode: "opaque", doubleSided: false, roughness: 0.45 }
      : { name: "volume", color: [0.07, 0.165, 0.345], alpha: 0.09, mode: "blend", doubleSided: true, roughness: 0.6 },
    { name: "edge", color: [0.945, 0.769, 0], alpha: 1, mode: "opaque", roughness: 0.5 },
    { name: "dot", color: [0.945, 0.769, 0], alpha: 1, mode: "opaque", roughness: 0.4 },
    { name: "front", color: [1, 1, 1], alpha: 1, texture: "front", mode: solid ? "opaque" : "mask", doubleSided: !solid, roughness: solid ? 0.45 : 0.8 },
    ...(["label-w", "label-w-back", "label-h", "label-h-left", "label-d", "label-d-left"] as const).map((n): MaterialDef => ({ name: n, color: [1, 1, 1], alpha: 1, texture: n.replace(/-(back|left)$/, ""), mode: "mask", doubleSided: false, roughness: 0.9 })),
    { name: "logo", color: [1, 1, 1], alpha: 1, texture: "logo", mode: "mask", doubleSided: true, roughness: 0.9 },
  ];
  // μόνο τα υλικά που χρησιμοποιούνται (π.χ. χωρίς τις διπλές ετικέτες σε χαμηλές συσκευές)
  return { prims, materials: materials.filter((m) => prims.some((p) => p.material === m.name)), frontAspect: fw / fh };
}

/**
 * Τηλεόραση: δεν στηρίζεται σε φωτογραφία (οι φωτογραφίες είναι υπό γωνία και με τη βάση). Λεπτό μαύρο πάνελ με
 * γυαλιστερή οθόνη και λεπτό πλαίσιο, στις πραγματικές διαστάσεις (βλ. `TvSpec`): με `stand` (έπιπλο) κάθεται σε
 * κεντρική βάση με το δηλωμένο ύψος και βάθος, χωρίς (τοίχος) η πλάτη του ακουμπά στον τοίχο. Πρόσοψη προς +Z,
 * κάτω άκρη στο y=0 (ή πάνω στη βάση), κέντρο στο x=0· με βάση, όλο το αποτύπωμα κεντραρισμένο στο z=0.
 */
export interface TvGeom { w: number; panelH: number; panelD: number; standH: number; standD: number }

export function buildTvGeometry(spec: { tv: TvGeom; stand: boolean; labelAspect: number; labels: boolean }): { prims: Prim[]; materials: MaterialDef[] } {
  const w = spec.tv.w / 100, h = spec.tv.panelH / 100;
  const pd = Math.min(0.1, Math.max(0.008, spec.tv.panelD / 100));
  const standH = spec.stand ? Math.max(0.02, spec.tv.standH / 100) : 0;
  const baseD = spec.stand ? Math.min(0.55, Math.max(0.12, spec.tv.standD / 100)) : pd;
  const y0 = standH;
  // με βάση: το πάνελ λίγο πίσω από το κέντρο της βάσης, όπως στις περισσότερες τηλεοράσεις
  const pz = spec.stand ? Math.min(0, -baseD / 2 + pd / 2 + baseD * 0.3) : 0;
  const prims: Prim[] = [];
  const body = prim("tv-body", "tv-body");
  box(body, [0, y0 + h / 2, pz], [w, h, pd]);
  prims.push(body);
  // οθόνη: λεπτό πλαίσιο γύρω, λίγο φαρδύτερο κάτω (εκεί συνήθως το λογότυπο)
  const bz = Math.max(0.006, w * 0.008), bzB = bz * 1.6;
  const sw = w - 2 * bz, sh = h - bz - bzB;
  const screen = prim("tv-screen", "tv-screen");
  plane(screen, [0, y0 + bzB + sh / 2, pz + pd / 2 + 0.0015], X, Y, sw / 2, sh / 2, Z);
  prims.push(screen);
  if (spec.stand) {
    const stand = prim("tv-stand", "tv-stand");
    const baseW = Math.min(w * 0.42, 0.65);
    box(stand, [0, 0.008, 0], [baseW, 0.016, baseD]); // πλάκα βάσης
    const neckD = Math.max(0.03, Math.min(0.06, pd * 0.8));
    box(stand, [0, (standH + 0.04) / 2, pz - pd * 0.1], [Math.max(0.06, w * 0.06), standH + 0.04, neckD]); // λαιμός, μπαίνει λίγο μέσα στο πάνελ
    prims.push(stand);
  }
  if (spec.labels) {
    const maxDim = Math.max(w, h);
    const lab = (name: string, c: Vec3, u: Vec3, v: Vec3, n: Vec3, faceW: number) => {
      let lh = Math.min(0.06, Math.max(0.022, maxDim * 0.06)), lw = lh * spec.labelAspect;
      if (lw > faceW * 0.85) { lw = faceW * 0.85; lh = lw / spec.labelAspect; }
      const p = prim(name, name);
      plane(p, c, u, v, lw / 2, lh / 2, n);
      prims.push(p);
      return lh;
    };
    // σε σειρά στο κάτω μέρος της οθόνης: Υ · Π · Β
    const ly = y0 + bzB + Math.min(0.06, Math.max(0.022, maxDim * 0.06)) / 2 + 0.015;
    const lz = pz + pd / 2 + 0.004;
    lab("label-h", [-w * 0.31, ly, lz], X, Y, Z, w * 0.3);
    lab("label-w", [0, ly, lz], X, Y, Z, w * 0.3);
    lab("label-d", [w * 0.31, ly, lz], X, Y, Z, w * 0.3);
  }
  const materials: MaterialDef[] = [
    { name: "tv-body", color: [0.012, 0.012, 0.014], alpha: 1, mode: "opaque", roughness: 0.35 },
    { name: "tv-screen", color: [1, 1, 1], alpha: 1, texture: "screen", mode: "opaque", roughness: 0.12 },
    { name: "tv-stand", color: [0.03, 0.03, 0.035], alpha: 1, mode: "opaque", roughness: 0.3 },
    ...(["label-w", "label-h", "label-d"] as const).map((n): MaterialDef => ({ name: n, color: [1, 1, 1], alpha: 1, texture: n, mode: "mask", doubleSided: false, roughness: 0.9 })),
  ];
  return { prims, materials };
}
