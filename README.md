# Manufacturing Inventory Management System

Metadata-driven inventory platform for manufacturing.

## Stack

- **API:** NestJS + Prisma + PostgreSQL + Redis
- **Web:** React + Vite + TanStack Query
- **Shared:** Zod field schema factory (`@ims/shared`)

## Quick start

```bash
# 1. Infrastructure
docker compose up -d

# 2. Install
pnpm install

# 3. Build shared package
pnpm --filter @ims/shared build

# 4. Migrate + seed
pnpm --filter @ims/api prisma:generate
pnpm --filter @ims/api exec prisma migrate dev --name init
pnpm db:seed

# 5. Run
pnpm dev
```

- API: http://localhost:3000/api/v1  
- Swagger: http://localhost:3000/api/docs  
- Web: http://localhost:5173  

**Default login:** `admin@ims.local` / `Admin123!`

## Workspace

```
apps/api       NestJS API
apps/web       React admin
packages/shared  Field types + dynamic Zod validation
database/schema.sql  Reference PostgreSQL DDL
```
