# Snap & Find — αναγνώριση παλιάς συσκευής από φωτογραφία

Ο πελάτης φωτογραφίζει την παλιά του συσκευή (ή την πινακίδα της) από το εικονίδιο κάμερας στην αναζήτηση (`eu:snap` event, ή `/?snap=1` μετά από σύνδεση). Δύο αναγνωριστές τρέχουν παράλληλα:

| Αναγνωριστής | Πού τρέχει | Τι δίνει |
|---|---|---|
| Vision model (OpenRouter, task `vision`) | server, `POST /api/snap/identify` | είδος, μάρκα, μοντέλο, S/N, ενεργειακή κλάση, εκτίμηση ηλικίας, κατάσταση, διαστάσεις, βεβαιότητα |
| OCR (tesseract.js) | στη συσκευή του πελάτη | κωδικοί μοντέλου από την πινακίδα — fallback όταν το AI είναι ανενεργό / εκτός budget ή δεν βρήκε συσκευή |

## Ροή
1. Η φωτογραφία σμικρύνεται στον browser (≤1280px JPEG) και στέλνεται ως data URL. Στον server ξανασμικρύνεται με sharp (≤1024px) και **επεξεργάζεται μόνο στη μνήμη** — δεν αποθηκεύεται.
2. `identifyAppliance()` (`lib/ai/tasks.ts`) ζητά αυστηρό JSON από το vision model. Κόστος καταγράφεται στο `AiUsage` (feature `snap`) με markup/FX όπως κάθε κλήση.
3. `composeResult()` (`lib/snap/identify.ts`):
   - ταίριασμα μοντέλου στον κατάλογο (normalised model code σε τίτλο/SKU) → «Το ίδιο μοντέλο στον κατάλογο»,
   - αντικαταστάτες ίδιας υποκατηγορίας (έως 4, με προτεραιότητα βαθμολογίας και προσφοράς),
   - **εξοικονόμηση ρεύματος/έτος**: τυπική κατανάλωση παλιάς συσκευής (`OLD_APPLIANCE_KWH`, +15% αν >12 ετών) μείον `estimateKwh()` του νέου × τιμή kWh από τα Settings,
   - **fit check** έναντι των διαστάσεων της παλιάς (αν διαβάστηκαν): «Χωράει» ή «+5 cm βάθος»,
   - καταγραφή `SnapScan` (ανώνυμη: `ipHash`, χωρίς εικόνα).
4. Rate limit: 10 αναγνωρίσεις / ώρα / IP (`ipHash`).

## Επόμενα βήματα του πελάτη (και τι καταγράφεται)
| Ενέργεια | Τι γίνεται | `SnapScan.action` |
|---|---|---|
| Αντικατάσταση | link στο προϊόν ή στην κατηγορία, υπενθύμιση δωρεάν παραλαβής παλιάς | `replace` |
| Συσκευές μου | `POST /api/account/devices` — `CustomerDevice` (registeredBy `manual`), η φωτογραφία μπαίνει στη Media library, φάκελος **Snap**, tags `snap, customer-device`, `invoiceUrl` → asset· `Consent` topic `profiling`, source `snap` με πλήρη τεκμήρια (IP/OS/browser) | `register` + `imageUrl` |
| Αίτημα service | `POST /api/account/tickets` — `ServiceTicket` (`SRV-xxxxx`, kind `repair`, mode visit/pickup/store), timeline «Αίτημα από Snap & Find», email `service-received` | `service` |
| Ανακύκλωση | links σε /ypiresies/anakyklosi-aiie και καταστήματα με service `recycling` | `recycle` |

Οι δύο πρώτες ενέργειες που γράφουν δεδομένα απαιτούν σύνδεση πελάτη· χωρίς σύνδεση εμφανίζεται «Σύνδεση για καταχώρηση» με επιστροφή στο `/?snap=1`. Η φωτογραφία **κρατιέται μόνο** στην ενέργεια «Συσκευές μου» (ρητή ειδοποίηση συναίνεσης κάτω από το κουμπί).

## Ραντάρ (`/admin/radar`)
Ενότητα «Snap & Find · τι φωτογραφίζουν οι πελάτες» (`lib/snap/stats.ts`, 30 ημέρες): φωτογραφίες, ποσοστό αναγνώρισης, ταιριάσματα, μέση ηλικία, μερίδιο >10 ετών, κατηγορίες, μάρκες, ενεργειακές κλάσεις, τελευταία ενέργεια ανά scan, κόστος AI. Είναι ζήτηση αντικατάστασης **πριν** γίνει αναζήτηση.

## Παράμετροι
- Κατηγορίες που γνωρίζει το prompt: plyntiria, stegnotiria, psygeia, plyntiria-piaton, koyzines, air-condition, tileoraseis, skoypes, mikrosyskeves, smartphones, laptops, other. Νέα υποκατηγορία = προσθήκη στο prompt + στο `OLD_APPLIANCE_KWH`.
- Τιμή kWh: Settings → Εμπόριο (`commerce.kwhPrice`).
- Μοντέλο: task `vision` του OpenRouter (auto routing, στην πράξη Gemini Flash), ~0,001 $/φωτογραφία.
