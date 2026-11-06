import { describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { DEMO_EMAIL, DEMO_PASSWORD, seedDemo } from "../seed/seedDemo.js";
import { createApp } from "../app.js";
import request from "supertest";

const NOW = Date.UTC(2026, 10, 4, 12, 0, 0);

async function counts() {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: DEMO_EMAIL } });
  const [users, monitors, checks, incidents] = await Promise.all([
    prisma.user.count({ where: { email: DEMO_EMAIL } }),
    prisma.monitor.count({ where: { userId: user.id } }),
    prisma.check.count({ where: { monitor: { userId: user.id } } }),
    prisma.incident.count({ where: { monitor: { userId: user.id } } }),
  ]);
  return { users, monitors, checks, incidents, plan: user.plan };
}

describe("seedDemo", () => {
  it("creates a PRO demo user with 4 monitors, checks and incidents", async () => {
    await seedDemo({ days: 7, nowMs: NOW });
    const c = await counts();
    expect(c).toMatchObject({ users: 1, monitors: 4, plan: "PRO" });
    // 7 days: 10080 (60 s) x 2 + 2016 (300 s) + 672 (900 s)
    expect(c.checks).toBe(10_080 * 2 + 2_016 + 672);
    expect(c.incidents).toBeGreaterThan(0);
  }, 60_000);

  it("is idempotent: running it twice leaves exactly the same amount of data", async () => {
    await seedDemo({ days: 7, nowMs: NOW });
    const first = await counts();
    await seedDemo({ days: 7, nowMs: NOW });
    const second = await counts();
    expect(second).toEqual(first);
    expect(await prisma.monitor.count()).toBe(4); // nothing else was touched or duplicated
  }, 60_000);

  it("leaves other users alone", async () => {
    const other = await prisma.user.create({
      data: { name: "Other", email: "other@example.com", passwordHash: "x" },
    });
    await prisma.monitor.create({
      data: {
        userId: other.id,
        name: "Mine",
        url: "https://8.8.8.8",
        intervalSec: 300,
        nextCheckAt: new Date(),
      },
    });
    await seedDemo({ days: 2, nowMs: NOW });
    await seedDemo({ days: 2, nowMs: NOW });
    expect(await prisma.monitor.count({ where: { userId: other.id } })).toBe(1);
  }, 60_000);

  it("the demo user can log in and sees its monitors with consistent state", async () => {
    await seedDemo({ days: 7, nowMs: NOW });
    const login = await request(createApp())
      .post("/api/auth/login")
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    expect(login.status).toBe(200);
    const cookie = login.headers["set-cookie"]![0]!.split(";")[0]!;
    const list = await request(createApp()).get("/api/monitors").set("Cookie", cookie);
    expect(list.status).toBe(200);
    const items = list.body.items as {
      name: string;
      status: string;
      lastResponseTimeMs: number | null;
    }[];
    expect(items.map((m) => m.name).sort()).toEqual([
      "Auth Service",
      "Payments API",
      "Reports Export",
      "Search API",
    ]);
    expect(items.every((m) => m.status === "HEALTHY")).toBe(true);
  }, 60_000);

  it("the demo monitors are frozen: the scheduler's due-check query never picks them", async () => {
    await seedDemo({ days: 2, nowMs: NOW });
    const due = await prisma.monitor.findMany({
      where: { isPaused: false, nextCheckAt: { lte: new Date() } },
    });
    expect(due).toHaveLength(0);
    const demo = await prisma.monitor.findMany();
    expect(demo.every((m) => m.nextCheckAt.getUTCFullYear() === 2099)).toBe(true);
  }, 60_000);

  it("open incidents carry their openKey, so the one-open-incident rule still holds", async () => {
    await seedDemo({ days: 7, nowMs: NOW });
    const open = await prisma.incident.findMany({ where: { status: "OPEN" } });
    for (const i of open) expect(i.openKey).toBe(`${i.monitorId}:${i.type}`);
  }, 60_000);
});
