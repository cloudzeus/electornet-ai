# Ημερήσιος έλεγχος ασφαλείας — τι τρέχει πού

Δύο ανεξάρτητοι έλεγχοι, μόνο αναγνώσεις (SELECT, HTTP GET, DNS, TLS). Κανένας δεν αλλάζει τίποτα.

| | Εσωτερικός έλεγχος | Εξωτερικός φύλακας |
|---|---|---|
| Πού τρέχει | μέσα στην εφαρμογή (Coolify) | GitHub Actions — εκτός των υποδομών μας |
| Πότε | full 07:00 Αθήνα · light κάθε ώρα στο :05 | full 07:30 Αθήνα (θερινή ώρα — βλ. παρακάτω) · light κάθε ώρα στο :15 |
| Πώς ξεκινά | Coolify scheduled task → `GET /api/cron/security-audit?mode=full\|light` | `.github/workflows/security-watch.yml` → `scripts/security-watch.ts` |
| Τι βλέπει | βάση (λογαριασμοί, ρόλοι, συνδέσεις, ρυθμίσεις, περιεχόμενο), Bunny, βιβλιοθήκες (OSV), το site απ' έξω, πιστοποιητικό | ό,τι βλέπει ένας επισκέπτης: σελίδες, αρχεία JS, headers, Cloudflare Zaraz, cloaking, DNS, νέα πιστοποιητικά (CT), αν τρέχει ο εσωτερικός έλεγχος |
| Αποτέλεσμα | `SecurityReport` στη βάση, σελίδα «Ασφάλεια» (`/admin/asfaleia`), email σύνοψης + άμεση ειδοποίηση «ΚΡΙΣΙΜΟ» | email απευθείας από Mailgun (full: κάθε μέρα· light: μόνο σε νέο κρίσιμο), artifact `security-watch-report.json` (30 ημέρες) |

Γιατί δύο: μια παραβιασμένη εφαρμογή δεν πρέπει να μπορεί να δηλώνει μόνη της «όλα καλά». Ο φύλακας καλεί το
υπογεγραμμένο `GET /api/security/heartbeat` (dead man's switch) και γίνεται **κρίσιμο** αν:
- δεν υπάρχει σημερινός full μετά τις 08:00 («Ο εσωτερικός έλεγχος δεν έτρεξε σήμερα»)·
- ο εσωτερικός λέει ΟΚ ενώ ο φύλακας βρίσκει κρίσιμο σε κάτι που ελέγχουν και οι δύο (σελίδες, Zaraz, αρχεία JS, πιστοποιητικό)·
- το heartbeat δεν απαντά (401 / 404 / 5xx / χωρίς απάντηση — «Δεν απαντά ο εσωτερικός έλεγχος»).

503 (η εφαρμογή δεν έχει `SECURITY_WATCH_SECRET`) → προειδοποίηση· ειδοποιήσεις του εσωτερικού που δεν παραδόθηκαν → προειδοποίηση.

## 1. Πριν από το deploy — ΥΠΟΧΡΕΩΤΙΚΟ

```
npx tsx scripts/apply-security-audit.ts
```

Προσθέτει (idempotent, μόνο προσθήκες) τους πίνακες `SecurityReport` / `SecurityAlert`, τη στήλη `SecurityReport.alertRetry`,
το ευρετήριο `LoginEvent(method, at)` και τα δικαιώματα `security.read` / `security.run`. Χωρίς αυτό ο έλεγχος και το
heartbeat αποτυγχάνουν μετά το deploy. **Ποτέ** `prisma db push` / migrate — η βάση είναι κοινή με άλλα projects.

## 2. Coolify (εφαρμογή)

### Μεταβλητές περιβάλλοντος
| Μεταβλητή | Τι είναι |
|---|---|
| `SECURITY_WATCH_SECRET` | νέο: τυχαίο μυστικό (π.χ. `openssl rand -hex 32`). **Ίδια τιμή** στο GitHub Secret του φύλακα. |
| `SECURITY_SITE_URL` | νέο: `https://euronics.dgsoft.gr` — το δημόσιο URL που ελέγχει ο εσωτερικός έλεγχος site. |
| `CRON_SECRET` | υπάρχει ήδη (το χρησιμοποιούν και τα άλλα cron). |

Ο εσωτερικός έλεγχος έχει και τον έλεγχο «Εξωτερικός φύλακας» (`watcher`, full και light): πότε κάλεσε τελευταία ο φύλακας
το heartbeat (ιστορικό ενεργειών `security.watch.ping`)· κανένα σήμα ή πάνω από 26 ώρες → προειδοποίηση.

### Scheduled tasks
Η ώρα των scheduled tasks του Coolify είναι η ζώνη ώρας του server (ρύθμιση Timezone του server στο Coolify): ορίστε
`Europe/Athens`, αλλιώς μετατρέψτε σε UTC (07:00 Αθήνα = 04:00 UTC το καλοκαίρι, 05:00 UTC τον χειμώνα).
Η κλήση γίνεται **μέσα στο container** (localhost) — όχι μέσω Cloudflare, που κόβει τα αιτήματα στα 100″ ενώ ο full
μπορεί να κρατήσει έως 5′. Το `curl` υπάρχει στο runtime (`RAILPACK_DEPLOY_APT_PACKAGES`).

| Όνομα | Cron | Εντολή |
|---|---|---|
| security-audit-full | `0 7 * * *` | `curl -fsS -m 300 -H "Authorization: Bearer $CRON_SECRET" "http://127.0.0.1:3000/api/cron/security-audit?mode=full"` |
| security-audit-light | `5 * * * *` | `curl -fsS -m 90 -H "Authorization: Bearer $CRON_SECRET" "http://127.0.0.1:3000/api/cron/security-audit?mode=light"` |

(Αν η εφαρμογή ακούει σε άλλη θύρα από 3000, αλλάξτε τη.) Η απάντηση δεν περιέχει ευρήματα — μόνο `reportId` / `status`.

## 3. GitHub (εξωτερικός φύλακας)

Repo `cloudzeus/electornet-ai` → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Τιμή |
|---|---|
| `MAILGUN_API_KEY` | το API key του Mailgun (EU region) |
| `MAILGUN_DOMAIN` | το domain αποστολής του Mailgun |
| `SECURITY_WATCH_SECRET` | **ίδια τιμή** με το Coolify |
| `SECURITY_REPORT_TO` | παραλήπτες, με κόμματα (π.χ. `gkozyris@i4ria.com`) |

Προαιρετικά Secrets: `MAILGUN_FROM` (προεπιλογή `Euronics security watch <security-watch@<MAILGUN_DOMAIN>>`),
`MAILGUN_REGION` (`us` για λογαριασμό US· κενό = `eu`). Τα μυστικά μπαίνουν **μόνο** ως Secrets — ποτέ σε αρχεία του repo (είναι δημόσιο).

- Τα schedules του GitHub τρέχουν μόνο από το workflow του **default branch** (`master`) — ενεργοποιούνται μετά το merge.
- Χειροκίνητη εκτέλεση: Actions → security-watch → Run workflow → `full` ή `light`.
- Ώρα: `30 4 * * *` UTC = 07:30 Αθήνα με θερινή ώρα· με χειμερινή ώρα 06:30 (πριν από τον εσωτερικό full των 07:00 —
  τότε το heartbeat κρίνει τον χθεσινό full, χωρίς ψευδές κρίσιμο). Το GitHub συχνά καθυστερεί τα schedules 5–30′.
- **Τα schedules απενεργοποιούνται αυτόματα** από το GitHub σε δημόσια repos μετά από 60 ημέρες χωρίς δραστηριότητα
  (commits) στο repo — τότε ο φύλακας σταματά σιωπηλά. Ξαναενεργοποίηση: Actions → security-watch → Enable workflow.
  Δύο δίχτυα: (α) το καθημερινό email του φύλακα — αν δεν έρθει, κάτι σταμάτησε· (β) ο εσωτερικός έλεγχος «Εξωτερικός
  φύλακας» (`watcher`) δίνει προειδοποίηση αν ο φύλακας δεν έχει καλέσει το heartbeat για πάνω από 26 ώρες.
- Αποτυχία email (ή λείπουν Secrets) → το run βγαίνει κόκκινο (το GitHub ειδοποιεί όποιον άλλαξε τελευταίος το workflow).
- Το light στέλνει email μόνο για κρίσιμο που δεν στάλθηκε τις τελευταίες 23 ώρες (κατάσταση στο Actions cache —
  μόνο fingerprints). **Βάλτε τα Secrets μετά το deploy της εφαρμογής**: πριν από αυτό το heartbeat απαντά 404 και ο
  φύλακας δίνει (σωστά) «Δεν απαντά ο εσωτερικός έλεγχος».

### Τι ελέγχει ο φύλακας
- **full**: robots.txt, sitemap.xml (η εφαρμογή δεν έχει — αν εμφανιστεί, προειδοποίηση), αρχική, `/admin/login`,
  10 κατηγορίες + 20 προϊόντα (από συνδέσμους της αρχικής/κατηγοριών, επιλογή με seed την ημερομηνία — ίδια μέσα στη μέρα,
  άλλα την επόμενη), όλα τα αρχεία `/_next/static/*.js` που αναφέρουν (scripts + RSC payload: 200, JavaScript, ίδιο
  origin, σάρωση για άγνωστα domains, base64 > 20 KB, `eval`/`new Function` με δυναμικό κώδικα, συγκάλυψη, δείκτες της
  επίθεσης, διευθύνσεις σε φιλοξενία περιεχομένου χρηστών — jsDelivr `/gh/`, unpkg, raw.githubusercontent, Apps Script,
  pages.dev κ.λπ.· sha256 στο artifact), cloaking (αρχική/κατηγορία/προϊόν ως Windows Chrome και iPhone Safari με Referer
  Google· κάθε παραλλαγή κατεβάζει και τα δικά της αρχεία JS με τον ίδιο user agent, Referer τη σελίδα και
  `Sec-Fetch-Dest: script` — άλλο sha256 από το αντίγραφο του φύλακα ή αρχείο μόνο για κινητό που ο φύλακας δεν παίρνει
  → κρίσιμο· έως 150 λήψεις, ό,τι μείνει → «μερικός έλεγχος»), headers (CSP όπως το `lib/security/csp.ts`, HSTS, nosniff, frame-ancestors),
  Cloudflare Zaraz στην άκρη (`/cdn-cgi/zaraz/s.js` → 404 = ανενεργό), πιστοποιητικό (< 7 ημέρες κρίσιμο, < 21 προειδοποίηση),
  DNS, νέα πιστοποιητικά `*.dgsoft.gr` (crt.sh, εφεδρεία certspotter), heartbeat.
- **light**: αρχική + `/admin/login` (κανόνες σελίδας + headers), Zaraz, heartbeat.
- Σύγκριση των αρχείων JS με build του `master`: **παραλείπεται** μέχρι να επιβεβαιωθεί αναπαραγώγιμο build (γράφεται στο email).
- Ευγενικός: ≤ 3 αιτήματα/δευτερόλεπτο, όριο 15″ ανά αίτημα, user agent `euronics-security-watch/1.0 (+contact …)`.

Τοπικά (χωρίς email): `npx tsx scripts/security-watch.ts --mode=full --dry` (ή `--mode=light`, `--site=https://…`).

## 4. Εικόνα αναφοράς DNS (`security/dns-baseline.json`)

Ο φύλακας συγκρίνει A / AAAA / CNAME / MX / TXT / CAA / NS των `euronics.dgsoft.gr` και `dgsoft.gr` και το TXT του
`_dmarc.dgsoft.gr` με την εικόνα του repo. Αλλαγή A / AAAA / CNAME / NS / MX → κρίσιμο (εκτός αν πριν και μετά είναι
IP του Cloudflare — proxied εγγραφή → προειδοποίηση)· TXT / CAA → προειδοποίηση. Το `knownCertNames` είναι τα ονόματα
με πιστοποιητικά στο Certificate Transparency· νέο πιστοποιητικό για άλλο όνομα → προειδοποίηση.

Μετά από αλλαγή DNS που κάναμε **εμείς** (ή νέο υποτομέα):

```
npx tsx scripts/security-watch.ts --write-dns-baseline
git add security/dns-baseline.json && git commit -m "Ασφάλεια: νέα εικόνα DNS (<τι άλλαξε>)"
```

Η εικόνα αλλάζει μόνο με commit — έτσι κάθε αλλαγή της φαίνεται στο ιστορικό.

## 5. Συστάσεις

- **Κάντε το repo private.** Τώρα είναι δημόσιο: όποιος το δει ξέρει ακριβώς τι ελέγχεται (και τι όχι), και **τα logs
  και τα artifacts των Actions ενός δημόσιου repo είναι επίσης δημόσια**. Γι' αυτό ο φύλακας γράφει στο log μόνο
  `{mode, status, seconds, email.sent}` και το artifact κρατά μόνο όσα βλέπει έτσι κι αλλιώς κάθε επισκέπτης (το heartbeat
  μόνο ως κατάσταση — όχι πότε/πώς έτρεξε ο εσωτερικός έλεγχος)· οι λεπτομέρειες πάνε μόνο στο email. Στα private repos τα
  λεπτά του Actions μετρούν (ο light τρέχει 24 φορές τη μέρα, ~1′ η καθεμία) — το δωρεάν πακέτο αρκεί κατά κανόνα.
- **Κλείστε το Cloudflare Email Obfuscation** (Scrape Shield → Email Address Obfuscation): προσθέτει δικό του script
  (`/cdn-cgi/scripts/…/email-decode.min.js`) σε κάθε σελίδα· οι έλεγχοι το δίνουν ως προειδοποίηση (όχι επίθεση), αλλά
  είναι ακριβώς ο μηχανισμός (scripts του Cloudflare στις σελίδες μας) που χρησιμοποίησε η επίθεση μέσω Zaraz.
- Το Zaraz πρέπει να μένει **απενεργοποιημένο** (`/cdn-cgi/zaraz/s.js` → 404). Αν χρειαστεί ποτέ, μπαίνει ρητά στο
  `ALLOWED_CDN_CGI` (`lib/security/audit/policy.ts`) — μέχρι τότε κάθε εμφάνισή του είναι κρίσιμο.
- Το `dgsoft.gr` δεν έχει εγγραφή DMARC (`_dmarc.dgsoft.gr`) — καλό είναι να προστεθεί (`v=DMARC1; p=quarantine; …`) και
  μετά να ενημερωθεί η εικόνα αναφοράς.
