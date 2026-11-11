import "server-only";
import { db } from "@/lib/db";
import { getTable } from "./lookups";

export interface DocLine { linenum: number; code: string; name: string; qty: number; done: number; unit: string; price: number; discPct: number; net: number; vatPct: number | null; vat: number; whouse: string; note: string; from: number | null }
export interface DocDetail {
  findoc: number; fincode: string; date: string; series: string; seriesName: string | null; branch: string;
  customer: { code: string; name: string; afm: string; city: string; phone: string; email: string } | null;
  shipTo: { name: string; phone: string; address: string; zip: string; city: string; afm: string; job: string };
  whouse: string; payment: string; shipment: string; salesman: string;
  comments: string; comments1: string; remarks: string;
  net: number; vat: number; total: number; disc: number;
  cancelled: boolean; fullyTransf: boolean; printed: boolean;
  created: string; createdBy: string; updated: string; updatedBy: string;
  lines: DocLine[];
}

const num = (v: string | undefined) => { const x = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(x) ? x : 0; };
const s = (v: string | undefined) => String(v ?? "").trim();
/** όνομα από πίνακα του SoftOne· αν δεν διαβάζεται, μένει ο κωδικός */
async function names(table: string, ids: string[], field = "NAME"): Promise<Map<string, string>> {
  const ok = [...new Set(ids.filter((x) => /^\d+$/.test(x)))];
  if (!ok.length) return new Map();
  try { return new Map((await getTable(table, [table, field], `${table} IN (${ok.join(",")})`)).map((r) => [s(r[0]), s(r[1])])); } catch { return new Map(); }
}

/** Όλα τα στοιχεία ενός παραστατικού (κεφαλίδα, παράδοση, γραμμές). Μόνο αναγνώσεις. */
export async function docDetail(findoc: number): Promise<DocDetail | null> {
  const F = ["FINCODE", "TRNDATE", "SERIES", "TRDR", "BRANCH", "PAYMENT", "SHIPMENT", "SALESMAN", "COMMENTS", "COMMENTS1", "REMARKS", "NETAMNT", "VATAMNT", "SUMAMNT", "DISC1VAL", "ISCANCEL", "FULLYTRANSF", "ISPRINT", "INSDATE", "UPDDATE", "INSUSER", "UPDUSER"];
  const M = ["WHOUSE", "SHIPPINGADDR", "SHPZIP", "SHPCITY", "CCCSHPNAME", "CCCSHPPHONE", "CCCSHPADDRESS", "CCCSHPAFM", "CCCSHPJOB"];
  const L = ["LINENUM", "MTRL", "QTY1", "QTY1COV", "PRICE", "DISC1PRC", "LINEVAL", "VAT", "VATAMNT", "WHOUSE", "COMMENTS1", "MTRUNIT", "FINDOCS"];
  const [[h], [m = []], lines] = await Promise.all([getTable("FINDOC", F, `FINDOC=${findoc}`), getTable("MTRDOC", M, `FINDOC=${findoc}`), getTable("MTRLINES", L, `FINDOC=${findoc}`)]);
  if (!h) return null;
  const g = (k: string) => s(h[F.indexOf(k)]), mm = (k: string) => s(m[M.indexOf(k)]), ll = (r: string[], k: string) => s(r[L.indexOf(k)]);

  const [cust, wh, pay, shp, usr, vat, unit, br, items, series] = await Promise.all([
    g("TRDR") ? getTable("TRDR", ["CODE", "NAME", "AFM", "CITY", "PHONE01", "EMAIL"], `TRDR=${g("TRDR")}`).catch(() => []) : [],
    names("WHOUSE", [mm("WHOUSE"), ...lines.map((r) => ll(r, "WHOUSE"))]),
    names("PAYMENT", [g("PAYMENT")]), names("SHIPMENT", [g("SHIPMENT")]),
    names("USERS", [g("INSUSER"), g("UPDUSER")]),
    names("VAT", lines.map((r) => ll(r, "VAT")), "PERCNT"),
    names("MTRUNIT", lines.map((r) => ll(r, "MTRUNIT"))),
    names("BRANCH", [g("BRANCH")]),
    (() => { const ids = [...new Set(lines.map((r) => ll(r, "MTRL")).filter((x) => /^\d+$/.test(x)))]; return ids.length ? getTable("MTRL", ["MTRL", "CODE", "NAME"], `MTRL IN (${ids.join(",")})`).catch(() => []) : []; })(),
    db.docSeries.findFirst({ where: { s1Id: g("SERIES") }, select: { name: true } }),
  ]);
  const byMtrl = new Map(items.map((r) => [s(r[0]), r]));
  const c = cust[0];
  const nm = (map: Map<string, string>, id: string) => (id ? map.get(id) || id : "");
  return {
    findoc, fincode: g("FINCODE"), date: g("TRNDATE"), series: g("SERIES"), seriesName: series?.name ?? null, branch: nm(br, g("BRANCH")),
    customer: c ? { code: s(c[0]), name: s(c[1]), afm: s(c[2]), city: s(c[3]), phone: s(c[4]), email: s(c[5]) } : null,
    shipTo: { name: mm("CCCSHPNAME"), phone: mm("CCCSHPPHONE"), address: mm("CCCSHPADDRESS") || mm("SHIPPINGADDR"), zip: mm("SHPZIP"), city: mm("SHPCITY"), afm: mm("CCCSHPAFM"), job: mm("CCCSHPJOB") },
    whouse: nm(wh, mm("WHOUSE")), payment: nm(pay, g("PAYMENT")), shipment: nm(shp, g("SHIPMENT")), salesman: g("SALESMAN"),
    comments: g("COMMENTS"), comments1: g("COMMENTS1"), remarks: g("REMARKS"),
    net: num(g("NETAMNT")), vat: num(g("VATAMNT")), total: num(g("SUMAMNT")), disc: num(g("DISC1VAL")),
    cancelled: g("ISCANCEL") === "1", fullyTransf: g("FULLYTRANSF") === "1", printed: g("ISPRINT") === "1",
    created: g("INSDATE"), createdBy: nm(usr, g("INSUSER")), updated: g("UPDDATE"), updatedBy: nm(usr, g("UPDUSER")),
    lines: lines.map((r) => {
      const it = byMtrl.get(ll(r, "MTRL")), v = ll(r, "VAT");
      return { linenum: num(ll(r, "LINENUM")), code: s(it?.[1]), name: s(it?.[2]) || `Είδος ${ll(r, "MTRL")}`, qty: num(ll(r, "QTY1")), done: num(ll(r, "QTY1COV")), unit: nm(unit, ll(r, "MTRUNIT")), price: num(ll(r, "PRICE")), discPct: num(ll(r, "DISC1PRC")), net: num(ll(r, "LINEVAL")), vatPct: v && vat.has(v) ? num(vat.get(v)) : null, vat: num(ll(r, "VATAMNT")), whouse: nm(wh, ll(r, "WHOUSE")), note: ll(r, "COMMENTS1"), from: num(ll(r, "FINDOCS")) || null };
    }).sort((a, b) => a.linenum - b.linenum),
  };
}
