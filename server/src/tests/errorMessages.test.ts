import { describe, expect, it } from "vitest";
import {
  CheckFailure,
  classifyError,
  failureMessage,
  type FailureType,
} from "../utils/errorMessages.js";

const withCode = (code: string, extra: object = {}) =>
  Object.assign(new Error(`raw ${code} text`), { code, ...extra });

describe("classifyError", () => {
  const table: [string, unknown, FailureType][] = [
    ["ENOTFOUND", withCode("ENOTFOUND"), "DNS"],
    ["EAI_AGAIN", withCode("EAI_AGAIN"), "DNS"],
    ["ECONNREFUSED", withCode("ECONNREFUSED"), "CONNECTION"],
    ["ECONNRESET", withCode("ECONNRESET"), "CONNECTION"],
    ["EHOSTUNREACH", withCode("EHOSTUNREACH"), "CONNECTION"],
    ["UND_ERR_SOCKET", withCode("UND_ERR_SOCKET"), "CONNECTION"],
    ["ETIMEDOUT", withCode("ETIMEDOUT"), "TIMEOUT"],
    ["UND_ERR_CONNECT_TIMEOUT", withCode("UND_ERR_CONNECT_TIMEOUT"), "TIMEOUT"],
    ["UND_ERR_HEADERS_TIMEOUT", withCode("UND_ERR_HEADERS_TIMEOUT"), "TIMEOUT"],
    ["CERT_HAS_EXPIRED", withCode("CERT_HAS_EXPIRED"), "TLS"],
    ["DEPTH_ZERO_SELF_SIGNED_CERT", withCode("DEPTH_ZERO_SELF_SIGNED_CERT"), "TLS"],
    ["ERR_TLS_CERT_ALTNAME_INVALID", withCode("ERR_TLS_CERT_ALTNAME_INVALID"), "TLS"],
    ["UNABLE_TO_VERIFY_LEAF_SIGNATURE", withCode("UNABLE_TO_VERIFY_LEAF_SIGNATURE"), "TLS"],
    ["EPROTO", withCode("EPROTO"), "TLS"],
    ["BLOCKED_TARGET", withCode("BLOCKED_TARGET"), "BLOCKED_TARGET"],
    ["unknown code", withCode("SOMETHING_NEW"), "OTHER"],
    ["no code at all", new Error("weird"), "OTHER"],
    ["not an error", "a string", "OTHER"],
    ["null", null, "OTHER"],
  ];
  it.each(table)("%s -> %s", (_label, err, expected) => {
    expect(classifyError(err)).toBe(expected);
  });

  it("finds the code in err.cause (undici wraps connect errors)", () => {
    expect(classifyError(new Error("fetch failed", { cause: withCode("ECONNREFUSED") }))).toBe(
      "CONNECTION",
    );
    expect(
      classifyError(
        new Error("outer", { cause: new Error("mid", { cause: withCode("ENOTFOUND") }) }),
      ),
    ).toBe("DNS");
  });

  it("finds the code inside an AggregateError (IPv4 + IPv6 attempts)", () => {
    const agg = new AggregateError(
      [withCode("ECONNREFUSED"), withCode("ECONNREFUSED")],
      "all failed",
    );
    expect(classifyError(agg)).toBe("CONNECTION");
  });

  it("honours CheckFailure", () => {
    expect(classifyError(new CheckFailure("OTHER", "x"))).toBe("OTHER");
  });

  it("survives a circular cause chain", () => {
    const a: Record<string, unknown> = { code: "ECONNRESET" };
    a.cause = a;
    expect(classifyError(a)).toBe("CONNECTION");
  });
});

describe("failureMessage", () => {
  it("has a friendly message for every type, with no raw codes", () => {
    const types: FailureType[] = [
      "TIMEOUT",
      "DNS",
      "CONNECTION",
      "TLS",
      "UNEXPECTED_STATUS",
      "BLOCKED_TARGET",
      "OTHER",
    ];
    for (const t of types) {
      const m = failureMessage(t, { timeoutMs: 10_000, expectedStatus: 200, actualStatus: 500 });
      expect(m.length).toBeGreaterThan(10);
      expect(m).not.toMatch(/E[A-Z]{3,}|ERR_|UND_/);
    }
  });
  it("fills in numbers", () => {
    expect(failureMessage("TIMEOUT", { timeoutMs: 10_000 })).toBe("No response within 10 seconds.");
    expect(failureMessage("UNEXPECTED_STATUS", { expectedStatus: 201, actualStatus: 404 })).toBe(
      "Expected status 201 but received 404.",
    );
  });
});
