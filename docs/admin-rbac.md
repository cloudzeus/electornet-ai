# Back office — auth & RBAC

**Stack:** Auth.js v5 (credentials, JWT 12h) · Prisma 6 · PostgreSQL (`euronics` on the client server; `.env` → `DATABASE_URL`).

## Roles (seed `prisma/roles.ts`)
| key | name | starting permissions |
|---|---|---|
| `super-admin` | Super Admin | `*` — system role, not editable |
| `admin` | Admin | everything except `staff.roles.write`, `settings.integrations.write` |
| `manager` | Manager | orders, customers, stores, service, reports, promos, radar, staff.read, audit.read |
| `marketer` | Marketer | `cms.*`, `marketing.*`, promos, reports |
| `editor` | Editor | CMS content (zones, slides, menu, pages, news, copy, brand stores), product web fields — no publish |
| `employee` | Employee | orders read/write, customers read, stores + stock read, service tickets |
| `customer` | Customer | none (storefront account) — cannot sign in to /admin |

Roles other than `super-admin` are editable in **/admin/roles** (matrix, audit-logged). Re-running the seed resets them to the table above.

## Permissions
Catalogue in `lib/rbac/permissions.ts` (40 keys, `group.resource.action`). `can(granted, key)` supports `*` and `group.*`.
Add a key there → seed → it appears in the matrix.

## Guards
- `app/admin/(shell)/layout.tsx`: no session → `/admin/login`.
- `requirePermission("key")` in every page / server action → `/admin/forbidden?need=key`.
- Sidebar (`components/admin/nav.ts`) filters items by permission; `soon: true` marks modules not built yet.

## Accounts
- Super admin `gkozyris@i4ria.com` — password from `SEED_SUPERADMIN_PASSWORD` in `.env` (never in code), then `npx tsx prisma/seed.ts`.
- Κανένας λογαριασμός επίδειξης με σταθερό κωδικό. Οι χρήστες δημιουργούνται από τον super admin στο `/admin/staff`.

## Audit
`audit(staffId, action, entity, entityId, before, after)` → `AuditLog`; viewer at **/admin/audit** (filter by entity, 50/page).

## Settings & integrations (super-admin only)
`/admin/settings` — schema-first: `lib/settings/schema.ts` defines sections/fields; the UI, validation, encryption and storefront readers derive from it.
Sections: Γενικά · Social προφίλ · Social login (Google/Microsoft/Facebook/Apple) · Analytics & pixels (GA4, GTM, Ads, Meta, TikTok, Clarity, Hotjar, GSC, Consent Mode) · **SoftOne ERP** (s1services) · Πληρωμές (Viva/EveryPay/Cardlink/Stripe, Apple/Google/Revolut Pay, COD, τράπεζα, δόσεις) · Αποστολές & courier · **Bunny CDN** (storage zone, pull zone, optimizer, token auth) · Email & SMS · AI & υπηρεσίες (Anthropic key/model/budget, geo, maps, search) · API keys.
- Storage: `Setting` row per section; `data` plain JSON, `secrets` AES-256-GCM (`SETTINGS_KEY` or `AUTH_SECRET`). Secrets never return to the browser (masked, «Αλλαγή / Διαγραφή»).
- `getPublicSettings()` exposes only `public` fields to the storefront: footer socials, analytics IDs (`components/site/Analytics.tsx`, consent-gated), payment/shipping toggles.
- «Δοκιμή σύνδεσης»: SoftOne (login → authenticate → getSystemParams), Bunny (storage list + pull zone), Anthropic (models), SMTP (socket).
- `lib/softone.ts`: official services only, two-step auth, daily session cached in `Setting("softone.session")`, Windows-1253 decoding, re-auth on -100/-101. Settings need only **URL (or oncloud serial), App ID, username, password**; «Σύνδεση & ανάκτηση» runs step 1 (login) and offers company / branch / module / refid from the `objs` the ERP returns (`SoftoneObjsPicker`). Unset values default to the first combination at authenticate time.
- `lib/media/cdn.ts`: `cdnUrl()`, `uploadToStorage()`, `purge()` driven by the Bunny section.
- API keys: sha256 hash stored, plain key shown once, scopes, revoke/enable.

## AI (OpenRouter, one key)
Settings → «AI & υπηρεσίες»: a single **OpenRouter API key** serves every AI feature. `lib/ai/openrouter.ts` (`chat()`, OpenAI-compatible) + `lib/ai/tasks.ts`:
- **Δρομολόγηση**: «Αυτόματη» → `openrouter/auto` picks the model per prompt (task models + «Fallback μοντέλα» are sent as `models[]` fallbacks); «Ανά εργασία» → main / fast / vision model per task. Image prompts always start on the vision model. «Προτίμηση παρόχου» → `provider.sort` (price / throughput / latency).
- Features: Ερμής advisor (`/api/advisor`: rules pick candidates, the LLM writes the answer + per-product «why», same JSON; silent fallback), alt text / title / tags for media («Alt με AI» in the drawer, vision), product copy (`productCopy`), test call from the settings page.
- **Budget**: every call is logged in `AiUsage` (tokens, cost from OpenRouter); «Ημερήσιο όριο κόστους ($)» stops AI calls for the day (features fall back to rules). Dashboard tile «AI κόστος σήμερα».
- Env fallback for the key: `OPENROUTER_API_KEY`.

### AI pricing & cost report
- **Markup** (super-admin, Settings → «AI markup ανά μοντέλο»): % per model, plus `*` default for unlisted models (and whatever `openrouter/auto` picks). Snapshot per call: `AiUsage.markupPct`, `billedUsd = costUsd × (1 + markup)`, `fxRate` (USD→EUR of the day, ECB via frankfurter.app, cached in `FxRate`), `billedEur`. Changing markup affects future calls only.
- **Report** (`/admin/reports/ai`, `reports.read`): stat tiles, billed € per day (line), per feature per day (stacked bars), per model (ranked bars), daily table with FX. Admins see billed amounts; super-admins also see the raw OpenRouter cost and the effective markup. Periods 7/30/90 days.
- Charts: `components/admin/charts/Charts.tsx` (SVG, no library; legend for ≥2 series, hover tooltips, tabular numbers).
- Dashboard tile «AI κόστος σήμερα (€)» = billed € today.

## Σύνδεση σε δύο βήματα (OTP)
Κάθε σύνδεση στο `/admin` απαιτεί **δύο παράγοντες**:
1. Email + κωδικός στο `/admin/login`. Σωστός κωδικός ⇒ δημιουργείται `StaffLoginChallenge` και στέλνεται **6ψήφιος κωδικός μιας χρήσης** στο εταιρικό email. **Δεν** δημιουργείται συνεδρία σε αυτό το βήμα.
2. Ο κωδικός μιας χρήσης. Μόνο τότε εκδίδεται το JWT.

- Ισχύς 10 λεπτά, 5 λάθος προσπάθειες, 5 αιτήματα ανά 15 λεπτά ανά λογαριασμό.
- Ο κωδικός αποθηκεύεται **μόνο ως bcrypt hash** και το challenge καίγεται με τη χρήση του (καμία επαναχρησιμοποίηση).
- Το `challengeId` ταξιδεύει σε httpOnly cookie με scope `/admin` — ο κωδικός πρόσβασης δεν ξαναστέλνεται στο δεύτερο βήμα.
- Λάθος email και λάθος κωδικός δίνουν **το ίδιο** μήνυμα, ώστε η φόρμα να μην αποκαλύπτει ποιοι λογαριασμοί υπάρχουν.
- Καταγράφονται όλα στα `LoginEvent` με IP/OS/browser: `bad-password`, `otp-email-failed`, `otp-attempts`, και η επιτυχία ως `admin-otp`.

**Καμία παράκαμψη όταν αποτύχει το email**: δεύτερος παράγοντας που παρακάμπτεται δεν είναι δεύτερος παράγοντας. Αν δεν φεύγει email, κανείς δεν μπαίνει — γι' αυτό η αποστολή πρέπει να δουλεύει πριν το live.
