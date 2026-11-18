import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { registerAgent } from "./helpers.js";

// The limiter keeps its counters in this test file's own module instance, so this file owns a fresh budget
beforeAll(() => {
  process.env.RATE_LIMIT_TEST = "1";
});
afterAll(() => {
  delete process.env.RATE_LIMIT_TEST;
});

describe("brute-force protection on login (SEC-5)", () => {
  it("blocks the 11th failed attempt in the window, but successful logins do not count", async () => {
    await registerAgent("victim@example.com");
    const app = createApp();
    const login = (password: string) =>
      request(app).post("/api/auth/login").send({ email: "victim@example.com", password });

    for (let i = 0; i < 9; i++) expect((await login("wrong-password")).status).toBe(401);
    expect((await login("correct-horse-battery")).status).toBe(200); // a success is not counted
    expect((await login("wrong-password")).status).toBe(401); // the 10th failure is still answered
    const blocked = await login("wrong-password"); // the 11th is not
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");

    // Even the right password is refused while the window is exhausted
    expect((await login("correct-horse-battery")).status).toBe(429);
  });
});
