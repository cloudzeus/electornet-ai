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
  for (let i = 0; i < p.positions.length; i += 3) pts.push(`(${f(p.positions[i])}, ${f(p.positions[i + 1])}, ${f(p.positions[i + 2])})`);
  for (let i = 0; i < p.normals.length; i += 3) nrm.push(`(${f(p.normals[i])}, ${f(p.normals[i + 1])}, ${f(p.normals[i + 2])})`);
  for (let i = 0; i < p.uvs.length; i += 2) st.push(`(${f(p.uvs[i])}, ${f(1 - p.uvs[i + 1])})`);
  const counts = new Array(p.indices.length / 3).fill(3).join(", ");
  return `
    def Mesh "${safe(p.name)}"
    {
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
        bool doubleSided = ${doubleSided ? 1 : 0}
        rel material:binding = </Product/Materials/${safe(p.material)}>
    }`;
}

function materialUsda(m: MaterialDef, safe: (s: string) => string, texFile?: string): string {
  const id = safe(m.name);
  const base = `/Product/Materials/${id}`;
  if (m.texture && texFile) {
    return `
        def Material "${id}"
        {
            token outputs:surface.connect = <${base}/PBR.outputs:surface>
            def Shader "PBR"
            {
                uniform token info:id = "UsdPreviewSurface"
                color3f inputs:diffuseColor.connect = <${base}/Tex.outputs:rgb>
                float inputs:opacity.connect = <${base}/Tex.outputs:a>
                float inputs:opacityThreshold = 0.5
                float inputs:roughness = ${f(m.roughness)}
                float inputs:metallic = 0
                token outputs:surface
            }
            def Shader "Reader"
            {
                uniform token info:id = "UsdPrimvarReader_float2"
                token inputs:varname = "st"
                float2 outputs:result
            }
            def Shader "Tex"
            {
                uniform token info:id = "UsdUVTexture"
                asset inputs:file = @${texFile}@
                float2 inputs:st.connect = <${base}/Reader.outputs:result>
                token inputs:wrapS = "clamp"
                token inputs:wrapT = "clamp"
                float3 outputs:rgb
                float outputs:a
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
 * Τοίχος: το AR Quick Look αγκυρώνει σε κάθετο επίπεδο όταν το ριζικό prim
 * το δηλώνει. Το μοντέλο μένει ΟΡΘΙΟ (Y πάνω, όπως στο πάτωμα) και η κάθετος
 * του τοίχου είναι ο άξονας +Z: η πλάτη της συσκευής πρέπει να βρίσκεται στο
 * z=0 και η πρόσοψη να κοιτά +Z, προς το δωμάτιο. Ό,τι έχει z<0 πέφτει μέσα
 * στον τοίχο και στα iPhone με LiDAR κρύβεται. Κεντράρουμε και καθ' ύψος, ώστε
 * να κολλά εκεί που άγγιξε ο πελάτης. Η μετατόπιση μπαίνει σε παιδί του
 * αγκυρωμένου prim, για να μη μπλέκεται με τον μετασχηματισμό της άγκυρας.
 */
export interface UsdzOpts { wall?: { h: number; d: number } | null }

export function writeUsdz(prims: Prim[], materials: MaterialDef[], textures: Record<string, Buffer>, name: string, opts: UsdzOpts = {}): Buffer {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9_]/g, "_");
  const wall = opts.wall ?? null;
  const texFiles: Record<string, string> = Object.fromEntries(Object.keys(textures).map((k) => [k, `0/${safe(k)}.png`]));
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

    def Xform "Placed"
    {
        double3 xformOp:translate = (0, ${f(-wall.h / 2)}, ${f(wall.d / 2 + 0.008)})
        uniform token[] xformOpOrder = ["xformOp:translate"]
` : ""}
${prims.map((p) => meshUsda(p, safe, materials.find((m) => m.name === p.material)?.doubleSided !== false)).join("\n")}
${wall ? "    }\n" : ""}
    def Scope "Materials"
    {${materials.map((m) => materialUsda(m, safe, m.texture ? texFiles[m.texture] : undefined)).join("\n")}
    }
}
`;
  const entries: { name: string; data: Buffer }[] = [{ name: "product.usda", data: Buffer.from(usda, "utf8") }, ...Object.entries(textures).map(([k, data]) => ({ name: texFiles[k], data }))];
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
