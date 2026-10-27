import { describe, expect, it } from "vitest";
import { allowedIntervals, formatInterval } from "../config/plans.js";

describe("allowedIntervals", () => {
  it("FREE starts at 5 minutes in production", () => {
    expect(allowedIntervals("FREE", "production")).toEqual([
      300, 600, 900, 1800, 3600, 21600, 43200, 86400,
    ]);
  });
  it("PRO offers 1 minute in production", () => {
    expect(allowedIntervals("PRO", "production")[0]).toBe(60);
  });
  it("adds 10s and 30s outside production only", () => {
    expect(allowedIntervals("FREE", "development").slice(0, 2)).toEqual([10, 30]);
    expect(allowedIntervals("FREE", "production")).not.toContain(10);
  });
  it("formats intervals", () => {
    expect(["10s", "1 min", "5 min", "1 h", "24 h"]).toEqual(
      [10, 60, 300, 3600, 86400].map(formatInterval),
    );
  });
});
