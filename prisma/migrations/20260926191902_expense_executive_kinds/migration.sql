-- AlterTable
ALTER TABLE "ExpenseType" ADD COLUMN     "forExecutive" BOOLEAN NOT NULL DEFAULT false;

-- WHAT AN OWNER OR DIRECTOR TAKES OUT OF THE BUSINESS.
--
-- The executive's list, so a draw is filed as what it was rather than under a
-- running cost it only resembles. Inserted, never updated: a kind of the same
-- name the office already uses keeps its meaning, and nothing already filed
-- moves. Salaries are not here on purpose — they leave only through an
-- approved payroll run.
INSERT INTO "ExpenseType" ("id", "name", "active", "forContainer", "forExecutive", "createdAt")
VALUES
  (gen_random_uuid()::text, 'Owner''s drawings',            true, false, true, now()),
  (gen_random_uuid()::text, 'Director''s advance',          true, false, true, now()),
  (gen_random_uuid()::text, 'Loan to a director',           true, false, true, now()),
  (gen_random_uuid()::text, 'School fees',                  true, false, true, now()),
  (gen_random_uuid()::text, 'Family medical',               true, false, true, now()),
  (gen_random_uuid()::text, 'Household & family support',   true, false, true, now()),
  (gen_random_uuid()::text, 'Personal vehicle & fuel',      true, false, true, now()),
  (gen_random_uuid()::text, 'Personal travel',              true, false, true, now()),
  (gen_random_uuid()::text, 'Personal airtime & data',      true, false, true, now()),
  (gen_random_uuid()::text, 'Meals & entertainment',        true, false, true, now()),
  (gen_random_uuid()::text, 'Personal rent',                true, false, true, now()),
  (gen_random_uuid()::text, 'Personal insurance',           true, false, true, now()),
  (gen_random_uuid()::text, 'Contributions & harambee',     true, false, true, now()),
  (gen_random_uuid()::text, 'Gifts & hospitality',          true, false, true, now()),
  (gen_random_uuid()::text, 'Personal purchases',           true, false, true, now())
ON CONFLICT ("name") DO NOTHING;
