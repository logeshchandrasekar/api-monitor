// Boots the real app with NODE_ENV=production in its own process (so the production-only values are in force)
// and prints what it observed as JSON. Run by productionConfig.test.ts, never imported.
import request from "supertest";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";

const app = createApp();
const out: Record<string, unknown> = {};

const health = await request(app).get("/api/health").set("Origin", "https://app.example.com");
out.helmetHeaders = {
  hsts: health.headers["strict-transport-security"] ?? null,
  nosniff: health.headers["x-content-type-options"] ?? null,
  frame: health.headers["x-frame-options"] ?? null,
  csp: health.headers["content-security-policy"] ?? null,
  referrer: health.headers["referrer-policy"] ?? null,
  poweredBy: health.headers["x-powered-by"] ?? null,
};
out.corsAllowed = {
  origin: health.headers["access-control-allow-origin"] ?? null,
  credentials: health.headers["access-control-allow-credentials"] ?? null,
};
const evil = await request(app).get("/api/health").set("Origin", "https://evil.example");
out.corsEvil = evil.headers["access-control-allow-origin"] ?? null;

const preflight = await request(app)
  .options("/api/monitors")
  .set("Origin", "https://evil.example")
  .set("Access-Control-Request-Method", "POST");
out.preflightEvil = preflight.headers["access-control-allow-origin"] ?? null;

const big = await request(app)
  .post("/api/auth/login")
  .send({ email: "a@example.com", password: "x", pad: "y".repeat(101 * 1024) });
out.bodyLimitStatus = big.status;

const text = await request(app)
  .post("/api/auth/login")
  .set("Content-Type", "text/plain")
  .send("hello");
out.nonJsonStatus = text.status;

const reg = await request(app)
  .post("/api/auth/register")
  .send({ name: "Probe", email: "probe@example.com", password: "correct-horse-battery" });
out.registerStatus = reg.status;
out.sessionCookie = ([] as string[]).concat(reg.headers["set-cookie"] ?? [])[0] ?? null;

const login = await request(app)
  .post("/api/auth/login")
  .send({ email: "probe@example.com", password: "wrong-password" });
out.loginErrorBody = login.body;

const missing = await request(app).get("/api/nope");
out.notFound = missing.body;

console.log("PROBE:" + JSON.stringify(out));
await prisma.$disconnect();
