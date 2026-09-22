-- The day a consignment counts as arrived in Dar: its container's arrival.
ALTER TABLE "Cargo" ADD COLUMN "darArrivedAt" TIMESTAMP(3);

-- Consignments already landed take their container's recorded arrival, or,
-- where none was recorded, the day Dar checked them in.
UPDATE "Cargo" c
SET "darArrivedAt" = s."actualArrival"
FROM "ContainerCargo" cc
JOIN "Shipment" s ON s."containerId" = cc."containerId"
WHERE cc."cargoId" = c."id"
  AND s."actualArrival" IS NOT NULL
  AND c."status" IN ('ARRIVED_TANZANIA', 'RECEIVED_DAR', 'READY_FOR_RELEASE', 'COLLECTED', 'DELIVERED');

UPDATE "Cargo" c
SET "darArrivedAt" = d."receivedAt"
FROM "DarReceiving" d
WHERE d."cargoId" = c."id" AND c."darArrivedAt" IS NULL;
