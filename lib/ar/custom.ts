/**
 * Ανεβασμένα μοντέλα GLB από τη διαχείριση: έλεγχος ότι είναι έγκυρο glTF
 * binary, μέτρηση του όγκου του (για σύγκριση με τις δηλωμένες διαστάσεις)
 * και, αν ζητηθεί, κλιμάκωση ώστε να ταιριάζει — τυλίγουμε τις ρίζες της
 * σκηνής σε έναν κόμβο με scale, χωρίς να αγγίξουμε τη γεωμετρία.
 */
type Mat = number[]; // 4×4, column-major όπως στο glTF
interface Gltf { asset?: { version?: string }; scene?: number; scenes?: { nodes?: number[] }[]; nodes?: { children?: number[]; mesh?: number; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }[]; meshes?: { primitives: { attributes: Record<string, number> }[] }[]; accessors?: { min?: number[]; max?: number[] }[]; [k: string]: unknown }

export type GlbInfo = { ok: true; box: { w: number; h: number; d: number }; nodes: number; meshes: number; version: string } | { ok: false; error: string };

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
  return { ok: true, box: { w: cm(mx[0] - mn[0]), h: cm(mx[1] - mn[1]), d: cm(mx[2] - mn[2]) }, nodes: json.nodes?.length ?? 0, meshes: json.meshes?.length ?? 0, version: json.asset?.version ?? "?" };
}

/** Επιστρέφει νέο GLB με τις ρίζες τυλιγμένες σε κόμβο με ομοιόμορφο scale. */
export function scaleGlb(buf: Buffer, factor: number): Buffer {
  const g = parseGlb(buf);
  if (!g || Math.abs(factor - 1) < 1e-4) return buf;
  const { json, rest } = g;
  const sceneIdx = json.scene ?? 0;
  const scene = json.scenes?.[sceneIdx];
  if (!scene || !json.nodes) return buf;
  json.nodes.push({ children: scene.nodes ?? [], scale: [factor, factor, factor], ...( { name: "euronics-fit" } as object) });
  scene.nodes = [json.nodes.length - 1];
  let jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
  const pad = (4 - (jsonBuf.length % 4)) % 4;
  if (pad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(pad, 0x20)]);
  const head = Buffer.alloc(12); head.write("glTF", 0, "ascii"); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jsonBuf.length + rest.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  return Buffer.concat([head, jh, jsonBuf, rest]);
}
