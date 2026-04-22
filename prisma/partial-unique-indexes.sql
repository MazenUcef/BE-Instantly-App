-- Partial unique indexes that Prisma's schema DSL cannot express.
-- Apply after running `prisma migrate dev` (or append into the generated migration.sql).
-- These preserve the business invariants enforced by the former Mongo partial indexes.

-- Order: a customer can only have one PENDING order at a time.
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_customer_single_pending_order"
  ON "Order" ("customerId")
  WHERE status = 'pending';

-- Offer: a supplier can have only one PENDING offer per order.
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_supplier_pending_offer_per_order"
  ON "Offer" ("orderId", "supplierId")
  WHERE status = 'pending';

-- Offer: an order can only ever have one ACCEPTED offer.
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_order_single_accepted_offer"
  ON "Offer" ("orderId")
  WHERE status = 'accepted';

-- JobSession: one active session per order / offer / bundle booking.
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_active_orderId"
  ON "JobSession" ("orderId")
  WHERE "orderId" IS NOT NULL AND status NOT IN ('completed', 'cancelled');

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_active_offerId"
  ON "JobSession" ("offerId")
  WHERE "offerId" IS NOT NULL AND status NOT IN ('completed', 'cancelled');

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_active_bundleBookingId"
  ON "JobSession" ("bundleBookingId")
  WHERE "bundleBookingId" IS NOT NULL AND status NOT IN ('completed', 'cancelled');

-- JobSession: a customer/supplier can have at most one active session.
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_customer_single_active_session"
  ON "JobSession" ("customerId")
  WHERE status NOT IN ('completed', 'cancelled');

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_supplier_single_active_session"
  ON "JobSession" ("supplierId")
  WHERE status NOT IN ('completed', 'cancelled');

-- CallSession: one live call per session at a time.
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_active_call_per_session"
  ON "CallSession" ("sessionId")
  WHERE status IN ('initiated', 'ringing', 'accepted');

-- SavedAddress: a user can have at most one Home and one Work saved address.
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_saved_address_single_home_per_user"
  ON "SavedAddress" ("userId")
  WHERE type = 'home';

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_saved_address_single_work_per_user"
  ON "SavedAddress" ("userId")
  WHERE type = 'work';

-- CHECK constraint: a JobSession must belong to exactly one parent
-- (ad-hoc order+offer) OR (bundle booking), not both, not neither.
ALTER TABLE "JobSession"
  ADD CONSTRAINT "jobsession_single_parent"
  CHECK (
    ("orderId" IS NOT NULL AND "offerId" IS NOT NULL AND "bundleBookingId" IS NULL)
    OR
    ("orderId" IS NULL AND "offerId" IS NULL AND "bundleBookingId" IS NOT NULL)
  );
 