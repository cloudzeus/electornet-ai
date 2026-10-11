import { test } from "node:test";
import assert from "node:assert/strict";
import { planDevices, extensionMonths, isExtensionLine } from "./erp-devices";

const L = (lineNo: number, title: string, unitPrice: number, qty = 1, code: string | null = null) => ({ lineNo, mtrl: 1000 + lineNo, code, title, qty, unitPrice });

test("δένει την επέκταση με τη συσκευή που ταιριάζει στην τιμή (15,5 %), όχι με όλες", () => {
    const plan = planDevices([L(1, "TV LG 55", 689), L(2, "Soundbar", 249), L(3, "Επέκταση εγγύησης", 38.6, 1, "ΕΓΓΥΗΣΗ")], () => null);
    assert.equal(plan.find((d) => d.lineNo === 2)?.extMonths, 24);
    assert.equal(plan.find((d) => d.lineNo === 1)?.extMonths, null);
});
test("με μία μόνο συσκευή η επέκταση πάει σε αυτήν ακόμη κι αν η τιμή δεν ταιριάζει", () => {
    const plan = planDevices([L(1, "Ψυγείο", 500), L(2, "Επέκταση εγγύησης", 30)], () => null);
    assert.equal(plan[0].extMonths, 24);
});
test("χωρίς ταίριασμα τιμής σε πολλές συσκευές δεν μαντεύει", () => {
    const plan = planDevices([L(1, "A", 500), L(2, "B", 900), L(3, "Επέκταση εγγύησης", 10)], () => null);
    assert.equal(plan.every((d) => d.extMonths == null), true);
});
test("εγγύηση κατασκευαστή από τα χαρακτηριστικά, αλλιώς 24· αξεσουάρ κάτω από 50 € δεν είναι συσκευές", () => {
    const plan = planDevices([L(1, "Kenwood", 300), L(2, "Καλώδιο", 9)], (l) => (l.lineNo === 1 ? 60 : null));
    assert.equal(plan.length, 1);
    assert.equal(plan[0].months, 60);
});
test("ένα τεμάχιο ανά ποσότητα (έως 5) και δύο επεκτάσεις για δύο ίδιες συσκευές", () => {
    const plan = planDevices([L(1, "Laptop", 1000, 2), L(2, "Επέκταση εγγύησης", 155, 2)], () => null);
    assert.equal(plan.length, 2);
    assert.equal(plan.filter((d) => d.extMonths).length, 2);
});
test("διάρκεια επέκτασης από τον τίτλο", () => {
    assert.equal(extensionMonths("Επέκταση εγγύησης +3 έτη"), 36);
    assert.equal(extensionMonths("Επέκταση εγγύησης"), 24);
    assert.equal(isExtensionLine("TL Range Extender RE305"), false);
});
