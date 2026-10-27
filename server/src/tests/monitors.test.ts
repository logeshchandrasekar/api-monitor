import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { decrypt } from "../utils/crypto.js";
import { registerAgent, type Agent } from "./helpers.js";

// Literal public IPs keep these tests independent of DNS and network access
const base = { name: "Prod API", url: "https://8.8.8.8/health", intervalSec: 300 };

const create = (agent: Agent, overrides: Record<string, unknown> = {}) =>
  agent.post("/api/monitors").send({ ...base, ...overrides });

describe("authentication", () => {
  it("rejects anonymous requests", async () => {
    const res = await request(createApp()).get("/api/monitors");
    expect(res.status).toBe(401);
  });
});

describe("create and read", () => {
  it("creates a PENDING monitor with defaults and no secrets in the response", async () => {
    const agent = await registerAgent();
    const res = await create(agent);
    expect(res.status).toBe(201);
    const m = res.body.monitor;
    expect(m).toMatchObject({
      name: "Prod API",
      url: "https://8.8.8.8/health",
      method: "GET",
      expectedStatus: 200,
      followRedirects: true,
      timeoutMs: 10000,
      responseThresholdMs: 1000,
      status: "PENDING",
      isPaused: false,
      hasBody: false,
      tags: [],
    });
    expect(new Date(m.nextCheckAt).getTime()).toBeGreaterThan(Date.now() - 1000);
    expect(m).not.toHaveProperty("headersEnc");
    expect(m).not.toHaveProperty("bodyEnc");
    expect(m).not.toHaveProperty("userId");
  });

  it("stores headers and body encrypted and never returns sensitive values", async () => {
    const agent = await registerAgent();
    const res = await create(agent, {
      method: "POST",
      headers: [
        { name: "Authorization", value: "Bearer super-secret-token" },
        { name: "X-Env", value: "prod" },
      ],
      body: '{"password":"hunter2"}',
    });
    expect(res.status).toBe(201);
    expect(JSON.stringify(res.body)).not.toContain("super-secret-token");
    expect(res.body.monitor.headers).toEqual([
      { name: "Authorization", value: null, sensitive: true },
      { name: "X-Env", value: "prod", sensitive: false },
    ]);

    const row = await prisma.monitor.findUniqueOrThrow({ where: { id: res.body.monitor.id } });
    expect(row.headersEnc).not.toContain("super-secret-token");
    expect(row.bodyEnc).not.toContain("hunter2");
    expect(decrypt(row.headersEnc!)).toContain("super-secret-token");

    const list = await agent.get("/api/monitors");
    expect(JSON.stringify(list.body)).not.toContain("hunter2");
    expect(list.body.items[0]).not.toHaveProperty("headers");
  });

  it("normalises URL and tags", async () => {
    const agent = await registerAgent();
    const res = await create(agent, {
      url: "https://Example.COM",
      tags: ["Production", "production"],
    });
    expect(res.body.monitor.url).toBe("https://example.com/");
    expect(res.body.monitor.tags).toEqual(["production"]);
  });

  it("ignores attempts to set server-controlled fields", async () => {
    const agent = await registerAgent();
    const res = await create(agent, { status: "DOWN", isPaused: true, failStreak: 9, userId: "x" });
    expect(res.body.monitor).toMatchObject({ status: "PENDING", isPaused: false, failStreak: 0 });
  });
});

describe("validation", () => {
  it.each([
    ["http://localhost:3000", "BLOCKED_TARGET"],
    ["http://127.0.0.1", "BLOCKED_TARGET"],
    ["http://169.254.169.254/latest/meta-data/", "BLOCKED_TARGET"],
    ["http://192.168.1.10", "BLOCKED_TARGET"],
    ["http://[::1]/", "BLOCKED_TARGET"],
    ["http://2130706433", "BLOCKED_TARGET"],
    ["ftp://8.8.8.8", "INVALID_URL"],
    ["not a url", "INVALID_URL"],
    ["http://user:pass@8.8.8.8", "INVALID_URL"],
  ])("rejects %s", async (url, code) => {
    const agent = await registerAgent();
    const res = await create(agent, { url });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(code);
  });

  it("rejects a private URL on update too", async () => {
    const agent = await registerAgent();
    const { body } = await create(agent);
    const res = await agent
      .patch(`/api/monitors/${body.monitor.id}`)
      .send({ url: "http://10.0.0.1" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BLOCKED_TARGET");
  });

  it("rejects an interval below the plan minimum", async () => {
    const agent = await registerAgent();
    const res = await create(agent, { intervalSec: 60 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INTERVAL_NOT_ALLOWED");
  });

  it("allows 1-minute checks on PRO", async () => {
    const agent = await registerAgent("pro@example.com", "PRO");
    expect((await create(agent, { intervalSec: 60 })).status).toBe(201);
  });

  it("rejects a timeout that is not shorter than the interval", async () => {
    const agent = await registerAgent();
    const res = await create(agent, { intervalSec: 10, timeoutMs: 10000 });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe("timeoutMs");
  });

  it("rejects a body on GET and HEAD", async () => {
    const agent = await registerAgent();
    for (const method of ["GET", "HEAD"]) {
      const res = await create(agent, { method, body: "{}" });
      expect(res.status).toBe(400);
    }
  });

  it("rejects forbidden headers and bad ids", async () => {
    const agent = await registerAgent();
    expect((await create(agent, { headers: [{ name: "Host", value: "evil" }] })).status).toBe(400);
    expect((await agent.get("/api/monitors/not-a-uuid")).status).toBe(400);
  });
});

describe("ownership (SEC-4)", () => {
  type Call = (agent: Agent, id: string) => PromiseLike<{ status: number }>;
  const calls: [string, Call][] = [
    ["get", (a, id) => a.get(`/api/monitors/${id}`)],
    ["patch", (a, id) => a.patch(`/api/monitors/${id}`).send({ name: "hacked" })],
    ["delete", (a, id) => a.delete(`/api/monitors/${id}`)],
    ["pause", (a, id) => a.post(`/api/monitors/${id}/pause`)],
    ["resume", (a, id) => a.post(`/api/monitors/${id}/resume`)],
    ["duplicate", (a, id) => a.post(`/api/monitors/${id}/duplicate`)],
  ];

  it.each(calls)("user B cannot %s user A's monitor (404, not 403)", async (_name, call) => {
    const a = await registerAgent("a@example.com");
    const b = await registerAgent("b@example.com");
    const { body } = await create(a);
    const id = body.monitor.id;

    expect((await call(b, id)).status).toBe(404);

    const row = await prisma.monitor.findUniqueOrThrow({ where: { id } });
    expect(row.name).toBe("Prod API");
    expect(row.isPaused).toBe(false);
    expect(await prisma.monitor.count()).toBe(1);
  });

  it("lists only your own monitors", async () => {
    const a = await registerAgent("a@example.com");
    const b = await registerAgent("b@example.com");
    await create(a, { name: "A1" });
    await create(b, { name: "B1" });
    const res = await a.get("/api/monitors");
    expect(res.body.items.map((m: { name: string }) => m.name)).toEqual(["A1"]);
  });
});

describe("plan limits", () => {
  it("blocks the 6th monitor on FREE", async () => {
    const agent = await registerAgent();
    for (let i = 0; i < 5; i++) expect((await create(agent, { name: `M${i}` })).status).toBe(201);
    const sixth = await create(agent, { name: "M6" });
    expect(sixth.status).toBe(403);
    expect(sixth.body.error.code).toBe("MONITOR_LIMIT_REACHED");
    expect(sixth.body.error.message).toMatch(/upgrade/i);
  });

  it("also blocks duplicating at the limit", async () => {
    const agent = await registerAgent();
    let firstId = "";
    for (let i = 0; i < 5; i++) {
      const res = await create(agent, { name: `M${i}` });
      firstId ||= res.body.monitor.id;
    }
    const res = await agent.post(`/api/monitors/${firstId}/duplicate`);
    expect(res.status).toBe(403);
  });

  it("allows more on PRO", async () => {
    const agent = await registerAgent("pro@example.com", "PRO");
    for (let i = 0; i < 6; i++) expect((await create(agent, { name: `M${i}` })).status).toBe(201);
  });

  it("cannot be bypassed with parallel requests", async () => {
    const agent = await registerAgent();
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => create(agent, { name: `P${i}` })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    expect(results.filter((r) => r.status === 403)).toHaveLength(3);
    expect(await prisma.monitor.count()).toBe(5);
  });
});

describe("update", () => {
  it("keeps saved secret headers when asked to, and replaces others", async () => {
    const agent = await registerAgent();
    const { body } = await create(agent, {
      headers: [
        { name: "Authorization", value: "Bearer keep-me" },
        { name: "X-Env", value: "prod" },
      ],
    });
    const id = body.monitor.id;
    const res = await agent.patch(`/api/monitors/${id}`).send({
      headers: [
        { name: "Authorization", keepExisting: true },
        { name: "X-Env", value: "staging" },
      ],
    });
    expect(res.status).toBe(200);
    const row = await prisma.monitor.findUniqueOrThrow({ where: { id } });
    const stored = decrypt(row.headersEnc!);
    expect(stored).toContain("Bearer keep-me");
    expect(stored).toContain("staging");
    expect(JSON.stringify(res.body)).not.toContain("keep-me");
  });

  it("rejects keepExisting for a header that was never saved", async () => {
    const agent = await registerAgent();
    const { body } = await create(agent);
    const res = await agent
      .patch(`/api/monitors/${body.monitor.id}`)
      .send({ headers: [{ name: "Authorization", keepExisting: true }] });
    expect(res.status).toBe(400);
  });

  it("resets state after a material edit but not after a cosmetic one", async () => {
    const agent = await registerAgent();
    const { body } = await create(agent);
    const id = body.monitor.id;
    const makeDown = () =>
      prisma.monitor.update({
        where: { id },
        data: { status: "DOWN", failStreak: 3, lastStatusCode: 500 },
      });

    await makeDown();
    const cosmetic = await agent
      .patch(`/api/monitors/${id}`)
      .send({ name: "Renamed", tags: ["x"] });
    expect(cosmetic.body.monitor).toMatchObject({ status: "DOWN", failStreak: 3, name: "Renamed" });

    const material = await agent.patch(`/api/monitors/${id}`).send({ url: "https://1.1.1.1/new" });
    expect(material.body.monitor).toMatchObject({
      status: "PENDING",
      failStreak: 0,
      lastStatusCode: null,
    });

    await makeDown();
    const sameValue = await agent.patch(`/api/monitors/${id}`).send({ url: "https://1.1.1.1/new" });
    expect(sameValue.body.monitor.status).toBe("DOWN"); // unchanged URL is not a material edit
  });

  it("a PATCH with one field leaves every other field alone", async () => {
    const agent = await registerAgent();
    const { body } = await create(agent, {
      expectedStatus: 204,
      timeoutMs: 5000,
      followRedirects: false,
    });
    const res = await agent
      .patch(`/api/monitors/${body.monitor.id}`)
      .send({ name: "Only the name" });
    expect(res.body.monitor).toMatchObject({
      expectedStatus: 204,
      timeoutMs: 5000,
      followRedirects: false,
    });
  });
});

describe("pause, resume, duplicate, delete", () => {
  it("pauses and resumes (idempotently), resetting state on resume", async () => {
    const agent = await registerAgent();
    const { body } = await create(agent);
    const id = body.monitor.id;

    const paused = await agent.post(`/api/monitors/${id}/pause`);
    expect(paused.body.monitor.isPaused).toBe(true);
    expect((await agent.post(`/api/monitors/${id}/pause`)).status).toBe(200);

    await prisma.monitor.update({ where: { id }, data: { status: "DOWN", failStreak: 3 } });
    const resumed = await agent.post(`/api/monitors/${id}/resume`);
    expect(resumed.body.monitor).toMatchObject({
      isPaused: false,
      status: "PENDING",
      failStreak: 0,
    });
    expect((await agent.post(`/api/monitors/${id}/resume`)).status).toBe(200);
  });

  it("duplicates configuration, including saved secrets, as a fresh monitor", async () => {
    const agent = await registerAgent();
    const { body } = await create(agent, {
      headers: [{ name: "Authorization", value: "Bearer abc" }],
      tags: ["x"],
    });
    await prisma.monitor.update({ where: { id: body.monitor.id }, data: { status: "DOWN" } });

    const res = await agent.post(`/api/monitors/${body.monitor.id}/duplicate`);
    expect(res.status).toBe(201);
    expect(res.body.monitor.id).not.toBe(body.monitor.id);
    expect(res.body.monitor).toMatchObject({
      name: "Prod API (copy)",
      status: "PENDING",
      tags: ["x"],
    });
    expect(res.body.monitor.headers).toEqual([
      { name: "Authorization", value: null, sensitive: true },
    ]);

    const row = await prisma.monitor.findUniqueOrThrow({ where: { id: res.body.monitor.id } });
    expect(decrypt(row.headersEnc!)).toContain("Bearer abc");
  });

  it("deletes a monitor", async () => {
    const agent = await registerAgent();
    const { body } = await create(agent);
    expect((await agent.delete(`/api/monitors/${body.monitor.id}`)).status).toBe(204);
    expect((await agent.get(`/api/monitors/${body.monitor.id}`)).status).toBe(404);
  });

  it("deleting a user removes their monitors", async () => {
    const agent = await registerAgent();
    await create(agent);
    await prisma.user.deleteMany();
    expect(await prisma.monitor.count()).toBe(0);
  });
});

describe("listing", () => {
  it("paginates with a cursor, newest first", async () => {
    const agent = await registerAgent("pro@example.com", "PRO");
    for (const name of ["one", "two", "three"]) await create(agent, { name });

    const first = await agent.get("/api/monitors?limit=2");
    expect(first.body.items.map((m: { name: string }) => m.name)).toEqual(["three", "two"]);
    expect(first.body.nextCursor).toBeTruthy();

    const second = await agent.get(`/api/monitors?limit=2&cursor=${first.body.nextCursor}`);
    expect(second.body.items.map((m: { name: string }) => m.name)).toEqual(["one"]);
    expect(second.body.nextCursor).toBeNull();
  });

  it("filters by status, with PAUSED as its own filter", async () => {
    const agent = await registerAgent();
    const a = (await create(agent, { name: "healthy-one" })).body.monitor.id;
    const b = (await create(agent, { name: "paused-one" })).body.monitor.id;
    await create(agent, { name: "pending-one" });
    await prisma.monitor.update({ where: { id: a }, data: { status: "HEALTHY" } });
    await agent.post(`/api/monitors/${b}/pause`);

    const names = async (q: string) =>
      (await agent.get(`/api/monitors?status=${q}`)).body.items.map(
        (m: { name: string }) => m.name,
      );
    expect(await names("HEALTHY")).toEqual(["healthy-one"]);
    expect(await names("PAUSED")).toEqual(["paused-one"]);
    expect(await names("PENDING")).toEqual(["pending-one"]);
  });

  it("rejects bad query values", async () => {
    const agent = await registerAgent();
    expect((await agent.get("/api/monitors?limit=1000")).status).toBe(400);
    expect((await agent.get("/api/monitors?status=NOPE")).status).toBe(400);
  });
});
