-- NOT EVERY DRAW IS PERSONAL.
--
-- An owner takes money out of the business for three different reasons, and
-- the draws list has to tell them apart: the profit that is theirs, money
-- taken to spend on the business itself — a sourcing trip to China, a
-- supplier visit, a float to account for with receipts — and personal
-- spending. The first two are the questions a partner or an accountant asks
-- first, so they are named kinds, not "personal purchases".
--
-- Inserted, never updated: a kind of the same name the office already uses
-- keeps its meaning, and nothing already filed moves.
INSERT INTO "ExpenseType" ("id", "name", "active", "forContainer", "forExecutive", "createdAt")
VALUES
  (gen_random_uuid()::text, 'Profit withdrawal',             true, false, true, now()),
  (gen_random_uuid()::text, 'Dividend',                      true, false, true, now()),
  (gen_random_uuid()::text, 'Capital withdrawal',            true, false, true, now()),
  (gen_random_uuid()::text, 'Business trip',                 true, false, true, now()),
  (gen_random_uuid()::text, 'Sourcing trip to China',        true, false, true, now()),
  (gen_random_uuid()::text, 'Supplier & market visit',       true, false, true, now()),
  (gen_random_uuid()::text, 'Business development',          true, false, true, now()),
  (gen_random_uuid()::text, 'Client entertainment',          true, false, true, now()),
  (gen_random_uuid()::text, 'Director''s allowance',         true, false, true, now()),
  (gen_random_uuid()::text, 'Business float — to account for', true, false, true, now())
ON CONFLICT ("name") DO NOTHING;
