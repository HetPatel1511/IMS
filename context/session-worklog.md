# Work Log — 2026-10-19 session

A large UX/functional pass over the web app, driven by two planning docs at the repo
root. Those docs are the detailed record; this is the index.

- **`steps-to-improve.md`** — round 1 audit + plan; every item (#1–#14, #8A) implemented
  and verified. Status note at the top lists each item's state.
- **`steps-to-improve-2.md`** — follow-ups; most implemented, remaining items flagged
  "still open" at the top with reasons.

## What was built (web, `apps/web`)
- **UX primitives:** toast notifications (`shared/toast.tsx`), custom confirm dialog
  (`shared/confirm.tsx`, replaces all native `confirm()`), loading skeletons
  (`shared/Skeleton.tsx`), app-wide number/locale/currency (`shared/format.ts`).
- **Auth:** in-memory access token, 401→`/auth/refresh`→retry, session bootstrap on load;
  login form cleaned up (`shared/api.ts`, `shared/auth.tsx`, `LoginPage`).
- **Readable errors:** typed `ApiRequestError` + `toErrorMessage()` turning validation
  `details[]` into field-level messages; failed queries surface via a `QueryCache` toast.
- **Schema builder (`InventoryTypesPage`):** per-field config — options editor, defaults,
  validation (min/max/maxLength/pattern), file accept + max size, currency symbol,
  relationship target type; field edit/delete/reorder; inventory-type edit/delete.
- **Dynamic form (`DynamicForm`):** real controls for all 21 field types (radio group,
  chip multi-select, tel, currency, file/image upload, qr/barcode, relationship picker),
  descriptions + validation attrs.
- **Items (`ItemsPage`/`DynamicTable`):** Add-Item modal, debounced search, pagination,
  column sort, delete, CSV export (paginates all matches).
- **Parties / Settings / Dashboard / Stock:** full CRUD for suppliers/buyers; settings
  readable table (no raw JSON); actionable dashboard (links, low-stock alert, bar chart);
  stock valuation column + URL-persisted filters.
- **Role-aware UI:** write actions hidden for non-ADMIN (`hasMinRole`).

## Backend changes (`apps/api`, `packages/shared`)
- `dynamic-fields.service.create` now catches Prisma P2002 → **409** (was a 500 on a
  duplicate field key).
- `@ims/shared` `buildAttributesSchema` applies field `defaultValue` and defaults missing
  BOOLEAN/CHECKBOX to `false`; covered by `dynamic-validation.test.ts`.

## Artifacts added
- `docs/db-schema.html` — interactive ER diagram (see schema.md).
- `steps-to-improve.md`, `steps-to-improve-2.md` — the plans/records.
- `context/` — this folder.

## Verification done
In-browser (headless Chrome driving the running app) across all routes + targeted
feature checks; API checks via PowerShell; `tsc`, `vite build`, `nest build`, and the
shared test suite all pass. Test data created during checks was cleaned up.
