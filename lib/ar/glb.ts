import type { Prim, MaterialDef } from "./geometry";

/**
 * Γράφει ένα binary glTF 2.0 (GLB) από τις γεωμετρίες και τα υλικά — χωρίς
 * βιβλιοθήκη, ώστε να τρέχει σε κάθε server. Ένα mesh, ένα primitive ανά
 * υλικό, υφές PNG ενσωματωμένες στο δυαδικό chunk.
 */
export function writeGlb(prims: Prim[], materials: MaterialDef[], textures: Record<string, Buffer>, name: string): Buffer {
  const bin: Buffer[] = [];
  let binLen = 0;
  const bufferViews: object[] = [];
  const pushView = (data: Buffer, target?: number) => {
    const pad = (4 - (binLen % 4)) % 4;
    if (pad) { bin.push(Buffer.alloc(pad)); binLen += pad; }
    bufferViews.push({ buffer: 0, byteOffset: binLen, byteLength: data.length, ...(target ? { target } : {}) });
    bin.push(data); binLen += data.length;
    return bufferViews.length - 1;
  };
  const accessors: object[] = [];
  const f32 = (arr: number[]) => { const b = Buffer.alloc(arr.length * 4); arr.forEach((v, i) => b.writeFloatLE(v, i * 4)); return b; };
  const u32 = (arr: number[]) => { const b = Buffer.alloc(arr.length * 4); arr.forEach((v, i) => b.writeUInt32LE(v, i * 4)); return b; };

  const images: object[] = [], texs: object[] = [];
  const texIndex: Record<string, number> = {};
  for (const [key, png] of Object.entries(textures)) {
    const view = pushView(png);
    images.push({ bufferView: view, mimeType: "image/png", name: key });
    texs.push({ sampler: 0, source: images.length - 1 });
    texIndex[key] = texs.length - 1;
  }

  const mats = materials.map((m) => ({
    name: m.name,
    pbrMetallicRoughness: { baseColorFactor: [m.color[0], m.color[1], m.color[2], m.alpha], metallicFactor: 0, roughnessFactor: m.roughness, ...(m.texture && texIndex[m.texture] != null ? { baseColorTexture: { index: texIndex[m.texture] } } : {}) },
    alphaMode: m.mode === "blend" ? "BLEND" : m.mode === "mask" ? "MASK" : "OPAQUE",
    ...(m.mode === "mask" ? { alphaCutoff: 0.5 } : {}),
    doubleSided: !!m.doubleSided,
  }));
  const matIndex = Object.fromEntries(materials.map((m, i) => [m.name, i]));

  const primitives = prims.map((p) => {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.positions.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p.positions[i + k]); mx[k] = Math.max(mx[k], p.positions[i + k]); }
    const pos = pushView(f32(p.positions), 34962), nor = pushView(f32(p.normals), 34962), uv = pushView(f32(p.uvs), 34962), idx = pushView(u32(p.indices), 34963);
    accessors.push({ bufferView: pos, componentType: 5126, count: p.positions.length / 3, type: "VEC3", min: mn, max: mx });
    accessors.push({ bufferView: nor, componentType: 5126, count: p.normals.length / 3, type: "VEC3" });
    accessors.push({ bufferView: uv, componentType: 5126, count: p.uvs.length / 2, type: "VEC2" });
    accessors.push({ bufferView: idx, componentType: 5125, count: p.indices.length, type: "SCALAR" });
    const a = accessors.length - 4;
    return { attributes: { POSITION: a, NORMAL: a + 1, TEXCOORD_0: a + 2 }, indices: a + 3, material: matIndex[p.material], mode: 4 };
  });

  const json = {
    asset: { version: "2.0", generator: "euronics-ar/2" },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name }],
    meshes: [{ name, primitives }],
    materials: mats, textures: texs, images, samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
    accessors, bufferViews, buffers: [{ byteLength: binLen }],
  };
  let jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
  const jpad = (4 - (jsonBuf.length % 4)) % 4;
  if (jpad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jpad, 0x20)]);
  const binBuf = Buffer.concat(bin);
  const bpad = (4 - (binBuf.length % 4)) % 4;
  const binAll = bpad ? Buffer.concat([binBuf, Buffer.alloc(bpad)]) : binBuf;
  const total = 12 + 8 + jsonBuf.length + 8 + binAll.length;
  const head = Buffer.alloc(12); head.write("glTF", 0, "ascii"); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(binAll.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, jh, jsonBuf, bh, binAll]);
}
