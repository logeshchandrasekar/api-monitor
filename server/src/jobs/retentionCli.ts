import { prisma } from "../lib/prisma.js";
import { runRetention } from "./retention.js";

// npm run retention:run -w server            deletes expired checks now
// npm run retention:run -w server -- --dry-run   only counts them
const dryRun = process.argv.includes("--dry-run");

try {
  const result = await runRetention({ dryRun, pauseMs: 0 });
  console.log(dryRun ? "Dry run: nothing was deleted." : "Expired checks deleted.");
  console.table(
    result.plans.map((p) => ({
      plan: p.plan,
      keepsDays: p.retentionDays,
      olderThan: p.cutoff.toISOString(),
      [dryRun ? "wouldDelete" : "deleted"]: p.rows,
      batches: p.batches,
    })),
  );
  console.log(`Total: ${result.totalRows} rows in ${result.durationMs} ms`);
} finally {
  await prisma.$disconnect();
}