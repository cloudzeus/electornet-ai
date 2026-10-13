import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { paintDeltio, type DeltioSection } from "./deltio-paint";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings/store";
import { COURIER_NAME, isVoucherCarrier, shipmentLabels } from "./shipments";

/**
 * Δελτίο παράδοσης αποστολών (A4, PDF): η λίστα των vouchers που παραδίδονται στον courier, με σύνολα τεμαχίων /
 * βάρους / αντικαταβολών και πεδία υπογραφής «Παρέδωσε» / «Παρέλαβε». Ένα δελτίο ανά courier (νέα σελίδα για τον
 * καθένα). Με `labels` ακολουθούν στο ίδιο PDF οι ετικέτες — «Εκτύπωση όλων» με ένα αρχείο.
 * Γραμματοσειρά: Liberation Sans (SIL OFL, lib/couriers/fonts) για τα ελληνικά.
 */
async function sections(ids: string[]): Promise<DeltioSection[]> {
  const list = await db.shipment.findMany({ where: { id: { in: ids }, status: { not: "cancelled" }, voucher: { not: null } }, orderBy: { createdAt: "asc" }, select: { carrier: true, env: true, voucher: true, subVouchers: true, pieces: true, weightKg: true, codAmount: true, order: { select: { number: true, shipping: true } } } });
  const out = new Map<string, DeltioSection>();
  for (const s of list) {
    if (!isVoucherCarrier(s.carrier)) continue;
    const key = `${s.carrier}:${s.env}`;
    const sec = out.get(key) ?? { courier: COURIER_NAME[s.carrier], test: s.env !== "live", rows: [] };
    out.set(key, sec);
    const to = (s.order.shipping ?? {}) as Record<string, string>;
    sec.rows.push({ voucher: s.voucher!, extra: s.subVouchers.length, order: s.order.number, name: `${to.firstName ?? ""} ${to.lastName ?? ""}`.trim(), place: `${to.zip ?? ""} ${to.city ?? ""}`.trim(), pieces: s.pieces, kg: Number(s.weightKg), cod: Number(s.codAmount) });
  }
  return [...out.values()];
}

/** Τα δελτία των vouchers `ids` στο `out` (στοιχεία εταιρείας από τις Ρυθμίσεις)· επιστρέφει πόσες αποστολές μπήκαν. */
export async function drawDeltio(out: PDFDocument, ids: string[]): Promise<number> {
  const secs = await sections(ids);
  if (!secs.length) return 0;
  const dir = join(process.cwd(), "lib/couriers/fonts");
  const [regular, bold] = await Promise.all([readFile(join(dir, "LiberationSans-Regular.ttf")), readFile(join(dir, "LiberationSans-Bold.ttf"))]);
  const site = await getSetting("site").then((x) => x.data).catch(() => ({} as Record<string, unknown>));
  const str = (k: string) => String(site[k] ?? "").trim();
  const company = [str("legalName") || str("siteName") || "Euronics", str("vat") && `ΑΦΜ ${str("vat")}`, str("address"), str("phone") && `τηλ. ${str("phone")}`].filter(Boolean).join(" · ");
  const when = new Date().toLocaleString("el-GR", { timeZone: "Europe/Athens", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return paintDeltio(out, secs, { regular, bold }, company, when);
}

/** Δελτίο (και προαιρετικά οι ετικέτες μετά) σε ένα PDF. */
export async function deltioPdf(ids: string[], withLabels = false): Promise<Buffer> {
  const out = await PDFDocument.create();
  out.setTitle("Δελτίο παράδοσης αποστολών");
  const n = await drawDeltio(out, ids);
  if (!n) throw new Error("Δεν υπάρχουν vouchers για το δελτίο.");
  if (withLabels) {
    const labels = await PDFDocument.load(await shipmentLabels(ids));
    for (const p of await out.copyPages(labels, labels.getPageIndices())) out.addPage(p);
  }
  return Buffer.from(await out.save());
}
