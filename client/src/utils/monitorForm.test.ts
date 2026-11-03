import { describe, expect, it } from "vitest";
import type { MonitorDetail } from "../types/api";
import {
  defaultTimeoutSec,
  formFromMonitor,
  formatJson,
  mapServerFieldErrors,
  newFormValues,
  newHeaderRow,
  pruneBlankRows,
  toPayload,
  validateForm,
} from "./monitorForm";

const valid = () => ({
  ...newFormValues([300, 600]),
  name: "API",
  url: "https://api.example.com/health",
});

const detail: MonitorDetail = {
  id: "m1",
  name: "Prod",
  description: null,
  url: "https://api.example.com/health",
  method: "POST",
  expectedStatus: 201,
  followRedirects: false,
  intervalSec: 600,
  timeoutMs: 5000,
  responseThresholdMs: 800,
  failureThreshold: 3,
  slowThreshold: 3,
  status: "HEALTHY",
  isPaused: false,
  failStreak: 0,
  lastCheckedAt: null,
  lastStatusCode: null,
  lastResponseTimeMs: null,
  lastStatusChangeAt: null,
  nextCheckAt: null,
  tags: [],
  hasBody: true,
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
  headers: [
    { name: "Authorization", value: null, sensitive: true },
    { name: "Accept", value: "application/json", sensitive: false },
  ],
  body: '{"ping":true}',
};

describe("defaults", () => {
  it("starts at 5 minutes when the plan allows it, otherwise at the first interval", () => {
    expect(newFormValues([10, 30, 300]).intervalSec).toBe(300);
    expect(newFormValues([60, 600]).intervalSec).toBe(60);
  });
  it("the timeout default is 80 % of the interval, at most 10 s", () => {
    expect(defaultTimeoutSec(10)).toBe(8);
    expect(defaultTimeoutSec(30)).toBe(10);
    expect(defaultTimeoutSec(300)).toBe(10);
  });
});

describe("validateForm", () => {
  it("accepts a complete form", () => {
    expect(validateForm(valid())).toEqual({});
  });
  it("explains each bad field", () => {
    const errors = validateForm({
      ...valid(),
      name: " ",
      url: "ftp://x",
      expectedStatus: "99",
      timeoutSec: "400",
      responseThresholdMs: "10",
    });
    expect(Object.keys(errors).sort()).toEqual(
      ["expectedStatus", "name", "responseThresholdMs", "timeoutSec", "url"].sort(),
    );
  });
  it("the timeout must be shorter than the interval", () => {
    expect(validateForm({ ...valid(), intervalSec: 10, timeoutSec: "10" }).timeoutSec).toMatch(
      /shorter/,
    );
  });
  it("checks header rows: name, duplicates and value", () => {
    const errors = validateForm({
      ...valid(),
      headers: [
        newHeaderRow({ name: "X-A", value: "1" }),
        newHeaderRow({ name: "x-a", value: "2" }),
        newHeaderRow({ name: "Bad Name", value: "3" }),
        newHeaderRow({ name: "X-B", value: "" }),
      ],
    });
    expect(errors["headers.1.name"]).toMatch(/already/);
    expect(errors["headers.2.name"]).toMatch(/spaces/);
    expect(errors["headers.3.value"]).toMatch(/value/);
    expect(errors["headers.0.name"]).toBeUndefined();
  });
  it("a kept (saved secret) row needs no value", () => {
    const form = {
      ...valid(),
      headers: [newHeaderRow({ name: "Authorization", kept: true, saved: true })],
    };
    expect(validateForm(form)).toEqual({});
  });
  it("validates the body as JSON, but only for methods that send one", () => {
    expect(validateForm({ ...valid(), method: "POST", body: "{oops" }).body).toMatch(/JSON/);
    expect(validateForm({ ...valid(), method: "POST", body: '{"a":1}' }).body).toBeUndefined();
    expect(validateForm({ ...valid(), method: "GET", body: "{oops" }).body).toBeUndefined();
  });
});

describe("toPayload", () => {
  it("never sends a saved secret: a kept row is { name, keepExisting }", () => {
    const form = formFromMonitor(detail);
    const payload = toPayload(form);
    expect(payload.headers).toEqual([
      { name: "Authorization", keepExisting: true },
      { name: "Accept", value: "application/json" },
    ]);
    expect(JSON.stringify(payload)).not.toMatch(/Bearer/);
  });
  it("a replaced secret is sent as a new value", () => {
    const form = formFromMonitor(detail);
    form.headers[0] = { ...form.headers[0]!, kept: false, value: "Bearer new" };
    expect(toPayload(form).headers[0]).toEqual({ name: "Authorization", value: "Bearer new" });
  });
  it("converts units and drops the body for GET and HEAD", () => {
    const form = { ...formFromMonitor(detail), method: "GET" as const };
    const payload = toPayload(form);
    expect(payload).toMatchObject({
      timeoutMs: 5000,
      expectedStatus: 201,
      intervalSec: 600,
      body: null,
    });
    expect(toPayload({ ...form, method: "PUT" }).body).toBe('{"ping":true}');
  });
});

describe("pruneBlankRows, mapServerFieldErrors, formatJson", () => {
  it("removes untouched rows only", () => {
    const form = {
      ...valid(),
      headers: [newHeaderRow(), newHeaderRow({ name: "X-A", value: "1" })],
    };
    expect(pruneBlankRows(form).headers).toHaveLength(1);
  });
  it("maps server paths to form keys", () => {
    expect(
      mapServerFieldErrors({
        timeoutMs: "t",
        "headers.2": "no value",
        "headers.1.name": "n",
        url: "u",
      }),
    ).toEqual({ timeoutSec: "t", "headers.2.value": "no value", "headers.1.name": "n", url: "u" });
  });
  it("pretty-prints valid JSON and returns null otherwise", () => {
    expect(formatJson('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(formatJson("nope")).toBeNull();
  });
});
