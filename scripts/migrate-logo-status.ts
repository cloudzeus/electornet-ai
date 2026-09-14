/**
 * Εφάπαξ: βάζει τις μάρκες στην ουρά έγκρισης λογοτύπου.
 *
 * Πριν, ό,τι έβρισκε το API με ακριβές domain γραφόταν αυτόματα. Τώρα κάθε
 * λογότυπο θέλει επιβεβαίωση διαχειριστή πριν κατέβει στο δικό μας CDN, οπότε
 * όσα είχαν μπει αυτόματα γυρίζουν σε «προς έγκριση».
 * Τρέξε: npx tsx --conditions=react-server scripts/migrate-logo-status.ts
 */
try { process.loadEnvFile(); } catch {}
import { db } from "../lib/db";
import { logoUrl } from "../lib/brandfetch/resolve";

async function main() {
  // Δικό μας αρχείο = ήδη εγκεκριμένο
  const own = await db.brand.updateMany({ where: { logo: { not: null }, logoStatus: null }, data: { logoStatus: "approved" } });

  // Αυτόματα από το API ή πρόταση που περίμενε: όλα προς έγκριση
  const queue = await db.brand.findMany({
    where: { logo: null, logoStatus: null, OR: [{ domain: { not: null } }, { domainSuggest: { not: null } }] },
    select: { id: true, domain: true, domainSuggest: true },
  });
  for (const b of queue) {
    const d = (b.domainSuggest ?? b.domain)!;
    await db.brand.update({ where: { id: b.id }, data: { domainSuggest: d, logoCdn: logoUrl(d), logoStatus: "pending" } });
  }

  // Ελέγχθηκαν και δεν βρέθηκε τίποτα
  const none = await db.brand.updateMany({ where: { logo: null, logoStatus: null, domain: null, domainSuggest: null, logoAt: { not: null } }, data: { logoStatus: "none" } });

  console.log(`εγκεκριμένα (δικό μας αρχείο): ${own.count} · προς έγκριση: ${queue.length} · χωρίς εύρεση: ${none.count}`);
  await db.$disconnect();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
