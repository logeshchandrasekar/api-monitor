import { describe, expect, it } from "vitest";
import {
  createMonitorSchema,
  listMonitorsQuerySchema,
  updateMonitorSchema,
} from "../schemas/monitor.js";

const valid = { name: "API", url: "https://api.example.com", intervalSec: 300 };

describe("monitor schemas", () => {
  it("accepts a minimal create payload and invents no defaults", () => {
    expect(createMonitorSchema.parse(valid)).toEqual(valid);
  });
  it("PATCH payloads never receive defaults for fields the client did not send", () => {
    expect(updateMonitorSchema.parse({ name: "New" })).toEqual({ name: "New" });
    expect(updateMonitorSchema.parse({})).toEqual({});
  });
  it("strips unknown fields (no mass assignment)", () => {
    const parsed = createMonitorSchema.parse({
      ...valid,
      userId: "x",
      status: "DOWN",
      isPaused: true,
    });
    expect(parsed).toEqual(valid);
  });
  it("rejects forbidden, invalid and duplicate headers", () => {
    const bad = [
      [{ name: "Host", value: "evil" }],
      [{ name: "Content-Length", value: "1" }],
      [{ name: "User-Agent", value: "x" }],
      [{ name: "Proxy-Anything", value: "x" }],
      [{ name: "Bad Name", value: "x" }],
      [{ name: "X-A", value: "line\r\nbreak" }],
      [
        { name: "X-A", value: "1" },
        { name: "x-a", value: "2" },
      ],
    ];
    for (const headers of bad)
      expect(createMonitorSchema.safeParse({ ...valid, headers }).success).toBe(false);
  });
  it("rejects too many headers and tags, and an oversized body", () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ name: `X-H${i}`, value: "1" }));
    expect(createMonitorSchema.safeParse({ ...valid, headers: many }).success).toBe(false);
    expect(
      createMonitorSchema.safeParse({
        ...valid,
        tags: Array.from({ length: 11 }, (_, i) => `t${i}`),
      }).success,
    ).toBe(false);
    expect(
      createMonitorSchema.safeParse({ ...valid, method: "POST", body: "x".repeat(64 * 1024 + 1) })
        .success,
    ).toBe(false);
  });
  it("normalises tags", () => {
    expect(createMonitorSchema.parse({ ...valid, tags: ["  Production "] }).tags).toEqual([
      "production",
    ]);
  });
  it("rejects out-of-range numbers", () => {
    expect(createMonitorSchema.safeParse({ ...valid, expectedStatus: 99 }).success).toBe(false);
    expect(createMonitorSchema.safeParse({ ...valid, timeoutMs: 500 }).success).toBe(false);
    expect(createMonitorSchema.safeParse({ ...valid, intervalSec: -5 }).success).toBe(false);
  });
  it("list query coerces and defaults", () => {
    expect(listMonitorsQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(listMonitorsQuerySchema.parse({ limit: "50", status: "PAUSED" })).toEqual({
      limit: 50,
      status: "PAUSED",
    });
    expect(listMonitorsQuerySchema.safeParse({ limit: "500" }).success).toBe(false);
    expect(listMonitorsQuerySchema.safeParse({ cursor: "nope" }).success).toBe(false);
  });
});
