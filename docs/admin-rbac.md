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
- Demo `admin@euronics.gr / admin1234` (role admin) for presentations.

## Audit
`audit(staffId, action, entity, entityId, before, after)` → `AuditLog`; viewer at **/admin/audit** (filter by entity, 50/page).

## Settings & integrations (super-admin only)
`/admin/settings` — schema-first: `lib/settings/schema.ts` defines sections/fields; the UI, validation, encryption and storefront readers derive from it.
Sections: Γενικά · Social προφίλ · Social login (Google/Microsoft/Facebook/Apple) · Analytics & pixels (GA4, GTM, Ads, Meta, TikTok, Clarity, Hotjar, GSC, Consent Mode) · **SoftOne ERP** (s1services) · Πληρωμές (Viva/EveryPay/Cardlink/Stripe, Apple/Google/Revolut Pay, COD, τράπεζα, δόσεις) · Αποστολές & courier · **Bunny CDN** (storage zone, pull zone, optimizer, token auth) · Email & SMS · AI & υπηρεσίες (Anthropic key/model/budget, geo, maps, search) · API keys.
- Storage: `Setting` row per section; `data` plain JSON, `secrets` AES-256-GCM (`SETTINGS_KEY` or `AUTH_SECRET`). Secrets never return to the browser (masked, «Αλλαγή / Διαγραφή»).
- `getPublicSettings()` exposes only `public` fields to the storefront: footer socials, analytics IDs (`components/site/Analytics.tsx`, consent-gated), payment/shipping toggles.
- «Δοκιμή σύνδεσης»: SoftOne (login → authenticate → getSystemParams), Bunny (storage list + pull zone), Anthropic (models), SMTP (socket).
- `lib/softone.ts`: official services only, two-step auth, daily session cached in `Setting("softone.session")`, Windows-1253 decoding, re-auth on -100/-101.
- `lib/media/cdn.ts`: `cdnUrl()`, `uploadToStorage()`, `purge()` driven by the Bunny section.
- API keys: sha256 hash stored, plain key shown once, scopes, revoke/enable.
