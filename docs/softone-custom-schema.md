# SoftOne (megaeuronics.oncloud.gr) — custom πίνακες και πεδία (CCC)

Σάρωση μεταδεδομένων στις 2026-09-20, 297 κλήσεις `getObjects` / `getObjectTables` / `getTableFields`. Καμία ανάγνωση δεδομένων, καμία εκτέλεση λίστας ή script. Πλήρη στοιχεία: `softone-custom-schema.json`. Επανάληψη: `npx tsx --conditions=react-server scripts/s1-custom-schema.ts`.

## 0. Τι σημαίνουν για τη λογική του e-shop

**Κατάλογος.** Το `ITEM` (και το `SERVICE`, με τα ίδια 13 πεδία) οδηγείται από: `CCCWEBCATEGORY1` / `CCCWEBCATEGORY2` (δέντρο site), `CCCWEBGRSPECS` (τύπος προϊόντος = ομάδα χαρακτηριστικών), `CCCWREMARKS1` / `CCCWREMARKS` (σύντομη / αναλυτική περιγραφή), `CCCAVAIL` (κείμενο διαθεσιμότητας), `CCCWARRANTY` (επέκταση εγγύησης), `CCCPRTISLABEL` (ετικέτα) και `CCCWEIGHT` / `CCCLENGTH` / `CCCWIDTH` / `CCCHEIGHT` — οι διαστάσεις για μεταφορικά, «χωράει στον χώρο μου» και AR, πριν από το EPREL.

**Χαρακτηριστικά.** Ορισμοί: `CCCWEBGRSPECS` → `CCCWEBSPECS` (με `ISVIEW`, `isFilter`) → `CCCWEBSPECSLNS` (προκαθορισμένες τιμές, `SOCOLOR`). Πίνακας με τις **τιμές ανά είδος δεν εμφανίζεται σε κανένα αντικείμενο**· το πιθανότερο είναι ότι τον χειρίζεται το Advanced JavaScript `iSite` (ή το `UpdateWebItems`). Υπάρχει και δεύτερο, ανενεργό μοντέλο: `CCCDIMGROUP` → `CCCDIMS` → `CCCDIMSVALUES`, δεμένο με `ITEGROUP.CCCBUSUNITS`.

**Παραγγελίες.** Στην κεφαλή (`SALDOC`, `RETAILDOC`, ίδια πεδία και σε `PURDOC` / `ITEDOC`): `CCCSTATUS` (κατάσταση), `CCCAPPROVAL` (κωδικός έγκρισης), `CCCFINDOCS` / `CCCFINCODES` / `CCCSERIESNUMS` (σύνδεση με αρχική παραγγελία), `CCCCOMMENTS`, `CCCEDISENT`, πιστωτικός έλεγχος (`CCCCREDIT1…5`, `CCCDUEVAL1…2`, `CCCTRDREMAIN`), ταμείο (`CCCCASH`, `CCCRETURN`), τηλεφωνικό κέντρο (`CCCCCMID`, `CCCCCMRECORDFILE`). Στο `MTRDOC`: **παραλήπτης αποστολής** `CCCSHPNAME`, `CCCSHPJOB`, `CCCSHPAFM`, `CCCSHPIRSDATA`, `CCCSHPPHONE`, `CCCSHPADDRESS` και `CCCPackingStatus`. Στις γραμμές (`ITELINES`, `SRVLINES`): **`CCCCUSTOMER` = Μέλος** (το κατάστημα-μέλος του συνεταιρισμού ανά γραμμή), `CCCORDERFIN`, `CCCDA`, συσκευασία (`CCCPack1`, `CCCPack2`, `CCCBOX`, `CCCPackingUser`), έξοδα (`CCCEXPMTRL`, `CCCEXPVAL1/2`).

**Υπάρχουσα ροή εισαγωγής πωλήσεων.** Τα `CCCIMPSALCSV` (με πίνακα σφαλμάτων `CCCSALCSVIMPERR`: `DOCCODE`, `CUSAFM`, `IMPORTERRMSG`) και `cccDoImportCSV` (φάκελοι CSV, αρχεία, γραμμές, σφάλματα ανά `ITEMCODE`), μαζί με το script `S1_CccImpSalCsv`, δείχνουν ότι σήμερα παραστατικά πώλησης μπαίνουν στο ERP **από αρχεία CSV**. Πριν σχεδιάσουμε την αποστολή παραγγελιών με `setData`, πρέπει να ρωτήσουμε αν το τωρινό site τροφοδοτεί αυτή τη ροή.

**Λοιπά.** `CUSTOMER` / `SUPPLIER`: `CCCGLN` (και σε υποκαταστήματα), `CCCNAMETWO`, εκτυπωτές/φόρμες κιβωτίου και παλέτας — logistics B2B, όχι καταναλωτής. `SOCARRIER`: `CCCGROUP`, `CCCORDER` (ομάδα και σειρά παράδοσης μεταφορέα). `VAT.CCCVAT`: κωδικός integration. `CCCPAYMENTS`: αναφορά πληρωμών ανά πελάτη/είδος προμηθευτή. `CCCCREDITCONTROL`: λίστα κατηγοριών πιστωτικού ελέγχου. Το `INST` (εγκαταστάσεις/εγγυήσεις) δεν διαβάζεται: ο web λογαριασμός δεν έχει δικαίωμα.

**Advanced JavaScript στην εγκατάσταση (15):** `ConvertDlgJS`, `CrtSaldocJs`, `iDealers`, `iSite`, `ITEDOCjs`, `ITEMJS`, `JSMain`, `jsRetailDoc`, `PurdocJs`, `RetaildocJSCode`, `S1_CccImpSalCsv`, `S1_Custom`, `S1_E-INV`, `SOCALLCode`, `UpdateWebItems`. Ζουν στον `CSTINFO` (τύπος 16, κώδικας στη δυαδική στήλη `SODATA`) και δεν διαβάζονται με τις επίσημες υπηρεσίες· χρειάζεται εξαγωγή από τον SoftOne client.

## 1. Custom αντικείμενα και πίνακες

### `$CCCCREDITCONTROL` — Πίνακας CCCCREDITCONTROL (EditList)

**Πίνακας `CCCCREDITCONTROL`** — Πίνακας CCCCREDITCONTROL

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCCODE` | Κωδικός | Smallint(2) |  |
| `CCCNAME` | Περιγραφή | String(30) |  |
| `CCCISACTIVE` | Ενεργό | Smallint(2) | $Y |
| `CCCCREDITCONTROL` |  | AutoInc(4) |  |

### `$CCCDIMGROUP` — Ομάδες Χαρακτηριστικών (EditList)

**Πίνακας `CCCDIMGROUP`** — Ομάδες Χαρακτηριστικών

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCDIMGROUP` | Κωδικός | String(25) |  |
| `CCCNAME` | Περιγραφή | String(64) |  |
| `CCCISACTIVE` | Ενεργό | Smallint(2) | $Y |
| `CCCBUSUNITS` | Κατηγ.Προιοντος | Smallint(2) | BUSUNITS |

### `$CCCDIMS` — Χαρακτηριστικά (EditList)

**Πίνακας `CCCDIMS`** — Χαρακτηριστικά

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCDIMGROUP` | Ομάδα | String(25) | CCCDIMGROUP |
| `CCCDIMS` | Κωδικός | String(25) |  |
| `CCCNAME` | Περιγραφή | String(64) |  |
| `CCCISACTIVE` | Ενεργό | Smallint(2) | $Y |
| `CCCPRINT` | Εκτύπωση | Smallint(2) | $Y |

### `$CCCDIMSVALUES` — Τιμές Χαρακτηριστικών (EditList)

**Πίνακας `CCCDIMSVALUES`** — Τιμές Χαρακτηριστικών

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCDIMGROUP` | Ομάδα | String(25) | CCCDIMGROUP |
| `CCCDIMS` | Χαρακτηριστικό | String(25) | CCCDIMS |
| `CCCVALUES` | Τιμή | String(80) |  |
| `CCCISACTIVE` | Ενεργή | Smallint(2) | $Y |
| `CCCDIMSVALUES` | Τιμές Χαρακτηριστικών | AutoInc(4) |  |

### `$CCCWEBCATEGORY1` — Κατηγορία ( Master ) (EditList)

**Πίνακας `CCCWEBCATEGORY1`** — Κατηγορία ( Master )

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `COMPANY` | Εταιρεία | Smallint(2) |  |
| `CCCWEBCATEGORY1` | Κωδικός | Smallint(2) |  |
| `NAME` | Περιγραφή | String(64) |  |
| `ISACTIVE` | Ενεργή | Smallint(2) | $YN |
| `UPDDATE` | Ημερ.Μεταβολής | DateTime(8) | $DT |

### `$CCCWEBCATEGORY2` — Κατηγορία ( Main ) (EditList)

**Πίνακας `CCCWEBCATEGORY2`** — Κατηγορία ( Main )

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `COMPANY` | Εταιρεία | Smallint(2) |  |
| `CCCWEBCATEGORY1` | Κατηγορία ( Master ) | Smallint(2) | CCCWEBCATEGORY1 |
| `CCCWEBCATEGORY2` | Κωδικός | Smallint(2) |  |
| `NAME` | Περιγραφή | String(64) |  |
| `ISACTIVE` | Ενεργή | Smallint(2) | $YN |
| `UPDDATE` | Ημερ.Μεταβολής | DateTime(8) | $DT |

### `cccDoImportCSV` — cccDoImportCSV (Dialog)

**Πίνακας `CCCCSVPARAMS`** — Πίνακας cccvS1Fields

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CSVFOLDER` | Folder Read CSV | String(512) |  |
| `CSVFOLDERDONE` | Done Folder | String(512) |  |
| `CSVFOLDERERRORS` | Error Folder | String(512) |  |
| `CSVFILE` |  | String(512) |  |
| `SUCCESS` |  | Integer(4) |  |
| `TOTALLINES` |  | Integer(4) |  |
| `SUCCESSLINES` |  | Integer(4) |  |
| `ERRORLINES` |  | Integer(4) |  |
| `MESSAGE` |  | String(512) |  |
| `LINENUM` |  | Integer(4) |  |
| `ITEMCODE` |  | String(512) |  |
| `ERRORMSG` |  | Memo(0) |  |

**Πίνακας `CCCCSVFILES`** — Πίνακας cccvS1Fields

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CSVFOLDER` |  | String(512) |  |
| `CSVFOLDERDONE` |  | String(512) |  |
| `CSVFOLDERERRORS` |  | String(512) |  |
| `CSVFILE` | File Name | String(512) |  |
| `SUCCESS` | SUCCESS | Integer(4) | $Y |
| `TOTALLINES` | TOTAL LINES | Integer(4) |  |
| `SUCCESSLINES` | SUCCESS LINES | Integer(4) |  |
| `ERRORLINES` | ERROR LINES | Integer(4) |  |
| `MESSAGE` | MESSAGE | String(512) |  |
| `LINENUM` |  | Integer(4) |  |
| `ITEMCODE` |  | String(512) |  |
| `ERRORMSG` |  | Memo(0) |  |

**Πίνακας `CCCCSVFILELINES`** — Πίνακας cccvS1Fields

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CSVFOLDER` |  | String(512) |  |
| `CSVFOLDERDONE` |  | String(512) |  |
| `CSVFOLDERERRORS` |  | String(512) |  |
| `CSVFILE` | File Name | String(512) |  |
| `SUCCESS` | Success | Integer(4) | $Y |
| `TOTALLINES` |  | Integer(4) |  |
| `SUCCESSLINES` |  | Integer(4) |  |
| `ERRORLINES` |  | Integer(4) |  |
| `MESSAGE` |  | String(512) |  |
| `LINENUM` | LINE NUMBER | Integer(4) |  |
| `ITEMCODE` | ITEM CODE | String(512) |  |
| `ERRORMSG` | ERROR MESSAGE | Memo(0) |  |

### `CCCIMPSALCSV` — Εργασία Εισαγωγής Παρακαταθήκης (Dialog)

**Πίνακας `CCCSALCSVIMPERR`** — Σφάλματα κατά την εισαγωγή

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `DOCCODE` | Document Code | String(50) |  |
| `CUSAFM` | Customer AFM | String(50) |  |
| `IMPORTERRMSG` | Error Message | String(500) |  |

**Πίνακας `CCCGETSALCSV`** — Αρχείο Παρακαταθήκης

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `XLFILE` | Αρχείο CSV | String(500) |  |

### `CCCPAYMENTS` — CCCPAYMENTS (Report)

**Πίνακας `QUESTIONS`** — QUESTIONS 

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `FCODE` | Από κωδικό | String(30) | CUSTOMER |
| `TCODE` | Εως κωδικό | String(30) | CUSTOMER |
| `FNAME` | Από Περιγραφή | String(64) | CUSTOMER |
| `TNAME` | Έως Περιγραφή | String(64) | CUSTOMER |
| `FISCPRD` | Χρήση | Integer(4) | FISCPRD |
| `PERIOD` | Περίοδος | Integer(4) | PERIOD |
| `XXGROUPSONLY` | Εκτύπωση μόνο ομάδων | Smallint(2) | $Y |
| `FROMDATE` | Ημερομηνία από | DateTime(8) |  |
| `TODATE` | Ημερομηνία έως | DateTime(8) |  |

**Πίνακας `CUSTOMER`** — Πελάτες

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `TRDR` | Πελάτης | AutoInc(4) |  |
| `CODE` | Κωδικός | String(25) |  |
| `NAME` | Επωνυμία | String(128) |  |
| `AFM` | Α.Φ.Μ. | String(20) |  |
| `CHKAFM` | Έλεγχος Α.Φ.Μ. | Smallint(2) | $sChkAFM |
| `SOTITLE` | Τίτλος | String(64) |  |
| `OLDEH` | Κωδικός ηλ. Πληρωμής ΔΕΗ | String(25) |  |
| `OLAFM` | Αριθμός Μητρώου ΔΙΠΕΘΕ | String(15) |  |
| `ISACTIVE` | Ενεργός | Smallint(2) | $Y |
| `ISPROSP` | Υποψήφιος | Smallint(2) | $Y |
| `ISCMPT` | Ανταγωνιστής | Smallint(2) | $Y |
| `COUNTRY` | Χώρα | Smallint(2) | COUNTRY |
| `SOCURRENCY` | Νόμισμα | Smallint(2) | SOCURRENCY |
| `BRANCH` | Υποκ/μα | Smallint(2) | BRANCH |
| `ADDRESS` | Διεύθυνση | String(100) |  |
| `ZIP` | Τ.Κ. | String(10) | VZIPADDRESS |
| `DISTRICT` | Περιοχή | String(30) |  |
| `CITY` | Πόλη | String(30) |  |
| `DISTRICT1` | Νομός | Smallint(2) | DISTRICT |
| `AREAS` | Γεωγρ.ζώνη | Smallint(2) | AREAS |
| `LATITUDE` | Γεωγραφικό πλάτος | Float(8) |  |
| `LONGITUDE` | Γεωγραφικό μήκος | Float(8) |  |
| `PHONE01` | Τηλ.1 | String(20) |  |
| `PHONE02` | Τηλ.2 | String(20) |  |
| `FAX` | Fax | String(20) |  |
| `JOBTYPE` | Επαγγ.κατηγορία | Smallint(2) | JOBTYPE |
| `JOBTYPETRD` | Επάγγελμα | String(128) |  |
| `TRDGROUP` | Όμιλος | Integer(4) | TRDGROUP |
| `TRDPGROUP` | Ομάδα | Smallint(2) | TRDPGROUP |
| `WEBPAGE` | Web page | String(64) |  |
| `EMAIL` | email | String(128) |  |
| `EMAILACC` | email Λογ. | String(128) |  |
| `TRDCATEGORY` | Λογ.κατηγορία | Smallint(2) | TRDCATEGORY |
| `TRDBUSINESS` | Εμπορ.κατηγορία | Smallint(2) | TRDBUSINESS |
| `SHIPMENT` | Τρόπος αποστολής | Smallint(2) | SHIPMENT |
| `PAYMENT` | Τρόπος πληρωμής | Smallint(2) | PAYMENT |
| `PRCCATEGORY` | Τιμολ.κατηγορία | Smallint(2) | PRCCATEGORY |
| `COMMISION` | Κλάση προμήθειας | Smallint(2) | CUSCOMMISION |
| `BUSUNITS` | Business Unit | Smallint(2) | BUSUNITS |
| `PRIORITY` | Προτεραιότητα | Smallint(2) | PRIORITY |
| `PRCPOLICY` | Συμφωνία | Smallint(2) | PRCPOLICY |
| `DSCPOLICY` | Πιστωτικά | Smallint(2) | VCRDRULE |
| `ISVALCREDIT` | Πιστωτικά βάσει | Smallint(2) | $ValCredit |
| `SOCARRIER` | Μεταφορέας | Smallint(2) | SOCARRIER |
| `TRUCKS` | Μεταφ.μέσο | Smallint(2) | TRUCKS |
| `ROUTING` | Δρομολόγιο | Integer(4) | ROUTING |
| `SALESMAN` | Πωλητής | Integer(4) | PRSN |
| `COLLECTOR` | Εισπράκτορας | Integer(4) | PRSN |
| `CODE1` | Κωδικός 1 | String(25) |  |
| `IRSDATA` | Δ.Ο.Υ. | String(128) | IRSDATA |
| `VATSTS` | Καθ.Φ.Π.Α. | Smallint(2) | $VatSts |
| `VATPROVISIONS` | Δ.απαλλαγής | Smallint(2) | VATPROVISIONS |
| `RECEIPTCARD` | Κάρτα αποδείξεων | String(25) |  |
| `KEPYOSTS` | Καθ.ΚΕ.Π.Υ.Ο. | Smallint(2) | $KEPYOSTS |
| `KEPYOMD` | Ειδ. ΚΕ.Π.Υ.Ο. | Smallint(2) | $KEPYOMD |
| `GSISMD` | Υποβολή στοιχείων ΜΥΦ | Smallint(2) | $KFASMD |
| `CMPMODE` | Εταιρική μορφή | Smallint(2) | $CMPMODE |
| `EFKFLAG` | Απαλλαγή Ε.Φ.Κ. | Smallint(2) | $Y |
| `ACNMSK` | Λογ/σμός | String(25) | ACNT |
| `OPITMODE` | Τρόπος αντιστοίχισης | Smallint(2) | $OptMode |
| `OPITFINDOC` | Αντιστοίχιση σε νομ.συναλλαγής | Smallint(2) | $Y |
| `CRCONTROL` | Πιστωτικός έλεγχος | Smallint(2) | CRCONTROL |
| `CRDLINES1` | Πιστ.έλεγχος 1 | Smallint(2) | CRDLINES |
| `CRDLIMIT1` | Πιστωτικό όριο 1 | Float(8) |  |
| `CRDLINES2` | Πιστ.έλεγχος 2 | Smallint(2) | CRDLINES |
| `CRDLIMIT2` | Πιστωτικό όριο 2 | Float(8) |  |
| `CRDLINES3` | Πιστ.έλεγχος 3 | Smallint(2) | CRDLINES |
| `CRDLIMIT3` | Πιστωτικό όριο 3 | Float(8) |  |
| `CRDLINES4` | Πιστ.έλεγχος 4 | Smallint(2) | CRDLINES |
| `CRDLIMIT4` | Πιστωτικό όριο 4 | Float(8) |  |
| `CRDLINES5` | Πιστ.έλεγχος 5 | Smallint(2) | CRDLINES |
| `CRDLIMIT5` | Πιστωτικό όριο 5 | Float(8) |  |
| `DISCOUNT` | Έκπτωση (%) | Float(8) |  |
| `MAXPRCDISC` | Μεγ.έκπτωση (%) | Float(8) |  |
| `CHKMAXPRCDISC` | Ελεγχος μεγ.έκπτωσης | Smallint(2) | $ChkAction |
| `PAYHFROM` | Πληρωμή από | DateTime(8) | $TIME |
| `PAYHTO` | Πληρωμή μέχρι | DateTime(8) | $TIME |
| `PAYEVERY` | Πληρωμή κάθε | Smallint(2) | $PAYEVERY |
| `PAYDAY` | Ημέρα πληρωμής | Smallint(2) | $PAYDAY |
| `PAYWEEK` | Αριθ.εβδομάδας | Smallint(2) |  |
| `VISITEVERY` | Επίσκεψη κάθε | String(15) | $PAYDAY |
| `WARNING` | Προειδοποίηση | String(250) |  |
| `EXPGROUP` | Ομάδα εξόδων | Smallint(2) | CUSEXPGRP |
| `GASCUSTYPE` | Ιδιότητα πελάτη | Smallint(2) | $GasCusType |
| `CONSENT` | Συναίνεση | Smallint(2) | $Y |
| `NOCONSENT` | Δε συναινεί σε | String(15) | $NOCONSENTCHK |
| `SOSCORE` | Επίδοση | Integer(4) |  |
| `TRDTYPE1` | Συγχρονίζει προμηθευτή | Smallint(2) | $Y |
| `PRJCS` | Καμπάνια | Integer(4) | PRJC |
| `SOIDENTITYNO` | Αριθμός επίσημου εγγράφου | String(50) |  |
| `REMARKS` | Παρατηρήσεις | String(4000) |  |
| `ECOLLABORATION` | Υπηρεσία myCustomer | Smallint(2) | $Y |
| `S1INVMD` | Αποστολή ηλεκτ. τιμ. | Smallint(2) | $S1InvMd |
| `SOPAYCODE` | Κωδικός αμοιβής | Smallint(2) | SOPAYCODE |
| `GLNCODE` | Κωδικός GLN | String(25) |  |
| `NUMCG` | Γ.Ε.ΜΗ. | String(24) |  |
| `CBEARER` | Χρέωση εξόδων (SEPA) | String(4) | $ChargeBearer |
| `RELTRDR` | Κωδ.συσχέτισης | Integer(4) | CUSTOMER |
| `COSTCNTR` | Κέντρο κόστους | Integer(4) | PRSCOSTCNTR |
| `EXCASHFLOW` | Εξαιρείται από ταμειακή ροή | Smallint(2) | $Y |
| `INSDATE` | Ημερ.εισαγωγής | DateTime(8) | $DT |
| `INSUSER` | Χρήστης εισαγωγής | Smallint(2) | USERS |
| `UPDDATE` | Ημερ.τελ.μεταβολής | DateTime(8) | $DT |
| `UPDUSER` | Χρήστης τελ.μεταβολής | Smallint(2) | USERS |
| `CUSDATE` | Μεταβολή σε πελάτη | DateTime(8) |  |
| `CUSUSER` | Χρήστης σε πελάτη | Smallint(2) | USERS |
| `VCOUNTRY` | Χώρα φορολ. κατοικίας | Smallint(2) | COUNTRY |
| `ISRELENTITY` | Συνδεδεμένη οντότητα | Smallint(2) | $Y |
| `CCCCCMPRIORITY` | Προτεραιότητα CCM | Integer(4) |  |
| `CCCNAMETWO` | Δεύτερη επωνυμία | String(65) |  |
| `CCCBOXTEMPLATE` | Φόρμα εκτ. κιβωτίου | Integer(4) |  |
| `CCCBOXPRINTER` | Εκτυπωτής κιβωτίου | String(2000) |  |
| `CCCPALETTETEMPLATE` | Φόρμα εκτ. παλέτας | Integer(4) |  |
| `CCCPALETTEPRINTER` | Εκτυπωτής παλέτας | String(2000) |  |
| `CCCGLN` | GLN Πελάτη/Προμηθευτή | String(64) |  |
| `SoFNetTurnover` | Τζίρος πωλήσεων (χρήσης) | Float(0) |  |
| `SoSalesCost` | Κοσ.πωληθέντων (χρήσης) | Float(0) |  |
| `SoGrProfit` | Μικτό κέρδος (χρήσης) | Float(0) |  |
| `SoGrProfitPrc` | Συντ.μικτ.κέρδους(%) (χρήσης) | Float(0) |  |
| `SoFinancialCost` | Κόστος χρηματοδότησης | Float(0) |  |
| `SoRealGrProfit` | Πραγμ.μικτό κέρδος (χρήσης) | Float(0) |  |
| `SoRealGrProfitPrc` | Συντ.πραγ. μ.κ(%) (χρήσης) | Float(0) |  |
| `SoTBalance` | Υπόλοιπο ημέρας | Float(0) |  |
| `SoAvgBalDays` | Μέση ηλικία υπολοίπου | Float(0) |  |
| `SoTAvgPayDays` | Μ.Χ.Είσπραξης(χρήσης) | Float(0) |  |
| `SoTAvgPayDaysT` | Μ.Χ.Είσπραξης(ιστορικός) | Float(0) |  |
| `SoAvgPayDays` | Μ.Χ.Είσπραξης(αξ/φα,χρήσης) | Float(0) |  |
| `SoAvgPayDaysT` | Μ.Χ.Είσπραξης(αξ/φα,ιστορικός) | Float(0) |  |
| `SoTAvgAPayDays` | Μ.Χ.Αποπληρωμής(χρήσης) | Float(0) |  |
| `SoAvgAPayDays` | Μ.Χ.Αποπληρωμής(αξ/φα,χρήσης) | Float(0) |  |
| `SoTAvgAPayDaysT` | Μ.Χ.Αποπληρωμής(ιστορικός) | Float(0) |  |
| `SoAvgAPayDaysT` | Μ.Χ.Αποπληρωμής(αξ/φα,ιστορ.) | Float(0) |  |
| `SoDaysRec` | Ηλικία βάσει παραλαβής (ιστορικό) | Float(0) |  |
| `SoDaysExp` | Ηλικία βάσει λήξης (ιστορικό) | Float(0) |  |
| `SoDaysRecOverDue` | Καθυστέρηση βάσει παραλαβής (ιστορικό) | Float(0) |  |
| `SoDaysExpOverDue` | Καθυστέρηση βάσει λήξης (ιστορικό) | Float(0) |  |
| `SoCusChequeBalance1` | Εκκρεμή αξιόγραφα (ολα) | Float(0) |  |
| `SoCusChequeBalance3` | Εκκρεμή αξιόγραφα (ιδίου) | Float(0) |  |
| `SoCusChequeFinalBal1` | Ληξιπρόθ. αξιόγραφα (ολα) | Float(0) |  |
| `SoCusChequeFinalBal4` | Ληξιπρόθ. αξιόγραφα (ιδίου) | Float(0) |  |
| `SoCusOpenOrder` | Εκκρεμείς παραγγελίες | Float(0) |  |
| `SoGLCredit` | Πίστωση από γενική λογιστική | Float(0) |  |
| `SoGLDebit` | Χρέωση από γενική λογιστική | Float(0) |  |
| `SoGLBalance` | Υπόλοιπο από γενική λογιστική | Float(0) |  |

**Πίνακας `CCCMASTER`** — Πίνακας CCCMASTER

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `Company` | Εταιρία | Smallint(2) | COMPANY |
| `Fiscprd` | Χρήση | Smallint(2) | FISCPRD |
| `Period` | Περίοδος | Smallint(2) | PERIOD |
| `Findoc` | Συναλλαγή | Integer(4) |  |
| `Trdr` | Πελάτης | Integer(4) | CUSTOMER |
| `CODE` | Κωδ.Πελάτη | String(25) |  |
| `NAME` | Επων.Πελάτη | String(64) |  |
| `Mtrl` | Είδος | Integer(4) | ITEM |
| `MTRSUP` | Προμ.Είδους | Integer(4) | SUPPLIER |
| `SalVal` | Αξία Πώλησης | Float(8) |  |
| `SalVatAmnt` | Αξία ΦΠΑ Πώλησης | Float(8) |  |
| `PAYMENT` | Πληρωμή | String(4) |  |

**Πίνακας `CCCPAYANAL`** — Πίνακας CCCPAYANAL

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `F3` | Συν.Αξία | Float(8) |  |
| `F5` | Πληρωμή | String(2) |  |
| `EndDate` | Ημ/νία Λήξης | DateTime(8) |  |
| `CusBalance` | Υπόλοιπο Πελάτη | Float(8) |  |

**Πίνακας `CCCYPOLOIPO`** — Πίνακας CCCYPOLOIPO

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CusBalance` | Υπόλοιπο Πελάτη | Float(8) |  |

### `CCCWEBCATEGORY1` — Κατηγορία ( Master ) (EditMaster)

**Πίνακας `CCCWEBCATEGORY1`** — Κατηγορία ( Master )

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `COMPANY` | Εταιρεία | Smallint(2) |  |
| `CCCWEBCATEGORY1` | Κωδικός | Smallint(2) |  |
| `NAME` | Περιγραφή | String(64) |  |
| `ISACTIVE` | Ενεργή | Smallint(2) | $YN |
| `UPDDATE` | Ημερ.Μεταβολής | DateTime(8) | $DT |

### `CCCWEBGRSPECS` — Ομάδες χαρακτηριστικών ειδών (EditMaster)

**Πίνακας `CCCWEBGRSPECS`** — Ομάδες χαρακτηριστικών ειδών

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `COMPANY` | Εταιρεία | Smallint(2) |  |
| `CCCWEBGRSPECS` | iD | AutoInc(4) |  |
| `WEBGRSPECS` | Κωδικός | String(15) |  |
| `CCCWEBCATEGORY1` | Κατηγορία ( Master ) | Smallint(2) | CCCWEBCATEGORY1 |
| `CCCWEBCATEGORY2` | Κατηγορία ( Main ) | Smallint(2) | CCCWEBCATEGORY2 |
| `NAME` | Περιγραφή | WideString(100) |  |
| `ISACTIVE` | Ενεργή | Smallint(2) | $Y |
| `UPDDATE` | Ημερ.Μεταβολής | DateTime(8) | $DT |

**Πίνακας `CCCWEBSPECS`** — Χαρακτηριστικά ειδών

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `COMPANY` | Εταιρεία | Smallint(2) |  |
| `CCCWEBGRSPECS` | iD Ομάδας | Integer(4) |  |
| `WEBSPECS` | Κωδικός | Smallint(2) |  |
| `NAME` | Περιγραφή | WideString(100) |  |
| `ISVIEW` | Προβαλλόμενο | Smallint(2) | $Y |
| `ISACTIVE` | Ενεργό | Smallint(2) | $Y |
| `UPDDATE` | Ημερ.Μεταβολής | DateTime(8) | $DT |
| `isFilter` | Φίλτρο | Smallint(2) | $Y |

**Πίνακας `CCCWEBSPECSLNS`** — Τιμές χαρακτηριστικών ειδών

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `COMPANY` | Εταιρεία | Smallint(2) |  |
| `CCCWEBGRSPECS` | iD Ομάδας | Integer(4) |  |
| `WEBSPECS` | Χαρακτηριστικό | Smallint(2) |  |
| `WEBSPECSLNS` | Κωδικός | Smallint(2) |  |
| `NAME` | Περιγραφή | WideString(100) |  |
| `SOCOLOR` | Χρώμα | Integer(4) | $ONECOLOR |
| `ISACTIVE` | Ενεργό | Smallint(2) | $Y |
| `UPDDATE` | Ημερ.Μεταβολής | DateTime(8) | $DT |

## 2. Custom πεδία πάνω σε standard αντικείμενα

### `ITEM` — Είδη

**`ITEM`** — Είδη

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCDIMGROUP` | Ομάδα Χαρακτηριστικών | String(25) | CCCDIMGROUP |
| `CCCWARRANTY` | Επέκταση Εγγύησης | Smallint(2) | $Y |
| `CCCAVAIL` | Διαθεσιμότητα | String(1000) |  |
| `CCCPRTISLABEL` | Ετικέτα | Smallint(2) |  |
| `CCCWEBGRSPECS` | Ομάδα χαρακτηριστικών | Integer(4) | CCCWEBGRSPECS |
| `CCCWREMARKS` | Αναλυτική Περιγραφή | Memo(0) |  |
| `CCCWEBCATEGORY1` | Κατηγορία ( Master ) | Smallint(2) | CCCWEBCATEGORY1 |
| `CCCWEBCATEGORY2` | Κατηγορία ( Main ) | Smallint(2) | CCCWEBCATEGORY2 |
| `CCCWREMARKS1` | Σύντομη Περιγραφή | String(4000) |  |
| `CCCWEIGHT` | Βάρος | Float(8) |  |
| `CCCLENGTH` | Μήκος | Float(8) |  |
| `CCCWIDTH` | Πλάτος | Float(8) |  |
| `CCCHEIGHT` | Ύψος | Float(8) |  |

### `SERVICE` — Υπηρεσίες

**`SERVICE`** — Υπηρεσίες

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCDIMGROUP` | Ομάδα Χαρακτηριστικών | String(25) | CCCDIMGROUP |
| `CCCWARRANTY` | Επέκταση Εγγύησης | Smallint(2) | $Y |
| `CCCAVAIL` | Διαθεσιμότητα | String(1000) |  |
| `CCCPRTISLABEL` | Ετικέτα | Smallint(2) |  |
| `CCCWEBGRSPECS` | Ομάδα χαρακτηριστικών | Integer(4) | CCCWEBGRSPECS |
| `CCCWREMARKS` | Αναλυτική Περιγραφή | Memo(0) |  |
| `CCCWEBCATEGORY1` | Κατηγορία ( Master ) | Smallint(2) | CCCWEBCATEGORY1 |
| `CCCWEBCATEGORY2` | Κατηγορία ( Main ) | Smallint(2) | CCCWEBCATEGORY2 |
| `CCCWREMARKS1` | Σύντομη Περιγραφή | String(4000) |  |
| `CCCWEIGHT` | Βάρος | Float(8) |  |
| `CCCLENGTH` | Μήκος | Float(8) |  |
| `CCCWIDTH` | Πλάτος | Float(8) |  |
| `CCCHEIGHT` | Ύψος | Float(8) |  |

### `CUSTOMER` — Πελάτες

**`CUSTOMER`** — Πελάτες

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCCCMPRIORITY` | Προτεραιότητα CCM | Integer(4) |  |
| `CCCNAMETWO` | Δεύτερη επωνυμία | String(65) |  |
| `CCCBOXTEMPLATE` | Φόρμα εκτ. κιβωτίου | Integer(4) |  |
| `CCCBOXPRINTER` | Εκτυπωτής κιβωτίου | String(2000) |  |
| `CCCPALETTETEMPLATE` | Φόρμα εκτ. παλέτας | Integer(4) |  |
| `CCCPALETTEPRINTER` | Εκτυπωτής παλέτας | String(2000) |  |
| `CCCGLN` | GLN Πελάτη/Προμηθευτή | String(64) |  |

**`CUSBRANCH`** — Υποκαταστήματα πελατών

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCGLN` | GLN Υποκαταστήματος Πελάτη/Προμηθευτή | String(64) |  |

### `SUPPLIER` — Προμηθευτές

**`SUPPLIER`** — Προμηθευτές

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCCCMPRIORITY` | Προτεραιότητα CCM | Integer(4) |  |
| `CCCNAMETWO` | Δεύτερη επωνυμία | String(65) |  |
| `CCCBOXTEMPLATE` | Φόρμα εκτ. κιβωτίου | Integer(4) |  |
| `CCCBOXPRINTER` | Εκτυπωτής κιβωτίου | String(2000) |  |
| `CCCPALETTETEMPLATE` | Φόρμα εκτ. παλέτας | Integer(4) |  |
| `CCCPALETTEPRINTER` | Εκτυπωτής παλέτας | String(2000) |  |
| `CCCGLN` | GLN Πελάτη/Προμηθευτή | String(64) |  |

**`SUPBRANCH`** — Υποκαταστήματα προμηθευτών

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCGLN` | GLN Υποκαταστήματος Πελάτη/Προμηθευτή | String(64) |  |

### `SALDOC` — Παραστατικά πωλήσεων

**`SALDOC`** — Συναλλαγές (Πωλήσεων)

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCCCMID` | Κωδικός Κλήσης CCM | String(40) |  |
| `CCCCCMRECORDFILE` | Αρχείο Ηχογράφησης | String(500) |  |
| `CCCTRDREMAIN` | Προηγ. Υπόλοιπο | Float(8) |  |
| `CCCCASH` | Μετρητά | Float(8) |  |
| `CCCRETURN` | Ρέστα | Float(8) |  |
| `CCCCREDIT1` | Πιστωτικό Οριο Μετρητών | Float(8) |  |
| `CCCCREDIT2` | Πιστωτικό Οριο Αξιογράφων | Float(8) |  |
| `CCCCREDIT3` | Συνολικό Πιστωτικό Οριο | Float(8) |  |
| `CCCCREDIT4` | Αριθμός Ανοιχτών Τιμολογίων | Float(8) |  |
| `CCCCREDIT5` | Μέσος Χρόνος Πληρωμής | Float(8) |  |
| `CCCDUEVAL1` | Overdue Αριθμ. Τιμολογ. | Float(8) |  |
| `CCCDUEVAL2` | Overdue Ημερ. Πίστωσης | Float(8) |  |
| `CCCTRDR` | Πελάτης | Integer(4) |  |
| `CCCDA` | Σχετικό ΔΑ | String(30) |  |
| `CCCAPPROVAL` | Κωδικός Εγκρισης | Integer(4) |  |
| `CCCAPRVOVAL` | Κωδικός έγκρισης< | String(30) |  |
| `CCCTICK` |  | String(50) |  |
| `CCCSTATUS` | Status | Smallint(2) |  |
| `CCCFINDOCS` | Αρχική Παραγγελία | Integer(4) |  |
| `CCCFINCODES` | Κωδ.Αρχικ.Παραγγ. | String(30) |  |
| `CCCSERIESNUMS` | Αριθ.Αρχικ.Παραγγ. | Integer(4) |  |
| `CCCCOMMENTS` | Παρατηρήσεις 2 | String(1500) |  |
| `CCCEDISENT` | Απεστάλη μέσω EDI | Smallint(2) |  |

**`MTRDOC`** — Συναλλαγές υλικών

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCPackingStatus` | Packing Status | Smallint(2) |  |
| `CCCSHPNAME` | Επωνυμία | String(128) |  |
| `CCCSHPJOB` | Αντικείμενο | String(128) |  |
| `CCCSHPAFM` | ΑΦΜ | String(30) |  |
| `CCCSHPIRSDATA` | ΔΟΥ | String(64) |  |
| `CCCSHPPHONE` | Τηλέφωνο | String(64) |  |
| `CCCSHPADDRESS` | Πλήρη Διεύθυνση | String(128) |  |

**`MTRLINES`** — Γραμμές υλικών

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCCUSTOMER` | Μέλος | Integer(4) | CUSTOMER |
| `CCCLINESPAY` |  | Smallint(2) | $Y |
| `CCCCOMMENTS` | Σχετικό Παραστατικό | String(255) |  |
| `CCCORDERFIN` | Αρχκή Παραγγελία | Integer(4) |  |
| `CCCDA` | Σχετικό ΔΑ | String(30) |  |
| `CCCEXPMTRL` | Είδος Εξόδου | Integer(4) |  |
| `CCCEXPVAL1` | Αξία Εξόδου 1 | Float(8) |  |
| `CCCEXPVAL2` | Αξία Εξόδου 2 | Float(8) |  |
| `CCCPackingStatus` | Packing Status | Smallint(2) |  |
| `CCCPack1` | Κιβ | String(50) |  |
| `CCCPack2` | Παλέτα | String(50) |  |
| `CCCPackingUser` | Χρήστης | Integer(4) |  |
| `CCCBOX` | Κιβ παραλαβής | String(50) |  |

**`ITELINES`** — Γραμμές ειδών

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCCUSTOMER` | Μέλος | Integer(4) | CUSTOMER |
| `CCCLINESPAY` |  | Smallint(2) | $Y |
| `CCCCOMMENTS` | Σχετικό Παραστατικό | String(255) |  |
| `CCCORDERFIN` | Αρχκή Παραγγελία | Integer(4) |  |
| `CCCDA` | Σχετικό ΔΑ | String(30) |  |
| `CCCEXPMTRL` | Είδος Εξόδου | Integer(4) |  |
| `CCCEXPVAL1` | Αξία Εξόδου 1 | Float(8) |  |
| `CCCEXPVAL2` | Αξία Εξόδου 2 | Float(8) |  |
| `CCCPackingStatus` | Packing Status | Smallint(2) |  |
| `CCCPack1` | Κιβ | String(50) |  |
| `CCCPack2` | Παλέτα | String(50) |  |
| `CCCPackingUser` | Χρήστης | Integer(4) |  |
| `CCCBOX` | Κιβ παραλαβής | String(50) |  |

**`SRVLINES`** — Γραμμές υπηρεσιών

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCCUSTOMER` | Μέλος | Integer(4) | CUSTOMER |
| `CCCLINESPAY` |  | Smallint(2) | $Y |
| `CCCCOMMENTS` | Σχετικό Παραστατικό | String(255) |  |
| `CCCORDERFIN` | Αρχκή Παραγγελία | Integer(4) |  |
| `CCCDA` | Σχετικό ΔΑ | String(30) |  |
| `CCCEXPMTRL` | Είδος Εξόδου | Integer(4) |  |
| `CCCEXPVAL1` | Αξία Εξόδου 1 | Float(8) |  |
| `CCCEXPVAL2` | Αξία Εξόδου 2 | Float(8) |  |
| `CCCPackingStatus` | Packing Status | Smallint(2) |  |
| `CCCPack1` | Κιβ | String(50) |  |
| `CCCPack2` | Παλέτα | String(50) |  |
| `CCCPackingUser` | Χρήστης | Integer(4) |  |
| `CCCBOX` | Κιβ παραλαβής | String(50) |  |

**`ASSLINES`** — Γραμμές παγίων

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCCUSTOMER` | Μέλος | Integer(4) | CUSTOMER |
| `CCCLINESPAY` |  | Smallint(2) | $Y |
| `CCCCOMMENTS` | Σχετικό Παραστατικό | String(255) |  |
| `CCCORDERFIN` | Αρχκή Παραγγελία | Integer(4) |  |
| `CCCDA` | Σχετικό ΔΑ | String(30) |  |
| `CCCEXPMTRL` | Είδος Εξόδου | Integer(4) |  |
| `CCCEXPVAL1` | Αξία Εξόδου 1 | Float(8) |  |
| `CCCEXPVAL2` | Αξία Εξόδου 2 | Float(8) |  |
| `CCCPackingStatus` | Packing Status | Smallint(2) |  |
| `CCCPack1` | Κιβ | String(50) |  |
| `CCCPack2` | Παλέτα | String(50) |  |
| `CCCPackingUser` | Χρήστης | Integer(4) |  |
| `CCCBOX` | Κιβ παραλαβής | String(50) |  |

### `RETAILDOC` — Παραστατικά λιανικής

**`SALDOC`** — Συναλλαγές (Πωλήσεων)

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCCCMID` | Κωδικός Κλήσης CCM | String(40) |  |
| `CCCCCMRECORDFILE` | Αρχείο Ηχογράφησης | String(500) |  |
| `CCCTRDREMAIN` | Προηγ. Υπόλοιπο | Float(8) |  |
| `CCCCASH` | Μετρητά | Float(8) |  |
| `CCCRETURN` | Ρέστα | Float(8) |  |
| `CCCCREDIT1` | Πιστωτικό Οριο Μετρητών | Float(8) |  |
| `CCCCREDIT2` | Πιστωτικό Οριο Αξιογράφων | Float(8) |  |
| `CCCCREDIT3` | Συνολικό Πιστωτικό Οριο | Float(8) |  |
| `CCCCREDIT4` | Αριθμός Ανοιχτών Τιμολογίων | Float(8) |  |
| `CCCCREDIT5` | Μέσος Χρόνος Πληρωμής | Float(8) |  |
| `CCCDUEVAL1` | Overdue Αριθμ. Τιμολογ. | Float(8) |  |
| `CCCDUEVAL2` | Overdue Ημερ. Πίστωσης | Float(8) |  |
| `CCCTRDR` | Πελάτης | Integer(4) |  |
| `CCCDA` | Σχετικό ΔΑ | String(30) |  |
| `CCCAPPROVAL` | Κωδικός Εγκρισης | Integer(4) |  |
| `CCCAPRVOVAL` | Κωδικός έγκρισης< | String(30) |  |
| `CCCTICK` |  | String(50) |  |
| `CCCSTATUS` | Status | Smallint(2) |  |
| `CCCFINDOCS` | Αρχική Παραγγελία | Integer(4) |  |
| `CCCFINCODES` | Κωδ.Αρχικ.Παραγγ. | String(30) |  |
| `CCCSERIESNUMS` | Αριθ.Αρχικ.Παραγγ. | Integer(4) |  |
| `CCCCOMMENTS` | Παρατηρήσεις 2 | String(1500) |  |
| `CCCEDISENT` | Απεστάλη μέσω EDI | Smallint(2) |  |

**`MTRDOC`** — Συναλλαγές υλικών

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCPackingStatus` | Packing Status | Smallint(2) |  |
| `CCCSHPNAME` | Επωνυμία | String(128) |  |
| `CCCSHPJOB` | Αντικείμενο | String(128) |  |
| `CCCSHPAFM` | ΑΦΜ | String(30) |  |
| `CCCSHPIRSDATA` | ΔΟΥ | String(64) |  |
| `CCCSHPPHONE` | Τηλέφωνο | String(64) |  |
| `CCCSHPADDRESS` | Πλήρη Διεύθυνση | String(128) |  |

**`MTRLINES`** — Γραμμές υλικών

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCCUSTOMER` | Μέλος | Integer(4) | CUSTOMER |
| `CCCLINESPAY` |  | Smallint(2) | $Y |
| `CCCCOMMENTS` | Σχετικό Παραστατικό | String(255) |  |
| `CCCORDERFIN` | Αρχκή Παραγγελία | Integer(4) |  |
| `CCCDA` | Σχετικό ΔΑ | String(30) |  |
| `CCCEXPMTRL` | Είδος Εξόδου | Integer(4) |  |
| `CCCEXPVAL1` | Αξία Εξόδου 1 | Float(8) |  |
| `CCCEXPVAL2` | Αξία Εξόδου 2 | Float(8) |  |
| `CCCPackingStatus` | Packing Status | Smallint(2) |  |
| `CCCPack1` | Κιβ | String(50) |  |
| `CCCPack2` | Παλέτα | String(50) |  |
| `CCCPackingUser` | Χρήστης | Integer(4) |  |
| `CCCBOX` | Κιβ παραλαβής | String(50) |  |

**`ITELINES`** — Γραμμές ειδών

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCCUSTOMER` | Μέλος | Integer(4) | CUSTOMER |
| `CCCLINESPAY` |  | Smallint(2) | $Y |
| `CCCCOMMENTS` | Σχετικό Παραστατικό | String(255) |  |
| `CCCORDERFIN` | Αρχκή Παραγγελία | Integer(4) |  |
| `CCCDA` | Σχετικό ΔΑ | String(30) |  |
| `CCCEXPMTRL` | Είδος Εξόδου | Integer(4) |  |
| `CCCEXPVAL1` | Αξία Εξόδου 1 | Float(8) |  |
| `CCCEXPVAL2` | Αξία Εξόδου 2 | Float(8) |  |
| `CCCPackingStatus` | Packing Status | Smallint(2) |  |
| `CCCPack1` | Κιβ | String(50) |  |
| `CCCPack2` | Παλέτα | String(50) |  |
| `CCCPackingUser` | Χρήστης | Integer(4) |  |
| `CCCBOX` | Κιβ παραλαβής | String(50) |  |

**`SRVLINES`** — Γραμμές υπηρεσιών

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCCUSTOMER` | Μέλος | Integer(4) | CUSTOMER |
| `CCCLINESPAY` |  | Smallint(2) | $Y |
| `CCCCOMMENTS` | Σχετικό Παραστατικό | String(255) |  |
| `CCCORDERFIN` | Αρχκή Παραγγελία | Integer(4) |  |
| `CCCDA` | Σχετικό ΔΑ | String(30) |  |
| `CCCEXPMTRL` | Είδος Εξόδου | Integer(4) |  |
| `CCCEXPVAL1` | Αξία Εξόδου 1 | Float(8) |  |
| `CCCEXPVAL2` | Αξία Εξόδου 2 | Float(8) |  |
| `CCCPackingStatus` | Packing Status | Smallint(2) |  |
| `CCCPack1` | Κιβ | String(50) |  |
| `CCCPack2` | Παλέτα | String(50) |  |
| `CCCPackingUser` | Χρήστης | Integer(4) |  |
| `CCCBOX` | Κιβ παραλαβής | String(50) |  |

### `PURDOC` — Παραστατικά αγορών

**`PURDOC`** — Συναλλαγές (Αγορών)

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCCCMID` | Κωδικός Κλήσης CCM | String(40) |  |
| `CCCCCMRECORDFILE` | Αρχείο Ηχογράφησης | String(500) |  |
| `CCCTRDREMAIN` | Προηγ. Υπόλοιπο | Float(8) |  |
| `CCCCASH` | Μετρητά | Float(8) |  |
| `CCCRETURN` | Ρέστα | Float(8) |  |
| `CCCCREDIT1` | Πιστωτικό Οριο Μετρητών | Float(8) |  |
| `CCCCREDIT2` | Πιστωτικό Οριο Αξιογράφων | Float(8) |  |
| `CCCCREDIT3` | Συνολικό Πιστωτικό Οριο | Float(8) |  |
| `CCCCREDIT4` | Αριθμός Ανοιχτών Τιμολογίων | Float(8) |  |
| `CCCCREDIT5` | Μέσος Χρόνος Πληρωμής | Float(8) |  |
| `CCCDUEVAL1` | Overdue Αριθμ. Τιμολογ. | Float(8) |  |
| `CCCDUEVAL2` | Overdue Ημερ. Πίστωσης | Float(8) |  |
| `CCCTRDR` | Πελάτης | Integer(4) |  |
| `CCCDA` | Σχετικό ΔΑ | String(30) |  |
| `CCCAPPROVAL` | Κωδικός Εγκρισης | Integer(4) |  |
| `CCCAPRVOVAL` | Κωδικός έγκρισης< | String(30) |  |
| `CCCTICK` |  | String(50) |  |
| `CCCSTATUS` | Status | Smallint(2) |  |
| `CCCFINDOCS` | Αρχική Παραγγελία | Integer(4) |  |
| `CCCFINCODES` | Κωδ.Αρχικ.Παραγγ. | String(30) |  |
| `CCCSERIESNUMS` | Αριθ.Αρχικ.Παραγγ. | Integer(4) |  |
| `CCCCOMMENTS` | Παρατηρήσεις 2 | String(1500) |  |
| `CCCEDISENT` | Απεστάλη μέσω EDI | Smallint(2) |  |

**`MTRDOC`** — Συναλλαγές υλικών

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCPackingStatus` | Packing Status | Smallint(2) |  |
| `CCCSHPNAME` | Επωνυμία | String(128) |  |
| `CCCSHPJOB` | Αντικείμενο | String(128) |  |
| `CCCSHPAFM` | ΑΦΜ | String(30) |  |
| `CCCSHPIRSDATA` | ΔΟΥ | String(64) |  |
| `CCCSHPPHONE` | Τηλέφωνο | String(64) |  |
| `CCCSHPADDRESS` | Πλήρη Διεύθυνση | String(128) |  |

**`MTRLINES`** — Γραμμές υλικών

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCCUSTOMER` | Μέλος | Integer(4) | CUSTOMER |
| `CCCLINESPAY` |  | Smallint(2) | $Y |
| `CCCCOMMENTS` | Σχετικό Παραστατικό | String(255) |  |
| `CCCORDERFIN` | Αρχκή Παραγγελία | Integer(4) |  |
| `CCCDA` | Σχετικό ΔΑ | String(30) |  |
| `CCCEXPMTRL` | Είδος Εξόδου | Integer(4) |  |
| `CCCEXPVAL1` | Αξία Εξόδου 1 | Float(8) |  |
| `CCCEXPVAL2` | Αξία Εξόδου 2 | Float(8) |  |
| `CCCPackingStatus` | Packing Status | Smallint(2) |  |
| `CCCPack1` | Κιβ | String(50) |  |
| `CCCPack2` | Παλέτα | String(50) |  |
| `CCCPackingUser` | Χρήστης | Integer(4) |  |
| `CCCBOX` | Κιβ παραλαβής | String(50) |  |

**`ITELINES`** — Γραμμές ειδών

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCCUSTOMER` | Μέλος | Integer(4) | CUSTOMER |
| `CCCLINESPAY` |  | Smallint(2) | $Y |
| `CCCCOMMENTS` | Σχετικό Παραστατικό | String(255) |  |
| `CCCORDERFIN` | Αρχκή Παραγγελία | Integer(4) |  |
| `CCCDA` | Σχετικό ΔΑ | String(30) |  |
| `CCCEXPMTRL` | Είδος Εξόδου | Integer(4) |  |
| `CCCEXPVAL1` | Αξία Εξόδου 1 | Float(8) |  |
| `CCCEXPVAL2` | Αξία Εξόδου 2 | Float(8) |  |
| `CCCPackingStatus` | Packing Status | Smallint(2) |  |
| `CCCPack1` | Κιβ | String(50) |  |
| `CCCPack2` | Παλέτα | String(50) |  |
| `CCCPackingUser` | Χρήστης | Integer(4) |  |
| `CCCBOX` | Κιβ παραλαβής | String(50) |  |

**`SRVLINES`** — Γραμμές υπηρεσιών

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCCUSTOMER` | Μέλος | Integer(4) | CUSTOMER |
| `CCCLINESPAY` |  | Smallint(2) | $Y |
| `CCCCOMMENTS` | Σχετικό Παραστατικό | String(255) |  |
| `CCCORDERFIN` | Αρχκή Παραγγελία | Integer(4) |  |
| `CCCDA` | Σχετικό ΔΑ | String(30) |  |
| `CCCEXPMTRL` | Είδος Εξόδου | Integer(4) |  |
| `CCCEXPVAL1` | Αξία Εξόδου 1 | Float(8) |  |
| `CCCEXPVAL2` | Αξία Εξόδου 2 | Float(8) |  |
| `CCCPackingStatus` | Packing Status | Smallint(2) |  |
| `CCCPack1` | Κιβ | String(50) |  |
| `CCCPack2` | Παλέτα | String(50) |  |
| `CCCPackingUser` | Χρήστης | Integer(4) |  |
| `CCCBOX` | Κιβ παραλαβής | String(50) |  |

**`ASSLINES`** — Γραμμές παγίων

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCCUSTOMER` | Μέλος | Integer(4) | CUSTOMER |
| `CCCLINESPAY` |  | Smallint(2) | $Y |
| `CCCCOMMENTS` | Σχετικό Παραστατικό | String(255) |  |
| `CCCORDERFIN` | Αρχκή Παραγγελία | Integer(4) |  |
| `CCCDA` | Σχετικό ΔΑ | String(30) |  |
| `CCCEXPMTRL` | Είδος Εξόδου | Integer(4) |  |
| `CCCEXPVAL1` | Αξία Εξόδου 1 | Float(8) |  |
| `CCCEXPVAL2` | Αξία Εξόδου 2 | Float(8) |  |
| `CCCPackingStatus` | Packing Status | Smallint(2) |  |
| `CCCPack1` | Κιβ | String(50) |  |
| `CCCPack2` | Παλέτα | String(50) |  |
| `CCCPackingUser` | Χρήστης | Integer(4) |  |
| `CCCBOX` | Κιβ παραλαβής | String(50) |  |

### `ITEDOC` — Παραστατικά αποθήκης

**`ITEDOC`** — Συναλλαγές (Αποθήκης)

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCCCMID` | Κωδικός Κλήσης CCM | String(40) |  |
| `CCCCCMRECORDFILE` | Αρχείο Ηχογράφησης | String(500) |  |
| `CCCTRDREMAIN` | Προηγ. Υπόλοιπο | Float(8) |  |
| `CCCCASH` | Μετρητά | Float(8) |  |
| `CCCRETURN` | Ρέστα | Float(8) |  |
| `CCCCREDIT1` | Πιστωτικό Οριο Μετρητών | Float(8) |  |
| `CCCCREDIT2` | Πιστωτικό Οριο Αξιογράφων | Float(8) |  |
| `CCCCREDIT3` | Συνολικό Πιστωτικό Οριο | Float(8) |  |
| `CCCCREDIT4` | Αριθμός Ανοιχτών Τιμολογίων | Float(8) |  |
| `CCCCREDIT5` | Μέσος Χρόνος Πληρωμής | Float(8) |  |
| `CCCDUEVAL1` | Overdue Αριθμ. Τιμολογ. | Float(8) |  |
| `CCCDUEVAL2` | Overdue Ημερ. Πίστωσης | Float(8) |  |
| `CCCTRDR` | Πελάτης | Integer(4) |  |
| `CCCDA` | Σχετικό ΔΑ | String(30) |  |
| `CCCAPPROVAL` | Κωδικός Εγκρισης | Integer(4) |  |
| `CCCAPRVOVAL` | Κωδικός έγκρισης< | String(30) |  |
| `CCCTICK` |  | String(50) |  |
| `CCCSTATUS` | Status | Smallint(2) |  |
| `CCCFINDOCS` | Αρχική Παραγγελία | Integer(4) |  |
| `CCCFINCODES` | Κωδ.Αρχικ.Παραγγ. | String(30) |  |
| `CCCSERIESNUMS` | Αριθ.Αρχικ.Παραγγ. | Integer(4) |  |
| `CCCCOMMENTS` | Παρατηρήσεις 2 | String(1500) |  |
| `CCCEDISENT` | Απεστάλη μέσω EDI | Smallint(2) |  |

**`MTRDOC`** — Συναλλαγές υλικών

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCPackingStatus` | Packing Status | Smallint(2) |  |
| `CCCSHPNAME` | Επωνυμία | String(128) |  |
| `CCCSHPJOB` | Αντικείμενο | String(128) |  |
| `CCCSHPAFM` | ΑΦΜ | String(30) |  |
| `CCCSHPIRSDATA` | ΔΟΥ | String(64) |  |
| `CCCSHPPHONE` | Τηλέφωνο | String(64) |  |
| `CCCSHPADDRESS` | Πλήρη Διεύθυνση | String(128) |  |

**`MTRLINES`** — Γραμμές υλικών

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCCUSTOMER` | Μέλος | Integer(4) | CUSTOMER |
| `CCCLINESPAY` |  | Smallint(2) | $Y |
| `CCCCOMMENTS` | Σχετικό Παραστατικό | String(255) |  |
| `CCCORDERFIN` | Αρχκή Παραγγελία | Integer(4) |  |
| `CCCDA` | Σχετικό ΔΑ | String(30) |  |
| `CCCEXPMTRL` | Είδος Εξόδου | Integer(4) |  |
| `CCCEXPVAL1` | Αξία Εξόδου 1 | Float(8) |  |
| `CCCEXPVAL2` | Αξία Εξόδου 2 | Float(8) |  |
| `CCCPackingStatus` | Packing Status | Smallint(2) |  |
| `CCCPack1` | Κιβ | String(50) |  |
| `CCCPack2` | Παλέτα | String(50) |  |
| `CCCPackingUser` | Χρήστης | Integer(4) |  |
| `CCCBOX` | Κιβ παραλαβής | String(50) |  |

**`ITELINES`** — Γραμμές υλικών

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCCUSTOMER` | Μέλος | Integer(4) | CUSTOMER |
| `CCCLINESPAY` |  | Smallint(2) | $Y |
| `CCCCOMMENTS` | Σχετικό Παραστατικό | String(255) |  |
| `CCCORDERFIN` | Αρχκή Παραγγελία | Integer(4) |  |
| `CCCDA` | Σχετικό ΔΑ | String(30) |  |
| `CCCEXPMTRL` | Είδος Εξόδου | Integer(4) |  |
| `CCCEXPVAL1` | Αξία Εξόδου 1 | Float(8) |  |
| `CCCEXPVAL2` | Αξία Εξόδου 2 | Float(8) |  |
| `CCCPackingStatus` | Packing Status | Smallint(2) |  |
| `CCCPack1` | Κιβ | String(50) |  |
| `CCCPack2` | Παλέτα | String(50) |  |
| `CCCPackingUser` | Χρήστης | Integer(4) |  |
| `CCCBOX` | Κιβ παραλαβής | String(50) |  |

**`SRVLINES`** — Γραμμές υλικών

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCCUSTOMER` | Μέλος | Integer(4) | CUSTOMER |
| `CCCLINESPAY` |  | Smallint(2) | $Y |
| `CCCCOMMENTS` | Σχετικό Παραστατικό | String(255) |  |
| `CCCORDERFIN` | Αρχκή Παραγγελία | Integer(4) |  |
| `CCCDA` | Σχετικό ΔΑ | String(30) |  |
| `CCCEXPMTRL` | Είδος Εξόδου | Integer(4) |  |
| `CCCEXPVAL1` | Αξία Εξόδου 1 | Float(8) |  |
| `CCCEXPVAL2` | Αξία Εξόδου 2 | Float(8) |  |
| `CCCPackingStatus` | Packing Status | Smallint(2) |  |
| `CCCPack1` | Κιβ | String(50) |  |
| `CCCPack2` | Παλέτα | String(50) |  |
| `CCCPackingUser` | Χρήστης | Integer(4) |  |
| `CCCBOX` | Κιβ παραλαβής | String(50) |  |

**`ASSLINES`** — Γραμμές υλικών

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCCUSTOMER` | Μέλος | Integer(4) | CUSTOMER |
| `CCCLINESPAY` |  | Smallint(2) | $Y |
| `CCCCOMMENTS` | Σχετικό Παραστατικό | String(255) |  |
| `CCCORDERFIN` | Αρχκή Παραγγελία | Integer(4) |  |
| `CCCDA` | Σχετικό ΔΑ | String(30) |  |
| `CCCEXPMTRL` | Είδος Εξόδου | Integer(4) |  |
| `CCCEXPVAL1` | Αξία Εξόδου 1 | Float(8) |  |
| `CCCEXPVAL2` | Αξία Εξόδου 2 | Float(8) |  |
| `CCCPackingStatus` | Packing Status | Smallint(2) |  |
| `CCCPack1` | Κιβ | String(50) |  |
| `CCCPack2` | Παλέτα | String(50) |  |
| `CCCPackingUser` | Χρήστης | Integer(4) |  |
| `CCCBOX` | Κιβ παραλαβής | String(50) |  |

### `INST`

Δεν διαβάστηκε: Invalid request. Insufficient access rights to perform the operation!

### `SOACTION` — Ενέργειες

**`SOACTION`** — Ενέργειες

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCCCMID` | Κωδικός Κλήσης CCM | String(40) |  |
| `CCCCCMRECORDFILE` | Αρχείο Ηχογράφησης | String(500) |  |

### `ITEGROUP` — 

**`ITEGROUP`** — Ομάδες ειδών

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCBUSUNITS` | Κατηγ.Προιοντος | Smallint(2) | BUSUNITS |

### `VAT` — Φ.Π.Α

**`VAT`** — Φ.Π.Α.

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCVAT` | Κωδικός Intergration | Integer(4) |  |

### `SOCARRIER` — Μεταφορείς

**`SOCARRIER`** — Μεταφορείς

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCGROUP` | Ομάδα Μεταφορέα | Integer(4) | CCCGROUP |
| `CCCORDER` | Σειρά Παράδοσης | Smallint(2) |  |

### `TRDBRANCH` — 

**`TRDBRANCH`** — Υποκαταστήματα

| Πεδίο | Περιγραφή | Τύπος | Σύνδεση |
|---|---|---|---|
| `CCCGLN` | GLN Υποκαταστήματος Πελάτη/Προμηθευτή | String(64) |  |
