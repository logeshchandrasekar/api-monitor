import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { startDispatcher } from "./jobs/notificationDispatcher.js";
import { startRetention } from "./jobs/retention.js";
import { startScheduler } from "./jobs/scheduler.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`API Monitor server listening on http://localhost:${env.PORT}`);
});

// The scheduler runs inside the API process for the MVP. ENABLE_SCHEDULER=false turns it off,
// so it can move to its own worker process later without code changes (ENG-1).
const scheduler = env.ENABLE_SCHEDULER ? startScheduler() : null;
if (!scheduler) logger.info("Scheduler disabled (ENABLE_SCHEDULER=false)");

// Sends the alert emails that applyCheckResult queued. Same idea: in-process for the MVP, switchable off (Phase 8).
const dispatcher = env.ENABLE_DISPATCHER ? startDispatcher() : null;
if (!dispatcher) logger.info("Alert dispatcher disabled (ENABLE_DISPATCHER=false)");

// Deletes checks older than the plan's retention, once shortly after boot and then daily (Phase 9, DAT-3).
const retention = env.ENABLE_RETENTION ? startRetention() : null;
if (!retention) logger.info("Retention job disabled (ENABLE_RETENTION=false)");

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down...`);
  setTimeout(() => process.exit(1), 15_000).unref(); // hard stop if anything hangs

  await scheduler?.stop(10_000); // stop ticking, give in-flight checks up to 10 s to finish and be stored
  await dispatcher?.stop(10_000); // after the scheduler: it can still queue an alert while its last checks finish
  await retention?.stop(); // lets a run that is already deleting finish its current batch
  server.closeIdleConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
