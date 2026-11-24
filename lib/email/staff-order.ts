import { BRAND, FONT, esc, money, renderEmail, h1, h2, p, note, button, kv, totals, type Block, type EmailCtx } from "./layout-core";

/**
 * Email παραγγελίας προς το ΠΡΟΣΩΠΙΚΟ (όχι προς τον πελάτη): όλη η παραγγελία σε ένα μήνυμα — τι κάνεις τώρα, πελάτης,
 * προϊόντα με κωδικούς SoftOne, ποσά, πληρωμή, αποστολή με τη λογική χρέωσης των μεταφορικών, vouchers με συνδέσμους,
 * παραστατικά και κωδικός πελάτη στο SoftOne. Καθαρή σύνθεση· τα στοιχεία τα μαζεύει το lib/orders/staff-mail.ts.
 * Γράφεται για κάποιον που το διαβάζει πρώτη φορά (εντολή χρήστη 24/11/2026: «αναλυτικότατο, με εκτενή περιγραφή όλων»):
 * βήματα με τη σειρά, μία πρόταση κάτω από κάθε τίτλο για το τι δείχνει η ενότητα, και εξήγηση κάτω από κάθε σύνδεσμο.
 * Όλες οι τιμές είναι κείμενο από τη βάση (και από τον πελάτη): περνούν ΠΑΝΤΑ από esc πριν μπουν στο HTML.
 */
export type StaffEvent = "new" | "voucher" | "erp" | "erp-doc" | "unpaid";
const EVENT: Record<StaffEvent, string> = { new: "Νέα παραγγελία", voucher: "Εκδόθηκε voucher", erp: "Καταχωρήθηκε στο SoftOne", "erp-doc": "Νέο παραστατικό στο SoftOne", unpaid: "Δεν πληρώθηκε" };

type Rows = [string, string][];
/** σύνδεσμος: ετικέτα, διεύθυνση και (προαιρετικά) τι ανοίγει και τι κάνεις εκεί */
type Link = [label: string, url: string, help?: string];
export interface StaffOrderData {
  event: StaffEvent; number: string; adminUrl: string;
  /** απλήρωτη online παραγγελία: ο σύνδεσμος με τον οποίο ο πελάτης πληρώνει την ίδια παραγγελία */
  payUrl?: string;
  /** σύντομη περίληψη για το θέμα: ποσό · αποστολή · πληρωμή */
  summary: string;
  /** τι κάνει το προσωπικό τώρα */
  next: { tone: "info" | "success" | "warning" | "danger"; text: string };
  /** όλη η δουλειά με τη σειρά, από την ετοιμασία ως την παράδοση (κενό όταν η παραγγελία δεν πρέπει να προχωρήσει) */
  steps: string[];
  order: Rows; customer: Rows;
  lines: { code: string | null; title: string; qty: number; list: number; discount: number; total: number; notes: string[] }[];
  totals: [string, number | string][]; total: number;
  /** προσφορές / κουπόνια: τι εφαρμόστηκε, τι όχι και γιατί */
  promos: string[];
  payment: Rows; shipping: Rows;
  /** πώς υπολογίστηκαν τα μεταφορικά */
  calc: string[];
  vouchers: { title: string; rows: Rows; links: Link[] }[];
  /** voucher και δελτίο παράδοσης: τι ισχύει για αυτή την παραγγελία, και οι σύνδεσμοι έκδοσης / εκτύπωσης */
  voucherHelp: string; voucherLinks: Link[];
  erp: { rows: Rows; links: Link[]; docs: { no: string; type: string; date: string; total: number | null }[]; needs: string[]; remarks: string | null };
}

const td = `padding:8px 6px;border-bottom:1px solid ${BRAND.line};vertical-align:top`;
const kvs = (rows: Rows): Block => kv(rows.map(([k, v]) => [k, esc(v).replace(/\n/g, "<br>")]));
const list = (items: string[], ordered = false): Block => ({ html: `<${ordered ? "ol" : "ul"} style="margin:0 0 14px;padding-left:22px;font-family:${FONT};font-size:14px;line-height:1.55;color:${ordered ? BRAND.ink : BRAND.ink2}">${items.map((i) => `<li style="margin:0 0 6px">${esc(i)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`, text: items.map((i, n) => `${ordered ? `${n + 1}.` : "-"} ${i}`).join("\n") });
/** Σύνδεσμοι, ο καθένας με την εξήγησή του από κάτω (τι ανοίγει, τι κάνεις εκεί). */
const links = (items: Link[]): Block => ({
  html: items.map(([l, u, help]) => `<p style="margin:0 0 12px;font-family:${FONT};font-size:14px;line-height:1.55;color:${BRAND.ink2}"><a href="${esc(u)}" style="color:${BRAND.blue};font-weight:700">${esc(l)}</a>${help ? `<br>${esc(help)}` : ""}</p>`).join(""),
  text: items.map(([l, u, help]) => `${l}: ${u}${help ? `\n    ${help}` : ""}`).join("\n"),
});
/** Μία-δύο προτάσεις κάτω από τον τίτλο: τι δείχνει η ενότητα και τι προσέχεις. */
const intro = (t: string): Block => p(esc(t), { small: true });
/** Πίνακας με κεφαλίδα· `right` = στήλες με ποσά (δεξιά στοίχιση). Τα κελιά είναι ήδη ασφαλές HTML. */
const table = (head: string[], rows: { html: string[]; text: string }[], right: number[]): Block => ({
  html: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 14px;font-family:${FONT};font-size:14px;color:${BRAND.ink}"><tr>${head.map((h, i) => `<td style="${td};color:${BRAND.muted};font-weight:700${right.includes(i) ? ";text-align:right" : ""}">${esc(h)}</td>`).join("")}</tr>${rows.map((r) => `<tr>${r.html.map((c, i) => `<td style="${td}${right.includes(i) ? ";text-align:right;white-space:nowrap" : ""}">${c}</td>`).join("")}</tr>`).join("")}</table>`,
  text: rows.map((r) => r.text).join("\n"),
});
const pre = (t: string): Block => ({ html: `<pre style="margin:0 0 14px;padding:12px 14px;background:${BRAND.surface};border-radius:10px;font-family:Consolas,Menlo,monospace;font-size:14px;line-height:1.5;color:${BRAND.ink};white-space:pre-wrap;word-break:break-word">${esc(t)}</pre>`, text: t });

export function renderStaffOrder(d: StaffOrderData, ctx: EmailCtx) {
  const blocks: Block[] = [
    h1(`${EVENT[d.event]} ${d.number}`),
    note(`<b>Τι κάνεις τώρα:</b> ${esc(d.next.text)}`, d.next.tone),
    ...(d.steps.length ? [h2("Όλη η δουλειά, βήμα βήμα"), list(d.steps, true)] : []),
    button("Άνοιγμα στη διαχείριση", d.adminUrl),
    intro("Το κουμπί ανοίγει την καρτέλα της παραγγελίας στη διαχείριση (θέλει σύνδεση). Από εκεί γίνονται όλες οι ενέργειες: αλλαγή κατάστασης, έκδοση voucher, αποστολή στο SoftOne, σημειώσεις."),
    ...(d.payUrl ? [links([["Σύνδεσμος πληρωμής για τον πελάτη (στείλ' τον με email ή μήνυμα)", d.payUrl, "Ο πελάτης πληρώνει την ίδια παραγγελία, χωρίς να την ξανακάνει. Μόλις πληρώσει, θα λάβεις νέο email."]])] : []),
    h2("Παραγγελία"), kvs(d.order),
    h2("Πελάτης"),
    intro("Ποιος παρήγγειλε και πώς τον βρίσκεις. «Πελάτης στο SoftOne» είναι η καρτέλα του ERP στην οποία γράφεται το παραστατικό: ο πελάτης λιανικής για αποδείξεις, η καρτέλα της εταιρείας για τιμολόγιο."),
    kvs(d.customer),
    h2("Προϊόντα"),
    intro("Τι ετοιμάζεις. «Κωδ. SoftOne» είναι ο κωδικός του είδους στο ERP. Η τιμή είναι η τιμή καταλόγου ανά τεμάχιο με ΦΠΑ· το «Σύνολο» είναι ό,τι πληρώνει ο πελάτης για τη γραμμή μετά τις εκπτώσεις."),
    // τρεις στήλες μόνο: σε κινητό 360px ο πίνακας με έξι στήλες έβγαινε εκτός οθόνης — κωδικός, τιμή και έκπτωση κάτω από τον τίτλο
    table(["Προϊόν", "Τεμ.", "Σύνολο"], d.lines.map((l) => ({
      html: [`<b>${esc(l.title)}</b><br>${l.code ? `Κωδ. SoftOne <b>${esc(l.code)}</b>` : `<span style="color:${BRAND.red};font-weight:700">Λείπει ο κωδικός SoftOne</span>`} · τιμή ${money(l.list)}${l.discount ? ` · έκπτωση −${money(l.discount)}` : ""}${l.notes.map((n) => `<br><span style="color:${BRAND.muted}">${esc(n)}</span>`).join("")}`, String(l.qty), `<b>${money(l.total)}</b>`],
      text: `- ${l.qty}× ${l.title} · ${l.code ? `Κωδ. SoftOne ${l.code}` : "Λείπει ο κωδικός SoftOne"} · τιμή ${money(l.list)}${l.discount ? ` · έκπτωση −${money(l.discount)}` : ""} · σύνολο ${money(l.total)}${l.notes.map((n) => `\n    ${n}`).join("")}`,
    })), [1, 2]),
    totals(d.totals, ["Σύνολο παραγγελίας (με ΦΠΑ)", d.total]),
    ...(d.promos.length ? [h2("Προσφορές και κουπόνια"), intro("Ποιες προσφορές μέτρησαν στην τιμή και ποιες όχι, με τον λόγο. Χρήσιμο αν ο πελάτης ρωτήσει γιατί δεν πήρε μια έκπτωση."), list(d.promos)] : []),
    h2("Πληρωμή"),
    intro("Πώς πληρώνει ο πελάτης και αν τα χρήματα έχουν εισπραχθεί. Το εμπόρευμα φεύγει μόνο όταν η κατάσταση είναι «Πληρώθηκε» ή όταν το ποσό εισπράττεται στην παράδοση."),
    kvs(d.payment),
    h2("Αποστολή"),
    intro("Πού και πώς παραδίδεται η παραγγελία, με τα στοιχεία του παραλήπτη όπως τα έγραψε ο ίδιος."),
    kvs(d.shipping),
    ...(d.calc.length ? [h2("Πώς υπολογίστηκαν τα μεταφορικά"), intro("Ο υπολογισμός όπως έγινε στο ταμείο: τι χρεώθηκε στον πελάτη και πόσο κοστίζει η αποστολή σε εμάς."), list(d.calc)] : []),
    h2("Voucher και δελτίο παράδοσης"),
    intro(d.voucherHelp),
    ...d.vouchers.flatMap((v) => [kvs([["Αποστολή", v.title], ...v.rows]), links(v.links)]),
    ...(d.vouchers.length ? [] : [list(["Δεν έχει εκδοθεί voucher ακόμη."])]),
    ...(d.voucherLinks.length ? [links(d.voucherLinks)] : []),
    h2("SoftOne"),
    intro("Η εικόνα της παραγγελίας στο ERP: αν έχει καταχωρηθεί, με ποιο παραστατικό και σε ποιον πελάτη. Όσο δεν έχει καταχωρηθεί, το προσωπικό του λογιστηρίου δεν τη βλέπει στο SoftOne."),
    kvs(d.erp.rows),
    ...(d.erp.docs.length ? [table(["Παραστατικό", "Ημερομηνία", "Αξία"], d.erp.docs.map((x) => ({ html: [`<b>${esc(x.no)}</b><br><span style="color:${BRAND.muted}">${esc(x.type)}</span>`, esc(x.date), x.total == null ? "—" : money(x.total)], text: `- ${x.no} · ${x.type} · ${x.date}${x.total == null ? "" : ` · ${money(x.total)}`}` })), [2])] : []),
    ...(d.erp.needs.length ? [note(`<b>Λείπουν για να σταλεί στο SoftOne:</b> ${d.erp.needs.map(esc).join(" · ")}`, "warning")] : []),
    ...(d.erp.links.length ? [links(d.erp.links)] : []),
    ...(d.erp.remarks ? [h2("Παρατηρήσεις του παραστατικού (όπως γράφονται στο SoftOne)"), intro("Το κείμενο αυτό γράφεται αυτούσιο στις παρατηρήσεις του παραστατικού, ώστε όποιος το ανοίξει στο SoftOne να έχει όλες τις οδηγίες πληρωμής και αποστολής."), pre(d.erp.remarks)] : []),
  ];
  return renderEmail(ctx, { subject: `[${d.number}] ${EVENT[d.event]} · ${d.summary}`, preheader: d.next.text, blocks, footerNote: "Εσωτερικό μήνυμα για το προσωπικό της Euronics. Περιέχει προσωπικά δεδομένα πελάτη: μην το προωθείς εκτός εταιρείας." });
}

export const STAFF_ORDER_SAMPLE: StaffOrderData = {
  event: "new", number: "EUR-20261123-4821", adminUrl: "https://app.euronics.gr/admin/orders/EUR-20261123-4821", summary: "552,90 € · Courier ΕΛΤΑ Courier · Αντικαταβολή",
  next: { tone: "success", text: "Το voucher SE123456789GR εκδόθηκε: τύπωσε την ετικέτα και παράδωσε το δέμα στον courier. Ο courier εισπράττει 552,90 €." },
  steps: [
    "Τύπωσε την ετικέτα του voucher SE123456789GR (σύνδεσμος «Ετικέτα voucher» πιο κάτω) και κόλλησέ τη στο δέμα, μία ετικέτα σε κάθε τεμάχιο.",
    "Τύπωσε το δελτίο παράδοσης (σύνδεσμος «Δελτίο παράδοσης στον courier»).",
    "Δώσε το δέμα στον οδηγό του courier (ΕΛΤΑ Courier). Ο οδηγός υπογράφει στο «Παρέλαβε» του δελτίου· κράτα το ως απόδειξη ότι το παρέλαβε.",
    "Είσπραξη: ο courier εισπράττει 552,90 € από τον πελάτη στην παράδοση (το ποσό είναι γραμμένο στο voucher).",
    "SoftOne: η παραγγελία έχει καταχωρηθεί (FINDOC 5680170). Δεν χρειάζεται κάτι.",
  ],
  order: [["Αριθμός", "EUR-20261123-4821"], ["Ημερομηνία", "23/11/2026 15:42"], ["Κατάσταση", "Σε αναμονή"]],
  customer: [["Ονοματεπώνυμο", "Μαρία Παπαδοπούλου"], ["Τηλέφωνο", "6944123456"], ["Email", "maria@example.com"], ["Λογαριασμός", "Εγγεγραμμένος πελάτης"], ["Παραστατικό", "Απόδειξη λιανικής"], ["Πελάτης στο SoftOne", "Κωδικός 200 · ΠΕΛΑΤΗΣ ΛΙΑΝΙΚΗΣ (TRDR 200)"]],
  lines: [
    { code: "150066", title: 'LG 43NANO82T6B NanoCell 43" 4K Smart TV', qty: 1, list: 399, discount: 50, total: 349, notes: ["Προσφορά BF-TV v2: −50,00 €"] },
    { code: "103682", title: "Επέκταση εγγύησης +3 έτη", qty: 1, list: 39, discount: 0, total: 39, notes: ["Υπηρεσία της γραμμής «LG 43NANO82T6B»"] },
    { code: null, title: "JBL Flip 7 Φορητό Ηχείο Bluetooth", qty: 1, list: 159, discount: 0, total: 159, notes: [] },
  ],
  totals: [["Αξία προϊόντων και υπηρεσιών", 597], ["Εκπτώσεις", "−50,00 €"], ["Μεταφορικά και αντικαταβολή", 5.9], ["Από το σύνολο, ΦΠΑ", 107.01]], total: 552.9,
  promos: ["Εφαρμόστηκε: BF-TV «Black Friday τηλεοράσεις» −50,00 €", "Δεν εφαρμόστηκε: FREESHIP «Δωρεάν μεταφορικά» (ελάχιστη αξία 600 €)"],
  payment: [["Τρόπος", "Αντικαταβολή"], ["Κατάσταση", "Εκκρεμεί"], ["Εισπράττεται στην παράδοση", "552,90 €"]],
  shipping: [["Τρόπος", "Courier — ΕΛΤΑ Courier"], ["Παραλήπτης", "Μαρία Παπαδοπούλου, τηλ. 6944123456"], ["Διεύθυνση", "Τσιμισκή 64, 3ος όροφος, 54622 Θεσσαλονίκη"], ["Σημειώσεις πελάτη", "Κουδούνι Παπαδοπούλου, μετά τις 17:00"]],
  calc: ["ΕΛΤΑ Courier, τιμοκατάλογος, ζώνη «Ηπειρωτική Ελλάδα» × χρεώσιμο βάρος 12,4 κιλά: 3,90 € (δικό μας κόστος 3,10 €).", "Αντικαταβολή: χρέωση 2,00 €.", "Χρεώθηκαν στον πελάτη: 5,90 € (μεταφορικά 3,90 € + αντικαταβολή 2,00 €)."],
  vouchers: [{ title: "ΕΛΤΑ Courier · voucher SE123456789GR", rows: [["Κατάσταση", "Εκδόθηκε"], ["Τεμάχια / βάρος", "1 τεμ. · 12,4 κιλά"], ["Αντικαταβολή στο voucher", "552,90 €"]], links: [["Ετικέτα voucher (PDF)", "https://app.euronics.gr/api/admin/shipments/label?ids=sample", "Τύπωσέ τη και κόλλησέ τη στο δέμα, με το barcode ορατό. Μία ετικέτα ανά τεμάχιο. Θέλει σύνδεση στη διαχείριση."], ["Παρακολούθηση στον courier", "https://www.elta-courier.gr/search?br=SE123456789GR"], ["Σελίδα παρακολούθησης του πελάτη", "https://www.euronics.gr/entopismos?no=EUR-20261123-4821"]] }],
  voucherHelp: "Το voucher έχει εκδοθεί. Η ετικέτα μπαίνει πάνω στο δέμα. Το δελτίο παράδοσης είναι το χαρτί που υπογράφει ο οδηγός του courier όταν παραλαμβάνει τα δέματα και μένει σε εσάς ως απόδειξη παραλαβής.",
  voucherLinks: [
    ["Δελτίο παράδοσης στον courier (PDF A4)", "https://app.euronics.gr/api/admin/shipments/deltio?ids=sample", "Η λίστα με τα vouchers αυτής της παραγγελίας: αριθμός voucher, παραλήπτης, τεμάχια, βάρος, αντικαταβολή και θέσεις υπογραφής «Παρέδωσε» / «Παρέλαβε»."],
    ["Δελτίο και ετικέτες μαζί (ένα PDF)", "https://app.euronics.gr/api/admin/shipments/deltio?ids=sample&labels=1", "Το δελτίο παράδοσης και αμέσως μετά οι ετικέτες, για να τα τυπώσεις όλα με τη μία."],
  ],
  erp: {
    links: [["Πορεία στο SoftOne", "https://app.euronics.gr/admin/orders/EUR-20261123-4821?tab=softone", "Σχηματικά όλα τα παραστατικά που βγήκαν από την παραγγελία μέσα στο ERP."]],
    rows: [["Κατάσταση", "Στάλθηκε"], ["Παραστατικό παραγγελίας", "FINDOC 5680170 · σειρά 7005 «ΠΑΡΑΓΓΕΛΙΑ e-Shop»"], ["Πελάτης", "Κωδικός 200 · ΠΕΛΑΤΗΣ ΛΙΑΝΙΚΗΣ (TRDR 200)"]],
    docs: [{ no: "EUR-20261123-4821", type: "ΠΑΡΑΓΓΕΛΙΑ e-Shop", date: "23/11/2026", total: 552.9 }, { no: "PES0004711", type: "ΠΑΡΑΓΓΕΛΙΑ e-Shop Απλήρωτη", date: "23/11/2026", total: 552.9 }],
    needs: ["Κωδικός είδους SoftOne για «JBL Flip 7 Φορητό Ηχείο Bluetooth»"],
    remarks: "ΠΛΗΡΩΜΗ\nΤρόπος: Αντικαταβολή\nΕΙΣΠΡΑΞΗ από τον πελάτη στην παράδοση: 552,90 €\n\nΑΠΟΣΤΟΛΗ\nΤρόπος: Courier — ΕΛΤΑ Courier\nΠαραλήπτης: Μαρία Παπαδοπούλου, τηλ. 6944123456",
  },
};
