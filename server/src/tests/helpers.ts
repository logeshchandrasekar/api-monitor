import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";

export type Agent = ReturnType<typeof request.agent>;

const app = createApp();

/** Empties every table (future phases included) without touching migration history. */
export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

/** Registers a user through the real API and returns a logged-in agent (cookie jar included). */
export async function registerAgent(
  email = "user@example.com",
  plan: "FREE" | "PRO" | "TEAM" = "FREE",
): Promise<Agent> {
  const agent = request.agent(app);
  const res = await agent
    .post("/api/auth/register")
    .send({ name: "Test User", email, password: "correct-horse-battery" });
  if (res.status !== 201)
    throw new Error(`registerAgent failed: ${res.status} ${JSON.stringify(res.body)}`);
  if (plan !== "FREE") await prisma.user.update({ where: { email }, data: { plan } });
  return agent;
}
