# Backups βάσης δεδομένων → Bunny Storage

Κάθε μέρα ένα πλήρες αντίγραφο της PostgreSQL (`pg_dump -Fc`, συμπιεσμένο custom format) κρυπτογραφείται με AES-256-CBC (openssl, PBKDF2 200k) και ανεβαίνει στο Bunny Storage. Ιστορικό, λήψη και «Backup τώρα» στο `/admin/backups` (μόνο super admin).

## Πού αποθηκεύεται
| Ρύθμιση (Ρυθμίσεις → Bunny CDN) | Συμπεριφορά |
|---|---|
| «Backup storage zone» κενό | φάκελος `_backups/` στο zone των media. Το pull zone **σερβίρει δημόσια** ό,τι υπάρχει στο zone, γι' αυτό τα αρχεία έχουν τυχαίο όνομα (12 hex) και πρέπει να είναι κρυπτογραφημένα. |
| «Backup storage zone» = π.χ. `euronics-backups` (+ password) | **Συνιστάται για παραγωγή**: ξεχωριστό Storage zone **χωρίς pull zone**, ώστε τα αντίγραφα να μην είναι προσβάσιμα από το internet. |

Διατήρηση: «Διατήρηση backup (ημέρες)» (προεπιλογή 30), πάντα κρατούνται τα 3 πιο πρόσφατα. Το pruning τρέχει μετά από κάθε επιτυχημένο backup και σβήνει και το αρχείο από το Bunny.

## Μεταβλητές περιβάλλοντος (`.env`)
```
BACKUP_PASSPHRASE=          # υποχρεωτικό για παραγωγή· χωρίς αυτό το dump ανεβαίνει ακρυπτογράφητο (η σελίδα το δείχνει κόκκινο)
PG_DUMP_PATH=               # προαιρετικό· pg_dump ίδιας major έκδοσης με τον server (16). Κενό = `pg_dump` από το PATH
CRON_SECRET=                # για το endpoint /api/cron/backup
DATABASE_URL=               # ήδη υπάρχει
```
Φύλαξε το `BACKUP_PASSPHRASE` και εκτός server (password manager). Χωρίς αυτό **δεν γίνεται επαναφορά**.

## Τρεις τρόποι να τρέξει
1. **Coolify / εξωτερικός scheduler** (προτείνεται σε παραγωγή, το app container έχει `pg_dump` 16):
   ```
   0 3 * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://www.euronics.gr/api/cron/backup
   ```
2. **crontab στον server** με το script (χρειάζεται Node + pg_dump):
   ```
   0 3 * * *  cd /srv/euronics && npx tsx --conditions=react-server scripts/backup-db.ts >> logs/backup.log 2>&1
   ```
3. **Χειροκίνητα**: κουμπί «Backup τώρα» στο `/admin/backups` ή `npx tsx --conditions=react-server scripts/backup-db.ts`.

Κάθε εκτέλεση γράφει γραμμή στον πίνακα `BackupRun` (trigger, μέγεθος, sha256, χρόνος, σφάλμα) και στο audit log.

## Επαναφορά
1. Λήψη από `/admin/backups` (proxy μέσω του private storage key) ή από το Bunny panel.
2. Αποκρυπτογράφηση (αν `.enc`):
   ```
   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in euronics-….dump.enc -out euronics.dump -pass env:BACKUP_PASSPHRASE
   ```
3. Επαναφορά σε **νέα** βάση (δοκιμή) ή στην παραγωγή:
   ```
   createdb euronics_restore
   pg_restore --no-owner --no-acl -d "postgres://user:pass@host:5432/euronics_restore" euronics.dump
   ```
   Έλεγχος περιεχομένου χωρίς επαναφορά: `pg_restore -l euronics.dump`.
4. Μετά την επαναφορά: `npx prisma generate` και επανεκκίνηση της εφαρμογής.

## Κανόνας ασφαλείας
Χωρίς `BACKUP_PASSPHRASE` το backup **απορρίπτεται** όταν ο προορισμός είναι το κοινό zone των media (θα ήταν δημόσιο μέσω του pull zone). Ακρυπτογράφητο επιτρέπεται μόνο σε αποκλειστικό backup zone.

## Τι ελέγχθηκε (2026-09-13)
Backup 209 KB σε 12 s από τη βάση `euronics` (12 MB) με προσωρινό passphrase: upload στο `_backups/`, λήψη μέσω storage API, `openssl -d` και `pg_restore -l` επιστρέφουν και τους 67 πίνακες, λάθος passphrase απορρίπτεται. Τα δοκιμαστικά αρχεία διαγράφηκαν. Το πραγματικό `BACKUP_PASSPHRASE` το ορίζει ο διαχειριστής.
