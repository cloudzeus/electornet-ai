import { crc32 } from "node:zlib";
import type { Prim, MaterialDef } from "./geometry";

/**
 * USDZ για το AR Quick Look του iPhone/iPad: USDA (κείμενο) + υφές PNG μέσα
 * σε zip χωρίς συμπίεση, με κάθε αρχείο ευθυγραμμισμένο στα 64 byte, όπως
 * απαιτεί η προδιαγραφή. Το Quick Look διαβάζει usda κανονικά — δεν
 * χρειάζεται το δυαδικό usdc, άρα ούτε η βιβλιοθήκη USD στον server.
 *
 * Το glTF έχει UV με v=0 πάνω, το USD με v=0 κάτω: αντιστρέφουμε το v.
 */
const f = (n: number) => (Math.round(n * 1e5) / 1e5).toString();

function meshUsda(p: Prim, safe: (s: string) => string, doubleSided: boolean): string {
  const pts: string[] = [], nrm: string[] = [], st: string[] = [];
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.positions.length; i += 3) {
    pts.push(`(${f(p.positions[i])}, ${f(p.positions[i + 1])}, ${f(p.positions[i + 2])})`);
    for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p.positions[i + k]); mx[k] = Math.max(mx[k], p.positions[i + k]); }
  }
  for (let i = 0; i < p.normals.length; i += 3) nrm.push(`(${f(p.normals[i])}, ${f(p.normals[i + 1])}, ${f(p.normals[i + 2])})`);
  for (let i = 0; i < p.uvs.length; i += 2) st.push(`(${f(p.uvs[i])}, ${f(1 - p.uvs[i + 1])})`);
  const counts = new Array(p.indices.length / 3).fill(3).join(", ");
  // extent: τα όρια του mesh — το Quick Look τα χρησιμοποιεί για να ακουμπήσει το μοντέλο στην επιφάνεια
  return `
    def Mesh "${safe(p.name)}" (
        prepend apiSchemas = ["MaterialBindingAPI"]
    )
    {
        float3[] extent = [(${f(mn[0])}, ${f(mn[1])}, ${f(mn[2])}), (${f(mx[0])}, ${f(mx[1])}, ${f(mx[2])})]
        int[] faceVertexCounts = [${counts}]
        int[] faceVertexIndices = [${p.indices.join(", ")}]
        point3f[] points = [${pts.join(", ")}]
        normal3f[] normals = [${nrm.join(", ")}] (
            interpolation = "vertex"
        )
        texCoord2f[] primvars:st = [${st.join(", ")}] (
            interpolation = "vertex"
        )
        uniform token subdivisionScheme = "none"
        uniform bool doubleSided = ${doubleSided ? 1 : 0}
        rel material:binding = </Product/Materials/${safe(p.material)}>
    }`;
}

function materialUsda(m: MaterialDef, safe: (s: string) => string, texFile?: string): string {
  const id = safe(m.name);
  const base = `/Product/Materials/${id}`;
  if (m.texture && texFile) {
    // Διαφάνεια μόνο όπου χρειάζεται (ετικέτες, cutouts): μια αδιαφανής υφή με συνδεδεμένο opacity αποδίδεται ως
    // διαφανές υλικό, με λάθη ταξινόμησης στο Quick Look.
    const cut = m.mode !== "opaque";
    return `
        def Material "${id}"
        {
            token outputs:surface.connect = <${base}/PBR.outputs:surface>
            def Shader "PBR"
            {
                uniform token info:id = "UsdPreviewSurface"
                color3f inputs:diffuseColor.connect = <${base}/Tex.outputs:rgb>${cut ? `
                float inputs:opacity.connect = <${base}/Tex.outputs:a>
                float inputs:opacityThreshold = 0.5` : ""}
                float inputs:roughness = ${f(m.roughness)}
                float inputs:metallic = 0
                token outputs:surface
            }
            def Shader "Reader"
            {
                uniform token info:id = "UsdPrimvarReader_float2"
                string inputs:varname = "st"
                float2 outputs:result
            }
            def Shader "Tex"
            {
                uniform token info:id = "UsdUVTexture"
                asset inputs:file = @${texFile}@
                float2 inputs:st.connect = <${base}/Reader.outputs:result>
                token inputs:sourceColorSpace = "sRGB"
                token inputs:wrapS = "clamp"
                token inputs:wrapT = "clamp"
                float3 outputs:rgb${cut ? `
                float outputs:a` : ""}
            }
        }`;
  }
  return `
        def Material "${id}"
        {
            token outputs:surface.connect = <${base}/PBR.outputs:surface>
            def Shader "PBR"
            {
                uniform token info:id = "UsdPreviewSurface"
                color3f inputs:diffuseColor = (${f(m.color[0])}, ${f(m.color[1])}, ${f(m.color[2])})
                float inputs:opacity = ${f(m.alpha)}
                float inputs:roughness = ${f(m.roughness)}
                float inputs:metallic = 0
                token outputs:surface
            }
        }`;
}

/**
 * Τοίχος: το AR Quick Look αγκυρώνει σε κάθετο επίπεδο όταν το ριζικό prim το δηλώνει. Το μοντέλο μένει ΟΡΘΙΟ (Y πάνω,
 * όπως στο πάτωμα) και η κάθετος του τοίχου είναι ο άξονας +Z: η πλάτη της συσκευής στο z=0 και η πρόσοψη προς +Z,
 * προς το δωμάτιο. Ό,τι έχει z<0 πέφτει μέσα στον τοίχο και στα iPhone με LiDAR κρύβεται. Κεντράρουμε και καθ' ύψος,
 * ώστε να κολλά εκεί που άγγιξε ο πελάτης.
 *
 * Το Quick Look τοποθετεί το περιεχόμενο όλο και πιο μακριά από τον τοίχο όσο περισσότερα αντικείμενα έχει κάτω από
 * την άγκυρα (γνωστό σφάλμα της Apple, ~10 εκ. και πάνω). Γι' αυτό στον τοίχο γράφουμε ΕΝΑ mesh: όλα τα μέρη μαζί, η
 * μετατόπιση ψημένη στις κορυφές, και ένα GeomSubset ανά υλικό. Οι δίπλευρες επιφάνειες γίνονται με διπλή γεωμετρία
 * (ανάποδη φορά), ώστε το mesh να είναι μονής όψης.
 */
export interface UsdzOpts { wall?: { h: number; d: number } | null }

function mergedMeshUsda(prims: Prim[], materials: MaterialDef[], safe: (s: string) => string, offset: [number, number, number]): string {
  const m: Prim = { name: "Geometry", material: "", positions: [], normals: [], uvs: [], indices: [] };
  const faces = new Map<string, number[]>();
  const push = (p: Prim, flip: boolean) => {
    const base = m.positions.length / 3;
    for (let i = 0; i < p.positions.length; i += 3) m.positions.push(p.positions[i] + offset[0], p.positions[i + 1] + offset[1], p.positions[i + 2] + offset[2]);
    for (let i = 0; i < p.normals.length; i++) m.normals.push(flip ? -p.normals[i] : p.normals[i]);
    m.uvs.push(...p.uvs);
    const list = faces.get(p.material) ?? [];
    for (let i = 0; i < p.indices.length; i += 3) {
      list.push(m.indices.length / 3);
      const [a, b, c] = [p.indices[i], p.indices[i + 1], p.indices[i + 2]];
      m.indices.push(base + a, base + (flip ? c : b), base + (flip ? b : c));
    }
    faces.set(p.material, list);
  };
  for (const p of prims) {
    push(p, false);
    if (materials.find((x) => x.name === p.material)?.doubleSided) push(p, true);
  }
  const body = meshUsda(m, safe, false).replace(/\n\s*rel material:binding = <[^>]*>/, "");
  const subsets = [...faces].map(([mat, list]) => `
        def GeomSubset "${safe(mat)}" (
            prepend apiSchemas = ["MaterialBindingAPI"]
        )
        {
            uniform token elementType = "face"
            uniform token familyName = "materialBind"
            int[] indices = [${list.join(", ")}]
            rel material:binding = </Product/Materials/${safe(mat)}>
        }`).join("\n");
  // το subsetFamily δηλώνει ότι κάθε τρίγωνο ανήκει σε ακριβώς ένα υλικό
  return body.replace(/\n    \}$/, `
        uniform token subsetFamily:materialBind:familyType = "partition"
${subsets}
    }`);
}

export function writeUsdz(prims: Prim[], materials: MaterialDef[], textures: Record<string, Buffer>, name: string, opts: UsdzOpts = {}): Buffer {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9_]/g, "_");
  const wall = opts.wall ?? null;
  const used = new Set(materials.map((m) => m.texture).filter(Boolean));
  const texFiles: Record<string, string> = Object.fromEntries(Object.keys(textures).filter((k) => used.has(k)).map((k) => [k, `0/${safe(k)}.png`]));
  const geometry = wall
    ? mergedMeshUsda(prims, materials, safe, [0, -wall.h / 2, wall.d / 2 + 0.008])
    : prims.map((p) => meshUsda(p, safe, materials.find((m) => m.name === p.material)?.doubleSided !== false)).join("\n");
  const usda = `#usda 1.0
(
    defaultPrim = "Product"
    metersPerUnit = 1
    upAxis = "Y"
    doc = "Euronics AR — ${name.replace(/"/g, "'")}"
)

def Xform "Product" (
    kind = "component"${wall ? `\n    prepend apiSchemas = ["Preliminary_AnchoringAPI"]` : ""}
)
{${wall ? `
    token preliminary:anchoring:type = "plane"
    token preliminary:planeAnchoring:alignment = "vertical"
` : ""}
${geometry}

    def Scope "Materials"
    {${materials.map((m) => materialUsda(m, safe, m.texture ? texFiles[m.texture] : undefined)).join("\n")}
    }
}
`;
  const entries: { name: string; data: Buffer }[] = [{ name: "product.usda", data: Buffer.from(usda, "utf8") }, ...Object.entries(textures).filter(([k]) => texFiles[k]).map(([k, data]) => ({ name: texFiles[k], data }))];
  return zipStored(entries);
}

/** Zip «store» με ευθυγράμμιση δεδομένων στα 64 byte μέσω extra field (όπως το usdzip της Pixar). */
function zipStored(entries: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const nameB = Buffer.from(e.name, "utf8");
    const crc = crc32(e.data) >>> 0;
    const headerLen = 30 + nameB.length;
    let pad = (64 - ((offset + headerLen) % 64)) % 64;
    if (pad > 0 && pad < 4) pad += 64; // το extra field θέλει τουλάχιστον 4 byte κεφαλίδα
    const extra = Buffer.alloc(pad);
    if (pad) { extra.writeUInt16LE(0x1986, 0); extra.writeUInt16LE(pad - 4, 2); }
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12); // ώρα/ημερομηνία: σταθερές ώστε το αρχείο να είναι ντετερμινιστικό
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(e.data.length, 18); lh.writeUInt32LE(e.data.length, 22);
    lh.writeUInt16LE(nameB.length, 26); lh.writeUInt16LE(extra.length, 28);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0, 8); cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0, 12); cd.writeUInt16LE(0x21, 14); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(e.data.length, 20); cd.writeUInt32LE(e.data.length, 24);
    cd.writeUInt16LE(nameB.length, 28); cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32); cd.writeUInt16LE(0, 34); cd.writeUInt16LE(0, 36); cd.writeUInt32LE(0, 38); cd.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cd, nameB]));
    parts.push(lh, nameB, extra, e.data);
    offset += headerLen + extra.length + e.data.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, cdBuf, eocd]);
}
