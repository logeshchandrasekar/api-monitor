import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { registerAgent } from "./helpers.js";

beforeAll(() => {
  process.env.RATE_LIMIT_TEST = "1";
});
afterAll(() => {
  delete process.env.RATE_LIMIT_TEST;
});

describe("brute-force protection on account deletion", () => {
  it("someone with a stolen session cannot guess the password: 10 failures, then 429", async () => {
    const a = await registerAgent("target@example.com");
    for (let i = 0; i < 10; i++) {
      expect((await a.delete("/api/users/me").send({ password: `guess-${i}-guess` })).status).toBe(
        400,
      );
    }
    const blocked = await a.delete("/api/users/me").send({ password: "correct-horse-battery" });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
    expect(await prisma.user.count()).toBe(1); // nothing was deleted
  });
});
