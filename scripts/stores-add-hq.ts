import "dotenv/config";
import { writeFileSync } from "fs";
import { db } from "../lib/db";
import { storeAreaZip } from "../lib/shipping/carriers";
import { rankByRoad } from "../lib/geo/road";
import { geocodeAddress } from "../lib/stores/geocode";

/**
 * Κεντρικά Euronics (MEGA ELECTRICS ΑΕΒΕ) ως κατάστημα: ορατό στο site και σημείο παραλαβής (απόφαση χρήστη 26/11/2026).
 * Χρησιμοποιεί την ΥΠΑΡΧΟΥΣΑ κρυφή γραμμή Store (συνδεδεμένη με το υποκατάστημα SoftOne του μέλους MEGA ELECTRICS) — δεν φτιάχνει δεύτερη.
 *
 *   npx tsx scripts/stores-add-hq.ts                         → dry-run: τι θα γραφτεί και τι αλλάζει στο ταμείο, χωρίς εγγραφή
 *   npx tsx scripts/stores-add-hq.ts --apply backup.json     → εγγραφή (backup πριν, audit «stores.hq.apply»)
 *   --lat 38.08 --lng 23.74                                  → ακριβές σημείο, αν το δώσει ο χρήστης (αλλιώς μένει το σημερινό)
 */
const STORE_ID = "cmvwcd2ov0079d4wh4fejbj6a"; // «MEGA ELECTRICS AEBE», ΣΤΑΜ ΔΑΜΑΣΚΟΥ 12, 13671 — κρυφή σήμερα
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const apply = process.argv.includes("--apply");

(async () => {
  const store = await db.store.findUnique({ where: { id: STORE_ID }, include: { partner: { select: { id: true, name: true, active: true, cooperating: true } } } });
  if (!store?.partner) throw new Error("Δεν βρέθηκε η γραμμή των κεντρικών ή το μέλος της");
  const lat = arg("--lat") ? Number(arg("--lat")) : store.lat, lng = arg("--lng") ? Number(arg("--lng")) : store.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 34 || lat > 42 || lng < 19 || lng > 30) throw new Error("Μη έγκυρες συντεταγμένες");
  const storeData = {
    active: true, // ορατό στο site (λίστα καταστημάτων) και ο Τ.Κ. του μετρά στις «περιοχές με κατάστημα»
    name: "Euronics Κεντρικά · MEGA ELECTRICS ΑΕΒΕ",
    address: "Δαμάσκου Σταμάτη 12", city: "Αχαρνές", zip: "13671", region: "Αττική",
    phone: "2104835143", fax: "2104835190", email: "info@euronics.gr",
    services: ["click-collect"],
    lat, lng, ...(arg("--lat") ? { geocoded: "manual" } : {}),
  };
  const partnerData = { cooperating: true }; // χωρίς αυτό η γραμμή δεν μπαίνει στην παραλαβή (pickupStoreIds) ούτε στα κοντινά καταστήματα

  const pick = <T extends object>(o: T, keys: string[]) => Object.fromEntries(keys.map((k) => [k, (o as Record<string, unknown>)[k]]));
  console.log("Κατάστημα", STORE_ID);
  console.log("  πριν:", pick(store, Object.keys(storeData)));
  console.log("  μετά:", storeData);
  console.log("Μέλος", store.partner.id, store.partner.name, "| cooperating:", store.partner.cooperating, "→", partnerData.cooperating);

  // τι αλλάζει στο ταμείο
  const zips = (await db.store.findMany({ where: { active: true }, select: { zip: true } })).map((r) => r.zip.trim());
  const withHq = [...zips, storeData.zip];
  for (const z of ["13231", "13232", "12135", "13671", "13673", "13341"]) console.log(`  Τ.Κ. ${z}: περιοχή με κατάστημα ${storeAreaZip(z, zips)} → ${storeAreaZip(z, withHq)}`);
  const pickupBefore = await db.store.count({ where: { active: true, partner: { active: true, cooperating: true } } });
  console.log(`  σημεία παραλαβής: ${pickupBefore} → ${pickupBefore + (store.active && store.partner.cooperating ? 0 : 1)}`);
  for (const q of ["Λεωνίδου 14, 13231 Πετρούπολη", "Θηβών 100, 12135 Περιστέρι"]) {
    const pt = await geocodeAddress(`${q}, Ελλάδα`, { timeoutMs: 8000, preferPlace: true }).catch(() => null);
    const r = pt ? await rankByRoad(pt, [{ id: "hq", lat, lng }]).catch(() => null) : null;
    console.log(`  οδικά χλμ ${q} → κεντρικά: ${r?.[0] ? r[0].km.toFixed(1) : "—"}`);
    await new Promise((res) => setTimeout(res, 1200)); // Nominatim: 1 αίτημα/δευτ.
  }

  if (!apply) { console.log("\nDRY-RUN: τίποτα δεν γράφτηκε. Για εγγραφή: --apply <backup.json>"); await db.$disconnect(); process.exit(0); }
  const backupPath = arg("--apply");
  if (!backupPath || backupPath.startsWith("--")) throw new Error("Δώσε αρχείο backup μετά το --apply");
  const before = { store: pick(store, Object.keys(storeData)), partner: { id: store.partner.id, cooperating: store.partner.cooperating } };
  writeFileSync(backupPath, JSON.stringify(before, null, 1));
  await db.$transaction([
    db.store.update({ where: { id: STORE_ID }, data: storeData }),
    db.partner.update({ where: { id: store.partner.id }, data: partnerData }),
    db.auditLog.create({ data: { staffId: null, action: "stores.hq.apply", entity: "Store", entityId: STORE_ID, before: before as object, after: { store: storeData, partner: partnerData } } }),
  ]);
  console.log("Γράφτηκε. Backup:", backupPath);
  await db.$disconnect(); process.exit(0);
})();
