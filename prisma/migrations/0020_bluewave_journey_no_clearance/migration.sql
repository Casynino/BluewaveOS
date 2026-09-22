-- BlueWave's journey has no customs-clearance stage. Nothing is dropped: the
-- clearance columns keep what the inherited step recorded, and every status
-- value the data already uses keeps its meaning. What changes is who may
-- announce a stage, and that each stage is announced once.

-- One stage message per consignment per customer. Retrying a departure or a
-- check-in finds the row already there and writes nothing.
ALTER TABLE "Notification" ADD COLUMN "eventKey" TEXT;

CREATE UNIQUE INDEX "Notification_customerId_eventKey_key" ON "Notification"("customerId", "eventKey");
