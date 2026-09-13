/** Consent wordings (versioned, hashed). Run: npx tsx prisma/seed-gdpr.ts */
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
const db = new PrismaClient();
const TEXTS = [
  { key: "newsletter", title: "Newsletter", text: "Συμφωνώ να λαμβάνω εμπορική επικοινωνία (newsletter) από τη Euronics και έχω διαβάσει την Πολιτική Απορρήτου. Μπορώ να διαγραφώ οποιαδήποτε στιγμή από τον σύνδεσμο κάθε email." },
  { key: "offers", title: "Προσωποποιημένες προσφορές", text: "Συμφωνώ η Euronics να μου στέλνει προσφορές και ειδοποιήσεις (πτώση τιμής, διαθεσιμότητα) με email, SMS ή Viber, με βάση τις αγορές και τα ενδιαφέροντά μου." },
  { key: "service", title: "Ενημερώσεις service & εγγυήσεων", text: "Συμφωνώ να λαμβάνω ενημερώσεις για τις εγγυήσεις, τα ραντεβού service και τις συσκευές που έχω καταχωρίσει." },
  { key: "terms", title: "Όροι χρήσης", text: "Αποδέχομαι τους Όρους Χρήσης του euronics.gr." },
  { key: "privacy", title: "Πολιτική απορρήτου", text: "Έχω διαβάσει και κατανοώ την Πολιτική Απορρήτου της Euronics (υπεύθυνος επεξεργασίας: MEGA ELECTRICS ΑΕΒΕ)." },
  { key: "cookies", title: "Cookies", text: "Επιτρέπω τη χρήση cookies ανάλυσης και marketing σύμφωνα με την Πολιτική Cookies." },
  { key: "geolocation", title: "Τοποθεσία", text: "Επιτρέπω τη χρήση της τοποθεσίας μου για την εύρεση του κοντινότερου καταστήματος. Η θέση μου μένει μόνο στον browser μου." },
];
async function main() {
  for (const t of TEXTS) {
    const hash = createHash("sha256").update(t.text).digest("hex");
    await db.consentText.upsert({ where: { key_version_locale: { key: t.key, version: "2026-09", locale: "el" } }, update: { text: t.text, hash, title: t.title }, create: { key: t.key, version: "2026-09", locale: "el", title: t.title, text: t.text, hash } });
  }
  console.log(`seeded ${TEXTS.length} consent texts (v2026-09)`);
}
main().finally(() => db.$disconnect());
