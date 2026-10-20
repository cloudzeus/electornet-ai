# Καθημερινό security audit report — σχεδίαση

**Ημερομηνία:** 2026-10-20 · **Αφορμή:** ο security auditor του πελάτη ισχυρίζεται ότι το site / η διαχείριση έχουν παραβιαστεί (αναφορά για ψεύτικη σελίδα «Cloudflare» τύπου ClickFix στο `/admin/login`). Παράλληλα τρέχει πλήρης έλεγχος περιστατικού (μόνο αναγνώσεις) — ξεχωριστό παραδοτέο.

## Στόχος
Κάθε πρωί ένα report ασφαλείας που αποδεικνύει (ή διαψεύδει) ότι το site και η διαχείριση είναι καθαρά, με άμεση ειδοποίηση για ό,τι κρίσιμο. Το report διαβάζεται από τον ιδιοκτήτη και προωθείται αυτούσιο στον auditor ως τεκμήριο.

## Αποφάσεις του χρήστη
- Παραλήπτης: **gkozyris@i4ria.com** (λίστα στις Ρυθμίσεις, αλλάζει από εκεί) + σελίδα **«Ασφάλεια»** στη διαχείριση με ιστορικό.
- Ανεξαρτησία: **εσωτερικός έλεγχος μέσα στην εφαρμογή + εξωτερικός φύλακας σε GitHub Actions** — μια παραβιασμένη εφαρμογή δεν πρέπει να μπορεί να δηλώνει μόνη της «όλα καλά».
- Κρίσιμα ευρήματα → email αμέσως (όχι μόνο στο πρωινό report).
- Μόνο ειδοποιήσεις: καμία αυτόματη ενέργεια (κλείδωμα λογαριασμών, απενεργοποίηση).

## 1. Εσωτερικός έλεγχος (εφαρμογή)

**Εκτέλεση:** `GET /api/cron/security-audit?mode=full|light` με `Authorization: Bearer $CRON_SECRET` (μοτίβο των υπαρχόντων cron). Coolify scheduled task: `full` 07:00 Europe/Athens, `light` κάθε ώρα. Κουμπί «Τρέξε τώρα» στη σελίδα (full).

**Κάθε έλεγχος** είναι ανεξάρτητη μονάδα `Check = { key, title, run(ctx) → { status: "ok" | "warn" | "critical" | "error", summary, findings: { severity, title, detail, evidence? }[] } }`. Σφάλμα σε έναν έλεγχο → status `error` χωρίς να σταματά τους άλλους. Χρονικό όριο ανά έλεγχο.

| Έλεγχος | full | light | Κρίσιμο όταν |
|---|---|---|---|
| **Προσωπικό** (Staff, StaffRole, RolePermission, AuditLog staff.*) — νέοι λογαριασμοί, αλλαγές ρόλων/δικαιωμάτων στις τελευταίες 24 ώρες· σύνολο super-admin | ✓ | ✓ | νέος λογαριασμός ή νέος super-admin / δικαίωμα `staff.*`/`settings.*` σε ρόλο |
| **Συνδέσεις διαχείρισης** (LoginEvent method=admin) — επιτυχίες από IP/χώρα που δεν έχει ξαναδεί ο χρήστης (ιστορικό 90 ημερών), αποτυχίες, blocked, αποτυχίες OTP, ώρες εκτός 07–23 | ✓ | ✓ | επιτυχία από νέα χώρα· > 20 αποτυχίες/ώρα για έναν λογαριασμό |
| **Αλλαγές ρυθμίσεων** (AuditLog) — analytics/pixels, email/Mailgun, πληρωμές, webhooks, SoftOne, couriers, ασφάλεια | ✓ | ✓ | αλλαγή σε analytics/pixels ή πληρωμές από λογαριασμό χωρίς προηγούμενη τέτοια ενέργεια |
| **Ένεση περιεχομένου** — όλα τα πεδία που αποδίδονται ως HTML (CmsDocument, banners/slides, σελίδες, μάρκες, Product/S1Item περιγραφές, κατηγορίες, newsletter, email templates): `<script`, `<iframe`, `javascript:`, `on\w+=`, `srcdoc`, `data:text/html`, `<form action` προς ξένο host, λέξεις ClickFix (powershell, mshta, «Windows Terminal», Win+R, «verify you are human»), spam (casino/pharma/crypto/loan/adult, ελληνικά+αγγλικά) | ✓ (όλα) | ✓ (αλλαγμένα τελευταία ώρα) | οποιοδήποτε script/iframe/javascript:/ClickFix |
| **Αρχεία Bunny** (LIST μόνο) — νέα `.html/.htm/.js/.php/.exe/.ps1/.zip`, `.svg` με `<script`/`on*=` | ✓ | — | εκτελέσιμο/HTML/SVG με script |
| **Το site όπως το βλέπει ο επισκέπτης** (μέσω δημόσιου URL / Cloudflare): `/`, `/admin/login`, 1 κατηγορία, 1 προϊόν, `/cart`. Κάθε `<script src>` πρέπει να είναι αρχείο `/_next/static` που **υπάρχει στο build του server** (σύγκριση με `.next/static` στον δίσκο) ή host της λίστας επιτρεπτών· κανένα inline script χωρίς το nonce· κανένα `<iframe>` εκτός λίστας· λέξεις ClickFix· headers (CSP με nonce χωρίς `unsafe-inline`, HSTS, nosniff, X-Frame-Options, frame-ancestors) | ✓ | ✓ (`/`, `/admin/login`) | άγνωστο script/iframe/ClickFix· CSP λείπει ή χαλαρώνει |
| **Πιστοποιητικό** — λήξη, εκδότης | ✓ | — | < 7 ημέρες (warn < 21) |
| **Βιβλιοθήκες** — εκδόσεις από `package-lock.json` του build → OSV `querybatch` (επίσημη δωρεάν βάση)· μόνο production dependencies | ✓ | — | ευπάθεια Critical (warn: High) |

Λίστα επιτρεπτών hosts και κανόνες: ένα σημείο (`lib/security/audit/policy.ts`), κοινό με τον εξωτερικό φύλακα (ο φύλακας διαβάζει το ίδιο αρχείο από το repo).

**Αποθήκευση:** νέος πίνακας `SecurityReport { id, mode, startedAt, finishedAt, status, checks Json, alerted Boolean }` (προσθετικό SQL, ποτέ db push). Διατήρηση 180 ημερών.

**Ειδοποιήσεις:**
- full → email σύνοψης κάθε πρωί (ΟΚ ή όχι: το «όλα καλά» είναι κι αυτό τεκμήριο) με σύνδεσμο στη σελίδα.
- light/full με νέο Κρίσιμο → email αμέσως· ίδιο εύρημα (ίδιο fingerprint) δεν ξαναστέλνεται για 24 ώρες.
- Αποστολή μέσω του υπάρχοντος `sendMail` (Mailgun). Παραλήπτες: ρύθμιση `securityReportEmails` (προεπιλογή gkozyris@i4ria.com).
- Τα emails δεν περιέχουν μυστικά· IP προσωπικού επιτρέπονται (εσωτερικό report), στοιχεία πελατών μόνο ως πλήθη.

## 2. Εξωτερικός φύλακας (GitHub Actions)

`.github/workflows/security-watch.yml` στο `cloudzeus/electornet-ai`: daily 07:30 Europe/Athens + hourly light + `workflow_dispatch`. Τρέχει `scripts/security-watch.ts` (μόνο `fetch`, `node:tls`, `node:dns`· χωρίς πρόσβαση σε βάση).

- Σάρωση: robots, sitemap (πλήθος, URLs εκτός μοτίβων), δείγμα σελίδων (αρχική, admin login, 10 κατηγορίες, 20 προϊόντα — εναλλάσσονται ανά ημέρα), όλα τα JS chunks που αναφέρονται: ίδιοι κανόνες με το `policy.ts` + εύρεση άγνωστων domains και συγκάλυψης (μεγάλα base64, `eval`/`new Function` με δυναμικό string) μέσα στα chunks.
- Cloaking: κάθε σελίδα και με mobile UA και Referer Google — διαφορετικό σύνολο scripts → Κρίσιμο.
- Headers, πιστοποιητικό, DNS (A/AAAA/CNAME/MX/TXT SPF/DMARC/CAA/NS του `euronics.dgsoft.gr` και `dgsoft.gr`) σε σύγκριση με αποθηκευμένη εικόνα στο repo (`security/dns-baseline.json`, αλλάζει μόνο με commit)· νέα πιστοποιητικά `*.dgsoft.gr` στο crt.sh τελευταίων 2 ημερών.
- **Dead man's switch:** `GET /api/security/heartbeat` υπογεγραμμένο (HMAC-SHA256 με `SECURITY_WATCH_SECRET`, χρονοσφραγίδα ±5′) → επιστρέφει id/ώρα/status του τελευταίου full report. Λείπει report της ημέρας ή εσωτερικό «ΟΚ» ενώ ο φύλακας βρίσκει Κρίσιμο → Κρίσιμο.
- Ακεραιότητα κώδικα: αν ο έλεγχος περιστατικού επιβεβαιώσει αναπαραγώγιμο build, ο φύλακας κάνει build το commit του `master` και συγκρίνει hash των chunks που σερβίρονται· αλλιώς αυτό το βήμα παραλείπεται (σημειώνεται στο report).
- Email απευθείας μέσω Mailgun API (ίδια μορφή σύνοψης), στον ίδιο παραλήπτη. GitHub Secrets (τα βάζει ο χρήστης): `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `SECURITY_WATCH_SECRET`, `SECURITY_REPORT_TO`.
- Το αποτέλεσμα μένει και ως artifact του run (30 ημέρες).

## 3. Σελίδα «Ασφάλεια» (`/admin/asfaleia`)
- Σήμερα: κάρτα κατάστασης (πράσινο/κίτρινο/κόκκινο), ώρα τελευταίου full και light, τελευταίο σήμα του εξωτερικού φύλακα (από τα heartbeat calls).
- Ιστορικό 90 ημερών (λωρίδα ανά ημέρα) → λεπτομέρειες report: κάθε έλεγχος, ευρήματα με τεκμήρια.
- «Τρέξε τώρα» (full), «Αποστολή report τώρα».
- Ενότητα «Τι ελέγχεται και γιατί» σε απλά ελληνικά — για τον auditor.
- Δικαίωμα νέο `security.read` (προβολή) και `security.run` (εκτέλεση)· ο super-admin τα έχει.
- Κανόνες UI του project: χωρίς style attributes (CSP), `var(--fs-…)`, 360px χωρίς οριζόντια κύλιση, `data-help` + οδηγός στη βοήθεια· η σελίδα **δεν φωτογραφίζεται** (περιέχει IP προσωπικού — λίστα PII του help-shots).

## 4. Εκτός πεδίου
Αυτόματες ενέργειες· έλεγχος λογαριασμού Cloudflare από μέσα (χρειάζεται API token μόνο ανάγνωσης — προστίθεται ως έλεγχος αν δοθεί)· port scan του server· έλεγχος των άλλων projects της κοινής βάσης.

## Σφάλματα & όρια
- Χρονικό όριο full ≤ 5′, light ≤ 60″· fetch με timeout 15″ και 2 επαναλήψεις.
- Αποτυχία email → καταγράφεται στο report (`alerted=false`) και ξαναδοκιμάζεται στο επόμενο light.
- OSV / crt.sh μη διαθέσιμα → `error` για τον έλεγχο, όχι Κρίσιμο.

## Δοκιμές
- Unit (node:test) για κάθε καθαρό κανόνα: ανίχνευση ένεσης (θετικά/αρνητικά δείγματα, ελληνικά spam), ανάλυση HTML για scripts/nonce/iframes, σύγκριση με λίστα επιτρεπτών, νέες IP/χώρες ανά χρήστη, fingerprint/dedupe ειδοποιήσεων, υπογραφή heartbeat, σύγκριση DNS baseline.
- Εκτέλεση full στο dev απέναντι στο live site (αναγνώσεις) και ένα δοκιμαστικό email μόνο στο gkozyris@i4ria.com.
- Ο φύλακας τρέχει τοπικά με `tsx` πριν μπει στο Actions.
