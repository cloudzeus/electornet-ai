# Couriers — ανάλυση επίσημων API και τιμοκαταλόγων (10/2026)

Μόνο επίσημες πηγές. Τιμές λιανικής με ΦΠΑ 24% (η Euronics έχει πιθανότατα συμβόλαιο με ειδικές τιμές). Όλοι χρεώνουν
το μεγαλύτερο από πραγματικό και ογκομετρικό βάρος (Μ × Π × Υ σε εκ. / 5.000).

## Σύνοψη

| | Γενική Ταχυδρομική | ACS | ΕΛΤΑ Courier | BOX NOW | ASAP Couriers |
|---|---|---|---|---|---|
| Επίσημο API | ✅ SOAP (JobServicesV2) | ✅ JSON over HTTPS (ACSAutoRest) | ❌ δεν δημοσιεύεται | ✅ REST + OAuth2 | ❌ δεν δημοσιεύεται |
| Test περιβάλλον | ✅ testvoucher.taxydromiki.gr | ❌ (demo στοιχεία στο ίδιο URL) | — | ✅ api-stage | — |
| Έκδοση voucher | CreateJob | ACS_Create_Voucher | — | delivery-requests | — |
| Ετικέτα | PDF (Flyer/Sticker), ZPL 10×15 | PDF (θερμικό ή A4 ×3) | — | PDF/ZPL, A6 | — |
| Ακύρωση | CancelJob | ACS_Delete_Voucher (πριν τη λίστα παραλαβής) | — | μόνο σε κατάσταση «new» | — |
| Ημερήσιο κλείσιμο | ClosePendingJobs(ByDate) — υποχρεωτικό | ACS_Issue_Pickup_List — υποχρεωτικό | — | όχι | — |
| Παρακολούθηση | TrackAndTrace (κωδικοί C_*) | Trackingsummary / TrackingDetails | δημόσια σελίδα | parcels + **webhooks** | δημόσια σελίδα |
| Υπολογισμός κόστους | ❌ (από τιμοκατάλογο) | ✅ ACS_Price_Calculation (τιμές συμβολαίου) | web calculator | ❌ | web calculator |
| Θυρίδες / σημεία | GetLockersList, GetShopsList | ACS_Stations (Smartpoints) | λίστα HTML | destinations + χάρτης (ήδη) | — |
| Χερσαίοι έως 2 κ. | 12,10 € (+3,80/κ.) | 13,37 € (+3,44/κ.) | 13,29 € (+3,41/κ.) | κατόπιν συμβολαίου | 13,50 € (+3,50/κ.) |
| Νησιά έως 2 κ. | 12,90 € (+5,00/κ.) | 13,91 € (+4,75/κ.) | 13,84 € (+4,65/κ.) | — | 14,00 € (+4,85/κ.) |
| Αντικαταβολή | +0,80 € (στη βασική) · έως 2.000 € | 4,90 € | 5,78 € | ναι (ενεργοποίηση στον λογαριασμό) | 5,00 € |
| Επίναυλος καυσίμων | μηνιαίος μεταβλητός | 6,8% (10/2026) | — | — | — |
| Όρια βάρους / μεγέθους | — | υπερμεγέθη: >30 κ. ή >175 εκ. | 35 κ. | 20 κ., ντουλάπι 36×45×60 | Same Day 20 κ. |

## Γενική Ταχυδρομική

- **API:** SOAP `https://voucher.taxydromiki.gr/JobServicesV2.asmx` (test: `testvoucher.taxydromiki.gr`). Στοιχεία: όνομα χρήστη, κωδικός, application key — από το εμπορικό τμήμα. [Τεκμηρίωση](https://voucher.taxydromiki.gr/help/jobservicesapiv2.pdf)
- **Πριν δώσουν στοιχεία live** πρέπει να επιβεβαιώσουμε ότι υλοποιήσαμε, με αυτή τη σειρά: Authenticate → CreateJob → GetVouchersPdf → CancelJob → ClosePendingJobs/ClosePendingJobsByDate.
- **Λειτουργίες:** voucher (πολλά τεμάχια → subvouchers, αντικαταβολή ΑΜ, ασφάλιση ΑΣ, Σάββατο 5Σ, θυρίδα ΠΘ, παραλαβή από κατάστημα ΒΡ), ραντεβού παραλαβής, εντολή επιστροφής, TrackAndTrace / TrackDeliveryStatus, λίστα καταστημάτων και θυρίδων με συντεταγμένες.
- **Τιμοκατάλογος Οκτ. 2026:** χερσαίοι 12,10 € έως 2 κ. + 3,80 €/κ. · νησιά 12,90 € + 5,00 € · δυσπρόσιτες 13,50 € + 5,00 € · D2SP (σε κατάστημα) από 4,20 € · D2Locker από 4,80 € · Σάββατο +4,00 € · βραδινή παράδοση +5,00 €. [Τιμοκατάλογοι](https://taxydromiki.com/eksypiretisi-pelaton/timokatalogoi/)

## ACS

- **API:** POST `https://webservices.acscourier.net/ACSRestServices/api/ACSAutoRest` με `{ACSAlias, ACSInputParameters}` · header `AcsApiKey` + Company_ID / Company_Password / User_ID / User_Password + Billing_Code (κωδικός πίστωσης). Όριο 10 κλήσεις/δευτ. Swagger στο `/ACSRestServices/swagger/`. [Οδηγός](https://www.acscourier.net/media/syoaswsf/acs-web-services.pdf)
- **Λειτουργίες:** Create_Voucher (έως 99 τεμάχια, βάρος, διαστάσεις, COD, ασφάλιση έως 3.000 €, Smartpoint), Print_Voucher (πριν τη λίστα), Delete_Voucher, Issue_Pickup_List (υποχρεωτική — χωρίς αυτήν τα barcodes δεν αναγνωρίζονται), Tracking, Price_Calculation (τιμές συμβολαίου, χωρίς ΦΠΑ), Address_Validation (ΤΚ, δυσπρόσιτη περιοχή), Stations.
- **Τιμοκατάλογος v7.5 (04/08/2026):** ηπειρωτική 13,37 € έως 2 κ. + 3,44 €/κ. · νησιά 13,91 € + 4,75 € · δυσπρόσιτες 14,40 € + 4,95 € · αντικαταβολή 4,90 € · Σάββατο 2,55 €. Smartpoint/θυρίδα: έως 5 κ., 37×44×61.

## ΕΛΤΑ Courier

- **API:** δεν υπάρχει δημόσια τεκμηρίωση. Χρειάζεται συμβόλαιο επί πιστώσει και ζητάμε WSDL / test από info@elta-courier.gr, 210 607 3000.
- **Τιμοκατάλογος (09/04/2025):** πόλη-πόλη 13,29 € έως 2 κ. + 3,41 €/κ. · νησιά 13,84 € + 4,65 € · αντικαταβολή 5,78 € · μέγιστο 35 κ.

## BOX NOW

- **API:** REST `https://api-production.boxnow.gr/api/v1/…` (stage: `api-stage`), OAuth2 client_credentials (token 1 ώρα). Στοιχεία από sales@boxnow.gr, υποστήριξη ict@boxnow.gr. [Εγχειρίδιο](https://boxnow.gr/media/hidden/BoxNow%20API%20Manual%20(v.7.2).pdf)
- **Λειτουργίες:** delivery-requests (θυρίδα από τον χάρτη, μέγεθος 1/2/3, αντικαταβολή), ετικέτα PDF/ZPL, ακύρωση πριν φύγει, tracking και webhooks (CloudEvents, επαναλήψεις έως 24 ώρες).
- **Θυρίδες:** μικρή 8×45×60, μεσαία 17×45×60, μεγάλη 36×45×60 εκ., έως 20 κ. Τιμές κατόπιν συμβολαίου.
- Ο χάρτης θυρίδων είναι ήδη στο checkout.

## ASAP Couriers (asapcouriers.gr)

- **API:** δεν δημοσιεύεται. Το πρόγραμμα e-shop partners αναφέρει διασύνδεση με πλατφόρμες, χωρίς τεκμηρίωση. Ζητάμε API / πρόσβαση από 210 531 1500, info@asapcouriers.gr. (Το api.asapdelivery.ma είναι άλλη εταιρεία, στο Μαρόκο.)
- **Υπηρεσίες:** Same Day Αττική 10 € + 2,50 €/κ. (έως 20 κ.) · Next Day 7,50 € · Express 17–36 € · πανελλαδικά 13,50 € + 3,50 €/κ. · αντικαταβολή 5 €.

## Τι χρειάζεται από τη Euronics

1. **Γενική:** όνομα χρήστη, κωδικός, application key — πρώτα για το test.
2. **ACS:** API key, Company ID/Password, User ID/Password, Billing Code (και IP του server για whitelist).
3. **BOX NOW:** client_id / client_secret (stage και production), το id της αποθήκης αποστολής, ενεργοποίηση αντικαταβολής.
4. **ΕΛΤΑ Courier, ASAP:** τεκμηρίωση API από τους ίδιους.
5. Τις **τιμές του συμβολαίου** κάθε courier (για σωστό κόστος στο checkout) και ποιος courier είναι ο κύριος.

## Δικά μας δεδομένα

- Βάρος: το CCCWEIGHT είναι κενό· βάρος υπάρχει στα χαρακτηριστικά 5.912 / 9.075 προϊόντων (2.846 «Βάρος πακέτου»).
- Διαστάσεις ERP: 3.532 προϊόντα (του προϊόντος, όχι της συσκευασίας).
- Μεγάλες συσκευές: κανόνας «μόνο από κατάστημα» (Εμπόριο → Αποστολές & μεγάλες συσκευές) — 3.028 προϊόντα σήμερα.
