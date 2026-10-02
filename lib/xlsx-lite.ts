import "server-only";
import { inflateRawSync } from "node:zlib";

/**
 * Ελάχιστη ανάγνωση .xlsx (πρώτο φύλλο → πίνακας κειμένων), χωρίς εξωτερική βιβλιοθήκη: το xlsx είναι zip με XML.
 * Αρκεί για εισαγωγή λιστών (κωδικός, τιμή). Δεν υποστηρίζει τύπους/μορφοποιήσεις — διαβάζει τις τιμές όπως αποθηκεύτηκαν.
 */

function unzip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Δεν είναι έγκυρο αρχείο xlsx.");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString("utf8");
    p += 46 + nlen + xlen + clen;
    if (!/^(xl\/sharedStrings\.xml|xl\/worksheets\/sheet\d+\.xml|xl\/workbook\.xml)$/.test(name)) continue;
    const ln = buf.readUInt16LE(local + 26), lx = buf.readUInt16LE(local + 28);
    const data = buf.subarray(local + 30 + ln + lx, local + 30 + ln + lx + csize);
    out.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data));
  }
  return out;
}

const unxml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unxml(m[1])).join("");
const colIndex = (ref: string) => { const letters = ref.replace(/\d+/g, ""); let n = 0; for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

/** Οι γραμμές του πρώτου φύλλου ως πίνακας κειμένων. */
export function readXlsx(buf: Buffer, maxRows = 20_000): string[][] {
  const files = unzip(buf);
  const shared = files.get("xl/sharedStrings.xml")?.toString("utf8");
  const strings = shared ? [...shared.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1])) : [];
  const sheetName = [...files.keys()].filter((n) => n.startsWith("xl/worksheets/")).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))[0];
  if (!sheetName) throw new Error("Το αρχείο δεν έχει φύλλο.");
  const xml = files.get(sheetName)!.toString("utf8");
  const rows: string[][] = [];
  for (const r of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const c of r[1].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1], body = c[2] ?? "";
      const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1];
      const t = attrs.match(/t="(\w+)"/)?.[1];
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const val = t === "s" ? strings[Number(v)] ?? "" : t === "inlineStr" ? texts(body) : v != null ? unxml(v) : "";
      row[ref ? colIndex(ref) : row.length] = val;
    }
    rows.push(Array.from(row, (x) => x ?? ""));
    if (rows.length >= maxRows) break;
  }
  return rows;
}

/** CSV / TSV (επικόλληση από Excel): διαχωριστικό tab, ; ή , — με εισαγωγικά. */
export function readDelimited(text: string, maxRows = 20_000): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = first.includes("\t") ? "\t" : first.split(";").length > first.split(",").length ? ";" : ",";
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells: string[] = []; let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === sep) { cells.push(cur); cur = ""; } else cur += ch;
    }
    cells.push(cur);
    rows.push(cells.map((c) => c.trim()));
    if (rows.length >= maxRows) break;
  }
  return rows;
}
