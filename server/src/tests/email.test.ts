import { describe, expect, it } from "vitest";
import { describeSendError } from "../services/email.js";

describe("describeSendError: safe sentences only", () => {
  it.each([
    [
      { code: "ESOCKET", message: "connect ECONNREFUSED 127.0.0.1:1025" },
      "Could not reach the mail server.",
    ],
    [{ code: "ETIMEDOUT" }, "Could not reach the mail server."],
    [
      { code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND smtp.internal.corp" },
      "Could not reach the mail server.",
    ],
    [{ code: "EAUTH", responseCode: 535 }, "The mail server rejected our login."],
    [{ code: "EENVELOPE", responseCode: 550 }, "The mail server refused the message."],
    [{ responseCode: 451 }, "The mail server could not take the message right now."],
    [new Error("something strange"), "The email could not be sent."],
    ["a string", "The email could not be sent."],
    [null, "The email could not be sent."],
  ])("%j -> %s", (err, expected) => {
    expect(describeSendError(err)).toBe(expected);
  });

  it("never repeats the raw message", () => {
    const text = describeSendError(
      Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:587 secret-banner"), {
        code: "ESOCKET",
      }),
    );
    expect(text).not.toMatch(/10\.0\.0\.5|587|secret-banner/);
  });
});