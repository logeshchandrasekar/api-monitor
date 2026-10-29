-- CreateEnum
CREATE TYPE "CheckTrigger" AS ENUM ('SCHEDULED', 'MANUAL');

-- CreateEnum
CREATE TYPE "CheckOutcome" AS ENUM ('SUCCESS', 'SLOW', 'FAILURE');

-- CreateEnum
CREATE TYPE "FailureType" AS ENUM ('TIMEOUT', 'DNS', 'CONNECTION', 'TLS', 'UNEXPECTED_STATUS', 'BLOCKED_TARGET', 'OTHER');

-- CreateTable
CREATE TABLE "checks" (
    "id" BIGSERIAL NOT NULL,
    "monitorId" TEXT NOT NULL,
    "trigger" "CheckTrigger" NOT NULL,
    "outcome" "CheckOutcome" NOT NULL,
    "failureType" "FailureType",
    "statusCode" INTEGER,
    "responseTimeMs" INTEGER,
    "errorMessage" TEXT,
    "checkedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checks_monitorId_checkedAt_idx" ON "checks"("monitorId", "checkedAt" DESC);

-- AddForeignKey
ALTER TABLE "checks" ADD CONSTRAINT "checks_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
