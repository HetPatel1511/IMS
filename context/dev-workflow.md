# Dev Workflow & Gotchas

## Run
```
pnpm dev            # runs api + web in parallel (ports 3000 / 5173)
pnpm dev:api        # api only
pnpm dev:web        # web only
```
Login: `admin@ims.local` / `Admin123!` (seeded SUPER_ADMIN).

## Build / typecheck / test
```
pnpm --filter @ims/web build        # tsc -b && vite build
pnpm --filter @ims/web lint         # tsc -b --noEmit (typecheck)
pnpm --filter @ims/api build        # nest build
pnpm --filter @ims/shared test      # tsx assertion script (dynamic-validation)
```

## Database
```
pnpm --filter @ims/api exec prisma migrate dev --name <name>
pnpm --filter @ims/api exec prisma migrate status
pnpm db:seed
```
Prisma schema: `apps/api/prisma/schema.prisma` (the source of truth).

## Gotchas (these cost real time)
1. **No Docker on this machine.** The README's `docker compose up` doesn't apply here.
   Postgres 16 is a native install; Redis/MinIO are usually not running. That's fine —
   the API tolerates Redis/MinIO being down (best-effort cache; uploads just fail).
2. **Changing `packages/shared` requires a rebuild AND an API restart.** The API loads
   `@ims/shared` from its built `dist`, and `nest start --watch` does **not** pick up a
   dist change. After editing shared: `pnpm --filter @ims/shared build`, then restart
   `pnpm dev` (kill the api process). Symptom if you forget: your shared change "doesn't
   take" even though the unit test passes.
3. **Prisma unique violations → 500 unless caught.** Wrap creates/updates and map
   `PrismaClientKnownRequestError` code `P2002` to `ConflictError` (409). This bit the
   `field_definitions` create (duplicate key) — fixed, but the pattern recurs.
4. **Required CHECKBOX fields:** a checkbox only emits a value when toggled. The web
   form seeds missing booleans to `false`, and `@ims/shared` `buildAttributesSchema`
   also defaults missing BOOLEAN/CHECKBOX to `false` server-side — so both the UI and
   any API client (Swagger, scripts) satisfy a required boolean without echoing it.
5. **pageSize is capped at 100** (`PaginationQueryDto`). Anything that needs "all rows"
   (e.g. CSV export) must page through, not request a huge `pageSize`.
6. **Windows shell:** use PowerShell for shell work. To restart dev, stop the listeners
   on 3000/5173 (`Get-NetTCPConnection -LocalPort 3000` → `Stop-Process`) then `pnpm dev`.

## Seeing a change in the real app
A `run` skill / headless Chrome (playwright-core driving the installed Chrome) was used
to verify UI changes and screenshot pages. The API is also directly testable via
PowerShell `Invoke-WebRequest` against `/api/v1` with a bearer token from `/auth/login`.

## Git (this repo only — never global)
- Local identity set in `.git/config`: `user.name=HetPatel1511`,
  `user.email=hetpatel151103@gmail.com`.
- `origin` pins the username: `https://HetPatel1511@github.com/HetPatel1511/IMS.git`.
- **Push 403 seen** because the cached GitHub credential authenticates as a *different*
  account (`HetPatel-1511`) that lacks access to `HetPatel1511/IMS`. git name/email do
  not affect auth. Fix: authenticate as `HetPatel1511` (clear the `git:https://github.com`
  entry in Windows Credential Manager and re-login), **or** have the repo owner add the
  other account as a collaborator. Credential Manager is machine-wide — not git config.
