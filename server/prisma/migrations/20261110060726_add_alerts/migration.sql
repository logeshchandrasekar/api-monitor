-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('DOWN', 'DEGRADED', 'RECOVERED', 'TEST');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'SUPPRESSED', 'FAILED');

-- CreateTable
CREATE TABLE "alert_rules" (
    "id" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "notifyOnDown" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnRecovery" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnSlow" BOOLEAN NOT NULL DEFAULT true,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 30,
    "recipientEmail" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "incidentId" TEXT,
    "type" "NotificationType" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "recipient" TEXT NOT NULL,
    "eventAt" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ(3),
    "error" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alert_rules_monitorId_key" ON "alert_rules"("monitorId");

-- CreateIndex
CREATE INDEX "notification_logs_monitorId_createdAt_idx" ON "notification_logs"("monitorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "notification_logs_status_nextAttemptAt_idx" ON "notification_logs"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_logs_incidentId_type_key" ON "notification_logs"("incidentId", "type");

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill (added by hand, 8.1): every monitor that already exists gets an alert rule with the defaults.
-- New monitors get theirs from the application when they are created.
INSERT INTO "alert_rules" ("id", "monitorId", "updatedAt")
SELECT gen_random_uuid()::text, "id", CURRENT_TIMESTAMP FROM "monitors"
ON CONFLICT ("monitorId") DO NOTHING;