import { afterAll, beforeEach } from "vitest";
import { prisma } from "../lib/prisma.js";
import { resetDb } from "./helpers.js";

if (!process.env.DATABASE_URL?.includes("_test")) {
  throw new Error("Refusing to run tests against a non-test database");
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});
