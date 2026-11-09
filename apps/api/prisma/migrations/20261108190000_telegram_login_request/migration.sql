-- Sign-in requests that wait for an HR decision before the bot reveals a code.
--
-- Only the new table is created here. A generated diff also rewrote unrelated
-- columns (FaceEnrollment primary key, Employee NOT NULL flags); those are
-- pre-existing drift and are deliberately left untouched by this migration.

CREATE TABLE "TelegramLoginRequest" (
    "id" UUID NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "employeeId" UUID,
    "decidedById" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramLoginRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TelegramLoginRequest_telegramUserId_status_idx"
  ON "TelegramLoginRequest"("telegramUserId", "status");

CREATE INDEX "TelegramLoginRequest_status_createdAt_idx"
  ON "TelegramLoginRequest"("status", "createdAt");

ALTER TABLE "TelegramLoginRequest"
  ADD CONSTRAINT "TelegramLoginRequest_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramLoginRequest"
  ADD CONSTRAINT "TelegramLoginRequest_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "Employee"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
