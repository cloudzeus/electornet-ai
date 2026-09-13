/** Demo retail customers (tag "demo") so the admin has data to show. Run: npx tsx prisma/seed-customers.ts */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const d = (s: string) => new Date(s);
async function main() {
  const stores = await db.store.findMany({ take: 3, orderBy: { name: "asc" }, select: { id: true } });
  const demo = [
    { email: "maria.papadopoulou@example.gr", firstName: "Μαρία", lastName: "Παπαδοπούλου", phone: "2106401234", mobile: "6944123456", birthday: d("1988-04-12"), gender: "f", newsletter: true, loyaltyPoints: 1240, loyaltyTier: "silver", type: "individual", vatNumber: "123456789", doy: "Χολαργού" },
    { email: "info@kafe-aroma.gr", firstName: "Νίκος", lastName: "Αντωνίου", company: "ΚΑΦΕ ΑΡΩΜΑ Ο.Ε.", phone: "2310555123", mobile: "6971234567", type: "business", vatNumber: "998877665", doy: "Α' Θεσσαλονίκης", profession: "Καφετέρια", newsletter: false, loyaltyPoints: 80, loyaltyTier: "bronze" },
    { email: "giorgos.k@example.gr", firstName: "Γιώργος", lastName: "Κωνσταντίνου", mobile: "6980001122", type: "individual", newsletter: true, loyaltyPoints: 3560, loyaltyTier: "gold", birthday: d("1975-11-02"), gender: "m" },
  ];
  for (const [i, c] of demo.entries()) {
    const row = await db.customer.upsert({
      where: { email: c.email },
      update: {},
      create: { ...c, tags: ["demo"], source: i === 1 ? "store" : "web", passwordHash: await bcrypt.hash("demo1234", 10), emailVerifiedAt: new Date(), lastLoginAt: new Date(), preferredStoreId: stores[i % stores.length]?.id ?? null },
    });
    if (await db.address.count({ where: { customerId: row.id } })) continue;
    await db.address.createMany({ data: [
      { customerId: row.id, label: "Σπίτι", recipient: `${c.firstName} ${c.lastName}`, street: ["Μεσογείων", "Τσιμισκή", "Λ. Κηφισίας"][i], number: ["64", "12", "210"][i], floor: ["3ος", "", "1ος"][i], doorbell: c.lastName, city: ["Αθήνα", "Θεσσαλονίκη", "Μαρούσι"][i], zip: ["11527", "54624", "15124"][i], region: ["Αττική", "Θεσσαλονίκη", "Αττική"][i], phone: c.mobile, isDefault: true, isBilling: true, notes: i === 0 ? "Χωρίς ασανσέρ, 3ος όροφος" : null },
      ...(i === 0 ? [{ customerId: row.id, label: "Εξοχικό", recipient: "Μαρία Παπαδοπούλου", street: "Παραλία", number: "5", city: "Πόρτο Ράφτη", zip: "19009", region: "Αττική", isDefault: false, isBilling: false }] : []),
    ] });
    await db.consent.createMany({ data: [
      { customerId: row.id, topic: "newsletter", channel: "email", granted: c.newsletter, source: "account", textVersion: "v2", at: d("2026-03-01") },
      { customerId: row.id, topic: "offers", channel: "sms", granted: i !== 1, source: "checkout", textVersion: "v2", at: d("2026-03-01") },
      { customerId: row.id, topic: "service", channel: "email", granted: true, source: "account", textVersion: "v2", at: d("2026-03-01") },
    ] });
    const devs = await db.customerDevice.createManyAndReturn({ data: [
      { customerId: row.id, brand: "Samsung", title: "Πλυντήριο 9kg WW90T4040", model: "WW90T4040CE", serial: `SN${100000 + i * 7}`, purchasedAt: d("2025-02-14"), warrantyMonths: 24, warrantyUntil: d("2027-02-14"), registeredBy: "order", storeId: stores[0]?.id },
      { customerId: row.id, brand: "LG", title: "OLED evo C4 55\"", model: "OLED55C4", serial: `LG${200000 + i}`, purchasedAt: d("2024-11-20"), warrantyMonths: 24, warrantyUntil: d("2026-11-20"), extendedUntil: i === 2 ? d("2028-11-20") : null, extendedPlan: i === 2 ? "Extra 2 έτη" : null, registeredBy: "erp", invoiceNo: `ΑΛΠ-${4400 + i}` },
    ] });
    await db.serviceTicket.create({ data: { number: `SRV-${10001 + i}`, customerId: row.id, deviceId: devs[0].id, kind: i === 1 ? "installation" : "repair", status: i === 2 ? "done" : "scheduled", mode: "visit", description: i === 1 ? "Εγκατάσταση πλυντηρίου και σύνδεση παροχής" : "Δεν στύβει, θόρυβος στο στύψιμο", storeId: stores[0]?.id, scheduledAt: d("2026-09-18T10:00:00"), slot: "Πρωί 9–13", technician: "Κ. Δημητρίου", inWarranty: true, timeline: [{ at: "2026-09-10T09:00:00Z", status: "new", note: "Αίτημα από τον λογαριασμό" }, { at: "2026-09-11T12:00:00Z", status: "scheduled", note: "Ραντεβού 18/9 πρωί", by: "Demo Admin" }] } });
    await db.loyaltyTransaction.createMany({ data: [
      { customerId: row.id, points: 900, reason: "order", note: "Παραγγελία EUR-20260214-0031", at: d("2026-02-14") },
      { customerId: row.id, points: 50, reason: "review", note: "Αξιολόγηση προϊόντος", at: d("2026-03-02") },
      { customerId: row.id, points: c.loyaltyPoints - 950, reason: "erp", note: "Αγορές καταστήματος (SoftOne)", at: d("2026-08-30") },
    ] });
    await db.customerNote.create({ data: { customerId: row.id, staffName: "Demo Admin", text: i === 0 ? "Προτιμά παράδοση απόγευμα, τηλέφωνο πριν." : i === 1 ? "Τιμολόγιο πάντα στην εταιρεία, ζητά προσφορά για επαγγελματικό εξοπλισμό." : "VIP — χρυσός πελάτης, 3 αγορές το 2026.", pinned: i === 2 } });
    await db.customerEvent.createMany({ data: [
      { customerId: row.id, kind: "register", meta: { source: "web" }, at: d("2025-02-10") },
      { customerId: row.id, kind: "order", meta: { number: "EUR-20260214-0031", total: 899 }, at: d("2026-02-14") },
      { customerId: row.id, kind: "consent", meta: { topic: "newsletter", granted: c.newsletter }, at: d("2026-03-01") },
      { customerId: row.id, kind: "login", meta: { ip: "…" }, at: new Date() },
    ] });
  }
  console.log(`seeded ${demo.length} demo customers (password demo1234)`);
}
main().finally(() => db.$disconnect());
