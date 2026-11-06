import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import {
  BUCKET_SEC,
  bucketStartMs,
  getMonitorAnalytics,
  queryBuckets,
} from "../services/analytics.js";
import { registerAgent, type Agent } from "./helpers.js";

const base = { name: "Prod API", url: "https://8.8.8.8/health", intervalSec: 300 };

async function newMonitor(agent: Agent, name = "Prod API") {
  const res = await agent.post("/api/monitors").send({ ...base, name });
  expect(res.status).toBe(201);
  return res.body.monitor.id as string;
}

const ago = (ms: number) => new Date(Date.now() - ms);
const HOUR = 3_600_000;
const DAY = 86_400_000;
const at = (iso: string) => new Date(iso);

type Row = {
  outcome: "SUCCESS" | "SLOW" | "FAILURE";
  trigger?: "SCHEDULED" | "MANUAL";
  responseTimeMs: number | null;
  at: Date;
};

const seed = (monitorId: string, rows: Row[]) =>
  prisma.check.createMany({
    data: rows.map((r) => ({
      monitorId,
      trigger: r.trigger ?? "SCHEDULED",
      outcome: r.outcome,
      failureType: r.outcome === "FAILURE" ? ("TIMEOUT" as const) : null,
      statusCode: r.outcome === "FAILURE" ? null : 200,
      responseTimeMs: r.responseTimeMs,
      errorMessage: r.outcome === "FAILURE" ? "No response within 10 seconds." : null,
      checkedAt: r.at,
    })),
  });

async function ownerOf(email: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { id: user.id, plan: user.plan };
}

// ---- The hand-computed fixture ---------------------------------------------------------------------------
//
// A fixed clock: NOW = 2026-11-04 12:07:30.000 UTC. Range 24h, buckets of 15 minutes.
//   window  = [2026-11-03 12:07:30.000, 2026-11-04 12:07:30.000]   (both ends inclusive)
//   first bucket starts 2026-11-03 12:00, last bucket starts 2026-11-04 12:00  ->  24 * 4 + 1 = 97 points
//
// Checks (all SCHEDULED unless said), and the bucket each one belongs to:
//   A  11-04 12:03:00.000  SUCCESS   100 ms  -> 11-04 12:00
//   B  11-04 12:04:00.000  SUCCESS   200 ms  -> 11-04 12:00
//   C  11-04 11:59:59.999  SUCCESS   300 ms  -> 11-04 11:45   (1 ms before a boundary)
//   D  11-04 11:45:00.000  SUCCESS   400 ms  -> 11-04 11:45   (exactly ON a boundary: belongs to the new bucket)
//   E  11-04 11:44:59.999  SLOW     1500 ms  -> 11-04 11:30
//   F  11-04 00:00:00.000  FAILURE   none    -> 11-04 00:00   (midnight UTC: the day boundary)
//   G  11-03 23:59:59.999  SUCCESS   600 ms  -> 11-03 23:45   (1 ms before midnight UTC)
//   I  11-03 12:07:30.000  SUCCESS   700 ms  -> 11-03 12:00   (exactly ON the window start: included)
// Left out on purpose:
//   H  11-03 12:07:29.999  SUCCESS  9999 ms  (1 ms before the window)
//   J  11-04 12:00:00.000  MANUAL FAILURE    (manual checks never count)
//   K  11-04 12:07:30.001  SUCCESS  5000 ms  (after "now")
//
// Hand-computed whole-range numbers (8 checks counted):
//   total 8, successful 7 (the SLOW one is up), slow 1, failed 1, uptime 7 / 8 = 87.5 %
//   response times that exist: 100 200 300 400 600 700 1500 (F has none) -> 7 values, sum 3800
//   avg = 3800 / 7 = 542.857 -> 543, min 100, max 1500
//   p95 (continuous): position 0.95 * (7 - 1) = 5.7 -> between the 6th (700) and 7th (1500) value:
//   700 + 0.7 * (1500 - 700) = 1260
const NOW = at("2026-11-04T12:07:30.000Z").getTime();

const FIXTURE: Row[] = [
  { outcome: "SUCCESS", responseTimeMs: 100, at: at("2026-11-04T12:03:00.000Z") }, // A
  { outcome: "SUCCESS", responseTimeMs: 200, at: at("2026-11-04T12:04:00.000Z") }, // B
  { outcome: "SUCCESS", responseTimeMs: 300, at: at("2026-11-04T11:59:59.999Z") }, // C
  { outcome: "SUCCESS", responseTimeMs: 400, at: at("2026-11-04T11:45:00.000Z") }, // D
  { outcome: "SLOW", responseTimeMs: 1500, at: at("2026-11-04T11:44:59.999Z") }, // E
  { outcome: "FAILURE", responseTimeMs: null, at: at("2026-11-04T00:00:00.000Z") }, // F
  { outcome: "SUCCESS", responseTimeMs: 600, at: at("2026-11-03T23:59:59.999Z") }, // G
  { outcome: "SUCCESS", responseTimeMs: 9999, at: at("2026-11-03T12:07:29.999Z") }, // H (outside)
  { outcome: "SUCCESS", responseTimeMs: 700, at: at("2026-11-03T12:07:30.000Z") }, // I
  {
    outcome: "FAILURE",
    trigger: "MANUAL",
    responseTimeMs: null,
    at: at("2026-11-04T12:00:00.000Z"),
  }, // J
  { outcome: "SUCCESS", responseTimeMs: 5000, at: at("2026-11-04T12:07:30.001Z") }, // K (future)
];

async function fixtureMonitor(email = "fixture@example.com") {
  const agent = await registerAgent(email, "PRO");
  const id = await newMonitor(agent);
  await seed(id, FIXTURE);
  return { agent, id, owner: await ownerOf(email) };
}

describe("analytics: hand-computed fixture", () => {
  it("whole-range statistics (uptime, average, min, max, p95, counts)", async () => {
    const { id, owner } = await fixtureMonitor();
    const a = await getMonitorAnalytics(owner, id, { range: "24h" }, NOW);
    expect(a.stats).toMatchObject({
      totalChecks: 8,
      successfulChecks: 7,
      slowChecks: 1,
      failedChecks: 1,
      uptimePct: 87.5,
      avgMs: 543,
      minMs: 100,
      maxMs: 1500,
      p95Ms: 1260,
      totalIncidents: 0,
    });
  });

  it("buckets: 97 points of 15 minutes, on UTC boundaries, with the right check in each", async () => {
    const { id, owner } = await fixtureMonitor();
    const a = await getMonitorAnalytics(owner, id, { range: "24h" }, NOW);
    expect(a.bucketSec).toBe(900);
    expect(a.series).toHaveLength(97);
    expect(a.series[0]!.at).toBe("2026-11-03T12:00:00.000Z");
    expect(a.series.at(-1)!.at).toBe("2026-11-04T12:00:00.000Z");

    const byAt = new Map(a.series.map((p) => [p.at, p]));
    const bucket = (iso: string) => byAt.get(iso)!;

    // 12:00 holds A and B (J is manual, K is in the future)
    expect(bucket("2026-11-04T12:00:00.000Z")).toMatchObject({
      total: 2,
      successful: 2,
      slow: 0,
      failed: 0,
      uptimePct: 100,
      avgMs: 150,
      maxMs: 200,
      p95Ms: 195, // 100 + 0.95 * (200 - 100)
    });
    // 11:45 holds C (1 ms before the boundary) and D (exactly on it): both belong to 11:45
    expect(bucket("2026-11-04T11:45:00.000Z")).toMatchObject({
      total: 2,
      successful: 2,
      avgMs: 350,
      maxMs: 400,
      p95Ms: 395, // 300 + 0.95 * (400 - 300)
    });
    // 11:30 holds E, the slow one: counted as successful, uptime 100 %
    expect(bucket("2026-11-04T11:30:00.000Z")).toMatchObject({
      total: 1,
      successful: 1,
      slow: 1,
      failed: 0,
      uptimePct: 100,
      avgMs: 1500,
      p95Ms: 1500,
    });
    // Midnight UTC: F lands in the NEW day's first bucket; G (1 ms earlier) in the previous day's last
    expect(bucket("2026-11-04T00:00:00.000Z")).toMatchObject({
      total: 1,
      successful: 0,
      failed: 1,
      uptimePct: 0,
      avgMs: null,
      p95Ms: null,
      maxMs: null,
    });
    expect(bucket("2026-11-03T23:45:00.000Z")).toMatchObject({ total: 1, avgMs: 600 });
    // The window start (exactly 12:07:30) is included, in the 12:00 bucket of the day before
    expect(bucket("2026-11-03T12:00:00.000Z")).toMatchObject({ total: 1, avgMs: 700 });
  });

  it("empty buckets are gaps (zero checks, no timings, no uptime), never 0 ms or 0 %", async () => {
    const { id, owner } = await fixtureMonitor();
    const a = await getMonitorAnalytics(owner, id, { range: "24h" }, NOW);
    const withChecks = a.series.filter((p) => p.total > 0);
    expect(withChecks).toHaveLength(6); // 12:00, 11:45, 11:30, 00:00, 23:45, 12:00 (day before)
    const gaps = a.series.filter((p) => p.total === 0);
    expect(gaps).toHaveLength(97 - 6);
    for (const g of gaps) {
      expect(g).toMatchObject({
        successful: 0,
        slow: 0,
        failed: 0,
        uptimePct: null,
        avgMs: null,
        p95Ms: null,
        maxMs: null,
      });
    }
  });

  it("the series adds up to the statistics, and /stats (the Phase 6 endpoint) agrees", async () => {
    const { id, owner } = await fixtureMonitor();
    const a = await getMonitorAnalytics(owner, id, { range: "24h" }, NOW);
    const sum = (k: "total" | "successful" | "slow" | "failed") =>
      a.series.reduce((acc, p) => acc + p[k], 0);
    expect(sum("total")).toBe(a.stats.totalChecks);
    expect(sum("successful")).toBe(a.stats.successfulChecks);
    expect(sum("slow")).toBe(a.stats.slowChecks);
    expect(sum("failed")).toBe(a.stats.failedChecks);
  });

  it("each bucket start equals the JavaScript twin bucketStartMs (so the chart maths can trust it)", async () => {
    const { id, owner } = await fixtureMonitor();
    const a = await getMonitorAnalytics(owner, id, { range: "24h" }, NOW);
    for (const row of FIXTURE.filter((r) => r.trigger !== "MANUAL")) {
      const expected = new Date(bucketStartMs(row.at.getTime(), 900)).toISOString();
      const inWindow = row.at.getTime() >= NOW - DAY && row.at.getTime() <= NOW;
      if (inWindow) expect(a.series.some((p) => p.at === expected && p.total > 0)).toBe(true);
    }
    expect(bucketStartMs(at("2026-11-04T11:59:59.999Z").getTime(), 900)).toBe(
      at("2026-11-04T11:45:00.000Z").getTime(),
    );
    expect(bucketStartMs(at("2026-11-04T00:00:00.000Z").getTime(), 21_600)).toBe(
      at("2026-11-04T00:00:00.000Z").getTime(),
    );
  });
});

describe("analytics: bucket sizes per range (DAT-3)", () => {
  it("24h = 15 min (97 points), 7d = 1 h (169), 30d = 6 h (121)", async () => {
    const agent = await registerAgent("pro@example.com", "PRO");
    const id = await newMonitor(agent);
    const owner = await ownerOf("pro@example.com");
    const expected = { "24h": [900, 97], "7d": [3600, 169], "30d": [21_600, 121] } as const;
    for (const range of ["24h", "7d", "30d"] as const) {
      const a = await getMonitorAnalytics(owner, id, { range }, NOW);
      expect([a.bucketSec, a.series.length]).toEqual(expected[range]);
      expect(BUCKET_SEC[range]).toBe(a.bucketSec);
      // consecutive and one bucket apart
      const times = a.series.map((p) => Date.parse(p.at));
      expect(times.every((t, i) => i === 0 || t - times[i - 1]! === a.bucketSec * 1000)).toBe(true);
    }
  });

  it("6 h buckets: the midnight boundary of a 30 d range sits in the right bucket", async () => {
    const agent = await registerAgent("pro@example.com", "PRO");
    const id = await newMonitor(agent);
    await seed(id, [
      { outcome: "SUCCESS", responseTimeMs: 111, at: at("2026-11-03T23:59:59.999Z") }, // 18:00 bucket of 11-03
      { outcome: "SUCCESS", responseTimeMs: 222, at: at("2026-11-04T00:00:00.000Z") }, // 00:00 bucket of 11-04
      { outcome: "SUCCESS", responseTimeMs: 333, at: at("2026-11-04T05:59:59.999Z") }, // still 00:00
      { outcome: "SUCCESS", responseTimeMs: 444, at: at("2026-11-04T06:00:00.000Z") }, // 06:00
    ]);
    const a = await getMonitorAnalytics(
      await ownerOf("pro@example.com"),
      id,
      { range: "30d" },
      NOW,
    );
    const by = new Map(a.series.map((p) => [p.at, p]));
    expect(by.get("2026-11-03T18:00:00.000Z")).toMatchObject({ total: 1, avgMs: 111 });
    expect(by.get("2026-11-04T00:00:00.000Z")).toMatchObject({ total: 2, avgMs: 278 }); // (222 + 333) / 2 = 277.5
    expect(by.get("2026-11-04T06:00:00.000Z")).toMatchObject({ total: 1, avgMs: 444 });
  });

  it("the buckets do not depend on the database session time zone", async () => {
    const { id } = await fixtureMonitor("tz@example.com");
    const from = new Date(NOW - DAY);
    const to = new Date(NOW);
    const inZone = (zone: string) =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE '${zone}'`);
        const rows = await queryBuckets(tx, id, from, to, 900);
        return rows.map((r) => ({ ...r, at: new Date(r.atMs).toISOString() }));
      });
    const utc = await inZone("UTC");
    expect(utc).toHaveLength(97);
    expect(await inZone("Asia/Kolkata")).toEqual(utc); // UTC+05:30, a half-hour offset
    expect(await inZone("America/Los_Angeles")).toEqual(utc);
    expect(await inZone("Pacific/Kiritimati")).toEqual(utc); // UTC+14
  });
});

describe("analytics: incidents", () => {
  it("lists every incident that overlaps the window and counts those that started inside it", async () => {
    const agent = await registerAgent("inc@example.com", "PRO");
    const id = await newMonitor(agent);
    const mk = (type: "DOWN" | "DEGRADED", startedAgo: number, resolvedAgo: number | null) =>
      prisma.incident.create({
        data: {
          monitorId: id,
          type,
          status: resolvedAgo === null ? "OPEN" : "RESOLVED",
          resolution: resolvedAgo === null ? null : "RECOVERED",
          reason: "test",
          failedChecks: 3,
          startedAt: ago(startedAgo),
          resolvedAt: resolvedAgo === null ? null : ago(resolvedAgo),
          durationSec: resolvedAgo === null ? null : Math.round((startedAgo - resolvedAgo) / 1000),
          openKey: resolvedAgo === null ? `${id}:${type}` : null,
        },
      });
    await mk("DOWN", 3 * DAY, 3 * DAY - HOUR); // inside the 7 d window
    await mk("DEGRADED", 10 * DAY, 6 * DAY); // started before the window, still running into it
    await mk("DOWN", 20 * DAY, 15 * DAY); // entirely before the window
    await mk("DOWN", HOUR, null); // open right now

    const a = await getMonitorAnalytics(await ownerOf("inc@example.com"), id, { range: "7d" });
    expect(a.incidents.map((i) => [i.type, i.status])).toEqual([
      ["DEGRADED", "RESOLVED"],
      ["DOWN", "RESOLVED"],
      ["DOWN", "OPEN"],
    ]);
    expect(a.incidents[2]!.resolvedAt).toBeNull();
    expect(a.stats.totalIncidents).toBe(2); // only the two that STARTED inside the 7 days
  });
});

describe("GET /api/monitors/:id/analytics", () => {
  it("a monitor without checks answers a full series of gaps and null statistics", async () => {
    const agent = await registerAgent();
    const id = await newMonitor(agent);
    const res = await agent.get(`/api/monitors/${id}/analytics?range=24h`);
    expect(res.status).toBe(200);
    const a = res.body.analytics;
    expect(a).toMatchObject({ range: "24h", bucketSec: 900, incidents: [] });
    expect(a.stats).toEqual({
      currentMs: null,
      avgMs: null,
      minMs: null,
      maxMs: null,
      p95Ms: null,
      uptimePct: null,
      totalChecks: 0,
      successfulChecks: 0,
      slowChecks: 0,
      failedChecks: 0,
      totalIncidents: 0,
    });
    expect(a.series.length).toBeGreaterThanOrEqual(97);
    expect(
      a.series.every(
        (p: { total: number; uptimePct: number | null }) => p.total === 0 && p.uptimePct === null,
      ),
    ).toBe(true);
  });

  it("defaults to 24h", async () => {
    const agent = await registerAgent();
    const id = await newMonitor(agent);
    expect((await agent.get(`/api/monitors/${id}/analytics`)).body.analytics.range).toBe("24h");
  });

  it("matches the Phase 6 /stats endpoint on live data (same rules, same window)", async () => {
    const agent = await registerAgent();
    const id = await newMonitor(agent);
    await seed(id, [
      { outcome: "SUCCESS", responseTimeMs: 100, at: ago(1 * HOUR) },
      { outcome: "SUCCESS", responseTimeMs: 300, at: ago(2 * HOUR) },
      { outcome: "SLOW", responseTimeMs: 900, at: ago(4 * HOUR) },
      { outcome: "FAILURE", responseTimeMs: null, at: ago(5 * HOUR) },
      { outcome: "FAILURE", trigger: "MANUAL", responseTimeMs: null, at: ago(1 * HOUR) },
      { outcome: "FAILURE", responseTimeMs: null, at: ago(48 * HOUR) },
    ]);
    const analytics = (await agent.get(`/api/monitors/${id}/analytics?range=24h`)).body.analytics;
    const stats = (await agent.get(`/api/monitors/${id}/stats?range=24h`)).body.stats;
    expect(analytics.stats).toMatchObject({
      totalChecks: stats.totalChecks,
      successfulChecks: stats.successfulChecks,
      slowChecks: stats.slowChecks,
      failedChecks: stats.failedChecks,
      uptimePct: stats.uptimePct,
      avgMs: stats.avgResponseMs,
      minMs: stats.minResponseMs,
      maxMs: stats.maxResponseMs,
    });
    expect(analytics.stats.uptimePct).toBe(75);
  });

  it("the FREE plan cannot ask for 30d (403 with a plan message), PRO can", async () => {
    const free = await registerAgent("free@example.com");
    const freeId = await newMonitor(free);
    const denied = await free.get(`/api/monitors/${freeId}/analytics?range=30d`);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("RANGE_NOT_ALLOWED");
    expect(denied.body.error.message).toMatch(/FREE plan keeps 7 days/);
    expect((await free.get(`/api/monitors/${freeId}/analytics?range=7d`)).status).toBe(200);

    const pro = await registerAgent("pro@example.com", "PRO");
    const proId = await newMonitor(pro);
    const ok = await pro.get(`/api/monitors/${proId}/analytics?range=30d`);
    expect(ok.status).toBe(200);
    expect(ok.body.analytics.bucketSec).toBe(21_600);
  });

  it("rejects ranges it has no buckets for (1h, 1y) with 400", async () => {
    const agent = await registerAgent();
    const id = await newMonitor(agent);
    expect((await agent.get(`/api/monitors/${id}/analytics?range=1h`)).status).toBe(400);
    expect((await agent.get(`/api/monitors/${id}/analytics?range=1y`)).status).toBe(400);
  });

  it("another user's monitor and an unknown id answer 404 (SEC-4); a malformed id answers 400 (API-1)", async () => {
    const owner = await registerAgent("owner@example.com");
    const id = await newMonitor(owner);
    const other = await registerAgent("other@example.com");
    expect((await other.get(`/api/monitors/${id}/analytics`)).status).toBe(404);
    expect(
      (await owner.get(`/api/monitors/00000000-0000-4000-8000-000000000000/analytics`)).status,
    ).toBe(404);
    expect((await owner.get(`/api/monitors/not-a-uuid/analytics`)).status).toBe(400);
  });

  it("needs a login", async () => {
    const agent = await registerAgent();
    const id = await newMonitor(agent);
    expect((await request(createApp()).get(`/api/monitors/${id}/analytics`)).status).toBe(401);
  });
});
