-- Enrolled face data. Both the reference photo and the 128-float descriptor are
-- stored as AES-256-GCM ciphertext, the same treatment as other personal data:
-- a leaked database dump alone must not be enough to reconstruct anyone's face.

CREATE TABLE "FaceEnrollment" (
    "id" TEXT NOT NULL,
    "employeeId" UUID NOT NULL,
    "referenceEnc" TEXT NOT NULL,
    "descriptorEnc" TEXT NOT NULL,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FaceEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FaceEnrollment_employeeId_key" ON "FaceEnrollment"("employeeId");

ALTER TABLE "FaceEnrollment"
  ADD CONSTRAINT "FaceEnrollment_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
