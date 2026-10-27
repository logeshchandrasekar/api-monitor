-- CreateEnum
CREATE TYPE "HttpMethod" AS ENUM ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD');

-- CreateEnum
CREATE TYPE "MonitorStatus" AS ENUM ('PENDING', 'HEALTHY', 'DEGRADED', 'DOWN');

-- CreateTable
CREATE TABLE "monitors" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "method" "HttpMethod" NOT NULL DEFAULT 'GET',
    "headersEnc" TEXT,
    "bodyEnc" TEXT,
    "expectedStatus" INTEGER NOT NULL DEFAULT 200,
    "followRedirects" BOOLEAN NOT NULL DEFAULT true,
    "intervalSec" INTEGER NOT NULL,
    "timeoutMs" INTEGER NOT NULL DEFAULT 10000,
    "responseThresholdMs" INTEGER NOT NULL DEFAULT 1000,
    "failureThreshold" INTEGER NOT NULL DEFAULT 3,
    "slowThreshold" INTEGER NOT NULL DEFAULT 3,
    "status" "MonitorStatus" NOT NULL DEFAULT 'PENDING',
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "failStreak" INTEGER NOT NULL DEFAULT 0,
    "slowStreak" INTEGER NOT NULL DEFAULT 0,
    "okStreak" INTEGER NOT NULL DEFAULT 0,
    "nextCheckAt" TIMESTAMPTZ(3) NOT NULL,
    "lastCheckedAt" TIMESTAMPTZ(3),
    "lastStatusCode" INTEGER,
    "lastResponseTimeMs" INTEGER,
    "lastStatusChangeAt" TIMESTAMPTZ(3),
    "tags" TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "monitors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "monitors_userId_createdAt_idx" ON "monitors"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "monitors_isPaused_nextCheckAt_idx" ON "monitors"("isPaused", "nextCheckAt");

-- AddForeignKey
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
