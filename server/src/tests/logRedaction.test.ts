import { Writable } from "node:stream";
import { pino } from "pino";
import { describe, expect, it } from "vitest";
import { LOG_REDACT_PATHS } from "../lib/logger.js";

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, done) {
      lines.push(String(chunk));
      done();
    },
  });
  const log = pino({ redact: { paths: LOG_REDACT_PATHS, censor: "[redacted]" } }, stream);
  return { log, text: () => lines.join("") };
}

const SECRETS = [
  "SESSION-TOKEN-abc123",
  "Bearer SECRET-BEARER-999",
  "KEY-API-777",
  "TOKEN-XAUTH-555",
  "Pa55-word-hunter2",
  "NEW-pass-4242",
  "CIPHER-headers-v1:aaaa",
  "CIPHER-body-v1:bbbb",
  "PLAIN-header-secret-31337",
  "PLAIN-body-secret-8675309",
  "SET-COOKIE-VALUE-xyz",
];

describe("log redaction (SEC-2)", () => {
  it("removes every secret from a request log line, and keeps the harmless fields", () => {
    const { log, text } = capture();
    log.info({
      req: {
        id: "req-1",
        method: "POST",
        url: "/api/auth/login",
        headers: {
          authorization: "Bearer SECRET-BEARER-999",
          cookie: "am_session=SESSION-TOKEN-abc123",
          "proxy-authorization": "Basic SECRET-BEARER-999",
          "x-api-key": "KEY-API-777",
          "x-auth-token": "TOKEN-XAUTH-555",
          "user-agent": "vitest",
        },
      },
      res: {
        statusCode: 200,
        headers: { "set-cookie": ["am_session=SET-COOKIE-VALUE-xyz; HttpOnly"] },
      },
    });
    const out = text();
    for (const s of SECRETS) expect(out).not.toContain(s);
    expect(out).toContain("req-1");
    expect(out).toContain("/api/auth/login");
    expect(out).toContain("vitest"); // user-agent is still logged
    expect(out).toContain("[redacted]");
  });

  it("removes passwords wherever the usual fields appear", () => {
    const { log, text } = capture();
    log.info({ password: "Pa55-word-hunter2" });
    log.info({ body: { password: "Pa55-word-hunter2" } });
    log.info({ user: { password: "Pa55-word-hunter2", currentPassword: "Pa55-word-hunter2" } });
    log.info({ data: { newPassword: "NEW-pass-4242" } });
    expect(text()).not.toMatch(/Pa55-word-hunter2|NEW-pass-4242/);
  });

  it("removes a monitor's headers and body, encrypted or plain", () => {
    const { log, text } = capture();
    log.info({
      monitor: {
        id: "m-1",
        headers: [{ name: "x", value: "PLAIN-header-secret-31337" }],
        body: "PLAIN-body-secret-8675309",
      },
    });
    log.info({
      monitor: { id: "m-2", headersEnc: "CIPHER-headers-v1:aaaa", bodyEnc: "CIPHER-body-v1:bbbb" },
    });
    log.info({
      headers: [{ value: "PLAIN-header-secret-31337" }],
      body: "PLAIN-body-secret-8675309",
    });
    log.info({ row: { headersEnc: "CIPHER-headers-v1:aaaa", bodyEnc: "CIPHER-body-v1:bbbb" } });
    const out = text();
    for (const s of SECRETS) expect(out).not.toContain(s);
    expect(out).toContain("m-1");
    expect(out).toContain("m-2");
  });
});