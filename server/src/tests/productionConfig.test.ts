import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

// Production values are decided when the modules load (env.ts, cookies.ts), so they are checked in a child process
// that starts with NODE_ENV=production instead of by switching a flag inside this test process.

const server = fileURLToPath(new URL("../../", import.meta.url));

const baseEnv = (): NodeJS.ProcessEnv => ({
  PATH: process.env.PATH,
  NODE_ENV: "production",
  DATABASE_URL: process.env.DATABASE_URL, // the test database: the probe registers one user
  CLIENT_URL: "https://app.example.com",
  JWT_SECRET: "x".repeat(40),
  ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  SMTP_HOST: "smtp.example.com",
  ENABLE_SCHEDULER: "false",
  ENABLE_DISPATCHER: "false",
  LOG_LEVEL: "silent",
  DOTENV_CONFIG_PATH: "/nonexistent/.env", // never let a developer's own .env leak into the check
  DOTENV_CONFIG_QUIET: "true",
});

const run = (args: string[], env: NodeJS.ProcessEnv) =>
  spawnSync(process.execPath, ["--import", "tsx", ...args], {
    cwd: server,
    env,
    encoding: "utf8",
    timeout: 60_000,
  });

describe("production configuration (SEC-3, SEC-6)", () => {
  const result = run(["src/tests/fixtures/productionProbe.ts"], baseEnv());
  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `Production probe failed.\nStatus: ${result.status}\nStderr:\n${result.stderr}`,
    );
  }
  const line = result.stdout.split("\n").find((l) => l.startsWith("PROBE:"));
  const probe = line ? JSON.parse(line.slice(6)) : null;

  it("the probe ran", () => {
    expect(result.stderr).toBe("");
    expect(probe).not.toBeNull();
  });

  it("sends the Helmet headers and hides X-Powered-By", () => {
    expect(probe.helmetHeaders.hsts).toMatch(/max-age=\d+/);
    expect(probe.helmetHeaders.nosniff).toBe("nosniff");
    expect(probe.helmetHeaders.frame).toBe("SAMEORIGIN");
    expect(probe.helmetHeaders.csp).toContain("default-src 'self'");
    expect(probe.helmetHeaders.referrer).toBe("no-referrer");
    expect(probe.helmetHeaders.poweredBy).toBeNull();
  });

  it('CORS names exactly CLIENT_URL, with credentials: never "*" and never another site\'s origin', () => {
    expect(probe.corsAllowed).toEqual({ origin: "https://app.example.com", credentials: "true" });
    // The cors package answers every request with the one configured origin. A browser on evil.example sees a
    // mismatch and blocks the response, so the header is never the requester's origin and never "*".
    expect(probe.corsEvil).toBe("https://app.example.com");
    expect(probe.preflightEvil).toBe("https://app.example.com");
  });

  it("the session cookie is HttpOnly, Secure, SameSite=Lax, path / and lasts 7 days", () => {
    expect(probe.registerStatus).toBe(201);
    const cookie: string = probe.sessionCookie;
    expect(cookie).toMatch(/^am_session=ey/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=604800/);
  });

  it("limits the body to 100 KB and rejects non-JSON bodies", () => {
    expect(probe.bodyLimitStatus).toBe(413);
    expect(probe.nonJsonStatus).toBe(415);
  });

  it("error bodies give a code and a message and nothing internal", () => {
    expect(probe.loginErrorBody).toEqual({
      error: { code: "INVALID_CREDENTIALS", message: "Incorrect email or password." },
    });
    expect(probe.notFound).toEqual({ error: { code: "NOT_FOUND", message: "Route not found." } });
    expect(JSON.stringify(probe)).not.toMatch(/stack|node_modules|prisma|postgres/i);
  });
});

describe("the server refuses to start with an unsafe production setup", () => {
  const boot = (overrides: NodeJS.ProcessEnv) =>
    run(["-e", "await import('./src/config/env.ts'); console.log('BOOTED')"], {
      ...baseEnv(),
      ...overrides,
    });

  it("starts with a complete, safe configuration", () => {
    const r = boot({});
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("BOOTED");
  });

  it("refuses ALLOW_PRIVATE_TARGETS=true", () => {
    const r = boot({ ALLOW_PRIVATE_TARGETS: "true" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("ALLOW_PRIVATE_TARGETS must not be true in production");
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
  ])("refuses a %s SMTP_HOST", (_label, value) => {
    const env = { ...baseEnv(), SMTP_HOST: value } as NodeJS.ProcessEnv;
    if (value === undefined) delete env.SMTP_HOST;
    const r = run(["-e", "await import('./src/config/env.ts')"], env);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("SMTP_HOST is required in production");
  });

  it("refuses a short JWT_SECRET and a wrong-sized ENCRYPTION_KEY", () => {
    const short = boot({ JWT_SECRET: "too-short" });
    expect(short.status).toBe(1);
    expect(short.stderr).toContain("JWT_SECRET must be at least 32 characters");
    const key = boot({ ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") });
    expect(key.status).toBe(1);
    expect(key.stderr).toContain("ENCRYPTION_KEY must be 32 bytes");
  });
});
