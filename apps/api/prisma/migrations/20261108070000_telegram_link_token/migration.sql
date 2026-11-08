CREATE TABLE "TelegramLinkToken" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "employeeId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramLinkToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramLinkToken_tokenHash_key" ON "TelegramLinkToken"("tokenHash");
CREATE INDEX "TelegramLinkToken_employeeId_expiresAt_idx" ON "TelegramLinkToken"("employeeId", "expiresAt");

ALTER TABLE "TelegramLinkToken"
  ADD CONSTRAINT "TelegramLinkToken_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;