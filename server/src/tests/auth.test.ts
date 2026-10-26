import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";

const app = createApp();
const user = { name: "Test User", email: "test@example.com", password: "correct-horse-battery" };

async function loggedInAgent() {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/register").send(user);
  expect(res.status).toBe(201);
  return agent;
}

describe("POST /api/auth/register", () => {
  it("creates the user, sets a safe cookie and hides the hash", async () => {
    const res = await request(app).post("/api/auth/register").send(user);
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: user.email, name: user.name, plan: "FREE" });
    expect(res.body.user).not.toHaveProperty("passwordHash");
    const cookie = res.headers["set-cookie"]?.[0] ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("rejects a duplicate email, case-insensitively", async () => {
    await request(app).post("/api/auth/register").send(user);
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...user, email: "TEST@Example.com" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("rejects weak, missing and over-long passwords", async () => {
    for (const password of ["short", "", "a".repeat(73)]) {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ ...user, password });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("rejects an invalid email", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...user, email: "nope" });
    expect(res.status).toBe(400);
  });

  it("ignores attempts to set the plan", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...user, plan: "PRO" });
    expect(res.status).toBe(201);
    expect(res.body.user.plan).toBe("FREE");
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with correct credentials", async () => {
    await request(app).post("/api/auth/register").send(user);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "  TEST@example.com ", password: user.password });
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]?.[0]).toContain("am_session=");
  });

  it("returns the same error for a wrong password and an unknown email", async () => {
    await request(app).post("/api/auth/register").send(user);
    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "wrong-password" });
    const unknownEmail = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "wrong-password" });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });
});

describe("GET /api/auth/me and logout", () => {
  it("rejects requests without a cookie", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns the current user when logged in", async () => {
    const agent = await loggedInAgent();
    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.user).not.toHaveProperty("passwordHash");
  });

  it("rejects a tampered token", async () => {
    const res = await request(app).get("/api/auth/me").set("Cookie", "am_session=garbage");
    expect(res.status).toBe(401);
  });

  it("rejects a valid token whose user no longer exists", async () => {
    const agent = await loggedInAgent();
    await prisma.user.deleteMany();
    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("clears the session on logout", async () => {
    const agent = await loggedInAgent();
    const out = await agent.post("/api/auth/logout");
    expect(out.status).toBe(204);
    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});

describe("/api/users/me", () => {
  it("requires authentication", async () => {
    const res = await request(app).patch("/api/users/me").send({ name: "X" });
    expect(res.status).toBe(401);
  });

  it("updates the name", async () => {
    const agent = await loggedInAgent();
    const res = await agent.patch("/api/users/me").send({ name: "New Name" });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe("New Name");
  });

  it("changes the password and invalidates the old one", async () => {
    const agent = await loggedInAgent();
    const newPassword = "another-strong-pass";
    const res = await agent
      .post("/api/users/me/password")
      .send({ currentPassword: user.password, newPassword });
    expect(res.status).toBe(204);

    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: user.password });
    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: newPassword });
    expect(oldLogin.status).toBe(401);
    expect(newLogin.status).toBe(200);
  });

  it("rejects a wrong current password with 400, not 401", async () => {
    const agent = await loggedInAgent();
    const res = await agent
      .post("/api/users/me/password")
      .send({ currentPassword: "not-my-password", newPassword: "another-strong-pass" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_CURRENT_PASSWORD");
  });
});

describe("platform behaviour", () => {
  it("serves the health endpoint", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", db: "up" });
  });

  it("returns the standard error shape for unknown routes", async () => {
    const res = await request(app).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("rejects malformed JSON", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("{ not json");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });

  it("rejects a body that is not JSON", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "text/plain")
      .send("hello");
    expect(res.status).toBe(415);
  });

  it("rate limits repeated failed logins", async () => {
    process.env.RATE_LIMIT_TEST = "1";
    try {
      const attempt = () =>
        request(app)
          .post("/api/auth/login")
          .send({ email: "x@example.com", password: "wrong-pass" });
      for (let i = 0; i < 10; i++) await attempt();
      const res = await attempt();
      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe("RATE_LIMITED");
    } finally {
      delete process.env.RATE_LIMIT_TEST;
    }
  });
});
