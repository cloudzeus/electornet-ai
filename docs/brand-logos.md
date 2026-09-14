# Λογότυπα μαρκών (Brandfetch)

Οι 1.324 μάρκες συγχρονίζονται από το `MTRMANFCTR` του SoftOne. Τα λογότυπα έρχονται από το **Brandfetch Logo API** με το `LOGOS_API_KEY` (client id) στο `.env`.

## ⚠️ Δεν κατεβάζουμε τις εικόνες
Οι όροι του Brandfetch το απαγορεύουν ρητά:

> «Programmatic access to logo images is not permitted and may result in rate limiting or blocking. Scraping logos will also lead to a block.»
> «We require logo links to be directly embedded in your applications.»

Άρα αποθηκεύουμε **μόνο τον σύνδεσμο CDN** (`Brand.logoCdn`) και τον χρησιμοποιούμε ως hotlink. Λήψη και επαναφιλοξενία στο Bunny θα ρίσκαρε μπλοκάρισμα του κλειδιού του πελάτη. Αν χρειαστεί caching, το Brandfetch το δίνει με custom enterprise συμφωνία.

**Δικό μας αρχείο επιτρέπεται** όταν το έχουμε νόμιμα (επίσημο SVG από τον κατασκευαστή): ανεβαίνει στη Media library → Bunny CDN (`Brand.logo`) και **υπερισχύει** του hotlink.

## Πώς βρίσκεται το domain
Το Logo API δουλεύει με **domain**, όχι με όνομα. Για κάθε μάρκα καλούμε το Brand Search API και βαθμολογούμε τους υποψηφίους:

| Περίπτωση | Βαθμός | Τι γίνεται |
|---|---|---|
| Η ρίζα του domain **ίδια** με το όνομα (`samsung` → samsung.com) | 0,95 + bonus | **αυτόματη αποδοχή** |
| Πρόθεμα + ίδιο όνομα (`4smarts` → 4smarts.de) | 0,60 | πρόταση προς έγκριση |
| Μόνο πρόθεμα (`a4tech` → a4technology.com) | 0,45 | πρόταση |
| Μόνο ίδιο όνομα, άσχετο domain (`3Com` → 3produccion.com) | 0,35 | πρόταση |

Bonus: `.com` +0,10, `.gr` +0,08· ποινή σε ξένες εθνικές (`.it`, `.se`) −0,12, σε `.com.xx`/`.co.xx` −0,20, σε «μοδάτες» (`.gg`, `.chat`, `.xyz`) −0,20, και −0,25 όταν το qualityScore είναι κάτω από 0,5 χωρίς επαλήθευση.

**Κατώφλι αυτόματης αποδοχής 0,85** — πρακτικά μόνο ακριβές domain. Όλα τα άλλα μπαίνουν στο `domainSuggest` και ο διαχειριστής τα εγκρίνει ή απορρίπτει με ένα κλικ. Καλύτερα κενό λογότυπο παρά λάθος λογότυπο.

Γιατί τόσο αυστηρά: το ευρετήριο έχει εγγραφές όπου το όνομα ταιριάζει αλλά η εταιρεία είναι άλλη. Παραδείγματα από τον δικό μας κατάλογο: «AEG» → Aegon, «3COM» → 3commarketing.com, «A & U» → au-magazine.com, «A4TECH» → a4tech.com.pk.

Σωστές αυτόματες: samsung.com, bosch.com, lg.com, miele.com, siemens.com, philips.com, delonghi.com, 8bitdo.com. Με έγκριση βρέθηκαν και ελληνικά: `inventoraircondition.gr`.

## `fallback=transparent`
Όταν το Brandfetch δεν έχει λογότυπο για ένα domain, σερβίρει **το δικό του σήμα** — θα εμφανιζόταν σαν να είναι η μάρκα. Με διαφανές fallback το κουτί μένει κενό και φαίνεται ότι χρειάζεται upload.

## Διαχείριση
`/admin/softone/brand`:
- **«Εύρεση λογοτύπων (Ν)»** — παρτίδα 150 μαρκών ανά πάτημα. Το Brandfetch επιτρέπει 200 αναζητήσεις ανά 5 λεπτά ανά IP, οπότε υπάρχει απόσταση 1,6 δευτ. ανά κλήση (~4 λεπτά η παρτίδα). Το κουμπί δείχνει πόσες απομένουν.
- Στήλη **Λογότυπο** (hotlink), **Domain μάρκας** (επεξεργάσιμο — αλλαγή ξαναφτιάχνει τον σύνδεσμο), **Πρόταση** με ✓ αποδοχή / ✗ απόρριψη.
- Στην επεξεργασία: **Δικό μας λογότυπο** από τη Media library, που υπερισχύει.

Όρια Brandfetch: 1.000.000 εμφανίσεις λογοτύπων και 500.000 αναζητήσεις τον μήνα στο δωρεάν επίπεδο — άνετα για τον κατάλογο.

## Πεδία
| Πεδίο | Τι κρατά |
|---|---|
| `Brand.logo` | δικό μας αρχείο (Media library → Bunny). Προτεραιότητα 1 |
| `Brand.logoCdn` | hotlink Brandfetch. Προτεραιότητα 2 |
| `Brand.domain` | «samsung.com» — το κλειδί |
| `Brand.domainSuggest` | πρόταση που περιμένει έγκριση |
| `Brand.logoSource` | `upload` / `brandfetch` / `manual-domain` |
| `Brand.logoScore` | βεβαιότητα 0..1 |
| `Brand.logoAt` | πότε ψάξαμε (ώστε να μην ξαναδοκιμάζουμε) |
