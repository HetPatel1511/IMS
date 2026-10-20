-- Add the ADJUSTMENT value to the StockTransactionType enum.
-- This records, as a tracked migration, the change that was originally applied via
-- `prisma db push` (v3 A2), so other environments receive it through `migrate deploy`.
-- IF NOT EXISTS keeps it idempotent where db push already added the value.
ALTER TYPE "StockTransactionType" ADD VALUE IF NOT EXISTS 'ADJUSTMENT';
