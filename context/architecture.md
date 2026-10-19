# Architecture

## Workspace (pnpm monorepo)
```
apps/api          NestJS API (ASP-style modules), Prisma ORM
apps/web          React admin SPA (Vite, TanStack Query, react-router)
packages/shared   @ims/shared — field-type enum + Zod attribute validation
database/schema.sql  reference DDL (Prisma is the source of truth)
docs/db-schema.html  interactive ER diagram of the schema
```
Package manager: **pnpm** (workspace). Node ≥ 20.

## The metadata-driven core (the whole point of the app)
1. **InventoryType** — a kind of thing (Raw Material, Finished Goods…).
2. **FieldDefinition** — a custom field on a type, with `fieldType` (one of 21),
   `validation` (JSON), `ui` (JSON), `defaultValue`, flags, and `options`
   (for DROPDOWN/RADIO/MULTI_SELECT) via **FieldOption**.
3. **InventoryItem** — belongs to a type; core columns (sku, name, quantity…) plus
   a JSON **`attributes`** bag whose shape is defined by that type's fields.

Validation of `attributes` is **shared** between contracts via `@ims/shared`
`validateAttributes(fields, attributes)` → builds a Zod schema from the field
definitions. The API calls it in `inventory-items.service`. The 21 field types live
in `packages/shared/src/field-types.ts`; the Zod mapping in `dynamic-validation.ts`.

## API layering & conventions
- Response envelope everywhere: `{ data, meta?, error? }`. Errors carry
  `{ code, message, details[], requestId }`.
- Domain errors in `common/errors/` map to HTTP (ConflictError→409, NotFound→404,
  ValidationFailedError→422/400). **If you throw a raw Prisma error it becomes a 500**
  — catch `P2002` and rethrow `ConflictError` (see inventory-items + dynamic-fields).
- Auth: JWT access token (15 min) in the `Authorization` header + an **httpOnly
  refresh cookie** (`/auth/refresh`). Roles: `SUPER_ADMIN > ADMIN > VIEWER`
  (`hasMinRole` in `@ims/shared`). Most writes require ADMIN.
- Soft deletes via `deletedAt`; most list queries filter `deletedAt: null`.
- PKs are `uuid`; money/qty are `Decimal(18,4)`; timestamps `timestamptz`.

## Web app
- `shared/api.ts` — fetch wrapper: in-memory access token, 401→refresh→retry,
  throws typed `ApiRequestError`; `toErrorMessage()` renders readable messages.
- `shared/auth.tsx` — session; bootstraps from the refresh cookie on load.
- `shared/toast.tsx`, `shared/confirm.tsx`, `shared/format.ts`, `shared/Skeleton.tsx`
  — app-wide UX primitives (notifications, custom dialogs, number/locale, skeletons).
- Feature folders under `features/` map 1:1 to API modules.

## External services (all optional locally)
- **PostgreSQL** — required. Native install on :5432 (db `ims`). Connection in `.env`.
- **Redis** — schema cache only; `RedisService` is `lazyConnect` + best-effort, so the
  API runs fine with Redis down (cache silently no-ops).
- **MinIO/S3** — file/image uploads (presigned PUT). Down locally ⇒ uploads fail but
  nothing else breaks.
