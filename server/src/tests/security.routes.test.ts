import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { registerAgent, type Agent } from "./helpers.js";

/**
 * The route inventory is read from the source files, so a new route that is not listed below makes this test fail.
 * That is the point: every route has to be put in one of three groups and tested accordingly (SEC-3, SEC-4).
 */
function inventory(): string[] {
  const routesDir = new URL("../routes/", import.meta.url);
  const appSource = readFileSync(new URL("../app.ts", import.meta.url), "utf8");
  const mounts = new Map<string, string>(); // routerVariable -> "/api/xxx"
  for (const m of appSource.matchAll(/app\.use\("(\/api\/[a-z-]+)",\s*(\w+)\)/g))
    mounts.set(m[2]!, m[1]!);

  const found: string[] = [];
  for (const file of readdirSync(routesDir).filter((f) => f.endsWith(".ts"))) {
    const source = readFileSync(new URL(file, routesDir), "utf8");
    for (const m of source.matchAll(/(\w+Router)\.(get|post|put|patch|delete)\(\s*"([^"]*)"/g)) {
      const prefix = mounts.get(m[1]!);
      if (!prefix) throw new Error(`Router ${m[1]} in ${file} is not mounted in app.ts`);
      found.push(`${m[2]!.toUpperCase()} ${prefix}${m[3] === "/" ? "" : m[3]}`);
    }
  }
  return found.sort();
}

/** Open to everyone: no data of anyone's is returned or changed without credentials. */
const PUBLIC = [
  "GET /api/health",
  "POST /api/auth/register",
  "POST /api/auth/login",
  "POST /api/auth/logout",
];

/** Needs a session; the data is the session user's own (the query is scoped by the user id, never by a URL id). */
const SESSION_ONLY = [
  "GET /api/auth/me",
  "PATCH /api/users/me",
  "GET /api/users/me/limits",
  "POST /api/users/me/password",
  "DELETE /api/users/me",
  "GET /api/monitors",
  "POST /api/monitors",
  "GET /api/dashboard/summary",
  "GET /api/incidents",
];

type Ids = { monitorId: string; incidentId: string };
type Call = (agent: Agent, ids: Ids) => Promise<request.Response>;

/** Needs a session AND ownership of the id in the URL: another user gets 404 (SEC-4). */
const OWNED: Record<string, Call> = {
  "GET /api/monitors/:id": (a, i) => a.get(`/api/monitors/${i.monitorId}`),
  "PATCH /api/monitors/:id": (a, i) =>
    a.patch(`/api/monitors/${i.monitorId}`).send({ name: "hacked" }),
  "DELETE /api/monitors/:id": (a, i) => a.delete(`/api/monitors/${i.monitorId}`),
  "POST /api/monitors/:id/pause": (a, i) => a.post(`/api/monitors/${i.monitorId}/pause`),
  "POST /api/monitors/:id/resume": (a, i) => a.post(`/api/monitors/${i.monitorId}/resume`),
  "POST /api/monitors/:id/duplicate": (a, i) => a.post(`/api/monitors/${i.monitorId}/duplicate`),
  "POST /api/monitors/:id/check": (a, i) => a.post(`/api/monitors/${i.monitorId}/check`),
  "GET /api/monitors/:id/checks": (a, i) => a.get(`/api/monitors/${i.monitorId}/checks`),
  "GET /api/monitors/:id/stats": (a, i) => a.get(`/api/monitors/${i.monitorId}/stats`),
  "GET /api/monitors/:id/analytics": (a, i) => a.get(`/api/monitors/${i.monitorId}/analytics`),
  "GET /api/monitors/:id/incidents": (a, i) => a.get(`/api/monitors/${i.monitorId}/incidents`),
  "GET /api/monitors/:id/alerts": (a, i) => a.get(`/api/monitors/${i.monitorId}/alerts`),
  "PUT /api/monitors/:id/alerts": (a, i) =>
    a.put(`/api/monitors/${i.monitorId}/alerts`).send({
      notifyOnDown: false,
      notifyOnRecovery: false,
      notifyOnSlow: false,
      cooldownMinutes: 5,
      recipientEmail: "attacker@example.com",
    }),
  "POST /api/monitors/:id/alerts/test": (a, i) =>
    a.post(`/api/monitors/${i.monitorId}/alerts/test`),
  "GET /api/monitors/:id/notifications": (a, i) =>
    a.get(`/api/monitors/${i.monitorId}/notifications`),
  "GET /api/incidents/:id": (a, i) => a.get(`/api/incidents/${i.incidentId}`),
};

const concrete = (route: string, id: string = randomUUID()) => {
  const [method, path] = route.split(" ") as [string, string];
  return {
    method: method.toLowerCase() as "get" | "post" | "put" | "patch" | "delete",
    path: path.replace(":id", id),
  };
};

describe("route inventory", () => {
  it("every route in the source is classified exactly once (public, session-only or owned)", () => {
    const classified = [...PUBLIC, ...SESSION_ONLY, ...Object.keys(OWNED)].sort();
    expect(new Set(classified).size).toBe(classified.length);
    expect(inventory()).toEqual(classified);
  });
});

describe("authentication on every route (SEC-3)", () => {
  const protectedRoutes = [...SESSION_ONLY, ...Object.keys(OWNED)];

  it.each(protectedRoutes)("%s answers 401 without a session", async (route) => {
    const { method, path } = concrete(route);
    const res = await request(createApp())[method](path);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it.each(protectedRoutes)("%s answers 401 to a garbage session cookie", async (route) => {
    const { method, path } = concrete(route);
    const res = await request(createApp())[method](path).set("Cookie", "am_session=not-a-jwt");
    expect(res.status).toBe(401);
  });

  it("answers 401 to a token signed with another key, and to one for a user that does not exist", async () => {
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(randomUUID())
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("another-secret-another-secret-another"));
    const wrongKey = await request(createApp())
      .get("/api/monitors")
      .set("Cookie", `am_session=${forged}`);
    expect(wrongKey.status).toBe(401);

    const agent = await registerAgent("ghost@example.com");
    await prisma.user.deleteMany(); // a valid, correctly signed token whose user is gone
    expect((await agent.get("/api/monitors")).status).toBe(401);
  });

  it("an id that is not a UUID is a 400 validation error before the database is touched", async () => {
    const agent = await registerAgent();
    for (const route of Object.keys(OWNED)) {
      const { method, path } = concrete(route, "not-a-uuid");
      const res = await agent[method](path).send(
        route.startsWith("PUT") || route.startsWith("PATCH") ? {} : undefined,
      );
      expect([400, 429], `${route} -> ${res.status}`).toContain(res.status);
      if (res.status === 400) expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });
});

describe("ownership: user B cannot touch user A's data (SEC-4)", () => {
  async function setup() {
    const a = await registerAgent("a@example.com");
    const b = await registerAgent("b@example.com");
    const created = await a
      .post("/api/monitors")
      .send({ name: "A monitor", url: "https://8.8.8.8/", intervalSec: 300 });
    const monitorId: string = created.body.monitor.id;
    const incident = await prisma.incident.create({
      data: {
        monitorId,
        type: "DOWN",
        reason: "Timed out",
        startedAt: new Date(),
        openKey: `${monitorId}:DOWN`,
      },
    });
    return { a, b, ids: { monitorId, incidentId: incident.id } };
  }

  it.each(Object.keys(OWNED))(
    "%s: 404 for B, with the same answer as for an id that does not exist",
    async (route) => {
      const { b, ids } = await setup();
      const real = await OWNED[route]!(b, ids);
      const ghost = await OWNED[route]!(b, { monitorId: randomUUID(), incidentId: randomUUID() });
      expect(real.status).toBe(404); // 404, never 403: no hint that the id exists
      expect(ghost.status).toBe(404);
      expect(real.body).toEqual(ghost.body);
    },
  );

  it("after every attempt above, A's monitor, alert rule and incident are exactly as they were", async () => {
    const { a, b, ids } = await setup();
    for (const route of Object.keys(OWNED)) await OWNED[route]!(b, ids);

    const monitor = await prisma.monitor.findUniqueOrThrow({ where: { id: ids.monitorId } });
    expect(monitor).toMatchObject({ name: "A monitor", isPaused: false, status: "PENDING" });
    const rule = await prisma.alertRule.findUniqueOrThrow({ where: { monitorId: ids.monitorId } });
    expect(rule).toMatchObject({ notifyOnDown: true, cooldownMinutes: 30, recipientEmail: null });
    expect(await prisma.monitor.count()).toBe(1); // not deleted, not duplicated
    expect(await prisma.check.count()).toBe(0); // no manual check ran
    expect(
      await prisma.incident.findUniqueOrThrow({ where: { id: ids.incidentId } }),
    ).toMatchObject({ status: "OPEN" });
    expect((await a.get(`/api/monitors/${ids.monitorId}`)).status).toBe(200);
  });

  it("lists only the caller's own monitors and incidents", async () => {
    const { b } = await setup();
    expect((await b.get("/api/monitors")).body.items).toEqual([]);
    expect((await b.get("/api/incidents")).body.items).toEqual([]);
    expect((await b.get("/api/dashboard/summary")).body.counts?.total ?? 0).toBe(0);
  });
});