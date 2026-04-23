-- CreateEnum
CREATE TYPE "OrderMode" AS ENUM ('immediate', 'scheduled');

-- AlterTable: add nullable first so we can backfill safely
ALTER TABLE "Order" ADD COLUMN "orderMode" "OrderMode";

-- Backfill existing rows: any row where timeToStart is null OR in the past
-- is treated as immediate; everything else is scheduled.
UPDATE "Order"
SET "orderMode" = CASE
    WHEN "timeToStart" IS NULL THEN 'immediate'::"OrderMode"
    WHEN "timeToStart" <= NOW() THEN 'immediate'::"OrderMode"
    ELSE 'scheduled'::"OrderMode"
END
WHERE "orderMode" IS NULL;

-- Enforce NOT NULL + default after backfill
ALTER TABLE "Order" ALTER COLUMN "orderMode" SET NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "orderMode" SET DEFAULT 'scheduled';
