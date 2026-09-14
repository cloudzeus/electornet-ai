# Πληρωμές & αποστολές — τι ζητάμε από τον πελάτη

Όλα τα στοιχεία μπαίνουν στο **Ρυθμίσεις → Πληρωμές** και **Ρυθμίσεις → Αποστολές** (super admin), ποτέ στον κώδικα. Για κάθε πάροχο ζητάμε **test/sandbox** και **live** στοιχεία, ώστε να δοκιμάζουμε στο staging (`https://euronics.dgsoft.gr`) πριν την παραγωγή (`https://www.euronics.gr`).

Κοινά για όλους τους παρόχους πληρωμών:
- Ο λογαριασμός να ανήκει στην εταιρεία (ΑΦΜ, IBAN εκκαθάρισης), όχι σε προσωπικό λογαριασμό.
- Πρόσβαση ρόλου Developer/Admin στο i4ria στο κάθε portal, για webhooks και δοκιμές.
- Επωνυμία που θα εμφανίζεται στο statement του πελάτη (π.χ. «EURONICS»).
- Παράδοση κλειδιών μέσω password manager ή link μιας χρήσης, όχι email.

## 1. Viva Wallet (Smart Checkout) — κάρτες, δόσεις, Apple Pay, Google Pay, IRIS
Πηγαίνει στο `provider=Viva Wallet`.
1. **Δύο λογαριασμοί**: demo (`demo.vivapayments.com`) και live (`vivapayments.com`), και οι δύο με πρόσβαση για εμάς.
2. **Smart Checkout credentials** (Settings → API Access): **Client ID** και **Client Secret** (OAuth2) — ξεχωριστά για demo και live.
3. **Merchant ID** και **API Key** (Settings → API Access → Basic Auth) — για επιστροφές χρημάτων και έλεγχο συναλλαγών.
4. **Source Code**: ένας «Website/App Source» ανά περιβάλλον (Sales → Online Payments → Websites/Apps) με domain `www.euronics.gr` και `euronics.dgsoft.gr`, success URL `/checkout/epityxia`, failure URL `/checkout/apotyxia`. Μας δίνει τον 4ψήφιο Source Code του καθενός.
5. **Webhooks**: στο Viva portal δηλώνουμε εμείς το `https://www.euronics.gr/api/webhooks/viva` (Transaction Payment Created / Failed / Reversed). Χρειαζόμαστε από τον πελάτη μόνο την πρόσβαση· το **verification key** το παράγει το portal.
6. **Δόσεις**: ποιες δόσεις ανά ποσό θέλει (π.χ. έως 12 άτοκες από 300 €, 24 από 1000 €). Οι δόσεις πρέπει να είναι ενεργές στη σύμβαση Viva.
7. **Apple Pay / Google Pay**: ενεργοποιούνται στο Viva portal (Settings → Payment methods). Για Apple Pay η Viva κάνει η ίδια την επαλήθευση domain μέσα από το Smart Checkout· ο πελάτης δεν χρειάζεται Apple Developer λογαριασμό γι' αυτό.
8. **IRIS** (πληρωμή από τράπεζα μέσω DIAS): ενεργοποιείται ως payment method στη Viva (Settings → Payment methods → IRIS). Χρειάζεται ο πελάτης να έχει ενεργό IRIS στον επαγγελματικό του λογαριασμό. Επιστρέφει αυτόματα στο checkout, χωρίς άλλα στοιχεία από εμάς.
9. **Αποδοχή σύμβασης** για τα payment methods που θέλει (κάρτες, Apple/Google Pay, IRIS, δόσεις) — η Viva τα ενεργοποιεί μετά από αίτηση και KYC.

## 2. Revolut Business (Merchant API) — κάρτες, Apple Pay, Google Pay, Revolut Pay
Πηγαίνει στο `revolutApiKey`.
1. **Revolut Business λογαριασμός** της εταιρείας με ενεργό **Merchant account** (Merchant → Get started, έγκριση KYB από τη Revolut).
2. **Merchant API keys** (Merchant → Developers → API keys): **Secret key** και **Public key**, ξεχωριστά για **Sandbox** (`sandbox-business.revolut.com`) και **Production**.
3. **Webhook signing secret**: το δηλώνουμε εμείς (`/api/webhooks/revolut`, events `ORDER_COMPLETED`, `ORDER_AUTHORISED`, `ORDER_PAYMENT_FAILED`) και κρατάμε το signing secret που επιστρέφει.
4. **Apple Pay**: στο Revolut portal (Merchant → Payment methods → Apple Pay) γίνεται **domain registration** για `www.euronics.gr` και `euronics.dgsoft.gr`. Μας δίνουν ένα αρχείο επαλήθευσης που το ανεβάζουμε στο `/.well-known/apple-developer-merchantid-domain-association`. Δεν χρειάζεται Apple Developer λογαριασμός.
5. **Google Pay**: ενεργοποιείται από το ίδιο μενού, χωρίς επιπλέον στοιχεία.
6. **Revolut Pay**: ενεργό by default με το Merchant account.
7. Απόφαση πελάτη: **ποιος πάροχος είναι ο κύριος για κάρτες** (Viva ή Revolut) και ποιος δείχνεται δεύτερος, ώστε να μη διπλασιάζονται τα κουμπιά Apple/Google Pay.

## 3. PayPal
1. **PayPal Business** λογαριασμός επαληθευμένος στην εταιρεία (business.paypal.com), με ενεργή λήψη πληρωμών σε EUR.
2. **REST App** στο developer.paypal.com (My Apps & Credentials): **Client ID** και **Secret** για **Sandbox** και **Live**.
3. **Webhook**: το δηλώνουμε εμείς (`/api/webhooks/paypal`, events `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`) και κρατάμε το **Webhook ID**.
4. Επωνυμία εμπόρου όπως θα εμφανίζεται στο PayPal («Euronics»), και αν θέλει ενεργό το **Pay Later / δόσεις PayPal** και το **PayPal Credit**.
5. **Sandbox test accounts** (buyer/seller) από το developer portal — τα δημιουργούμε εμείς αν έχουμε πρόσβαση.

## 4. IRIS
Το IRIS δεν έχει δικό του API για e-shops· περνά από τον PSP. Επιλογές:
- **Μέσω Viva** (προτείνεται, ένα κουμπί «IRIS» στο Smart Checkout): βλ. §1.8.
- **Μέσω τράπεζας** (π.χ. Eurobank/Alpha/Πειραιώς e-commerce): θέλει ξεχωριστή σύμβαση e-commerce με την τράπεζα και τα δικά της Merchant ID/credentials — μόνο αν ο πελάτης δεν θέλει Viva.
Από τον πελάτη: επιβεβαίωση ότι ο επαγγελματικός λογαριασμός είναι εγγεγραμμένος στο **IRIS** και σε ποιον πάροχο θα ενεργοποιηθεί.

## 5. Αντικαταβολή & τραπεζική κατάθεση
- **Χρέωση αντικαταβολής** (π.χ. 2 €) και **μέγιστο ποσό** (π.χ. 500 €).
- **IBAN** και δικαιούχος για κατάθεση σε τράπεζα, και σε πόσες ημέρες ακυρώνεται η παραγγελία χωρίς κατάθεση.

## 6. ACS Courier — courier=ACS
1. **Σύμβαση εταιρικού πελάτη ACS** και αίτηση για **ACS Web Services** (μέσω του account manager). Η ACS δίνει:
   - **Company ID**, **Company Password**, **User ID**, **User Password** (ACS Web Services / ACS REST API `webservices.acscourier.net`)
   - **API Key** (ACS Connect / REST) όπου διατίθεται
   - **Bill Code** (κωδικός χρέωσης) και **Κωδικός πελάτη** — πάνε στο `courierAccount`
   - **Test credentials** για το staging
2. **Υπηρεσίες που έχει στη σύμβαση**: επόμενη μέρα, Σάββατο, αντικαταβολή (COD), ασφάλιση, ογκομέτρηση, παράδοση σε ACS Point / ACS Smart Point (lockers).
3. **Χρεώσεις** ανά ζώνη (Αττική/Θεσσαλονίκη/χερσαία/νησιωτική/δυσπρόσιτες) και ανά κιλό — για τον υπολογισμό μεταφορικών στο checkout, εκτός αν οι λευκές συσκευές πηγαίνουν με μεταφορική του καταστήματος.
4. **Διεύθυνση παραλαβής** (αποθήκη/κατάστημα που θα φορτώνει), ώρες παραλαβής, και ποιος εκτυπώνει vouchers (εμείς από το admin σε A6/θερμικό).
5. **Εκκαθάριση αντικαταβολών**: IBAN και συχνότητα απόδοσης από την ACS.

## 7. Γενική Ταχυδρομική — courier=Γενική Ταχυδρομική
1. **Σύμβαση εταιρικού πελάτη** και ενεργοποίηση **Web Services** (SOAP, `voucher.taxydromiki.gr/JobServicesV2.asmx`). Η Γενική δίνει:
   - **Username**, **Password**, **Application Key** (στέλνονται από το τμήμα IT μετά την αίτηση)
   - **Κωδικός πελάτη** — `courierAccount`
   - **Test περιβάλλον** (`testvoucher.taxydromiki.gr`) με δικά του credentials
2. Υπηρεσίες σύμβασης: αντικαταβολή, Σάββατο, παράδοση σε **Smart Points**, ογκομετρικό, ασφάλιση.
3. Χρεώσεις ανά ζώνη/κιλό, διεύθυνση παραλαβής, ώρες, και **εκκαθάριση αντικαταβολών** (IBAN, συχνότητα).

## 8. Αποφάσεις πελάτη για την πολιτική αποστολών (τα βάζουμε στις ρυθμίσεις)
- Δωρεάν μεταφορικά από ποιο ποσό, βασικό κόστος, χρέωση νησιωτικών/δυσπρόσιτων.
- Ποια προϊόντα πάνε με courier και ποια (λευκές συσκευές, TV > 55″) με **μεταφορική/εγκατάσταση καταστήματος** — και ποιος ορίζει ραντεβού.
- Παραλαβή από κατάστημα: σε πόσες ώρες είναι έτοιμη, από ποια καταστήματα.
- Επιστροφές: ποιος πληρώνει τα μεταφορικά επιστροφής, διαδικασία voucher επιστροφής.

## Μετά την παραλαβή (εμείς)
Καταχώρηση στις Ρυθμίσεις, δοκιμαστικές συναλλαγές σε sandbox (Viva demo, Revolut sandbox, PayPal sandbox), δοκιμαστικά vouchers στο test περιβάλλον κάθε courier, και έλεγχος webhooks σε staging πριν το live.
