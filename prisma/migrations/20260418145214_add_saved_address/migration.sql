-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('home', 'work', 'favorite', 'other');

-- CreateTable
CREATE TABLE "SavedAddress" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "AddressType" NOT NULL DEFAULT 'other',
    "label" TEXT,
    "address" TEXT NOT NULL,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedAddress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedAddress_userId_type_idx" ON "SavedAddress"("userId", "type");

-- AddForeignKey
ALTER TABLE "SavedAddress" ADD CONSTRAINT "SavedAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Partial unique indexes: one Home and one Work per user (favorites unlimited).
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_saved_address_single_home_per_user"
  ON "SavedAddress" ("userId")
  WHERE type = 'home';

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_saved_address_single_work_per_user"
  ON "SavedAddress" ("userId")
  WHERE type = 'work';
