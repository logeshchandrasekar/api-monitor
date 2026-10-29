import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import type { CheckInput, CheckResult, CheckRunner } from "../services/checkRunner.js";
import { setCheckRunner } from "../services/checks.js";
import { registerAgent, type Agent } from "./helpers.js";

// Literal public IP: creating the monitor never needs DNS. The runner is stubbed, so nothing is ever fetched.
const base = { name: "Prod API", url: "https://8.8.8.8/health", intervalSec: 300 };

const result = (overrides: Partial<CheckResult> = {}): CheckResult => ({
  outcome: "SUCCESS",
  failureType: null,
  statusCode: 200,
  responseTimeMs: 42,
  errorMessage: null,
  checkedAt: new Date(),
  ...overrides,
});
const stub = (r: CheckResult = result()): CheckRunner => async () => r;

afterEach(() => setCheckRunner(null));

async function newMonitor(agent: Agent, overrides: Record<string, unknown> = {}) {
  const res = await agent.post("/api/monitors").send({ ...base, ...overrides });
  expect(res.status).toBe(201);
  return res.body.monitor.id as string;
}

describe("POST /api/monitors/:id/check (manual check)", () => {
  it("returns the result, stores it as MANUAL, and does NOT touch the monitor (ENG-4)", async () => {
    setCheckRunner(stub());
    const agent = await registerAgent();
    const id = await newMonitor(agent);

    const res = await agent.post(`/api/monitors/${id}/check`);
    expect(res.status).toBe(201);
    expect(res.body.check).toMatchObject({ trigger: "MANUAL", outcome: "SUCCESS", statusCode: 200, responseTimeMs: 42 });
    expect(typeof res.body.check.id).toBe("string"); // BigInt id, serialised as a string
    expect(res.body.check).not.toHaveProperty("monitorId");

    const rows = await prisma.check.findMany({ where: { monitorId: id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.trigger).toBe("MANUAL");

    const monitor = await prisma.monitor.findUniqueOrThrow({ where: { id } });
    expect(monitor).toMatchObject({ status: "PENDING", lastCheckedAt: null, lastStatusCode: null, failStreak: 0 });
  });

  it("stores failures too, and a failing manual check never changes the monitor", async () => {
    setCheckRunner(
      stub(result({ outcome: "FAILURE", failureType: "CONNECTION", statusCode: null, responseTimeMs: null, errorMessage: "Could not connect to the server. It may be down or refusing connections." })),
    );
    const agent = await registerAgent();
    const id = await newMonitor(agent);
    const res = await agent.post(`/api/monitors/${id}/check`);
    expect(res.body.check).toMatchObject({ outcome: "FAILURE", failureType: "CONNECTION", statusCode: null });
    expect((await prisma.monitor.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");
  });

  it("hands the runner the decrypted headers and body, and never returns them", async () => {
    let seen: CheckInput | undefined;
    setCheckRunner(async (input) => {
      seen = input;
      return result();
    });
    const agent = await registerAgent();
    const id = await newMonitor(agent, {
      method: "POST",
      headers: [{ name: "Authorization", value: "Bearer very-secret" }],
      body: '{"a":1}',
    });
    const res = await agent.post(`/api/monitors/${id}/check`);
    expect(seen).toMatchObject({
      url: "https://8.8.8.8/health",
      method: "POST",
      body: '{"a":1}',
      headers: [{ name: "Authorization", value: "Bearer very-secret" }],
      expectedStatus: 200,
      timeoutMs: 10000,
    });
    expect(JSON.stringify(res.body)).not.toContain("very-secret");
  });

  it("works on a paused monitor", async () => {
    setCheckRunner(stub());
    const agent = await registerAgent();
    const id = await newMonitor(agent);
    await agent.post(`/api/monitors/${id}/pause`);
    expect((await agent.post(`/api/monitors/${id}/check`)).status).toBe(201);
  });

  it("is 404 for someone else's monitor and runs nothing (SEC-4)", async () => {
    let called = false;
    setCheckRunner(async () => {
      called = true;
      return result();
    });
    const a = await registerAgent("a@example.com");
    const b = await registerAgent("b@example.com");
    const id = await newMonitor(a);
    expect((await b.post(`/api/monitors/${id}/check`)).status).toBe(404);
    expect(called).toBe(false);
    expect(await prisma.check.count()).toBe(0);
  });

  it("rejects anonymous requests and malformed ids", async () => {
    expect((await request(createApp()).post("/api/monitors/00000000-0000-4000-8000-000000000000/check")).status).toBe(401);
    const agent = await registerAgent();
    expect((await agent.post("/api/monitors/not-a-uuid/check")).status).toBe(400);
  });

  it("allows only one check in flight per monitor (409), then works again", async () => {
    let release!: () => void;
    let started!: () => void;
    const startedP = new Promise<void>((r) => (started = r));
    const gate = new Promise<void>((r) => (release = r));
    setCheckRunner(async () => {
      started();
      await gate;
      return result();
    });
    const agent = await registerAgent();
    const id = await newMonitor(agent);

    const first = agent.post(`/api/monitors/${id}/check`).then((r) => r);
    await startedP; // the first check is now definitely running
    const second = await agent.post(`/api/monitors/${id}/check`);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("CHECK_IN_PROGRESS");

    release();
    expect((await first).status).toBe(201);
    setCheckRunner(stub());
    expect((await agent.post(`/api/monitors/${id}/check`)).status).toBe(201);
    expect(await prisma.check.count()).toBe(2);
  });

  it("is limited to 6 per minute per user (SEC-5), without affecting other users", async () => {
    setCheckRunner(stub());
    const a = await registerAgent("a@example.com");
    const b = await registerAgent("b@example.com");
    const idA = await newMonitor(a);
    const idB = await newMonitor(b);

    for (let i = 0; i < 6; i++) expect((await a.post(`/api/monitors/${idA}/check`)).status).toBe(201);
    const limited = await a.post(`/api/monitors/${idA}/check`);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");

    expect((await b.post(`/api/monitors/${idB}/check`)).status).toBe(201);
  });
});

describe("GET /api/monitors/:id/checks", () => {
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
  const seedChecks = (monitorId: string, ages: number[]) =>
    prisma.check.createMany({
      data: ages.map((age) => ({ monitorId, trigger: "SCHEDULED" as const, outcome: "SUCCESS" as const, statusCode: 200, responseTimeMs: 100, checkedAt: minutesAgo(age) })),
    });

  it("paginates with a cursor, newest first, ids as strings", async () => {
    const agent = await registerAgent();
    const id = await newMonitor(agent);
    await seedChecks(id, [50, 40, 30, 20, 10]);

    const first = await agent.get(`/api/monitors/${id}/checks?limit=2`);
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(2);
    expect(typeof first.body.items[0].id).toBe("string");
    expect(first.body.nextCursor).toEqual(first.body.items[1].id);

    const second = await agent.get(`/api/monitors/${id}/checks?limit=2&cursor=${first.body.nextCursor}`);
    const third = await agent.get(`/api/monitors/${id}/checks?limit=2&cursor=${second.body.nextCursor}`);
    expect(second.body.items).toHaveLength(2);
    expect(third.body.items).toHaveLength(1);
    expect(third.body.nextCursor).toBeNull();

    const all = [...first.body.items, ...second.body.items, ...third.body.items] as { id: string; checkedAt: string }[];
    expect(new Set(all.map((c) => c.id)).size).toBe(5);
    const times = all.map((c) => new Date(c.checkedAt).getTime());
    expect(times).toEqual([...times].sort((x, y) => y - x)); // strictly newest first across pages
  });

  it("filters by range", async () => {
    const agent = await registerAgent("pro@example.com", "PRO");
    const id = await newMonitor(agent, { intervalSec: 60 });
    await seedChecks(id, [30, 180, 3 * 24 * 60]); // 30 min, 3 h, 3 days ago
    const count = async (range: string) => (await agent.get(`/api/monitors/${id}/checks?range=${range}`)).body.items.length;
    expect(await count("1h")).toBe(1);
    expect(await count("24h")).toBe(2);
    expect(await count("7d")).toBe(3);
    expect(await count("30d")).toBe(3);
  });

  it("caps the range by plan retention: FREE keeps 7 days", async () => {
    const agent = await registerAgent();
    const id = await newMonitor(agent);
    expect((await agent.get(`/api/monitors/${id}/checks?range=7d`)).status).toBe(200);
    const res = await agent.get(`/api/monitors/${id}/checks?range=30d`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("RANGE_NOT_ALLOWED");
  });

  it("includes manual and scheduled checks, each labelled", async () => {
    setCheckRunner(stub());
    const agent = await registerAgent();
    const id = await newMonitor(agent);
    await seedChecks(id, [5]);
    await agent.post(`/api/monitors/${id}/check`);
    const res = await agent.get(`/api/monitors/${id}/checks`);
    expect(res.body.items.map((c: { trigger: string }) => c.trigger).sort()).toEqual(["MANUAL", "SCHEDULED"]);
  });

  it("is 404 for someone else's monitor and for unknown ids (SEC-4)", async () => {
    const a = await registerAgent("a@example.com");
    const b = await registerAgent("b@example.com");
    const id = await newMonitor(a);
    await seedChecks(id, [5]);
    expect((await b.get(`/api/monitors/${id}/checks`)).status).toBe(404);
    expect((await a.get("/api/monitors/00000000-0000-4000-8000-000000000000/checks")).status).toBe(404);
  });

  it("rejects bad query values", async () => {
    const agent = await registerAgent();
    const id = await newMonitor(agent);
    for (const q of ["limit=0", "limit=1000", "cursor=abc", "cursor=-1", "range=1y"]) {
      expect((await agent.get(`/api/monitors/${id}/checks?${q}`)).status, q).toBe(400);
    }
  });

  it("deleting a monitor deletes its checks", async () => {
    const agent = await registerAgent();
    const id = await newMonitor(agent);
    await seedChecks(id, [5, 10]);
    await agent.delete(`/api/monitors/${id}`);
    expect(await prisma.check.count()).toBe(0);
  });
});