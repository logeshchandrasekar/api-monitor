import { describe, expect, it } from "vitest";
import { round2, uptimeOf } from "../utils/uptime.js";

describe("uptimeOf (DAT-3)", () => {
  it("no checks is null, never 0 %", () => {
    expect(uptimeOf(0, 0)).toBeNull();
  });
  it("all up is 100, all failed is 0", () => {
    expect(uptimeOf(10, 10)).toBe(100);
    expect(uptimeOf(0, 10)).toBe(0);
  });
  it("rounds to two decimals", () => {
    expect(uptimeOf(2, 3)).toBe(66.67);
    expect(uptimeOf(7, 8)).toBe(87.5);
    expect(uptimeOf(99_999, 100_000)).toBe(100); // 99.999 rounds to 100.00
  });
  it("round2", () => {
    expect(round2(1.005)).toBe(1); // floating point, documented rather than hidden
    expect(round2(12.345678)).toBe(12.35);
  });
});
