import "server-only";
import { buildGeometry, type Prim, type MaterialDef } from "./geometry";
import { labelTexture, LABEL_ASPECT } from "./textures";
import { parseGlb } from "./custom";
import type { Dims } from "@/lib/data/dims";

/**
 * Το πλαίσιο διαστάσεων (διαφανής όγκος, κίτρινες ακμές, ετικέτες Π/Υ/Β)
 * προστίθεται και γύρω από τα δικά μας 3D μοντέλα, ώστε ο πελάτης να βλέπει
 * πάντα πόσο χώρο πιάνει η συσκευή. Μπαίνει ως δεύτερος κόμβος στη σκηνή
 * του ίδιου GLB: τα δεδομένα του προσαρτώνται στο δυαδικό chunk, οι
 * περιγραφές του στο JSON. Σε συντεταγμένες μέτρων, ανεξάρτητο από τον
 * κόμβο-περιτύλιγμα του μοντέλου.
 */
const frameCache = new Map<string, { prims: Prim[]; materials: MaterialDef[]; textures: Record<string, Buffer> }>();

async function frameParts(dims: Dims) {
  const key = `${dims.w}|${dims.h}|${dims.d}`;
  const hit = frameCache.get(key);
  if (hit) return hit;
  const { prims, materials } = buildGeometry({ dims, labelAspect: LABEL_ASPECT, logoAspect: 4, front: { mode: "face", aspect: 1 }, parts: { front: false, logo: false } });
  const [lw, lh, ld] = await Promise.all([labelTexture("Π", dims.w), labelTexture("Υ", dims.h), labelTexture("Β", dims.d)]);
  const out = { prims, materials: materials.filter((m) => prims.some((p) => p.material === m.name)), textures: { "label-w": lw, "label-h": lh, "label-d": ld } };
  frameCache.set(key, out);
  return out;
}

export async function addFrameToGlb(buf: Buffer, dims: Dims): Promise<Buffer> {
  const g = parseGlb(buf);
  if (!g) return buf;
  const { prims, materials, textures } = await frameParts(dims);
  const json = g.json as Record<string, unknown> & { bufferViews?: object[]; accessors?: object[]; images?: object[]; textures?: object[]; samplers?: object[]; materials?: object[]; meshes?: object[]; nodes?: { children?: number[]; mesh?: number; name?: string }[]; scenes?: { nodes?: number[] }[]; scene?: number; buffers?: { byteLength: number }[] };
  // Το BIN chunk: μετά το JSON chunk
  const rest = g.rest;
  const binLen0 = rest.readUInt32LE(0);
  const binType = rest.readUInt32LE(4);
  if (binType !== 0x004e4942) return buf; // χωρίς ενσωματωμένο buffer — αφήνουμε το μοντέλο ως έχει
  const bin: Buffer[] = [rest.subarray(8, 8 + binLen0)];
  let binLen = binLen0;
  json.bufferViews ??= []; json.accessors ??= []; json.images ??= []; json.textures ??= []; json.samplers ??= []; json.materials ??= []; json.meshes ??= []; json.nodes ??= []; json.scenes ??= [{ nodes: [] }];
  const pushView = (data: Buffer, target?: number) => {
    const pad = (4 - (binLen % 4)) % 4; if (pad) { bin.push(Buffer.alloc(pad)); binLen += pad; }
    json.bufferViews!.push({ buffer: 0, byteOffset: binLen, byteLength: data.length, ...(target ? { target } : {}) });
    bin.push(data); binLen += data.length; return json.bufferViews!.length - 1;
  };
  const f32 = (a: number[]) => { const b = Buffer.alloc(a.length * 4); a.forEach((v, i) => b.writeFloatLE(v, i * 4)); return b; };
  const u32 = (a: number[]) => { const b = Buffer.alloc(a.length * 4); a.forEach((v, i) => b.writeUInt32LE(v, i * 4)); return b; };
  json.samplers.push({ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 });
  const samplerIdx = json.samplers.length - 1;
  const texIndex: Record<string, number> = {};
  for (const [k, png] of Object.entries(textures)) {
    json.images.push({ bufferView: pushView(png), mimeType: "image/png", name: `frame-${k}` });
    json.textures.push({ sampler: samplerIdx, source: json.images.length - 1 });
    texIndex[k] = json.textures.length - 1;
  }
  const matIndex: Record<string, number> = {};
  for (const m of materials) {
    json.materials.push({ name: `frame-${m.name}`, pbrMetallicRoughness: { baseColorFactor: [m.color[0], m.color[1], m.color[2], m.alpha], metallicFactor: 0, roughnessFactor: m.roughness, ...(m.texture && texIndex[m.texture] != null ? { baseColorTexture: { index: texIndex[m.texture] } } : {}) }, alphaMode: m.mode === "blend" ? "BLEND" : m.mode === "mask" ? "MASK" : "OPAQUE", ...(m.mode === "mask" ? { alphaCutoff: 0.5 } : {}), doubleSided: !!m.doubleSided });
    matIndex[m.name] = json.materials.length - 1;
  }
  const primitives = prims.map((p) => {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.positions.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p.positions[i + k]); mx[k] = Math.max(mx[k], p.positions[i + k]); }
    const a = json.accessors!.length;
    json.accessors!.push({ bufferView: pushView(f32(p.positions), 34962), componentType: 5126, count: p.positions.length / 3, type: "VEC3", min: mn, max: mx });
    json.accessors!.push({ bufferView: pushView(f32(p.normals), 34962), componentType: 5126, count: p.normals.length / 3, type: "VEC3" });
    json.accessors!.push({ bufferView: pushView(f32(p.uvs), 34962), componentType: 5126, count: p.uvs.length / 2, type: "VEC2" });
    json.accessors!.push({ bufferView: pushView(u32(p.indices), 34963), componentType: 5125, count: p.indices.length, type: "SCALAR" });
    return { attributes: { POSITION: a, NORMAL: a + 1, TEXCOORD_0: a + 2 }, indices: a + 3, material: matIndex[p.material], mode: 4 };
  });
  json.meshes.push({ name: "euronics-frame", primitives });
  json.nodes.push({ mesh: json.meshes.length - 1, name: "euronics-frame" });
  const scene = json.scenes[json.scene ?? 0] ?? (json.scenes[0] = { nodes: [] });
  scene.nodes = [...(scene.nodes ?? []), json.nodes.length - 1];
  json.buffers = [{ byteLength: binLen }];
  let jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
  const jpad = (4 - (jsonBuf.length % 4)) % 4; if (jpad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jpad, 0x20)]);
  let binBuf = Buffer.concat(bin);
  const bpad = (4 - (binBuf.length % 4)) % 4; if (bpad) binBuf = Buffer.concat([binBuf, Buffer.alloc(bpad)]);
  const head = Buffer.alloc(12); head.write("glTF", 0, "ascii"); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binBuf.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(binBuf.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, jh, jsonBuf, bh, binBuf]);
}
