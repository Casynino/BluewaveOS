-- Indexes only. Nothing here changes a column, a constraint or a row.
--
-- Two kinds of gap, both found by asking the database what it did rather than
-- by reading the schema.
--
-- THE ONE A SCREEN WAITS ON. The warehouse floor list is every consignment at
-- one stage, oldest touched first, and Postgres was reading the whole Cargo
-- table and sorting it to draw two hundred rows. The rest are columns a screen
-- filters by that had no index at all: a supplier's deliveries, a container's
-- costs by what was bought and from whom, what has been said about one
-- consignment, the request a consignment came from.
--
-- THE ONE NOBODY SEES UNTIL A CLERK LEAVES. A foreign key is not indexed by
-- Postgres on its own. Every one of these columns is nulled when the staff
-- account it names is removed, and without an index that is a scan of the whole
-- child table — FieldChange and CargoStatusHistory are append-only and grow for
-- as long as the company trades.
--
-- Written CONCURRENTLY is deliberately NOT used: `prisma migrate deploy` runs a
-- migration inside a transaction and CREATE INDEX CONCURRENTLY cannot. On a
-- table this size the lock is milliseconds; if a table here ever grows past
-- what a brief write lock can be allowed to hold, build the index by hand
-- against the live database first and this file will find it already there.

-- The floor list: one stage, oldest touched first.
CREATE INDEX IF NOT EXISTS "Cargo_status_updatedAt_idx" ON "Cargo"("status", "updatedAt");

-- Columns a screen filters by, and which a removed account has to be nulled out of.
CREATE INDEX IF NOT EXISTS "Cargo_createdById_idx" ON "Cargo"("createdById");
CREATE INDEX IF NOT EXISTS "Cargo_supplierId_idx" ON "Cargo"("supplierId");
CREATE INDEX IF NOT EXISTS "CargoPhoto_uploadedById_idx" ON "CargoPhoto"("uploadedById");
CREATE INDEX IF NOT EXISTS "CargoStatusHistory_actorId_idx" ON "CargoStatusHistory"("actorId");
CREATE INDEX IF NOT EXISTS "ChinaReceiving_receivedById_idx" ON "ChinaReceiving"("receivedById");
CREATE INDEX IF NOT EXISTS "ContainerExpense_expenseTypeId_idx" ON "ContainerExpense"("expenseTypeId");
CREATE INDEX IF NOT EXISTS "ContainerExpense_vendorId_idx" ON "ContainerExpense"("vendorId");
CREATE INDEX IF NOT EXISTS "Conversation_cargoId_idx" ON "Conversation"("cargoId");
CREATE INDEX IF NOT EXISTS "CustomerRate_shippingRateId_idx" ON "CustomerRate"("shippingRateId");
CREATE INDEX IF NOT EXISTS "DarReceiving_receivedById_idx" ON "DarReceiving"("receivedById");
CREATE INDEX IF NOT EXISTS "FieldChange_actorId_idx" ON "FieldChange"("actorId");
CREATE INDEX IF NOT EXISTS "Invoice_issuedById_idx" ON "Invoice"("issuedById");
CREATE INDEX IF NOT EXISTS "Payment_verifiedById_idx" ON "Payment"("verifiedById");
CREATE INDEX IF NOT EXISTS "PickupRequest_cargoId_idx" ON "PickupRequest"("cargoId");
