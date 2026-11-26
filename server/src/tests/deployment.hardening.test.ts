import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { env } from "../config/env.js";
import { registerAgent } from "./helpers.js";

// Phase 10: the four things a public deployment needs that local development does not.
// The limiter keeps its counters in this test file's own module instance, so this file owns a fresh budget.
beforeAll(() => {
  process.env.RATE_LIMIT_TEST = "1";
});
afterAll(() => {
  delete process.env.RATE_LIMIT_TEST;
});
afterEach(() => {
  env.TRUST_PROXY_HOPS = 0;
  env.REGISTER_LIMIT_PER_HOUR = 0;
  env.MAX_USERS = 0;
});

const signup = (app: ReturnType<typeof createApp>, n: number, clientIp: string) =>
  request(app)
    .post("/api/auth/register")
    // What the app sees behind Vercel and Render: the visitor first, then the Vercel address Render appended
    .set("X-Forwarded-For", `${clientIp}, 76.76.21.21`)
    .send({ name: "Visitor", email: `visitor${n}@example.com`, password: "correct-horse-battery" });

describe("shared caches (Phase 10)", () => {
  it("marks every /api answer no-store: health, protected routes and unknown paths alike", async () => {
    const app = createApp();
    for (const path of ["/api/health", "/api/auth/me", "/api/does-not-exist"]) {
      const res = await request(app).get(path);
      expect(res.headers["cache-control"], path).toBe("no-store");
    }
  });
});

describe("signup brakes (Phase 10)", () => {
  it("with TRUST_PROXY_HOPS=2 each visitor behind the two proxies gets their own allowance", async () => {
    env.TRUST_PROXY_HOPS = 2;
    env.REGISTER_LIMIT_PER_HOUR = 1;
    const app = createApp();

    expect((await signup(app, 1, "203.0.113.1")).status).toBe(201);
    expect((await signup(app, 2, "203.0.113.2")).status).toBe(201); // somebody else: not blocked
    const again = await signup(app, 3, "203.0.113.1"); // the first visitor, a second account
    expect(again.status).toBe(429);
    expect(again.body.error.code).toBe("RATE_LIMITED");
  });

  it("with TRUST_PROXY_HOPS=0 behind a proxy everybody shares one allowance (the bug this setting fixes)", async () => {
    env.TRUST_PROXY_HOPS = 0;
    env.REGISTER_LIMIT_PER_HOUR = 1;
    const app = createApp();

    expect((await signup(app, 1, "203.0.113.1")).status).toBe(201);
    expect((await signup(app, 2, "203.0.113.2")).status).toBe(429); // a different visitor, blocked anyway
  });

  it("does not count a failed signup (a mistyped form is not an attack)", async () => {
    env.TRUST_PROXY_HOPS = 2;
    env.REGISTER_LIMIT_PER_HOUR = 1;
    const app = createApp();
    // A visitor of its own: the limiter lives for the whole file, so counters left by the tests above must not interfere
    const ip = "203.0.113.9";
    const bad = await request(app)
      .post("/api/auth/register")
      .set("X-Forwarded-For", `${ip}, 76.76.21.21`)
      .send({ name: "", email: "nope" });
    expect(bad.status).toBe(400);
    expect((await signup(app, 1, ip)).status).toBe(201); // the one allowed account is still available
  });

  it("MAX_USERS closes signups with a clear 403 once the cap is reached", async () => {
    await registerAgent("first@example.com");
    env.MAX_USERS = 1;
    const res = await request(createApp())
      .post("/api/auth/register")
      .send({ name: "Late", email: "late@example.com", password: "correct-horse-battery" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("REGISTRATION_CLOSED");
  });
});
