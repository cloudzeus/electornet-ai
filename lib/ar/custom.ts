/**
 * Ανεβασμένα μοντέλα GLB από τη διαχείριση: έλεγχος ότι είναι έγκυρο glTF
 * binary, μέτρηση του όγκου του (για σύγκριση με τις δηλωμένες διαστάσεις)
 * και, αν ζητηθεί, κλιμάκωση ώστε να ταιριάζει — τυλίγουμε τις ρίζες της
 * σκηνής σε έναν κόμβο με scale, χωρίς να αγγίξουμε τη γεωμετρία.
 */
type Mat = number[]; // 4×4, column-major όπως στο glTF
interface Gltf { asset?: { version?: string }; scene?: number; scenes?: { nodes?: number[] }[]; nodes?: { children?: number[]; mesh?: number; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }[]; meshes?: { primitives: { attributes: Record<string, number> }[] }[]; accessors?: { min?: number[]; max?: number[] }[]; [k: string]: unknown }

export interface Box { w: number; h: number; d: number; min?: number[]; max?: number[] }
export type GlbInfo = { ok: true; box: Box; nodes: number; meshes: number; version: string } | { ok: false; error: string };

const I: Mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const mul = (a: Mat, b: Mat): Mat => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const trs = (n: { matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }): Mat => {
  if (n.matrix?.length === 16) return n.matrix;
  const [tx, ty, tz] = n.translation ?? [0, 0, 0], [qx, qy, qz, qw] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
  return [
    (1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
    2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
    2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
};
const apply = (m: Mat, p: number[]) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];

/** Παλιό όνομα — ομοιόμορφη κλίμακα μόνο. */
export const scaleGlb = (buf: Buffer, factor: number) => transformGlb(buf, { scale: factor });

/**
 * Αυτόματη περιστροφή: αν ο μακρύς οριζόντιος άξονας του μοντέλου δεν
 * συμφωνεί με τις δηλωμένες διαστάσεις (π.χ. κλιματιστικό με το μήκος του
 * κατά μήκος του Z), γυρίζουμε 90° ώστε πλάτος→X και βάθος→Z.
 */
export function autoRotationY(box: Box | null, dims: { w: number; d: number } | null): number {
  if (!box || !dims || !box.w || !box.d) return 0;
  const modelWide = box.w / box.d, realWide = dims.w / dims.d;
  const asIs = Math.abs(Math.log(modelWide / realWide)), turned = Math.abs(Math.log((1 / modelWide) / realWide));
  return turned + 0.15 < asIs ? 90 : 0;
}

export function parseGlb(buf: Buffer): { json: Gltf; jsonLen: number; rest: Buffer } | null {
  if (buf.length < 20 || buf.toString("ascii", 0, 4) !== "glTF" || buf.readUInt32LE(4) !== 2) return null;
  const jsonLen = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== 0x4e4f534a) return null;
  try { return { json: JSON.parse(buf.toString("utf8", 20, 20 + jsonLen)) as Gltf, jsonLen, rest: buf.subarray(20 + jsonLen) }; } catch { return null; }
}

export function inspectGlb(buf: Buffer): GlbInfo {
  const g = parseGlb(buf);
  if (!g) return { ok: false, error: "Δεν είναι έγκυρο GLB (glTF 2.0 binary)." };
  const { json } = g;
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  const visit = (idx: number, parent: Mat, depth: number) => {
    const n = json.nodes?.[idx]; if (!n || depth > 64) return;
    const m = mul(parent, trs(n));
    if (n.mesh != null) for (const prim of json.meshes?.[n.mesh]?.primitives ?? []) {
      const acc = json.accessors?.[prim.attributes.POSITION];
      if (!acc?.min || !acc.max) continue;
      for (const x of [acc.min[0], acc.max[0]]) for (const y of [acc.min[1], acc.max[1]]) for (const z of [acc.min[2], acc.max[2]]) {
        const p = apply(m, [x, y, z]); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
      }
    }
    for (const c of n.children ?? []) visit(c, m, depth + 1);
  };
  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? json.nodes?.map((_, i) => i) ?? [];
  for (const r of roots) visit(r, I, 0);
  if (!Number.isFinite(mn[0])) return { ok: false, error: "Το GLB δεν έχει γεωμετρία με όρια (accessor min/max)." };
  const cm = (v: number) => Math.round(v * 1000) / 10;
  return { ok: true, box: { w: cm(mx[0] - mn[0]), h: cm(mx[1] - mn[1]), d: cm(mx[2] - mn[2]), min: mn.map((v) => Math.round(v * 1e4) / 1e4), max: mx.map((v) => Math.round(v * 1e4) / 1e4) }, nodes: json.nodes?.length ?? 0, meshes: json.meshes?.length ?? 0, version: json.asset?.version ?? "?" };
}

/**
 * Νέο GLB με τις ρίζες τυλιγμένες σε κόμβο που κλιμακώνει, περιστρέφει γύρω
 * από τον κατακόρυφο άξονα και ακουμπά το μοντέλο στο πάτωμα κεντραρισμένο
 * — το Tripo και πολλοί κατασκευαστές βγάζουν μοντέλα κεντραρισμένα στο
 * μηδέν (μισό κάτω από το πάτωμα) ή στραμμένα με την πρόσοψη προς +X.
 */
export function transformGlb(buf: Buffer, opts: { scale?: number | [number, number, number]; rotationY?: number; bounds?: { min: number[]; max: number[] } | null }): Buffer {
  const g = parseGlb(buf);
  const sc: [number, number, number] = Array.isArray(opts.scale) ? opts.scale : [opts.scale ?? 1, opts.scale ?? 1, opts.scale ?? 1];
  const rot = ((opts.rotationY ?? 0) % 360 + 360) % 360;
  if (!g || (sc.every((v) => Math.abs(v - 1) < 1e-4) && rot === 0 && !opts.bounds)) return buf;
  const { json, rest } = g;
  const sceneIdx = json.scene ?? 0;
  const scene = json.scenes?.[sceneIdx];
  if (!scene || !json.nodes) return buf;
  const half = (rot * Math.PI) / 360;
  const q = [0, Math.sin(half), 0, Math.cos(half)];
  const node: { children: number[]; scale: number[]; rotation: number[]; translation?: number[]; name: string } = { children: scene.nodes ?? [], scale: sc, rotation: q, name: "euronics-fit" };
  if (opts.bounds) {
    // Γωνίες του κουτιού μέσα από R·S → πού καταλήγει το κουτί → μετατόπιση ώστε κάτω=0, κέντρο x/z=0
    const m = trs({ rotation: q, scale: node.scale });
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const x of [opts.bounds.min[0], opts.bounds.max[0]]) for (const y of [opts.bounds.min[1], opts.bounds.max[1]]) for (const z of [opts.bounds.min[2], opts.bounds.max[2]]) { const p = apply(m, [x, y, z]); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); } }
    node.translation = [-(mn[0] + mx[0]) / 2, -mn[1], -(mn[2] + mx[2]) / 2];
  }
  json.nodes.push(node);
  scene.nodes = [json.nodes.length - 1];
  let jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
  const pad = (4 - (jsonBuf.length % 4)) % 4;
  if (pad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(pad, 0x20)]);
  const head = Buffer.alloc(12); head.write("glTF", 0, "ascii"); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jsonBuf.length + rest.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  return Buffer.concat([head, jh, jsonBuf, rest]);
}

/**
 * Κλίμακα ανά άξονα ώστε το μοντέλο να πιάνει ακριβώς Π×Υ×Β. Οι άξονες
 * δίνονται στο τοπικό σύστημα του μοντέλου: με περιστροφή 90°/270° ο τοπικός
 * X καταλήγει στο βάθος και ο τοπικός Z στο πλάτος.
 */
export function fitScale(box: Box | null, dims: { w: number; h: number; d: number } | null, rotationY: number, mode: "box" | "height" | "none"): number | [number, number, number] {
  if (!box || !dims || mode === "none" || !box.h) return 1;
  const sy = dims.h / box.h;
  if (mode === "height") return sy;
  const turned = (((rotationY % 360) + 360) % 360) % 180 === 90;
  const sx = (turned ? dims.d : dims.w) / (box.w || 1);
  const sz = (turned ? dims.w : dims.d) / (box.d || 1);
  return [sx, sy, sz];
}
