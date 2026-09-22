-- Container costs are their own list: the owner's eighteen, and nothing else.
ALTER TABLE "ExpenseType" ADD COLUMN "forContainer" BOOLEAN NOT NULL DEFAULT false;

-- A type already typed under the same name in another case becomes the
-- company's spelling, so no second "Port charges" appears beside "Port Charges".
WITH wanted(name) AS (VALUES
  ('Bill of Lading Fees'), ('Chassis Rental'), ('Customs Clearance'), ('Demurrage'),
  ('Detention'), ('Documentation'), ('Facilitation'), ('Fuel Surcharge'),
  ('Handling Fees'), ('Insurance'), ('Maintenance & Repairs'), ('Port Charges'),
  ('Security Fees'), ('Storage Fees'), ('Terminal Handling Charges (THC)'),
  ('Transportation'), ('Unloading Fee'), ('Wharfage')
)
UPDATE "ExpenseType" t
SET "name" = w.name, "forContainer" = true, "active" = true
FROM wanted w
WHERE lower(t."name") = lower(w.name);

INSERT INTO "ExpenseType" ("id", "name", "active", "forContainer", "createdAt")
SELECT 'ext_' || md5(w.name), w.name, true, true, now()
FROM (VALUES
  ('Bill of Lading Fees'), ('Chassis Rental'), ('Customs Clearance'), ('Demurrage'),
  ('Detention'), ('Documentation'), ('Facilitation'), ('Fuel Surcharge'),
  ('Handling Fees'), ('Insurance'), ('Maintenance & Repairs'), ('Port Charges'),
  ('Security Fees'), ('Storage Fees'), ('Terminal Handling Charges (THC)'),
  ('Transportation'), ('Unloading Fee'), ('Wharfage')
) AS w(name)
WHERE NOT EXISTS (SELECT 1 FROM "ExpenseType" t WHERE t."name" = w.name);
