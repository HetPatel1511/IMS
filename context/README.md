# IMS — Project Context

Durable context for working on this repo, captured 2026-10-19. Read this first,
then the file you need. These are **notes**, not instructions — verify against the
code before relying on a detail.

## Index
- [architecture.md](architecture.md) — stack, workspace layout, how the pieces fit
- [dev-workflow.md](dev-workflow.md) — run / build / test, and the gotchas that bite
- [schema.md](schema.md) — the data model (and the interactive diagram)
- [session-worklog.md](session-worklog.md) — what was changed and why, with pointers

## 30-second orientation
IMS is a **metadata-driven inventory system** for manufacturing. Admins define
**inventory types** and their **custom fields** (the schema), and items carry a JSON
`attributes` bag validated against that per-type schema.

- **API:** NestJS + Prisma + PostgreSQL (+ Redis cache, optional) — `apps/api`
- **Web:** React + Vite + TanStack Query — `apps/web`
- **Shared:** Zod field-type validation — `packages/shared` (`@ims/shared`)

## Quick start (this machine)
No Docker here — Postgres 16 runs natively. Redis/MinIO are optional.
```
pnpm install
pnpm --filter @ims/shared build
pnpm --filter @ims/api exec prisma migrate dev
pnpm dev          # API :3000, Web :5173
```
- API: http://localhost:3000/api/v1 · Swagger: http://localhost:3000/api/docs
- Web: http://localhost:5173 · Login: `admin@ims.local` / `Admin123!`
