import type { Metadata } from "next";
import Link from "next/link";
import { getPublicSettings } from "@/lib/settings/store";

export const metadata: Metadata = { title: "Διαγραφή δεδομένων", description: "Πώς ζητάς τη διαγραφή του λογαριασμού και των προσωπικών σου δεδομένων από τη Euronics, και πώς αποσυνδέεις Google, Microsoft, Facebook ή Apple." };

/**
 * Οδηγίες διαγραφής δεδομένων — ο σύνδεσμος που ζητούν οι πάροχοι social login (Facebook: «Data deletion instructions URL»).
 * Το αίτημα γίνεται από τον λογαριασμό (GDPR, απάντηση έως 30 ημέρες) ή μέσω εξυπηρέτησης πελατών.
 */
export default async function DataDeletionPage() {
  const pub = await getPublicSettings();
  const g = pub.general ?? {};
  const email = typeof g.email === "string" && g.email ? g.email : null;
  const phone = typeof g.phone === "string" && g.phone ? g.phone : null;
  const h2 = "m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)]";
  const p = "m-0 text-eu-ink-2 text-[length:var(--fs-16)] leading-relaxed";
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-8 grid gap-6">
      <header className="grid gap-2">
        <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-30)] leading-tight">Διαγραφή δεδομένων</h1>
        <p className={p}>Μπορείς οποιαδήποτε στιγμή να ζητήσεις τη διαγραφή του λογαριασμού σου και των προσωπικών σου δεδομένων. Ισχύει και αν συνδέθηκες με Google, Microsoft, Facebook ή Apple.</p>
      </header>
      <section className="grid gap-3">
        <h2 className={h2}>1. Από τον λογαριασμό σου</h2>
        <ol className="m-0 pl-5 grid gap-1.5 text-eu-ink-2 text-[length:var(--fs-16)]">
          <li><Link href="/syndesi?next=%2Flogariasmos%2Fstoixeia" className="text-eu-blue underline">Συνδέσου</Link> και άνοιξε «Ο λογαριασμός μου» → «Τα στοιχεία μου».</li>
          <li>Στο «Τα δεδομένα μου» πάτα «Διαγραφή λογαριασμού» και επιβεβαίωσε.</li>
          <li>Λαμβάνεις αριθμό αιτήματος. Η διαγραφή ολοκληρώνεται το αργότερο σε 30 ημέρες και σε ενημερώνουμε με email.</li>
        </ol>
      </section>
      <section className="grid gap-3">
        <h2 className={h2}>2. Χωρίς σύνδεση</h2>
        <p className={p}>Επικοινώνησε με την εξυπηρέτηση πελατών{email ? <> στο <a href={`mailto:${email}`} className="text-eu-blue underline">{email}</a></> : ""}{phone ? <> ή στο <a href={`tel:${phone.replace(/\s/g, "")}`} className="text-eu-blue underline">{phone}</a></> : ""}{!email && !phone ? <> από τη σελίδα <Link href="/epikoinonia" className="text-eu-blue underline">Επικοινωνία</Link></> : ""} με θέμα «Διαγραφή δεδομένων», από το email του λογαριασμού σου. Θα σου ζητήσουμε επιβεβαίωση ταυτότητας πριν τη διαγραφή.</p>
      </section>
      <section className="grid gap-3">
        <h2 className={h2}>3. Αποσύνδεση του παρόχου (προαιρετικά)</h2>
        <p className={p}>Για να σταματήσει και η πρόσβαση της Euronics στο προφίλ σου στον πάροχο:</p>
        <ul className="m-0 pl-5 grid gap-1.5 text-eu-ink-2 text-[length:var(--fs-16)]">
          <li><b>Facebook:</b> Ρυθμίσεις και απόρρητο → Ρυθμίσεις → Εφαρμογές και ιστότοποι → Euronics → Αφαίρεση.</li>
          <li><b>Google:</b> myaccount.google.com → Ασφάλεια → Συνδέσεις με εφαρμογές και υπηρεσίες τρίτων → Euronics → Διαγραφή όλων των συνδέσεων.</li>
          <li><b>Microsoft:</b> account.microsoft.com → Απόρρητο → Εφαρμογές και υπηρεσίες με πρόσβαση → Euronics → Κατάργηση.</li>
          <li><b>Apple:</b> iPhone → Ρυθμίσεις → [το όνομά σου] → Σύνδεση με Apple → Euronics → Διακοπή χρήσης.</li>
        </ul>
      </section>
      <section className="grid gap-3">
        <h2 className={h2}>Τι κρατάμε</h2>
        <p className={p}>Παραστατικά αγορών (αποδείξεις, τιμολόγια) και όσα στοιχεία απαιτεί ο νόμος για φορολογικούς λόγους και για τις εγγυήσεις διατηρούνται για τον χρόνο που ορίζει η νομοθεσία, ακόμη και μετά τη διαγραφή του λογαριασμού. Περισσότερα στην <Link href="/aporrito" className="text-eu-blue underline">Πολιτική απορρήτου</Link>.</p>
      </section>
    </article>
  );
}
