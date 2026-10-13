import fontkit from "@pdf-lib/fontkit";
import { rgb, type PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * Σχέδιο του δελτίου παράδοσης (A4) με pdf-lib — καθαρό (χωρίς βάση), ώστε να δοκιμάζεται με ψεύτικα δεδομένα.
 * Τα δεδομένα και η γραμματοσειρά έρχονται από το lib/couriers/deltio.ts.
 */
const A4: [number, number] = [595.28, 841.89];
const M = 36;
const INK = rgb(0.07, 0.11, 0.25), MUTED = rgb(0.4, 0.44, 0.52), LINE = rgb(0.82, 0.85, 0.9), BAND = rgb(0.95, 0.96, 0.98);
const COLS = [{ t: "#", w: 18 }, { t: "Voucher", w: 102 }, { t: "Παραγγελία", w: 100 }, { t: "Παραλήπτης", w: 106 }, { t: "ΤΚ · Πόλη", w: 80 }, { t: "Τεμ.", w: 26, r: true }, { t: "Κιλά", w: 34, r: true }, { t: "Αντικ/βολή €", w: 57.28, r: true }] as const;
const eur = (n: number) => n.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface DeltioRow { voucher: string; extra: number; order: string; name: string; place: string; pieces: number; kg: number; cod: number }
export interface DeltioSection { courier: string; test: boolean; rows: DeltioRow[] }

function fit(font: PDFFont, text: string, size: number, w: number) {
  if (font.widthOfTextAtSize(text, size) <= w) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > w) t = t.slice(0, -1);
  return `${t}…`;
}

/** Ζωγραφίζει ένα δελτίο ανά τμήμα (courier) στο `out`· fonts = TTF με ελληνικά (κανονικά, έντονα). */
export async function paintDeltio(out: PDFDocument, secs: DeltioSection[], fonts: { regular: Uint8Array; bold: Uint8Array }, company: string, when: string): Promise<number> {
  out.registerFontkit(fontkit);
  const R = await out.embedFont(fonts.regular, { subset: true }), B = await out.embedFont(fonts.bold, { subset: true });
  let total = 0;

  for (const sec of secs) {
    const pages: PDFPage[] = [];
    let page!: PDFPage, y = 0;
    const text = (p: PDFPage, s: string, x: number, yy: number, size = 9, f = R, color = INK) => p.drawText(s, { x, y: yy, size, font: f, color });
    const head = (table = true) => {
      page = out.addPage(A4); pages.push(page);
      y = A4[1] - M;
      text(page, "ΔΕΛΤΙΟ ΠΑΡΑΔΟΣΗΣ ΑΠΟΣΤΟΛΩΝ", M, y - 14, 16, B);
      text(page, when, A4[0] - M - R.widthOfTextAtSize(when, 10), y - 12, 10, R, MUTED);
      y -= 34;
      text(page, `Courier: ${sec.courier}${sec.test ? "  (ΔΟΚΙΜΑΣΤΙΚΟ ΠΕΡΙΒΑΛΛΟΝ)" : ""}`, M, y, 11, B);
      y -= 15;
      text(page, fit(R, `Αποστολέας: ${company}`, 9, A4[0] - 2 * M), M, y, 9, R, MUTED);
      y -= 18;
      if (!table) return;
      page.drawRectangle({ x: M, y: y - 5, width: A4[0] - 2 * M, height: 17, color: BAND });
      let x = M;
      for (const c of COLS) { text(page, c.t, "r" in c && c.r ? x + c.w - 4 - B.widthOfTextAtSize(c.t, 8.5) : x + 3, y, 8.5, B); x += c.w; }
      y -= 18;
    };
    head();
    sec.rows.forEach((r, i) => {
      if (y < M + 30) head();
      const cells = [String(i + 1), r.extra ? `${r.voucher} +${r.extra}` : r.voucher, r.order, r.name, r.place, String(r.pieces), r.kg.toLocaleString("el-GR", { minimumFractionDigits: 1, maximumFractionDigits: 2 }), r.cod ? eur(r.cod) : "—"];
      let x = M;
      COLS.forEach((c, k) => {
        const s = fit(k === 1 ? B : R, cells[k], 9, c.w - 7);
        const f = k === 1 ? B : R;
        text(page, s, "r" in c && c.r ? x + c.w - 4 - f.widthOfTextAtSize(s, 9) : x + 3, y, 9, f);
        x += c.w;
      });
      page.drawLine({ start: { x: M, y: y - 5 }, end: { x: A4[0] - M, y: y - 5 }, thickness: 0.5, color: LINE });
      y -= 17;
    });
    // σύνολα και υπογραφές μαζί στο τέλος — αν δεν χωρούν, σε νέα σελίδα
    if (y < M + 170) head(false);
    const pcs = sec.rows.reduce((a, r) => a + r.pieces, 0), kg = sec.rows.reduce((a, r) => a + r.kg, 0), cod = sec.rows.reduce((a, r) => a + r.cod, 0);
    y -= 6;
    page.drawRectangle({ x: M, y: y - 6, width: A4[0] - 2 * M, height: 20, color: BAND });
    text(page, `Σύνολο: ${sec.rows.length} αποστολές · ${pcs} τεμάχια · ${kg.toLocaleString("el-GR", { maximumFractionDigits: 2 })} κιλά · αντικαταβολές ${eur(cod)} €`, M + 4, y, 10, B);
    y -= 40;
    // υπογραφές
    const bw = (A4[0] - 2 * M - 16) / 2;
    for (const [k, title, lines] of [[0, "ΠΑΡΕΔΩΣΕ (αποστολέας)", ["Ονοματεπώνυμο", "Υπογραφή / σφραγίδα"]], [1, "ΠΑΡΕΛΑΒΕ (οδηγός courier)", ["Ονοματεπώνυμο", "Υπογραφή", "Ημερομηνία / ώρα"]]] as const) {
      const bx = M + k * (bw + 16);
      page.drawRectangle({ x: bx, y: y - 96, width: bw, height: 104, borderColor: LINE, borderWidth: 1 });
      text(page, title, bx + 8, y - 8, 9, B);
      lines.forEach((l, j) => { const ly = y - 34 - j * 26; text(page, l, bx + 8, ly, 8, R, MUTED); page.drawLine({ start: { x: bx + 90, y: ly - 2 }, end: { x: bx + bw - 10, y: ly - 2 }, thickness: 0.5, color: LINE }); });
    }
    pages.forEach((p, i) => { const f = `${sec.courier} · σελίδα ${i + 1}/${pages.length}`; text(p, f, A4[0] - M - R.widthOfTextAtSize(f, 8), M - 14, 8, R, MUTED); });
    total += sec.rows.length;
  }
  return total;
}

