# ΑΑΔΕ ↔ SoftOne IRSDATA ↔ δικά μας μοντέλα

Υπηρεσία: **RgWsPublic2** («Στοιχεία Επιχειρήσεων»), SOAP 1.1 στο
`https://www1.gsis.gr/wsaade/RgWsPublic2/RgWsPublic2` με WS-Security UsernameToken.
Δοκιμαστικό: `https://www1.gsis.gr/wsaadedg/RgWsPublic2/RgWsPublic2`.
Κωδικοί: **ειδικοί κωδικοί** που εκδίδει το TAXISnet για την υπηρεσία, όχι οι κωδικοί TAXISnet του χρήστη. Μπαίνουν στο **Ρυθμίσεις → ΑΑΔΕ**.
Η απάντηση είναι **UTF-8 XML** (όχι win-1253 όπως το SoftOne).

Υλοποίηση: `lib/aade/vat.ts` (client + έλεγχος ψηφίου ΑΦΜ), `lib/aade/map.ts` (αντιστοίχιση), `GET /api/aade/vat?afm=…`.

## Κλειδί σύνδεσης για τη Δ.Ο.Υ.
Η ΑΑΔΕ επιστρέφει `doy` = **αριθμητικός κωδικός** (π.χ. `1101`). Το SoftOne κρατά τον **ίδιο κωδικό** στο `IRSDATA.CODE` (και `IRSDATA.IRSDATA`). Στη βάση μας είναι το `TaxOffice.code`.

> Το ταίριασμα γίνεται **πάντα με τον κωδικό, ποτέ με το όνομα**: οι περιγραφές διαφέρουν σε τονισμό και συντομογραφίες («Α ΑΘΗΝΩΝ» στο SoftOne ↔ «Α΄ ΑΘΗΝΩΝ» στην ΑΑΔΕ).

Κατάσταση δεδομένων: 307 Δ.Ο.Υ. συγχρονισμένες από `IRSDATA`, εκ των οποίων 303 με 4ψήφιο κωδικό (η επίσημη αρίθμηση ΑΑΔΕ) και 4 ειδικές (`0` ΦΑΕ ΑΘΗΝΩΝ, `1` ΑΓΝΩΣΤΟΣ ΔΟΥ, `2` ΧΑΝΙΩΝ, `12` ΦΑΕ ΠΕΙΡΑΙΑ).

## Πίνακας αντιστοίχισης
| ΑΑΔΕ (RgWsPublic2) | Τι είναι | SoftOne | Δικό μας | Σημείωση |
|---|---|---|---|---|
| `afm` | ΑΦΜ | `CUSTOMER.AFM` | `Customer.vatNumber` | Έλεγχος ψηφίου (mod 11) πριν την κλήση |
| `doy` | Κωδικός ΔΟΥ | `CUSTOMER.IRSDATA` → `IRSDATA.CODE` | `Customer.doy`, `TaxOffice.code` | **Το κλειδί.** Στο ERP γράφουμε τον κωδικό |
| `doyDescr` | Περιγραφή ΔΟΥ | `IRSDATA.NAME` | `TaxOffice.name` | Μόνο εμφάνιση |
| `onomasia` | Επωνυμία | `CUSTOMER.NAME` | `Customer.company` | Αυτή μπαίνει στο τιμολόγιο |
| `commerTitle` | Διακριτικός τίτλος | `CUSTOMER.NAME1` | εμφάνιση | Συχνά κενό |
| `legalStatusDescr` | Νομική μορφή | `CUSTOMER.TRDCATEGORY` (χειροκίνητα) | `Customer.profession` | Δεν υπάρχει 1:1 πίνακας |
| `postalAddress` | Οδός έδρας | `CUSTOMER.ADDRESS` | `Address.street` | |
| `postalAddressNo` | Αριθμός | `CUSTOMER.ADDRESS` (ενωμένο) | `Address.number` | Το SoftOne έχει **ένα** πεδίο διεύθυνσης |
| `postalZipCode` | Τ.Κ. | `CUSTOMER.ZIP` → `ZIP.CODE` | `Address.zip`, `PostalCode.code` | Από εδώ βγαίνει νομός/περιφέρεια |
| `postalAreaDescription` | Περιοχή | `CUSTOMER.CITY` | `Address.city` | |
| `deactivationFlag` | 1 ενεργός / 0 ανενεργός | `CUSTOMER.ISACTIVE` | `Customer.status` | Ανενεργός ΑΦΜ ⇒ μπλοκάρουμε τιμολόγηση |
| `registDate`, `stopDate` | Έναρξη / διακοπή | — | ιστορικό ελέγχου | |
| `firmActTab[].firmActCode` + `firmActDescr` | ΚΑΔ | `CUSTOMER.JOBTYPETRD` (κύριος) | `Customer.profession` | Κύριος = `firmActKind = 1` |

## Ροή στο checkout / στη διαχείριση
1. Ο πελάτης δίνει ΑΦΜ → έλεγχος ψηφίου τοπικά (χωρίς κλήση αν είναι λάθος).
2. `GET /api/aade/vat?afm=…` → μητρώο ΑΑΔΕ.
3. `reconcile()` δένει το `doy` με το δικό μας `TaxOffice` και ετοιμάζει τιμές για συμπλήρωση.
4. Προειδοποιήσεις που επιστρέφονται: ανενεργός ΑΦΜ, ή ΔΟΥ που δεν υπάρχει στο `IRSDATA` (θέλει συγχρονισμό ή χειροκίνητη προσθήκη).
5. Στο push προς SoftOne γράφεται ο **κωδικός** ΔΟΥ και η διεύθυνση ενωμένη («οδός αριθμός»).

Όρια: 30 αναζητήσεις/ώρα/IP, cache 5 λεπτά ανά ΑΦΜ.
