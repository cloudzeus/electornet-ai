# Καθημερινό security audit report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Καθημερινός (και ωριαίος ελαφρύς) έλεγχος ασφαλείας μέσα στην εφαρμογή, ανεξάρτητος εξωτερικός φύλακας σε GitHub Actions, email στο gkozyris@i4ria.com και σελίδα «Ασφάλεια» με ιστορικό.

**Architecture:** Καθαροί κανόνες (`lib/security/audit/policy.ts`, `rules.ts`) κοινοί για εφαρμογή και φύλακα. Κάθε έλεγχος είναι ανεξάρτητη μονάδα `Check` σε `lib/security/audit/checks/`· ο runner τους τρέχει με χρονικό όριο, αποθηκεύει `SecurityReport` και στέλνει email. Ο φύλακας (`scripts/security-watch.ts`) δεν αγγίζει βάση: σαρώνει το site απ' έξω, ελέγχει DNS/πιστοποιητικά και το υπογεγραμμένο heartbeat.

**Tech Stack:** Next.js 16 route handlers, Prisma (Postgres κοινός με live), node:test, `node:tls`/`node:dns`, OSV API, crt.sh, Mailgun, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-20-security-audit-report-design.md`

## Global Constraints
- Σχήμα μόνο με idempotent SQL μέσω `DIRECT_URL` (μοτίβο `scripts/apply-sets.ts`)· ποτέ `db push` / seed.
- Οι έλεγχοι είναι **μόνο αναγνώσεις** (βάση SELECT, Bunny LIST/GET, HTTP GET)· καμία αυτόματη ενέργεια.
- Status ελέγχου: `"ok" | "warn" | "critical" | "error"`· σφάλμα σε έλεγχο δεν σταματά τους άλλους· όριο full ≤ 5′, light ≤ 60″, fetch timeout 15″ με 2 επαναλήψεις.
- Παραλήπτες: ρύθμιση `securityReportEmails` (προεπιλογή `gkozyris@i4ria.com`)· email χωρίς μυστικά· IP προσωπικού επιτρέπονται· στοιχεία πελατών μόνο ως πλήθη.
- Κρίσιμο → email αμέσως· ίδιο fingerprint όχι ξανά για 24 ώρες· full → email σύνοψης κάθε πρωί και όταν όλα είναι ΟΚ.
- Cron: `GET /api/cron/security-audit?mode=full|light` με `Authorization: Bearer $CRON_SECRET`· full 07:00, light κάθε ώρα (Europe/Athens).
- Heartbeat: HMAC-SHA256 με `SECURITY_WATCH_SECRET`, χρονοσφραγίδα ±5 λεπτά.
- Διατήρηση `SecurityReport` 180 ημέρες· ιστορικό σελίδας 90 ημέρες.
- Δικαιώματα `security.read`, `security.run`· σελίδα `/admin/asfaleia` μέσα στη λίστα PII του `scripts/help-shots.ts`.
- UI: κανένα `style={{…}}` (CSP — `sx()`), `var(--fs-…)`, `min-h-11 md:min-h-9`, χωρίς οριζόντια κύλιση από 360px, `data-help` κυριολεκτικά + οδηγός στο `lib/help/content/index.ts` + `npm run help:gen`.
- Δοκιμαστικά emails μόνο στο gkozyris@i4ria.com.

## Review Focus
- Cloudflare challenge ή 5xx όταν ο έλεγχος «site όπως ο επισκέπτης» ζητά σελίδα → `error` με εξήγηση, όχι ψευδές Κρίσιμο — test στο Task 2 (`classifyPage`).
- Νόμιμο περιεχόμενο με λέξεις όπως «επαλήθευση»/«verification» ή YouTube iframe σε CMS → όχι Κρίσιμο — test στο Task 2 (`scanContent`).
- Το ίδιο Κρίσιμο κάθε ώρα → ένα email ανά 24 ώρες — test στο Task 5 (`alertsToSend`).
- Δεκάδες χιλιάδες προϊόντα στη σάρωση περιεχομένου → σε παρτίδες με cursor μέσα στο όριο χρόνου· light μόνο όσα άλλαξαν την τελευταία ώρα — έλεγχος στο Task 3.
- Heartbeat με παλιά χρονοσφραγίδα / λάθος υπογραφή → 401 — test στο Task 5 (`verifyHeartbeat`).

---

### Task 1: Σχήμα, δικαιώματα, ρύθμιση
**Files:** Modify `prisma/schema.prisma`, `lib/rbac/permissions.ts`, `lib/settings/schema.ts` · Create `scripts/apply-security-audit.ts`
**Produces:** μοντέλο `SecurityReport { id String @id @default(cuid()); mode String; startedAt DateTime @default(now()); finishedAt DateTime?; status String; checks Json; alerted Boolean @default(false); @@index([startedAt]) }`· νέος πίνακας `SecurityAlert { fingerprint String @id; lastSentAt DateTime; count Int @default(1) }` για το 24ωρο dedupe· δικαιώματα `security.read` («Προβολή αναφορών ασφαλείας»), `security.run` («Εκτέλεση ελέγχου ασφαλείας») στο group `settings`, ανατεθειμένα στον ρόλο super-admin από το script· ρύθμιση `securityReportEmails` (textarea, λίστα emails χωρισμένη με κόμμα/γραμμή, προεπιλογή `gkozyris@i4ria.com`) σε νέα ενότητα «Ασφάλεια» των Ρυθμίσεων.
- [ ] Μοντέλα + SQL `CREATE TABLE/INDEX IF NOT EXISTS` + `INSERT … ON CONFLICT DO NOTHING` για δικαιώματα και ανάθεση στον super-admin (δύο εκτελέσεις χωρίς σφάλμα) · `npx prisma generate` · `npx tsc --noEmit` · commit.

### Task 2: Καθαροί κανόνες
**Files:** Create `lib/security/audit/policy.ts`, `lib/security/audit/rules.ts`, test `lib/security/audit/rules.test.ts`
**Produces:**
- `policy.ts`: `ALLOWED_SCRIPT_HOSTS` (googletagmanager.com, google-analytics.com, clarity.ms, connect.facebook.net, analytics.tiktok.com, static.hotjar.com — μόνο όταν ρυθμισμένα), `ALLOWED_FRAME_HOSTS` (youtube.com, youtube-nocookie.com, player.vimeo.com, googletagmanager.com, td.doubleclick.net), `CLICKFIX_MARKERS`, `SPAM_MARKERS` (ελληνικά + αγγλικά: casino/καζίνο, viagra, crypto, δάνεια/loan, adult…), `REQUIRED_HEADERS`.
- `type Severity = "ok" | "warn" | "critical" | "error"`; `type Finding = { severity: Exclude<Severity,"ok">; title: string; detail: string; evidence?: string }`; `type CheckResult = { key: string; title: string; status: Severity; summary: string; findings: Finding[]; ms: number }`.
- `parseScripts(html: string): { scripts: { src: string | null; host: string | null; inline: boolean; nonce: string | null }[]; iframes: string[] }` (χωρίς DOM βιβλιοθήκη· regex σε tags).
- `classifyPage(status: number, headers: Record<string,string>, html: string): "page" | "challenge" | "error"` (Cloudflare challenge: `cf-mitigated: challenge` ή title «Just a moment…» από `server: cloudflare` με 403/503).
- `scanPage(html: string, ctx: { origin: string; buildChunks: Set<string> | null; allowedScriptHosts: string[] }): Finding[]` — άγνωστο script host / `/_next/static` αρχείο εκτός build / inline script χωρίς nonce / iframe εκτός λίστας / CLICKFIX marker → critical.
- `checkHeaders(headers: Record<string,string>): Finding[]` — CSP λείπει ή περιέχει `'unsafe-inline'` σε script-src/style-src → critical· λείπει HSTS/nosniff/frame-ancestors → warn.
- `scanContent(text: string): Finding[]` — `<script`, `javascript:`, `on\w+=`, `srcdoc`, `data:text/html`, CLICKFIX → critical· `<iframe` εκτός `ALLOWED_FRAME_HOSTS`, `<form action` προς ξένο host → critical· SPAM → warn.
- `newOrigins(history: { staffId: string; ip: string | null; country: string | null; at: Date }[], recent: typeof history): { staffId: string; ip: string | null; country: string | null; newCountry: boolean }[]`.
- `fingerprint(checkKey: string, f: Finding): string` (sha256 του key+title+evidence).
- `worst(statuses: Severity[]): Severity` (critical > error > warn > ok).
- [ ] Tests (RED): `parseScripts` βρίσκει src/inline/nonce/iframe· `scanPage`: δικό μας chunk που υπάρχει στο build → καμία· chunk εκτός build → critical· `https://evil.example/x.js` → critical· inline χωρίς nonce → critical· σελίδα με «Windows Terminal» + «Win+R» → critical· `classifyPage(403, {server:"cloudflare","cf-mitigated":"challenge"}, "<title>Just a moment...</title>")` → "challenge"· `scanContent` με YouTube iframe και τη λέξη «επαλήθευση στοιχείων» → []· `<img onerror=alert(1)>` → critical· «καζίνο» → warn· `checkHeaders` με CSP `script-src 'self' 'unsafe-inline'` → critical· `newOrigins`: ίδια IP → καμία, νέα χώρα → newCountry true· `worst(["ok","warn","error"])` → "error".
- [ ] GREEN · `npm test` · commit.

### Task 3: Έλεγχοι βάσης και Bunny + runner
**Files:** Create `lib/security/audit/types.ts` (`Check = { key; title; modes: ("full"|"light")[]; timeoutMs: number; run(ctx: AuditCtx): Promise<Omit<CheckResult,"key"|"title"|"ms">> }`, `AuditCtx = { mode: "full"|"light"; since: Date; now: Date }`), `lib/security/audit/checks/staff.ts`, `logins.ts`, `settings-changes.ts`, `content.ts`, `bunny.ts`, `lib/security/audit/run.ts` (server-only)
**Consumes:** Task 2. **Produces:** `runAudit(mode: "full"|"light", opts?: { only?: string[] }): Promise<{ reportId: string; status: Severity; results: CheckResult[] }>` — τρέχει τους ελέγχους του mode παράλληλα με `Promise.race` timeout ανά έλεγχο (timeout → status error), αποθηκεύει `SecurityReport`, σβήνει reports > 180 ημερών.
- `since` = full: τελευταίες 24 ώρες· light: τελευταία ώρα.
- staff: Staff/StaffRole/RolePermission + AuditLog `action LIKE 'staff.%' OR 'role.%'`· Κρίσιμο: νέος λογαριασμός, νέος super-admin, νέο δικαίωμα `staff.*`/`settings.*` σε ρόλο.
- logins: LoginEvent `method='admin'` (ιστορικό 90 ημερών για `newOrigins`)· Κρίσιμο: επιτυχία από νέα χώρα, > 20 αποτυχίες/ώρα για έναν λογαριασμό· warn: νέα IP, σύνδεση 23:00–07:00.
- settings-changes: AuditLog σε ρυθμίσεις (analytics/pixels, email, πληρωμές, webhooks, SoftOne, couriers, ασφάλεια)· Κρίσιμο: analytics/pixels ή πληρωμές από λογαριασμό χωρίς προηγούμενη τέτοια ενέργεια στις 90 ημέρες.
- content: όλα τα πεδία που αποδίδονται ως HTML (CmsDocument data/draft, banners/slides, σελίδες, μάρκες, Product και S1Item περιγραφές/longDesc, κατηγορίες, newsletter, email templates) με `scanContent`· full: όλα σε παρτίδες των 1.000 με cursor id· light: `updatedAt >= since`.
- bunny: LIST του storage (μέσω `getBunny` από `lib/media/cdn.ts`) αναδρομικά με όριο 20.000 αντικειμένων· Κρίσιμο: `.html/.htm/.js/.php/.exe/.ps1/.zip` ή `.svg` με `<script`/`on*=` (GET μόνο για svg < 1 MB).
- [ ] Unit tests για τις καθαρές συναρτήσεις που εξάγει κάθε έλεγχος (π.χ. `classifyStaffChanges`, `classifyLogins`, `settingsSensitive(action)`), RED → GREEN.
- [ ] Script ανάγνωσης: `runAudit("full", { only: ["staff","logins","settings-changes","content","bunny"] })` στο dev πάνω στη live βάση → διάρκεια, status ανά έλεγχο· σβήσιμο του report που δημιουργήθηκε · commit.

### Task 4: Site όπως ο επισκέπτης, πιστοποιητικό, βιβλιοθήκες
**Files:** Create `lib/security/audit/checks/site.ts`, `cert.ts`, `deps.ts`, `lib/security/audit/osv.ts` (καθαρό), test `lib/security/audit/osv.test.ts` · Modify `lib/security/audit/run.ts` (εγγραφή ελέγχων)
**Consumes:** Task 2–3.
- site: βάση URL από ρύθμιση/`NEXT_PUBLIC_SITE_URL`· full: `/`, `/admin/login`, 1 κατηγορία, 1 προϊόν (τυχαία ενεργά από τη βάση), `/cart`· light: `/`, `/admin/login`. `buildChunks` = αρχεία του `.next/static/chunks` στον δίσκο (αν λείπει ο φάκελος → null και warn «δεν βρέθηκε το build»). `classifyPage` → challenge/error = status error. Allowed script hosts μόνο όσων υπάρχουν IDs στις ρυθμίσεις Analytics.
- cert: `tls.connect` στο host:443 → `valid_to`· < 7 ημέρες critical, < 21 warn.
- deps: `parseLock(lockJson): { name: string; version: string }[]` (μόνο μη-dev από `packages`), `toOsvQueries`, `mapOsv(results): Finding[]` (CVSS/`database_specific.severity`: CRITICAL → critical, HIGH → warn)· POST `https://api.osv.dev/v1/querybatch` σε παρτίδες 1.000.
- [ ] Tests (RED → GREEN): `parseLock` αγνοεί dev και root· `mapOsv` με δείγμα απάντησης CRITICAL/HIGH/LOW.
- [ ] Script ανάγνωσης: `runAudit("full", { only: ["site","cert","deps"] })` απέναντι στο live → αποτελέσματα στο report της εργασίας· σβήσιμο του report · commit.

### Task 5: Ειδοποιήσεις, cron, heartbeat
**Files:** Create `lib/security/audit/notify.ts` (server-only), `lib/security/audit/notify-core.ts` (καθαρό), test `lib/security/audit/notify-core.test.ts`, `lib/security/audit/heartbeat.ts` (καθαρό), test `heartbeat.test.ts`, `app/api/cron/security-audit/route.ts`, `app/api/security/heartbeat/route.ts`
**Consumes:** `runAudit`, `fingerprint`, `sendMail({ to, subject, html, text, template, meta })` από `lib/email/send.ts`, `SecurityAlert`.
**Produces:**
- `alertsToSend(findings: { checkKey: string; f: Finding }[], sent: Map<string, Date>, now: Date): { checkKey: string; f: Finding; fp: string }[]` — μόνο critical, όχι αν σταλμένο < 24 ώρες.
- `renderSummary(report: { status; results: CheckResult[]; startedAt: Date; mode }, link: string): { subject: string; html: string; text: string }` — θέμα «[Euronics] Έλεγχος ασφαλείας ΗΗ/ΜΜ: ΟΚ | Προειδοποιήσεις | ΚΡΙΣΙΜΟ»· ανά έλεγχο γραμμή status + ευρήματα· inline styles επιτρέπονται στο email (δεν περνά από CSP).
- `signHeartbeat(secret: string, ts: number): string`, `verifyHeartbeat(secret: string, ts: number, sig: string, now: number): boolean` (±300″, `timingSafeEqual`).
- cron route: Bearer `CRON_SECRET` (μοτίβο `app/api/cron/softone-catalog/route.ts`)· `runAudit(mode)` → full: email σύνοψης· κάθε mode: `alertsToSend` → ένα email «ΚΡΙΣΙΜΟ» με όλα τα νέα, upsert `SecurityAlert`· αποτυχία email → `alerted=false`, νέα προσπάθεια στο επόμενο light. `maxDuration = 300`.
- heartbeat route: `GET ?ts=&sig=` → 401 αν δεν ταιριάζει· αλλιώς `{ lastFull: { id, startedAt, status } | null, lastLight: {…} | null }`· καταγράφει την ώρα του τελευταίου επιτυχημένου heartbeat σε AuditLog `security.watch.ping` (για τη σελίδα).
- [ ] Tests (RED): `alertsToSend` ίδιο fp σταλμένο πριν 3 ώρες → όχι, πριν 25 ώρες → ναι, warn → ποτέ· `verifyHeartbeat` σωστό → true, ts −301″ → false, λάθος sig → false· `renderSummary` όλα ΟΚ → θέμα με «ΟΚ» και λίστα ελέγχων.
- [ ] GREEN · τοπικά: `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3111/api/cron/security-audit?mode=full` με `securityReportEmails=gkozyris@i4ria.com` → ένα email · commit.

### Task 6: Εξωτερικός φύλακας
**Files:** Create `scripts/security-watch.ts`, `scripts/security-watch-core.ts` (καθαρό), test `lib/security/audit/watch-core.test.ts` (εισάγει το core), `security/dns-baseline.json`, `.github/workflows/security-watch.yml`, `docs/security-audit.md` (οδηγίες: Coolify scheduled tasks, GitHub Secrets)
**Consumes:** `policy.ts`, `rules.ts` (`parseScripts`, `scanPage` με `buildChunks=null`, `checkHeaders`, `classifyPage`), `signHeartbeat`.
**Produces (core):** `diffDns(baseline: Record<string,string[]>, current: Record<string,string[]>): Finding[]` (αλλαγή A/AAAA/CNAME/NS/MX → critical, TXT/CAA → warn)· `cloakingDiff(a: string[], b: string[]): Finding[]` (διαφορετικό σύνολο script hosts/srcs μεταξύ UA → critical)· `scanChunk(js: string): Finding[]` (CLICKFIX, `eval(`/`new Function(` με μη-σταθερό όρισμα, base64 > 20 KB, domains εκτός policy → warn/critical)· `heartbeatVerdict(hb, now, internalStatus, watchStatus): Finding[]` (κανένα full σήμερα μετά τις 08:00 → critical· εσωτερικό ok ενώ φύλακας critical → critical).
- script: robots + sitemap (πλήθος, URLs εκτός μοτίβων `/p/`, `/k/`, `/m/`, `/s/`, …), δείγμα (αρχική, admin login, 10 κατηγορίες, 20 προϊόντα — επιλογή με seed την ημερομηνία), όλα τα chunks, cloaking (Windows Chrome vs mobile + Referer Google), headers, πιστοποιητικό, DNS (`node:dns/promises`) vs baseline, crt.sh `%.dgsoft.gr` τελευταίων 2 ημερών, heartbeat. Ακεραιότητα κώδικα (build του master και σύγκριση hash των chunks) **δεν** μπαίνει εδώ: γράφεται στο report «παραλείπεται — εκκρεμεί επιβεβαίωση αναπαραγώγιμου build» μέχρι να το επιβεβαιώσει ο έλεγχος περιστατικού. Έξοδος: JSON (artifact) + email μέσω Mailgun REST (`MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, EU region, `SECURITY_REPORT_TO`) — full: σύνοψη κάθε μέρα· light: μόνο σε critical. `--mode=full|light`, `--dry` (χωρίς email).
- workflow: `schedule` `30 4 * * *` (07:30 Αθήνα, UTC+3) full + `5 * * * *` light, `workflow_dispatch`· Node 22, `npm ci` και `npx tsx scripts/security-watch.ts` (το script εισάγει μόνο τα καθαρά αρχεία policy/rules/heartbeat και node built-ins)· `permissions: contents: read`· upload artifact 30 ημέρες.
- [ ] Tests (RED → GREEN) για `diffDns`, `cloakingDiff`, `scanChunk`, `heartbeatVerdict`.
- [ ] `security/dns-baseline.json` από τις τρέχουσες τιμές (dig) · τοπικά `npx tsx scripts/security-watch.ts --mode=full --dry` απέναντι στο live → έξοδος στο report της εργασίας · commit.

### Task 7: Σελίδα «Ασφάλεια» και βοήθεια
**Files:** Create `app/admin/(shell)/asfaleia/page.tsx`, `app/admin/(shell)/asfaleia/[id]/page.tsx`, `app/admin/(shell)/asfaleia/actions.ts`, `components/admin/security/*` · Modify `components/admin/nav.ts`, `scripts/help-shots.ts` (PII: `/admin/asfaleia`), `lib/help/content/index.ts`
**Consumes:** `SecurityReport`, `runAudit`, `renderSummary`/notify (για «Αποστολή report τώρα»), δικαιώματα Task 1.
- Σήμερα: κάρτα κατάστασης, τελευταίο full και light, τελευταίο heartbeat του φύλακα (AuditLog `security.watch.ping`· > 26 ώρες → κόκκινο «Ο εξωτερικός φύλακας σιώπησε»).
- Ιστορικό 90 ημερών (λωρίδα ημερών, χρώμα του χειρότερου report της μέρας) → `/admin/asfaleia/[id]`: κάθε έλεγχος με status, σύνοψη, ευρήματα, τεκμήρια.
- «Τρέξε τώρα» (`security.run`, full, με πρόοδο/αναμονή) και «Αποστολή report τώρα».
- «Τι ελέγχεται και γιατί»: ένα στοιχείο ανά έλεγχο σε απλά ελληνικά (+ ο εξωτερικός φύλακας).
- Προστασία: `requirePermission("security.read")`, actions `security.run`.
- [ ] Υλοποίηση με ui-ux-pro-max · οδηγός βοήθειας + `data-help` · `npm run help:gen` χωρίς κενά · `tsc`, `eslint`, `npm test` · έλεγχος στον browser (υπολογιστής + 375px) αν υπάρχει συνεδρία· αλλιώς σημείωση · commit.
