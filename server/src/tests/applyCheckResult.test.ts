import { describe, expect, it } from "vitest";
import type { Prisma } from "../generated/prisma/client.js";
import { onIncidentEvent, type IncidentEvent } from "../lib/incidentEvents.js";
import { prisma } from "../lib/prisma.js";
import { applyCheckResult } from "../services/applyCheckResult.js";
import type { CheckResult } from "../services/checkRunner.js";
import { registerAgent } from "./helpers.js";

// ---- a fake clock: every check carries its own timestamp ----
const T0 = new Date("2026-01-01T00:00:00.000Z");
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

const ok = (s: number): CheckResult => ({
  outcome: "SUCCESS",
  failureType: null,
  statusCode: 200,
  responseTimeMs: 120,
  errorMessage: null,
  checkedAt: at(s),
});
const slow = (s: number): CheckResult => ({
  outcome: "SLOW",
  failureType: null,
  statusCode: 200,
  responseTimeMs: 2500,
  errorMessage: null,
  checkedAt: at(s),
});
const fail = (s: number): CheckResult => ({
  outcome: "FAILURE",
  failureType: "CONNECTION",
  statusCode: null,
  responseTimeMs: null,
  errorMessage: "Could not connect to the server. It may be down or refusing connections.",
  checkedAt: at(s),
});

async function seedMonitor(overrides: Partial<Prisma.MonitorUncheckedCreateInput> = {}) {
  let user = await prisma.user.findFirst();
  if (!user) {
    await registerAgent();
    user = await prisma.user.findFirstOrThrow();
  }
  return prisma.monitor.create({
    data: {
      userId: user.id,
      name: "seeded",
      url: "https://8.8.8.8/health",
      intervalSec: 10,
      timeoutMs: 2000,
      nextCheckAt: new Date(Date.now() + 60_000),
      status: "HEALTHY",
      ...overrides,
    },
  });
}

/** Applies a result the way the scheduler would: with the monitor's current id and epoch. */
const apply = async (monitorId: string, result: CheckResult) =>
  applyCheckResult(await prisma.monitor.findUniqueOrThrow({ where: { id: monitorId } }), result);

const monitorOf = (id: string) => prisma.monitor.findUniqueOrThrow({ where: { id } });
const incidentsOf = (monitorId: string) =>
  prisma.incident.findMany({ where: { monitorId }, orderBy: { startedAt: "asc" } });

describe("first check", () => {
  it("PENDING + success -> HEALTHY, stores the check and the last* columns", async () => {
    const m = await seedMonitor({ status: "PENDING" });
    const r = await apply(m.id, ok(0));
    expect(r.applied).toBe(true);

    expect(await monitorOf(m.id)).toMatchObject({
      status: "HEALTHY",
      okStreak: 1,
      failStreak: 0,
      lastStatusCode: 200,
      lastResponseTimeMs: 120,
      lastCheckedAt: at(0),
      lastStatusChangeAt: at(0),
    });
    const [check] = await prisma.check.findMany({ where: { monitorId: m.id } });
    expect(check).toMatchObject({ trigger: "SCHEDULED", outcome: "SUCCESS", checkedAt: at(0) });
    expect(await incidentsOf(m.id)).toHaveLength(0);
  });
});

describe("a DOWN incident: open, count, resolve", () => {
  it("two failures do nothing; the third opens exactly one incident; recovery closes it with the right duration", async () => {
    const m = await seedMonitor();

    await apply(m.id, fail(0));
    await apply(m.id, fail(10));
    expect(await monitorOf(m.id)).toMatchObject({ status: "HEALTHY", failStreak: 2 }); // "1 failed check" stays visible, state unchanged
    expect(await incidentsOf(m.id)).toHaveLength(0);

    await apply(m.id, fail(20));
    expect(await monitorOf(m.id)).toMatchObject({
      status: "DOWN",
      failStreak: 3,
      lastStatusChangeAt: at(20),
      lastStatusCode: null,
    });
    let incidents = await incidentsOf(m.id);
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({
      type: "DOWN",
      status: "OPEN",
      failedChecks: 3,
      failureType: "CONNECTION",
      startedAt: at(20),
      resolvedAt: null,
      resolution: null,
      durationSec: null,
      openKey: `${m.id}:DOWN`,
    });
    expect(incidents[0]!.reason).toContain("3 failed checks in a row");
    expect(incidents[0]!.reason).toContain("Could not connect");

    await apply(m.id, fail(30)); // outage continues: same incident, one more failed check
    incidents = await incidentsOf(m.id);
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.failedChecks).toBe(4);

    await apply(m.id, ok(145)); // recovers 125 s after the incident started
    expect(await monitorOf(m.id)).toMatchObject({
      status: "HEALTHY",
      failStreak: 0,
      okStreak: 1,
      lastStatusChangeAt: at(145),
    });
    incidents = await incidentsOf(m.id);
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({
      status: "RESOLVED",
      resolution: "RECOVERED",
      resolvedAt: at(145),
      durationSec: 125,
      failedChecks: 4,
      openKey: null,
    });
  });

  it("a second outage later opens a second incident (resolved ones do not block it)", async () => {
    const m = await seedMonitor();
    for (const s of [0, 10, 20]) await apply(m.id, fail(s));
    await apply(m.id, ok(30));
    for (const s of [40, 50, 60]) await apply(m.id, fail(s));
    const incidents = await incidentsOf(m.id);
    expect(incidents.map((i) => i.status)).toEqual(["RESOLVED", "OPEN"]);
  });
});

describe("a DEGRADED incident", () => {
  it("three slow checks open it; three fast ones close it", async () => {
    const m = await seedMonitor();
    for (const s of [0, 10, 20]) await apply(m.id, slow(s));
    expect(await monitorOf(m.id)).toMatchObject({ status: "DEGRADED", slowStreak: 3 });
    expect((await incidentsOf(m.id))[0]).toMatchObject({
      type: "DEGRADED",
      status: "OPEN",
      failedChecks: 3,
      failureType: null,
    });

    for (const s of [30, 40]) await apply(m.id, ok(s));
    expect((await monitorOf(m.id)).status).toBe("DEGRADED"); // two fast checks are not enough
    await apply(m.id, ok(50));
    expect((await monitorOf(m.id)).status).toBe("HEALTHY");
    expect((await incidentsOf(m.id))[0]).toMatchObject({
      status: "RESOLVED",
      resolution: "RECOVERED",
      durationSec: 30,
    });
  });

  it("going down while DEGRADED closes the DEGRADED incident and opens a DOWN one: only one is ever open", async () => {
    const m = await seedMonitor();
    for (const s of [0, 10, 20]) await apply(m.id, slow(s));
    for (const s of [30, 40, 50]) await apply(m.id, fail(s));

    expect((await monitorOf(m.id)).status).toBe("DOWN");
    const incidents = await incidentsOf(m.id);
    expect(incidents.map((i) => `${i.type}:${i.status}`)).toEqual([
      "DEGRADED:RESOLVED",
      "DOWN:OPEN",
    ]);
    expect(incidents[0]).toMatchObject({ resolution: "RECOVERED", durationSec: 30, openKey: null });
    expect(await prisma.incident.count({ where: { monitorId: m.id, status: "OPEN" } })).toBe(1);
  });

  it("DOWN then a slow success: the DOWN incident closes and a DEGRADED one opens", async () => {
    const m = await seedMonitor({ status: "DOWN", failStreak: 5 });
    await prisma.incident.create({
      data: {
        monitorId: m.id,
        type: "DOWN",
        reason: "seed",
        failedChecks: 5,
        startedAt: at(0),
        openKey: `${m.id}:DOWN`,
      },
    });

    await apply(m.id, slow(60));
    expect(await monitorOf(m.id)).toMatchObject({
      status: "DEGRADED",
      failStreak: 0,
      slowStreak: 1,
    });
    const incidents = await incidentsOf(m.id);
    expect(incidents.map((i) => `${i.type}:${i.status}`)).toEqual([
      "DOWN:RESOLVED",
      "DEGRADED:OPEN",
    ]);
    expect(incidents[0]).toMatchObject({ resolution: "RECOVERED", durationSec: 60 });
    expect(incidents[1]).toMatchObject({ failedChecks: 1 });
    expect(incidents[1]!.reason).toContain("answering again but slowly");
  });
});

describe("events", () => {
  it("emits INCIDENT_OPENED and INCIDENT_RESOLVED once each, after the commit", async () => {
    const m = await seedMonitor();
    const seen: IncidentEvent[] = [];
    const off = onIncidentEvent((e) => void seen.push(e));
    try {
      for (const s of [0, 10, 20]) await apply(m.id, fail(s));
      expect(seen.map((e) => e.type)).toEqual(["INCIDENT_OPENED"]);
      await apply(m.id, fail(30)); // still the same incident: no event
      expect(seen).toHaveLength(1);
      await apply(m.id, ok(40));
      expect(seen.map((e) => e.type)).toEqual(["INCIDENT_OPENED", "INCIDENT_RESOLVED"]);

      // the event payload is the committed row: it already exists in the database
      const opened = seen[0]!;
      expect(
        await prisma.incident.findUnique({ where: { id: opened.incident.id } }),
      ).not.toBeNull();
      expect(seen[1]).toMatchObject({
        escalated: false,
        incident: { status: "RESOLVED", durationSec: 20 },
      });
    } finally {
      off();
    }
  });

  it("flags a DEGRADED incident that was closed only because the monitor went DOWN", async () => {
    const m = await seedMonitor({ status: "DEGRADED", slowStreak: 3 });
    await prisma.incident.create({
      data: {
        monitorId: m.id,
        type: "DEGRADED",
        reason: "seed",
        failedChecks: 3,
        startedAt: at(0),
        openKey: `${m.id}:DEGRADED`,
      },
    });
    const seen: IncidentEvent[] = [];
    const off = onIncidentEvent((e) => void seen.push(e));
    try {
      for (const s of [10, 20, 30]) await apply(m.id, fail(s));
    } finally {
      off();
    }
    expect(seen.map((e) => e.type)).toEqual(["INCIDENT_RESOLVED", "INCIDENT_OPENED"]);
    expect(seen[0]).toMatchObject({ escalated: true, incident: { type: "DEGRADED" } });
  });

  it("a listener that throws or rejects cannot break the pipeline", async () => {
    const m = await seedMonitor();
    const offA = onIncidentEvent(() => {
      throw new Error("listener exploded");
    });
    const offB = onIncidentEvent(async () => {
      throw new Error("async listener exploded");
    });
    try {
      for (const s of [0, 10, 20])
        await expect(apply(m.id, fail(s))).resolves.toMatchObject({ applied: true });
      expect(await incidentsOf(m.id)).toHaveLength(1);
    } finally {
      offA();
      offB();
    }
  });
});

describe("stale results are discarded", () => {
  const checkCount = (monitorId: string) => prisma.check.count({ where: { monitorId } });

  it("when the monitor was edited, paused or resumed since the check was claimed (epoch changed)", async () => {
    const m = await seedMonitor();
    const claimed = await monitorOf(m.id); // the scheduler claimed this version...
    await prisma.monitor.update({ where: { id: m.id }, data: { stateEpoch: { increment: 1 } } }); // ...then the user edited it

    const r = await applyCheckResult(claimed, fail(0));
    expect(r).toEqual({ applied: false, events: [] });
    expect(await checkCount(m.id)).toBe(0);
    expect(await monitorOf(m.id)).toMatchObject({ failStreak: 0, lastCheckedAt: null });
  });

  it("when the monitor is paused", async () => {
    const m = await seedMonitor({ isPaused: true });
    const r = await applyCheckResult(m, fail(0));
    expect(r.applied).toBe(false);
    expect(await checkCount(m.id)).toBe(0);
  });

  it("when the monitor was deleted (no error)", async () => {
    const m = await seedMonitor();
    await prisma.monitor.delete({ where: { id: m.id } });
    await expect(applyCheckResult(m, fail(0))).resolves.toEqual({ applied: false, events: [] });
  });
});

describe("concurrency and integrity", () => {
  it("two results for the same monitor applied at the same instant never duplicate the incident", async () => {
    const m = await seedMonitor({ failStreak: 2 }); // one more failure tips it
    const results = await Promise.all([apply(m.id, fail(0)), apply(m.id, fail(1))]);
    expect(results.every((r) => r.applied)).toBe(true);

    expect(await monitorOf(m.id)).toMatchObject({ status: "DOWN", failStreak: 4 }); // no lost update: 2 + 1 + 1
    const incidents = await incidentsOf(m.id);
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.failedChecks).toBe(4);
    expect(await prisma.check.count({ where: { monitorId: m.id } })).toBe(2);
  });

  it("the database itself refuses a second OPEN incident of the same type (unique openKey)", async () => {
    const m = await seedMonitor();
    const data = {
      monitorId: m.id,
      type: "DOWN" as const,
      reason: "x",
      startedAt: at(0),
      openKey: `${m.id}:DOWN`,
    };
    await prisma.incident.create({ data });
    await expect(prisma.incident.create({ data })).rejects.toMatchObject({ code: "P2002" });
    // ...but a different type, and any number of resolved incidents (openKey NULL), are fine
    await prisma.incident.create({
      data: { ...data, type: "DEGRADED", openKey: `${m.id}:DEGRADED` },
    });
    await prisma.incident.create({ data: { ...data, openKey: null, status: "RESOLVED" } });
    await prisma.incident.create({ data: { ...data, openKey: null, status: "RESOLVED" } });
  });

  it("survives a DOWN monitor with no incident row (inconsistent data): the state still recovers", async () => {
    const m = await seedMonitor({ status: "DOWN", failStreak: 4 });
    await expect(apply(m.id, ok(0))).resolves.toMatchObject({ applied: true });
    expect((await monitorOf(m.id)).status).toBe("HEALTHY");
  });
});
