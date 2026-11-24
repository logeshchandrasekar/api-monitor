// Load check (Phase 9): does the scheduler keep up with 200 monitors at a 30 s interval, and is memory stable?
//
//   terminal 1:  npm run flaky                          (the test API on http://localhost:4100)
//   terminal 2:  npm run loadcheck -w server            (about 3 minutes; needs ALLOW_PRIVATE_TARGETS=true in server/.env)
//
// Options (after `--`):  --monitors 200  --interval 30  --seconds 180  --tick 15000  --batches 10  --users 4  --target http://localhost:4100
//   --batches 1 switches the scheduler back to its old limit of 50 checks per tick, to see the check fail.
//
// It inserts the monitors straight into the database (several users, so the plan cap of 50 does not apply),
// runs the REAL scheduler and check runner in this process against the flaky API, samples every 2 seconds, prints a
// table, and removes everything it created. Exit code 1 if the scheduler fell behind or memory kept growing.
import { monitorEventLoopDelay } from "node:perf_hooks";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    monitors: { type: "string", default: "200" },
    interval: { type: "string", default: "30" },
    seconds: { type: "string", default: "180" },
    tick: { type: "string", default: "15000" }, // the production tick, not the 2 s used while developing
    batches: { type: "string", default: process.env.SCHEDULER_MAX_BATCHES ?? "10" },
    users: { type: "string", default: "4" },
    target: { type: "string", default: process.env.FLAKY_URL ?? "http://localhost:4100" },
  },
});
const N = Number(args.monitors);
const INTERVAL = Number(args.interval);
const SECONDS = Number(args.seconds);
const TICK_MS = Number(args.tick);
const USERS = Number(args.users);
const TARGET = args.target!.replace(/\/$/, "");

// These must be set before the server's modules read the environment
process.env.LOG_LEVEL ??= "warn";
process.env.SCHEDULER_TICK_MS = String(TICK_MS);
process.env.SCHEDULER_MAX_BATCHES = String(args.batches);
const { env } = await import("../src/config/env.ts");
const { prisma } = await import("../src/lib/prisma.ts");
const { startScheduler } = await import("../src/jobs/scheduler.ts");

if (!env.ALLOW_PRIVATE_TARGETS) {
  console.error(
    "Set ALLOW_PRIVATE_TARGETS=true in server/.env: the load check monitors localhost.",
  );
  process.exit(2);
}
if (env.NODE_ENV === "production") {
  console.error("Refusing to run with NODE_ENV=production.");
  process.exit(2);
}
try {
  const res = await fetch(`${TARGET}/ok`);
  if (!res.ok) throw new Error(String(res.status));
} catch {
  console.error(`Cannot reach the flaky API at ${TARGET}. Start it with: npm run flaky`);
  process.exit(2);
}

const gc = (globalThis as { gc?: () => void }).gc;
const tag = Math.random().toString(36).slice(2, 8);
const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);
const pct = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;

type Sample = {
  t: number;
  checks: number;
  overdueCount: number;
  maxOverdueS: number;
  rssMb: number;
  heapMb: number;
  loopP99Ms: number;
};
const samples: Sample[] = [];
let userIds: string[] = [];
let exitCode = 0;

async function seed() {
  userIds = [];
  for (let i = 0; i < USERS; i++) {
    const user = await prisma.user.create({
      data: {
        name: `Load ${i}`,
        email: `loadcheck-${tag}-${i}@example.com`,
        passwordHash: "not-a-real-hash",
        plan: "PRO",
      },
    });
    userIds.push(user.id);
  }
  // A realistic mix: mostly healthy with an occasional 500, some slow ones, and a few that are always down
  const kinds = (i: number) =>
    i % 10 === 0
      ? { url: `${TARGET}/slow?ms=250`, responseThresholdMs: 100 } // answers, but slower than its threshold: SLOW
      : i % 25 === 0
        ? { url: `${TARGET}/status/503`, responseThresholdMs: 1000 } // always failing: a DOWN incident
        : { url: `${TARGET}/flaky?p=0.1`, responseThresholdMs: 1000 };
  await prisma.monitor.createMany({
    data: Array.from({ length: N }, (_, i) => ({
      userId: userIds[i % USERS]!,
      name: `load ${i}`,
      intervalSec: INTERVAL,
      timeoutMs: 5_000,
      // Spread over the first interval, the way monitors created at different moments would be
      nextCheckAt: new Date(Date.now() + Math.random() * INTERVAL * 1000),
      ...kinds(i),
    })),
  });
  const created = await prisma.monitor.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  await prisma.alertRule.createMany({ data: created.map((m) => ({ monitorId: m.id })) });
}

async function sample(startedAt: number, loop: ReturnType<typeof monitorEventLoopDelay>) {
  const [row] = await prisma.$queryRaw<{ overdue: bigint; max_overdue: number | null }[]>`
    SELECT count(*) FILTER (WHERE "nextCheckAt" < now() - interval '1 second') AS overdue,
           max(extract(epoch FROM (now() - "nextCheckAt"))) AS max_overdue
    FROM monitors WHERE "userId" = ANY(${userIds})`;
  const checks = await prisma.check.count({ where: { monitor: { userId: { in: userIds } } } });
  gc?.();
  const mem = process.memoryUsage();
  const s: Sample = {
    t: Math.round((Date.now() - startedAt) / 1000),
    checks,
    overdueCount: Number(row?.overdue ?? 0),
    maxOverdueS: Math.max(0, Math.round((row?.max_overdue ?? 0) * 10) / 10),
    rssMb: mb(mem.rss),
    heapMb: mb(mem.heapUsed),
    loopP99Ms: Math.round(loop.percentile(99) / 1e6),
  };
  loop.reset();
  samples.push(s);
  return s;
}

console.log(
  `Load check: ${N} monitors, ${INTERVAL} s interval, ${USERS} users, tick ${TICK_MS} ms, up to ${args.batches} batches per tick, ${SECONDS} s`,
);
if (!gc)
  console.log(
    "(run it through `npm run loadcheck -w server` so garbage collection is exposed: the heap numbers are only meaningful then)",
  );

let scheduler: ReturnType<typeof startScheduler> | null = null;
try {
  await seed();
  console.log(`Seeded ${N} monitors. Running...\n`);
  console.log(" time  checks  overdue  oldest(s)  rss(MB)  heap(MB)  loop p99(ms)");
  const loop = monitorEventLoopDelay({ resolution: 20 });
  loop.enable();
  const startedAt = Date.now();
  scheduler = startScheduler({ tickMs: TICK_MS });

  while (Date.now() - startedAt < SECONDS * 1000) {
    await new Promise((r) => setTimeout(r, 2000));
    const s = await sample(startedAt, loop);
    if (s.t % 10 < 2) {
      console.log(
        `${String(s.t).padStart(4)}s ${String(s.checks).padStart(7)} ${String(s.overdueCount).padStart(8)} ${String(s.maxOverdueS).padStart(10)} ${String(s.rssMb).padStart(8)} ${String(s.heapMb).padStart(9)} ${String(s.loopP99Ms).padStart(13)}`,
      );
    }
  }
  await scheduler.stop(20_000);
  scheduler = null;
  loop.disable();

  // ---- Verdict --------------------------------------------------------------------------------
  const warmUp = INTERVAL + TICK_MS / 1000; // every monitor is due once, and the first tick has run
  const steady = samples.filter((s) => s.t >= warmUp);
  const lateAllowed = TICK_MS / 1000 + 10; // a monitor may wait for the next tick, plus the time a batch of checks takes
  const lateSorted = steady.map((s) => s.maxOverdueS).sort((a, b) => a - b);
  const p95Late = pct(lateSorted, 0.95);
  const lastLate = steady.at(-1)?.maxOverdueS ?? 0;

  const lastMinute = samples.filter((s) => s.t >= SECONDS - 60);
  const checksLastMinute = (lastMinute.at(-1)?.checks ?? 0) - (lastMinute[0]?.checks ?? 0);
  const windowS = Math.max(1, (lastMinute.at(-1)?.t ?? 1) - (lastMinute[0]?.t ?? 0));
  // A monitor is checked at most every (interval + one tick) because the next check is counted from the claim
  const expectedPerMin = (N * 60) / (INTERVAL + TICK_MS / 1000);
  const perMin = (checksLastMinute / windowS) * 60;

  const third = Math.floor(steady.length / 3);
  const heapEarly = steady.slice(0, third).reduce((a, s) => a + s.heapMb, 0) / Math.max(1, third);
  const heapLate = steady.slice(-third).reduce((a, s) => a + s.heapMb, 0) / Math.max(1, third);
  const rssMax = Math.max(...samples.map((s) => s.rssMb));
  const loopMax = Math.max(...samples.map((s) => s.loopP99Ms));
  const neverChecked = await prisma.monitor.count({
    where: { userId: { in: userIds }, lastCheckedAt: null },
  });

  const results: [string, boolean, string][] = [
    [
      `Oldest overdue monitor stays within ${lateAllowed} s (95th percentile)`,
      p95Late <= lateAllowed,
      `${p95Late} s`,
    ],
    [`...and at the end of the run`, lastLate <= lateAllowed, `${lastLate} s`],
    [
      `Throughput in the last minute is at least 90 % of the ${Math.round(expectedPerMin)} checks/min the plan needs`,
      perMin >= 0.9 * expectedPerMin,
      `${Math.round(perMin)} checks/min`,
    ],
    [
      `Every monitor was checked at least once`,
      neverChecked === 0,
      `${neverChecked} never checked`,
    ],
    [
      `Heap does not keep growing (last third at most 25 % + 20 MB above the first third)`,
      !gc || heapLate <= heapEarly * 1.25 + 20,
      `${Math.round(heapEarly)} MB -> ${Math.round(heapLate)} MB`,
    ],
    [`Resident memory stays under 400 MB`, rssMax < 400, `${rssMax} MB`],
    [`Event loop stays responsive (p99 delay under 250 ms)`, loopMax < 250, `${loopMax} ms`],
  ];
  console.log("\nResults");
  for (const [label, ok, value] of results)
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${value}`);
  exitCode = results.every(([, ok]) => ok) ? 0 : 1;
  console.log(
    exitCode === 0
      ? "\nLoad check passed."
      : "\nLoad check FAILED: the scheduler did not keep up or memory kept growing.",
  );
} catch (err) {
  console.error("Load check could not finish:", err instanceof Error ? err.message : err);
  exitCode = 2;
} finally {
  await scheduler?.stop(5_000).catch(() => {});
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } }); // cascades to monitors, checks, incidents
  await prisma.$disconnect();
}
process.exit(exitCode);