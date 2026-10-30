import { describe, expect, it } from "vitest";
import { ApiError } from "../services/api";
import { fieldErrorsFrom, getErrorMessage } from "./errors";

const apiError = (status: number, code: string, message: string, details?: unknown) =>
  new ApiError(status, code, message, details);

describe("getErrorMessage", () => {
  it("shows the server's own message for a normal 4xx", () => {
    expect(getErrorMessage(apiError(404, "NOT_FOUND", "Monitor not found."))).toBe(
      "Monitor not found.",
    );
  });
  it("replaces 429 and 5xx with something actionable", () => {
    expect(getErrorMessage(apiError(429, "RATE_LIMITED", "raw"))).toMatch(/too many attempts/i);
    expect(getErrorMessage(apiError(500, "INTERNAL", "raw stack"))).toMatch(/our side/i);
    expect(getErrorMessage(apiError(500, "INTERNAL", "raw stack"))).not.toContain("raw stack");
  });
  it("passes the friendly network message through", () => {
    expect(getErrorMessage(apiError(0, "NETWORK_ERROR", "Could not reach the server."))).toBe(
      "Could not reach the server.",
    );
  });
  it("never shows the text of an unknown thrown value", () => {
    expect(getErrorMessage(new Error("TypeError: x is undefined"))).toBe(
      "Something went wrong. Please try again.",
    );
    expect(getErrorMessage("boom")).toBe("Something went wrong. Please try again.");
  });
});

describe("fieldErrorsFrom", () => {
  it("reads a list of issues", () => {
    const err = apiError(400, "VALIDATION_ERROR", "Invalid input", [
      { path: ["email"], message: "Invalid email" },
      { path: ["password", 0], message: "Too short" },
      { path: ["email"], message: "second email message is ignored" },
    ]);
    expect(fieldErrorsFrom(err)).toEqual({ email: "Invalid email", password: "Too short" });
  });
  it("reads a flattened fieldErrors object", () => {
    const err = apiError(400, "VALIDATION_ERROR", "Invalid input", {
      fieldErrors: { name: ["Required"] },
    });
    expect(fieldErrorsFrom(err)).toEqual({ name: "Required" });
  });
  it("reads a plain map", () => {
    const err = apiError(400, "VALIDATION_ERROR", "Invalid input", {
      email: "Taken",
      name: ["Too long"],
    });
    expect(fieldErrorsFrom(err)).toEqual({ email: "Taken", name: "Too long" });
  });
  it("returns {} for other statuses, missing details and non-API errors", () => {
    expect(fieldErrorsFrom(apiError(401, "X", "x", [{ path: ["email"], message: "m" }]))).toEqual(
      {},
    );
    expect(fieldErrorsFrom(apiError(400, "INVALID_CURRENT_PASSWORD", "Wrong"))).toEqual({});
    expect(fieldErrorsFrom(new Error("x"))).toEqual({});
  });
});
