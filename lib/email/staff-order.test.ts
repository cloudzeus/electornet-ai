import { test } from "node:test";
import assert from "node:assert/strict";
import { renderStaffOrder, STAFF_ORDER_SAMPLE as S } from "./staff-order";
import type { EmailCtx } from "./layout-core";

const ctx: EmailCtx = { baseUrl: "https://www.euronics.gr", assetUrl: "https://app.euronics.gr", logoUrl: "https://cdn.example/logo.png", advisorUrl: "https://cdn.example/a.jpg", siteName: "Euronics", phone: "210", email: "info@euronics.gr", address: "Αχαρνές", legalName: "MEGA ELECTRICS ΑΕΒΕ", year: 2026 };

test("email προσωπικού: θέμα με αριθμό και περίληψη, όλες οι ενότητες, σύνδεσμοι voucher", () => {
  const m = renderStaffOrder(S, ctx);
  assert.equal(m.subject, "[EUR-20261123-4821] Νέα παραγγελία · 552,90 € · Courier ΕΛΤΑ Courier · Αντικαταβολή");
  for (const want of ["Τι κάνεις τώρα", "Πελάτης στο SoftOne", "Κωδικός 200", "Πώς υπολογίστηκαν τα μεταφορικά", "δικό μας κόστος 3,10 €", "voucher SE123456789GR", "/api/admin/shipments/label?ids=sample", "elta-courier.gr/search?br=SE123456789GR", "FINDOC 5680170", "PES0004711", "Λείπουν για να σταλεί στο SoftOne", "ΕΙΣΠΡΑΞΗ από τον πελάτη"]) {
    assert.ok(m.html.includes(want), `html: ${want}`);
    assert.ok(m.text.includes(want), `text: ${want}`);
  }
  assert.ok(m.html.includes("Λείπει ο κωδικός SoftOne") && m.html.includes("Κωδ. SoftOne <b>150066</b>"), "κωδικός SoftOne ανά γραμμή, και όταν λείπει");
});

test("email προσωπικού: ό,τι έγραψε ο πελάτης δεν γίνεται HTML", () => {
  const evil = '<img src=x onerror=alert(1)>"';
  const m = renderStaffOrder({ ...S, shipping: [["Σημειώσεις πελάτη", evil]], customer: [["Ονοματεπώνυμο", evil]], calc: [evil], lines: [{ ...S.lines[0], title: evil, notes: [evil] }], erp: { ...S.erp, remarks: evil, needs: [evil] }, next: { tone: "info", text: evil } }, ctx);
  assert.ok(!m.html.includes("<img src=x"), "ακατέργαστο HTML πελάτη στο μήνυμα");
  assert.ok(m.html.includes("&lt;img src=x onerror=alert(1)&gt;"));
});

test("email προσωπικού: χωρίς voucher το λέει, και κάθε γεγονός έχει δικό του τίτλο", () => {
  assert.ok(renderStaffOrder({ ...S, vouchers: [] }, ctx).text.includes("Δεν έχει εκδοθεί voucher ακόμη."));
  assert.match(renderStaffOrder({ ...S, event: "voucher" }, ctx).subject, /Εκδόθηκε voucher/);
  assert.match(renderStaffOrder({ ...S, event: "erp-doc" }, ctx).subject, /Νέο παραστατικό στο SoftOne/);
});

test("email προσωπικού: απλήρωτη παραγγελία — τίτλος «Δεν πληρώθηκε» και ο σύνδεσμος πληρωμής του πελάτη", () => {
  const payUrl = "https://www.euronics.gr/checkout/pliromi?no=EUR-20261123-4821&k=abc";
  const m = renderStaffOrder({ ...S, event: "unpaid", payUrl }, ctx);
  assert.match(m.subject, /Δεν πληρώθηκε/);
  assert.ok(m.html.includes("Σύνδεσμος πληρωμής για τον πελάτη") && m.html.includes("pliromi?no=EUR-20261123-4821&amp;k=abc"), "σύνδεσμος στο html");
  assert.ok(m.text.includes(payUrl), "σύνδεσμος στο απλό κείμενο");
  assert.ok(!renderStaffOrder(S, ctx).html.includes("Σύνδεσμος πληρωμής"), "πληρωμένη ή αντικαταβολή: χωρίς σύνδεσμο");
});

test("email προσωπικού: βήματα με αρίθμηση, εξήγηση κάτω από κάθε σύνδεσμο, δελτίο παράδοσης και έκδοση voucher", () => {
  const m = renderStaffOrder(S, ctx);
  for (const want of ["Όλη η δουλειά, βήμα βήμα", "Voucher και δελτίο παράδοσης", "Δελτίο παράδοσης στον courier (PDF A4)", "/api/admin/shipments/deltio?ids=sample", "θέσεις υπογραφής «Παρέδωσε» / «Παρέλαβε»", "Πορεία στο SoftOne"]) {
    assert.ok(m.html.includes(want.replace(/&/g, "&amp;")), `html: ${want}`);
    assert.ok(m.text.includes(want), `text: ${want}`);
  }
  assert.ok(m.html.includes("<ol ") && m.text.includes("1. Τύπωσε την ετικέτα"), "βήματα αριθμημένα και στο απλό κείμενο");
  // πριν από το voucher: ο σύνδεσμος έκδοσης με την εξήγησή του, χωρίς σύνδεσμο δελτίου
  const before = renderStaffOrder({ ...S, vouchers: [], voucherHelp: "Το voucher είναι η εντολή αποστολής προς τον courier.", voucherLinks: [["Έκδοση voucher στη διαχείριση", `${S.adminUrl}#voucher`, "Πάτα «Έκδοση voucher»."]] }, ctx);
  assert.ok(before.html.includes(`${S.adminUrl}#voucher`) && before.text.includes("Πάτα «Έκδοση voucher»."), "σύνδεσμος έκδοσης voucher με εξήγηση");
  assert.ok(!before.html.includes("shipments/deltio"), "χωρίς voucher δεν υπάρχει δελτίο");
  // ό,τι δεν προχωρά ακόμη: χωρίς βήματα
  assert.ok(!renderStaffOrder({ ...S, steps: [] }, ctx).html.includes("βήμα βήμα"));
});
