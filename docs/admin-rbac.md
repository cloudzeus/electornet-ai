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
