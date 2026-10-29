import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCheckRunner, MAX_BODY_BYTES, USER_AGENT, type CheckInput } from "../services/checkRunner.js";
import { parseTargetUrl } from "../utils/url-guard.js";
import { closedPort, startCaptureServer, startTestServer, type TestServer } from "./testServer.js";

let a: TestServer; // the "monitored API"

beforeAll(async () => {
  a = await startTestServer();
});
afterAll(async () => {
  await a.close();
});

const input = (url: string, overrides: Partial<CheckInput> = {}): CheckInput => ({
  url,
  method: "GET",
  headers: [],
  body: null,
  expectedStatus: 200,
  followRedirects: true,
  timeoutMs: 2000,
  responseThresholdMs: 1000,
  ...overrides,
});

// Private targets are allowed so the runner can talk to 127.0.0.1. Strict-mode tests build their own runner.
const lax = createCheckRunner({ allowPrivate: true });

describe("outcome classification", () => {
  it("SUCCESS: expected status, fast", async () => {
    const r = await lax(input(`${a.url}/ok`));
    expect(r).toMatchObject({ outcome: "SUCCESS", failureType: null, statusCode: 200, errorMessage: null });
    expect(r.responseTimeMs).toBeGreaterThanOrEqual(0);
    expect(r.responseTimeMs).toBeLessThan(1000);
  });

  it("SLOW: expected status, slower than the threshold (not a failure)", async () => {
    const r = await lax(input(`${a.url}/slow?ms=250`, { responseThresholdMs: 100 }));
    expect(r).toMatchObject({ outcome: "SLOW", failureType: null, statusCode: 200, errorMessage: null });
    expect(r.responseTimeMs).toBeGreaterThanOrEqual(240);
  });

  it("FAILURE / UNEXPECTED_STATUS: wrong status code, with the time still recorded", async () => {
    const r = await lax(input(`${a.url}/status/500`));
    expect(r).toMatchObject({
      outcome: "FAILURE",
      failureType: "UNEXPECTED_STATUS",
      statusCode: 500,
      errorMessage: "Expected status 200 but received 500.",
    });
    expect(r.responseTimeMs).not.toBeNull();
  });

  it("expectedStatus can be any code, e.g. 404 or 204", async () => {
    expect((await lax(input(`${a.url}/status/404`, { expectedStatus: 404 }))).outcome).toBe("SUCCESS");
    expect((await lax(input(`${a.url}/status/204`, { expectedStatus: 204 }))).outcome).toBe("SUCCESS");
  });
});

describe("network failures", () => {
  it("TIMEOUT: gives up at timeoutMs, not when the server answers", async () => {
    const t0 = performance.now();
    const r = await lax(input(`${a.url}/slow?ms=5000`, { timeoutMs: 300 }));
    expect(r).toMatchObject({ outcome: "FAILURE", failureType: "TIMEOUT", statusCode: null, responseTimeMs: null });
    expect(r.errorMessage).toBe("No response within 0.3 seconds.");
    expect(performance.now() - t0).toBeLessThan(1500);
  });

  it("TIMEOUT: a server that never answers", async () => {
    const r = await lax(input(`${a.url}/hang`, { timeoutMs: 300 }));
    expect(r.failureType).toBe("TIMEOUT");
  });

  it("CONNECTION: nothing is listening on the port", async () => {
    const r = await lax(input(`http://127.0.0.1:${await closedPort()}/`));
    expect(r).toMatchObject({ outcome: "FAILURE", failureType: "CONNECTION" });
    expect(r.errorMessage).toMatch(/could not connect/i);
  });

  it("DNS: the name does not resolve (fake resolver, no real DNS lookup)", async () => {
    const resolve = async () => {
      throw Object.assign(new Error("getaddrinfo ENOTFOUND nope.example.com"), { code: "ENOTFOUND" });
    };
    const runner = createCheckRunner({ allowPrivate: false, resolve });
    const r = await runner(input("https://nope.example.com/"));
    expect(r).toMatchObject({ outcome: "FAILURE", failureType: "DNS" });
  });

  it("TLS: https:// pointed at a plain-HTTP port", async () => {
    const r = await lax(input(`https://127.0.0.1:${a.port}/ok`));
    expect(r).toMatchObject({ outcome: "FAILURE", failureType: "TLS" });
    expect(r.errorMessage).toMatch(/secure \(HTTPS\) connection failed/);
  });

  it("never stores raw error codes or the hostname in errorMessage", async () => {
    const results = await Promise.all([
      lax(input(`http://127.0.0.1:${await closedPort()}/`)),
      lax(input(`https://127.0.0.1:${a.port}/ok`)),
      lax(input(`${a.url}/hang`, { timeoutMs: 200 })),
    ]);
    for (const r of results) {
      expect(r.errorMessage).not.toMatch(/E[A-Z]{3,}|ERR_|UND_|127\.0\.0\.1|getaddrinfo/);
    }
  });
});

describe("SSRF at connection time (SEC-1)", () => {
  it("blocks a public-looking name that resolves to a private address (DNS rebinding)", async () => {
    // The hostname passes the syntax check; only the connection-time lookup can catch this
    const resolve = async () => [{ address: "127.0.0.1", family: 4 }];
    const runner = createCheckRunner({ allowPrivate: false, resolve });
    const r = await runner(input(`http://rebind.example.com:${a.port}/ok`));
    expect(r).toMatchObject({ outcome: "FAILURE", failureType: "BLOCKED_TARGET" });
    expect(r.errorMessage).toBe("This address is not allowed.");
  });

  it("blocks when ANY resolved address is private, even if the first is public", async () => {
    const resolve = async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.8", family: 4 },
    ];
    const r = await createCheckRunner({ allowPrivate: false, resolve })(input("http://mixed.example.com/"));
    expect(r.failureType).toBe("BLOCKED_TARGET");
  });

  it("blocks private literal IPs in strict mode without connecting", async () => {
    const strict = createCheckRunner({ allowPrivate: false });
    for (const url of ["http://127.0.0.1/", "http://169.254.169.254/latest/meta-data/", "http://[::1]/"]) {
      expect((await strict(input(url))).failureType).toBe("BLOCKED_TARGET");
    }
  });

  it("blocks a redirect into a private address, and never connects to it", async () => {
    // Hop 1 (our test server) is waived so the redirect can happen; every other hop uses the real strict check
    const runner = createCheckRunner({
      allowPrivate: false,
      hopCheck: (url) => {
        if (url.port !== String(a.port)) parseTargetUrl(url.href, { allowPrivate: false });
      },
    });
    for (const target of ["http://127.0.0.1:9/secret", "http://169.254.169.254/latest/meta-data/", "http://[::ffff:7f00:1]/"]) {
      const r = await runner(input(`${a.url}/redirect?to=${encodeURIComponent(target)}`));
      expect(r).toMatchObject({ outcome: "FAILURE", failureType: "BLOCKED_TARGET" });
    }
  });

  it("an unsupported redirect scheme fails cleanly", async () => {
    const r = await lax(input(`${a.url}/redirect?to=${encodeURIComponent("ftp://example.com/x")}`));
    expect(r).toMatchObject({ outcome: "FAILURE", failureType: "OTHER" });
    expect(r.errorMessage).toMatch(/not supported/);
  });
});

describe("redirects", () => {
  it("follows a chain and judges the final response", async () => {
    const r = await lax(input(`${a.url}/hops/3`));
    expect(r).toMatchObject({ outcome: "SUCCESS", statusCode: 200 });
  });

  it("gives up after 5 redirects", async () => {
    expect((await lax(input(`${a.url}/hops/5`))).outcome).toBe("SUCCESS"); // 5 hops is allowed
    const r = await lax(input(`${a.url}/hops/6`));
    expect(r).toMatchObject({ outcome: "FAILURE", failureType: "OTHER" });
    expect(r.errorMessage).toBe("Too many redirects (more than 5).");
  });

  it("followRedirects=false: the 3xx itself is the response, so expectedStatus 302 works", async () => {
    const asIs = await lax(input(`${a.url}/redirect`, { followRedirects: false, expectedStatus: 302 }));
    expect(asIs).toMatchObject({ outcome: "SUCCESS", statusCode: 302 });
    const wrong = await lax(input(`${a.url}/redirect`, { followRedirects: false }));
    expect(wrong).toMatchObject({ failureType: "UNEXPECTED_STATUS", statusCode: 302 });
  });

  it("does not carry credentials to a different origin, but keeps them on the same origin", async () => {
    const headers = [
      { name: "Authorization", value: "Bearer secret" },
      { name: "X-Env", value: "prod" },
    ];
    const target = await startCaptureServer(); // a different origin (other port)
    await lax(input(`${a.url}/redirect?to=${encodeURIComponent(`${target.url}/landing`)}`, { headers }));
    expect(target.seen[0]?.headers.authorization).toBeUndefined(); // sensitive header dropped
    expect(target.seen[0]?.headers["x-env"]).toBe("prod"); // harmless header kept
    await target.close();

    // Same origin: GET /r answers 302 -> /landing on the same server, so credentials must survive the hop
    const same = await startCaptureServer();
    const r = await lax(input(`${same.url}/r`, { headers }));
    expect(r.outcome).toBe("SUCCESS");
    expect(same.seen.map((s) => s.url)).toEqual(["/r", "/landing"]);
    expect(same.seen[1]?.headers.authorization).toBe("Bearer secret"); // kept across a same-origin redirect
    await same.close();
  });

  it("303 turns a POST into a body-less GET; 307 keeps POST and body", async () => {
    for (const [code, method, body] of [
      [303, "GET", ""],
      [307, "POST", '{"x":1}'],
      [308, "POST", '{"x":1}'],
    ] as const) {
      const target = await startCaptureServer();
      const r = await lax(
        input(`${a.url}/redirect-code?code=${code}&to=${encodeURIComponent(`${target.url}/landing`)}`, {
          method: "POST",
          body: '{"x":1}',
        }),
      );
      expect(r.outcome).toBe("SUCCESS");
      expect(target.seen[0]).toMatchObject({ method, body });
      await target.close();
    }
  });
});

describe("request details", () => {
  it("sends the fixed User-Agent, user headers, method and body", async () => {
    const cap = await startCaptureServer();
    const r = await lax(
      input(`${cap.url}/`, {
        method: "POST",
        headers: [{ name: "Authorization", value: "Bearer abc" }],
        body: '{"ping":true}',
      }),
    );
    expect(r.outcome).toBe("SUCCESS");
    expect(cap.seen[0]).toMatchObject({ method: "POST", body: '{"ping":true}' });
    expect(cap.seen[0]?.headers).toMatchObject({
      "user-agent": USER_AGENT,
      authorization: "Bearer abc",
      "content-type": "application/json", // default when a body is sent without a Content-Type
    });
    await cap.close();
  });

  it("a user-supplied Content-Type wins over the default", async () => {
    const cap = await startCaptureServer();
    await lax(
      input(`${cap.url}/`, {
        method: "POST",
        headers: [{ name: "Content-Type", value: "text/plain" }],
        body: "hello",
      }),
    );
    expect(cap.seen[0]?.headers["content-type"]).toBe("text/plain");
    await cap.close();
  });

  it("HEAD works (no body to read)", async () => {
    expect((await lax(input(`${a.url}/ok`, { method: "HEAD" }))).outcome).toBe("SUCCESS");
  });
});

describe("response body cap (SEC-1)", () => {
  it("stops reading at the cap instead of downloading everything", async () => {
    // 200 MB endpoint: if the runner tried to read it all, this would take far longer than the cap allows
    const t0 = performance.now();
    const r = await lax(input(`${a.url}/big?kb=204800`, { timeoutMs: 5000 }));
    expect(r.outcome === "SUCCESS" || r.outcome === "SLOW").toBe(true);
    expect(r.statusCode).toBe(200);
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(MAX_BODY_BYTES).toBe(1024 * 1024);
  });
});