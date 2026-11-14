import { describe, expect, it } from "vitest";
import { TICK_MS, summarizeTicks, tickStartMs } from "./ticks";

describe("tickStartMs", () => {
  const now = Date.UTC(2026, 10, 10, 12, 30, 0);
  it("the last tick is the current hour, the first is 23 hours earlier", () => {
    expect(tickStartMs(23, 24, now)).toBe(Date.UTC(2026, 10, 10, 12, 0, 0));
    expect(tickStartMs(0, 24, now)).toBe(Date.UTC(2026, 10, 10, 12, 0, 0) - 23 * TICK_MS);
  });
});

describe("summarizeTicks", () => {
  it("names only the kinds that occur", () => {
    expect(summarizeTicks(Array(24).fill("up"))).toBe("Last 24 hours: 24 operational.");
  });
  it("counts every kind for screen readers", () => {
    const ticks = [...Array(20).fill("up"), "slow", "down", "down", "none"];
    expect(summarizeTicks(ticks)).toBe(
      "Last 24 hours: 20 operational, 1 slow, 2 with failed checks, 1 without data.",
    );
  });
});
