-- Personal data at rest is encrypted in the application (AES-256-GCM), so the
-- columns become opaque text. Values are written by prisma/seed.ts and by the
-- application after this migration; the previous plaintext columns are dropped
-- because keeping them would defeat the purpose.

ALTER TABLE "Employee"
  ADD COLUMN "identityCardEnc"        TEXT,
  ADD COLUMN "identityCardIndex"      TEXT,
  ADD COLUMN "addressEnc"             TEXT,
  ADD COLUMN "emergencyContactPhoneEnc" TEXT,
  ADD COLUMN "baseSalaryEnc"          TEXT,
  ADD COLUMN "hourlyRateEnc"          TEXT;

-- The old plaintext columns are dropped rather than kept: keeping them would
-- defeat the purpose of the migration.
ALTER TABLE "Employee"
  DROP COLUMN "identityCardNumber",
  DROP COLUMN "address",
  DROP COLUMN "emergencyContactPhone",
  DROP COLUMN "baseSalarySen",
  DROP COLUMN "hourlyRateSen";

