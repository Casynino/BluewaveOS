-- The lane takes thirty-five days, by the owner's word. New sailings default
-- to it, and the weeks already published take it unless somebody typed a
-- different number for that sailing.
ALTER TABLE "ShipmentSchedule" ALTER COLUMN "transitDays" SET DEFAULT 35;
UPDATE "ShipmentSchedule" SET "transitDays" = 35 WHERE "transitDays" = 30;
